begin;

alter table myappdb.gastos_menores
  add column if not exists ecf_ambiente text,
  add column if not exists fecha_vencimiento_secuencia date,
  add column if not exists dgii_codigo text,
  add column if not exists dgii_mensaje_respuesta text,
  add column if not exists dgii_mensajes jsonb,
  add column if not exists dgii_request_json jsonb,
  add column if not exists dgii_response_json jsonb,
  add column if not exists dgii_response_raw text,
  add column if not exists dgii_error_message text,
  add column if not exists dgii_enviado_en timestamptz,
  add column if not exists dgii_updated_at timestamptz,
  add column if not exists fec_firma timestamptz,
  add column if not exists qr_link text,
  add column if not exists dgii_intentos integer not null default 0;

commit;
