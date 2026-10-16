begin;

-- ===========================================================================
-- 1) El archivo del certificado y su clave cifrada solo los leen las funciones
--    del servidor (service_role).  Los usuarios ven titular y vigencia.
-- ===========================================================================
revoke select on myappdb.certificados_firma_digital from authenticated, anon;
grant select (id, empresa_id, nombre_archivo, tipo_archivo, titular, emisor, numero_serie,
              valido_desde, valido_hasta, cargado_en, actualizado_en)
  on myappdb.certificados_firma_digital to authenticated;

-- ===========================================================================
-- 2) Panel fiscal: alertas, estado de e-CF y resumen de ITBIS del período.
--    SECURITY INVOKER: el RLS limita todo a la empresa del usuario.
-- ===========================================================================
create or replace function private.fecha_texto(p text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(p, 'DD/MM/YYYY')
    when p ~ '^\d{4}-\d{2}-\d{2}' then substr(p, 1, 10)::date
    else null
  end;
$$;
grant execute on function private.fecha_texto(text) to authenticated, service_role;

create or replace function private.estado_ecf(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p ilike 'aceptado condicional%' then 'Aceptado condicional'
    when p ilike 'aceptado%' then 'Aceptado'
    when p ilike 'rechaz%' then 'Rechazado'
    when p ilike 'enviado%' or p ilike '%proceso%' then 'En proceso'
    else 'Sin enviar'
  end;
$$;
grant execute on function private.estado_ecf(text) to authenticated, service_role;

create or replace function myappdb.panel_fiscal(p_desde date, p_hasta date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with
docs as (
  select 'Factura'::text as tipo_doc, f.id, f.numero_factura as numero, coalesce(f.ncf, '') as encf, f.fecha_factura as fecha,
         f.cliente_nombre as tercero, f.total, f.itbis,
         private.estado_ecf(coalesce(nullif(f.dgii_estado, ''), nullif(f.estado_envio_dgii, ''), f.estado_dgii)) as estado,
         coalesce(nullif(f.dgii_error_message, ''), nullif(f.dgii_mensaje_respuesta, '')) as mensaje
  from myappdb.facturas f
  where coalesce(f.estado, '') <> 'Anulada'
  union all
  select 'Nota de crédito', n.id, n.numero_nota, coalesce(n.encf_nota, ''), n.fecha_emision, n.cliente_nombre, n.total, n.itbis,
         private.estado_ecf(coalesce(nullif(n.estado_envio_dgii, ''), n.estado_dgii)),
         coalesce(nullif(n.dgii_error_message, ''), nullif(n.dgii_mensaje_respuesta, ''))
  from myappdb.notas_credito n
  union all
  select 'Gasto menor', g.id, g.numero_control, coalesce(g.encf, ''), g.fecha, g.beneficiario, g.total, g.monto_itbis,
         private.estado_ecf(g.estado_dgii),
         coalesce(nullif(g.dgii_error_message, ''), nullif(g.dgii_mensaje_respuesta, ''))
  from myappdb.gastos_menores g
  union all
  select 'Compra (E41)', c.id, c.numero_control, coalesce(c.encf, ''), c.fecha_emision, c.proveedor_nombre, c.total_pagar, c.monto_itbis,
         private.estado_ecf(c.estado_dgii), null
  from myappdb.comprobantes_e41 c
),
docs_periodo as (
  select * from docs where fecha between p_desde and p_hasta
),
fac as (
  select f.* from myappdb.facturas f
  where coalesce(f.estado, '') <> 'Anulada' and f.fecha_factura between p_desde and p_hasta
),
lin as (
  select d.tasa_itbis, d.total_linea - coalesce(d.monto_itbis, 0) as neto, coalesce(d.monto_itbis, 0) as itbis
  from myappdb.factura_detalles d join fac on fac.id = d.factura_id
),
nc as (
  select n.* from myappdb.notas_credito n
  where n.fecha_emision between p_desde and p_hasta
    and private.estado_ecf(coalesce(nullif(n.estado_envio_dgii, ''), n.estado_dgii)) <> 'Rechazado'
),
compras as (
  select c.* from myappdb.compras_606 c
  where coalesce(c.fecha_factura, c.fecha_registro) between p_desde and p_hasta
),
gastos as (
  select g.* from myappdb.gastos_menores g
  where g.fecha between p_desde and p_hasta and private.estado_ecf(g.estado_dgii) <> 'Rechazado'
),
e41 as (
  select c.* from myappdb.comprobantes_e41 c
  where c.fecha_emision between p_desde and p_hasta and private.estado_ecf(c.estado_dgii) <> 'Rechazado'
),
seq as (
  select s.*, private.fecha_texto(s.fecha_vencimiento) as vence,
         greatest(coalesce(s.total, 0) - coalesce(s.usados, 0), 0) as restantes
  from myappdb.ncf_secuencias s
),
totales as (
  select
    (select coalesce(sum(itbis), 0) from fac) as itbis_ventas,
    (select coalesce(sum(itbis), 0) from nc) as itbis_nc,
    (select coalesce(sum(monto_itbis), 0) from compras) as itbis_compras
)
select jsonb_build_object(
  'ambiente', (select e.ambiente from myappdb.ecf_configuraciones e limit 1),
  'certificado', (
    select jsonb_build_object('titular', c.titular, 'emisor', c.emisor, 'valido_hasta', c.valido_hasta,
                              'dias_restantes', (c.valido_hasta::date - (now() at time zone 'America/Santo_Domingo')::date))
    from myappdb.certificados_firma_digital c order by c.valido_hasta desc nulls last limit 1
  ),
  'secuencias', coalesce((
    select jsonb_agg(x order by x.serie) from (
      select s.tipo_ncf, s.serie, s.rango_inicial, s.rango_final, s.usados, s.total, s.restantes,
             case when coalesce(s.total, 0) > 0 then round(s.usados::numeric / s.total * 100, 1) else 0 end as pct_usado,
             coalesce(s.porcentaje_alerta, 80) as porcentaje_alerta,
             s.fecha_vencimiento, s.vence, (s.vence - (now() at time zone 'America/Santo_Domingo')::date) as dias_para_vencer, s.estado
      from seq s
    ) x), '[]'::jsonb),
  'ecf_resumen', coalesce((
    select jsonb_agg(x order by x.tipo_doc) from (
      select tipo_doc,
             count(*) as total,
             count(*) filter (where estado = 'Aceptado') as aceptados,
             count(*) filter (where estado = 'Aceptado condicional') as condicionales,
             count(*) filter (where estado = 'En proceso') as en_proceso,
             count(*) filter (where estado = 'Rechazado') as rechazados,
             count(*) filter (where estado = 'Sin enviar') as sin_enviar
      from docs_periodo group by tipo_doc
    ) x), '[]'::jsonb),
  'ecf_pendientes', coalesce((
    select jsonb_agg(x order by x.fecha, x.numero) from (
      select tipo_doc, id, numero, encf, fecha, tercero, total, estado, mensaje, ((now() at time zone 'America/Santo_Domingo')::date - fecha) as dias
      from docs where estado not in ('Aceptado', 'Aceptado condicional')
      order by fecha desc limit 300
    ) x), '[]'::jsonb),
  'it1', (
    select jsonb_build_object(
      'facturas', (select count(*) from fac),
      'ventas_total', (select coalesce(sum(total), 0) from fac),
      'ventas_neto', (select coalesce(sum(subtotal), 0) from fac),
      'ventas_gravadas', (select coalesce(sum(neto) filter (where coalesce(tasa_itbis, 0) > 0), 0) from lin),
      'ventas_exentas', (select coalesce(sum(neto) filter (where coalesce(tasa_itbis, 0) = 0), 0) from lin),
      'itbis_18', (select coalesce(sum(itbis) filter (where tasa_itbis = 18), 0) from lin),
      'itbis_16', (select coalesce(sum(itbis) filter (where tasa_itbis = 16), 0) from lin),
      'itbis_ventas', t.itbis_ventas,
      'por_tipo', coalesce((
        select jsonb_agg(y order by y.tipo) from (
          select coalesce(nullif(tipo_ncf, ''), 'Sin tipo') as tipo, count(*) as cantidad,
                 sum(subtotal) as neto, sum(itbis) as itbis, sum(total) as total
          from fac group by 1
        ) y), '[]'::jsonb),
      'nc_cantidad', (select count(*) from nc),
      'nc_neto', (select coalesce(sum(subtotal), 0) from nc),
      'itbis_nc', t.itbis_nc,
      'compras_cantidad', (select count(*) from compras),
      'compras_neto', (select coalesce(sum(subtotal), 0) from compras),
      'itbis_compras', t.itbis_compras,
      'gastos_menores_total', (select coalesce(sum(total), 0) from gastos),
      'gastos_menores_itbis', (select coalesce(sum(monto_itbis), 0) from gastos),
      'itbis_neto', t.itbis_ventas - t.itbis_nc - t.itbis_compras,
      'facturas_no_aceptadas', (select count(*) from docs_periodo where tipo_doc = 'Factura' and estado not in ('Aceptado', 'Aceptado condicional'))
    ) from totales t
  ),
  'retenciones', jsonb_build_object(
    'comprobantes', (select count(*) from e41),
    'monto_compras', (select coalesce(sum(monto_compra), 0) from e41),
    'retencion_itbis', (select coalesce(sum(monto_retencion_itbis), 0) from e41),
    'retencion_isr', (select coalesce(sum(monto_retencion_isr), 0) from e41)
  )
);
$$;

revoke all on function myappdb.panel_fiscal(date, date) from public, anon;
grant execute on function myappdb.panel_fiscal(date, date) to authenticated, service_role;

commit;
