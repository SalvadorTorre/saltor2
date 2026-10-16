begin;

-- ===========================================================================
-- Renombra products.cantidad_minima_venta -> cantidadminventa y reescribe las
-- funciones que la usan (Postgres no actualiza el texto de las funciones).
-- Todo en una transacción: si algo falla, no cambia nada.
-- ===========================================================================
alter table myappdb.products rename column cantidad_minima_venta to cantidadminventa;

do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid, n.nspname, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('myappdb', 'private', 'public') and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ '\mcantidad_minima_venta\M'
  loop
    v_def := regexp_replace(pg_get_functiondef(r.oid), '\mcantidad_minima_venta\M', 'cantidadminventa', 'g');
    execute v_def;
    raise notice 'Función actualizada: %.%', r.nspname, r.proname;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('myappdb', 'private', 'public') and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~ '\mcantidad_minima_venta\M'
  ) then
    raise exception 'Quedaron funciones con el nombre viejo de la columna.';
  end if;
end;
$$;

commit;
