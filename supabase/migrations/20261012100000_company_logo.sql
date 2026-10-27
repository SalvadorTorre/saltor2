begin;
-- ===========================================================================
-- Logo propio de cada empresa (imagen pequeña guardada como data URL).
-- Se muestra en la barra superior y en la impresión de facturas.
-- ===========================================================================
alter table myappdb.empresas add column if not exists logo text;
alter table myappdb.empresas drop constraint if exists empresas_logo_formato;
alter table myappdb.empresas add constraint empresas_logo_formato
  check (logo is null or (logo ~ '^data:image/(png|jpeg|webp);base64,' and length(logo) <= 700000));
-- La bitácora no copia valores largos (como el logo): anota que cambió.
create or replace function private.bitacora_valor(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) = 'string' and length(p #>> '{}') > 300
      then to_jsonb(case when p #>> '{}' like 'data:image/%' then '(imagen)' else left(p #>> '{}', 300) || '…' end)
    else p
  end;
$$;
revoke all on function private.bitacora_valor(jsonb) from public, anon;
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
        v_cambios := v_cambios || jsonb_build_object(v_key, jsonb_build_object(
          'antes', private.bitacora_valor(v_old -> v_key), 'despues', private.bitacora_valor(v_new -> v_key)));
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
    select coalesce(jsonb_object_agg(k, jsonb_build_object('antes', private.bitacora_valor(v))), '{}'::jsonb) into v_cambios
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
commit;
