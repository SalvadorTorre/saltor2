begin;
-- ===========================================================================
-- Anulación de facturas con tipo y motivo, y consulta de comprobantes
-- anulados (base del Formato 608 de la DGII).
--
-- Tipos de anulación (Instructivo Formato 608, DGII):
--   1 Deterioro de factura preimpresa      6 Devolución de productos
--   2 Errores de impresión (preimpresa)    7 Omisión de productos
--   3 Impresión defectuosa                 8 Errores en secuencia de NCF
--   4 Corrección de la información         9 Por cese de operaciones
--   5 Cambio de productos                 10 Pérdida o hurto de talonarios
--
-- El 608 aplica a NCF de serie B.  Los e-NCF se anulan con nota de crédito
-- (si ya se enviaron) o con ANECF (si no se enviaron); se registran aquí igual
-- para control interno.
-- ===========================================================================

alter table myappdb.facturas add column if not exists tipo_anulacion smallint;
alter table myappdb.facturas add column if not exists motivo_anulacion text;
alter table myappdb.facturas add column if not exists anulada_en timestamptz;
alter table myappdb.facturas add column if not exists anulada_por text;
alter table myappdb.facturas drop constraint if exists facturas_tipo_anulacion_check;
alter table myappdb.facturas add constraint facturas_tipo_anulacion_check
  check (tipo_anulacion is null or tipo_anulacion between 1 and 10);
create table if not exists myappdb.tipos_anulacion (
  codigo smallint primary key check (codigo between 1 and 10),
  descripcion text not null
);
insert into myappdb.tipos_anulacion (codigo, descripcion) values
  (1, 'Deterioro de factura preimpresa'),
  (2, 'Errores de impresión (factura preimpresa)'),
  (3, 'Impresión defectuosa'),
  (4, 'Corrección de la información'),
  (5, 'Cambio de productos'),
  (6, 'Devolución de productos'),
  (7, 'Omisión de productos'),
  (8, 'Errores en secuencia de NCF'),
  (9, 'Por cese de operaciones'),
  (10, 'Pérdida o hurto de talonarios')
on conflict (codigo) do update set descripcion = excluded.descripcion;
alter table myappdb.tipos_anulacion enable row level security;
drop policy if exists tipos_anulacion_authenticated_read on myappdb.tipos_anulacion;
create policy tipos_anulacion_authenticated_read on myappdb.tipos_anulacion for select to authenticated using (true);
revoke all on myappdb.tipos_anulacion from anon, authenticated;
grant select on myappdb.tipos_anulacion to authenticated;
grant all on myappdb.tipos_anulacion to service_role;
-- ---------------------------------------------------------------------------
-- anular_factura con tipo y motivo (repone inventario igual que antes)
-- ---------------------------------------------------------------------------
drop function if exists myappdb.anular_factura(bigint);
create or replace function myappdb.anular_factura(p_factura_id bigint, p_tipo_anulacion smallint default 4, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  empresa_usuario_id integer;
  sucursal_usuario_id bigint;
  nombre_usuario text;
  factura_estado text;
  factura_dgii_estado text;
  detalle record;
begin
  if p_tipo_anulacion is null or p_tipo_anulacion not between 1 and 10 then
    raise exception 'Indique un tipo de anulación válido (1 a 10).' using errcode = '22023';
  end if;

  select empresa_id, sucursal_id, nombre_completo into empresa_usuario_id, sucursal_usuario_id, nombre_usuario
  from myappdb.usuarios
  where auth_usuario_id = (select auth.uid()) and estado = 'Activo';

  select estado, dgii_estado into factura_estado, factura_dgii_estado
  from myappdb.facturas
  where id = p_factura_id and idempres = empresa_usuario_id and idsucursal = sucursal_usuario_id
  for update;

  if not found then
    raise exception 'No se encontró la factura para la empresa y sucursal del usuario.' using errcode = '42501';
  end if;
  if factura_estado = 'Anulada' then
    raise exception 'La factura ya está anulada.' using errcode = '22023';
  end if;
  if factura_dgii_estado in ('Enviado', 'Aceptado') then
    raise exception 'No se puede anular una factura ya enviada o aceptada por DGII. Use una nota de crédito.' using errcode = '22023';
  end if;

  -- Repone el inventario en el mismo producto del que se rebajó.
  for detalle in
    select coalesce(d.producto_inventario_id, d.producto_id) as producto_id, d.cantidad
    from myappdb.factura_detalles as d where d.factura_id = p_factura_id
  loop
    update myappdb.products as p
    set existencia = p.existencia + detalle.cantidad,
        estado = case when p.estado = 'Agotado' then 'Activo' else p.estado end
    where p.id = detalle.producto_id;
  end loop;

  update myappdb.facturas
  set estado = 'Anulada',
      tipo_anulacion = p_tipo_anulacion,
      motivo_anulacion = nullif(trim(p_motivo), ''),
      anulada_en = now(),
      anulada_por = nombre_usuario,
      actualizado_en = now()
  where id = p_factura_id;
end;
$$;
revoke all on function myappdb.anular_factura(bigint, smallint, text) from public, anon;
grant execute on function myappdb.anular_factura(bigint, smallint, text) to authenticated, service_role;
-- ---------------------------------------------------------------------------
-- Comprobantes anulados (respeta la seguridad del usuario)
-- ---------------------------------------------------------------------------
create or replace view myappdb.comprobantes_anulados
with (security_invoker = true) as
select
  f.id,
  f.idempres as empresa_id,
  f.idsucursal as sucursal_id,
  f.numero_factura,
  nullif(f.ncf, '') as ncf,
  case
    when f.ncf like 'E%' then 'e-NCF'
    when f.ncf like 'B%' then 'NCF'
    else 'Sin NCF'
  end as tipo_comprobante,
  f.tipo_ncf,
  f.fecha_factura,
  coalesce(f.anulada_en, f.actualizado_en) as anulada_en,
  f.anulada_por,
  f.tipo_anulacion,
  t.descripcion as tipo_anulacion_descripcion,
  f.motivo_anulacion,
  f.cliente_nombre,
  f.cliente_rnc,
  f.total,
  f.dgii_estado
from myappdb.facturas f
left join myappdb.tipos_anulacion t on t.codigo = f.tipo_anulacion
where f.estado = 'Anulada';
grant select on myappdb.comprobantes_anulados to authenticated;
commit;
