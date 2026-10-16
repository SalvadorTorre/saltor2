begin;

-- ===========================================================================
-- Modo de facturación por empresa.
--   Directo: quien factura cobra e imprime (como hasta ahora).
--   Caja:    el vendedor guarda la factura "Pendiente de cobro" (sin NCF, sin
--            enviar a la DGII; el inventario se descuenta al guardar). La cajera
--            la cobra en Caja → Cobro de facturas: ahí se emite, se envía a la
--            DGII si corresponde y se imprime.
-- ===========================================================================

alter table myappdb.empresas add column if not exists modo_facturacion text not null default 'Directo';
alter table myappdb.empresas drop constraint if exists empresas_modo_facturacion_check;
alter table myappdb.empresas add constraint empresas_modo_facturacion_check check (modo_facturacion in ('Directo', 'Caja'));

alter table myappdb.facturas drop constraint if exists facturas_estado_check;
alter table myappdb.facturas add constraint facturas_estado_check check (estado in ('Emitida', 'Anulada', 'Pendiente de cobro'));
alter table myappdb.facturas add column if not exists cobrada_en timestamptz;
alter table myappdb.facturas add column if not exists cobrada_por text;
create index if not exists facturas_pendientes_cobro_idx on myappdb.facturas (idempres, idsucursal) where estado = 'Pendiente de cobro';

-- Toda factura nueva de una empresa en modo Caja nace pendiente de cobro y sin NCF.
create or replace function private.tg_facturas_modo_caja()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select e.modo_facturacion from myappdb.empresas e where e.id = new.idempres) = 'Caja' then
    new.estado := 'Pendiente de cobro';
    new.ncf := null;
    new.forma_pago_codigo := null;
  end if;
  return new;
end;
$$;
revoke all on function private.tg_facturas_modo_caja() from public, anon, authenticated;
drop trigger if exists facturas_modo_caja on myappdb.facturas;
create trigger facturas_modo_caja before insert on myappdb.facturas
  for each row execute function private.tg_facturas_modo_caja();

-- Mientras está pendiente, el pago lo decide la cajera: el vendedor no la marca cobrada.
create or replace function private.tg_facturas_pendiente_sin_pago()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.estado = 'Pendiente de cobro' then
    new.forma_pago_codigo := null;
    new.ncf := null;
  end if;
  return new;
end;
$$;
revoke all on function private.tg_facturas_pendiente_sin_pago() from public, anon, authenticated;
drop trigger if exists facturas_pendiente_sin_pago on myappdb.facturas;
create trigger facturas_pendiente_sin_pago before update on myappdb.facturas
  for each row execute function private.tg_facturas_pendiente_sin_pago();

-- Cobrar: la factura pasa a Emitida con la forma de pago elegida en caja.
create or replace function myappdb.cobrar_factura(p_factura_id bigint, p_forma_pago_codigo smallint)
returns table (id bigint, numero_factura text, tipo_ncf text)
language plpgsql set search_path = ''
as $$
declare
  v_empresa integer;
  v_sucursal bigint;
  v_usuario text;
  v_factura record;
begin
  select u.empresa_id, u.sucursal_id, u.nombre_completo into v_empresa, v_sucursal, v_usuario
  from myappdb.usuarios u where u.auth_usuario_id = (select auth.uid()) and u.estado = 'Activo';
  if not found then raise exception 'No se encontró un usuario activo.' using errcode = '42501'; end if;

  if p_forma_pago_codigo is null or not exists (select 1 from myappdb.formapago fp where fp.codigo = p_forma_pago_codigo) then
    raise exception 'Elige una forma de pago válida.' using errcode = '22023';
  end if;

  select f.id, f.estado, f.cliente_id into v_factura
  from myappdb.facturas f
  where f.id = p_factura_id and f.idempres = v_empresa and f.idsucursal = v_sucursal
  for update;
  if not found then raise exception 'No se encontró la factura en tu empresa y sucursal.' using errcode = '42501'; end if;
  if v_factura.estado <> 'Pendiente de cobro' then
    raise exception 'La factura ya no está pendiente de cobro (estado: %).', v_factura.estado using errcode = '22023';
  end if;
  if p_forma_pago_codigo = 4 and v_factura.cliente_id is null then
    raise exception 'Las ventas a crédito requieren un cliente registrado.' using errcode = '22023';
  end if;

  update myappdb.facturas f
     set estado = 'Emitida',
         forma_pago_codigo = p_forma_pago_codigo,
         condicion_pago = case when p_forma_pago_codigo = 4 then 'Credito' else 'Contado' end,
         fecha_factura = (now() at time zone 'America/Santo_Domingo')::date,
         cobrada_en = now(),
         cobrada_por = v_usuario
   where f.id = p_factura_id;

  return query select f.id::bigint, f.numero_factura::text, f.tipo_ncf::text from myappdb.facturas f where f.id = p_factura_id;
end;
$$;
revoke all on function myappdb.cobrar_factura(bigint, smallint) from public, anon;
grant execute on function myappdb.cobrar_factura(bigint, smallint) to authenticated;

-- Cuentas por cobrar: una factura pendiente de cobro todavía no es deuda del cliente.
create or replace view myappdb.cxc_facturas as
 SELECT f.id,
    f.idempres AS empresa_id,
    f.idsucursal AS sucursal_id,
    f.numero_factura,
    f.ncf,
    f.cliente_id,
    COALESCE(c.nombre_completo, f.cliente_nombre) AS cliente_nombre,
    COALESCE(c.numero_documento, f.cliente_rnc) AS cliente_documento,
    f.fecha_factura,
    (f.fecha_factura + COALESCE(c.dias_credito, 30)) AS fecha_vencimiento,
    f.total,
    (COALESCE(ab.abonado, (0)::numeric))::numeric(14,2) AS abonado,
    (COALESCE(nc.notas_credito, (0)::numeric))::numeric(14,2) AS notas_credito,
    (GREATEST(((f.total - COALESCE(ab.abonado, (0)::numeric)) - COALESCE(nc.notas_credito, (0)::numeric)), (0)::numeric))::numeric(14,2) AS saldo,
    GREATEST((CURRENT_DATE - (f.fecha_factura + COALESCE(c.dias_credito, 30))), 0) AS dias_vencida,
    'Factura'::text AS tipo_documento
   FROM (((myappdb.facturas f
     LEFT JOIN myappdb.clients c ON ((c.id = f.cliente_id)))
     LEFT JOIN LATERAL ( SELECT sum(a.monto) AS abonado
           FROM (myappdb.recibo_cobro_aplicaciones a
             JOIN myappdb.recibos_cobro r ON (((r.id = a.recibo_id) AND (r.estado = 'Activo'::text))))
          WHERE (a.factura_id = f.id)) ab ON (true))
     LEFT JOIN LATERAL ( SELECT sum(n.total) AS notas_credito
           FROM myappdb.notas_credito n
          WHERE ((n.factura_afectada_id = f.id) AND (COALESCE(n.estado_dgii, ''::text) !~~* 'rechaz%'::text))) nc ON (true))
  WHERE ((f.estado = 'Emitida'::text) AND ((f.forma_pago_codigo = 4) OR (f.condicion_pago = 'Credito'::text)))
UNION ALL
 SELECT (- s.id) AS id,
    s.empresa_id,
    NULL::bigint AS sucursal_id,
    s.numero AS numero_factura,
    NULL::text AS ncf,
    s.cliente_id,
    c.nombre_completo AS cliente_nombre,
    c.numero_documento AS cliente_documento,
    s.fecha AS fecha_factura,
    s.fecha AS fecha_vencimiento,
    s.monto AS total,
    (COALESCE(ab.abonado, (0)::numeric))::numeric(14,2) AS abonado,
    (0)::numeric(14,2) AS notas_credito,
    (GREATEST((s.monto - COALESCE(ab.abonado, (0)::numeric)), (0)::numeric))::numeric(14,2) AS saldo,
    GREATEST((CURRENT_DATE - s.fecha), 0) AS dias_vencida,
    'Saldo anterior'::text AS tipo_documento
   FROM ((myappdb.cxc_saldos_iniciales s
     JOIN myappdb.clients c ON ((c.id = s.cliente_id)))
     LEFT JOIN LATERAL ( SELECT sum(a.monto) AS abonado
           FROM (myappdb.recibo_cobro_aplicaciones a
             JOIN myappdb.recibos_cobro r ON (((r.id = a.recibo_id) AND (r.estado = 'Activo'::text))))
          WHERE (a.saldo_inicial_id = s.id)) ab ON (true))
  WHERE (s.estado = 'Activo'::text);

-- Cierre de caja: solo cuenta las facturas cobradas, nunca las pendientes.
do $$
declare
  d text := pg_get_functiondef('myappdb.crear_cierre_caja(text,text,text)'::regprocedure);
  n integer;
begin
  if position('Pendiente de cobro' in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, 'f.estado <> ''Anulada''', ''))) / length('f.estado <> ''Anulada''');
  if n <> 2 then raise exception 'crear_cierre_caja cambió (% coincidencias); revisar a mano.', n; end if;
  d := replace(d, 'f.estado <> ''Anulada''', 'f.estado not in (''Anulada'', ''Pendiente de cobro'')');
  if position('f.cierre_caja_id is null and coalesce(f.forma_pago_codigo' in d) = 0 then raise exception 'crear_cierre_caja: no se encontró el update.'; end if;
  d := replace(d, 'f.cierre_caja_id is null and coalesce(f.forma_pago_codigo', 'f.cierre_caja_id is null and f.estado <> ''Pendiente de cobro'' and coalesce(f.forma_pago_codigo');
  execute d;
end $$;

commit;
