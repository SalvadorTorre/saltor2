begin;

grant delete on myappdb.nota_credito_detalles to authenticated, service_role;

create policy nota_credito_detalles_delete_empresa on myappdb.nota_credito_detalles
for delete to authenticated
using (
  exists (
    select 1
    from myappdb.notas_credito n
    join myappdb.usuarios u on u.empresa_id = n.idempres and u.sucursal_id = n.idsucursal
    where n.id = nota_credito_id
      and u.auth_usuario_id = (select auth.uid())
      and u.estado = 'Activo'
  )
);

create or replace function myappdb.actualizar_nota_credito(p_nota_id bigint, p_nota jsonb, p_detalles jsonb)
returns table (id bigint, numero_nota text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  empresa_usuario_id integer;
  sucursal_usuario_id bigint;
begin
  if jsonb_array_length(coalesce(p_detalles, '[]'::jsonb)) = 0 then
    raise exception 'La nota de crédito debe incluir al menos una línea.' using errcode = '22023';
  end if;

  select u.empresa_id, u.sucursal_id
  into empresa_usuario_id, sucursal_usuario_id
  from myappdb.usuarios u
  where u.auth_usuario_id = (select auth.uid()) and u.estado = 'Activo';

  if not found then
    raise exception 'No se encontró un usuario activo con empresa y sucursal asignadas.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from myappdb.notas_credito n
    where n.id = p_nota_id and n.idempres = empresa_usuario_id and n.idsucursal = sucursal_usuario_id
  ) then
    raise exception 'No se encontró la nota de crédito de la empresa y sucursal actual.' using errcode = '42501';
  end if;

  update myappdb.notas_credito
  set factura_afectada_id = nullif(p_nota ->> 'invoiceId', '')::bigint,
      numero_factura_afectada = p_nota ->> 'invoice',
      encf_afectado = p_nota ->> 'encfAffected',
      fecha_comprobante_afectado = nullif(p_nota ->> 'affectedDate', '')::date,
      cliente_rnc = nullif(p_nota ->> 'rnc', ''),
      cliente_nombre = nullif(p_nota ->> 'customer', ''),
      cliente_correo = nullif(p_nota ->> 'email', ''),
      cliente_direccion = nullif(p_nota ->> 'address', ''),
      fecha_emision = coalesce(nullif(p_nota ->> 'date', '')::date, fecha_emision),
      fecha_vencimiento_secuencia = nullif(p_nota ->> 'expiry', '')::date,
      codigo_modificacion = p_nota ->> 'modificationCode',
      tipo_ingreso = p_nota ->> 'incomeType',
      forma_pago = coalesce(nullif(p_nota ->> 'payment', ''), 'Contado'),
      motivo = p_nota ->> 'reason',
      notas_internas = nullif(p_nota ->> 'internalNotes', ''),
      subtotal = coalesce((p_nota ->> 'subtotal')::numeric, 0),
      descuentos = coalesce((p_nota ->> 'discounts')::numeric, 0),
      itbis = coalesce((p_nota ->> 'itbis')::numeric, 0),
      total = coalesce((p_nota ->> 'total')::numeric, 0)
  where id = p_nota_id;

  delete from myappdb.nota_credito_detalles where nota_credito_id = p_nota_id;

  insert into myappdb.nota_credito_detalles (
    nota_credito_id, descripcion, cantidad, precio_unitario, descuento_porcentaje, tasa_itbis, monto_itbis, total_linea
  )
  select p_nota_id, detalle ->> 'description', (detalle ->> 'quantity')::numeric,
    (detalle ->> 'price')::numeric, coalesce((detalle ->> 'discount')::numeric, 0),
    coalesce((detalle ->> 'itbis')::numeric, 0), coalesce((detalle ->> 'taxAmount')::numeric, 0),
    (detalle ->> 'lineTotal')::numeric
  from jsonb_array_elements(p_detalles) detalle;

  return query select n.id, n.numero_nota from myappdb.notas_credito n where n.id = p_nota_id;
end;
$$;

grant execute on function myappdb.actualizar_nota_credito(bigint, jsonb, jsonb) to authenticated, service_role;

commit;
