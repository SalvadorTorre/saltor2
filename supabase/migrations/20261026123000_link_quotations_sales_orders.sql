alter table myappdb.ordenventa add column if not exists numero_cotizacion text;
alter table myappdb.cotizaciones add column if not exists numero_orden_venta text;
alter table myappdb.cotizaciones drop constraint if exists cotizaciones_estado_check;
alter table myappdb.cotizaciones add constraint cotizaciones_estado_check
  check (estado in ('Borrador', 'Facturada', 'Activa', 'Vencida', 'Cancelada', 'Orden de venta'));

create unique index if not exists ordenventa_numero_cotizacion_unico
  on myappdb.ordenventa (idempres, numero_cotizacion) where numero_cotizacion is not null;

create or replace function myappdb.vincular_orden_cotizacion(p_orden_id bigint, p_numero_cotizacion text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_empresa integer := private.current_empresa_id(); v_numero_orden text;
begin
  if v_empresa is null then raise exception 'No hay empresa activa.' using errcode = '42501'; end if;
  select numero_orden into v_numero_orden from myappdb.ordenventa where id = p_orden_id and idempres = v_empresa for update;
  if v_numero_orden is null then raise exception 'Orden de venta no encontrada.' using errcode = '42501'; end if;
  update myappdb.cotizaciones set numero_orden_venta = v_numero_orden, estado = 'Orden de venta'
    where idempres = v_empresa and numero_cotizacion = p_numero_cotizacion and numero_orden_venta is null;
  if not found then raise exception 'La cotización ya fue convertida en una orden de venta o no existe.' using errcode = '23505'; end if;
  update myappdb.ordenventa set numero_cotizacion = p_numero_cotizacion where id = p_orden_id;
end; $$;
revoke all on function myappdb.vincular_orden_cotizacion(bigint, text) from public, anon;
grant execute on function myappdb.vincular_orden_cotizacion(bigint, text) to authenticated;
