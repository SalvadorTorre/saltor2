begin;
-- ===========================================================================
-- Bitácora de auditoría: quién creó, editó, anuló o eliminó qué y cuándo,
-- con el valor anterior y el nuevo de cada campo cambiado.
-- Solo la ven los administradores de la empresa. Nadie la puede modificar.
-- ===========================================================================
create table if not exists myappdb.bitacora (
  id bigint generated always as identity primary key,
  empresa_id integer,
  fecha timestamptz not null default now(),
  auth_uid uuid,
  usuario_nombre text,
  tabla text not null,
  registro_id text,
  accion text not null,
  resumen text,
  cambios jsonb not null default '{}'::jsonb
);
create index if not exists bitacora_empresa_fecha_idx on myappdb.bitacora (empresa_id, fecha desc);
create index if not exists bitacora_registro_idx on myappdb.bitacora (tabla, registro_id);
alter table myappdb.bitacora enable row level security;
drop policy if exists bitacora_admin_select on myappdb.bitacora;
create policy bitacora_admin_select on myappdb.bitacora
  for select to authenticated
  using (empresa_id = (select private.current_empresa_id()) and (select private.current_user_is_admin()));
revoke all on myappdb.bitacora from anon, authenticated;
grant select on myappdb.bitacora to authenticated;
grant all on myappdb.bitacora to service_role;
create or replace function private.tg_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_row jsonb := case when tg_op = 'DELETE' then v_old else v_new end;
  v_cambios jsonb := '{}'::jsonb;
  v_accion text;
  v_ignorar text[] := array[
    'actualizado_en', 'updated_at', 'creado_en', 'created_at', 'existencia', 'balance', 'ultima_compra',
    'ultima_actualizacion', 'ultimo_acceso_en', 'usados', 'alerta', 'impreso_en', 'fec_firma', 'qr_link',
    'codSeguridad', 'ecf_ambiente', 'cierre_caja_id', 'numero_cierre', 'estado_dgii', 'estado_envio_dgii',
    'archivo', 'clave_cifrada', 'claveusuario', 'avatar', 'fechanf'];
  v_key text;
  v_empresa integer;
  v_usuario text;
begin
  -- Productos: el estado Activo/Agotado cambia solo con la existencia.
  if tg_table_name = 'products' then v_ignorar := v_ignorar || array['estado']; end if;
  -- Las actualizaciones de facturas hechas por el servidor (envío a la DGII) no son acciones de usuarios.
  if tg_table_name = 'facturas' and tg_op = 'UPDATE' and (select auth.uid()) is null then return null; end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any(v_ignorar) or v_key like 'dgii\_%';
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_cambios := v_cambios || jsonb_build_object(v_key, jsonb_build_object('antes', v_old -> v_key, 'despues', v_new -> v_key));
      end if;
    end loop;
    if v_cambios = '{}'::jsonb then return null; end if;
    v_accion := case
      when coalesce(v_new ->> 'estado', '') in ('Anulada', 'Anulado') and coalesce(v_old ->> 'estado', '') not in ('Anulada', 'Anulado') then 'Anular'
      else 'Editar' end;
  elsif tg_op = 'INSERT' then
    v_accion := 'Crear';
  else
    v_accion := 'Eliminar';
    -- Guarda los datos del registro eliminado (sin campos sensibles).
    select coalesce(jsonb_object_agg(k, jsonb_build_object('antes', v)), '{}'::jsonb) into v_cambios
    from jsonb_each(v_old) as e(k, v)
    where not (k = any(v_ignorar)) and k not like 'dgii\_%' and v <> 'null'::jsonb;
  end if;

  v_empresa := coalesce(
    nullif(v_row ->> 'empresa_id', '')::integer,
    nullif(v_row ->> 'idempres', '')::integer,
    case when tg_table_name = 'empresas' then nullif(v_row ->> 'id', '')::integer end,
    private.current_empresa_id());

  select u.nombre_completo into v_usuario from myappdb.usuarios u where u.auth_usuario_id = (select auth.uid()) limit 1;

  insert into myappdb.bitacora (empresa_id, auth_uid, usuario_nombre, tabla, registro_id, accion, resumen, cambios)
  values (
    v_empresa, (select auth.uid()), coalesce(v_usuario, case when (select auth.uid()) is null then 'Sistema' end),
    tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'codusuario', v_row ->> 'empresa_id'), v_accion,
    left(coalesce(
      v_row ->> 'numero_factura', v_row ->> 'numero_nota', v_row ->> 'numero_recibo', v_row ->> 'numero_cotizacion',
      nullif(concat_ws(' · ', v_row ->> 'codigo', v_row ->> 'descripcion'), ''),
      v_row ->> 'nombre_completo', v_row ->> 'nombre_comercial', v_row ->> 'tipo_ncf', v_row ->> 'ambiente', v_row ->> 'id'), 200),
    v_cambios);
  return null;
end;
$$;
revoke all on function private.tg_bitacora() from public, anon, authenticated;
do $$
declare
  t record;
begin
  for t in select * from (values
    ('products',            'insert or update or delete'),
    ('clients',             'insert or update or delete'),
    ('suplidores',          'insert or update or delete'),
    ('usuarios',            'insert or update or delete'),
    ('facturas',            'update or delete'),
    ('notas_credito',       'insert or delete'),
    ('recibos_cobro',       'update or delete'),
    ('cotizaciones',        'delete'),
    ('ncf_secuencias',      'insert or update or delete'),
    ('ecf_configuraciones', 'insert or update or delete'),
    ('empresas',            'update')
  ) as x(tabla, eventos)
  loop
    if to_regclass('myappdb.' || t.tabla) is null then continue; end if;
    execute format('drop trigger if exists %I on myappdb.%I', t.tabla || '_bitacora', t.tabla);
    execute format('create trigger %I after %s on myappdb.%I for each row execute function private.tg_bitacora()',
                   t.tabla || '_bitacora', t.eventos, t.tabla);
  end loop;
end;
$$;
commit;
