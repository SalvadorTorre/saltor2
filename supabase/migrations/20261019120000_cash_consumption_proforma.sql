begin;

-- Convertir y cobrar es una sola transacción. La firma conserva su reserva propia
-- en reservar_operacion_ecf y se solicita solo después de confirmar el cobro.
create function myappdb.cobrar_factura_caja_proforma(p_factura_id bigint, p_forma_pago_codigo smallint)
returns table (id bigint, numero_factura text, tipo_ncf text)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_empresa integer;
  v_sucursal bigint;
  v_factura record;
  v_tipo text;
  v_proforma_activa boolean;
begin
  select u.empresa_id, u.sucursal_id into v_empresa, v_sucursal
    from myappdb.usuarios u where u.auth_usuario_id = (select auth.uid()) and u.estado = 'Activo';
  if not found then raise exception 'No se encontró un usuario activo.' using errcode='42501'; end if;

  select f.id, f.estado, f.tipo_ncf into v_factura from myappdb.facturas f
    where f.id=p_factura_id and f.idempres=v_empresa and f.idsucursal=v_sucursal for update;
  if not found then raise exception 'No se encontró la factura en tu empresa y sucursal.' using errcode='42501'; end if;
  if v_factura.estado <> 'Pendiente de cobro' then
    raise exception 'La factura ya no está pendiente de cobro.' using errcode='22023';
  end if;
  v_tipo := substring(upper(trim(v_factura.tipo_ncf)) from '^(?:E)?(332|[0-9]{2})(?:[^0-9]|$)');
  select exists(select 1 from myappdb.empresas_proforma p where p.empresa_id=v_empresa and p.activa) into v_proforma_activa;
  if v_tipo='332' and not v_proforma_activa then
    raise exception 'La factura proforma no está activa para esta empresa.' using errcode='22023';
  end if;
  if v_tipo='332' or (v_tipo='32' and v_proforma_activa) then
    if exists(select 1 from myappdb.ecf_operaciones o where o.tipo='FACTURA' and o.documento_id=p_factura_id and o.activa) then
      raise exception 'La factura ya tiene una operación electrónica. Revisa su estado antes de convertirla.' using errcode='22023';
    end if;
    if v_tipo='32' then
      update myappdb.facturas f set tipo_ncf='E332',ncf=null where f.id=p_factura_id;
    end if;
  end if;
  return query select * from myappdb.cobrar_factura(p_factura_id,p_forma_pago_codigo);
end;
$$;
revoke all on function myappdb.cobrar_factura_caja_proforma(bigint,smallint) from public,anon;
grant execute on function myappdb.cobrar_factura_caja_proforma(bigint,smallint) to authenticated;
notify pgrst,'reload schema';
commit;
