-- Descuento por línea en cotización (activable por empresa en Configuración → Otros; activo en Bella Real).
alter table myappdb.empresas add column if not exists cotizacion_descuento boolean not null default false;
comment on column myappdb.empresas.cotizacion_descuento is 'Cotización: muestra la columna Desc. % por línea (igual que la orden de venta).';
update myappdb.empresas set cotizacion_descuento = true where id = 6;

alter table myappdb.cotizacion_detalles
  add column if not exists descuento_porcentaje numeric not null default 0,
  add column if not exists descuento_monto numeric not null default 0,
  add column if not exists precio_original numeric;
alter table myappdb.cotizaciones add column if not exists descuento_total numeric not null default 0;
-- crear_cotizacion: guarda descuentoTotal y, por línea, descuentoPorcentaje / descuentoMonto / precioOriginal
-- (definición completa aplicada en Supabase con la migración 'cotizacion_descuento_por_linea').
