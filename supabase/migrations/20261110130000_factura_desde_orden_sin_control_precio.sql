-- Factura generada desde una orden de venta: los precios ya se validaron al crear la orden,
-- así que al facturarla no se vuelve a exigir el precio mínimo/especial.
-- Solo vale para una orden de la misma empresa que todavía no tiene factura.
create or replace function private.factura_desde_orden(p_factura jsonb)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from myappdb.ordenventa o
    where o.id = nullif(p_factura ->> 'salesOrderId', '')::bigint
      and o.idempres = private.current_empresa_id()
      and o.factura_id is null
  );
$$;
revoke all on function private.factura_desde_orden(jsonb) from public, anon;
grant execute on function private.factura_desde_orden(jsonb) to authenticated;

do $mig$
declare
  v_def text := pg_get_functiondef('myappdb.crear_factura(jsonb, jsonb)'::regprocedure);
  v_old text := $t$elsif coalesce(p_factura ->> 'ncfType', '') ~ '(^|\D)31(\D|$)' then$t$;
  v_new text;
begin
  if position(v_old in v_def) = 0 then raise exception 'No se encontró la validación de precio en crear_factura'; end if;
  v_new := replace(v_def, v_old,
    E'elsif private.factura_desde_orden(p_factura) then\n'
    || E'      null; -- orden de venta: el precio ya se validó al crear la orden\n    '
    || v_old);
  execute v_new;
end $mig$;
