-- Toda empresa nueva necesita su contador inicial para emitir documentos.
-- El nombre zz garantiza que este trigger se ejecute después de crear la
-- sucursal PRINCIPAL de la empresa.
create or replace function private.tg_empresa_contador_documentos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sucursal_id bigint;
begin
  select s.idsucursal
    into v_sucursal_id
  from myappdb.sucursales s
  where s.idempresa = new.id
  order by s.idsucursal
  limit 1;

  if v_sucursal_id is null then
    raise exception 'No se pudo crear la sucursal principal para la empresa %.', new.id;
  end if;

  insert into myappdb.contador_doc (
    id_empres, nom_empresa, ano, sucursal_id,
    factura, cotizacion, nota_credito, gasto_menores, recibo, ordenventa
  ) values (
    new.id, new.nombre_comercial, extract(year from current_date)::smallint, v_sucursal_id::smallint,
    0, 0, 0, 0, 0, 0
  )
  on conflict (id_empres, ano, sucursal_id) do nothing;

  return null;
end;
$$;

revoke all on function private.tg_empresa_contador_documentos() from public, anon, authenticated;

drop trigger if exists zz_empresa_contador_documentos on myappdb.empresas;
create trigger zz_empresa_contador_documentos
after insert on myappdb.empresas
for each row execute function private.tg_empresa_contador_documentos();
