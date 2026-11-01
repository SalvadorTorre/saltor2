-- Orden de venta con volante: al grabar la orden se imprime solo un volante con el
-- número en código de barras; quien factura lo escanea en Facturación.
alter table myappdb.empresas add column if not exists orden_volante boolean not null default false;
comment on column myappdb.empresas.orden_volante is 'Al grabar una orden de venta se imprime un volante con código de barras en lugar de la orden.';
