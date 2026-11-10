-- crear_factura / actualizar_factura: el precio más bajo depende del comprobante.
--   E31 (crédito fiscal): precio_minimo.
--   E32 / proforma E332 / otros: precioespecial (si el producto no tiene, precio_minimo).
-- Tolerancia de medio centavo por redondeo.
do $mig$
declare
  v_fn text;
  v_def text;
  v_new text;
begin
  foreach v_fn in array array['myappdb.crear_factura(jsonb, jsonb)', 'myappdb.actualizar_factura(bigint, jsonb, jsonb)'] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_new := regexp_replace(v_def,
      'elsif precio_linea < precio_minimo_producto then\s*raise exception ''El precio de venta no puede ser menor que el precio mínimo configurado\.'' using errcode = ''22023'';',
      E'elsif coalesce(p_factura ->> ''ncfType'', '''') ~ ''(^|\\D)31(\\D|$)'' then\n'
      || E'      if precio_linea < precio_minimo_producto - 0.005 then\n'
      || E'        raise exception ''El precio de venta no puede ser menor que el precio mínimo configurado (crédito fiscal E31).'' using errcode = ''22023'';\n'
      || E'      end if;\n'
      || E'    elsif precio_linea < precio_minimo_producto * coalesce((select coalesce(nullif(px.precioespecial, 0), px.precio_minimo) / nullif(px.precio_minimo, 0)\n'
      || E'                                                         from myappdb.products px where px.id = producto_id_linea), 1) - 0.005 then\n'
      || E'      raise exception ''El precio de venta no puede ser menor que el precio especial configurado.'' using errcode = ''22023'';');
    if v_new = v_def then
      raise exception 'No se encontró la validación de precio mínimo en %', v_fn;
    end if;
    execute v_new;
  end loop;
end $mig$;
