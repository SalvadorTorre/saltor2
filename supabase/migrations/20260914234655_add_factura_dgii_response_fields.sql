begin;

alter table myappdb.facturas
  add column if not exists estado_dgii text,
  add column if not exists "codSeguridad" text,
  add column if not exists qr_link text,
  add column if not exists fec_firma timestamptz,
  add column if not exists estado_envio_dgii text,
  add column if not exists dgii_request_json jsonb,
  add column if not exists dgii_response_json jsonb,
  add column if not exists dgii_response_raw text,
  add column if not exists dgii_mensajes jsonb,
  add column if not exists dgii_error_message text,
  add column if not exists dgii_codigo text,
  add column if not exists dgii_updated_at timestamptz;

create index if not exists facturas_estado_dgii_idx
  on myappdb.facturas (estado_dgii)
  where estado_dgii is not null;

create index if not exists facturas_dgii_updated_at_idx
  on myappdb.facturas (dgii_updated_at desc)
  where dgii_updated_at is not null;

commit;
