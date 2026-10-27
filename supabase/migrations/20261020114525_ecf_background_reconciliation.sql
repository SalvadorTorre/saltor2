begin;

-- La reconciliacion se ejecuta dentro de Supabase. La llamada HTTP solo usa
-- secretos de Vault, nunca valores almacenados en el frontend o en Git.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists myappdb.ecf_reconciliacion_control (
  id smallint primary key default 1 check (id = 1),
  bloqueado_hasta timestamptz,
  iniciado_en timestamptz,
  terminado_en timestamptz,
  ultimo_resumen jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default clock_timestamp()
);

insert into myappdb.ecf_reconciliacion_control (id)
values (1)
on conflict (id) do nothing;

alter table myappdb.ecf_reconciliacion_control enable row level security;
revoke all on myappdb.ecf_reconciliacion_control from public, anon, authenticated;
grant all on myappdb.ecf_reconciliacion_control to service_role;

create or replace function myappdb.iniciar_reconciliacion_ecf(
  p_duracion interval default interval '4 minutes'
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_bloqueado boolean;
begin
  update myappdb.ecf_reconciliacion_control
  set bloqueado_hasta = clock_timestamp() + greatest(p_duracion, interval '30 seconds'),
      iniciado_en = clock_timestamp(),
      actualizado_en = clock_timestamp()
  where id = 1
    and (bloqueado_hasta is null or bloqueado_hasta <= clock_timestamp())
  returning true into v_bloqueado;

  return coalesce(v_bloqueado, false);
end;
$function$;

create or replace function myappdb.terminar_reconciliacion_ecf(
  p_resumen jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  update myappdb.ecf_reconciliacion_control
  set bloqueado_hasta = null,
      terminado_en = clock_timestamp(),
      ultimo_resumen = coalesce(p_resumen, '{}'::jsonb),
      actualizado_en = clock_timestamp()
  where id = 1;
end;
$function$;

revoke all on function myappdb.iniciar_reconciliacion_ecf(interval) from public, anon, authenticated;
revoke all on function myappdb.terminar_reconciliacion_ecf(jsonb) from public, anon, authenticated;
grant execute on function myappdb.iniciar_reconciliacion_ecf(interval) to service_role;
grant execute on function myappdb.terminar_reconciliacion_ecf(jsonb) to service_role;

-- Puede ejecutarse de nuevo despues de rotar cualquier secreto de Vault.
create or replace function myappdb.configurar_reconciliacion_ecf_programada()
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_url text;
  v_publishable_key text;
  v_secret text;
  v_job_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return 'Vault no esta disponible; no se programo la reconciliacion e-CF.';
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'ecf_reconciliador_url';
  select decrypted_secret into v_publishable_key
  from vault.decrypted_secrets
  where name = 'ecf_reconciliador_publishable_key';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'ecf_reconciliador_secret';

  for v_job_id in
    select jobid from cron.job where jobname = 'reconciliar-ecf-pendientes'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  if coalesce(btrim(v_url), '') = ''
    or coalesce(btrim(v_publishable_key), '') = ''
    or coalesce(btrim(v_secret), '') = '' then
    return 'Faltan secretos de Vault; la funcion esta lista pero el cron aun no se programo.';
  end if;

  perform cron.schedule(
    'reconciliar-ecf-pendientes',
    '* * * * *',
    $job$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'ecf_reconciliador_url'), '/') ||
          '/functions/v1/reconciliar-ecf-pendientes',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ecf_reconciliador_publishable_key'),
          'x-ecf-reconciler-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ecf_reconciliador_secret')
        ),
        body := jsonb_build_object('source', 'cron', 'scheduled_at', clock_timestamp()),
        timeout_milliseconds := 55000
      );
    $job$
  );

  return 'Reconciliacion e-CF programada cada minuto.';
end;
$function$;

revoke all on function myappdb.configurar_reconciliacion_ecf_programada() from public, anon, authenticated;
grant execute on function myappdb.configurar_reconciliacion_ecf_programada() to service_role;

-- En una instalacion nueva aun no hay secretos. La funcion queda disponible
-- para activarla inmediatamente despues de cargarlos en Vault.
select myappdb.configurar_reconciliacion_ecf_programada();

commit;
