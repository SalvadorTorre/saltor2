begin;

alter table myappdb.products
  add column if not exists cantidad_minima_venta numeric(14, 2) not null default 1;

alter table myappdb.products
  drop constraint if exists products_cantidad_minima_venta_check;

alter table myappdb.products
  add constraint products_cantidad_minima_venta_check check (cantidad_minima_venta >= 1);

commit;
