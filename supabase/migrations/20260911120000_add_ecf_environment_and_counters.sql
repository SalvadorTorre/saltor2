begin;

create table if not exists myappdb.ecf_configuraciones (
  empresa_id integer primary key references myappdb.empresas(id),
  ambiente text not null default 'TEST' check (ambiente in ('TEST', 'PROD')),
  url_base text not null default 'https://ecf-propio.tail2c2b0a.ts.net/ecf',
  tipo_ingreso text not null default '01',
  persistir_certificado boolean not null default true,
  actualizado_en timestamptz not null default now()
);

insert into myappdb.ecf_configuraciones (empresa_id)
select id from myappdb.empresas
on conflict (empresa_id) do nothing;

create table if not exists myappdb.contadores_ecf (
  empresa_id integer not null references myappdb.empresas(id),
  sucursal_id smallint not null,
  ano smallint not null,
  tipo_ecf text not null check (tipo_ecf ~ '^[0-9]{2}$'),
  ambiente text not null check (ambiente in ('TEST', 'PROD', 'CERT')),
  secuencia bigint not null default 0 check (secuencia >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, sucursal_id, ano, tipo_ecf, ambiente)
);

alter table myappdb.facturas add column if not exists forma_pago_codigo smallint references myappdb.formapago(codigo);
alter table myappdb.facturas add column if not exists ecf_ambiente text check (ecf_ambiente in ('TEST', 'PROD', 'CERT'));

alter table myappdb.ecf_configuraciones enable row level security;
grant select, insert, update on myappdb.ecf_configuraciones to authenticated;

create policy ecf_configuracion_empresa_select on myappdb.ecf_configuraciones
for select to authenticated
using (empresa_id = (select empresa_id from myappdb.usuarios where auth_usuario_id = (select auth.uid()) and estado = 'Activo'));

create policy ecf_configuracion_empresa_insert on myappdb.ecf_configuraciones
for insert to authenticated
with check (empresa_id = (select empresa_id from myappdb.usuarios where auth_usuario_id = (select auth.uid()) and estado = 'Activo'));

create policy ecf_configuracion_empresa_update on myappdb.ecf_configuraciones
for update to authenticated
using (empresa_id = (select empresa_id from myappdb.usuarios where auth_usuario_id = (select auth.uid()) and estado = 'Activo'))
with check (empresa_id = (select empresa_id from myappdb.usuarios where auth_usuario_id = (select auth.uid()) and estado = 'Activo'));

create or replace function myappdb.siguiente_encf_ecf(
  p_empresa_id integer,
  p_sucursal_id smallint,
  p_tipo_ecf text,
  p_ambiente text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_secuencia bigint;
begin
  if p_ambiente not in ('TEST', 'PROD', 'CERT') or p_tipo_ecf !~ '^[0-9]{2}$' then
    raise exception 'Ambiente o tipo e-CF no válido.' using errcode = '22023';
  end if;

  insert into myappdb.contadores_ecf (empresa_id, sucursal_id, ano, tipo_ecf, ambiente, secuencia)
  values (p_empresa_id, p_sucursal_id, extract(year from current_date)::smallint, p_tipo_ecf, p_ambiente, 1)
  on conflict (empresa_id, sucursal_id, ano, tipo_ecf, ambiente)
  do update set secuencia = myappdb.contadores_ecf.secuencia + 1, actualizado_en = now()
  returning secuencia into v_secuencia;

  return 'E' || p_tipo_ecf || lpad(v_secuencia::text, 10, '0');
end;
$$;

revoke all on myappdb.contadores_ecf from public, anon, authenticated;
revoke all on function myappdb.siguiente_encf_ecf(integer, smallint, text, text) from public, anon, authenticated;
grant execute on function myappdb.siguiente_encf_ecf(integer, smallint, text, text) to service_role;

commit;
