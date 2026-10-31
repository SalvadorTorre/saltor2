begin;

-- Cantidad de copias que se imprimen al generar una factura (Facturación y Caja → Cobro).
-- Las reimpresiones desde Consulta de facturas siempre salen en una copia.
alter table myappdb.empresas
  add column if not exists copias_factura smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_copias_factura_check') then
    alter table myappdb.empresas add constraint empresas_copias_factura_check check (copias_factura between 1 and 5);
  end if;
end $$;

comment on column myappdb.empresas.copias_factura is 'Copias que se imprimen al generar una factura (1 a 5). Las reimpresiones salen en una copia.';

commit;
