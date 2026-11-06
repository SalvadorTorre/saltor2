-- Facturas pendientes → Ventas por período: conduces (estado CONDUCE) → factura E32 en cola DGII.
create or replace function myappdb.convertir_conduces_a_factura(
  p_desde date, p_hasta date, p_sucursal_id bigint, p_monto numeric, p_factura_ids bigint[], p_solo_seleccionadas boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_empresa integer := private.current_empresa_id();
  v_solo boolean := coalesce(p_solo_seleccionadas, false);
  v_factura record;
  v_ids bigint[] := '{}';
  v_total numeric := 0;
begin
  if v_empresa is null then raise exception 'No hay una empresa activa.'; end if;
  if not v_solo and (p_desde is null or p_hasta is null or p_hasta < p_desde) then raise exception 'Indica un período válido.'; end if;
  if coalesce(array_length(p_factura_ids, 1), 0) = 0 then raise exception 'Selecciona al menos un conduce.'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'Indica un monto mayor que cero.'; end if;

  for v_factura in
    select f.id, f.total from myappdb.facturas f
    where f.idempres = v_empresa and f.id = any(p_factura_ids) and f.estado = 'CONDUCE'
      and (v_solo or f.fecha_factura between p_desde and p_hasta)
      and (p_sucursal_id is null or f.idsucursal = p_sucursal_id)
    order by f.fecha_factura, f.id
  loop
    exit when v_total + coalesce(v_factura.total, 0) > p_monto + 0.005;
    v_ids := array_append(v_ids, v_factura.id);
    v_total := v_total + coalesce(v_factura.total, 0);
  end loop;

  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'El monto indicado no alcanza el valor de un conduce seleccionado.'; end if;

  update myappdb.ecf_operaciones o set activa = false, actualizado_en = clock_timestamp()
  where o.tipo = 'FACTURA' and o.empresa_id = v_empresa and o.documento_id = any(v_ids);

  update myappdb.facturas f
  set tipo_ncf = 'E32', ncf = null, estado = 'FACTURA',
    ecf_operation_id = null, ecf_queue_status = 'PENDIENTE_ENVIO', ecf_xml_firmado = null,
    dgii_estado = 'En cola', estado_envio_dgii = 'En cola',
    dgii_track_id = null, dgii_codigo = null, dgii_codigo_respuesta = null,
    dgii_mensaje_respuesta = 'Pendiente de envío a DGII.', dgii_error_message = null,
    dgii_respuesta = null, dgii_response_json = null, dgii_response_raw = null, dgii_mensajes = null,
    "codSeguridad" = null, qr_link = null, fec_firma = null, fechanf = null,
    dgii_updated_at = clock_timestamp(), actualizado_en = clock_timestamp()
  where f.id = any(v_ids) and f.idempres = v_empresa and f.estado = 'CONDUCE';

  return jsonb_build_object('cantidad', cardinality(v_ids), 'monto', v_total);
end;
$function$;

revoke all on function myappdb.convertir_conduces_a_factura(date, date, bigint, numeric, bigint[], boolean) from public, anon;
grant execute on function myappdb.convertir_conduces_a_factura(date, date, bigint, numeric, bigint[], boolean) to authenticated;
