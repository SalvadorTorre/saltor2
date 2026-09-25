begin;

create or replace function myappdb.siguiente_numero_factura_usuario()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  empresa_usuario_id integer;
  sucursal_usuario_id smallint;
  nombre_empresa text;
  ano_factura smallint := extract(year from current_date)::smallint;
  consecutivo_factura integer;
begin
  select u.empresa_id, u.sucursal_id
  into empresa_usuario_id, sucursal_usuario_id
  from myappdb.usuarios as u
  where u.auth_usuario_id = (select auth.uid())
    and u.estado = 'Activo';

  if not found then
    raise exception 'No se encontró un usuario activo para generar la factura.' using errcode = '42501';
  end if;

  select e.nombre_comercial
  into nombre_empresa
  from myappdb.empresas as e
  where e.id = empresa_usuario_id;

  if not found then
    raise exception 'La empresa del usuario no existe.' using errcode = '23503';
  end if;

  insert into myappdb.contador_doc (
    id_empres,
    nom_empresa,
    ano,
    sucursal_id,
    factura
  )
  values (
    empresa_usuario_id,
    nombre_empresa,
    ano_factura,
    sucursal_usuario_id,
    1
  )
  on conflict (id_empres, ano, sucursal_id)
  do update set
    factura = myappdb.contador_doc.factura + 1,
    nom_empresa = excluded.nom_empresa
  returning factura into consecutivo_factura;

  if consecutivo_factura > 99999 then
    raise exception 'El consecutivo de factura superó los cinco dígitos para esta sucursal y año.' using errcode = '22003';
  end if;

  return lpad(ano_factura::text, 4, '0')
    || lpad(sucursal_usuario_id::text, 2, '0')
    || lpad(consecutivo_factura::text, 5, '0');
end;
$$;

revoke all on function myappdb.siguiente_numero_factura_usuario() from public;
grant execute on function myappdb.siguiente_numero_factura_usuario() to authenticated, service_role;

commit;
