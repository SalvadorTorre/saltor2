begin;
-- ===========================================================================
-- Plataforma (fase 1): planes, suscripciones, pagos de las empresas y resumen.
-- Solo los dueños del sistema ven y modifican estas tablas.
-- Al vencer una suscripción el sistema SOLO AVISA; nunca bloquea.
-- Prueba: 15 días. Gracia después del vencimiento: 5 días. Cobro mensual en RD$.
-- ===========================================================================

create or replace function private.hoy_rd()
returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Santo_Domingo')::date; $$;
grant execute on function private.hoy_rd() to authenticated, service_role;
-- Planes ---------------------------------------------------------------------
create table if not exists myappdb.plataforma_planes (
  id integer generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  precio_mensual numeric(12,2) not null default 0 check (precio_mensual >= 0),
  max_usuarios integer check (max_usuarios is null or max_usuarios > 0),
  max_sucursales integer check (max_sucursales is null or max_sucursales > 0),
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
insert into myappdb.plataforma_planes (nombre, descripcion, precio_mensual, max_usuarios, max_sucursales, orden)
values
  ('BÁSICO', 'Facturación, inventario y caja para un negocio pequeño.', 1500, 2, 1, 1),
  ('PROFESIONAL', 'Todo el sistema con más usuarios.', 2500, 5, 2, 2),
  ('MULTI-SUCURSAL', 'Para empresas con varias sucursales.', 4500, 15, 5, 3)
on conflict (nombre) do nothing;
-- Suscripciones (una por empresa) -------------------------------------------
create table if not exists myappdb.plataforma_suscripciones (
  empresa_id integer primary key references myappdb.empresas(id) on delete cascade,
  plan_id integer references myappdb.plataforma_planes(id),
  estado text not null default 'Prueba' check (estado in ('Prueba', 'Activa', 'Suspendida', 'Cancelada')),
  fecha_inicio date not null default private.hoy_rd(),
  prueba_hasta date,
  pagado_hasta date,
  dias_gracia integer not null default 5 check (dias_gracia between 0 and 60),
  precio_mensual numeric(12,2) not null default 0 check (precio_mensual >= 0),
  contacto_nombre text,
  contacto_telefono text,
  notas text,
  actualizado_en timestamptz not null default now()
);
-- Pagos ----------------------------------------------------------------------
create sequence if not exists myappdb.plataforma_pagos_numero_seq;
grant usage on sequence myappdb.plataforma_pagos_numero_seq to service_role;
create table if not exists myappdb.plataforma_pagos (
  id bigint generated always as identity primary key,
  numero text not null unique,
  empresa_id integer not null references myappdb.empresas(id) on delete restrict,
  fecha date not null default private.hoy_rd(),
  meses integer not null check (meses between 1 and 36),
  monto numeric(12,2) not null check (monto > 0),
  forma_pago text not null,
  referencia text,
  notas text,
  periodo_desde date not null,
  periodo_hasta date not null,
  anterior_pagado_hasta date,
  anterior_estado text,
  estado text not null default 'Activo' check (estado in ('Activo', 'Anulado')),
  motivo_anulacion text,
  anulado_en timestamptz,
  registrado_por text,
  creado_en timestamptz not null default now()
);
create index if not exists plataforma_pagos_empresa_idx on myappdb.plataforma_pagos (empresa_id, fecha desc);
-- Seguridad: solo los dueños -------------------------------------------------
alter table myappdb.plataforma_planes enable row level security;
alter table myappdb.plataforma_suscripciones enable row level security;
alter table myappdb.plataforma_pagos enable row level security;
revoke all on myappdb.plataforma_planes, myappdb.plataforma_suscripciones, myappdb.plataforma_pagos from anon, authenticated;
grant select, insert, update, delete on myappdb.plataforma_planes to authenticated;
grant select, insert, update on myappdb.plataforma_suscripciones to authenticated;
grant select on myappdb.plataforma_pagos to authenticated;
grant all on myappdb.plataforma_planes, myappdb.plataforma_suscripciones, myappdb.plataforma_pagos to service_role;
drop policy if exists plataforma_planes_dueno on myappdb.plataforma_planes;
create policy plataforma_planes_dueno on myappdb.plataforma_planes for all to authenticated
  using ((select private.es_dueno_sistema())) with check ((select private.es_dueno_sistema()));
drop policy if exists plataforma_suscripciones_dueno on myappdb.plataforma_suscripciones;
create policy plataforma_suscripciones_dueno on myappdb.plataforma_suscripciones for all to authenticated
  using ((select private.es_dueno_sistema())) with check ((select private.es_dueno_sistema()));
drop policy if exists plataforma_pagos_dueno on myappdb.plataforma_pagos;
create policy plataforma_pagos_dueno on myappdb.plataforma_pagos for select to authenticated
  using ((select private.es_dueno_sistema()));
-- Los dueños ven la bitácora de todas las empresas.
drop policy if exists bitacora_dueno_select on myappdb.bitacora;
create policy bitacora_dueno_select on myappdb.bitacora for select to authenticated
  using ((select private.es_dueno_sistema()));
-- La bitácora registra los cambios de la plataforma.
drop trigger if exists plataforma_planes_bitacora on myappdb.plataforma_planes;
create trigger plataforma_planes_bitacora after insert or update or delete on myappdb.plataforma_planes
  for each row execute function private.tg_bitacora();
drop trigger if exists plataforma_suscripciones_bitacora on myappdb.plataforma_suscripciones;
create trigger plataforma_suscripciones_bitacora after insert or update on myappdb.plataforma_suscripciones
  for each row execute function private.tg_bitacora();
drop trigger if exists plataforma_pagos_bitacora on myappdb.plataforma_pagos;
create trigger plataforma_pagos_bitacora after insert or update on myappdb.plataforma_pagos
  for each row execute function private.tg_bitacora();
-- Toda empresa nueva arranca en prueba por 15 días con el plan básico.
create or replace function private.tg_empresa_suscripcion_prueba()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_plan record;
begin
  select id, precio_mensual into v_plan from myappdb.plataforma_planes where activo order by orden, id limit 1;
  insert into myappdb.plataforma_suscripciones (empresa_id, plan_id, estado, fecha_inicio, prueba_hasta, precio_mensual)
  values (new.id, v_plan.id, 'Prueba', private.hoy_rd(), private.hoy_rd() + 15, coalesce(v_plan.precio_mensual, 0))
  on conflict (empresa_id) do nothing;
  return null;
end;
$$;
revoke all on function private.tg_empresa_suscripcion_prueba() from public, anon, authenticated;
drop trigger if exists empresas_suscripcion_prueba on myappdb.empresas;
create trigger empresas_suscripcion_prueba after insert on myappdb.empresas
  for each row execute function private.tg_empresa_suscripcion_prueba();
-- Empresas existentes: arrancan en prueba; el dueño las ajusta después.
insert into myappdb.plataforma_suscripciones (empresa_id, plan_id, estado, fecha_inicio, prueba_hasta, precio_mensual)
select e.id, p.id, 'Prueba', private.hoy_rd(), private.hoy_rd() + 15, p.precio_mensual
from myappdb.empresas e
cross join lateral (select id, precio_mensual from myappdb.plataforma_planes where activo order by orden, id limit 1) p
on conflict (empresa_id) do nothing;
-- Estado calculado de una suscripción ----------------------------------------
-- Devuelve: Prueba, Activa, Por vencer (≤ 7 días), En gracia, Vencida, Suspendida, Cancelada.
create or replace function private.suscripcion_estado(s myappdb.plataforma_suscripciones)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  v_hoy date := private.hoy_rd();
  v_vence date := case when s.estado = 'Prueba' then s.prueba_hasta else coalesce(s.pagado_hasta, s.prueba_hasta) end;
  v_dias integer := case when v_vence is null then null else v_vence - v_hoy end;
  v_calc text;
begin
  if s.estado in ('Suspendida', 'Cancelada') then v_calc := s.estado;
  elsif v_vence is null then v_calc := s.estado;
  elsif v_dias < -s.dias_gracia then v_calc := 'Vencida';
  elsif v_dias < 0 then v_calc := 'En gracia';
  elsif v_dias <= 7 then v_calc := case when s.estado = 'Prueba' then 'Prueba' else 'Por vencer' end;
  else v_calc := s.estado;
  end if;
  return jsonb_build_object('estado_calculado', v_calc, 'vence', v_vence, 'dias_restantes', v_dias);
end;
$$;
revoke all on function private.suscripcion_estado(myappdb.plataforma_suscripciones) from public, anon;
grant execute on function private.suscripcion_estado(myappdb.plataforma_suscripciones) to authenticated;
-- Registrar un pago: extiende la suscripción por los meses pagados -------------
create or replace function myappdb.registrar_pago_plataforma(p_pago jsonb)
returns myappdb.plataforma_pagos
language plpgsql security definer set search_path = ''
as $$
declare
  v_empresa integer := (p_pago ->> 'empresa_id')::integer;
  v_meses integer := coalesce((p_pago ->> 'meses')::integer, 1);
  v_monto numeric := (p_pago ->> 'monto')::numeric;
  v_fecha date := coalesce(nullif(p_pago ->> 'fecha', '')::date, private.hoy_rd());
  v_s myappdb.plataforma_suscripciones;
  v_base date;
  v_desde date;
  v_hasta date;
  v_usuario text;
  v_pago myappdb.plataforma_pagos;
begin
  if not private.es_dueno_sistema() then raise exception 'Solo el dueño del sistema puede registrar pagos.'; end if;
  if v_monto is null or v_monto <= 0 then raise exception 'El monto debe ser mayor que cero.'; end if;
  if v_meses < 1 or v_meses > 36 then raise exception 'Los meses deben estar entre 1 y 36.'; end if;
  if coalesce(trim(p_pago ->> 'forma_pago'), '') = '' then raise exception 'Indica la forma de pago.'; end if;

  select * into v_s from myappdb.plataforma_suscripciones where empresa_id = v_empresa for update;
  if not found then
    insert into myappdb.plataforma_suscripciones (empresa_id, estado, prueba_hasta) values (v_empresa, 'Prueba', private.hoy_rd())
    returning * into v_s;
  end if;

  -- Si está al día o en gracia, el pago continúa desde el vencimiento; si venció hace tiempo, desde hoy.
  v_base := case when v_s.estado = 'Prueba' then coalesce(v_s.pagado_hasta, v_s.prueba_hasta) else coalesce(v_s.pagado_hasta, v_s.prueba_hasta) end;
  if v_base is null or v_base < private.hoy_rd() - v_s.dias_gracia then v_base := private.hoy_rd(); end if;
  v_desde := v_base;
  v_hasta := (v_base + make_interval(months => v_meses))::date;

  select u.nombre_completo into v_usuario from myappdb.usuarios u where u.auth_usuario_id = (select auth.uid()) limit 1;

  insert into myappdb.plataforma_pagos (numero, empresa_id, fecha, meses, monto, forma_pago, referencia, notas,
    periodo_desde, periodo_hasta, anterior_pagado_hasta, anterior_estado, registrado_por)
  values ('PG-' || lpad(nextval('myappdb.plataforma_pagos_numero_seq')::text, 6, '0'), v_empresa, v_fecha, v_meses, v_monto,
    trim(p_pago ->> 'forma_pago'), nullif(trim(p_pago ->> 'referencia'), ''), nullif(trim(p_pago ->> 'notas'), ''),
    v_desde, v_hasta, v_s.pagado_hasta, v_s.estado, v_usuario)
  returning * into v_pago;

  update myappdb.plataforma_suscripciones
     set pagado_hasta = v_hasta,
         estado = case when estado = 'Cancelada' then estado else 'Activa' end,
         actualizado_en = now()
   where empresa_id = v_empresa;

  return v_pago;
end;
$$;
revoke all on function myappdb.registrar_pago_plataforma(jsonb) from public, anon;
grant execute on function myappdb.registrar_pago_plataforma(jsonb) to authenticated;
-- Anular un pago: solo el último pago activo de la empresa; devuelve la suscripción a como estaba.
create or replace function myappdb.anular_pago_plataforma(p_pago_id bigint, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pago myappdb.plataforma_pagos;
begin
  if not private.es_dueno_sistema() then raise exception 'Solo el dueño del sistema puede anular pagos.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la anulación.'; end if;
  select * into v_pago from myappdb.plataforma_pagos where id = p_pago_id for update;
  if not found then raise exception 'El pago no existe.'; end if;
  if v_pago.estado = 'Anulado' then raise exception 'El pago ya está anulado.'; end if;
  if exists (select 1 from myappdb.plataforma_pagos where empresa_id = v_pago.empresa_id and estado = 'Activo' and id > v_pago.id) then
    raise exception 'Solo se puede anular el último pago de la empresa. Anula primero los pagos posteriores.';
  end if;

  update myappdb.plataforma_pagos
     set estado = 'Anulado', motivo_anulacion = trim(p_motivo), anulado_en = now()
   where id = p_pago_id;

  update myappdb.plataforma_suscripciones
     set pagado_hasta = v_pago.anterior_pagado_hasta,
         estado = case when estado = 'Activa' then coalesce(v_pago.anterior_estado, 'Prueba') else estado end,
         actualizado_en = now()
   where empresa_id = v_pago.empresa_id;
end;
$$;
revoke all on function myappdb.anular_pago_plataforma(bigint, text) from public, anon;
grant execute on function myappdb.anular_pago_plataforma(bigint, text) to authenticated;
-- Extender o dar días de prueba -------------------------------------------------
create or replace function myappdb.extender_prueba_plataforma(p_empresa_id integer, p_dias integer)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.es_dueno_sistema() then raise exception 'Solo el dueño del sistema puede dar días de prueba.'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 90 then raise exception 'Los días deben estar entre 1 y 90.'; end if;
  insert into myappdb.plataforma_suscripciones (empresa_id, estado, prueba_hasta)
  values (p_empresa_id, 'Prueba', private.hoy_rd() + p_dias)
  on conflict (empresa_id) do update
    set estado = 'Prueba',
        prueba_hasta = greatest(coalesce(myappdb.plataforma_suscripciones.prueba_hasta, private.hoy_rd()), private.hoy_rd()) + p_dias,
        actualizado_en = now();
end;
$$;
revoke all on function myappdb.extender_prueba_plataforma(integer, integer) from public, anon;
grant execute on function myappdb.extender_prueba_plataforma(integer, integer) to authenticated;
-- Resumen para el panel de la plataforma ----------------------------------------
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
      'ultimo_pago', (select max(pg.fecha) from myappdb.plataforma_pagos pg where pg.empresa_id = e.id and pg.estado = 'Activo')
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
      'cobrado_anio', (select coalesce(sum(monto), 0) from myappdb.plataforma_pagos where estado = 'Activo' and fecha >= date_trunc('year', v_hoy)::date)
    )
  );
end;
$$;
revoke all on function myappdb.plataforma_resumen() from public, anon;
grant execute on function myappdb.plataforma_resumen() to authenticated;
-- Aviso para los usuarios de cada empresa (nunca bloquea) ------------------------
create or replace function myappdb.estado_suscripcion()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_s myappdb.plataforma_suscripciones;
  v_e jsonb;
  v_dias integer;
  v_calc text;
  v_msg text;
begin
  select * into v_s from myappdb.plataforma_suscripciones where empresa_id = private.current_empresa_id();
  if not found then return null; end if;
  v_e := private.suscripcion_estado(v_s);
  v_dias := (v_e ->> 'dias_restantes')::integer;
  v_calc := v_e ->> 'estado_calculado';
  v_msg := case
    when v_calc = 'Suspendida' then 'La suscripción de esta empresa está suspendida. Comunícate con SaltorSystem.'
    when v_calc = 'Cancelada' then 'La suscripción de esta empresa está cancelada. Comunícate con SaltorSystem.'
    when v_calc = 'Vencida' then 'La suscripción venció hace ' || abs(v_dias) || ' día(s). Comunícate con SaltorSystem para renovarla.'
    when v_calc = 'En gracia' then 'La suscripción venció hace ' || abs(v_dias) || ' día(s). Tienes ' || (v_s.dias_gracia + v_dias) || ' día(s) de gracia para renovarla.'
    when v_s.estado = 'Prueba' and v_dias is not null and v_dias <= 7 then
      case when v_dias = 0 then 'El período de prueba termina hoy.' else 'Quedan ' || v_dias || ' día(s) del período de prueba.' end
    when v_calc = 'Por vencer' then
      case when v_dias = 0 then 'La suscripción vence hoy.' else 'La suscripción vence en ' || v_dias || ' día(s).' end
    else null end;
  return v_e || jsonb_build_object('estado', v_s.estado, 'mensaje', v_msg);
end;
$$;
revoke all on function myappdb.estado_suscripcion() from public, anon;
grant execute on function myappdb.estado_suscripcion() to authenticated;
commit;
