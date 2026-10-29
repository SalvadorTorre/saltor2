-- Clasifica las facturas al guardarlas sin interferir con los estados de
-- anulación ni con la espera de cobro en caja.
alter table myappdb.facturas drop constraint if exists facturas_estado_check;
alter table myappdb.facturas add constraint facturas_estado_check
  check (estado in ('Emitida', 'FACTURA', 'PROFORMA', 'Anulada', 'Pendiente de cobro'));

create or replace function myappdb.clasificar_estado_factura_por_tipo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado in ('Anulada', 'Pendiente de cobro') then
    return new;
  end if;

  if regexp_replace(coalesce(new.tipo_ncf, ''), '[^0-9]', '', 'g') = '332' then
    new.estado := 'PROFORMA';
  else
    new.estado := 'FACTURA';
  end if;
  return new;
end;
$$;

drop trigger if exists clasificar_estado_factura_por_tipo on myappdb.facturas;
create trigger clasificar_estado_factura_por_tipo
before insert or update of tipo_ncf, estado on myappdb.facturas
for each row execute function myappdb.clasificar_estado_factura_por_tipo();
