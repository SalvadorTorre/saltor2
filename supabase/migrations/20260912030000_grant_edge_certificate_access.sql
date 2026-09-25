begin;

grant select, insert, update on myappdb.certificados_firma_digital to service_role;
grant usage, select on sequence myappdb.certificados_firma_digital_id_seq to service_role;

commit;
