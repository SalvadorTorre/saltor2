alter table myappdb.products
  add column if not exists ventaxmayor char(1) not null default 'N';

alter table myappdb.products
  drop constraint if exists products_ventaxmayor_check;

alter table myappdb.products
  add constraint products_ventaxmayor_check check (ventaxmayor in ('S', 'N'));

-- Preserve the wholesale configuration already present in existing products.
update myappdb.products
set ventaxmayor = case
  when coalesce(precio_mayor, 0) > 0 and coalesce(cantidad_minima_mayor, 0) > 0 then 'S'
  else 'N'
end
where ventaxmayor = 'N';
