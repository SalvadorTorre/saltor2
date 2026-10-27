-- Las órdenes de venta usan su propio consecutivo en contador_doc, por
-- empresa, sucursal y año, igual que las facturas pero sin consumir NCF.
create or replace function private.siguiente_numero_orden_venta_usuario()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id integer;
  v_sucursal_id smallint;
  v_empresa_nombre text;
  v_ano smallint := extract(year from current_date)::smallint;
  v_consecutivo integer;
begin
  select u.empresa_id, u.sucursal_id
    into v_empresa_id, v_sucursal_id
  from myappdb.usuarios u
  where u.auth_usuario_id = (select auth.uid()) and u.estado = 'Activo';

  if not found then
    raise exception 'No se encontró un usuario activo para generar la orden de venta.' using errcode = '42501';
  end if;

  select e.nombre_comercial into v_empresa_nombre
  from myappdb.empresas e where e.id = v_empresa_id;

  insert into myappdb.contador_doc (
    id_empres, nom_empresa, ano, sucursal_id, factura, cotizacion,
    nota_credito, gasto_menores, recibo, ordenventa
  ) values (
    v_empresa_id, v_empresa_nombre, v_ano, v_sucursal_id,
    0, 0, 0, 0, 0, 1
  )
  on conflict (id_empres, ano, sucursal_id) do update
    set ordenventa = coalesce(myappdb.contador_doc.ordenventa, 0) + 1,
        nom_empresa = excluded.nom_empresa
  returning ordenventa into v_consecutivo;

  if v_consecutivo > 99999 then
    raise exception 'El consecutivo de órdenes de venta superó los cinco dígitos.' using errcode = '22003';
  end if;

  return lpad(v_ano::text, 4, '0')
    || lpad(v_sucursal_id::text, 2, '0')
    || lpad(v_consecutivo::text, 5, '0');
end;
$$;

revoke all on function private.siguiente_numero_orden_venta_usuario() from public, anon;
grant execute on function private.siguiente_numero_orden_venta_usuario() to authenticated, service_role;

alter table myappdb.ordenventa alter column numero_orden drop default;

create or replace function myappdb.crear_orden_venta(p_orden jsonb, p_detalles jsonb)
returns table(id bigint, numero_orden text)
language plpgsql
security invoker
set search_path = ''
as $$
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
    precio_unitario, tasa_itbis, monto_itbis, total_linea
  )
  select v_orden_id, nullif(item ->> 'productId', '')::integer,
    nullif(trim(item ->> 'productCode'), ''), coalesce(nullif(trim(item ->> 'description'), ''), 'Producto'),
    coalesce((item ->> 'quantity')::numeric, 0), coalesce((item ->> 'unitPrice')::numeric, 0),
    coalesce((item ->> 'taxRate')::numeric, 0), coalesce((item ->> 'taxAmount')::numeric, 0),
    coalesce((item ->> 'lineTotal')::numeric, 0)
  from jsonb_array_elements(p_detalles) as item;

  return query select v_orden_id, v_numero;
end;
$$;

revoke all on function myappdb.crear_orden_venta(jsonb, jsonb) from public, anon;
grant execute on function myappdb.crear_orden_venta(jsonb, jsonb) to authenticated;
