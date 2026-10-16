begin;

-- ===========================================================================
-- Plataforma (fase 3): soporte (tickets), avisos a los usuarios, salud de cada
-- empresa y exportación completa de los datos de una empresa.
-- ===========================================================================

-- Soporte: tickets ----------------------------------------------------------------
create sequence if not exists myappdb.plataforma_tickets_numero_seq;

create table if not exists myappdb.plataforma_tickets (
  id bigint generated always as identity primary key,
  numero text not null unique,
  empresa_id integer not null references myappdb.empresas(id) on delete cascade,
  asunto text not null check (length(trim(asunto)) > 0),
  categoria text not null default 'Consulta' check (categoria in ('Consulta', 'Error', 'Facturación electrónica', 'Mejora', 'Capacitación', 'Cobro', 'Otro')),
  prioridad text not null default 'Normal' check (prioridad in ('Baja', 'Normal', 'Alta', 'Urgente')),
  estado text not null default 'Abierto' check (estado in ('Abierto', 'En proceso', 'Esperando cliente', 'Resuelto', 'Cerrado')),
  creado_por uuid,
  creado_por_nombre text,
  ultimo_autor text not null default 'Cliente' check (ultimo_autor in ('Cliente', 'Soporte')),
  ultima_actividad timestamptz not null default now(),
  cerrado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists plataforma_tickets_empresa_idx on myappdb.plataforma_tickets (empresa_id, ultima_actividad desc);
create index if not exists plataforma_tickets_estado_idx on myappdb.plataforma_tickets (estado, ultima_actividad desc);

create table if not exists myappdb.plataforma_ticket_mensajes (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references myappdb.plataforma_tickets(id) on delete cascade,
  autor_uid uuid,
  autor_nombre text,
  es_soporte boolean not null default false,
  mensaje text not null check (length(trim(mensaje)) > 0),
  creado_en timestamptz not null default now()
);
create index if not exists plataforma_ticket_mensajes_ticket_idx on myappdb.plataforma_ticket_mensajes (ticket_id, creado_en);

-- Quien crea el ticket, su empresa y el número los pone la base de datos, no la pantalla.
create or replace function private.tg_plataforma_ticket_antes()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_dueno boolean := private.es_dueno_sistema();
begin
  if tg_op = 'INSERT' then
    new.numero := 'TK-' || lpad(nextval('myappdb.plataforma_tickets_numero_seq')::text, 5, '0');
    new.creado_por := (select auth.uid());
    select u.nombre_completo into new.creado_por_nombre from myappdb.usuarios u where u.auth_usuario_id = (select auth.uid()) limit 1;
    if not v_dueno or new.empresa_id is null then new.empresa_id := private.current_empresa_id(); end if;
    if new.empresa_id is null then raise exception 'No se pudo identificar la empresa del usuario.'; end if;
    if not v_dueno then new.estado := 'Abierto'; end if;
    new.ultimo_autor := case when v_dueno then 'Soporte' else 'Cliente' end;
    new.ultima_actividad := now();
    new.creado_en := now();
    new.cerrado_en := null;
    return new;
  end if;

  -- UPDATE: la empresa solo puede cerrar o reabrir su ticket.
  if not v_dueno then
    if new.estado not in ('Cerrado', 'Abierto') then new.estado := old.estado; end if;
    new.asunto := old.asunto; new.categoria := old.categoria; new.prioridad := old.prioridad;
  end if;
  new.numero := old.numero; new.empresa_id := old.empresa_id; new.creado_por := old.creado_por;
  new.creado_por_nombre := old.creado_por_nombre; new.creado_en := old.creado_en;
  if new.estado in ('Resuelto', 'Cerrado') and old.estado not in ('Resuelto', 'Cerrado') then new.cerrado_en := now();
  elsif new.estado not in ('Resuelto', 'Cerrado') then new.cerrado_en := null; end if;
  if new.estado is distinct from old.estado then new.ultima_actividad := now(); end if;
  return new;
end;
$$;
revoke all on function private.tg_plataforma_ticket_antes() from public, anon, authenticated;
drop trigger if exists plataforma_tickets_antes on myappdb.plataforma_tickets;
create trigger plataforma_tickets_antes before insert or update on myappdb.plataforma_tickets
  for each row execute function private.tg_plataforma_ticket_antes();

create or replace function private.tg_plataforma_mensaje_antes()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_dueno boolean := private.es_dueno_sistema();
begin
  new.autor_uid := (select auth.uid());
  select u.nombre_completo into new.autor_nombre from myappdb.usuarios u where u.auth_usuario_id = (select auth.uid()) limit 1;
  new.es_soporte := v_dueno;
  new.creado_en := now();
  new.mensaje := trim(new.mensaje);
  return new;
end;
$$;
revoke all on function private.tg_plataforma_mensaje_antes() from public, anon, authenticated;
drop trigger if exists plataforma_ticket_mensajes_antes on myappdb.plataforma_ticket_mensajes;
create trigger plataforma_ticket_mensajes_antes before insert on myappdb.plataforma_ticket_mensajes
  for each row execute function private.tg_plataforma_mensaje_antes();

-- Cada mensaje mueve el ticket: si responde soporte queda "Esperando cliente"; si responde el cliente se reabre.
create or replace function private.tg_plataforma_mensaje_despues()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update myappdb.plataforma_tickets t
     set ultimo_autor = case when new.es_soporte then 'Soporte' else 'Cliente' end,
         ultima_actividad = now(),
         estado = case
           when new.es_soporte and t.estado in ('Abierto', 'En proceso') then 'Esperando cliente'
           when not new.es_soporte and t.estado in ('Esperando cliente', 'Resuelto', 'Cerrado') then 'Abierto'
           else t.estado end,
         cerrado_en = case when not new.es_soporte and t.estado in ('Resuelto', 'Cerrado') then null else t.cerrado_en end
   where t.id = new.ticket_id;
  return null;
end;
$$;
revoke all on function private.tg_plataforma_mensaje_despues() from public, anon, authenticated;
drop trigger if exists plataforma_ticket_mensajes_despues on myappdb.plataforma_ticket_mensajes;
create trigger plataforma_ticket_mensajes_despues after insert on myappdb.plataforma_ticket_mensajes
  for each row execute function private.tg_plataforma_mensaje_despues();

alter table myappdb.plataforma_tickets enable row level security;
alter table myappdb.plataforma_ticket_mensajes enable row level security;
revoke all on myappdb.plataforma_tickets, myappdb.plataforma_ticket_mensajes from anon, authenticated;
grant select, insert, update on myappdb.plataforma_tickets to authenticated;
grant select, insert on myappdb.plataforma_ticket_mensajes to authenticated;
grant all on myappdb.plataforma_tickets, myappdb.plataforma_ticket_mensajes to service_role;

drop policy if exists plataforma_tickets_select on myappdb.plataforma_tickets;
create policy plataforma_tickets_select on myappdb.plataforma_tickets for select to authenticated
  using ((select private.es_dueno_sistema()) or empresa_id = (select private.current_empresa_id()));
drop policy if exists plataforma_tickets_insert on myappdb.plataforma_tickets;
create policy plataforma_tickets_insert on myappdb.plataforma_tickets for insert to authenticated
  with check ((select private.es_dueno_sistema()) or empresa_id = (select private.current_empresa_id()));
drop policy if exists plataforma_tickets_update on myappdb.plataforma_tickets;
create policy plataforma_tickets_update on myappdb.plataforma_tickets for update to authenticated
  using ((select private.es_dueno_sistema()) or empresa_id = (select private.current_empresa_id()))
  with check ((select private.es_dueno_sistema()) or empresa_id = (select private.current_empresa_id()));

drop policy if exists plataforma_ticket_mensajes_select on myappdb.plataforma_ticket_mensajes;
create policy plataforma_ticket_mensajes_select on myappdb.plataforma_ticket_mensajes for select to authenticated
  using ((select private.es_dueno_sistema()) or exists (
    select 1 from myappdb.plataforma_tickets t where t.id = ticket_id and t.empresa_id = (select private.current_empresa_id())));
drop policy if exists plataforma_ticket_mensajes_insert on myappdb.plataforma_ticket_mensajes;
create policy plataforma_ticket_mensajes_insert on myappdb.plataforma_ticket_mensajes for insert to authenticated
  with check ((select private.es_dueno_sistema()) or exists (
    select 1 from myappdb.plataforma_tickets t where t.id = ticket_id and t.empresa_id = (select private.current_empresa_id())));

-- Avisos a los usuarios ----------------------------------------------------------
create table if not exists myappdb.plataforma_avisos (
  id bigint generated always as identity primary key,
  titulo text not null check (length(trim(titulo)) > 0),
  mensaje text,
  nivel text not null default 'Información' check (nivel in ('Información', 'Advertencia', 'Urgente')),
  empresa_id integer references myappdb.empresas(id) on delete cascade,
  desde date not null default private.hoy_rd(),
  hasta date,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  check (hasta is null or hasta >= desde)
);

alter table myappdb.plataforma_avisos enable row level security;
revoke all on myappdb.plataforma_avisos from anon, authenticated;
grant select, insert, update, delete on myappdb.plataforma_avisos to authenticated;
grant all on myappdb.plataforma_avisos to service_role;

drop policy if exists plataforma_avisos_dueno on myappdb.plataforma_avisos;
create policy plataforma_avisos_dueno on myappdb.plataforma_avisos for all to authenticated
  using ((select private.es_dueno_sistema())) with check ((select private.es_dueno_sistema()));
-- Los usuarios ven los avisos activos de hoy, generales o de su empresa.
drop policy if exists plataforma_avisos_usuarios on myappdb.plataforma_avisos;
create policy plataforma_avisos_usuarios on myappdb.plataforma_avisos for select to authenticated
  using (activo and desde <= private.hoy_rd() and (hasta is null or hasta >= private.hoy_rd())
         and (empresa_id is null or empresa_id = (select private.current_empresa_id())));

drop trigger if exists plataforma_avisos_bitacora on myappdb.plataforma_avisos;
create trigger plataforma_avisos_bitacora after insert or update or delete on myappdb.plataforma_avisos
  for each row execute function private.tg_bitacora();

-- Salud de cada empresa -------------------------------------------------------------
create or replace function private.fecha_flexible(p text)
returns date language sql immutable set search_path = ''
as $$
  select case
    when p ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(p, 'DD/MM/YYYY')
    when p ~ '^\d{4}-\d{2}-\d{2}' then left(p, 10)::date
  end;
$$;

create or replace function myappdb.plataforma_salud()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hoy date := private.hoy_rd();
  v_out jsonb := '[]'::jsonb;
  e record;
  v_checks jsonb;
  v_ultimo timestamptz;
  v_dias integer;
  v_n integer;
  v_m integer;
  v_cert date;
  v_amb text;
  s record;
  v_venc date;
  v_fact30 integer;
begin
  if not private.es_dueno_sistema() then raise exception 'Solo el dueño del sistema.'; end if;

  for e in select id, nombre_comercial, rnc from myappdb.empresas order by nombre_comercial loop
    v_checks := '[]'::jsonb;

    -- Uso del sistema
    select max(ultimo_acceso_en) into v_ultimo from myappdb.usuarios where empresa_id = e.id;
    v_dias := case when v_ultimo is null then null else v_hoy - (v_ultimo at time zone 'America/Santo_Domingo')::date end;
    v_checks := v_checks || jsonb_build_object('area', 'Uso',
      'nivel', case when v_dias is null or v_dias > 30 then 'bad' when v_dias > 7 then 'warn' else 'ok' end,
      'texto', case when v_dias is null then 'Nadie ha entrado al sistema' when v_dias = 0 then 'Usado hoy' else 'Último acceso hace ' || v_dias || ' día(s)' end);

    select count(*) into v_fact30 from myappdb.facturas where idempres = e.id and fecha_factura >= v_hoy - 30 and coalesce(estado, '') not in ('Anulada', 'Anulado');
    v_checks := v_checks || jsonb_build_object('area', 'Ventas',
      'nivel', case when v_fact30 = 0 then 'warn' else 'ok' end,
      'texto', case when v_fact30 = 0 then 'Sin facturas en los últimos 30 días' else v_fact30 || ' factura(s) en los últimos 30 días' end);

    -- Comprobantes electrónicos sin aceptar por la DGII
    select count(*) filter (where coalesce(dgii_estado, estado_dgii, '') ilike 'rechaz%'),
           count(*) filter (where coalesce(dgii_estado, estado_dgii, 'No enviado') not ilike 'acept%' and coalesce(dgii_estado, estado_dgii, '') not ilike 'rechaz%')
      into v_n, v_m
      from myappdb.facturas
     where idempres = e.id and tipo_ncf like 'E%' and coalesce(estado, '') not in ('Anulada', 'Anulado');
    v_n := v_n + (select count(*) from myappdb.notas_credito where idempres = e.id and coalesce(estado_dgii, '') ilike 'rechaz%')
               + (select count(*) from myappdb.gastos_menores where idempres = e.id and coalesce(estado_dgii, '') ilike 'rechaz%');
    v_m := v_m + (select count(*) from myappdb.notas_credito where idempres = e.id and coalesce(estado_dgii, 'Sin enviar') not ilike 'acept%' and coalesce(estado_dgii, '') not ilike 'rechaz%')
               + (select count(*) from myappdb.gastos_menores where idempres = e.id and coalesce(estado_dgii, 'Sin enviar') not ilike 'acept%' and coalesce(estado_dgii, '') not ilike 'rechaz%');
    v_checks := v_checks || jsonb_build_object('area', 'DGII',
      'nivel', case when v_n > 0 then 'bad' when v_m > 0 then 'warn' else 'ok' end,
      'texto', case when v_n = 0 and v_m = 0 then 'Todos los e-CF aceptados'
                    else concat_ws(' · ', case when v_n > 0 then v_n || ' rechazado(s)' end, case when v_m > 0 then v_m || ' sin enviar o pendiente(s)' end) end);

    -- Secuencias de comprobantes
    v_n := 0;
    for s in select tipo_ncf, rango_inicial, rango_final, usados, total, porcentaje_alerta, fecha_vencimiento::text as venc
               from myappdb.ncf_secuencias where empresa_id = e.id and coalesce(estado, 'Activa') = 'Activa' loop
      v_venc := private.fecha_flexible(s.venc);
      if coalesce(s.total, 0) > 0 and coalesce(s.usados, 0) * 100.0 / s.total >= coalesce(s.porcentaje_alerta, 80) then
        v_checks := v_checks || jsonb_build_object('area', 'NCF', 'nivel', case when s.usados >= s.total then 'bad' else 'warn' end,
          'texto', left(s.tipo_ncf, 40) || ': usados ' || s.usados || ' de ' || s.total);
        v_n := v_n + 1;
      end if;
      if v_venc is not null and v_venc <= v_hoy + 30 then
        v_checks := v_checks || jsonb_build_object('area', 'NCF', 'nivel', case when v_venc < v_hoy then 'bad' else 'warn' end,
          'texto', left(s.tipo_ncf, 40) || case when v_venc < v_hoy then ': secuencia vencida' else ': vence en ' || (v_venc - v_hoy) || ' día(s)' end);
        v_n := v_n + 1;
      end if;
    end loop;
    if v_n = 0 then
      v_checks := v_checks || jsonb_build_object('area', 'NCF',
        'nivel', case when exists (select 1 from myappdb.ncf_secuencias where empresa_id = e.id) then 'ok' else 'info' end,
        'texto', case when exists (select 1 from myappdb.ncf_secuencias where empresa_id = e.id) then 'Secuencias con disponibilidad' else 'Sin secuencias registradas' end);
    end if;

    -- Facturación electrónica: certificado y ambiente
    select ambiente into v_amb from myappdb.ecf_configuraciones where empresa_id = e.id;
    select max(valido_hasta)::date into v_cert from myappdb.certificados_firma_digital where empresa_id = e.id;
    if v_amb is not null or v_cert is not null then
      v_checks := v_checks || jsonb_build_object('area', 'Certificado',
        'nivel', case when v_cert is null or v_cert < v_hoy then 'bad' when v_cert <= v_hoy + 60 then 'warn' else 'ok' end,
        'texto', case when v_cert is null then 'Sin certificado digital' when v_cert < v_hoy then 'Certificado vencido' else 'Certificado vence el ' || to_char(v_cert, 'DD/MM/YYYY') end);
      v_checks := v_checks || jsonb_build_object('area', 'e-CF',
        'nivel', case when upper(coalesce(v_amb, '')) in ('TEST', 'TESTECF', 'CERTECF', 'PRUEBA') then 'info' else 'ok' end,
        'texto', 'Ambiente: ' || coalesce(v_amb, 'sin configurar'));
    end if;

    -- Suscripción
    select private.suscripcion_estado(ps) ->> 'estado_calculado' into v_amb from myappdb.plataforma_suscripciones ps where ps.empresa_id = e.id;
    if v_amb is not null then
      v_checks := v_checks || jsonb_build_object('area', 'Suscripción',
        'nivel', case when v_amb in ('Vencida', 'Suspendida', 'Cancelada') then 'bad' when v_amb in ('En gracia', 'Por vencer') then 'warn' when v_amb = 'Prueba' then 'info' else 'ok' end,
        'texto', v_amb);
    end if;

    -- Soporte pendiente
    select count(*) into v_n from myappdb.plataforma_tickets where empresa_id = e.id and estado not in ('Resuelto', 'Cerrado');
    if v_n > 0 then
      v_checks := v_checks || jsonb_build_object('area', 'Soporte', 'nivel', 'warn', 'texto', v_n || ' ticket(s) abiertos');
    end if;

    v_out := v_out || jsonb_build_object(
      'id', e.id, 'nombre_comercial', e.nombre_comercial, 'rnc', e.rnc, 'checks', v_checks,
      'nivel', case
        when exists (select 1 from jsonb_array_elements(v_checks) c where c ->> 'nivel' = 'bad') then 'bad'
        when exists (select 1 from jsonb_array_elements(v_checks) c where c ->> 'nivel' = 'warn') then 'warn'
        else 'ok' end);
  end loop;
  return v_out;
end;
$$;
revoke all on function myappdb.plataforma_salud() from public, anon;
grant execute on function myappdb.plataforma_salud() to authenticated;

-- Exportación completa de una empresa (respaldo / entrega de datos al cliente) -------
-- No incluye claves ni el certificado digital.
create or replace function myappdb.plataforma_exportar_empresa(p_empresa_id integer)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  t record;
  v_rows jsonb;
begin
  if not private.es_dueno_sistema() then raise exception 'Solo el dueño del sistema.'; end if;
  if not exists (select 1 from myappdb.empresas where id = p_empresa_id) then raise exception 'La empresa no existe.'; end if;

  for t in select * from (values
    ('empresas', 'id = $1', null),
    ('sucursales', 'idempresa = $1', null),
    ('usuarios', 'empresa_id = $1', array['claveusuario', 'avatar']),
    ('clients', 'empresa_id = $1', null),
    ('suplidores', 'empresa_id = $1', null),
    ('products', 'empresa_id = $1', null),
    ('movimientos_inventario', 'empresa_id = $1', null),
    ('product_entry_headers', 'empresa_id = $1', null),
    ('product_entries', 'empresa_id = $1', null),
    ('facturas', 'idempres = $1', array['dgii_xml', 'dgii_request_json', 'dgii_response_raw']),
    ('factura_detalles', 'factura_id in (select id from myappdb.facturas where idempres = $1)', null),
    ('notas_credito', 'idempres = $1', array['dgii_request_json', 'dgii_response_raw']),
    ('nota_credito_detalles', 'nota_credito_id in (select id from myappdb.notas_credito where idempres = $1)', null),
    ('cotizaciones', 'idempres = $1', null),
    ('cotizacion_detalles', 'cotizacion_id in (select id from myappdb.cotizaciones where idempres = $1)', null),
    ('cxc_saldos_iniciales', 'empresa_id = $1', null),
    ('recibos_cobro', 'empresa_id = $1', null),
    ('recibo_cobro_aplicaciones', 'recibo_id in (select id from myappdb.recibos_cobro where empresa_id = $1)', null),
    ('cierres_caja', 'empresa_id = $1', null),
    ('cierre_caja_facturas', 'cierre_caja_id in (select id from myappdb.cierres_caja where empresa_id = $1)', null),
    ('gastos_menores', 'idempres = $1', array['dgii_request_json', 'dgii_response_raw']),
    ('compras_606', 'idempres = $1', null),
    ('comprobantes_e41', 'idempres = $1', null),
    ('ncf_secuencias', 'empresa_id = $1', null),
    ('ncf_empresas', 'empresa_id = $1', null),
    ('ecf_configuraciones', 'empresa_id = $1', null)
  ) as x(tabla, condicion, excluir) loop
    if to_regclass('myappdb.' || t.tabla) is null then continue; end if;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(r) - coalesce($2, array[]::text[])), ''[]''::jsonb) from myappdb.%I r where %s',
      t.tabla, t.condicion)
      into v_rows using p_empresa_id, t.excluir;
    v := v || jsonb_build_object(t.tabla, v_rows);
  end loop;

  return jsonb_build_object('exportado_en', now(), 'empresa_id', p_empresa_id, 'formato', 'SaltorSystem 1', 'tablas', v);
end;
$$;
revoke all on function myappdb.plataforma_exportar_empresa(integer) from public, anon;
grant execute on function myappdb.plataforma_exportar_empresa(integer) to authenticated;

commit;
