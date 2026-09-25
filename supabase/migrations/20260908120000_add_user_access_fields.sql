begin;

alter table myappdb.usuarios
  add column if not exists nombre_usuario text,
  add column if not exists auth_usuario_id uuid,
  add column if not exists ultimo_acceso_en timestamptz;

update myappdb.usuarios
set nombre_usuario = coalesce(
  nullif(btrim(idusuario), ''),
  nullif(lower(regexp_replace(split_part(correo, '@', 1), '[^a-z0-9._-]', '', 'g')), ''),
  'usuario-' || codusuario::text
)
where nombre_usuario is null or btrim(nombre_usuario) = '';

alter table myappdb.usuarios
  alter column nombre_usuario set not null,
  alter column empresa_id set not null;

create unique index if not exists usuarios_nombre_usuario_key
  on myappdb.usuarios (lower(nombre_usuario));

create unique index if not exists usuarios_auth_usuario_id_key
  on myappdb.usuarios (auth_usuario_id)
  where auth_usuario_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'usuarios_empresa_id_fkey'
      and conrelid = 'myappdb.usuarios'::regclass
  ) then
    alter table myappdb.usuarios
      add constraint usuarios_empresa_id_fkey
      foreign key (empresa_id) references myappdb.empresas(id)
      on update cascade on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'usuarios_auth_usuario_id_fkey'
      and conrelid = 'myappdb.usuarios'::regclass
  ) then
    alter table myappdb.usuarios
      add constraint usuarios_auth_usuario_id_fkey
      foreign key (auth_usuario_id) references auth.users(id)
      on update cascade on delete set null;
  end if;
end;
$$;

comment on column myappdb.usuarios.claveusuario is
  'Campo antiguo: las claves nuevas se guardan exclusivamente en Supabase Auth.';

commit;
