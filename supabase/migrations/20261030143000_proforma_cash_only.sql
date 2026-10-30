-- E332/proforma is reserved exclusively for cash sales.
create or replace function myappdb.normalizar_proforma_por_forma_pago()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_tipo text;
begin
  v_tipo := regexp_replace(coalesce(new.tipo_ncf, ''), '[^0-9]', '', 'g');

  if v_tipo = '332' and (
    coalesce(new.forma_pago_codigo, 1) <> 1
    or lower(coalesce(new.condicion_pago, 'Contado')) = 'credito'
  ) then
    new.tipo_ncf := 'E32';
    new.ncf := null;
  end if;

  return new;
end;
$function$;

drop trigger if exists a_normalizar_proforma_por_forma_pago on myappdb.facturas;
create trigger a_normalizar_proforma_por_forma_pago
before insert or update of tipo_ncf, forma_pago_codigo, condicion_pago on myappdb.facturas
for each row execute function myappdb.normalizar_proforma_por_forma_pago();
