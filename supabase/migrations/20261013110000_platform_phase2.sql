begin;
-- ===========================================================================
-- Plataforma (fase 2): contratos con las empresas, equipos instalados en cada
-- local (instalaciones) y visitas de servicio. Solo los dueños del sistema.
-- No se guardan claves: para acceso remoto solo el ID (AnyDesk, TeamViewer…).
-- ===========================================================================

-- Contratos -------------------------------------------------------------------
create sequence if not exists myappdb.plataforma_contratos_numero_seq;
create table if not exists myappdb.plataforma_contratos (
  id bigint generated always as identity primary key,
  numero text not null unique,
  empresa_id integer not null references myappdb.empresas(id) on delete restrict,
  tipo text not null default 'Suscripción' check (tipo in ('Suscripción', 'Licencia', 'Implementación', 'Soporte', 'Otro')),
  descripcion text,
  plan_id integer references myappdb.plataforma_planes(id),
  fecha_inicio date not null default private.hoy_rd(),
  fecha_fin date,
  renovacion_automatica boolean not null default true,
  monto numeric(12,2) not null default 0 check (monto >= 0),
  periodicidad text not null default 'Mensual' check (periodicidad in ('Mensual', 'Trimestral', 'Anual', 'Pago único')),
  condiciones text,
  representante_nombre text,
  representante_cedula text,
  representante_cargo text,
  estado text not null default 'Borrador' check (estado in ('Borrador', 'Vigente', 'Finalizado', 'Cancelado')),
  firmado_en date,
  archivo text,
  archivo_nombre text,
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);
create index if not exists plataforma_contratos_empresa_idx on myappdb.plataforma_contratos (empresa_id, fecha_inicio desc);
create or replace function private.tg_plataforma_contrato_numero()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.numero, '') = '' then
    new.numero := 'CT-' || lpad(nextval('myappdb.plataforma_contratos_numero_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;
revoke all on function private.tg_plataforma_contrato_numero() from public, anon, authenticated;
drop trigger if exists plataforma_contratos_numero on myappdb.plataforma_contratos;
create trigger plataforma_contratos_numero before insert on myappdb.plataforma_contratos
  for each row execute function private.tg_plataforma_contrato_numero();
-- Instalaciones locales (equipos en cada empresa/sucursal) ----------------------
create table if not exists myappdb.plataforma_instalaciones (
  id bigint generated always as identity primary key,
  empresa_id integer not null references myappdb.empresas(id) on delete restrict,
  sucursal_id bigint references myappdb.sucursales(idsucursal) on delete set null,
  nombre_equipo text not null,
  tipo text not null default 'PC de caja' check (tipo in ('PC de caja', 'Servidor', 'PC de oficina', 'Laptop', 'Impresora térmica', 'Impresora fiscal', 'Lector de código', 'Cajón de dinero', 'Router / Red', 'Otro')),
  marca_modelo text,
  serie text,
  sistema_operativo text,
  version_app text,
  ip_local text,
  acceso_remoto text,
  ubicacion text,
  responsable text,
  telefono text,
  fecha_instalacion date default private.hoy_rd(),
  garantia_hasta date,
  estado text not null default 'Activa' check (estado in ('Activa', 'En mantenimiento', 'Retirada')),
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists plataforma_instalaciones_empresa_idx on myappdb.plataforma_instalaciones (empresa_id);
-- Visitas y servicios (instalación, mantenimiento, soporte, capacitación) --------
create table if not exists myappdb.plataforma_visitas (
  id bigint generated always as identity primary key,
  empresa_id integer not null references myappdb.empresas(id) on delete restrict,
  instalacion_id bigint references myappdb.plataforma_instalaciones(id) on delete set null,
  fecha date not null default private.hoy_rd(),
  tipo text not null default 'Soporte' check (tipo in ('Instalación', 'Mantenimiento', 'Soporte', 'Capacitación', 'Actualización', 'Otro')),
  modalidad text not null default 'Presencial' check (modalidad in ('Presencial', 'Remota')),
  descripcion text not null,
  tecnico text,
  horas numeric(6,2) check (horas is null or horas >= 0),
  monto numeric(12,2) not null default 0 check (monto >= 0),
  creado_en timestamptz not null default now()
);
create index if not exists plataforma_visitas_empresa_idx on myappdb.plataforma_visitas (empresa_id, fecha desc);
-- Seguridad: solo los dueños -----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['plataforma_contratos', 'plataforma_instalaciones', 'plataforma_visitas'] loop
    execute format('alter table myappdb.%I enable row level security', t);
    execute format('revoke all on myappdb.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on myappdb.%I to authenticated', t);
    execute format('grant all on myappdb.%I to service_role', t);
    execute format('drop policy if exists %I on myappdb.%I', t || '_dueno', t);
    execute format('create policy %I on myappdb.%I for all to authenticated using ((select private.es_dueno_sistema())) with check ((select private.es_dueno_sistema()))', t || '_dueno', t);
    execute format('drop trigger if exists %I on myappdb.%I', t || '_bitacora', t);
    execute format('create trigger %I after insert or update or delete on myappdb.%I for each row execute function private.tg_bitacora()', t || '_bitacora', t);
  end loop;
end $$;
-- Un contrato vigente o firmado no se borra: se cancela.
drop policy if exists plataforma_contratos_dueno on myappdb.plataforma_contratos;
create policy plataforma_contratos_dueno on myappdb.plataforma_contratos for select to authenticated using ((select private.es_dueno_sistema()));
drop policy if exists plataforma_contratos_dueno_insert on myappdb.plataforma_contratos;
create policy plataforma_contratos_dueno_insert on myappdb.plataforma_contratos for insert to authenticated with check ((select private.es_dueno_sistema()));
drop policy if exists plataforma_contratos_dueno_update on myappdb.plataforma_contratos;
create policy plataforma_contratos_dueno_update on myappdb.plataforma_contratos for update to authenticated
  using ((select private.es_dueno_sistema())) with check ((select private.es_dueno_sistema()));
drop policy if exists plataforma_contratos_dueno_delete on myappdb.plataforma_contratos;
create policy plataforma_contratos_dueno_delete on myappdb.plataforma_contratos for delete to authenticated
  using ((select private.es_dueno_sistema()) and estado = 'Borrador' and firmado_en is null);
-- Resumen: agrega contratos, equipos y visitas -----------------------------------
create or replace function myappdb.plataforma_resumen()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hoy date := private.hoy_rd();
  v_mes date := date_trunc('month', private.hoy_rd())::date;
  v_empresas jsonb;
begin
  if not private.es_dueno_sistema() then raise exception 'Solo el dueño del sistema.'; end if;

  select coalesce(jsonb_agg(x order by x ->> 'nombre_comercial'), '[]'::jsonb) into v_empresas
  from (
    select jsonb_build_object(
      'id', e.id, 'nombre_comercial', e.nombre_comercial, 'razon_social', e.razon_social, 'rnc', e.rnc,
      'correo', e.correo, 'telefono', e.telefono, 'ciudad', e.ciudad, 'estado_empresa', e.estado, 'creado_en', e.creado_en,
      'usuarios', (select count(*) from myappdb.usuarios u where u.empresa_id = e.id),
      'usuarios_activos', (select count(*) from myappdb.usuarios u where u.empresa_id = e.id and u.estado = 'Activo'),
      'sucursales', (select count(*) from myappdb.sucursales su where su.idempresa = e.id),
      'ultimo_acceso', (select max(u.ultimo_acceso_en) from myappdb.usuarios u where u.empresa_id = e.id),
      'productos', (select count(*) from myappdb.products p where p.empresa_id = e.id),
      'facturas_mes', (select count(*) from myappdb.facturas f where f.idempres = e.id and f.fecha_factura >= v_mes and coalesce(f.estado, '') not in ('Anulada', 'Anulado')),
      'ventas_mes', (select coalesce(sum(f.total), 0) from myappdb.facturas f where f.idempres = e.id and f.fecha_factura >= v_mes and coalesce(f.estado, '') not in ('Anulada', 'Anulado')),
      'plan_id', s.plan_id, 'plan', pl.nombre, 'max_usuarios', pl.max_usuarios, 'max_sucursales', pl.max_sucursales,
      'estado', s.estado, 'fecha_inicio', s.fecha_inicio, 'prueba_hasta', s.prueba_hasta, 'pagado_hasta', s.pagado_hasta,
      'dias_gracia', s.dias_gracia, 'precio_mensual', s.precio_mensual, 'contacto_nombre', s.contacto_nombre,
      'contacto_telefono', s.contacto_telefono, 'notas', s.notas,
      'ultimo_pago', (select max(pg.fecha) from myappdb.plataforma_pagos pg where pg.empresa_id = e.id and pg.estado = 'Activo'),
      'contratos_vigentes', (select count(*) from myappdb.plataforma_contratos c where c.empresa_id = e.id and c.estado = 'Vigente'),
      'contrato_vence', (select min(c.fecha_fin) from myappdb.plataforma_contratos c where c.empresa_id = e.id and c.estado = 'Vigente' and c.fecha_fin is not null),
      'equipos', (select count(*) from myappdb.plataforma_instalaciones i where i.empresa_id = e.id and i.estado <> 'Retirada'),
      'ultima_visita', (select max(v.fecha) from myappdb.plataforma_visitas v where v.empresa_id = e.id)
    ) || case when s.empresa_id is null then jsonb_build_object('estado_calculado', 'Sin suscripción', 'vence', null, 'dias_restantes', null)
              else private.suscripcion_estado(s) end as x
    from myappdb.empresas e
    left join myappdb.plataforma_suscripciones s on s.empresa_id = e.id
    left join myappdb.plataforma_planes pl on pl.id = s.plan_id
  ) t;

  return jsonb_build_object(
    'hoy', v_hoy,
    'empresas', v_empresas,
    'totales', jsonb_build_object(
      'empresas', jsonb_array_length(v_empresas),
      'activas', (select count(*) from jsonb_array_elements(v_empresas) j where j ->> 'estado_calculado' = 'Activa'),
      'prueba', (select count(*) from jsonb_array_elements(v_empresas) j where j ->> 'estado' = 'Prueba' and j ->> 'estado_calculado' = 'Prueba'),
      'por_vencer', (select count(*) from jsonb_array_elements(v_empresas) j where j ->> 'estado_calculado' = 'Por vencer'),
      'en_gracia', (select count(*) from jsonb_array_elements(v_empresas) j where j ->> 'estado_calculado' = 'En gracia'),
      'vencidas', (select count(*) from jsonb_array_elements(v_empresas) j where j ->> 'estado_calculado' = 'Vencida'),
      'suspendidas', (select count(*) from jsonb_array_elements(v_empresas) j where j ->> 'estado_calculado' in ('Suspendida', 'Cancelada')),
      'ingreso_mensual', (select coalesce(sum((j ->> 'precio_mensual')::numeric), 0) from jsonb_array_elements(v_empresas) j
                           where j ->> 'estado' = 'Activa'),
      'cobrado_mes', (select coalesce(sum(monto), 0) from myappdb.plataforma_pagos where estado = 'Activo' and fecha >= v_mes),
      'cobrado_anio', (select coalesce(sum(monto), 0) from myappdb.plataforma_pagos where estado = 'Activo' and fecha >= date_trunc('year', v_hoy)::date),
      'contratos_vigentes', (select count(*) from myappdb.plataforma_contratos where estado = 'Vigente'),
      'contratos_por_vencer', (select count(*) from myappdb.plataforma_contratos where estado = 'Vigente' and fecha_fin between v_hoy and v_hoy + 30),
      'contratos_vencidos', (select count(*) from myappdb.plataforma_contratos where estado = 'Vigente' and fecha_fin < v_hoy),
      'equipos', (select count(*) from myappdb.plataforma_instalaciones where estado <> 'Retirada'),
      'garantias_por_vencer', (select count(*) from myappdb.plataforma_instalaciones where estado <> 'Retirada' and garantia_hasta between v_hoy and v_hoy + 30),
      'visitas_mes', (select count(*) from myappdb.plataforma_visitas where fecha >= v_mes),
      'servicios_mes', (select coalesce(sum(monto), 0) from myappdb.plataforma_visitas where fecha >= v_mes)
    )
  );
end;
$$;
revoke all on function myappdb.plataforma_resumen() from public, anon;
grant execute on function myappdb.plataforma_resumen() to authenticated;
commit;
