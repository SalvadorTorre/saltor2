begin;

alter table myappdb.facturas drop constraint if exists facturas_estado_check;
alter table myappdb.facturas add constraint facturas_estado_check
  check (estado in ('Emitida', 'FACTURA', 'PROFORMA', 'CONDUCE', 'Anulada', 'Pendiente de cobro'));

create or replace function myappdb.clasificar_estado_factura_por_tipo()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Estos estados son decisiones operativas posteriores y no deben ser reemplazados
  -- por la clasificación inicial del tipo de comprobante.
  if new.estado in ('Anulada', 'Pendiente de cobro', 'CONDUCE') then
    return new;
  end if;

  if regexp_replace(coalesce(new.tipo_ncf, ''), '[^0-9]', '', 'g') = '332' then
    new.estado := 'PROFORMA';
  else
    new.estado := 'FACTURA';
  end if;
  return new;
end;
$function$;

create or replace function myappdb.convertir_proformas_a_conduce(
  p_desde date,
  p_hasta date,
  p_sucursal_id bigint,
  p_monto numeric
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
  v_pendientes integer := 0;
  v_monto_pendiente numeric := 0;
begin
  if v_empresa is null then
    raise exception 'No hay una empresa activa.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Indica un período válido.';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'Indica un monto mayor que cero.';
  end if;

  -- Nunca se divide una factura. Se toman las proformas más antiguas sin superar el monto solicitado.
  for v_factura in
    select f.id, f.total
    from myappdb.facturas f
    where f.idempres = v_empresa
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
    raise exception 'El monto indicado no alcanza el valor de una proforma completa del período.';
  end if;

  update myappdb.facturas f
  set estado = 'CONDUCE', actualizado_en = clock_timestamp()
  where f.id = any(v_ids) and f.idempres = v_empresa and f.estado = 'PROFORMA';

  -- Una firma proforma no es un envío DGII. Se desactiva antes de reclasificar,
  -- para que E32 obtenga una nueva reserva autorizada cuando entre a la cola.
  update myappdb.ecf_operaciones o
  set activa = false, actualizado_en = clock_timestamp()
  where o.tipo = 'FACTURA'
    and o.empresa_id = v_empresa
    and (o.documento_id = any(v_ids) or o.documento_id in (
      select f.id from myappdb.facturas f
      where f.idempres = v_empresa and f.estado = 'PROFORMA'
        and f.fecha_factura between p_desde and p_hasta
        and (p_sucursal_id is null or f.idsucursal = p_sucursal_id)
    ));

  with pendientes as (
    update myappdb.facturas f
    set tipo_ncf = 'E32', ncf = null, estado = 'FACTURA',
      ecf_operation_id = null, ecf_queue_status = 'PENDIENTE_ENVIO', ecf_xml_firmado = null,
      dgii_estado = 'Pendiente de envío', estado_envio_dgii = 'Pendiente de envío',
      dgii_track_id = null, dgii_codigo = null, dgii_codigo_respuesta = null,
      dgii_mensaje_respuesta = 'Pendiente de envío a DGII.', dgii_error_message = null,
      dgii_respuesta = null, dgii_response_json = null, dgii_response_raw = null, dgii_mensajes = null,
      "codSeguridad" = null, qr_link = null, fec_firma = null, fechanf = null,
      dgii_updated_at = clock_timestamp(), actualizado_en = clock_timestamp()
    where f.idempres = v_empresa and f.estado = 'PROFORMA'
      and f.fecha_factura between p_desde and p_hasta
      and (p_sucursal_id is null or f.idsucursal = p_sucursal_id)
    returning f.total
  )
  select count(*), coalesce(sum(total), 0) into v_pendientes, v_monto_pendiente from pendientes;

  return jsonb_build_object('cantidad', cardinality(v_ids), 'monto', v_total, 'facturas_pendientes', v_pendientes, 'monto_pendiente', v_monto_pendiente);
end;
$function$;

revoke all on function myappdb.convertir_proformas_a_conduce(date, date, bigint, numeric) from public, anon;
grant execute on function myappdb.convertir_proformas_a_conduce(date, date, bigint, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
