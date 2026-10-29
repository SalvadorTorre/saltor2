-- Una entrada siempre debe identificar al usuario activo que la registró.
create or replace function private.tg_product_entry_header_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  if nullif(trim(coalesce(new.codigo_usuario, '')), '') is null then
    raise exception 'Indica el código de usuario para guardar la entrada.' using errcode = '22023';
  end if;

  select u.nombre_completo into v_nombre
  from myappdb.usuarios u
  where u.empresa_id = new.empresa_id
    and u.codusuario::text = trim(new.codigo_usuario)
    and u.estado = 'Activo';

  if v_nombre is null then
    raise exception 'El código de usuario no existe o está inactivo en la empresa actual.' using errcode = '22023';
  end if;

  new.codigo_usuario := trim(new.codigo_usuario);
  new.nombre_usuario := v_nombre;
  return new;
end;
$$;

drop trigger if exists product_entry_header_require_user on myappdb.product_entry_headers;
create trigger product_entry_header_require_user
before insert or update of empresa_id, codigo_usuario on myappdb.product_entry_headers
for each row execute function private.tg_product_entry_header_user();
