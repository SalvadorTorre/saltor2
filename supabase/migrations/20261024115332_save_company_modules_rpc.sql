-- El dueño de Plataforma guarda todos los módulos como una sola operación.
-- SECURITY DEFINER es necesario para administrar otra empresa, pero la función
-- verifica explícitamente que el usuario autenticado sea dueño del sistema.
create or replace function myappdb.plataforma_guardar_modulos(
  p_empresa_id integer,
  p_modulos text[]
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitidos constant text[] := array[
    'mantenimiento', 'facturacion', 'cotizacion', 'caja',
    'contabilidad', 'reportes', 'configuracion', 'transacciones'
  ];
  v_modulos text[] := coalesce(p_modulos, array[]::text[]);
begin
  if not private.es_dueno_sistema() then
    raise exception 'Solo el dueño de la plataforma puede cambiar módulos.' using errcode = '42501';
  end if;
  if not exists (select 1 from myappdb.empresas where id = p_empresa_id) then
    raise exception 'La empresa indicada no existe.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_modulos) as m where not (m = any(v_permitidos))) then
    raise exception 'Se recibió un módulo inválido.' using errcode = '22023';
  end if;

  insert into myappdb.empresa_modulos (empresa_id, modulo, activo, actualizado_en)
  select p_empresa_id, m, false, now()
  from unnest(v_permitidos) as m
  on conflict (empresa_id, modulo) do nothing;

  update myappdb.empresa_modulos
  set activo = modulo = any(v_modulos), actualizado_en = now()
  where empresa_id = p_empresa_id;

  return coalesce((
    select array_agg(modulo order by modulo)
    from myappdb.empresa_modulos
    where empresa_id = p_empresa_id and activo
  ), array[]::text[]);
end;
$$;

revoke all on function myappdb.plataforma_guardar_modulos(integer, text[]) from public, anon;
grant execute on function myappdb.plataforma_guardar_modulos(integer, text[]) to authenticated;
