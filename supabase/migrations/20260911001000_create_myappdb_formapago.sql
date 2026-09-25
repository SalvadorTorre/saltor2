begin;

create table if not exists myappdb.formapago (
  codigo smallint primary key,
  descripcion text not null
);

insert into myappdb.formapago (codigo, descripcion)
values
  (1, 'Efectivo'),
  (2, 'Cheque, transferencia o deposito'),
  (3, 'Tarjeta de debito o credito'),
  (4, 'Venta a credito'),
  (5, 'Bonos o certificados de regalo'),
  (6, 'Permuta'),
  (7, 'Nota de credito'),
  (8, 'Otras formas de pago')
on conflict (codigo) do update
set descripcion = excluded.descripcion;

alter table myappdb.formapago enable row level security;

grant select on myappdb.formapago to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'myappdb'
      and tablename = 'formapago'
      and policyname = 'formapago_select_local_app'
  ) then
    create policy formapago_select_local_app
    on myappdb.formapago
    for select
    to anon, authenticated
    using (true);
  end if;
end;
$$;

commit;
