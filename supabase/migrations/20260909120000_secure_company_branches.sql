begin;

alter table myappdb.sucursales
  alter column idempresa set not null,
  alter column estado set default 'Activa';

update myappdb.sucursales
set estado = 'Activa'
where estado is null or btrim(estado) = '';

alter table myappdb.sucursales
  alter column estado set not null;

alter table myappdb.sucursales
  drop constraint if exists sucursales_empresa_fkey;

alter table myappdb.sucursales
  add constraint sucursales_empresa_fkey
  foreign key (idempresa) references myappdb.empresas(id)
  on update cascade on delete restrict;

alter table myappdb.sucursales
  drop constraint if exists sucursales_estado_check;

alter table myappdb.sucursales
  add constraint sucursales_estado_check check (estado in ('Activa', 'Inactiva'));

create unique index if not exists sucursales_empresa_nombre_key
  on myappdb.sucursales (idempresa, lower(btrim(nombresucursal)));

create index if not exists sucursales_empresa_idx on myappdb.sucursales (idempresa);

alter table myappdb.sucursales enable row level security;

grant usage on schema myappdb to authenticated, service_role;
grant select, insert, update on myappdb.sucursales to authenticated, service_role;
grant usage, select on sequence myappdb.sucursales_idsucursal_seq to authenticated, service_role;

drop policy if exists sucursales_select_empresa_usuario on myappdb.sucursales;
create policy sucursales_select_empresa_usuario
  on myappdb.sucursales for select to authenticated
  using (
    idempresa = (
      select u.empresa_id
      from myappdb.usuarios as u
      where u.auth_usuario_id = (select auth.uid())
        and u.estado = 'Activo'
    )
  );

drop policy if exists sucursales_insert_empresa_usuario on myappdb.sucursales;
create policy sucursales_insert_empresa_usuario
  on myappdb.sucursales for insert to authenticated
  with check (
    idempresa = (
      select u.empresa_id
      from myappdb.usuarios as u
      where u.auth_usuario_id = (select auth.uid())
        and u.estado = 'Activo'
    )
  );

drop policy if exists sucursales_update_empresa_usuario on myappdb.sucursales;
create policy sucursales_update_empresa_usuario
  on myappdb.sucursales for update to authenticated
  using (
    idempresa = (
      select u.empresa_id
      from myappdb.usuarios as u
      where u.auth_usuario_id = (select auth.uid())
        and u.estado = 'Activo'
    )
  )
  with check (
    idempresa = (
      select u.empresa_id
      from myappdb.usuarios as u
      where u.auth_usuario_id = (select auth.uid())
        and u.estado = 'Activo'
    )
  );

commit;
