begin;

alter table myappdb.facturas
  alter column idsucursal type bigint using idsucursal::bigint;

alter table myappdb.facturas
  drop constraint if exists facturas_empresa_fkey;

alter table myappdb.facturas
  add constraint facturas_empresa_fkey
  foreign key (idempres) references myappdb.empresas(id)
  on update cascade on delete restrict;

alter table myappdb.facturas
  drop constraint if exists facturas_sucursal_fkey;

alter table myappdb.facturas
  add constraint facturas_sucursal_fkey
  foreign key (idsucursal) references myappdb.sucursales(idsucursal)
  on update cascade on delete restrict;

create index if not exists facturas_empresa_sucursal_idx
  on myappdb.facturas (idempres, idsucursal, fecha_factura desc);

create or replace function myappdb.crear_factura(
  p_factura jsonb,
  p_detalles jsonb
)
returns table (id bigint, numero_factura text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  nueva_factura_id bigint;
  nuevo_numero_factura text;
  empresa_usuario_id integer;
  sucursal_usuario_id bigint;
begin
  if jsonb_array_length(coalesce(p_detalles, '[]'::jsonb)) = 0 then
    raise exception 'La factura debe incluir al menos un producto.';
  end if;

  select u.empresa_id, u.sucursal_id
  into empresa_usuario_id, sucursal_usuario_id
  from myappdb.usuarios as u
  where u.auth_usuario_id = (select auth.uid())
    and u.estado = 'Activo';

  if not found then
    raise exception 'No se encontró un usuario activo para asignar empresa y sucursal a la factura.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from myappdb.sucursales as s
    where s.idsucursal = sucursal_usuario_id
      and s.idempresa = empresa_usuario_id
      and s.estado = 'Activa'
  ) then
    raise exception 'La sucursal asignada al usuario no está activa o no pertenece a su empresa.' using errcode = '23503';
  end if;

  nuevo_numero_factura := myappdb.siguiente_numero_factura_usuario();

  insert into myappdb.facturas (
    numero_factura,
    idempres,
    idsucursal,
    cliente_id,
    cliente_nombre,
    cliente_rnc,
    cliente_telefono,
    cliente_correo,
    cliente_direccion,
    cliente_ciudad,
    fecha_factura,
    tipo_ncf,
    ncf,
    condicion_pago,
    notas,
    subtotal,
    itbis,
    total
  )
  values (
    nuevo_numero_factura,
    empresa_usuario_id,
    sucursal_usuario_id,
    nullif(p_factura ->> 'customerId', '')::integer,
    p_factura ->> 'customerName',
    nullif(p_factura ->> 'rnc', ''),
    nullif(p_factura ->> 'customerPhone', ''),
    nullif(p_factura ->> 'customerEmail', ''),
    nullif(p_factura ->> 'customerAddress', ''),
    nullif(p_factura ->> 'customerCity', ''),
    (p_factura ->> 'invoiceDate')::date,
    nullif(p_factura ->> 'ncfType', ''),
    nullif(p_factura ->> 'ncf', ''),
    coalesce(nullif(p_factura ->> 'paymentMethod', ''), 'Contado'),
    nullif(p_factura ->> 'notes', ''),
    coalesce((p_factura ->> 'subtotal')::numeric, 0),
    coalesce((p_factura ->> 'taxTotal')::numeric, 0),
    coalesce((p_factura ->> 'grandTotal')::numeric, 0)
  )
  returning facturas.id, facturas.numero_factura into nueva_factura_id, nuevo_numero_factura;

  insert into myappdb.factura_detalles (
    factura_id,
    producto_id,
    codigo_producto,
    descripcion,
    cantidad,
    precio_unitario,
    tasa_itbis,
    monto_itbis,
    total_linea
  )
  select
    nueva_factura_id,
    nullif(detalle ->> 'productId', '')::integer,
    nullif(detalle ->> 'productCode', ''),
    detalle ->> 'description',
    (detalle ->> 'quantity')::numeric,
    (detalle ->> 'unitPrice')::numeric,
    coalesce((detalle ->> 'taxRate')::numeric, 0),
    coalesce((detalle ->> 'taxAmount')::numeric, 0),
    (detalle ->> 'lineTotal')::numeric
  from jsonb_array_elements(p_detalles) as detalle;

  return query select nueva_factura_id, nuevo_numero_factura;
end;
$$;

revoke all on function myappdb.crear_factura(jsonb, jsonb) from public;
grant execute on function myappdb.crear_factura(jsonb, jsonb) to authenticated, service_role;

commit;
