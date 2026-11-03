-- Clientes: agrega la categoría "Credito".
alter table myappdb.clients drop constraint clients_category_check;
alter table myappdb.clients add constraint clients_category_check
  check (categoria = any (array['Minorista'::text, 'Mayorista'::text, 'Corporativo'::text, 'Credito'::text]));
