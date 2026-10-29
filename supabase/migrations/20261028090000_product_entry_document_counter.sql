-- Consecutivo de entradas de productos por empresa, sucursal y año.
alter table myappdb.contador_doc
  add column if not exists entrada integer;

create or replace function private.tg_empresa_contador_documentos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sucursal_id bigint;
begin
  select s.idsucursal into v_sucursal_id
  from myappdb.sucursales s
  where s.idempresa = new.id
  order by s.idsucursal
  limit 1;

  if v_sucursal_id is null then
    raise exception 'No se pudo crear la sucursal principal para la empresa %.', new.id;
  end if;

  insert into myappdb.contador_doc (
    id_empres, nom_empresa, ano, sucursal_id,
    factura, cotizacion, nota_credito, gasto_menores, recibo, ordenventa, entrada
  ) values (
    new.id, new.nombre_comercial, extract(year from current_date)::smallint, v_sucursal_id::smallint,
    0, 0, 0, 0, 0, 0, 0
  )
  on conflict (id_empres, ano, sucursal_id) do nothing;

  return null;
end;
$$;

create or replace function private.siguiente_numero_entrada_producto_usuario()
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
  select u.empresa_id, u.sucursal_id into v_empresa_id, v_sucursal_id
  from myappdb.usuarios u
  where u.auth_usuario_id = (select auth.uid()) and u.estado = 'Activo';

  if not found then
    raise exception 'No se encontró un usuario activo para generar la entrada.' using errcode = '42501';
  end if;

  select e.nombre_comercial into v_empresa_nombre
  from myappdb.empresas e
  where e.id = v_empresa_id;

  insert into myappdb.contador_doc (
    id_empres, nom_empresa, ano, sucursal_id,
    factura, cotizacion, nota_credito, gasto_menores, recibo, ordenventa, entrada
  ) values (
    v_empresa_id, v_empresa_nombre, v_ano, v_sucursal_id,
    0, 0, 0, 0, 0, 0, 1
  )
  on conflict (id_empres, ano, sucursal_id) do update
    set entrada = coalesce(myappdb.contador_doc.entrada, 0) + 1,
        nom_empresa = excluded.nom_empresa
  returning entrada into v_consecutivo;

  if v_consecutivo > 99999 then
    raise exception 'El consecutivo de entradas superó los cinco dígitos.' using errcode = '22003';
  end if;

  return lpad(v_ano::text, 4, '0')
    || lpad(v_sucursal_id::text, 2, '0')
    || lpad(v_consecutivo::text, 5, '0');
end;
$$;

revoke all on function private.siguiente_numero_entrada_producto_usuario() from public, anon;
grant execute on function private.siguiente_numero_entrada_producto_usuario() to authenticated, service_role;

create or replace function myappdb.crear_entrada_productos(
  p_suplidor_id integer,
  p_fecha date,
  p_referencia text,
  p_orden_compra text,
  p_fecha_factura_suplidor date,
  p_codigo_usuario text,
  p_nombre_usuario text,
  p_notas text,
  p_lineas jsonb
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_empresa_id integer := private.current_empresa_id();
  v_entrada_id bigint;
  v_numero text;
begin
  perform set_config('saltor.mov_tipo', 'Entrada de producto', true);

  perform 1 from myappdb.suplidores
  where id = p_suplidor_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'El suplidor no existe o no pertenece a la empresa activa';
  end if;

  v_numero := private.siguiente_numero_entrada_producto_usuario();

  insert into myappdb.product_entry_headers (
    empresa_id, codigo, suplidor_id, fecha, referencia, orden_compra,
    fecha_factura_suplidor, codigo_usuario, nombre_usuario, notas
  ) values (
    v_empresa_id, v_numero, p_suplidor_id, coalesce(p_fecha, current_date),
    nullif(trim(p_referencia), ''), nullif(trim(p_orden_compra), ''),
    p_fecha_factura_suplidor, nullif(trim(p_codigo_usuario), ''),
    nullif(trim(p_nombre_usuario), ''), nullif(trim(p_notas), '')
  ) returning id into v_entrada_id;

  perform myappdb.guardar_lineas_entrada(v_entrada_id, v_empresa_id, p_lineas);
  return v_entrada_id;
end;
$$;

grant execute on function myappdb.crear_entrada_productos(integer, date, text, text, date, text, text, text, jsonb) to authenticated, service_role;
