begin;

create or replace function myappdb.anular_factura(p_factura_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  empresa_usuario_id integer;
  sucursal_usuario_id bigint;
  factura_estado text;
  factura_dgii_estado text;
  detalle record;
begin
  select empresa_id, sucursal_id into empresa_usuario_id, sucursal_usuario_id
  from myappdb.usuarios
  where auth_usuario_id = (select auth.uid()) and estado = 'Activo';

  select estado, dgii_estado into factura_estado, factura_dgii_estado
  from myappdb.facturas
  where id = p_factura_id and idempres = empresa_usuario_id and idsucursal = sucursal_usuario_id
  for update;

  if not found then
    raise exception 'No se encontró la factura para la empresa y sucursal del usuario.' using errcode = '42501';
  end if;
  if factura_estado = 'Anulada' then
    raise exception 'La factura ya está anulada.' using errcode = '22023';
  end if;
  if factura_dgii_estado in ('Enviado', 'Aceptado') then
    raise exception 'No se puede anular una factura ya enviada o aceptada por DGII.' using errcode = '22023';
  end if;

  for detalle in
    select producto_id, cantidad from myappdb.factura_detalles where factura_id = p_factura_id
  loop
    update myappdb.products as p
    set existencia = p.existencia + detalle.cantidad,
        estado = case when p.estado = 'Agotado' then 'Activo' else p.estado end
    where p.id = detalle.producto_id;
  end loop;

  update myappdb.facturas
  set estado = 'Anulada', actualizado_en = now()
  where id = p_factura_id;
end;
$$;

create or replace function myappdb.actualizar_factura(
  p_factura_id bigint,
  p_factura jsonb,
  p_detalles jsonb
)
returns table (id bigint, numero_factura text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  empresa_usuario_id integer;
  sucursal_usuario_id bigint;
  factura_estado text;
  factura_dgii_estado text;
  detalle_anterior record;
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
  numero_existente text;
begin
  if jsonb_array_length(coalesce(p_detalles, '[]'::jsonb)) = 0 then
    raise exception 'La factura debe incluir al menos un producto.' using errcode = '22023';
  end if;

  select empresa_id, sucursal_id into empresa_usuario_id, sucursal_usuario_id
  from myappdb.usuarios
  where auth_usuario_id = (select auth.uid()) and estado = 'Activo';

  select f.estado, f.dgii_estado, f.numero_factura
  into factura_estado, factura_dgii_estado, numero_existente
  from myappdb.facturas as f
  where f.id = p_factura_id and f.idempres = empresa_usuario_id and f.idsucursal = sucursal_usuario_id
  for update;

  if not found then
    raise exception 'No se encontró la factura para la empresa y sucursal del usuario.' using errcode = '42501';
  end if;
  if factura_estado = 'Anulada' then
    raise exception 'No se puede editar una factura anulada.' using errcode = '22023';
  end if;
  if factura_dgii_estado in ('Enviado', 'Aceptado') then
    raise exception 'No se puede editar una factura ya enviada o aceptada por DGII.' using errcode = '22023';
  end if;

  for detalle_anterior in
    select producto_id, cantidad from myappdb.factura_detalles where factura_id = p_factura_id
  loop
    update myappdb.products as p
    set existencia = p.existencia + detalle_anterior.cantidad,
        estado = case when p.estado = 'Agotado' then 'Activo' else p.estado end
    where p.id = detalle_anterior.producto_id;
  end loop;

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
    if cantidad_linea < cantidad_minima_venta_producto or precio_linea <= costo_producto then
      raise exception 'La línea no cumple con la cantidad mínima o el precio de venta permitido.' using errcode = '22023';
    end if;
    if cantidad_minima_mayor_producto > 0 and precio_mayor_producto > 0 and cantidad_linea >= cantidad_minima_mayor_producto then
      if precio_linea < precio_mayor_producto then
        raise exception 'La venta al por mayor requiere el precio mayor configurado.' using errcode = '22023';
      end if;
    elsif precio_linea < precio_minimo_producto then
      raise exception 'El precio de venta no puede ser menor que el precio mínimo configurado.' using errcode = '22023';
    end if;
    update myappdb.products as p
    set existencia = p.existencia - cantidad_linea,
        estado = case when p.existencia - cantidad_linea <= 0 then 'Agotado' else p.estado end
    where p.id = producto_id_linea;
  end loop;

  update myappdb.facturas as f
  set cliente_id = nullif(p_factura ->> 'customerId', '')::integer,
      cliente_nombre = p_factura ->> 'customerName', cliente_rnc = nullif(p_factura ->> 'rnc', ''),
      cliente_telefono = nullif(p_factura ->> 'customerPhone', ''), cliente_correo = nullif(p_factura ->> 'customerEmail', ''),
      cliente_direccion = nullif(p_factura ->> 'customerAddress', ''), cliente_ciudad = nullif(p_factura ->> 'customerCity', ''),
      fecha_factura = (p_factura ->> 'invoiceDate')::date, tipo_ncf = nullif(p_factura ->> 'ncfType', ''),
      ncf = nullif(p_factura ->> 'ncf', ''), condicion_pago = coalesce(nullif(p_factura ->> 'paymentMethod', ''), 'Contado'),
      notas = nullif(p_factura ->> 'notes', ''), subtotal = coalesce((p_factura ->> 'subtotal')::numeric, 0),
      itbis = coalesce((p_factura ->> 'taxTotal')::numeric, 0), total = coalesce((p_factura ->> 'grandTotal')::numeric, 0),
      actualizado_en = now()
  where f.id = p_factura_id;

  delete from myappdb.factura_detalles where factura_id = p_factura_id;
  insert into myappdb.factura_detalles (factura_id, producto_id, codigo_producto, descripcion, cantidad, precio_unitario, tasa_itbis, monto_itbis, total_linea)
  select p_factura_id, nullif(linea.valor ->> 'productId', '')::integer, nullif(linea.valor ->> 'productCode', ''),
    linea.valor ->> 'description', (linea.valor ->> 'quantity')::numeric, (linea.valor ->> 'unitPrice')::numeric,
    coalesce((linea.valor ->> 'taxRate')::numeric, 0), coalesce((linea.valor ->> 'taxAmount')::numeric, 0),
    (linea.valor ->> 'lineTotal')::numeric
  from jsonb_array_elements(p_detalles) as linea(valor);

  return query select p_factura_id, numero_existente;
end;
$$;

revoke all on function myappdb.anular_factura(bigint) from public;
revoke all on function myappdb.actualizar_factura(bigint, jsonb, jsonb) from public;
grant execute on function myappdb.anular_factura(bigint) to authenticated, service_role;
grant execute on function myappdb.actualizar_factura(bigint, jsonb, jsonb) to authenticated, service_role;

commit;
