-- Orden de venta: descuento por artículo (porcentaje) y total de descuento; número de orden en el detalle.
alter table myappdb.ordenventa_detalle
  add column if not exists descuento_porcentaje numeric(5,2) not null default 0,
  add column if not exists descuento_monto numeric(14,2) not null default 0,
  add column if not exists precio_original numeric(14,2),
  add column if not exists numero_orden text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ordenventa_detalle_descuento_check') then
    alter table myappdb.ordenventa_detalle add constraint ordenventa_detalle_descuento_check
      check (descuento_porcentaje >= 0 and descuento_porcentaje < 100 and descuento_monto >= 0);
  end if;
end $$;
comment on column myappdb.ordenventa_detalle.descuento_porcentaje is 'Porciento de descuento aplicado al precio del artículo.';
comment on column myappdb.ordenventa_detalle.descuento_monto is 'Monto descontado en la línea: cantidad × (precio original − precio con descuento).';
comment on column myappdb.ordenventa_detalle.precio_original is 'Precio antes del descuento (precio_unitario ya trae el descuento aplicado).';
comment on column myappdb.ordenventa_detalle.numero_orden is 'Número de la orden de venta (copiado de ordenventa).';

alter table myappdb.ordenventa add column if not exists total_descuento numeric(14,2) not null default 0;
comment on column myappdb.ordenventa.total_descuento is 'Suma de los descuentos por artículo de la orden.';

-- Número de orden en cada línea (siempre el de la orden a la que pertenece).
create or replace function private.tg_ordenventa_detalle_numero()
returns trigger language plpgsql security definer set search_path = ''
as $f$
begin
  select o.numero_orden into new.numero_orden from myappdb.ordenventa o where o.id = new.ordenventa_id;
  return new;
end; $f$;
drop trigger if exists ordenventa_detalle_numero on myappdb.ordenventa_detalle;
create trigger ordenventa_detalle_numero before insert or update of ordenventa_id on myappdb.ordenventa_detalle
  for each row execute function private.tg_ordenventa_detalle_numero();

-- Total de descuento de la orden = suma de los descuentos de sus líneas.
create or replace function private.tg_ordenventa_total_descuento()
returns trigger language plpgsql security definer set search_path = ''
as $f$
declare v_id bigint := coalesce(new.ordenventa_id, old.ordenventa_id);
begin
  update myappdb.ordenventa o
     set total_descuento = coalesce((select sum(d.descuento_monto) from myappdb.ordenventa_detalle d where d.ordenventa_id = v_id), 0)
   where o.id = v_id;
  return null;
end; $f$;
drop trigger if exists ordenventa_detalle_total_descuento on myappdb.ordenventa_detalle;
create trigger ordenventa_detalle_total_descuento after insert or update or delete on myappdb.ordenventa_detalle
  for each row execute function private.tg_ordenventa_total_descuento();

-- Si cambia el número de la orden, se actualiza en sus líneas.
create or replace function private.tg_ordenventa_numero_en_detalle()
returns trigger language plpgsql security definer set search_path = ''
as $f$
begin
  if new.numero_orden is distinct from old.numero_orden then
    update myappdb.ordenventa_detalle d set numero_orden = new.numero_orden where d.ordenventa_id = new.id;
  end if;
  return null;
end; $f$;
drop trigger if exists ordenventa_numero_en_detalle on myappdb.ordenventa;
create trigger ordenventa_numero_en_detalle after update of numero_orden on myappdb.ordenventa
  for each row execute function private.tg_ordenventa_numero_en_detalle();

-- Líneas existentes: número de orden y precio original.
-- (se desactivan los triggers solo para este relleno: las órdenes ya facturadas no permiten tocar su detalle)
alter table myappdb.ordenventa_detalle disable trigger user;
update myappdb.ordenventa_detalle d set numero_orden = o.numero_orden, precio_original = coalesce(d.precio_original, d.precio_unitario)
  from myappdb.ordenventa o where o.id = d.ordenventa_id;
alter table myappdb.ordenventa_detalle enable trigger user;

-- Crear orden: guarda el descuento de cada línea.
create or replace function myappdb.crear_orden_venta(p_orden jsonb, p_detalles jsonb)
returns table(id bigint, numero_orden text)
language plpgsql
set search_path to ''
as $function$
declare
  v_empresa integer := private.current_empresa_id();
  v_sucursal smallint := private.current_sucursal_id();
  v_usuario integer;
  v_usuario_nombre text;
  v_orden_id bigint;
  v_numero text;
begin
  if v_empresa is null or v_sucursal is null then
    raise exception 'No se encontró una empresa y sucursal activas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_detalles) <> 'array' or jsonb_array_length(p_detalles) = 0 then
    raise exception 'Agrega al menos un producto a la orden de venta.' using errcode = '22023';
  end if;

  select u.codusuario, u.nombre_completo into v_usuario, v_usuario_nombre
  from myappdb.usuarios u
  where u.auth_usuario_id = (select auth.uid()) and u.empresa_id = v_empresa and u.estado = 'Activo';

  v_numero := private.siguiente_numero_orden_venta_usuario();

  insert into myappdb.ordenventa (
    numero_orden, cliente_id, cliente_nombre, cliente_rnc, cliente_telefono,
    cliente_correo, cliente_direccion, cliente_ciudad, fecha_orden,
    condicion_pago, forma_pago_codigo, notas, subtotal, itbis, total,
    idempres, idsucursal, usuario_id, usuario_nombre
  ) values (
    v_numero, nullif(p_orden ->> 'customerId', '')::integer,
    coalesce(nullif(trim(p_orden ->> 'customerName'), ''), 'Cliente contado'),
    nullif(trim(p_orden ->> 'rnc'), ''), nullif(trim(p_orden ->> 'customerPhone'), ''),
    nullif(trim(p_orden ->> 'customerEmail'), ''), nullif(trim(p_orden ->> 'customerAddress'), ''),
    nullif(trim(p_orden ->> 'customerCity'), ''),
    coalesce(nullif(p_orden ->> 'invoiceDate', '')::date, current_date),
    case when p_orden ->> 'paymentMethod' = 'Credito' then 'Credito' else 'Contado' end,
    nullif(p_orden ->> 'paymentMethodCode', '')::smallint, nullif(trim(p_orden ->> 'notes'), ''),
    coalesce((p_orden ->> 'subtotal')::numeric, 0), coalesce((p_orden ->> 'taxTotal')::numeric, 0),
    coalesce((p_orden ->> 'grandTotal')::numeric, 0), v_empresa, v_sucursal, v_usuario, v_usuario_nombre
  ) returning ordenventa.id into v_orden_id;

  insert into myappdb.ordenventa_detalle (
    ordenventa_id, producto_id, codigo_producto, descripcion, cantidad,
    precio_unitario, tasa_itbis, monto_itbis, total_linea,
    descuento_porcentaje, descuento_monto, precio_original
  )
  select v_orden_id, nullif(item ->> 'productId', '')::integer,
    nullif(trim(item ->> 'productCode'), ''), coalesce(nullif(trim(item ->> 'description'), ''), 'Producto'),
    coalesce((item ->> 'quantity')::numeric, 0), coalesce((item ->> 'unitPrice')::numeric, 0),
    coalesce((item ->> 'taxRate')::numeric, 0), coalesce((item ->> 'taxAmount')::numeric, 0),
    coalesce((item ->> 'lineTotal')::numeric, 0),
    coalesce(nullif(item ->> 'discountPercent', '')::numeric, 0),
    coalesce(nullif(item ->> 'discountAmount', '')::numeric, 0),
    coalesce(nullif(item ->> 'originalPrice', '')::numeric, (item ->> 'unitPrice')::numeric)
  from jsonb_array_elements(p_detalles) as item;

  return query select v_orden_id, v_numero;
end;
$function$;
