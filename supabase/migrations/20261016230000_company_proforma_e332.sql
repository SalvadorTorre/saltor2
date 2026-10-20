begin;

-- E332 es una numeración interna. Nunca se registra como rango autorizado DGII.
create table if not exists myappdb.empresas_proforma (
  empresa_id integer primary key references myappdb.empresas(id) on delete restrict,
  activa boolean not null default false,
  ultimo_numero bigint not null default 0 check (ultimo_numero between 0 and 99999999999),
  actualizado_en timestamptz not null default clock_timestamp()
);
create table if not exists myappdb.empresas_proforma_historial (
  id bigint generated always as identity primary key,
  empresa_id integer not null references myappdb.empresas(id) on delete restrict,
  accion text not null,
  numero_anterior bigint not null,
  numero_actual bigint not null,
  activa boolean not null,
  usuario_id uuid,
  registrado_en timestamptz not null default clock_timestamp()
);
create index if not exists empresas_proforma_historial_empresa_idx on myappdb.empresas_proforma_historial(empresa_id, id desc);
alter table myappdb.empresas_proforma enable row level security;
alter table myappdb.empresas_proforma_historial enable row level security;
revoke all on myappdb.empresas_proforma, myappdb.empresas_proforma_historial from public, anon, authenticated;
grant select on myappdb.empresas_proforma, myappdb.empresas_proforma_historial to authenticated;
grant all on myappdb.empresas_proforma, myappdb.empresas_proforma_historial to service_role;
grant usage, select on sequence myappdb.empresas_proforma_historial_id_seq to service_role;
drop policy if exists empresas_proforma_read on myappdb.empresas_proforma;
create policy empresas_proforma_read on myappdb.empresas_proforma for select to authenticated
  using (empresa_id = (select private.current_empresa_id()) or (select private.es_dueno_sistema()));
drop policy if exists empresas_proforma_historial_read on myappdb.empresas_proforma_historial;
create policy empresas_proforma_historial_read on myappdb.empresas_proforma_historial for select to authenticated
  using (empresa_id = (select private.current_empresa_id()) or (select private.es_dueno_sistema()));

-- Conserva el contador de la antigua secuencia alterna, sin habilitar empresas automáticamente.
insert into myappdb.empresas_proforma(empresa_id, ultimo_numero)
select distinct on (s.empresa_id) s.empresa_id,
  least(99999999999, greatest(0, coalesce(private.ncf_numero_rango(s.rango_inicial, s.serie), 1) + s.usados - 1))
from myappdb.ncf_secuencias s
where upper(s.serie) = 'E332' or s.tipo_ncf = '332'
order by s.empresa_id, s.id desc
on conflict (empresa_id) do nothing;
insert into myappdb.empresas_proforma_historial(empresa_id, accion, numero_anterior, numero_actual, activa)
select p.empresa_id, 'Contador anterior importado', p.ultimo_numero, p.ultimo_numero, p.activa
from myappdb.empresas_proforma p
where not exists (
  select 1 from myappdb.empresas_proforma_historial h
  where h.empresa_id = p.empresa_id and h.accion = 'Contador anterior importado'
);

create or replace function myappdb.plataforma_configurar_proforma(p_empresa_id integer, p_activa boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_old myappdb.empresas_proforma; v_new myappdb.empresas_proforma;
begin
  if not private.es_dueno_sistema() then raise exception 'Solo el dueño de la plataforma puede activar proforma.' using errcode = '42501'; end if;
  if p_activa is null then raise exception 'Indica si la factura proforma está activa.'; end if;
  -- El registro de empresa serializa incluso la primera habilitación concurrente.
  perform 1 from myappdb.empresas where id = p_empresa_id for update;
  if not found then raise exception 'La empresa no existe.'; end if;
  select * into v_old from myappdb.empresas_proforma where empresa_id = p_empresa_id for update;
  insert into myappdb.empresas_proforma(empresa_id, activa) values(p_empresa_id, p_activa)
  on conflict (empresa_id) do update set activa = excluded.activa, actualizado_en = clock_timestamp()
  returning * into v_new;
  if v_old.empresa_id is null or v_old.activa is distinct from p_activa then
    insert into myappdb.empresas_proforma_historial(empresa_id, accion, numero_anterior, numero_actual, activa, usuario_id)
    values(p_empresa_id, case when p_activa then 'Proforma activada' else 'Proforma desactivada' end,
      coalesce(v_old.ultimo_numero, 0), v_new.ultimo_numero, p_activa, auth.uid());
  end if;
  return to_jsonb(v_new);
end;
$$;
revoke all on function myappdb.plataforma_configurar_proforma(integer, boolean) from public, anon;
grant execute on function myappdb.plataforma_configurar_proforma(integer, boolean) to authenticated;

create or replace function myappdb.ajustar_contador_proforma(p_ultimo_numero bigint, p_numero_esperado bigint, p_actualizado_en timestamptz, p_empresa_id integer default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_empresa integer := coalesce(p_empresa_id, private.current_empresa_id()); v_old myappdb.empresas_proforma; v_new myappdb.empresas_proforma;
begin
  if p_empresa_id is not null and not private.es_dueno_sistema() then
    raise exception 'Solo el dueño de la plataforma puede ajustar proforma desde otra empresa.' using errcode = '42501';
  end if;
  if v_empresa is null then raise exception 'No hay una empresa activa en la sesión.' using errcode = '42501'; end if;
  if p_ultimo_numero is null or p_ultimo_numero < 0 or p_ultimo_numero > 99999999999 then
    raise exception 'El número actual debe estar entre 0 y 99999999999.' using errcode = '23514';
  end if;
  select * into v_old from myappdb.empresas_proforma where empresa_id = v_empresa for update;
  if not found or not v_old.activa then raise exception 'La factura proforma no está activa para esta empresa.' using errcode = '42501'; end if;
  if v_old.ultimo_numero is distinct from p_numero_esperado or v_old.actualizado_en is distinct from p_actualizado_en then
    raise exception 'El contador cambió. Actualiza las secuencias antes de volver a guardarlo.' using errcode = '40001';
  end if;
  update myappdb.empresas_proforma set ultimo_numero = p_ultimo_numero, actualizado_en = clock_timestamp()
    where empresa_id = v_empresa returning * into v_new;
  if v_old.ultimo_numero <> p_ultimo_numero then
    insert into myappdb.empresas_proforma_historial(empresa_id, accion, numero_anterior, numero_actual, activa, usuario_id)
    values(v_empresa, 'Contador ajustado', v_old.ultimo_numero, p_ultimo_numero, true, auth.uid());
  end if;
  return to_jsonb(v_new);
end;
$$;
revoke all on function myappdb.ajustar_contador_proforma(bigint, bigint, timestamptz, integer) from public, anon;
grant execute on function myappdb.ajustar_contador_proforma(bigint, bigint, timestamptz, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
