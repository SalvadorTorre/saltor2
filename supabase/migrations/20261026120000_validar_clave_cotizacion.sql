create table if not exists private.intentos_clave_cotizacion (
  usuario_auth uuid not null,
  fecha timestamptz not null default now()
);

create index if not exists intentos_clave_cotizacion_usuario_fecha
  on private.intentos_clave_cotizacion (usuario_auth, fecha);

create or replace function myappdb.validar_clave_cotizacion(p_clave text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_empresa integer;
  v_count integer;
  v_nombre text;
begin
  if v_uid is null then return jsonb_build_object('error', 'Sesion no valida.'); end if;
  v_empresa := private.current_empresa_id();
  if v_empresa is null then return jsonb_build_object('error', 'No hay una empresa activa.'); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  delete from private.intentos_clave_cotizacion where usuario_auth = v_uid and fecha < now() - interval '5 minutes';
  if (select count(*) from private.intentos_clave_cotizacion where usuario_auth = v_uid) >= 5 then
    return jsonb_build_object('error', 'Demasiados intentos. Espera cinco minutos.');
  end if;
  select count(*), min(nombre_completo) into v_count, v_nombre
    from myappdb.usuarios
    where empresa_id = v_empresa and estado = 'Activo'
      and claveusuario is not null and claveusuario::text = p_clave;
  if v_count <> 1 then
    insert into private.intentos_clave_cotizacion(usuario_auth) values (v_uid);
    return jsonb_build_object('error', case when v_count > 1 then 'La clave pertenece a mas de un usuario. Solicita al administrador claves diferentes.' else 'Clave de usuario incorrecta.' end);
  end if;
  return jsonb_build_object('nombre', v_nombre);
end;
$$;
revoke all on function myappdb.validar_clave_cotizacion(text) from public, anon;
grant execute on function myappdb.validar_clave_cotizacion(text) to authenticated;
