begin;

-- ---------------------------------------------------------------------------
-- usuarios.sucursal_id
-- ---------------------------------------------------------------------------
-- La pantalla de usuarios guarda la sucursal por nombre y sucursal_id se quedaba
-- en su valor por defecto (1).  Facturas, cierres de caja, cotizaciones y e41
-- usan sucursal_id, así que con una segunda sucursal el usuario seguiría
-- trabajando en la 1.  Desde aquí la base de datos resuelve el id por nombre.

create or replace function private.sincronizar_sucursal_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sucursal_id smallint;
begin
  if tg_op = 'UPDATE'
     and new.sucursal is not distinct from old.sucursal
     and new.empresa_id is not distinct from old.empresa_id then
    return new;
  end if;

  select s.idsucursal into v_sucursal_id
  from myappdb.sucursales s
  where s.idempresa = new.empresa_id
    and upper(btrim(s.nombresucursal)) = upper(btrim(new.sucursal))
  order by s.idsucursal
  limit 1;

  if v_sucursal_id is null then
    raise exception 'La sucursal "%" no existe en la empresa del usuario.', new.sucursal
      using errcode = '23503';
  end if;

  new.sucursal_id := v_sucursal_id;
  return new;
end;
$$;

revoke all on function private.sincronizar_sucursal_usuario() from public;

drop trigger if exists usuarios_sincronizar_sucursal on myappdb.usuarios;
create trigger usuarios_sincronizar_sucursal
  before insert or update of sucursal, empresa_id on myappdb.usuarios
  for each row execute function private.sincronizar_sucursal_usuario();

-- ---------------------------------------------------------------------------
-- Políticas de escritura solo administrador
-- ---------------------------------------------------------------------------
-- Las políticas "for all" de administrador también aplicaban a SELECT, junto a
-- la de lectura de la empresa: Postgres evaluaba dos políticas en cada lectura.
-- Se separan en insert/update/delete; la lectura queda igual.

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('sucursales', 'sucursales_admin_write', 'idempresa'),
      ('ecf_configuraciones', 'ecf_configuraciones_admin_write', 'empresa_id'),
      ('certificados_firma_digital', 'certificados_firma_digital_admin_write', 'empresa_id')
    ) as t(tabla, politica, columna)
  loop
    execute format('drop policy if exists %I on myappdb.%I', v.politica, v.tabla);
    execute format('drop policy if exists %I on myappdb.%I', v.tabla || '_admin_insert', v.tabla);
    execute format('drop policy if exists %I on myappdb.%I', v.tabla || '_admin_update', v.tabla);
    execute format('drop policy if exists %I on myappdb.%I', v.tabla || '_admin_delete', v.tabla);

    execute format(
      'create policy %I on myappdb.%I for insert to authenticated
         with check (%I = (select private.current_empresa_id()) and (select private.current_user_is_admin()))',
      v.tabla || '_admin_insert', v.tabla, v.columna);
    execute format(
      'create policy %I on myappdb.%I for update to authenticated
         using (%I = (select private.current_empresa_id()) and (select private.current_user_is_admin()))
         with check (%I = (select private.current_empresa_id()) and (select private.current_user_is_admin()))',
      v.tabla || '_admin_update', v.tabla, v.columna, v.columna);
    execute format(
      'create policy %I on myappdb.%I for delete to authenticated
         using (%I = (select private.current_empresa_id()) and (select private.current_user_is_admin()))',
      v.tabla || '_admin_delete', v.tabla, v.columna);
  end loop;
end;
$$;

commit;
