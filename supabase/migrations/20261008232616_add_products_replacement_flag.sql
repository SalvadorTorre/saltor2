alter table myappdb.products
  add column if not exists reemplazo char(1) not null default 'N';

alter table myappdb.products
  drop constraint if exists products_reemplazo_check;

alter table myappdb.products
  add constraint products_reemplazo_check check (reemplazo in ('S', 'N'));

-- Keep existing replacement codes enabled after adding the explicit flag.
update myappdb.products
set reemplazo = 'S'
where nullif(btrim(codigo_reemplazo), '') is not null
  and reemplazo = 'N';
