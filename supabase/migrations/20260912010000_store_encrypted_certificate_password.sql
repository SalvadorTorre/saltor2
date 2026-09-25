begin;

alter table myappdb.certificados_firma_digital
  add column if not exists clave_cifrada text;

commit;
