begin;

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
  detalle jsonb;
  producto_id_linea integer;
  cantidad_linea numeric;
  precio_linea numeric;
  existencia_producto numeric;
  costo_producto numeric;
  precio_minimo_producto numeric;
  precio_mayor_producto numeric;
  cantidad_minima_venta_producto numeric;
  cantidad_minima_mayor_producto numeric;
  estado_producto text;
begin
  if jsonb_array_length(coalesce(p_detalles, '[]'::jsonb)) = 0 then
    raise exception 'La factura debe incluir al menos un producto.';
  end if;

  select u.empresa_id, u.sucursal_id
  into empresa_usuario_id, sucursal_usuario_id
  from myappdb.usuarios as u
  where u.auth_usuario_id = (select auth.uid()) and u.estado = 'Activo';

  if not found then
    raise exception 'No se encontró un usuario activo para asignar empresa y sucursal a la factura.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from myappdb.sucursales as s
    where s.idsucursal = sucursal_usuario_id and s.idempresa = empresa_usuario_id and s.estado = 'Activa'
  ) then
    raise exception 'La sucursal asignada al usuario no está activa o no pertenece a su empresa.' using errcode = '23503';
  end if;

  for detalle in select value from jsonb_array_elements(p_detalles)
  loop
    producto_id_linea := nullif(detalle ->> 'productId', '')::integer;
    cantidad_linea := coalesce((detalle ->> 'quantity')::numeric, 0);
    precio_linea := coalesce((detalle ->> 'unitPrice')::numeric, 0);
    if producto_id_linea is null or cantidad_linea <= 0 then
      raise exception 'Cada línea debe tener un producto y una cantidad mayor que cero.' using errcode = '22023';
    end if;

    select p.existencia, p.costo, p.precio_minimo, p.precio_mayor,
      p.cantidad_minima_venta, p.cantidad_minima_mayor, p.estado
    into existencia_producto, costo_producto, precio_minimo_producto, precio_mayor_producto,
      cantidad_minima_venta_producto, cantidad_minima_mayor_producto, estado_producto
    from myappdb.products as p where p.id = producto_id_linea for update;

    if not found or estado_producto = 'Inactivo' then
      raise exception 'El producto seleccionado no está disponible para venta.' using errcode = '23503';
    end if;
    if cantidad_linea < cantidad_minima_venta_producto then
      raise exception 'La cantidad para este producto es menor que la cantidad mínima de venta (%).', cantidad_minima_venta_producto using errcode = '22023';
    end if;
    if precio_linea <= costo_producto then
      raise exception 'El precio de venta debe ser mayor que el costo del producto.' using errcode = '22023';
    end if;
    if cantidad_minima_mayor_producto > 0 and precio_mayor_producto > 0
      and cantidad_linea >= cantidad_minima_mayor_producto then
      if precio_linea < precio_mayor_producto then
        raise exception 'La cantidad aplica para venta al por mayor y requiere el precio mayor configurado.' using errcode = '22023';
      end if;
    elsif precio_linea < precio_minimo_producto then
      raise exception 'El precio de venta no puede ser menor que el precio mínimo configurado.' using errcode = '22023';
    end if;
    update myappdb.products as p
    set existencia = p.existencia - cantidad_linea,
        estado = case when p.existencia - cantidad_linea <= 0 then 'Agotado' else p.estado end
    where p.id = producto_id_linea;
  end loop;

  nuevo_numero_factura := myappdb.siguiente_numero_factura_usuario();

  insert into myappdb.facturas (
    numero_factura, idempres, idsucursal, cliente_id, cliente_nombre,
    cliente_rnc, cliente_telefono, cliente_correo, cliente_direccion, cliente_ciudad,
    fecha_factura, tipo_ncf, ncf, condicion_pago, notas, subtotal, itbis, total
  ) values (
    nuevo_numero_factura, empresa_usuario_id, sucursal_usuario_id,
    nullif(p_factura ->> 'customerId', '')::integer, p_factura ->> 'customerName',
    nullif(p_factura ->> 'rnc', ''), nullif(p_factura ->> 'customerPhone', ''),
    nullif(p_factura ->> 'customerEmail', ''), nullif(p_factura ->> 'customerAddress', ''),
    nullif(p_factura ->> 'customerCity', ''), (p_factura ->> 'invoiceDate')::date,
    nullif(p_factura ->> 'ncfType', ''), nullif(p_factura ->> 'ncf', ''),
    coalesce(nullif(p_factura ->> 'paymentMethod', ''), 'Contado'), nullif(p_factura ->> 'notes', ''),
    coalesce((p_factura ->> 'subtotal')::numeric, 0), coalesce((p_factura ->> 'taxTotal')::numeric, 0),
    coalesce((p_factura ->> 'grandTotal')::numeric, 0)
  ) returning facturas.id, facturas.numero_factura into nueva_factura_id, nuevo_numero_factura;

  insert into myappdb.factura_detalles (
    factura_id, producto_id, codigo_producto, descripcion, cantidad,
    precio_unitario, tasa_itbis, monto_itbis, total_linea
  ) select
    nueva_factura_id, nullif(linea.valor ->> 'productId', '')::integer,
    nullif(linea.valor ->> 'productCode', ''), linea.valor ->> 'description',
    (linea.valor ->> 'quantity')::numeric, (linea.valor ->> 'unitPrice')::numeric,
    coalesce((linea.valor ->> 'taxRate')::numeric, 0), coalesce((linea.valor ->> 'taxAmount')::numeric, 0),
    (linea.valor ->> 'lineTotal')::numeric
  from jsonb_array_elements(p_detalles) as linea(valor);

  return query select nueva_factura_id, nuevo_numero_factura;
end;
$$;

revoke all on function myappdb.crear_factura(jsonb, jsonb) from public;
grant execute on function myappdb.crear_factura(jsonb, jsonb) to authenticated, service_role;

commit;
