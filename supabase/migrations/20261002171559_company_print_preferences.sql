do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'myappdb'
      and table_name = 'empresas'
      and column_name = 'tipo_papel_impresion'
  ) then
    alter table myappdb.empresas
      add column tipo_papel_impresion text not null default 'carta';
  end if;

  alter table myappdb.empresas
    drop constraint if exists empresas_tipo_papel_impresion_check;

  alter table myappdb.empresas
    add constraint empresas_tipo_papel_impresion_check
    check (tipo_papel_impresion in ('80mm', '90mm', 'carta', 'media_carta'));
end;
$$;
