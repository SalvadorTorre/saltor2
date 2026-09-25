begin;

create table if not exists myappdb.contadores_documentos (
  tipo_documento text primary key,
  prefijo text not null,
  ultimo_numero bigint not null default 0,
  digitos smallint not null default 6,
  actualizado_en timestamptz not null default now(),
  constraint contadores_documentos_tipo_check check (btrim(tipo_documento) <> ''),
  constraint contadores_documentos_ultimo_numero_check check (ultimo_numero >= 0),
  constraint contadores_documentos_digitos_check check (digitos between 1 and 12)
);

insert into myappdb.contadores_documentos (tipo_documento, prefijo, ultimo_numero, digitos)
select 'factura', 'FAC-', coalesce((
  select max(nullif(regexp_replace(numero_factura, '[^0-9]', '', 'g'), '')::bigint)
  from myappdb.facturas
), 0), 6
union all select 'cotizacion', 'COT-', 0, 6
union all select 'nota_credito', 'NC-', 0, 6
union all select 'nota_debito', 'ND-', 0, 6
union all select 'recibo', 'REC-', 0, 6
union all select 'orden_compra', 'OC-', 0, 6
union all select 'conduce', 'CON-', 0, 6
on conflict (tipo_documento) do update
set ultimo_numero = greatest(
  myappdb.contadores_documentos.ultimo_numero,
  excluded.ultimo_numero
);

drop trigger if exists contadores_documentos_set_updated_at on myappdb.contadores_documentos;
create trigger contadores_documentos_set_updated_at
before update on myappdb.contadores_documentos
for each row
execute function myappdb.set_updated_at();

create or replace function myappdb.siguiente_numero_documento(p_tipo_documento text)
returns table (numero bigint, numero_formateado text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  tipo_normalizado text := lower(btrim(p_tipo_documento));
  siguiente_numero bigint;
  prefijo_documento text;
  cantidad_digitos smallint;
begin
  if tipo_normalizado = '' then
    raise exception 'El tipo de documento es obligatorio.' using errcode = '22023';
  end if;

  update myappdb.contadores_documentos
  set ultimo_numero = ultimo_numero + 1
  where tipo_documento = tipo_normalizado
  returning ultimo_numero, prefijo, digitos
  into siguiente_numero, prefijo_documento, cantidad_digitos;

  if not found then
    raise exception 'No existe un contador para el tipo de documento "%".', tipo_normalizado
      using errcode = '22023';
  end if;

  return query
  select
    siguiente_numero,
    prefijo_documento || lpad(siguiente_numero::text, cantidad_digitos, '0');
end;
$$;

alter table myappdb.contadores_documentos enable row level security;

grant usage on schema myappdb to anon, authenticated, service_role;
grant select on myappdb.contadores_documentos to anon, authenticated, service_role;
revoke all on function myappdb.siguiente_numero_documento(text) from public;
grant execute on function myappdb.siguiente_numero_documento(text) to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'myappdb'
      and tablename = 'contadores_documentos'
      and policyname = 'contadores_documentos_select_local_app'
  ) then
    create policy contadores_documentos_select_local_app
      on myappdb.contadores_documentos
      for select to anon, authenticated
      using (true);
  end if;
end;
$$;

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

  select numero_formateado
  into nuevo_numero_factura
  from myappdb.siguiente_numero_documento('factura');

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

grant execute on function myappdb.crear_factura(jsonb, jsonb) to anon, authenticated, service_role;

commit;
