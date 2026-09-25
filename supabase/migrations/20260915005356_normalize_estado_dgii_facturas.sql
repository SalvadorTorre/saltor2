begin;

update myappdb.facturas
set estado_dgii = dgii_estado
where estado_dgii is distinct from dgii_estado;

commit;
