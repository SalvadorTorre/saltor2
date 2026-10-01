begin;

-- Multi-tenant boundary: the active company is resolved from the authenticated
-- user's profile.  This function is intentionally private so it cannot expose
-- profile data through the public API, and it only returns the caller's tenant.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.current_empresa_id()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select u.empresa_id
  from myappdb.usuarios u
  where u.auth_usuario_id = (select auth.uid())
    and u.estado = 'Activo'
  limit 1
$$;

revoke all on function private.current_empresa_id() from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.current_empresa_id() to authenticated, service_role;

alter table myappdb.clients add column if not exists empresa_id integer;
alter table myappdb.products add column if not exists empresa_id integer;
alter table myappdb.suplidores add column if not exists empresa_id integer;
alter table myappdb.ncf_empresas add column if not exists empresa_id integer;

-- The existing database belongs to one company today.  Assign legacy rows to
-- that company only when the mapping is unambiguous; otherwise stop safely.
do $$
declare
  v_empresa_id integer;
  v_empresas integer;
begin
  select count(*), min(id) into v_empresas, v_empresa_id
  from myappdb.empresas;

  if v_empresas <> 1 then
    raise exception 'La migracion multiempresa requiere asignar los datos historicos manualmente porque existen % empresas.', v_empresas;
  end if;

  update myappdb.clients set empresa_id = v_empresa_id where empresa_id is null;
  update myappdb.products set empresa_id = v_empresa_id where empresa_id is null;
  update myappdb.suplidores set empresa_id = v_empresa_id where empresa_id is null;
  update myappdb.ncf_empresas set empresa_id = v_empresa_id where empresa_id is null;
  update myappdb.facturas set idempres = v_empresa_id where idempres is null;
end;
$$;

-- Master data must belong to a company.  Defaults preserve the current forms,
-- while RLS below rejects attempts to send another company's identifier.
alter table myappdb.clients alter column empresa_id set not null;
alter table myappdb.products alter column empresa_id set not null;
alter table myappdb.suplidores alter column empresa_id set not null;
alter table myappdb.ncf_empresas alter column empresa_id set not null;

alter table myappdb.clients
  add constraint clients_empresa_id_fkey foreign key (empresa_id) references myappdb.empresas(id) on delete restrict;
alter table myappdb.products
  add constraint products_empresa_id_fkey foreign key (empresa_id) references myappdb.empresas(id) on delete restrict;
alter table myappdb.suplidores
  add constraint suplidores_empresa_id_fkey foreign key (empresa_id) references myappdb.empresas(id) on delete restrict;
alter table myappdb.ncf_empresas
  add constraint ncf_empresas_empresa_id_fkey foreign key (empresa_id) references myappdb.empresas(id) on delete restrict;

alter table myappdb.clients alter column empresa_id set default private.current_empresa_id();
alter table myappdb.products alter column empresa_id set default private.current_empresa_id();
alter table myappdb.suplidores alter column empresa_id set default private.current_empresa_id();
alter table myappdb.ncf_empresas alter column empresa_id set default private.current_empresa_id();

alter table myappdb.clients drop constraint if exists clients_codigo_key;
alter table myappdb.clients drop constraint if exists clients_numero_documento_key;
alter table myappdb.products drop constraint if exists products_codigo_key;
alter table myappdb.suplidores drop constraint if exists suplidores_codigo_key;
alter table myappdb.suplidores drop constraint if exists suplidores_numero_documento_key;
alter table myappdb.ncf_empresas drop constraint if exists ncf_empresas_rnc_key;

create unique index if not exists clients_empresa_codigo_key
  on myappdb.clients (empresa_id, codigo);
create unique index if not exists clients_empresa_numero_documento_key
  on myappdb.clients (empresa_id, numero_documento);
create unique index if not exists products_empresa_codigo_key
  on myappdb.products (empresa_id, codigo);
create unique index if not exists suplidores_empresa_codigo_key
  on myappdb.suplidores (empresa_id, codigo);
create unique index if not exists suplidores_empresa_numero_documento_key
  on myappdb.suplidores (empresa_id, numero_documento);
create unique index if not exists ncf_empresas_empresa_rnc_key
  on myappdb.ncf_empresas (empresa_id, rnc);

create index if not exists clients_empresa_idx on myappdb.clients (empresa_id);
create index if not exists products_empresa_idx on myappdb.products (empresa_id);
create index if not exists suplidores_empresa_idx on myappdb.suplidores (empresa_id);
create index if not exists ncf_empresas_empresa_idx on myappdb.ncf_empresas (empresa_id);
create index if not exists factura_detalles_factura_empresa_idx on myappdb.factura_detalles (factura_id);
create index if not exists cotizacion_detalles_cotizacion_empresa_idx on myappdb.cotizacion_detalles (cotizacion_id);
create index if not exists nota_credito_detalles_nota_empresa_idx on myappdb.nota_credito_detalles (nota_credito_id);

-- Replace inherited permissive policies.  RLS policies combine with OR, so
-- leaving a legacy USING (true) policy in place would defeat tenant isolation.
do $$
declare
  item record;
begin
  for item in
    select policyname, tablename
    from pg_policies
    where schemaname = 'myappdb'
      and tablename = any (array[
        'empresas', 'usuarios', 'sucursales', 'clients', 'products', 'suplidores',
        'ncf_empresas', 'ncf_secuencias', 'facturas', 'factura_detalles',
        'cotizaciones', 'cotizacion_detalles', 'notas_credito', 'nota_credito_detalles',
        'gastos_menores', 'compras_606', 'contador_doc', 'ecf_configuraciones',
        'contadores_ecf', 'certificados_firma_digital', 'rnc', 'tipos_ncf',
        'formapago', 'categorias_gastos'
      ])
  loop
    execute format('drop policy if exists %I on myappdb.%I', item.policyname, item.tablename);
  end loop;
end;
$$;

alter table myappdb.empresas enable row level security;
alter table myappdb.usuarios enable row level security;
alter table myappdb.sucursales enable row level security;
alter table myappdb.clients enable row level security;
alter table myappdb.products enable row level security;
alter table myappdb.suplidores enable row level security;
alter table myappdb.ncf_empresas enable row level security;
alter table myappdb.ncf_secuencias enable row level security;
alter table myappdb.facturas enable row level security;
alter table myappdb.factura_detalles enable row level security;
alter table myappdb.cotizaciones enable row level security;
alter table myappdb.cotizacion_detalles enable row level security;
alter table myappdb.notas_credito enable row level security;
alter table myappdb.nota_credito_detalles enable row level security;
alter table myappdb.gastos_menores enable row level security;
alter table myappdb.compras_606 enable row level security;
alter table myappdb.contador_doc enable row level security;
alter table myappdb.ecf_configuraciones enable row level security;
alter table myappdb.contadores_ecf enable row level security;
alter table myappdb.certificados_firma_digital enable row level security;
alter table myappdb.rnc enable row level security;
alter table myappdb.tipos_ncf enable row level security;
alter table myappdb.formapago enable row level security;
alter table myappdb.categorias_gastos enable row level security;

create policy empresas_tenant_access on myappdb.empresas for select to authenticated
  using (id = (select private.current_empresa_id()));
create policy empresas_tenant_update on myappdb.empresas for update to authenticated
  using (id = (select private.current_empresa_id()))
  with check (id = (select private.current_empresa_id()));

create policy usuarios_tenant_access on myappdb.usuarios for all to authenticated
  using (empresa_id = (select private.current_empresa_id()))
  with check (empresa_id = (select private.current_empresa_id()));

create policy sucursales_tenant_access on myappdb.sucursales for all to authenticated
  using (idempresa = (select private.current_empresa_id()))
  with check (idempresa = (select private.current_empresa_id()));

create policy clients_tenant_access on myappdb.clients for all to authenticated
  using (empresa_id = (select private.current_empresa_id()))
  with check (empresa_id = (select private.current_empresa_id()));
create policy products_tenant_access on myappdb.products for all to authenticated
  using (empresa_id = (select private.current_empresa_id()))
  with check (empresa_id = (select private.current_empresa_id()));
create policy suplidores_tenant_access on myappdb.suplidores for all to authenticated
  using (empresa_id = (select private.current_empresa_id()))
  with check (empresa_id = (select private.current_empresa_id()));
create policy ncf_empresas_tenant_access on myappdb.ncf_empresas for all to authenticated
  using (empresa_id = (select private.current_empresa_id()))
  with check (empresa_id = (select private.current_empresa_id()));
create policy ncf_secuencias_tenant_access on myappdb.ncf_secuencias for all to authenticated
  using (empresa_id = (select private.current_empresa_id()))
  with check (empresa_id = (select private.current_empresa_id()));

create policy facturas_tenant_access on myappdb.facturas for all to authenticated
  using (idempres = (select private.current_empresa_id()))
  with check (idempres = (select private.current_empresa_id()));
create policy factura_detalles_tenant_access on myappdb.factura_detalles for all to authenticated
  using (exists (
    select 1 from myappdb.facturas f
    where f.id = factura_id and f.idempres = (select private.current_empresa_id())
  ))
  with check (exists (
    select 1 from myappdb.facturas f
    where f.id = factura_id and f.idempres = (select private.current_empresa_id())
  ));

create policy cotizaciones_tenant_access on myappdb.cotizaciones for all to authenticated
  using (idempres = (select private.current_empresa_id()))
  with check (idempres = (select private.current_empresa_id()));
create policy cotizacion_detalles_tenant_access on myappdb.cotizacion_detalles for all to authenticated
  using (exists (
    select 1 from myappdb.cotizaciones c
    where c.id = cotizacion_id and c.idempres = (select private.current_empresa_id())
  ))
  with check (exists (
    select 1 from myappdb.cotizaciones c
    where c.id = cotizacion_id and c.idempres = (select private.current_empresa_id())
  ));

create policy notas_credito_tenant_access on myappdb.notas_credito for all to authenticated
  using (idempres = (select private.current_empresa_id()))
  with check (idempres = (select private.current_empresa_id()));
create policy nota_credito_detalles_tenant_access on myappdb.nota_credito_detalles for all to authenticated
  using (exists (
    select 1 from myappdb.notas_credito n
    where n.id = nota_credito_id and n.idempres = (select private.current_empresa_id())
  ))
  with check (exists (
    select 1 from myappdb.notas_credito n
    where n.id = nota_credito_id and n.idempres = (select private.current_empresa_id())
  ));

create policy gastos_menores_tenant_access on myappdb.gastos_menores for all to authenticated
  using (idempres = (select private.current_empresa_id()))
  with check (idempres = (select private.current_empresa_id()));
create policy compras_606_tenant_access on myappdb.compras_606 for all to authenticated
  using (idempres = (select private.current_empresa_id()))
  with check (idempres = (select private.current_empresa_id()));
create policy contador_doc_tenant_access on myappdb.contador_doc for all to authenticated
  using (id_empres = (select private.current_empresa_id()))
  with check (id_empres = (select private.current_empresa_id()));
create policy ecf_configuraciones_tenant_access on myappdb.ecf_configuraciones for all to authenticated
  using (empresa_id = (select private.current_empresa_id()))
  with check (empresa_id = (select private.current_empresa_id()));
create policy contadores_ecf_tenant_access on myappdb.contadores_ecf for all to authenticated
  using (empresa_id = (select private.current_empresa_id()))
  with check (empresa_id = (select private.current_empresa_id()));
create policy certificados_firma_digital_tenant_access on myappdb.certificados_firma_digital for all to authenticated
  using (empresa_id = (select private.current_empresa_id()))
  with check (empresa_id = (select private.current_empresa_id()));

-- Shared reference catalogs are visible after login but can only be managed by
-- the server role, preventing anonymous changes and cross-tenant tampering.
create policy rnc_authenticated_read on myappdb.rnc for select to authenticated using (true);
create policy tipos_ncf_authenticated_read on myappdb.tipos_ncf for select to authenticated using (true);
create policy formapago_authenticated_read on myappdb.formapago for select to authenticated using (true);
create policy categorias_gastos_authenticated_read on myappdb.categorias_gastos for select to authenticated using (true);

revoke all on myappdb.empresas, myappdb.usuarios, myappdb.sucursales,
  myappdb.clients, myappdb.products, myappdb.suplidores, myappdb.ncf_empresas,
  myappdb.ncf_secuencias, myappdb.facturas, myappdb.factura_detalles,
  myappdb.cotizaciones, myappdb.cotizacion_detalles, myappdb.notas_credito,
  myappdb.nota_credito_detalles, myappdb.gastos_menores, myappdb.compras_606,
  myappdb.contador_doc, myappdb.ecf_configuraciones, myappdb.contadores_ecf,
  myappdb.certificados_firma_digital, myappdb.rnc, myappdb.tipos_ncf,
  myappdb.formapago, myappdb.categorias_gastos from anon;

grant select, insert, update, delete on myappdb.usuarios, myappdb.sucursales,
  myappdb.clients, myappdb.products, myappdb.suplidores, myappdb.ncf_empresas,
  myappdb.ncf_secuencias, myappdb.facturas, myappdb.factura_detalles,
  myappdb.cotizaciones, myappdb.cotizacion_detalles, myappdb.notas_credito,
  myappdb.nota_credito_detalles, myappdb.gastos_menores, myappdb.compras_606,
  myappdb.contador_doc, myappdb.ecf_configuraciones, myappdb.contadores_ecf,
  myappdb.certificados_firma_digital to authenticated;
grant select, update on myappdb.empresas to authenticated;
grant select on myappdb.rnc, myappdb.tipos_ncf, myappdb.formapago,
  myappdb.categorias_gastos to authenticated;

commit;
