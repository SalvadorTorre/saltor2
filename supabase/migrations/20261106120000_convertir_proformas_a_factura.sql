-- Facturas pendientes → Proformas, buscando por número: pasa SOLO las proformas indicadas a factura E32
-- en cola para la DGII (no convierte nada en conduce ni toca otras facturas).
create or replace function myappdb.convertir_proformas_a_factura(p_factura_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_empresa integer := private.current_empresa_id();
  v_ids bigint[];
  v_total numeric;
begin
  if v_empresa is null then raise exception 'No hay una empresa activa.'; end if;
  if coalesce(array_length(p_factura_ids, 1), 0) = 0 then raise exception 'Selecciona al menos una proforma.'; end if;

  select array_agg(f.id), coalesce(sum(f.total), 0) into v_ids, v_total
  from myappdb.facturas f
  where f.idempres = v_empresa and f.id = any(p_factura_ids) and f.estado = 'PROFORMA';

  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'La factura indicada ya no está como proforma.'; end if;

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
  where f.id = any(v_ids) and f.idempres = v_empresa and f.estado = 'PROFORMA';

  return jsonb_build_object('cantidad', cardinality(v_ids), 'monto', v_total);
end;
$function$;

revoke all on function myappdb.convertir_proformas_a_factura(bigint[]) from public, anon;
grant execute on function myappdb.convertir_proformas_a_factura(bigint[]) to authenticated;
