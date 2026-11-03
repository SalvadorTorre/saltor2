-- Entrada de productos: suma la existencia pero NO cambia el costo del producto.
-- El costo de la entrada queda guardado solo en la línea de la entrada (product_entries.costo_unitario).
create or replace function myappdb.guardar_lineas_entrada(p_entrada_id bigint, p_empresa_id integer, p_lineas jsonb)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  v_linea jsonb;
  v_producto_id integer;
  v_cantidad numeric;
  v_costo numeric;
begin
  perform set_config('saltor.mov_ref', p_entrada_id::text, true);

  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Debe indicar al menos un producto para la entrada';
  end if;

  for v_linea in select value from jsonb_array_elements(p_lineas)
  loop
    v_producto_id := nullif(v_linea ->> 'producto_id', '')::integer;
    v_cantidad := nullif(v_linea ->> 'cantidad', '')::numeric;
    v_costo := nullif(v_linea ->> 'costo_unitario', '')::numeric;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 or v_costo is null or v_costo < 0 then
      raise exception 'Las líneas de la entrada no son válidas';
    end if;

    perform 1 from myappdb.products
    where id = v_producto_id and empresa_id = p_empresa_id
    for update;
    if not found then
      raise exception 'El producto % no pertenece a la empresa activa', v_producto_id;
    end if;

    insert into myappdb.product_entries (empresa_id, entrada_id, producto_id, suplidor_id, fecha, cantidad, costo_unitario, referencia, notas)
    select p_empresa_id, p_entrada_id, v_producto_id, h.suplidor_id, h.fecha, v_cantidad, v_costo, h.referencia, h.notas
    from myappdb.product_entry_headers h
    where h.id = p_entrada_id;

    update myappdb.products
    set existencia = coalesce(existencia, 0) + v_cantidad
    where id = v_producto_id and empresa_id = p_empresa_id;
  end loop;
end;
$function$;
