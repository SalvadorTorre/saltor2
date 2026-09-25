begin;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'code') then
    alter table myappdb.clients rename column code to codigo;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'full_name') then
    alter table myappdb.clients rename column full_name to nombre_completo;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'company_name') then
    alter table myappdb.clients rename column company_name to empresa;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'document_type') then
    alter table myappdb.clients rename column document_type to tipo_documento;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'document_number') then
    alter table myappdb.clients rename column document_number to numero_documento;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'phone') then
    alter table myappdb.clients rename column phone to telefono;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'email') then
    alter table myappdb.clients rename column email to correo;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'address') then
    alter table myappdb.clients rename column address to direccion;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'city') then
    alter table myappdb.clients rename column city to ciudad;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'category') then
    alter table myappdb.clients rename column category to categoria;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'credit_limit') then
    alter table myappdb.clients rename column credit_limit to limite_credito;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'status') then
    alter table myappdb.clients rename column status to estado;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'last_purchase') then
    alter table myappdb.clients rename column last_purchase to ultima_compra;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'created_at') then
    alter table myappdb.clients rename column created_at to creado_en;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'myappdb' and table_name = 'clients' and column_name = 'updated_at') then
    alter table myappdb.clients rename column updated_at to actualizado_en;
  end if;
end;
$$;

create or replace function myappdb.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

commit;
