

-- El normalizador instalado en producción tomaba solo dos dígitos y
-- convertía E332 en E33 antes de que el firmador pudiera reconocer proforma.
create or replace function myappdb.normalizar_tipo_ncf_factura()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  codigo text;
begin
  codigo := substring(coalesce(new.tipo_ncf, '') from '([0-9]+)');
  if codigo = '332' then
    new.tipo_ncf := 'E332';
  else
    codigo := substring(coalesce(new.tipo_ncf, '') from '([0-9]{2})');
    if codigo is not null then
      new.tipo_ncf := 'E' || codigo;
    end if;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
;
