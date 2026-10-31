drop function if exists myappdb.convertir_proformas_a_conduce(date, date, bigint, numeric);

create function myappdb.convertir_proformas_a_conduce(
  p_desde date,
  p_hasta date,
  p_sucursal_id bigint,
  p_monto numeric,
  p_factura_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_empresa integer := private.current_empresa_id();
  v_factura record;
  v_ids bigint[] := '{}';
  v_total numeric := 0;
begin
  if v_empresa is null then raise exception 'No hay una empresa activa.'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Indica un período válido.'; end if;
  if coalesce(array_length(p_factura_ids, 1), 0) = 0 then raise exception 'Selecciona al menos una proforma.'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'Indica un monto mayor que cero.'; end if;

  for v_factura in
    select f.id, f.total
    from myappdb.facturas f
    where f.idempres = v_empresa
      and f.id = any(p_factura_ids)
      and f.estado = 'PROFORMA'
      and f.fecha_factura between p_desde and p_hasta
      and (p_sucursal_id is null or f.idsucursal = p_sucursal_id)
    order by f.fecha_factura, f.id
  loop
    exit when v_total + coalesce(v_factura.total, 0) > p_monto + 0.005;
    v_ids := array_append(v_ids, v_factura.id);
    v_total := v_total + coalesce(v_factura.total, 0);
  end loop;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'El monto indicado no alcanza el valor de una proforma seleccionada.';
  end if;

  update myappdb.facturas f
  set estado = 'CONDUCE', actualizado_en = clock_timestamp()
  where f.id = any(v_ids) and f.idempres = v_empresa and f.estado = 'PROFORMA';

  update myappdb.ecf_operaciones o
  set activa = false, actualizado_en = clock_timestamp()
  where o.tipo = 'FACTURA' and o.empresa_id = v_empresa and o.documento_id = any(v_ids);

  return jsonb_build_object(
    'cantidad', cardinality(v_ids),
    'monto', v_total,
    'facturas_pendientes', 0,
    'monto_pendiente', 0
  );
end;
$function$;

revoke all on function myappdb.convertir_proformas_a_conduce(date, date, bigint, numeric, bigint[]) from public, anon;
grant execute on function myappdb.convertir_proformas_a_conduce(date, date, bigint, numeric, bigint[]) to authenticated;

notify pgrst, 'reload schema';
