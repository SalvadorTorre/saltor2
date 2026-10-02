begin;

-- The previous all-operations policy allowed a tenant to delete an accepted
-- document through the API. Split it so the immutable DGII state is enforced
-- by the database as well as the user interface.
drop policy if exists comprobantes_e41_tenant_access on myappdb.comprobantes_e41;

create policy comprobantes_e41_tenant_select
on myappdb.comprobantes_e41 for select to authenticated
using (idempres = (select private.current_empresa_id()));

create policy comprobantes_e41_tenant_insert
on myappdb.comprobantes_e41 for insert to authenticated
with check (idempres = (select private.current_empresa_id()));

create policy comprobantes_e41_tenant_update
on myappdb.comprobantes_e41 for update to authenticated
using (idempres = (select private.current_empresa_id()))
with check (idempres = (select private.current_empresa_id()));

create policy comprobantes_e41_tenant_delete_unaccepted
on myappdb.comprobantes_e41 for delete to authenticated
using (
  idempres = (select private.current_empresa_id())
  and estado_dgii <> 'Aceptado'
);

commit;
