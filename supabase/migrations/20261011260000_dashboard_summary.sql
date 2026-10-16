begin;

-- ===========================================================================
-- Resumen del Inicio en un solo llamado (fecha de Santo Domingo, no UTC).
-- SECURITY INVOKER: el RLS limita todo a la empresa del usuario.
-- Requiere private.estado_ecf (migración 20261011240000_fiscal_panel).
-- ===========================================================================
create or replace function myappdb.dashboard_inicio()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with
d as (
  select (now() at time zone 'America/Santo_Domingo')::date as hoy,
         date_trunc('month', (now() at time zone 'America/Santo_Domingo'))::date as mes_ini
),
r as (
  select hoy, mes_ini,
         (mes_ini - interval '1 month')::date as mes_ant_ini,
         least((mes_ini - interval '1 month')::date + (hoy - mes_ini), mes_ini - 1) as mes_ant_corte
  from d
),
f as (
  select f.* from myappdb.facturas f, r
  where coalesce(f.estado, '') <> 'Anulada' and f.fecha_factura >= least(r.mes_ant_ini, r.hoy - 35)
),
fm as (select f.* from f, r where f.fecha_factura between r.mes_ini and r.hoy),
lm as (
  select l.cantidad, l.total_linea, l.total_linea - coalesce(l.monto_itbis, 0) as neto, l.producto_id,
         coalesce(nullif(trim(p.descripcion), ''), nullif(trim(l.descripcion), ''), 'Producto') as nombre,
         coalesce(nullif(trim(p.categoria), ''), 'Sin categoría') as categoria
  from myappdb.factura_detalles l join fm on fm.id = l.factura_id
  left join myappdb.products p on p.id = l.producto_id
),
prod as (
  select p.* from myappdb.products p where coalesce(p.estado, '') <> 'Inactivo'
),
ultima_venta as (
  select coalesce(l.producto_inventario_id, l.producto_id) as producto_id, max(fa.fecha_factura) as ultima
  from myappdb.factura_detalles l join myappdb.facturas fa on fa.id = l.factura_id
  where coalesce(fa.estado, '') <> 'Anulada'
  group by 1
),
docs as (
  select private.estado_ecf(coalesce(nullif(x.dgii_estado, ''), nullif(x.estado_envio_dgii, ''), x.estado_dgii)) as estado
  from myappdb.facturas x where coalesce(x.estado, '') <> 'Anulada'
  union all
  select private.estado_ecf(coalesce(nullif(n.estado_envio_dgii, ''), n.estado_dgii)) from myappdb.notas_credito n
)
select jsonb_build_object(
  'hoy', (select hoy from r),
  'ventas', (
    select jsonb_build_object(
      'hoy', coalesce(sum(total) filter (where fecha_factura = r.hoy), 0),
      'hoy_facturas', count(*) filter (where fecha_factura = r.hoy),
      'ayer', coalesce(sum(total) filter (where fecha_factura = r.hoy - 1), 0),
      'semana_pasada', coalesce(sum(total) filter (where fecha_factura = r.hoy - 7), 0),
      'mes', coalesce(sum(total) filter (where fecha_factura between r.mes_ini and r.hoy), 0),
      'mes_facturas', count(*) filter (where fecha_factura between r.mes_ini and r.hoy),
      'mes_anterior_corte', coalesce(sum(total) filter (where fecha_factura between r.mes_ant_ini and r.mes_ant_corte), 0),
      'mes_credito', coalesce(sum(total) filter (where fecha_factura between r.mes_ini and r.hoy and (forma_pago_codigo = 4 or condicion_pago ilike 'cr%')), 0)
    ) from r left join f on true group by r.hoy, r.mes_ini, r.mes_ant_ini, r.mes_ant_corte
  ),
  'unidades_mes', (select coalesce(sum(cantidad), 0) from lm),
  'serie_30', (
    select jsonb_agg(jsonb_build_object('fecha', g.dia::date, 'total', coalesce(t.total, 0), 'facturas', coalesce(t.n, 0)) order by g.dia)
    from r, generate_series(r.hoy - 29, r.hoy, interval '1 day') as g(dia)
    left join (select fecha_factura, sum(total) as total, count(*) as n from f group by fecha_factura) t on t.fecha_factura = g.dia::date
  ),
  'top_productos', coalesce((
    select jsonb_agg(x order by x.cantidad desc) from (
      select nombre, sum(cantidad) as cantidad, sum(total_linea) as total from lm group by nombre order by sum(cantidad) desc limit 5
    ) x), '[]'::jsonb),
  'categorias', coalesce((
    select jsonb_agg(x order by x.total desc) from (
      select categoria as nombre, sum(neto) as total from lm group by categoria
    ) x), '[]'::jsonb),
  'stock', jsonb_build_object(
    'activos', (select count(*) from prod),
    'negativos', (select count(*) from prod where coalesce(existencia, 0) < 0),
    'bajo_minimo', (select count(*) from prod where coalesce(existencia, 0) >= 0 and coalesce(existencia_minima, 0) > 0 and existencia <= existencia_minima),
    'lista', coalesce((
      select jsonb_agg(x order by x.orden) from (
        select codigo, descripcion, existencia, existencia_minima,
               coalesce(existencia, 0) - coalesce(existencia_minima, 0) as orden
        from prod
        where coalesce(existencia, 0) < 0 or (coalesce(existencia_minima, 0) > 0 and existencia <= existencia_minima)
        order by coalesce(existencia, 0) - coalesce(existencia_minima, 0) limit 8
      ) x), '[]'::jsonb)
  ),
  'sin_movimiento', (
    select jsonb_build_object(
      'cantidad', count(*),
      'valor', coalesce(sum(p.existencia * coalesce(p.costo, 0)), 0),
      'lista', coalesce(jsonb_agg(jsonb_build_object('codigo', p.codigo, 'descripcion', p.descripcion, 'existencia', p.existencia,
                                                     'ultima_venta', u.ultima, 'dias', (select hoy from r) - u.ultima)
                                  order by u.ultima nulls first) filter (where true), '[]'::jsonb)
    )
    from prod p left join ultima_venta u on u.producto_id = p.id
    where coalesce(p.existencia, 0) > 0 and (u.ultima is null or u.ultima < (select hoy from r) - 60)
  ),
  'inventario_mes', (
    select jsonb_build_object(
      'entradas', coalesce(sum(m.cantidad) filter (where m.cantidad > 0 and m.tipo <> 'Saldo inicial'), 0),
      'salidas', coalesce(-sum(m.cantidad) filter (where m.cantidad < 0 and m.tipo <> 'Saldo inicial'), 0),
      'ajustes', count(*) filter (where m.tipo like 'Ajuste%' or m.tipo = 'Cambio manual')
    )
    from myappdb.movimientos_inventario m, r
    where (m.fecha at time zone 'America/Santo_Domingo')::date between r.mes_ini and r.hoy
  ),
  'cxc', (
    select jsonb_build_object(
      'saldo', coalesce(sum(saldo), 0),
      'vencido', coalesce(sum(saldo) filter (where dias_vencida > 0), 0),
      'facturas_vencidas', count(*) filter (where dias_vencida > 0 and saldo > 0),
      'clientes', count(distinct coalesce(cliente_id::text, cliente_nombre)) filter (where saldo > 0)
    ) from myappdb.cxc_facturas
  ),
  'cotizaciones', (
    select jsonb_build_object(
      'activas', count(*) filter (where c.estado = 'Activa'),
      'por_vencer', count(*) filter (where c.estado = 'Activa' and c.vigencia_hasta between r.hoy and r.hoy + 7),
      'monto_activas', coalesce(sum(c.total) filter (where c.estado = 'Activa'), 0)
    ) from myappdb.cotizaciones c, r
  ),
  'fiscal', jsonb_build_object(
    'ambiente', (select e.ambiente from myappdb.ecf_configuraciones e limit 1),
    'rechazados', (select count(*) from docs where estado = 'Rechazado'),
    'sin_enviar', (select count(*) from docs where estado = 'Sin enviar'),
    'secuencias_alerta', (
      select count(*) from myappdb.ncf_secuencias s, r
      where coalesce(s.total, 0) - coalesce(s.usados, 0) <= 0
         or (coalesce(s.total, 0) > 0 and s.usados::numeric / s.total * 100 >= coalesce(s.porcentaje_alerta, 80))
         or private.fecha_texto(s.fecha_vencimiento) <= r.hoy + 30
    ),
    'certificado_dias', (select max(c.valido_hasta)::date - (select hoy from r) from myappdb.certificados_firma_digital c)
  ),
  'ultimas', coalesce((
    select jsonb_agg(x order by x.id desc) from (
      select t.id, t.fecha_factura as fecha, t.numero_factura as numero, coalesce(t.cliente_nombre, 'CLIENTE CONTADO') as cliente, t.total,
             case when t.estado = 'Anulada' then 'Anulada'
                  else private.estado_ecf(coalesce(nullif(t.dgii_estado, ''), nullif(t.estado_envio_dgii, ''), t.estado_dgii)) end as estado
      from myappdb.facturas t order by t.id desc limit 8
    ) x), '[]'::jsonb)
);
$$;

revoke all on function myappdb.dashboard_inicio() from public, anon;
grant execute on function myappdb.dashboard_inicio() to authenticated, service_role;

commit;
