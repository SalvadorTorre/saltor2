create or replace function myappdb.cambiar_contexto_empresa(
  p_empresa_id integer,
  p_sucursal_id integer
)
returns table(
  empresa_id integer,
  sucursal_id integer,
  empresa_nombre text,
  sucursal_nombre text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa myappdb.empresas%rowtype;
  v_sucursal myappdb.sucursales%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para cambiar de empresa.' using errcode = '42501';
  end if;

  if not (select private.es_dueno_sistema()) then
    raise exception 'Solo el dueño de Plataforma puede cambiar de empresa.' using errcode = '42501';
  end if;

  select * into v_empresa
  from myappdb.empresas
  where id = p_empresa_id;

  if not found then
    raise exception 'La empresa seleccionada no existe.' using errcode = 'P0002';
  end if;

  select * into v_sucursal
  from myappdb.sucursales
  where idsucursal = p_sucursal_id
    and idempresa = p_empresa_id;

  if not found then
    raise exception 'La sucursal no pertenece a la empresa seleccionada.' using errcode = '23514';
  end if;

  update myappdb.usuarios
  set empresa_id = v_empresa.id,
      sucursal_id = v_sucursal.idsucursal,
      sucursal = coalesce(v_sucursal.nombresucursal, ''),
      ultimo_acceso_en = now()
  where auth_usuario_id = (select auth.uid())
    and estado = 'Activo';

  if not found then
    raise exception 'No se encontró un usuario activo para cambiar de empresa.' using errcode = 'P0002';
  end if;

  return query
  select v_empresa.id, v_sucursal.idsucursal::integer, v_empresa.nombre_comercial::text, v_sucursal.nombresucursal::text;
end;
$$;
