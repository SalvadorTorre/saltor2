begin;

-- A username is the login identifier, so it must identify one account globally.
create unique index if not exists usuarios_nombre_usuario_login_key
  on myappdb.usuarios (lower(nombre_usuario));

commit;
