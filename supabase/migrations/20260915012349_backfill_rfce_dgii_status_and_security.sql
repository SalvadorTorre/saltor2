begin;

with resultados as (
  select
    id,
    coalesce(
      dgii_response_json #>> '{data,data,results,0,responseRFCE,dgiiResponse,estado}',
      dgii_response_json #>> '{data,data,results,0,ecfDgii,estado}',
      dgii_response_json #>> '{data,data,results,0,rfceDgii,estado}',
      dgii_response_json #>> '{data,results,0,responseRFCE,dgiiResponse,estado}',
      dgii_response_json #>> '{data,results,0,ecfDgii,estado}',
      dgii_response_json #>> '{data,results,0,rfceDgii,estado}'
    ) as estado,
    coalesce(
      dgii_response_json #>> '{data,data,results,0,responseRFCE,codigoSeguridad}',
      dgii_response_json #>> '{data,data,results,0,rfceInfo,codigoSeguridad}',
      dgii_response_json #>> '{data,data,results,0,ecfInfo,codigoSeguridad}',
      dgii_response_json #>> '{data,results,0,responseRFCE,codigoSeguridad}',
      dgii_response_json #>> '{data,results,0,rfceInfo,codigoSeguridad}',
      dgii_response_json #>> '{data,results,0,ecfInfo,codigoSeguridad}'
    ) as seguridad,
    coalesce(
      dgii_response_json #>> '{data,data,results,0,responseRFCE,qrUrl}',
      dgii_response_json #>> '{data,data,results,0,rfceInfo,qrUrl}',
      dgii_response_json #>> '{data,data,results,0,ecfInfo,qrUrl}',
      dgii_response_json #>> '{data,results,0,responseRFCE,qrUrl}',
      dgii_response_json #>> '{data,results,0,rfceInfo,qrUrl}',
      dgii_response_json #>> '{data,results,0,ecfInfo,qrUrl}'
    ) as qr
  from myappdb.facturas
  where dgii_response_json is not null
)
update myappdb.facturas as f
set
  estado_dgii = coalesce(r.estado, f.estado_dgii),
  dgii_estado = coalesce(r.estado, f.dgii_estado),
  estado_envio_dgii = coalesce(r.estado, f.estado_envio_dgii),
  "codSeguridad" = coalesce(r.seguridad, f."codSeguridad"),
  qr_link = coalesce(r.qr, f.qr_link),
  dgii_updated_at = now()
from resultados as r
where f.id = r.id
  and (r.estado is not null or r.seguridad is not null or r.qr is not null);

commit;
