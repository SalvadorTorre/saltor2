begin;
-- Una reserva y un intento de transmisión por documento, persistidos antes del HTTP.
create table if not exists myappdb.ecf_operaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check(tipo in ('FACTURA','NOTA_CREDITO','GASTO_MENOR')),
  documento_id bigint not null,
  empresa_id integer not null references myappdb.empresas(id),
  sucursal_id integer not null,
  activa boolean not null default true,
  modo text not null check(modo in ('COLA','FIRMA')),
  encf text not null,
  fecha_vencimiento date,
  ambiente text not null check(ambiente in ('TEST','PROD')),
  url_base text not null,
  status text not null default 'PREPARANDO',
  operation_id text,
  resultado jsonb not null default '{}',
  solicitud jsonb,
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  unique(empresa_id, ambiente, modo, encf)
);
create unique index if not exists ecf_operacion_documento_activa on myappdb.ecf_operaciones(tipo,documento_id) where activa;
create index if not exists ecf_operacion_pendiente on myappdb.ecf_operaciones(empresa_id,sucursal_id,status) where activa;
alter table myappdb.ecf_operaciones enable row level security;
revoke all on myappdb.ecf_operaciones from public,anon,authenticated;
grant select on myappdb.ecf_operaciones to authenticated;
grant all on myappdb.ecf_operaciones to service_role;
drop policy if exists ecf_operacion_tenant on myappdb.ecf_operaciones;
create policy ecf_operacion_tenant on myappdb.ecf_operaciones for select to authenticated using (
  exists(select 1 from myappdb.usuarios u where u.auth_usuario_id=auth.uid() and u.estado='Activo'
    and u.empresa_id=ecf_operaciones.empresa_id and u.sucursal_id=ecf_operaciones.sucursal_id)
);
alter table myappdb.facturas add column if not exists ecf_operation_id text, add column if not exists ecf_queue_status text, add column if not exists ecf_xml_firmado text;
alter table myappdb.notas_credito add column if not exists ecf_operation_id text, add column if not exists ecf_queue_status text, add column if not exists ecf_xml_firmado text;
alter table myappdb.gastos_menores add column if not exists ecf_operation_id text, add column if not exists ecf_queue_status text, add column if not exists ecf_xml_firmado text;
alter table myappdb.facturas drop constraint if exists facturas_dgii_estado_check;
alter table myappdb.facturas add constraint facturas_dgii_estado_check check(dgii_estado in
  ('No enviado','Pendiente de configuración','Enviado','Aceptado','Aceptado condicional','Rechazado','Error','Preparando envío','En cola','Enviando DGII','En proceso DGII','Envío por confirmar','Firmada'));
alter table myappdb.notas_credito drop constraint if exists notas_credito_estado_dgii_check;
alter table myappdb.notas_credito add constraint notas_credito_estado_dgii_check check(estado_dgii in
  ('Sin enviar','Enviado','Aceptado','Aceptado condicional','Rechazado','Error','Preparando envío','En cola','Enviando DGII','En proceso DGII','Envío por confirmar'));
alter table myappdb.gastos_menores drop constraint if exists gastos_menores_estado_check;
alter table myappdb.gastos_menores add constraint gastos_menores_estado_check check(estado_dgii in
  ('Borrador','Enviado','Aceptado','Aceptado condicional','Rechazado','Error','Preparando envío','En cola','Enviando DGII','En proceso DGII','Envío por confirmar'));
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
    -- Una proforma que falló antes de firmarse conserva su E32 reservado.
    -- Reintentarla con el mismo número evita saltos y no implica un envío DGII.
    if v_op.status='ERROR' and v_proforma then
      update myappdb.ecf_operaciones set status='PREPARANDO',operation_id=null,resultado='{}'::jsonb,solicitud=null,actualizado_en=clock_timestamp()
        where id=v_op.id returning * into v_op;
      execute format('update myappdb.%I set ecf_queue_status=''PREPARANDO'',ecf_operation_id=null,ecf_xml_firmado=null,
        dgii_estado=''Preparando envío'',estado_envio_dgii=''Preparando envío'',dgii_mensaje_respuesta=null,dgii_error_message=null,
        dgii_track_id=null,dgii_codigo=null,dgii_codigo_respuesta=null,dgii_response_json=null,dgii_response_raw=null,dgii_mensajes=null where id=$1',v_tabla)
        using p_documento_id;
      return to_jsonb(v_op)||jsonb_build_object('claimed',true);
    end if;
    -- Solo el restablecimiento explícito de un documento rechazado/error permite otra reserva.
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
-- Serializa las respuestas: una consulta tardía nunca revierte un resultado final.
create or replace function myappdb.guardar_resultado_ecf(p_id uuid,p_status text,p_resultado jsonb,p_solicitud jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_op myappdb.ecf_operaciones; v_tabla text; v_r jsonb; v_state text;
begin
  select * into strict v_op from myappdb.ecf_operaciones where id=p_id for update;
  if v_op.status in ('ACEPTADO','RECHAZADO','ERROR','FIRMADA') then return to_jsonb(v_op); end if;
  v_r := v_op.resultado || jsonb_strip_nulls(p_resultado);
  v_state := coalesce(v_r->>'dgii_estado','Preparando envío');
  update myappdb.ecf_operaciones set status=p_status,operation_id=coalesce(nullif(v_r->>'ecf_operation_id',''),operation_id),
    resultado=v_r,solicitud=coalesce(p_solicitud,solicitud),actualizado_en=clock_timestamp() where id=p_id returning * into v_op;
  v_tabla := case v_op.tipo when 'FACTURA' then 'facturas' when 'NOTA_CREDITO' then 'notas_credito' else 'gastos_menores' end;
  execute format('update myappdb.%I set ecf_operation_id=$1,ecf_queue_status=$2,ecf_xml_firmado=coalesce($3,ecf_xml_firmado),
    estado_dgii=$4,dgii_track_id=coalesce($5,dgii_track_id),dgii_codigo=coalesce($6,dgii_codigo),
    dgii_mensaje_respuesta=$7,qr_link=coalesce($8,qr_link),fec_firma=coalesce($9::timestamptz,fec_firma),
    dgii_request_json=coalesce($10,dgii_request_json),dgii_response_json=$11,dgii_response_raw=$12,
    dgii_mensajes=coalesce($13,dgii_mensajes),dgii_error_message=$14,dgii_updated_at=clock_timestamp(),
    ecf_ambiente=$15,dgii_enviado_en=coalesce(dgii_enviado_en,clock_timestamp()) where id=$16',v_tabla)
    using v_op.operation_id,p_status,v_r->>'ecf_xml_firmado',v_state,v_r->>'dgii_track_id',v_r->>'dgii_codigo_respuesta',
      v_r->>'dgii_mensaje_respuesta',v_r->>'qr_link',v_r->>'fec_firma',p_solicitud,v_r->'dgii_response_json',v_r->>'dgii_response_raw',
      v_r->'dgii_mensajes',v_r->>'dgii_error_message',v_op.ambiente,v_op.documento_id;
  if p_status='ENVIANDO_SERVICIO' then
    execute format('update myappdb.%I set dgii_intentos=coalesce(dgii_intentos,0)+1 where id=$1',v_tabla) using v_op.documento_id;
  end if;
  if v_op.tipo='FACTURA' then
    update myappdb.facturas set dgii_estado=v_state,estado_envio_dgii=v_state,
      dgii_codigo_respuesta=coalesce(v_r->>'dgii_codigo_respuesta',dgii_codigo_respuesta),
      "codSeguridad"=coalesce(v_r->>'codSeguridad',"codSeguridad"),dgii_respuesta=v_r->'dgii_response_json'
      where id=v_op.documento_id;
  else
    execute format('update myappdb.%I set dgii_codigo_seguridad=coalesce($1,dgii_codigo_seguridad),fecha_vencimiento_secuencia=$2 where id=$3',v_tabla)
      using v_r->>'codSeguridad',v_op.fecha_vencimiento,v_op.documento_id;
    if v_op.tipo='NOTA_CREDITO' then update myappdb.notas_credito set estado_envio_dgii=v_state where id=v_op.documento_id; end if;
  end if;
  return to_jsonb(v_op);
end;
$$;
revoke all on function myappdb.reservar_operacion_ecf(text,bigint,integer,integer,text,text,text) from public,anon,authenticated;
revoke all on function myappdb.guardar_resultado_ecf(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function myappdb.reservar_operacion_ecf(text,bigint,integer,integer,text,text,text) to service_role;
grant execute on function myappdb.guardar_resultado_ecf(uuid,text,jsonb,jsonb) to service_role;
alter table myappdb.ecf_configuraciones alter column url_base set default 'https://ecf-propio.tail2c2b0a.ts.net/';
update myappdb.ecf_configuraciones set url_base='https://ecf-propio.tail2c2b0a.ts.net/'
  where rtrim(url_base,'/') in ('https://ecf-propio.tail2c2b0a.ts.net/ecf','https://ecf-propio.tail2c2b0a.ts.net/api');
notify pgrst,'reload schema';
commit;
