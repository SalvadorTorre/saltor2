-- Proforma (E332): solo NO puede ser proforma la factura pagada con tarjeta de crédito (forma de pago 3).
-- Con RNC válido sigue siendo factura fiscal (lo decide la pantalla de Facturación).
-- Además: Cuentas por cobrar incluye las facturas a crédito con estado FACTURA o PROFORMA (no solo 'Emitida').
-- (Aplicada en Supabase como proforma_excluye_solo_tarjeta + cxc_facturas_security_invoker.)
create or replace function myappdb.normalizar_proforma_por_forma_pago()
returns trigger language plpgsql set search_path to ''
as $function$
declare v_tipo text;
begin
  v_tipo := regexp_replace(coalesce(new.tipo_ncf, ''), '[^0-9]', '', 'g');
  if v_tipo = '332' and coalesce(new.forma_pago_codigo, 1) = 3 then
    new.tipo_ncf := 'E32';
    new.ncf := null;
  end if;
  return new;
end;
$function$;

-- cobrar_factura_caja_proforma: v_debe_ser_proforma := proforma activa
--   and coalesce(p_forma_pago_codigo, 1) <> 3 and cliente sin RNC.   (ver definición completa en Supabase)

-- cxc_facturas: WHERE f.estado = ANY (ARRAY['Emitida','FACTURA','PROFORMA']) and (forma_pago_codigo = 4 or condicion_pago = 'Credito')
alter view myappdb.cxc_facturas set (security_invoker = true);
