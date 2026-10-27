begin;
-- ---------------------------------------------------------------------------
-- Facturación: inventario por código de reemplazo y precio mayor solo con
-- ventaxmayor = 'S'.
--
-- 1. Si el producto facturado tiene reemplazo = 'S' y un codigo_reemplazo, la
--    existencia se rebaja del producto con ese código (misma empresa).  Si el
--    código está en blanco se rebaja del producto digitado.
-- 2. Cada línea guarda en producto_inventario_id el producto que se rebajó,
--    para que anular o editar la factura reponga ese mismo producto aunque
--    luego cambie la configuración de reemplazo.
-- 3. La validación de precio al por mayor solo aplica a productos con
--    ventaxmayor = 'S' (antes se exigía a cualquiera con cantidad mínima).
-- ---------------------------------------------------------------------------

alter table myappdb.factura_detalles
  add column if not exists producto_inventario_id integer
  references myappdb.products(id) on delete set null;
create index if not exists factura_detalles_producto_inventario_idx
  on myappdb.factura_detalles (producto_inventario_id);
-- Las facturas existentes rebajaron siempre el producto digitado.
update myappdb.factura_detalles
set producto_inventario_id = producto_id
where producto_inventario_id is null and producto_id is not null;
create or replace function private.producto_para_inventario(p_producto_id integer)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_reemplazo text;
  v_codigo_reemplazo text;
  v_empresa_id integer;
  v_descripcion text;
  v_id integer;
begin
  select upper(trim(coalesce(p.reemplazo, ''))), nullif(trim(p.codigo_reemplazo), ''), p.empresa_id, p.descripcion
  into v_reemplazo, v_codigo_reemplazo, v_empresa_id, v_descripcion
  from myappdb.products as p
  where p.id = p_producto_id;

  if not found or v_reemplazo <> 'S' or v_codigo_reemplazo is null then
    return p_producto_id;
  end if;

  select r.id into v_id
  from myappdb.products as r
  where r.empresa_id = v_empresa_id
    and lower(trim(r.codigo)) = lower(v_codigo_reemplazo)
    and r.id <> p_producto_id
  order by r.id
  limit 1;

  if v_id is null then
    raise exception 'El producto % tiene el código de reemplazo % pero ese código no existe.', v_descripcion, v_codigo_reemplazo
      using errcode = '23503';
  end if;

  return v_id;
end;
$$;
revoke all on function private.producto_para_inventario(integer) from public, anon;
grant execute on function private.producto_para_inventario(integer) to authenticated, service_role;
-- ---------------------------------------------------------------------------
-- crear_factura
-- ---------------------------------------------------------------------------
create or replace function myappdb.crear_factura(p_factura jsonb, p_detalles jsonb)
returns table(id bigint, numero_factura text)
language plpgsql
set search_path = ''
as $$
declare
  nueva_factura_id bigint;
  nuevo_numero_factura text;
  empresa_usuario_id integer;
  sucursal_usuario_id bigint;
  detalle jsonb;
  producto_id_linea integer;
  producto_inventario_linea integer;
  productos_inventario integer[] := '{}';
  cantidad_linea numeric;
  precio_linea numeric;
  costo_producto numeric;
  precio_minimo_producto numeric;
  precio_mayor_producto numeric;
  cantidad_minima_venta_producto numeric;
  cantidad_minima_mayor_producto numeric;
  venta_mayor_producto text;
  estado_producto text;
  exento_itbis_producto boolean;
  tasa_itbis_producto numeric;
  es_regimen_especial boolean := left(ltrim(coalesce(p_factura ->> 'ncfType', '')), 2) = '44';
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

    select p.costo, p.precio_minimo, p.precio_mayor, p.cantidad_minima_venta,
      p.cantidad_minima_mayor, upper(trim(coalesce(p.ventaxmayor, ''))), p.estado, p.exento_itbis, p.valor_impuesto
    into costo_producto, precio_minimo_producto, precio_mayor_producto, cantidad_minima_venta_producto,
      cantidad_minima_mayor_producto, venta_mayor_producto, estado_producto, exento_itbis_producto, tasa_itbis_producto
    from myappdb.products as p where p.id = producto_id_linea for update;

    if not found or estado_producto = 'Inactivo' then
      raise exception 'El producto seleccionado no está disponible para venta.' using errcode = '23503';
    end if;
    if cantidad_linea < cantidad_minima_venta_producto then
      raise exception 'La cantidad para este producto es menor que la cantidad mínima de venta (%).', cantidad_minima_venta_producto using errcode = '22023';
    end if;

    if es_regimen_especial and not coalesce(exento_itbis_producto, false) and coalesce(tasa_itbis_producto, 0) > 0 then
      costo_producto := costo_producto / (1 + tasa_itbis_producto / 100);
      precio_minimo_producto := precio_minimo_producto / (1 + tasa_itbis_producto / 100);
      precio_mayor_producto := precio_mayor_producto / (1 + tasa_itbis_producto / 100);
    end if;

    if precio_linea <= costo_producto then
      raise exception 'El precio de venta debe ser mayor que el costo del producto.' using errcode = '22023';
    end if;
    if venta_mayor_producto = 'S' and cantidad_minima_mayor_producto > 0 and precio_mayor_producto > 0
      and cantidad_linea >= cantidad_minima_mayor_producto then
      if precio_linea < precio_mayor_producto then
        raise exception 'La cantidad aplica para venta al por mayor y requiere el precio mayor configurado.' using errcode = '22023';
      end if;
    elsif precio_linea < precio_minimo_producto then
      raise exception 'El precio de venta no puede ser menor que el precio mínimo configurado.' using errcode = '22023';
    end if;

    producto_inventario_linea := private.producto_para_inventario(producto_id_linea);
    productos_inventario := productos_inventario || producto_inventario_linea;

    update myappdb.products as p
    set existencia = p.existencia - cantidad_linea,
        estado = case when p.existencia - cantidad_linea <= 0 then 'Agotado' else p.estado end
    where p.id = producto_inventario_linea;
  end loop;

  nuevo_numero_factura := private.siguiente_numero_factura_usuario();

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
    factura_id, producto_id, producto_inventario_id, codigo_producto, descripcion, cantidad,
    precio_unitario, tasa_itbis, monto_itbis, total_linea
  ) select
    nueva_factura_id, nullif(linea.valor ->> 'productId', '')::integer, productos_inventario[linea.n],
    nullif(linea.valor ->> 'productCode', ''), linea.valor ->> 'description',
    (linea.valor ->> 'quantity')::numeric, (linea.valor ->> 'unitPrice')::numeric,
    coalesce((linea.valor ->> 'taxRate')::numeric, 0), coalesce((linea.valor ->> 'taxAmount')::numeric, 0),
    (linea.valor ->> 'lineTotal')::numeric
  from jsonb_array_elements(p_detalles) with ordinality as linea(valor, n);

  return query select nueva_factura_id, nuevo_numero_factura;
end;
$$;
-- ---------------------------------------------------------------------------
-- actualizar_factura
-- ---------------------------------------------------------------------------
create or replace function myappdb.actualizar_factura(p_factura_id bigint, p_factura jsonb, p_detalles jsonb)
returns table(id bigint, numero_factura text)
language plpgsql
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
  producto_inventario_linea integer;
  productos_inventario integer[] := '{}';
  cantidad_linea numeric;
  precio_linea numeric;
  existencia_producto numeric;
  costo_producto numeric;
  precio_minimo_producto numeric;
  precio_mayor_producto numeric;
  cantidad_minima_venta_producto numeric;
  cantidad_minima_mayor_producto numeric;
  venta_mayor_producto text;
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

  -- Repone el inventario en el mismo producto del que se rebajó.
  for detalle_anterior in
    select coalesce(d.producto_inventario_id, d.producto_id) as producto_id, d.cantidad
    from myappdb.factura_detalles as d where d.factura_id = p_factura_id
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
      p.cantidad_minima_venta, p.cantidad_minima_mayor, upper(trim(coalesce(p.ventaxmayor, ''))), p.estado
    into existencia_producto, costo_producto, precio_minimo_producto, precio_mayor_producto,
      cantidad_minima_venta_producto, cantidad_minima_mayor_producto, venta_mayor_producto, estado_producto
    from myappdb.products as p where p.id = producto_id_linea for update;

    if not found or estado_producto = 'Inactivo' then
      raise exception 'El producto seleccionado no está disponible para venta.' using errcode = '23503';
    end if;
    if cantidad_linea < cantidad_minima_venta_producto or precio_linea <= costo_producto then
      raise exception 'La línea no cumple con la cantidad mínima o el precio de venta permitido.' using errcode = '22023';
    end if;
    if venta_mayor_producto = 'S' and cantidad_minima_mayor_producto > 0 and precio_mayor_producto > 0
      and cantidad_linea >= cantidad_minima_mayor_producto then
      if precio_linea < precio_mayor_producto then
        raise exception 'La venta al por mayor requiere el precio mayor configurado.' using errcode = '22023';
      end if;
    elsif precio_linea < precio_minimo_producto then
      raise exception 'El precio de venta no puede ser menor que el precio mínimo configurado.' using errcode = '22023';
    end if;

    producto_inventario_linea := private.producto_para_inventario(producto_id_linea);
    productos_inventario := productos_inventario || producto_inventario_linea;

    update myappdb.products as p
    set existencia = p.existencia - cantidad_linea,
        estado = case when p.existencia - cantidad_linea <= 0 then 'Agotado' else p.estado end
    where p.id = producto_inventario_linea;
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
  insert into myappdb.factura_detalles (factura_id, producto_id, producto_inventario_id, codigo_producto, descripcion, cantidad, precio_unitario, tasa_itbis, monto_itbis, total_linea)
  select p_factura_id, nullif(linea.valor ->> 'productId', '')::integer, productos_inventario[linea.n],
    nullif(linea.valor ->> 'productCode', ''), linea.valor ->> 'description',
    (linea.valor ->> 'quantity')::numeric, (linea.valor ->> 'unitPrice')::numeric,
    coalesce((linea.valor ->> 'taxRate')::numeric, 0), coalesce((linea.valor ->> 'taxAmount')::numeric, 0),
    (linea.valor ->> 'lineTotal')::numeric
  from jsonb_array_elements(p_detalles) with ordinality as linea(valor, n);

  return query select p_factura_id, numero_existente;
end;
$$;
-- ---------------------------------------------------------------------------
-- anular_factura
-- ---------------------------------------------------------------------------
create or replace function myappdb.anular_factura(p_factura_id bigint)
returns void
language plpgsql
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

  -- Repone el inventario en el mismo producto del que se rebajó.
  for detalle in
    select coalesce(d.producto_inventario_id, d.producto_id) as producto_id, d.cantidad
    from myappdb.factura_detalles as d where d.factura_id = p_factura_id
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
commit;
