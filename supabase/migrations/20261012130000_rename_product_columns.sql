begin;

-- ===========================================================================
-- Renombra dos columnas de products:
--   cantidad_minima_mayor -> cantidadxmayor
--   existencia_minima     -> existenciamin
-- Postgres no actualiza el texto de las funciones al renombrar columnas, así
-- que se reescriben las funciones que las usan (en la misma transacción: si
-- algo falla, no cambia nada).
-- ===========================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'myappdb' and table_name = 'products' and column_name = 'cantidad_minima_mayor'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'myappdb' and table_name = 'products' and column_name = 'cantidadxmayor'
  ) then
    alter table myappdb.products rename column cantidad_minima_mayor to cantidadxmayor;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'myappdb' and table_name = 'products' and column_name = 'existencia_minima'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'myappdb' and table_name = 'products' and column_name = 'existenciamin'
  ) then
    alter table myappdb.products rename column existencia_minima to existenciamin;
  end if;
end;
$$;

do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid, n.nspname, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('myappdb', 'private', 'public') and p.prokind = 'f'
      and (pg_get_functiondef(p.oid) ~ '\mcantidad_minima_mayor\M' or pg_get_functiondef(p.oid) ~ '\mexistencia_minima\M')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_def := regexp_replace(v_def, '\mcantidad_minima_mayor\M', 'cantidadxmayor', 'g');
    v_def := regexp_replace(v_def, '\mexistencia_minima\M', 'existenciamin', 'g');
    execute v_def;
    raise notice 'Función actualizada: %.%', r.nspname, r.proname;
  end loop;
end;
$$;

-- Verificación: ninguna función debe seguir usando los nombres viejos.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('myappdb', 'private', 'public') and p.prokind = 'f'
      and (pg_get_functiondef(p.oid) ~ '\mcantidad_minima_mayor\M' or pg_get_functiondef(p.oid) ~ '\mexistencia_minima\M')
  ) then
    raise exception 'Quedaron funciones con los nombres viejos de las columnas.';
  end if;
end;
$$;

commit;
