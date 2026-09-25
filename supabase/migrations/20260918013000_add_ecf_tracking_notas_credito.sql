begin;

alter table myappdb.notas_credito
  add column if not exists ecf_ambiente text check (ecf_ambiente in ('TEST', 'PROD', 'CERT')),
  add column if not exists qr_link text,
  add column if not exists fec_firma timestamptz,
  add column if not exists estado_envio_dgii text,
  add column if not exists dgii_enviado_en timestamptz,
  add column if not exists dgii_intentos integer not null default 0,
  add column if not exists dgii_mensaje_respuesta text;

commit;
