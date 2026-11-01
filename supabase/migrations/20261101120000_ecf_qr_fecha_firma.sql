-- ===========================================================================
-- Código QR del e-CF con el formato de la DGII.
-- El servicio de firma devuelve el enlace sin FechaFirma, y la consulta de la
-- DGII no encuentra el comprobante aceptado. Aquí se rehace el enlace:
--   * e-CF: https://ecf.dgii.gov.do/<amb>/ConsultaTimbre?RncEmisor&RncComprador&ENCF
--           &FechaEmision&MontoTotal&FechaFirma&CodigoSeguridad
--   * Consumo E32 menor de RD$250,000: https://fc.dgii.gov.do/<amb>/ConsultaTimbreFC
--           ?RncEmisor&ENCF&MontoTotal&CodigoSeguridad
-- FechaFirma = FechaHoraFirma del XML firmado (dd-MM-yyyy HH:mm:ss).
-- ===========================================================================

create or replace function private.ecf_qr_link_dgii(p_link text, p_xml text, p_fec_firma timestamptz)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_query text; v_env text; v_param text; v_kv text[]; p jsonb := '{}'::jsonb;
  v_firma text; v_monto numeric; v_encf text;
  enc constant text[] := array['%', ' ', '+', '/', '=', '&', ':'];
  rep constant text[] := array['%25', '%20', '%2B', '%2F', '%3D', '%26', '%3A'];
begin
  if p_link is null or p_link !~* '^https://(ecf|fc)\.dgii\.gov\.do/[^/]+/consultatimbre' then return p_link; end if;

  v_env := substring(p_link from '^https://[^/]+/([^/]+)/');
  v_query := split_part(p_link, '?', 2);
  foreach v_param in array string_to_array(v_query, '&') loop
    v_kv := string_to_array(v_param, '=');
    if array_length(v_kv, 1) >= 2 then
      p := p || jsonb_build_object(lower(v_kv[1]), replace(replace(replace(replace(replace(array_to_string(v_kv[2:], '='), '%20', ' '), '%3A', ':'), '%2B', '+'), '%2F', '/'), '%3D', '='));
    end if;
  end loop;

  v_encf := upper(p ->> 'encf');
  if v_encf is null or p ->> 'codigoseguridad' is null then return p_link; end if;
  v_monto := nullif(p ->> 'montototal', '')::numeric;

  -- Factura de consumo menor de RD$250,000: consulta FC (sin comprador ni fechas).
  if v_encf like 'E32%' and coalesce(v_monto, 0) < 250000 then
    return 'https://fc.dgii.gov.do/' || v_env || '/ConsultaTimbreFC?RncEmisor=' || (p ->> 'rncemisor')
      || '&ENCF=' || v_encf || '&MontoTotal=' || (p ->> 'montototal')
      || '&CodigoSeguridad=' || (select string_agg(c, '') from (select case when ch = any (enc) then rep[array_position(enc, ch)] else ch end c
                                                                   from regexp_split_to_table(p ->> 'codigoseguridad', '') with ordinality t(ch, o) order by o) x);
  end if;

  v_firma := substring(coalesce(p_xml, '') from '<FechaHoraFirma>([^<]+)</FechaHoraFirma>');
  if v_firma is null and p_fec_firma is not null then
    v_firma := to_char(p_fec_firma at time zone 'America/Santo_Domingo', 'DD-MM-YYYY HH24:MI:SS');
  end if;
  if v_firma is null then return p_link; end if;

  return 'https://ecf.dgii.gov.do/' || v_env || '/ConsultaTimbre?RncEmisor=' || (p ->> 'rncemisor')
    || case when coalesce(p ->> 'rnccomprador', '') <> '' and v_encf !~ '^E4[37]' then '&RncComprador=' || (p ->> 'rnccomprador') else '' end
    || '&ENCF=' || v_encf
    || '&FechaEmision=' || (p ->> 'fechaemision')
    || '&MontoTotal=' || (p ->> 'montototal')
    || '&FechaFirma=' || replace(replace(v_firma, ' ', '%20'), ':', '%3A')
    || '&CodigoSeguridad=' || (select string_agg(c, '') from (select case when ch = any (enc) then rep[array_position(enc, ch)] else ch end c
                                                                 from regexp_split_to_table(p ->> 'codigoseguridad', '') with ordinality t(ch, o) order by o) x);
end;
$$;
revoke all on function private.ecf_qr_link_dgii(text, text, timestamptz) from public, anon;
grant execute on function private.ecf_qr_link_dgii(text, text, timestamptz) to authenticated, service_role;

create or replace function private.tg_ecf_qr_link_dgii()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.qr_link is not null then
    new.qr_link := private.ecf_qr_link_dgii(new.qr_link, new.ecf_xml_firmado, new.fec_firma);
  end if;
  return new;
end;
$$;
revoke all on function private.tg_ecf_qr_link_dgii() from public, anon, authenticated;

drop trigger if exists facturas_qr_link_dgii on myappdb.facturas;
create trigger facturas_qr_link_dgii before insert or update of qr_link, ecf_xml_firmado, fec_firma on myappdb.facturas
  for each row execute function private.tg_ecf_qr_link_dgii();
drop trigger if exists notas_credito_qr_link_dgii on myappdb.notas_credito;
create trigger notas_credito_qr_link_dgii before insert or update of qr_link, ecf_xml_firmado, fec_firma on myappdb.notas_credito
  for each row execute function private.tg_ecf_qr_link_dgii();
drop trigger if exists gastos_menores_qr_link_dgii on myappdb.gastos_menores;
create trigger gastos_menores_qr_link_dgii before insert or update of qr_link, ecf_xml_firmado, fec_firma on myappdb.gastos_menores
  for each row execute function private.tg_ecf_qr_link_dgii();

-- Corrige el QR de los comprobantes ya firmados.
update myappdb.facturas set qr_link = qr_link where qr_link ~* '^https://(ecf|fc)\.dgii\.gov\.do/[^/]+/consultatimbre';
update myappdb.notas_credito set qr_link = qr_link where qr_link ~* '^https://(ecf|fc)\.dgii\.gov\.do/[^/]+/consultatimbre';
update myappdb.gastos_menores set qr_link = qr_link where qr_link ~* '^https://(ecf|fc)\.dgii\.gov\.do/[^/]+/consultatimbre';
