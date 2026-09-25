begin;

alter table myappdb.facturas
  add column if not exists fechanf timestamptz;

alter table myappdb.facturas
  drop constraint if exists facturas_dgii_estado_check;

alter table myappdb.facturas
  add constraint facturas_dgii_estado_check check (
    dgii_estado in ('No enviado', 'Pendiente de configuración', 'Enviado', 'Aceptado', 'Aceptado condicional', 'Rechazado', 'Error')
  );

update myappdb.facturas
set fechanf = dgii_enviado_en
where fechanf is null
  and dgii_enviado_en is not null;

create index if not exists facturas_fechanf_idx
  on myappdb.facturas (fechanf desc)
  where fechanf is not null;

commit;
