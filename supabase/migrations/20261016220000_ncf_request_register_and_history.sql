begin;

-- Una fila por solicitud/rango. No se infiere cuántos se solicitaron históricamente.
alter table myappdb.ncf_secuencias
  add column if not exists autorizacion text,
  add column if not exists solicitados integer,
  add column if not exists aceptados integer;
update myappdb.ncf_secuencias set aceptados = total where aceptados is null;

create table if not exists myappdb.ncf_secuencias_historial (
  id bigint generated always as identity primary key,
  secuencia_id integer not null references myappdb.ncf_secuencias(id) on delete restrict,
  empresa_id integer not null,
  accion text not null,
  registrado_en timestamptz not null default now(),
  usuario_id uuid,
  datos jsonb not null
);
create index if not exists ncf_secuencias_historial_secuencia_idx on myappdb.ncf_secuencias_historial(secuencia_id, id desc);
alter table myappdb.ncf_secuencias_historial enable row level security;
revoke all on myappdb.ncf_secuencias_historial from public, anon, authenticated;
grant select on myappdb.ncf_secuencias_historial to authenticated;
grant all on myappdb.ncf_secuencias_historial to service_role;
grant usage, select on sequence myappdb.ncf_secuencias_historial_id_seq to service_role;
drop policy if exists ncf_historial_tenant_select on myappdb.ncf_secuencias_historial;
create policy ncf_historial_tenant_select on myappdb.ncf_secuencias_historial for select to authenticated
  using (empresa_id = (select private.current_empresa_id()));

insert into myappdb.ncf_secuencias_historial(secuencia_id, empresa_id, accion, registrado_en, datos)
select s.id, s.empresa_id, 'Registro inicial importado', now(), to_jsonb(s)
from myappdb.ncf_secuencias s
where not exists (
  select 1 from myappdb.ncf_secuencias_historial h
  where h.secuencia_id = s.id and h.accion = 'Registro inicial importado'
);

create or replace function private.ncf_numero_rango(p_rango text, p_serie text)
returns bigint language sql immutable set search_path = ''
as $$
  select case when n ~ '^[0-9]{1,10}$' then n::bigint else null end
  from (select case when left(upper(trim(p_rango)), length(p_serie)) = upper(p_serie)
    then substring(trim(p_rango) from length(p_serie) + 1) else trim(p_rango) end as n) r;
$$;
revoke all on function private.ncf_numero_rango(text, text) from public;

create or replace function private.validar_solicitud_ncf()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_desde bigint; v_hasta bigint;
begin
  if tg_op = 'DELETE' then
    raise exception 'Las solicitudes de secuencias se conservan en el registro y no se eliminan.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.empresa_id <> old.empresa_id or new.serie <> old.serie or new.tipo_ncf <> old.tipo_ncf then
      raise exception 'Para otra empresa o tipo registra una nueva solicitud.' using errcode = '23514';
    end if;
    if old.usados > 0 and (new.rango_inicial <> old.rango_inicial or new.rango_final <> old.rango_final or new.total <> old.total) then
      raise exception 'Un rango utilizado no se puede reemplazar. Registra una nueva solicitud.' using errcode = '23514';
    end if;
    if auth.role() = 'authenticated' and new.usados <> old.usados then
      raise exception 'El contador se actualiza al emitir comprobantes. Actualiza el grid antes de guardar.' using errcode = '40001';
    end if;
  end if;

  if auth.role() = 'authenticated' and new.solicitados is null then
    raise exception 'Registra la cantidad solicitada y la autorización antes de guardar.' using errcode = '23514';
  end if;
  -- Los registros antiguos siguen funcionando sin inventar su referencia o cantidad solicitada.
  if new.solicitados is not null then
    if new.solicitados <= 0 or new.aceptados is null or new.aceptados <= 0 or new.aceptados > new.solicitados
       or new.total <> new.aceptados or nullif(trim(new.autorizacion), '') is null then
      raise exception 'Revisa autorización y cantidades: aceptados debe estar entre 1 y solicitados y coincidir con el total.' using errcode = '23514';
    end if;
    v_desde := private.ncf_numero_rango(new.rango_inicial, new.serie);
    v_hasta := private.ncf_numero_rango(new.rango_final, new.serie);
    if v_desde is null or v_hasta is null or v_desde <= 0 or v_hasta < v_desde or v_hasta - v_desde + 1 <> new.aceptados
       or new.usados < 0 or new.usados > new.aceptados then
      raise exception 'El rango debe coincidir con la cantidad aceptada y contener el contador utilizado.' using errcode = '23514';
    end if;
    if new.fecha_autorizacion !~ '^\d{4}-\d{2}-\d{2}$' or new.fecha_vencimiento !~ '^\d{4}-\d{2}-\d{2}$'
       or new.fecha_vencimiento::date < new.fecha_autorizacion::date then
      raise exception 'Revisa las fechas de autorización y vencimiento.' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' or new.rango_inicial is distinct from old.rango_inicial or new.rango_final is distinct from old.rango_final then
    -- Serializa solicitudes simultáneas de la misma empresa/serie antes de comprobar cruces.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.empresa_id::text || ':' || upper(new.serie), 0));
    v_desde := private.ncf_numero_rango(new.rango_inicial, new.serie);
    v_hasta := private.ncf_numero_rango(new.rango_final, new.serie);
    if exists (select 1 from myappdb.ncf_secuencias s where s.empresa_id = new.empresa_id
      and upper(s.serie) = upper(new.serie) and s.id <> new.id
      and private.ncf_numero_rango(s.rango_inicial, s.serie) <= v_hasta
      and private.ncf_numero_rango(s.rango_final, s.serie) >= v_desde) then
      raise exception 'El rango se cruza con una solicitud ya registrada para esta empresa y serie.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validar_solicitud_ncf() from public, anon, authenticated;
drop trigger if exists ncf_validar_solicitud on myappdb.ncf_secuencias;
create trigger ncf_validar_solicitud before insert or update or delete on myappdb.ncf_secuencias
  for each row execute function private.validar_solicitud_ncf();

create or replace function private.registrar_historial_ncf()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'actualizado_en') = (to_jsonb(old) - 'actualizado_en') then return new; end if;
  insert into myappdb.ncf_secuencias_historial(secuencia_id, empresa_id, accion, usuario_id, datos)
  values (new.id, new.empresa_id,
    case when tg_op = 'INSERT' then 'Solicitud registrada'
      when new.usados is distinct from old.usados then 'Número utilizado' else 'Autorización actualizada' end,
    auth.uid(), to_jsonb(new));
  return new;
end;
$$;
revoke all on function private.registrar_historial_ncf() from public, anon, authenticated;
drop trigger if exists ncf_registrar_historial on myappdb.ncf_secuencias;
create trigger ncf_registrar_historial after insert or update on myappdb.ncf_secuencias
  for each row execute function private.registrar_historial_ncf();

comment on column myappdb.ncf_secuencias.autorizacion is 'Referencia de autorización de la solicitud; no es la fecha.';
comment on column myappdb.ncf_secuencias.solicitados is 'Cantidad solicitada. NULL significa que no se dispone del dato histórico.';
comment on column myappdb.ncf_secuencias.aceptados is 'Cantidad aprobada para este rango, equivalente a total.';
notify pgrst, 'reload schema';
commit;
