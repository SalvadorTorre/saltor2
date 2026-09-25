begin;

create or replace function myappdb.crear_factura(
  p_factura jsonb,
  p_detalles jsonb
)
returns table (id bigint, numero_factura text)
language plpgsql
security invoker
set search_path = myappdb, pg_temp
as $$
declare
  nueva_factura_id bigint;
  nuevo_numero_factura text;
begin
  if jsonb_array_length(coalesce(p_detalles, '[]'::jsonb)) = 0 then
    raise exception 'La factura debe incluir al menos un producto.';
  end if;

  insert into myappdb.facturas (
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

grant execute on function myappdb.crear_factura(jsonb, jsonb) to anon, authenticated, service_role;

commit;
