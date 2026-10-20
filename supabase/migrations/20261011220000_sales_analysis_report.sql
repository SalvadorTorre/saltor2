begin;

-- ===========================================================================
-- Análisis de ventas: un solo llamado devuelve todos los cortes del período.
--   * Montos "neto" = sin ITBIS (total_linea incluye ITBIS).
--   * Costo = cantidad × costo_unitario guardado en la línea.
--   * Facturas anuladas excluidas.
--   * SECURITY INVOKER: el RLS limita los datos a la empresa del usuario.
-- ===========================================================================
create or replace function myappdb.reporte_ventas_analisis(p_desde date default null, p_hasta date default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with
f as (
  select f.*,
         coalesce(f.forma_pago_codigo, case when f.condicion_pago ilike 'cr%' then 4 end)::int as fp
  from myappdb.facturas f
  where coalesce(f.estado, '') <> 'Anulada'
    and (p_desde is null or f.fecha_factura >= p_desde)
    and (p_hasta is null or f.fecha_factura <= p_hasta)
),
l as (
  select d.factura_id, d.producto_id, d.producto_inventario_id, d.cantidad, d.precio_unitario,
         coalesce(d.costo_estimado, false) as costo_estimado,
         d.total_linea - coalesce(d.monto_itbis, 0) as neto,
         d.cantidad * coalesce(d.costo_unitario, 0) as costo,
         coalesce(nullif(trim(p.categoria), ''), 'Sin categoría') as categoria,
         coalesce(p.codigo, d.codigo_producto, '') as codigo,
         coalesce(nullif(trim(p.descripcion), ''), nullif(trim(d.descripcion), ''), 'Producto sin descripción') as descripcion,
         coalesce(p.ventaxmayor = 'S' and coalesce(p.precio_mayor, 0) > 0
                  and p.precio_mayor <> coalesce(p.precio_venta, 0)
                  and d.precio_unitario = p.precio_mayor
                  and d.cantidad >= coalesce(
                    nullif(to_jsonb(p) ->> 'cantidadxmayor', '')::numeric,
                    nullif(to_jsonb(p) ->> 'cantidad_minima_mayor', '')::numeric,
                    0
                  ), false) as es_mayor,
         (d.producto_inventario_id is not null and d.producto_inventario_id <> d.producto_id) as es_reemplazo
  from myappdb.factura_detalles d
  join f on f.id = d.factura_id
  left join myappdb.products p on p.id = d.producto_id
),
prev_rango as (
  select (p_desde - (p_hasta - p_desde + 1))::date as desde, (p_desde - 1)::date as hasta
  where p_desde is not null and p_hasta is not null and p_hasta >= p_desde
),
pf as (
  select f.id, f.total, f.subtotal
  from myappdb.facturas f, prev_rango r
  where coalesce(f.estado, '') <> 'Anulada' and f.fecha_factura between r.desde and r.hasta
),
pl as (
  select d.total_linea - coalesce(d.monto_itbis, 0) as neto, d.cantidad * coalesce(d.costo_unitario, 0) as costo
  from myappdb.factura_detalles d join pf on pf.id = d.factura_id
),
nc as (
  select n.*
  from myappdb.notas_credito n
  where (p_desde is null or n.fecha_emision >= p_desde)
    and (p_hasta is null or n.fecha_emision <= p_hasta)
),
cot as (
  select c.*
  from myappdb.cotizaciones c
  where (p_desde is null or c.fecha >= p_desde)
    and (p_hasta is null or c.fecha <= p_hasta)
)
select jsonb_build_object(
  'resumen', (
    select jsonb_build_object(
      'facturas', count(*),
      'total', coalesce(sum(total), 0),
      'neto', coalesce(sum(subtotal), 0),
      'itbis', coalesce(sum(itbis), 0),
      'contado', coalesce(sum(total) filter (where fp is distinct from 4), 0),
      'credito', coalesce(sum(total) filter (where fp = 4), 0),
      'clientes', count(distinct coalesce(cliente_id::text, upper(trim(cliente_nombre)))),
      'costo', (select coalesce(sum(costo), 0) from l),
      'neto_lineas', (select coalesce(sum(neto), 0) from l),
      'unidades', (select coalesce(sum(cantidad), 0) from l),
      'lineas_costo_estimado', (select count(*) from l where costo_estimado),
      'lineas_sin_costo', (select count(*) from l where costo = 0)
    ) from f
  ),
  'anterior', (
    select jsonb_build_object(
      'desde', r.desde, 'hasta', r.hasta,
      'facturas', (select count(*) from pf),
      'total', (select coalesce(sum(total), 0) from pf),
      'neto', (select coalesce(sum(subtotal), 0) from pf),
      'costo', (select coalesce(sum(costo), 0) from pl),
      'neto_lineas', (select coalesce(sum(neto), 0) from pl)
    ) from prev_rango r
  ),
  'por_dia', coalesce((
    select jsonb_agg(x order by x.fecha) from (
      select fecha_factura as fecha, count(*) as facturas, sum(total) as total
      from f group by fecha_factura
    ) x), '[]'::jsonb),
  'por_forma_pago', coalesce((
    select jsonb_agg(x order by x.total desc) from (
      select fp as codigo,
             case fp when 1 then 'Efectivo' when 2 then 'Depósito / transferencia' when 3 then 'Tarjeta'
                     when 4 then 'Crédito' when 5 then 'Bonos o certificados' when 6 then 'Permuta'
                     when 7 then 'Nota de crédito' when 8 then 'Otras' else 'Sin indicar' end as nombre,
             count(*) as facturas, sum(total) as total
      from f group by fp
    ) x), '[]'::jsonb),
  'por_cliente', coalesce((
    select jsonb_agg(x order by x.total desc) from (
      select coalesce(max(nullif(trim(cliente_nombre), '')), 'Cliente contado') as nombre,
             max(cliente_rnc) as rnc,
             count(*) as facturas, sum(total) as total, max(fecha_factura) as ultima_compra
      from f group by coalesce(cliente_id::text, upper(trim(coalesce(cliente_nombre, ''))))
      order by sum(total) desc limit 30
    ) x), '[]'::jsonb),
  'por_categoria', coalesce((
    select jsonb_agg(x order by x.neto desc) from (
      select categoria as nombre, sum(cantidad) as cantidad, sum(neto) as neto, sum(costo) as costo,
             sum(neto) - sum(costo) as margen
      from l group by categoria
    ) x), '[]'::jsonb),
  'por_vendedor', coalesce((
    select jsonb_agg(x order by x.total desc) from (
      select coalesce(nullif(trim(usuario_nombre), ''), 'Sin registrar') as nombre,
             count(*) as facturas, sum(total) as total, avg(total) as promedio
      from f group by 1
    ) x), '[]'::jsonb),
  'por_producto', coalesce((
    select jsonb_agg(x order by x.neto desc) from (
      select codigo, descripcion as nombre, sum(cantidad) as cantidad, sum(neto) as neto, sum(costo) as costo,
             sum(neto) - sum(costo) as margen, bool_or(costo_estimado) as costo_estimado
      from l group by codigo, descripcion
      order by sum(neto) desc limit 100
    ) x), '[]'::jsonb),
  'mayor_detalle', coalesce((
    select jsonb_agg(x order by x.tipo) from (
      select case when es_mayor then 'Al por mayor' else 'Al detalle' end as tipo,
             count(*) as lineas, sum(cantidad) as cantidad, sum(neto) as neto, sum(neto) - sum(costo) as margen
      from l group by es_mayor
    ) x), '[]'::jsonb),
  'reemplazos', coalesce((
    select jsonb_agg(x order by x.neto desc) from (
      select l.codigo, l.descripcion as nombre, coalesce(pi.codigo || ' · ' || pi.descripcion, '') as rebaja_de,
             count(*) as lineas, sum(l.cantidad) as cantidad, sum(l.neto) as neto
      from l left join myappdb.products pi on pi.id = l.producto_inventario_id
      where l.es_reemplazo
      group by l.codigo, l.descripcion, pi.codigo, pi.descripcion
    ) x), '[]'::jsonb),
  'por_hora', coalesce((
    select jsonb_agg(x order by x.hora) from (
      select extract(hour from creado_en at time zone 'America/Santo_Domingo')::int as hora,
             count(*) as facturas, sum(total) as total
      from f where creado_en is not null group by 1
    ) x), '[]'::jsonb),
  'por_dia_semana', coalesce((
    select jsonb_agg(x order by x.dia) from (
      select extract(isodow from fecha_factura)::int as dia, count(*) as facturas, sum(total) as total
      from f group by 1
    ) x), '[]'::jsonb),
  'notas_credito', coalesce((
    select jsonb_agg(x order by x.total desc) from (
      select coalesce(nullif(trim(codigo_modificacion), ''), 'Sin código') as codigo,
             coalesce(nullif(upper(trim(motivo)), ''), 'SIN MOTIVO') as motivo,
             count(*) as cantidad, sum(total) as total
      from nc group by 1, 2
    ) x), '[]'::jsonb),
  'cotizaciones', (
    select jsonb_build_object(
      'cantidad', count(*),
      'total', coalesce(sum(total), 0),
      'facturadas', count(*) filter (where estado = 'Facturada'),
      'total_facturado', coalesce(sum(total) filter (where estado = 'Facturada'), 0),
      'vencidas', count(*) filter (where estado <> 'Facturada' and vigencia_hasta < current_date),
      'por_estado', coalesce((
        select jsonb_agg(y order by y.cantidad desc) from (
          select coalesce(estado, 'Sin estado') as estado, count(*) as cantidad, sum(total) as total
          from cot group by 1
        ) y), '[]'::jsonb)
    ) from cot
  )
);
$$;

revoke all on function myappdb.reporte_ventas_analisis(date, date) from public, anon;
grant execute on function myappdb.reporte_ventas_analisis(date, date) to authenticated, service_role;

commit;
