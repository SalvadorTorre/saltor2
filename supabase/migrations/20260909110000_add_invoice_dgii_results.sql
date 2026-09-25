begin;

alter table myappdb.facturas
  add column if not exists dgii_estado text not null default 'No enviado',
  add column if not exists dgii_enviado_en timestamptz,
  add column if not exists dgii_track_id text,
  add column if not exists dgii_codigo_respuesta text,
  add column if not exists dgii_mensaje_respuesta text,
  add column if not exists dgii_respuesta jsonb,
  add column if not exists dgii_xml text,
  add column if not exists dgii_intentos integer not null default 0,
  add column if not exists dgii_ultima_consulta_en timestamptz,
  add column if not exists impreso_en timestamptz;

alter table myappdb.facturas
  drop constraint if exists facturas_dgii_estado_check;

alter table myappdb.facturas
  add constraint facturas_dgii_estado_check check (
    dgii_estado in ('No enviado', 'Pendiente de configuración', 'Enviado', 'Aceptado', 'Rechazado', 'Error')
  );

alter table myappdb.facturas
  drop constraint if exists facturas_dgii_intentos_check;

alter table myappdb.facturas
  add constraint facturas_dgii_intentos_check check (dgii_intentos >= 0);

create index if not exists facturas_dgii_estado_idx on myappdb.facturas (dgii_estado);
create index if not exists facturas_dgii_track_id_idx on myappdb.facturas (dgii_track_id) where dgii_track_id is not null;

commit;
