-- ===========================================================================
-- Accesos por usuario (Configuración › Usuarios › Accesos)
--  * Sin fila: el usuario tiene los accesos de su rol (catálogo en la aplicación).
--  * Con fila: el administrador personalizó sus pantallas y acciones.
--  * Al cambiar el rol del usuario se borra la fila y vuelve a los del rol nuevo.
--  * El Administrador siempre tiene todo (no se guarda nada para él).
-- ===========================================================================

create table if not exists myappdb.usuario_permisos (
  codusuario integer primary key references myappdb.usuarios(codusuario) on delete cascade,
  empresa_id integer not null references myappdb.empresas(id) on delete cascade,
  pantallas text[] not null default '{}',
  acciones text[] not null default '{}',
  actualizado_en timestamptz not null default now(),
  actualizado_por text
);

alter table myappdb.usuario_permisos enable row level security;
revoke all on myappdb.usuario_permisos from public, anon, authenticated;
grant all on myappdb.usuario_permisos to service_role;

-- Permisos del usuario que inició sesión.
create or replace function myappdb.mis_permisos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'rol', u.rol,
           'personalizado', p.codusuario is not null,
           'pantallas', coalesce(to_jsonb(p.pantallas), '[]'::jsonb),
           'acciones', coalesce(to_jsonb(p.acciones), '[]'::jsonb))
    from myappdb.usuarios u
    left join myappdb.usuario_permisos p on p.codusuario = u.codusuario
   where u.auth_usuario_id = (select auth.uid()) and u.estado = 'Activo';
$$;
revoke all on function myappdb.mis_permisos() from public, anon;
grant execute on function myappdb.mis_permisos() to authenticated;

-- Permisos de un usuario de la empresa (para la ventana de Accesos; solo administrador).
create or replace function myappdb.permisos_usuario(p_codusuario integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_empresa integer; v_rol text; v_res jsonb;
begin
  if not private.current_user_is_admin() then raise exception 'Solo el administrador puede ver los accesos.' using errcode = '42501'; end if;
  select u.empresa_id, u.rol into v_empresa, v_rol from myappdb.usuarios u where u.codusuario = p_codusuario;
  if v_empresa is null or v_empresa <> private.current_empresa_id() then raise exception 'El usuario no pertenece a la empresa.' using errcode = '42501'; end if;
  select jsonb_build_object('rol', v_rol, 'personalizado', p.codusuario is not null,
                            'pantallas', coalesce(to_jsonb(p.pantallas), '[]'::jsonb), 'acciones', coalesce(to_jsonb(p.acciones), '[]'::jsonb),
                            'actualizadoEn', p.actualizado_en, 'actualizadoPor', p.actualizado_por)
    into v_res
    from (select 1) x left join myappdb.usuario_permisos p on p.codusuario = p_codusuario;
  return v_res;
end;
$$;
revoke all on function myappdb.permisos_usuario(integer) from public, anon;
grant execute on function myappdb.permisos_usuario(integer) to authenticated;

-- Guarda los accesos personalizados; con pantallas y acciones en null vuelve a los del rol.
create or replace function myappdb.guardar_permisos_usuario(p_codusuario integer, p_pantallas text[], p_acciones text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_empresa integer; v_rol text; v_admin text;
begin
  if not private.current_user_is_admin() then raise exception 'Solo el administrador puede cambiar los accesos.' using errcode = '42501'; end if;
  select u.empresa_id, u.rol into v_empresa, v_rol from myappdb.usuarios u where u.codusuario = p_codusuario;
  if v_empresa is null or v_empresa <> private.current_empresa_id() then raise exception 'El usuario no pertenece a la empresa.' using errcode = '42501'; end if;
  if v_rol = 'Administrador' then raise exception 'El administrador siempre tiene todos los accesos.' using errcode = '22023'; end if;
  select nombre_completo into v_admin from myappdb.usuarios where auth_usuario_id = (select auth.uid());

  if p_pantallas is null and p_acciones is null then
    delete from myappdb.usuario_permisos where codusuario = p_codusuario;
    return;
  end if;
  insert into myappdb.usuario_permisos (codusuario, empresa_id, pantallas, acciones, actualizado_en, actualizado_por)
  values (p_codusuario, v_empresa, coalesce(p_pantallas, '{}'), coalesce(p_acciones, '{}'), now(), v_admin)
  on conflict (codusuario) do update
    set empresa_id = excluded.empresa_id, pantallas = excluded.pantallas, acciones = excluded.acciones,
        actualizado_en = now(), actualizado_por = excluded.actualizado_por;
end;
$$;
revoke all on function myappdb.guardar_permisos_usuario(integer, text[], text[]) from public, anon;
grant execute on function myappdb.guardar_permisos_usuario(integer, text[], text[]) to authenticated;

-- Cambio de rol: los accesos vuelven a los del rol nuevo.
create or replace function private.tg_usuarios_rol_reinicia_permisos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol then
    delete from myappdb.usuario_permisos where codusuario = new.codusuario;
  end if;
  return null;
end;
$$;
revoke all on function private.tg_usuarios_rol_reinicia_permisos() from public, anon, authenticated;

drop trigger if exists usuarios_rol_reinicia_permisos on myappdb.usuarios;
create trigger usuarios_rol_reinicia_permisos after update of rol on myappdb.usuarios
  for each row execute function private.tg_usuarios_rol_reinicia_permisos();
