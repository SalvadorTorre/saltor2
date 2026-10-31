begin;

-- Cuentas por cobrar: la vista respeta la seguridad por empresa de las tablas
-- (antes se ejecutaba como su dueño y mostraba las cuentas de todas las empresas).
alter view myappdb.cxc_facturas set (security_invoker = true);

-- El balance de los clientes quedó desactualizado con la carga de saldos anteriores:
-- se recalcula una vez desde la vista (lo mismo que hace cada cobro).
alter table myappdb.clients disable trigger user;
update myappdb.clients c
   set balance = coalesce((select sum(v.saldo) from myappdb.cxc_facturas v where v.cliente_id = c.id), 0)
 where c.balance is distinct from coalesce((select sum(v.saldo) from myappdb.cxc_facturas v where v.cliente_id = c.id), 0);
alter table myappdb.clients enable trigger user;

commit;
