begin;

create or replace function myappdb.normalizar_tipo_ncf_factura()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  codigo text;
begin
  codigo := substring(coalesce(new.tipo_ncf, '') from '([0-9]{2})');
  if codigo is not null then
    new.tipo_ncf := 'E' || codigo;
  end if;
  return new;
end;
$$;

drop trigger if exists facturas_normalizar_tipo_ncf on myappdb.facturas;
create trigger facturas_normalizar_tipo_ncf
before insert or update of tipo_ncf on myappdb.facturas
for each row execute function myappdb.normalizar_tipo_ncf_factura();

commit;
