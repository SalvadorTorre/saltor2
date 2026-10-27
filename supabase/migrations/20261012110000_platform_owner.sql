begin;
-- ===========================================================================
-- Dueños del sistema (SaltorSystem): pueden crear empresas, ver y editar todas,
-- administrar sus sucursales y crear el primer usuario de cada empresa.
-- Los usuarios de cada empresa siguen viendo solo la suya.
-- La lista vive en el esquema private: la aplicación no la puede modificar.
-- ===========================================================================
create table if not exists private.duenos_sistema (
  auth_usuario_id uuid primary key,
  agregado_en timestamptz not null default now()
);
revoke all on private.duenos_sistema from public, anon, authenticated;
insert into private.duenos_sistema (auth_usuario_id)
select u.auth_usuario_id from myappdb.usuarios u
where lower(u.correo) in ('saltor33@gmail.com', 'saltor03@hotmail.com') and u.auth_usuario_id is not null
on conflict do nothing;
create or replace function private.es_dueno_sistema()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.duenos_sistema d
    join myappdb.usuarios u on u.auth_usuario_id = d.auth_usuario_id and u.estado = 'Activo'
    where d.auth_usuario_id = (select auth.uid())
  );
$$;
revoke all on function private.es_dueno_sistema() from public, anon;
grant execute on function private.es_dueno_sistema() to authenticated, service_role;
-- Para la aplicación: ¿el usuario actual es dueño del sistema?
create or replace function myappdb.soy_dueno_sistema()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.es_dueno_sistema(); $$;
revoke all on function myappdb.soy_dueno_sistema() from public, anon;
grant execute on function myappdb.soy_dueno_sistema() to authenticated;
-- Para la función crear-usuario (llave de servicio): ¿ese usuario es dueño?
create or replace function myappdb.es_dueno_usuario(p_auth_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.duenos_sistema d
    join myappdb.usuarios u on u.auth_usuario_id = d.auth_usuario_id and u.estado = 'Activo'
    where d.auth_usuario_id = p_auth_usuario_id
  );
$$;
revoke all on function myappdb.es_dueno_usuario(uuid) from public, anon, authenticated;
grant execute on function myappdb.es_dueno_usuario(uuid) to service_role;
-- ¿La empresa ya tiene usuarios o documentos? (para no borrar empresas en uso)
create or replace function private.empresa_en_uso(p_empresa_id integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from myappdb.usuarios where empresa_id = p_empresa_id)
      or exists (select 1 from myappdb.facturas where idempres = p_empresa_id)
      or exists (select 1 from myappdb.products where empresa_id = p_empresa_id);
$$;
revoke all on function private.empresa_en_uso(integer) from public, anon;
grant execute on function private.empresa_en_uso(integer) to authenticated;
-- Empresas ----------------------------------------------------------------
grant insert, delete on myappdb.empresas to authenticated;
drop policy if exists empresas_dueno_select on myappdb.empresas;
create policy empresas_dueno_select on myappdb.empresas for select to authenticated
  using ((select private.es_dueno_sistema()));
drop policy if exists empresas_dueno_insert on myappdb.empresas;
create policy empresas_dueno_insert on myappdb.empresas for insert to authenticated
  with check ((select private.es_dueno_sistema()));
drop policy if exists empresas_dueno_update on myappdb.empresas;
create policy empresas_dueno_update on myappdb.empresas for update to authenticated
  using ((select private.es_dueno_sistema())) with check ((select private.es_dueno_sistema()));
drop policy if exists empresas_dueno_delete on myappdb.empresas;
create policy empresas_dueno_delete on myappdb.empresas for delete to authenticated
  using ((select private.es_dueno_sistema()) and not private.empresa_en_uso(id));
-- Sucursales de cualquier empresa para el dueño ------------------------------
drop policy if exists sucursales_dueno_all on myappdb.sucursales;
create policy sucursales_dueno_all on myappdb.sucursales for all to authenticated
  using ((select private.es_dueno_sistema())) with check ((select private.es_dueno_sistema()));
-- Toda empresa nueva nace con su sucursal principal.
create or replace function private.tg_empresa_sucursal_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from myappdb.sucursales s where s.idempresa = new.id) then
    insert into myappdb.sucursales (nombresucursal, telefono, ciudad, direcion, estado, idempresa)
    values ('PRINCIPAL', new.telefono, new.ciudad, new.direccion, 'Activa', new.id);
  end if;
  return null;
end;
$$;
revoke all on function private.tg_empresa_sucursal_principal() from public, anon, authenticated;
drop trigger if exists empresas_sucursal_principal on myappdb.empresas;
create trigger empresas_sucursal_principal
  after insert on myappdb.empresas
  for each row execute function private.tg_empresa_sucursal_principal();
-- La bitácora también registra la creación y eliminación de empresas.
drop trigger if exists empresas_bitacora on myappdb.empresas;
create trigger empresas_bitacora after insert or update or delete on myappdb.empresas
  for each row execute function private.tg_bitacora();
commit;
