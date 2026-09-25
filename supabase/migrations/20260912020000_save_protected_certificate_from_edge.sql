begin;

create or replace function myappdb.guardar_certificado_firma_digital_servidor(
  p_empresa_id integer,
  p_nombre_archivo text,
  p_tipo_archivo text,
  p_archivo_base64 text,
  p_clave_cifrada text,
  p_titular text,
  p_emisor text,
  p_numero_serie text,
  p_valido_desde timestamptz,
  p_valido_hasta timestamptz
)
returns table (nombre_archivo text, titular text, emisor text, numero_serie text, valido_desde timestamptz, valido_hasta timestamptz, cargado_en timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_empresa_id is null or nullif(trim(p_archivo_base64), '') is null or nullif(trim(p_clave_cifrada), '') is null then
    raise exception 'Faltan datos del certificado.' using errcode = '22023';
  end if;

  insert into myappdb.certificados_firma_digital (
    empresa_id, nombre_archivo, tipo_archivo, archivo, clave_cifrada, titular, emisor,
    numero_serie, valido_desde, valido_hasta, cargado_en, actualizado_en
  ) values (
    p_empresa_id, trim(p_nombre_archivo), coalesce(nullif(trim(p_tipo_archivo), ''), 'application/x-pkcs12'),
    decode(p_archivo_base64, 'base64'), p_clave_cifrada, trim(p_titular), trim(p_emisor),
    trim(p_numero_serie), p_valido_desde, p_valido_hasta, now(), now()
  )
  on conflict (empresa_id) do update set
    nombre_archivo = excluded.nombre_archivo, tipo_archivo = excluded.tipo_archivo,
    archivo = excluded.archivo, clave_cifrada = excluded.clave_cifrada,
    titular = excluded.titular, emisor = excluded.emisor, numero_serie = excluded.numero_serie,
    valido_desde = excluded.valido_desde, valido_hasta = excluded.valido_hasta,
    cargado_en = now(), actualizado_en = now()
  returning certificados_firma_digital.nombre_archivo, certificados_firma_digital.titular,
    certificados_firma_digital.emisor, certificados_firma_digital.numero_serie,
    certificados_firma_digital.valido_desde, certificados_firma_digital.valido_hasta,
    certificados_firma_digital.cargado_en
  into nombre_archivo, titular, emisor, numero_serie, valido_desde, valido_hasta, cargado_en;
  return next;
end;
$$;

revoke all on function myappdb.guardar_certificado_firma_digital_servidor(integer, text, text, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function myappdb.guardar_certificado_firma_digital_servidor(integer, text, text, text, text, text, text, text, timestamptz, timestamptz) to service_role;

commit;
