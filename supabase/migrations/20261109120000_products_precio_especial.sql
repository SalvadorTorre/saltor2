alter table myappdb.products add column if not exists precioespecial numeric not null default 0;
comment on column myappdb.products.precioespecial is 'Precio especial del producto.';
-- Bella Real: el precio mínimo actual pasa a ser el precio especial (precio_minimo todavía no se cambia).
update myappdb.products set precioespecial = precio_minimo where empresa_id = 6;
