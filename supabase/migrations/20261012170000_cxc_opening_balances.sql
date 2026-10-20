-- ===========================================================================
-- Saldos anteriores en Cuentas por cobrar.
-- Las deudas que los clientes traen del sistema anterior se registran como
-- documentos "Saldo anterior": aparecen en Cuentas por cobrar y se cobran con
-- recibos, pero NO son facturas (no salen en el 607, ventas ni reportes fiscales).
-- Incluye la carga de 36 saldos de cliente.dbf (RD$2,941,001.01) para GABANA.
-- Todo en una transacción: si algo falla, no cambia nada.
-- ===========================================================================
begin;

-- 1) Tabla de saldos anteriores ------------------------------------------------
create table if not exists myappdb.cxc_saldos_iniciales (
  id bigint generated always as identity primary key,
  empresa_id integer not null default private.current_empresa_id() references myappdb.empresas(id) on delete restrict,
  cliente_id integer not null references myappdb.clients(id) on delete restrict,
  numero text not null,
  fecha date not null default ((now() at time zone 'America/Santo_Domingo')::date),
  monto numeric(14,2) not null check (monto > 0),
  nota text,
  estado text not null default 'Activo' check (estado in ('Activo', 'Anulado')),
  creado_en timestamptz not null default now(),
  creado_por text,
  unique (empresa_id, numero)
);
create index if not exists cxc_saldos_iniciales_cliente_idx on myappdb.cxc_saldos_iniciales (cliente_id);

alter table myappdb.cxc_saldos_iniciales enable row level security;
drop policy if exists cxc_saldos_iniciales_select on myappdb.cxc_saldos_iniciales;
create policy cxc_saldos_iniciales_select on myappdb.cxc_saldos_iniciales for select to authenticated
  using (empresa_id = (select private.current_empresa_id()));
drop policy if exists cxc_saldos_iniciales_admin_insert on myappdb.cxc_saldos_iniciales;
create policy cxc_saldos_iniciales_admin_insert on myappdb.cxc_saldos_iniciales for insert to authenticated
  with check (empresa_id = (select private.current_empresa_id()) and (select private.current_user_is_admin()));
drop policy if exists cxc_saldos_iniciales_admin_update on myappdb.cxc_saldos_iniciales;
create policy cxc_saldos_iniciales_admin_update on myappdb.cxc_saldos_iniciales for update to authenticated
  using (empresa_id = (select private.current_empresa_id()) and (select private.current_user_is_admin()))
  with check (empresa_id = (select private.current_empresa_id()));
revoke all on myappdb.cxc_saldos_iniciales from anon, authenticated;
grant select, insert, update on myappdb.cxc_saldos_iniciales to authenticated;
grant all on myappdb.cxc_saldos_iniciales to service_role;

-- 2) Los abonos pueden aplicarse a una factura o a un saldo anterior ------------
alter table myappdb.recibo_cobro_aplicaciones alter column factura_id drop not null;
alter table myappdb.recibo_cobro_aplicaciones
  add column if not exists saldo_inicial_id bigint references myappdb.cxc_saldos_iniciales(id) on delete restrict;
alter table myappdb.recibo_cobro_aplicaciones drop constraint if exists recibo_cobro_aplicaciones_documento_check;
alter table myappdb.recibo_cobro_aplicaciones add constraint recibo_cobro_aplicaciones_documento_check
  check (num_nonnulls(factura_id, saldo_inicial_id) = 1);
create unique index if not exists recibo_cobro_aplicaciones_recibo_saldo_key
  on myappdb.recibo_cobro_aplicaciones (recibo_id, saldo_inicial_id) where saldo_inicial_id is not null;
create index if not exists recibo_cobro_aplicaciones_saldo_idx on myappdb.recibo_cobro_aplicaciones (saldo_inicial_id);

-- 3) Vista de cuentas por cobrar: facturas a crédito + saldos anteriores.
--    Los saldos anteriores usan id negativo (-id) para no chocar con facturas.
create or replace view myappdb.cxc_facturas with (security_invoker = true) as
select f.id,
       f.idempres as empresa_id,
       f.idsucursal as sucursal_id,
       f.numero_factura,
       f.ncf,
       f.cliente_id,
       coalesce(c.nombre_completo, f.cliente_nombre) as cliente_nombre,
       coalesce(c.numero_documento, f.cliente_rnc) as cliente_documento,
       f.fecha_factura,
       f.fecha_factura + coalesce(c.dias_credito, 30) as fecha_vencimiento,
       f.total,
       coalesce(ab.abonado, 0)::numeric(14,2) as abonado,
       coalesce(nc.notas_credito, 0)::numeric(14,2) as notas_credito,
       greatest(f.total - coalesce(ab.abonado, 0) - coalesce(nc.notas_credito, 0), 0)::numeric(14,2) as saldo,
       greatest(current_date - (f.fecha_factura + coalesce(c.dias_credito, 30)), 0) as dias_vencida,
       'Factura'::text as tipo_documento
from myappdb.facturas f
left join myappdb.clients c on c.id = f.cliente_id
left join lateral (
  select sum(a.monto) as abonado
  from myappdb.recibo_cobro_aplicaciones a
  join myappdb.recibos_cobro r on r.id = a.recibo_id and r.estado = 'Activo'
  where a.factura_id = f.id
) ab on true
left join lateral (
  select sum(n.total) as notas_credito
  from myappdb.notas_credito n
  where n.factura_afectada_id = f.id and coalesce(n.estado_dgii, '') !~~* 'rechaz%'
) nc on true
where f.estado <> 'Anulada' and (f.forma_pago_codigo = 4 or f.condicion_pago = 'Credito')
union all
select -s.id,
       s.empresa_id,
       null::bigint,
       s.numero,
       null::text,
       s.cliente_id,
       c.nombre_completo,
       c.numero_documento,
       s.fecha,
       s.fecha,
       s.monto,
       coalesce(ab.abonado, 0)::numeric(14,2),
       0::numeric(14,2),
       greatest(s.monto - coalesce(ab.abonado, 0), 0)::numeric(14,2),
       greatest(current_date - s.fecha, 0),
       'Saldo anterior'::text
from myappdb.cxc_saldos_iniciales s
join myappdb.clients c on c.id = s.cliente_id
left join lateral (
  select sum(a.monto) as abonado
  from myappdb.recibo_cobro_aplicaciones a
  join myappdb.recibos_cobro r on r.id = a.recibo_id and r.estado = 'Activo'
  where a.saldo_inicial_id = s.id
) ab on true
where s.estado = 'Activo';

-- 4) El balance del cliente se recalcula al crear o cambiar un saldo anterior --
create or replace function private.tg_saldos_iniciales_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform private.recalcular_balance_cliente(old.cliente_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform private.recalcular_balance_cliente(new.cliente_id); end if;
  return null;
end;
$$;
revoke all on function private.tg_saldos_iniciales_balance() from public, anon, authenticated;
drop trigger if exists cxc_saldos_iniciales_balance on myappdb.cxc_saldos_iniciales;
create trigger cxc_saldos_iniciales_balance
  after insert or update or delete on myappdb.cxc_saldos_iniciales
  for each row execute function private.tg_saldos_iniciales_balance();

drop trigger if exists cxc_saldos_iniciales_bitacora on myappdb.cxc_saldos_iniciales;
create trigger cxc_saldos_iniciales_bitacora
  after update or delete on myappdb.cxc_saldos_iniciales
  for each row execute function private.tg_bitacora();

-- 5) Recibos: aceptan abonos a facturas (id > 0) o a saldos anteriores (id < 0) --
create or replace function myappdb.crear_recibo_cobro(p_recibo jsonb, p_aplicaciones jsonb)
returns table(id bigint, numero_recibo text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_empresa_id integer;
  v_sucursal_id smallint;
  v_usuario_id integer;
  v_usuario_nombre text;
  v_empresa_nombre text;
  v_cliente_id integer := nullif(p_recibo ->> 'customerId', '')::integer;
  v_cliente_nombre text;
  v_forma_pago integer := coalesce(nullif(p_recibo ->> 'paymentCode', '')::integer, 1);
  v_fecha date := coalesce(nullif(p_recibo ->> 'date', '')::date, current_date);
  v_total numeric(14,2) := 0;
  v_aplicacion jsonb;
  v_documento_id bigint;
  v_monto numeric(14,2);
  v_saldo numeric(14,2);
  v_documento_cliente integer;
  v_ano smallint := extract(year from current_date)::smallint;
  v_consecutivo integer;
  v_numero text;
  v_recibo_id bigint;
begin
  select u.empresa_id, u.sucursal_id, u.codusuario, u.nombre_completo
  into v_empresa_id, v_sucursal_id, v_usuario_id, v_usuario_nombre
  from myappdb.usuarios u
  where u.auth_usuario_id = (select auth.uid()) and u.estado = 'Activo';
  if not found then
    raise exception 'No se encontró un usuario activo.' using errcode = '42501';
  end if;

  if v_cliente_id is null then
    raise exception 'Seleccione el cliente del recibo.' using errcode = '22023';
  end if;
  select c.nombre_completo into v_cliente_nombre
  from myappdb.clients c where c.id = v_cliente_id and c.empresa_id = v_empresa_id;
  if not found then
    raise exception 'El cliente no pertenece a su empresa.' using errcode = '42501';
  end if;

  if v_forma_pago = 4 then
    raise exception 'Un cobro no puede registrarse con la forma de pago "Venta a crédito".' using errcode = '22023';
  end if;
  if not exists (select 1 from myappdb.formapago fp where fp.codigo = v_forma_pago) then
    raise exception 'Forma de pago no válida.' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_aplicaciones, '[]'::jsonb)) = 0 then
    raise exception 'Indique al menos una factura a la que aplicar el cobro.' using errcode = '22023';
  end if;

  -- Valida cada abono contra el saldo actual (bloqueando el documento).
  for v_aplicacion in select value from jsonb_array_elements(p_aplicaciones)
  loop
    v_documento_id := nullif(v_aplicacion ->> 'invoiceId', '')::bigint;
    v_monto := round(coalesce((v_aplicacion ->> 'amount')::numeric, 0), 2);
    if v_documento_id is null or v_documento_id = 0 or v_monto <= 0 then
      raise exception 'Cada abono debe indicar la factura y un monto mayor que cero.' using errcode = '22023';
    end if;

    if v_documento_id > 0 then
      perform 1 from myappdb.facturas f where f.id = v_documento_id and f.idempres = v_empresa_id for update;
    else
      perform 1 from myappdb.cxc_saldos_iniciales s where s.id = -v_documento_id and s.empresa_id = v_empresa_id for update;
    end if;
    if not found then
      raise exception 'Uno de los documentos no pertenece a su empresa.' using errcode = '42501';
    end if;

    select v.saldo, v.cliente_id into v_saldo, v_documento_cliente
    from myappdb.cxc_facturas v where v.id = v_documento_id;
    if not found then
      raise exception 'El documento indicado no tiene saldo pendiente.' using errcode = '22023';
    end if;
    if v_documento_cliente is distinct from v_cliente_id then
      raise exception 'Todos los documentos del recibo deben ser del mismo cliente.' using errcode = '22023';
    end if;
    if v_monto > v_saldo then
      raise exception 'El abono de % supera el saldo pendiente del documento (%).', v_monto, v_saldo using errcode = '22023';
    end if;
    v_total := v_total + v_monto;
  end loop;

  -- Número de recibo: RC + año + sucursal + consecutivo (contador_doc.recibo).
  select e.nombre_comercial into v_empresa_nombre from myappdb.empresas e where e.id = v_empresa_id;
  insert into myappdb.contador_doc (id_empres, nom_empresa, ano, sucursal_id, factura, recibo)
  values (v_empresa_id, v_empresa_nombre, v_ano, v_sucursal_id, 0, 1)
  on conflict (id_empres, ano, sucursal_id)
  do update set recibo = coalesce(myappdb.contador_doc.recibo, 0) + 1
  returning recibo into v_consecutivo;
  v_numero := 'RC' || lpad(v_ano::text, 4, '0') || lpad(v_sucursal_id::text, 2, '0') || lpad(v_consecutivo::text, 5, '0');

  insert into myappdb.recibos_cobro (
    empresa_id, sucursal_id, numero_recibo, cliente_id, cliente_nombre, fecha, forma_pago_codigo,
    referencia, monto_total, notas, usuario_id, usuario_nombre
  ) values (
    v_empresa_id, v_sucursal_id, v_numero, v_cliente_id, v_cliente_nombre, v_fecha, v_forma_pago,
    nullif(trim(p_recibo ->> 'reference'), ''), v_total, nullif(trim(p_recibo ->> 'notes'), ''),
    v_usuario_id, v_usuario_nombre
  ) returning recibos_cobro.id into v_recibo_id;

  insert into myappdb.recibo_cobro_aplicaciones (recibo_id, factura_id, saldo_inicial_id, monto)
  select v_recibo_id,
         case when (a.value ->> 'invoiceId')::bigint > 0 then (a.value ->> 'invoiceId')::bigint end,
         case when (a.value ->> 'invoiceId')::bigint < 0 then -(a.value ->> 'invoiceId')::bigint end,
         round((a.value ->> 'amount')::numeric, 2)
  from jsonb_array_elements(p_aplicaciones) a;

  perform private.recalcular_balance_cliente(v_cliente_id);

  return query select v_recibo_id, v_numero;
end;
$fn$;

-- 6) Carga de los saldos del sistema anterior (GABANA) ---------------------------
insert into myappdb.cxc_saldos_iniciales (empresa_id, cliente_id, numero, fecha, monto, nota, creado_por)
select 2, c.id, 'SA-' || d.codigo, (now() at time zone 'America/Santo_Domingo')::date, d.monto,
       'Saldo migrado de cliente.dbf (sistema anterior)', 'Migración DBF'
from (values
    ('123', 500.00),
    ('22223', 23905.15),
    ('22233', 10450.24),
    ('22237', 9020.20),
    ('22240', 22800.00),
    ('22244', 74799.84),
    ('22245', 23274.80),
    ('22246', 4049.92),
    ('22248', 83199.80),
    ('22249', 5149.92),
    ('22250', 32319.84),
    ('22251', 4049.92),
    ('22252', 55200.00),
    ('22256', 27734.84),
    ('22257', 49759.60),
    ('22258', 85119.36),
    ('22259', 6074.88),
    ('22260', 4950.00),
    ('22261', 86379.84),
    ('22262', 295427.52),
    ('22263', 49708.00),
    ('22264', 239825.36),
    ('22265', 24605.48),
    ('22266', 3000.00),
    ('22267', 315722.84),
    ('22268', 226614.44),
    ('22269', 316644.90),
    ('22270', 146899.20),
    ('22271', 31050.16),
    ('22272', 97903.92),
    ('22273', 32251.20),
    ('22274', 261890.00),
    ('22275', 43449.76),
    ('22276', 136974.08),
    ('22277', 74251.20),
    ('22278', 36044.80)
) as d(codigo, monto)
join myappdb.clients c on c.empresa_id = 2 and c.codigo = d.codigo
on conflict (empresa_id, numero) do nothing;

insert into myappdb.bitacora (empresa_id, usuario_nombre, tabla, registro_id, accion, resumen, cambios)
values (2, 'Migración DBF', 'cxc_saldos_iniciales', null, 'Crear',
        'Saldos anteriores de 36 clientes desde cliente.dbf por RD$2,941,001.01',
        jsonb_build_object('saldos', jsonb_build_object('despues', 36), 'monto_total', jsonb_build_object('despues', 2941001.01)));

-- 7) Verificación: los 36 saldos y el total deben cuadrar.
do $$
declare v_n int; v_total numeric;
begin
  select count(*), sum(monto) into v_n, v_total from myappdb.cxc_saldos_iniciales where empresa_id = 2;
  if v_n <> 36 or v_total <> 2941001.01 then
    raise exception 'Se esperaban 36 saldos por 2941001.01 y hay % por %', v_n, v_total;
  end if;
  raise notice 'Saldos anteriores cargados: % por RD$%', v_n, v_total;
end $$;

commit;
