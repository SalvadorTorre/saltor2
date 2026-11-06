-- Inicio: ventas, gráfico, productos y categorías se calculan solo con las facturas
-- del 607 (enviadas y aceptadas por la DGII), usando la fecha de firma como el Rep. 607.
do $mig$
declare
  v_def text := pg_get_functiondef('myappdb.dashboard_inicio()'::regprocedure);
  v_new text;
begin
  v_new := regexp_replace(v_def,
    'f as \(\s*select f\.\* from myappdb\.facturas f, r\s*where coalesce\(f\.estado, ''''\) <> ''Anulada'' and f\.fecha_factura >= least\(r\.mes_ant_ini, r\.hoy - 35\)\s*\),',
    E'f as (\n  -- Solo facturas del 607: enviadas y aceptadas por la DGII (sin proformas ni pendientes).\n  -- La fecha es la de firma (igual que el Rep. 607).\n  select x.id, x.total, x.forma_pago_codigo, x.condicion_pago, x.fecha_factura from (\n    select f.id, f.total, f.forma_pago_codigo, f.condicion_pago,\n           coalesce((f.fec_firma at time zone ''America/Santo_Domingo'')::date, f.fecha_factura) as fecha_factura\n    from myappdb.facturas f\n    where coalesce(f.estado, '''') <> ''Anulada''\n      and coalesce(nullif(f.estado_dgii, ''''), f.dgii_estado, '''') ilike ''aceptado%''\n  ) x, r\n  where x.fecha_factura >= least(r.mes_ant_ini, r.hoy - 35)\n),');
  if v_new = v_def then raise exception 'No se encontró el bloque f en dashboard_inicio'; end if;
  execute v_new;
end $mig$;
