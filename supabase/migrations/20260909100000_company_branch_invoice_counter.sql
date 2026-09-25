begin;

alter table myappdb.usuarios
  add column if not exists sucursal_id smallint not null default 1;

alter table myappdb.usuarios
  drop constraint if exists usuarios_sucursal_id_check;

alter table myappdb.usuarios
  add constraint usuarios_sucursal_id_check check (sucursal_id between 1 and 99);

alter table myappdb.contador_doc
  add column if not exists sucursal_id smallint not null default 1;

alter table myappdb.contador_doc
  alter column ano set not null;

alter table myappdb.contador_doc
  drop constraint if exists contador_doc_pkey;

alter table myappdb.contador_doc
  add constraint contador_doc_pkey primary key (id_empres, ano, sucursal_id);

alter table myappdb.contador_doc
  drop constraint if exists contador_doc_sucursal_id_check;

alter table myappdb.contador_doc
  add constraint contador_doc_sucursal_id_check check (sucursal_id between 1 and 99);

create or replace function myappdb.siguiente_numero_factura_usuario()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  empresa_usuario_id integer;
  sucursal_usuario_id smallint;
  nombre_empresa text;
  ano_factura smallint := extract(year from current_date)::smallint;
  consecutivo_factura integer;
begin
  select u.empresa_id, u.sucursal_id
  into empresa_usuario_id, sucursal_usuario_id
  from myappdb.usuarios as u
  where u.auth_usuario_id = (select auth.uid())
    and u.estado = 'Activo';

  if not found then
    raise exception 'No se encontró un usuario activo para generar la factura.' using errcode = '42501';
  end if;

  select e.nombre_comercial
  into nombre_empresa
  from myappdb.empresas as e
  where e.id = empresa_usuario_id;

  if not found then
    raise exception 'La empresa del usuario no existe.' using errcode = '23503';
  end if;

  insert into myappdb.contador_doc (
    id_empres,
    nom_empresa,
    ano,
    sucursal_id,
    factura
  )
  values (
    empresa_usuario_id,
    nombre_empresa,
    ano_factura,
    sucursal_usuario_id,
    1
  )
  on conflict (id_empres, ano, sucursal_id)
  do update set
    factura = myappdb.contador_doc.factura + 1,
    nom_empresa = excluded.nom_empresa
  returning factura into consecutivo_factura;

  if consecutivo_factura > 9999 then
    raise exception 'El consecutivo de factura superó los cuatro dígitos para esta sucursal y año.' using errcode = '22003';
  end if;

  return lpad(ano_factura::text, 4, '0')
    || lpad(sucursal_usuario_id::text, 2, '0')
    || lpad(consecutivo_factura::text, 4, '0');
end;
$$;

revoke all on function myappdb.siguiente_numero_factura_usuario() from public;
grant execute on function myappdb.siguiente_numero_factura_usuario() to authenticated, service_role;

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
begin
  if jsonb_array_length(coalesce(p_detalles, '[]'::jsonb)) = 0 then
    raise exception 'La factura debe incluir al menos un producto.';
  end if;

  nuevo_numero_factura := myappdb.siguiente_numero_factura_usuario();

  insert into myappdb.facturas (
    numero_factura,
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
