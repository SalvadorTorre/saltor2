-- Entrada de productos: el usuario es el de la sesión (ya no se escribe un código de usuario).
create or replace function private.tg_product_entry_header_user()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_codigo text; v_nombre text;
begin
  -- Al editar se conserva quién registró la entrada.
  if tg_op = 'UPDATE' then
    new.codigo_usuario := old.codigo_usuario; new.nombre_usuario := old.nombre_usuario; return new;
  end if;
  -- Al crear, la entrada queda a nombre del usuario que inició sesión (de la empresa activa o, si es
  -- dueño de la plataforma trabajando en otra empresa, su propio usuario).
  select u.codusuario::text, u.nombre_completo into v_codigo, v_nombre
    from myappdb.usuarios u
   where u.auth_usuario_id = auth.uid() and u.estado = 'Activo'
   order by (u.empresa_id = new.empresa_id) desc
   limit 1;
  if v_codigo is null then raise exception 'No se pudo identificar al usuario de la sesión para guardar la entrada.' using errcode = '22023'; end if;
  new.codigo_usuario := v_codigo; new.nombre_usuario := v_nombre; return new;
end; $function$;
