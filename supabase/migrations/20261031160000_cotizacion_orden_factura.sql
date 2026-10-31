begin;

-- ===========================================================================
-- Cotización → Orden de venta → Factura
--  * La orden guarda la factura que se creó desde ella; la cotización también.
--  * Una cotización convertida en orden de venta solo se puede consultar.
--  * Una orden ya facturada solo se puede consultar (no se edita, borra ni
--    vuelve a facturar).
--  * Si la factura se anula, la orden y la cotización quedan libres otra vez.
-- ===========================================================================

alter table myappdb.ordenventa
  add column if not exists numero_factura text,
  add column if not exists factura_id bigint references myappdb.facturas(id) on delete set null;
alter table myappdb.cotizaciones
  add column if not exists numero_factura text;

create index if not exists ordenventa_factura_id_idx on myappdb.ordenventa (factura_id);

-- Vincula la factura recién creada con la orden de la que salió.
create or replace function myappdb.vincular_factura_orden(p_factura_id bigint, p_orden_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_empresa integer := private.current_empresa_id();
  v_numero_factura text;
  v_orden record;
begin
  if v_empresa is null then raise exception 'No hay empresa activa.' using errcode = '42501'; end if;

  select numero_factura into v_numero_factura from myappdb.facturas where id = p_factura_id and idempres = v_empresa;
  if v_numero_factura is null then raise exception 'Factura no encontrada.' using errcode = '42501'; end if;

  select id, numero_orden, numero_cotizacion, numero_factura into v_orden
    from myappdb.ordenventa where id = p_orden_id and idempres = v_empresa for update;
  if not found then raise exception 'Orden de venta no encontrada.' using errcode = '42501'; end if;
  if v_orden.numero_factura is not null then
    raise exception 'La orden % ya fue facturada en la factura %.', v_orden.numero_orden, v_orden.numero_factura using errcode = '23505';
  end if;

  update myappdb.ordenventa
     set numero_factura = v_numero_factura, factura_id = p_factura_id, estado = 'Cerrada', actualizado_en = now()
   where id = p_orden_id;

  if v_orden.numero_cotizacion is not null then
    update myappdb.cotizaciones
       set numero_factura = v_numero_factura, estado = 'Facturada', actualizado_en = now()
     where idempres = v_empresa and numero_cotizacion = v_orden.numero_cotizacion;
  end if;
end;
$$;
revoke all on function myappdb.vincular_factura_orden(bigint, bigint) from public, anon;
grant execute on function myappdb.vincular_factura_orden(bigint, bigint) to authenticated;

-- Cotización convertida: solo consulta (el sistema puede cambiar estado y factura).
create or replace function private.tg_cotizacion_convertida()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.numero_orden_venta is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'La cotización % ya fue convertida en la orden % y no se puede borrar.', old.numero_cotizacion, old.numero_orden_venta using errcode = '55000';
  end if;
  if (to_jsonb(new) - array['estado', 'numero_factura', 'actualizado_en'])
     is distinct from (to_jsonb(old) - array['estado', 'numero_factura', 'actualizado_en']) then
    raise exception 'La cotización % ya fue convertida en la orden % y solo se puede consultar.', old.numero_cotizacion, old.numero_orden_venta using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.tg_cotizacion_convertida() from public, anon, authenticated;

drop trigger if exists cotizaciones_convertida on myappdb.cotizaciones;
create trigger cotizaciones_convertida
  before update or delete on myappdb.cotizaciones
  for each row execute function private.tg_cotizacion_convertida();

create or replace function private.tg_cotizacion_detalle_convertida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_cotizacion bigint := case when tg_op = 'DELETE' then old.cotizacion_id else new.cotizacion_id end;
        v_numero text; v_orden text;
begin
  select numero_cotizacion, numero_orden_venta into v_numero, v_orden from myappdb.cotizaciones where id = v_cotizacion;
  if v_orden is not null then
    raise exception 'La cotización % ya fue convertida en la orden % y solo se puede consultar.', v_numero, v_orden using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.tg_cotizacion_detalle_convertida() from public, anon, authenticated;

drop trigger if exists cotizacion_detalles_convertida on myappdb.cotizacion_detalles;
create trigger cotizacion_detalles_convertida
  before insert or update or delete on myappdb.cotizacion_detalles
  for each row execute function private.tg_cotizacion_detalle_convertida();

-- Orden facturada: solo consulta (el sistema puede cambiar estado y factura).
create or replace function private.tg_orden_facturada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.numero_factura is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'La orden % ya fue facturada en la factura % y no se puede borrar.', old.numero_orden, old.numero_factura using errcode = '55000';
  end if;
  if (to_jsonb(new) - array['estado', 'numero_factura', 'factura_id', 'actualizado_en', 'impreso_en'])
     is distinct from (to_jsonb(old) - array['estado', 'numero_factura', 'factura_id', 'actualizado_en', 'impreso_en']) then
    raise exception 'La orden % ya fue facturada en la factura % y solo se puede consultar.', old.numero_orden, old.numero_factura using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.tg_orden_facturada() from public, anon, authenticated;

drop trigger if exists ordenventa_facturada on myappdb.ordenventa;
create trigger ordenventa_facturada
  before update or delete on myappdb.ordenventa
  for each row execute function private.tg_orden_facturada();

create or replace function private.tg_orden_detalle_facturada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_orden bigint := case when tg_op = 'DELETE' then old.ordenventa_id else new.ordenventa_id end;
        v_numero text; v_factura text;
begin
  select numero_orden, numero_factura into v_numero, v_factura from myappdb.ordenventa where id = v_orden;
  if v_factura is not null then
    raise exception 'La orden % ya fue facturada en la factura % y solo se puede consultar.', v_numero, v_factura using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.tg_orden_detalle_facturada() from public, anon, authenticated;

drop trigger if exists ordenventa_detalle_facturada on myappdb.ordenventa_detalle;
create trigger ordenventa_detalle_facturada
  before insert or update or delete on myappdb.ordenventa_detalle
  for each row execute function private.tg_orden_detalle_facturada();

-- Si la factura se anula, la orden vuelve a quedar abierta y la cotización en "Orden de venta".
create or replace function private.tg_factura_anulada_libera_orden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_orden record;
begin
  if new.estado = 'Anulada' and coalesce(old.estado, '') <> 'Anulada' then
    for v_orden in select id, numero_cotizacion, idempres from myappdb.ordenventa where factura_id = new.id loop
      update myappdb.ordenventa set numero_factura = null, factura_id = null, estado = 'Abierta', actualizado_en = now() where id = v_orden.id;
      if v_orden.numero_cotizacion is not null then
        update myappdb.cotizaciones set numero_factura = null, estado = 'Orden de venta', actualizado_en = now()
         where idempres = v_orden.idempres and numero_cotizacion = v_orden.numero_cotizacion;
      end if;
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.tg_factura_anulada_libera_orden() from public, anon, authenticated;

drop trigger if exists facturas_anulada_libera_orden on myappdb.facturas;
create trigger facturas_anulada_libera_orden
  after update of estado on myappdb.facturas
  for each row execute function private.tg_factura_anulada_libera_orden();

commit;
