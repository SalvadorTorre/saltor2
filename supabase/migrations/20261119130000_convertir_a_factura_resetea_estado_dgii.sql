-- Al convertir proforma/conduce a factura E32 también se limpia estado_dgii
-- (antes quedaba "Firmada" y la factura no salía en Facturas pendientes).
-- Datos: se corrigió a mano la factura 20260100607 de GABANA (id 1133).
do $$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='myappdb' and p.proname in ('convertir_proformas_a_factura','convertir_conduces_a_factura') loop
    d := pg_get_functiondef(r.oid);
    if position('dgii_estado = ''En cola'', estado_envio_dgii' in d) > 0 and position('estado_dgii = ''En cola''' in d) = 0 then
      d := replace(d, 'dgii_estado = ''En cola'', estado_envio_dgii', 'dgii_estado = ''En cola'', estado_dgii = ''En cola'', estado_envio_dgii');
      execute d;
    end if;
  end loop;
end $$;
