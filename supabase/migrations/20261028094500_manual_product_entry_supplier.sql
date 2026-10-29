-- Una entrada puede llevar un suplidor digitado sin crear previamente su ficha.
alter table myappdb.product_entry_headers
  add column if not exists suplidor_nombre text;

alter table myappdb.product_entry_headers
  alter column suplidor_id drop not null;

update myappdb.product_entry_headers h
set suplidor_nombre = s.nombre_comercial
from myappdb.suplidores s
where h.suplidor_id = s.id
  and nullif(trim(coalesce(h.suplidor_nombre, '')), '') is null;

create or replace function myappdb.crear_entrada_productos(
  p_suplidor_id integer,
  p_suplidor_nombre text,
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
  v_suplidor_nombre text := nullif(trim(p_suplidor_nombre), '');
begin
  if v_suplidor_nombre is null then
    raise exception 'Indica el nombre del suplidor para guardar la entrada.' using errcode = '22023';
  end if;

  if p_suplidor_id is not null then
    perform 1 from myappdb.suplidores
    where id = p_suplidor_id and empresa_id = v_empresa_id;
    if not found then
      raise exception 'El suplidor no existe o no pertenece a la empresa activa';
    end if;
  end if;

  perform set_config('saltor.mov_tipo', 'Entrada de producto', true);
  v_numero := private.siguiente_numero_entrada_producto_usuario();

  insert into myappdb.product_entry_headers (
    empresa_id, codigo, suplidor_id, suplidor_nombre, fecha, referencia, orden_compra,
    fecha_factura_suplidor, codigo_usuario, nombre_usuario, notas
  ) values (
    v_empresa_id, v_numero, p_suplidor_id, v_suplidor_nombre, coalesce(p_fecha, current_date),
    nullif(trim(p_referencia), ''), nullif(trim(p_orden_compra), ''),
    p_fecha_factura_suplidor, nullif(trim(p_codigo_usuario), ''),
    nullif(trim(p_nombre_usuario), ''), nullif(trim(p_notas), '')
  ) returning id into v_entrada_id;

  perform myappdb.guardar_lineas_entrada(v_entrada_id, v_empresa_id, p_lineas);
  return v_entrada_id;
end;
$$;

create or replace function myappdb.actualizar_entrada_productos(
  p_entrada_id bigint,
  p_suplidor_id integer,
  p_suplidor_nombre text,
  p_fecha date,
  p_referencia text,
  p_orden_compra text,
  p_fecha_factura_suplidor date,
  p_codigo_usuario text,
  p_nombre_usuario text,
  p_notas text,
  p_lineas jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_empresa_id integer := private.current_empresa_id();
  v_linea record;
  v_suplidor_nombre text := nullif(trim(p_suplidor_nombre), '');
begin
  if v_suplidor_nombre is null then
    raise exception 'Indica el nombre del suplidor para guardar la entrada.' using errcode = '22023';
  end if;
  perform set_config('saltor.mov_tipo', 'Edición de entrada', true);
  perform set_config('saltor.mov_ref', p_entrada_id::text, true);

  perform 1 from myappdb.product_entry_headers where id = p_entrada_id and empresa_id = v_empresa_id for update;
  if not found then raise exception 'La entrada no existe o no pertenece a la empresa activa'; end if;
  if p_suplidor_id is not null then
    perform 1 from myappdb.suplidores where id = p_suplidor_id and empresa_id = v_empresa_id;
    if not found then raise exception 'El suplidor no existe o no pertenece a la empresa activa'; end if;
  end if;

  for v_linea in select producto_id, cantidad from myappdb.product_entries where entrada_id = p_entrada_id loop
    update myappdb.products set existencia = greatest(0, coalesce(existencia, 0) - v_linea.cantidad)
    where id = v_linea.producto_id and empresa_id = v_empresa_id;
  end loop;
  delete from myappdb.product_entries where entrada_id = p_entrada_id;

  update myappdb.product_entry_headers
  set suplidor_id = p_suplidor_id, suplidor_nombre = v_suplidor_nombre,
      fecha = coalesce(p_fecha, current_date), referencia = nullif(trim(p_referencia), ''),
      orden_compra = nullif(trim(p_orden_compra), ''), fecha_factura_suplidor = p_fecha_factura_suplidor,
      codigo_usuario = nullif(trim(p_codigo_usuario), ''), nombre_usuario = nullif(trim(p_nombre_usuario), ''),
      notas = nullif(trim(p_notas), '')
  where id = p_entrada_id;

  perform myappdb.guardar_lineas_entrada(p_entrada_id, v_empresa_id, p_lineas);
end;
$$;

grant execute on function myappdb.crear_entrada_productos(integer, text, date, text, text, date, text, text, text, jsonb) to authenticated, service_role;
grant execute on function myappdb.actualizar_entrada_productos(bigint, integer, text, date, text, text, date, text, text, text, jsonb) to authenticated, service_role;
