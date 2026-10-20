create or replace function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from myappdb.usuarios u
    where u.auth_usuario_id = (select auth.uid())
      and u.estado = 'Activo'
      and u.rol = 'Administrador'
  )
$$;

revoke all on function private.current_user_is_admin() from public;
grant execute on function private.current_user_is_admin() to authenticated, service_role;

drop policy if exists usuarios_tenant_access on myappdb.usuarios;
drop policy if exists usuarios_tenant_select on myappdb.usuarios;
drop policy if exists usuarios_admin_insert on myappdb.usuarios;
drop policy if exists usuarios_admin_or_self_update on myappdb.usuarios;
drop policy if exists usuarios_admin_delete on myappdb.usuarios;

create policy usuarios_tenant_select on myappdb.usuarios for select to authenticated
  using (empresa_id = (select private.current_empresa_id()));

create policy usuarios_admin_insert on myappdb.usuarios for insert to authenticated
  with check (empresa_id = (select private.current_empresa_id()) and (select private.current_user_is_admin()));

create policy usuarios_admin_or_self_update on myappdb.usuarios for update to authenticated
  using (
    empresa_id = (select private.current_empresa_id())
    and ((select private.current_user_is_admin()) or auth_usuario_id = (select auth.uid()))
  )
  with check (empresa_id = (select private.current_empresa_id()));

create policy usuarios_admin_delete on myappdb.usuarios for delete to authenticated
  using (empresa_id = (select private.current_empresa_id()) and (select private.current_user_is_admin()));

create or replace function private.proteger_campos_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_user_is_admin() then
    return new;
  end if;

  if new.rol is distinct from old.rol
     or new.estado is distinct from old.estado
     or new.empresa_id is distinct from old.empresa_id
     or new.sucursal is distinct from old.sucursal
     or new.sucursal_id is distinct from old.sucursal_id
     or new.nombre_usuario is distinct from old.nombre_usuario
     or new.correo is distinct from old.correo
     or new.auth_usuario_id is distinct from old.auth_usuario_id then
    raise exception 'Solo un administrador puede cambiar el rol, estado, empresa, sucursal o acceso de un usuario.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists usuarios_proteger_campos on myappdb.usuarios;
create trigger usuarios_proteger_campos
  before update on myappdb.usuarios
  for each row execute function private.proteger_campos_usuario();

drop policy if exists empresas_tenant_update on myappdb.empresas;
create policy empresas_tenant_update on myappdb.empresas for update to authenticated
  using (id = (select private.current_empresa_id()) and (select private.current_user_is_admin()))
  with check (id = (select private.current_empresa_id()));

drop policy if exists sucursales_tenant_access on myappdb.sucursales;
create policy sucursales_tenant_select on myappdb.sucursales for select to authenticated
  using (idempresa = (select private.current_empresa_id()));
create policy sucursales_admin_write on myappdb.sucursales for all to authenticated
  using (idempresa = (select private.current_empresa_id()) and (select private.current_user_is_admin()))
  with check (idempresa = (select private.current_empresa_id()) and (select private.current_user_is_admin()));

drop policy if exists ecf_configuraciones_tenant_access on myappdb.ecf_configuraciones;
create policy ecf_configuraciones_tenant_select on myappdb.ecf_configuraciones for select to authenticated
  using (empresa_id = (select private.current_empresa_id()));
create policy ecf_configuraciones_admin_write on myappdb.ecf_configuraciones for all to authenticated
  using (empresa_id = (select private.current_empresa_id()) and (select private.current_user_is_admin()))
  with check (empresa_id = (select private.current_empresa_id()) and (select private.current_user_is_admin()));

drop policy if exists certificados_firma_digital_tenant_access on myappdb.certificados_firma_digital;
create policy certificados_firma_digital_tenant_select on myappdb.certificados_firma_digital for select to authenticated
  using (empresa_id = (select private.current_empresa_id()));
create policy certificados_firma_digital_admin_write on myappdb.certificados_firma_digital for all to authenticated
  using (empresa_id = (select private.current_empresa_id()) and (select private.current_user_is_admin()))
  with check (empresa_id = (select private.current_empresa_id()) and (select private.current_user_is_admin()));;
