-- Clientes: categoría solo Credito / Contado, código automático y solo el nombre obligatorio.
alter table myappdb.clients drop constraint clients_category_check;
update myappdb.clients
   set categoria = case when coalesce(limite_credito, 0) > 0 then 'Credito' else 'Contado' end;
alter table myappdb.clients alter column categoria set default 'Contado';
alter table myappdb.clients add constraint clients_category_check
  check (categoria = any (array['Credito'::text, 'Contado'::text]));

alter table myappdb.clients alter column numero_documento drop not null;
alter table myappdb.clients alter column tipo_documento set default 'Cedula';
alter table myappdb.clients alter column codigo drop not null;

create or replace function private.tg_clients_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.numero_documento := nullif(btrim(coalesce(new.numero_documento, '')), '');
  new.tipo_documento := coalesce(nullif(btrim(coalesce(new.tipo_documento, '')), ''), 'Cedula');
  if tg_op = 'INSERT' and nullif(btrim(coalesce(new.codigo, '')), '') is null then
    -- Siguiente número de la empresa; se ignoran códigos largos (cédulas/RNC usados como código).
    perform pg_advisory_xact_lock(hashtext('clients_codigo'), new.empresa_id);
    select coalesce(max(c.codigo::bigint), 0) + 1 into new.codigo
      from myappdb.clients c
     where c.empresa_id = new.empresa_id and c.codigo ~ '^\d{1,8}$';
    new.codigo := new.codigo::text;
  end if;
  if new.codigo is null then
    raise exception 'El código del cliente no puede quedar vacío.';
  end if;
  return new;
end;
$$;

drop trigger if exists clients_defaults on myappdb.clients;
create trigger clients_defaults before insert or update on myappdb.clients
  for each row execute function private.tg_clients_defaults();
