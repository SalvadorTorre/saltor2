begin;

alter table myappdb.cotizaciones drop constraint if exists cotizaciones_estado_check;
alter table myappdb.cotizaciones add constraint cotizaciones_estado_check
  check (estado in ('Borrador', 'Facturada', 'Activa', 'Vencida', 'Cancelada'));

create or replace function myappdb.crear_cotizacion(p_cotizacion jsonb, p_detalles jsonb)
returns table(id bigint, numero_cotizacion text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_empresa integer;
  v_sucursal bigint;
  v_contador integer;
  v_numero text;
  v_id bigint;
begin
  select empresa_id, sucursal_id into v_empresa, v_sucursal
  from myappdb.usuarios
  where auth_usuario_id = (select auth.uid()) and estado = 'Activo';

  if not found or v_sucursal is null then
    raise exception 'No se encontró un usuario activo con empresa y sucursal.';
  end if;
  if jsonb_array_length(coalesce(p_detalles, '[]'::jsonb)) = 0 then
    raise exception 'La cotización debe tener al menos una línea.';
  end if;

  insert into myappdb.contador_doc(id_empres, nom_empresa, ano, factura, cotizacion, nota_credito, gasto_menores, recibo, sucursal_id)
  select e.id, e.nombre_comercial, extract(year from current_date)::smallint, 0, 0, 0, 0, 0, v_sucursal::smallint
  from myappdb.empresas e
  where e.id = v_empresa
  on conflict(id_empres, ano, sucursal_id) do nothing;

  update myappdb.contador_doc
  set cotizacion = cotizacion + 1
  where id_empres = v_empresa and sucursal_id = v_sucursal::smallint and ano = extract(year from current_date)::smallint
  returning cotizacion into v_contador;

  v_numero := extract(year from current_date)::text || lpad(v_sucursal::text, 2, '0') || lpad(v_contador::text, 5, '0');

  insert into myappdb.cotizaciones(
    idempres, idsucursal, numero_cotizacion, fecha, vigencia_hasta, cliente_nombre,
    cliente_rnc, cliente_telefono, cliente_correo, cliente_direccion, notas,
    subtotal, itbis, total, estado
  ) values (
    v_empresa, v_sucursal, v_numero, coalesce(nullif(p_cotizacion->>'fecha', '')::date, current_date),
    nullif(p_cotizacion->>'vigenciaHasta', '')::date, p_cotizacion->>'clienteNombre',
    nullif(p_cotizacion->>'clienteRnc', ''), nullif(p_cotizacion->>'clienteTelefono', ''),
    nullif(p_cotizacion->>'clienteCorreo', ''), nullif(p_cotizacion->>'clienteDireccion', ''),
    nullif(p_cotizacion->>'notas', ''), coalesce((p_cotizacion->>'subtotal')::numeric, 0),
    coalesce((p_cotizacion->>'itbis')::numeric, 0), coalesce((p_cotizacion->>'total')::numeric, 0), 'Borrador'
  ) returning cotizaciones.id into v_id;

  insert into myappdb.cotizacion_detalles(cotizacion_id, codigo_producto, descripcion, cantidad, precio_unitario, tasa_itbis, total_linea)
  select v_id, nullif(d->>'codigo', ''), d->>'descripcion', (d->>'cantidad')::numeric,
    (d->>'precio')::numeric, coalesce((d->>'itbis')::numeric, 0), (d->>'total')::numeric
  from jsonb_array_elements(p_detalles) d;

  return query select v_id, v_numero;
end;
$$;

grant execute on function myappdb.crear_cotizacion(jsonb, jsonb) to authenticated, service_role;

commit;
