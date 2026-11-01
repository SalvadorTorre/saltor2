begin;

-- ===========================================================================
-- Cierre por usuario (empresas que cobran en la venta: modo "Directo")
--  * Cada usuario cierra SUS facturas (las que él facturó), tantas veces al día
--    como necesite: cada cierre toma las que aún no tienen cierre.
--  * El administrador puede cerrar las de otro usuario (o las que no tienen
--    usuario) y ver el cierre general del día agrupado por los cierres hechos.
--  * Cada factura entra en un solo cierre (también las de crédito).
--  * Las empresas que cobran por caja (modo "Caja") siguen con crear_cierre_caja.
-- ===========================================================================

alter table myappdb.cierres_caja
  add column if not exists tipo text not null default 'Caja',
  add column if not exists vendedor_id integer,
  add column if not exists vendedor_nombre text;

do $$ begin
  alter table myappdb.cierres_caja add constraint cierres_caja_tipo_check check (tipo in ('Caja', 'Usuario'));
exception when duplicate_object then null; end $$;

create index if not exists cierres_caja_empresa_cerrado_idx on myappdb.cierres_caja (empresa_id, cerrado_en desc);
create index if not exists facturas_pendiente_cierre_idx on myappdb.facturas (idempres, usuario_id) where cierre_caja_id is null;

-- Usuario actual (para las funciones de cierre por usuario).
create or replace function private.cierre_usuario_actual()
returns table (codusuario integer, empresa_id integer, sucursal_id smallint, nombre text, es_admin boolean, modo text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.codusuario, u.empresa_id, u.sucursal_id, u.nombre_completo, u.rol = 'Administrador', coalesce(e.modo_facturacion, 'Directo')
    from myappdb.usuarios u join myappdb.empresas e on e.id = u.empresa_id
   where u.auth_usuario_id = (select auth.uid()) and u.estado = 'Activo';
$$;
revoke all on function private.cierre_usuario_actual() from public, anon, authenticated;

-- Facturas de un usuario que aún no tienen cierre.
--   p_usuario_id null = las mías; 0 = las que no tienen usuario (solo administrador).
create or replace function myappdb.cierre_usuario_pendientes(p_usuario_id integer default null)
returns table (id bigint, numero_factura text, fecha_factura date, cliente_nombre text, tipo_ncf text,
               forma_pago_codigo smallint, condicion_pago text, total numeric, usuario_id integer, usuario_nombre text, creado_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare me record; v_objetivo integer;
begin
  select * into me from private.cierre_usuario_actual();
  if me.codusuario is null then raise exception 'No se encontró un usuario activo.' using errcode = '42501'; end if;
  v_objetivo := coalesce(p_usuario_id, me.codusuario);
  if v_objetivo <> me.codusuario and not me.es_admin then
    raise exception 'Solo el administrador puede cerrar las facturas de otro usuario.' using errcode = '42501';
  end if;

  return query
    select f.id, f.numero_factura, f.fecha_factura, f.cliente_nombre, f.tipo_ncf, f.forma_pago_codigo::smallint, f.condicion_pago, f.total,
           f.usuario_id, coalesce(f.usuario_nombre, 'Sin usuario'), f.creado_en
      from myappdb.facturas f
     where f.idempres = me.empresa_id
       and f.cierre_caja_id is null
       and f.estado not in ('Anulada', 'Pendiente de cobro')
       and coalesce(f.tipo_ncf, '') <> 'E99'
       and (case when v_objetivo = 0 then f.usuario_id is null else f.usuario_id = v_objetivo end)
     order by f.numero_factura;
end;
$$;
revoke all on function myappdb.cierre_usuario_pendientes(integer) from public, anon;
grant execute on function myappdb.cierre_usuario_pendientes(integer) to authenticated;

-- Cierra las facturas indicadas (las que el usuario vio en pantalla).
create or replace function myappdb.crear_cierre_usuario(p_factura_ids bigint[], p_nota text default null, p_usuario_id integer default null)
returns table (id bigint, cantidad_facturas integer, total_efectivo numeric, total_tarjetas numeric, total_depositos numeric, total_cheques numeric,
               total_credito numeric, total_pendiente numeric, valores_cobrados numeric, valores_no_cobrados numeric, total_cierre numeric,
               cerrado_en timestamptz, factura_desde text, factura_hasta text, vendedor_nombre text, cajero_nombre text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record; v_objetivo integer; v_vendedor text; v_sucursal smallint; v_sucursal_nombre text;
  v_empresa_nombre text; v_empresa_rnc text; v_ids bigint[]; v_cierre bigint;
  v_cantidad integer; v_efectivo numeric(14,2); v_tarjetas numeric(14,2); v_depositos numeric(14,2); v_credito numeric(14,2);
  v_total numeric(14,2); v_desde text; v_hasta text;
begin
  select * into me from private.cierre_usuario_actual();
  if me.codusuario is null then raise exception 'No se encontró un usuario activo.' using errcode = '42501'; end if;
  if me.modo = 'Caja' then raise exception 'Esta empresa cobra por caja: use el cierre de caja.' using errcode = '22023'; end if;
  v_objetivo := coalesce(p_usuario_id, me.codusuario);
  if v_objetivo <> me.codusuario and not me.es_admin then
    raise exception 'Solo el administrador puede cerrar las facturas de otro usuario.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_factura_ids, 1), 0) = 0 then raise exception 'No hay facturas para cerrar.' using errcode = '22023'; end if;

  if v_objetivo = 0 then
    v_vendedor := 'Sin usuario'; v_sucursal := me.sucursal_id;
  else
    select u.nombre_completo, coalesce(u.sucursal_id, me.sucursal_id) into v_vendedor, v_sucursal
      from myappdb.usuarios u where u.codusuario = v_objetivo and u.empresa_id = me.empresa_id;
    if v_vendedor is null then raise exception 'El usuario no pertenece a la empresa.' using errcode = '42501'; end if;
  end if;
  select e.nombre_comercial, e.rnc into v_empresa_nombre, v_empresa_rnc from myappdb.empresas e where e.id = me.empresa_id;
  select s.nombresucursal into v_sucursal_nombre from myappdb.sucursales s where s.idsucursal = v_sucursal and s.idempresa = me.empresa_id;

  -- Solo las que siguen pendientes y son de ese usuario (bloqueadas: dos cierres a la vez no toman la misma).
  select array_agg(f.id order by f.id) into v_ids
    from (select f.id from myappdb.facturas f
           where f.id = any (p_factura_ids) and f.idempres = me.empresa_id and f.cierre_caja_id is null
             and f.estado not in ('Anulada', 'Pendiente de cobro') and coalesce(f.tipo_ncf, '') <> 'E99'
             and (case when v_objetivo = 0 then f.usuario_id is null else f.usuario_id = v_objetivo end)
           for update) f;
  if v_ids is null then raise exception 'Esas facturas ya fueron cerradas o anuladas. Actualice la pantalla.' using errcode = 'P0001'; end if;

  select count(*)::integer,
         coalesce(sum(case when coalesce(f.forma_pago_codigo, case when f.condicion_pago = 'Credito' then 4 else 1 end) = 1 then f.total end), 0),
         coalesce(sum(case when f.forma_pago_codigo = 3 then f.total end), 0),
         coalesce(sum(case when f.forma_pago_codigo = 2 then f.total end), 0),
         coalesce(sum(case when coalesce(f.forma_pago_codigo, case when f.condicion_pago = 'Credito' then 4 else 1 end) = 4 then f.total end), 0),
         coalesce(sum(f.total), 0), min(f.numero_factura), max(f.numero_factura)
    into v_cantidad, v_efectivo, v_tarjetas, v_depositos, v_credito, v_total, v_desde, v_hasta
    from myappdb.facturas f where f.id = any (v_ids);

  insert into myappdb.cierres_caja (empresa_id, empresa_nombre, empresa_rnc, sucursal_id, sucursal_nombre, usuario_id, cajero_nombre,
                                    factura_desde, factura_hasta, cantidad_facturas, total_efectivo, total_tarjetas, total_depositos, total_cheques,
                                    total_credito, total_pendiente, valores_cobrados, valores_no_cobrados, total_cierre, nota,
                                    tipo, vendedor_id, vendedor_nombre)
  values (me.empresa_id, v_empresa_nombre, v_empresa_rnc, v_sucursal, v_sucursal_nombre, me.codusuario, me.nombre,
          v_desde, v_hasta, v_cantidad, v_efectivo, v_tarjetas, v_depositos, 0,
          v_credito, 0, v_total - v_credito, v_credito, v_total, nullif(trim(p_nota), ''),
          'Usuario', nullif(v_objetivo, 0), v_vendedor)
  returning cierres_caja.id into v_cierre;

  insert into myappdb.cierre_caja_facturas (cierre_caja_id, factura_id, numero_factura, fecha_factura, cliente_nombre, tipo_ncf, forma_pago_codigo, condicion_pago, cobrada_en_cierre, total)
  select v_cierre, f.id, f.numero_factura, f.fecha_factura, f.cliente_nombre, f.tipo_ncf, f.forma_pago_codigo, f.condicion_pago,
         coalesce(f.forma_pago_codigo, case when f.condicion_pago = 'Credito' then 4 else 1 end) <> 4, f.total
    from myappdb.facturas f where f.id = any (v_ids);

  update myappdb.facturas f set cierre_caja_id = v_cierre, numero_cierre = v_cierre where f.id = any (v_ids);

  return query
    select c.id, c.cantidad_facturas, c.total_efectivo, c.total_tarjetas, c.total_depositos, c.total_cheques, c.total_credito, c.total_pendiente,
           c.valores_cobrados, c.valores_no_cobrados, c.total_cierre, c.cerrado_en, c.factura_desde, c.factura_hasta, c.vendedor_nombre, c.cajero_nombre
      from myappdb.cierres_caja c where c.id = v_cierre;
end;
$$;
revoke all on function myappdb.crear_cierre_usuario(bigint[], text, integer) from public, anon;
grant execute on function myappdb.crear_cierre_usuario(bigint[], text, integer) to authenticated;

-- Cierres de un día: el administrador ve todos (todas las sucursales); los demás, solo los suyos.
-- Incluye las facturas de cada cierre y, para el administrador, lo pendiente por cerrar de cada usuario.
create or replace function myappdb.cierre_resumen_dia(p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare me record; v_cierres jsonb; v_pendientes jsonb;
begin
  select * into me from private.cierre_usuario_actual();
  if me.codusuario is null then raise exception 'No se encontró un usuario activo.' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'cerradoEn', c.cerrado_en, 'tipo', c.tipo, 'sucursal', c.sucursal_nombre,
           'cajero', c.cajero_nombre, 'vendedorId', c.vendedor_id, 'vendedor', coalesce(c.vendedor_nombre, c.cajero_nombre),
           'desde', c.factura_desde, 'hasta', c.factura_hasta, 'cantidad', c.cantidad_facturas,
           'efectivo', c.total_efectivo, 'tarjetas', c.total_tarjetas, 'depositos', c.total_depositos, 'cheques', c.total_cheques,
           'credito', c.total_credito, 'cobrados', c.valores_cobrados, 'total', c.total_cierre, 'nota', c.nota,
           'facturas', (select coalesce(jsonb_agg(jsonb_build_object('numero', d.numero_factura, 'cliente', d.cliente_nombre, 'tipo', d.tipo_ncf,
                                                                      'formaPago', d.forma_pago_codigo, 'condicion', d.condicion_pago, 'total', d.total)
                                                  order by d.numero_factura), '[]'::jsonb)
                          from myappdb.cierre_caja_facturas d where d.cierre_caja_id = c.id))
         order by coalesce(c.vendedor_nombre, c.cajero_nombre), c.cerrado_en), '[]'::jsonb)
    into v_cierres
    from myappdb.cierres_caja c
   where c.empresa_id = me.empresa_id
     and (c.cerrado_en at time zone 'America/Santo_Domingo')::date = p_fecha
     and (me.es_admin or c.vendedor_id = me.codusuario or (c.vendedor_id is null and c.usuario_id = me.codusuario));

  if me.es_admin then
    select coalesce(jsonb_agg(jsonb_build_object('usuarioId', x.usuario_id, 'usuario', x.usuario, 'cantidad', x.cantidad, 'total', x.total)
                              order by x.usuario), '[]'::jsonb)
      into v_pendientes
      from (select coalesce(f.usuario_id, 0) usuario_id, coalesce(u.nombre_completo, f.usuario_nombre, 'Sin usuario') usuario,
                   count(*) cantidad, sum(f.total) total
              from myappdb.facturas f left join myappdb.usuarios u on u.codusuario = f.usuario_id
             where f.idempres = me.empresa_id and f.cierre_caja_id is null
               and f.estado not in ('Anulada', 'Pendiente de cobro') and coalesce(f.tipo_ncf, '') <> 'E99'
             group by 1, 2) x;
  end if;

  return jsonb_build_object('esAdmin', me.es_admin, 'modo', me.modo, 'usuarioId', me.codusuario, 'usuario', me.nombre,
                            'cierres', v_cierres, 'pendientes', coalesce(v_pendientes, '[]'::jsonb));
end;
$$;
revoke all on function myappdb.cierre_resumen_dia(date) from public, anon;
grant execute on function myappdb.cierre_resumen_dia(date) to authenticated;

commit;
