begin;

-- A signing error (for example, an unavailable intermediary route) can happen
-- after an E32 proforma number has been reserved. Reuse that number when the
-- user explicitly retries, because a proforma never reaches DGII.
create or replace function myappdb.reservar_operacion_ecf(p_tipo text,p_documento_id bigint,p_empresa_id integer,p_sucursal_id integer,p_tipo_ecf text,p_ambiente text,p_url_base text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_tabla text; v_columna text; v_doc jsonb; v_op myappdb.ecf_operaciones;
  v_seq record; v_encf text; v_vencimiento date; v_proforma boolean; v_numero bigint;
begin
  v_tabla := case p_tipo when 'FACTURA' then 'facturas' when 'NOTA_CREDITO' then 'notas_credito' when 'GASTO_MENOR' then 'gastos_menores' end;
  v_columna := case p_tipo when 'FACTURA' then 'ncf' when 'NOTA_CREDITO' then 'encf_nota' else 'encf' end;
  if v_tabla is null then raise exception 'Tipo de documento inválido.'; end if;
  execute format('select to_jsonb(d) from myappdb.%I d where id=$1 and idempres=$2 and idsucursal=$3 for update',v_tabla)
    into v_doc using p_documento_id,p_empresa_id,p_sucursal_id;
  if v_doc is null then raise exception 'Documento fuera de la empresa o sucursal.'; end if;
  if coalesce(v_doc->>'dgii_estado',v_doc->>'estado_dgii','') in ('Aceptado','Aceptado condicional','Firmada') or v_doc->>'estado'='Anulada' then
    raise exception 'El documento no admite otro envío.';
  end if;

  v_proforma := p_tipo='FACTURA' and regexp_replace(coalesce(v_doc->>'tipo_ncf',''),'[^0-9]','','g')='332';
  select * into v_op from myappdb.ecf_operaciones where tipo=p_tipo and documento_id=p_documento_id and activa for update;
  if found then
    if v_op.status='ERROR' and v_proforma then
      update myappdb.ecf_operaciones set status='PREPARANDO',operation_id=null,resultado='{}'::jsonb,solicitud=null,actualizado_en=clock_timestamp()
        where id=v_op.id returning * into v_op;
      execute format('update myappdb.%I set ecf_queue_status=''PREPARANDO'',ecf_operation_id=null,ecf_xml_firmado=null,
        dgii_estado=''Preparando envío'',estado_envio_dgii=''Preparando envío'',dgii_mensaje_respuesta=null,dgii_error_message=null,
        dgii_track_id=null,dgii_codigo=null,dgii_codigo_respuesta=null,dgii_response_json=null,dgii_response_raw=null,dgii_mensajes=null where id=$1',v_tabla)
        using p_documento_id;
      return to_jsonb(v_op)||jsonb_build_object('claimed',true);
    end if;
    if v_op.status in ('RECHAZADO','ERROR') and nullif(v_doc->>v_columna,'') is null then
      update myappdb.ecf_operaciones set activa=false where id=v_op.id;
    else
      return to_jsonb(v_op)||jsonb_build_object('claimed',false);
    end if;
  end if;

  if v_op.id is null and coalesce(v_doc->>'dgii_estado',v_doc->>'estado_dgii','')='Enviado' then
    raise exception 'El documento tiene un envío anterior. Verifica su estado antes de crear una operación en cola.';
  end if;
  if v_proforma then
    update myappdb.empresas_proforma set ultimo_numero=ultimo_numero+1,actualizado_en=clock_timestamp()
      where empresa_id=p_empresa_id and activa and ultimo_numero<99999999999 returning ultimo_numero into v_numero;
    if not found then raise exception 'La proforma no está activa o agotó su contador.'; end if;
    v_encf := 'E32'||case when length(v_numero::text)<10 then lpad(v_numero::text,10,'0') else v_numero::text end;
    insert into myappdb.empresas_proforma_historial(empresa_id,accion,numero_anterior,numero_actual,activa)
      values(p_empresa_id,'Proforma reservada',v_numero-1,v_numero,true);
  else
    if p_tipo_ecf !~ '^(31|32|33|34|41|43|44|45|46|47)$' then raise exception 'Tipo e-CF inválido.'; end if;
    select * into v_seq from myappdb.siguiente_encf_desde_secuencia_ncf_con_vencimiento(p_empresa_id,p_tipo_ecf);
    v_encf := v_seq.encf; v_vencimiento := v_seq.fecha_vencimiento;
    if v_encf is null or v_vencimiento is null then raise exception 'No existe una secuencia autorizada válida.'; end if;
  end if;

  insert into myappdb.ecf_operaciones(tipo,documento_id,empresa_id,sucursal_id,modo,encf,fecha_vencimiento,ambiente,url_base)
    values(p_tipo,p_documento_id,p_empresa_id,p_sucursal_id,case when v_proforma then 'FIRMA' else 'COLA' end,v_encf,v_vencimiento,p_ambiente,p_url_base) returning * into v_op;
  execute format('update myappdb.%I set %I=$1,ecf_queue_status=''PREPARANDO'',ecf_operation_id=null,ecf_xml_firmado=null where id=$2',v_tabla,v_columna)
    using v_encf,p_documento_id;
  return to_jsonb(v_op)||jsonb_build_object('claimed',true);
end;
$$;

grant execute on function myappdb.reservar_operacion_ecf(text,bigint,integer,integer,text,text,text) to service_role;
notify pgrst,'reload schema';

commit;
