begin;

grant usage on schema myappdb to authenticated, service_role;
grant select, insert, update, delete on myappdb.compras_606 to authenticated, service_role;
grant usage, select on sequence myappdb.compras_606_id_seq to authenticated, service_role;
grant execute on function myappdb.crear_compra_606(jsonb) to authenticated, service_role;

commit;
