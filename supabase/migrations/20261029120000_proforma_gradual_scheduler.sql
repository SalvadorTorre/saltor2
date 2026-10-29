begin;

-- Cada empresa puede decidir cuándo y con qué ritmo se firman sus proformas E332.
create table if not exists myappdb.proforma_envio_programaciones (
  empresa_id integer primary key references myappdb.empresas(id) on delete cascade,
  activo boolean not null default false,
  hora_desde time not null default time '18:00',
  hora_hasta time not null default time '23:00',
  intervalo_minutos smallint not null default 2 check (intervalo_minutos between 1 and 120),
  lote_por_ciclo smallint not null default 1 check (lote_por_ciclo between 1 and 10),
  maximo_diario integer not null default 100 check (maximo_diario between 1 and 5000),
  contador_fecha date,
  enviadas_hoy integer not null default 0 check (enviadas_hoy >= 0),
  ultimo_proceso_en timestamptz,
  ultimo_resumen jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default clock_timestamp()
);

create index if not exists proforma_envio_programaciones_activas_idx
  on myappdb.proforma_envio_programaciones (activo) where activo;

alter table myappdb.proforma_envio_programaciones enable row level security;
revoke all on myappdb.proforma_envio_programaciones from public, anon, authenticated;
grant all on myappdb.proforma_envio_programaciones to service_role;

-- El panel Plataforma usa estas funciones; la tabla no queda expuesta a usuarios normales.
create or replace function myappdb.plataforma_obtener_programacion_proformas(p_empresa_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not private.es_dueno_sistema() then
    raise exception 'Solo el dueño del sistema puede consultar esta programación.';
  end if;

  if not exists (select 1 from myappdb.empresas e where e.id = p_empresa_id) then
    raise exception 'La empresa indicada no existe.';
  end if;

  select to_jsonb(p) into v_result
  from myappdb.proforma_envio_programaciones p
  where p.empresa_id = p_empresa_id;

  return coalesce(v_result, jsonb_build_object(
    'empresa_id', p_empresa_id,
    'activo', false,
    'hora_desde', '18:00:00',
    'hora_hasta', '23:00:00',
    'intervalo_minutos', 2,
    'lote_por_ciclo', 1,
    'maximo_diario', 100,
    'contador_fecha', null,
    'enviadas_hoy', 0,
    'ultimo_proceso_en', null,
    'ultimo_resumen', '{}'::jsonb,
    'actualizado_en', null
  ));
end;
$function$;

create or replace function myappdb.plataforma_guardar_programacion_proformas(
  p_empresa_id integer,
  p_activo boolean,
  p_hora_desde time,
  p_hora_hasta time,
  p_intervalo_minutos smallint,
  p_lote_por_ciclo smallint,
  p_maximo_diario integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result myappdb.proforma_envio_programaciones;
begin
  if not private.es_dueno_sistema() then
    raise exception 'Solo el dueño del sistema puede cambiar esta programación.';
  end if;
  if not exists (select 1 from myappdb.empresas e where e.id = p_empresa_id) then
    raise exception 'La empresa indicada no existe.';
  end if;
  if p_hora_desde is null or p_hora_hasta is null then
    raise exception 'Indica la hora desde y hasta.';
  end if;
  if p_intervalo_minutos not between 1 and 120 then
    raise exception 'La pausa debe estar entre 1 y 120 minutos.';
  end if;
  if p_lote_por_ciclo not between 1 and 10 then
    raise exception 'El lote debe estar entre 1 y 10 facturas.';
  end if;
  if p_maximo_diario not between 1 and 5000 then
    raise exception 'El máximo diario debe estar entre 1 y 5000 facturas.';
  end if;

  insert into myappdb.proforma_envio_programaciones (
    empresa_id, activo, hora_desde, hora_hasta, intervalo_minutos, lote_por_ciclo, maximo_diario, actualizado_en
  ) values (
    p_empresa_id, coalesce(p_activo, false), p_hora_desde, p_hora_hasta, p_intervalo_minutos, p_lote_por_ciclo, p_maximo_diario, clock_timestamp()
  )
  on conflict (empresa_id) do update set
    activo = excluded.activo,
    hora_desde = excluded.hora_desde,
    hora_hasta = excluded.hora_hasta,
    intervalo_minutos = excluded.intervalo_minutos,
    lote_por_ciclo = excluded.lote_por_ciclo,
    maximo_diario = excluded.maximo_diario,
    actualizado_en = clock_timestamp()
  returning * into v_result;

  return to_jsonb(v_result);
end;
$function$;

revoke all on function myappdb.plataforma_obtener_programacion_proformas(integer) from public, anon;
revoke all on function myappdb.plataforma_guardar_programacion_proformas(integer, boolean, time, time, smallint, smallint, integer) from public, anon;
grant execute on function myappdb.plataforma_obtener_programacion_proformas(integer) to authenticated;
grant execute on function myappdb.plataforma_guardar_programacion_proformas(integer, boolean, time, time, smallint, smallint, integer) to authenticated;

-- El cron comparte los secretos ya usados por la reconciliación e-CF.
create or replace function myappdb.configurar_procesador_proformas_programado()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_url text;
  v_publishable_key text;
  v_secret text;
  v_job_id bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return 'Vault no está disponible; no se programó el procesador de proformas.';
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'ecf_reconciliador_url';
  select decrypted_secret into v_publishable_key from vault.decrypted_secrets where name = 'ecf_reconciliador_publishable_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ecf_reconciliador_secret';

  for v_job_id in select jobid from cron.job where jobname = 'procesar-proformas-programadas' loop
    perform cron.unschedule(v_job_id);
  end loop;

  if coalesce(v_url, '') = '' or coalesce(v_publishable_key, '') = '' or coalesce(v_secret, '') = '' then
    return 'Faltan secretos de Vault; la función quedó lista, pero no se programó.';
  end if;

  perform cron.schedule(
    'procesar-proformas-programadas',
    '* * * * *',
    $job$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'ecf_reconciliador_url'), '/') ||
          '/functions/v1/procesar-proformas-programadas',
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

  return 'Procesador gradual de proformas programado cada minuto.';
end;
$function$;

revoke all on function myappdb.configurar_procesador_proformas_programado() from public, anon, authenticated;
grant execute on function myappdb.configurar_procesador_proformas_programado() to service_role;

select myappdb.configurar_procesador_proformas_programado();
notify pgrst, 'reload schema';

commit;
