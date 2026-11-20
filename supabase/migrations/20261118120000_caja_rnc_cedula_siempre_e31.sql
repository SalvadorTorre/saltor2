-- Caja (Cobro / Facturar órdenes): factura con RNC (9 dígitos) o cédula (11) siempre es crédito fiscal E31,
-- aunque se haya preparado como E32 o proforma E332.
do $mig$
declare
  v_def text := pg_get_functiondef('myappdb.cobrar_factura_caja_proforma(bigint, smallint)'::regprocedure);
  v_old text := $t$  if v_debe_ser_proforma and v_tipo = '32' then$t$;
  v_new text;
begin
  if position(v_old in v_def) = 0 then raise exception 'No se encontró el bloque de proforma en cobrar_factura_caja_proforma'; end if;
  v_new := replace(v_def, v_old,
    $t$  -- Con RNC o cédula la factura es E31 (crédito fiscal), sin importar la forma de pago.
  if length(regexp_replace(v_factura.cliente_rnc, '\D', '', 'g')) in (9, 11) and v_tipo in ('32', '332') then
    if exists(select 1 from myappdb.ecf_operaciones o where o.tipo = 'FACTURA' and o.documento_id = p_factura_id and o.activa) then
      raise exception 'La factura ya tiene una operación electrónica. Revisa su estado antes de convertirla.' using errcode = '22023';
    end if;
    update myappdb.facturas f set tipo_ncf = 'E31', ncf = null where f.id = p_factura_id;
  elsif v_debe_ser_proforma and v_tipo = '32' then$t$);
  execute v_new;
end $mig$;
