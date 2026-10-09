begin;

-- ---------------------------------------------------------------------------
-- Seguridad (avisos del linter de Supabase)
-- ---------------------------------------------------------------------------

-- siguiente_numero_documento: corre con privilegios elevados y cualquiera, aun
-- sin iniciar sesión, podía llamarla por /rest/v1/rpc para consumir números.
-- Ni la app ni otras funciones la usan.
revoke execute on function myappdb.siguiente_numero_documento(text) from public, anon, authenticated;

-- guardar_certificado_firma_digital: permitía a cualquier usuario (no solo el
-- administrador) reemplazar el certificado de la empresa.  La app guarda el
-- certificado por la función de servidor guardar-certificado-ecf, que usa la
-- variante _servidor; esta queda cerrada.
revoke execute on function myappdb.guardar_certificado_firma_digital(text, text, text, text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;

-- siguiente_numero_factura_usuario: crear_factura la necesita, pero expuesta en
-- la API permitía saltarse números de factura llamándola directamente.  Se
-- mueve al esquema privado (no expuesto) y crear_factura se apunta allí.
alter function myappdb.siguiente_numero_factura_usuario() set schema private;
revoke execute on function private.siguiente_numero_factura_usuario() from public, anon;
grant execute on function private.siguiente_numero_factura_usuario() to authenticated, service_role;

do $$
declare
  v_oid oid;
  v_def text;
begin
  for v_oid in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'myappdb' and p.prosrc like '%myappdb.siguiente_numero_factura_usuario()%'
  loop
    v_def := replace(pg_get_functiondef(v_oid),
      'myappdb.siguiente_numero_factura_usuario()', 'private.siguiente_numero_factura_usuario()');
    execute v_def;
  end loop;
end;
$$;

-- set_updated_at sin search_path fijo.
alter function myappdb.set_updated_at() set search_path = '';

-- ---------------------------------------------------------------------------
-- Rendimiento
-- ---------------------------------------------------------------------------

-- Índices idénticos (se conserva uno de cada par).
drop index if exists myappdb.cotizacion_detalles_cotizacion_empresa_idx;
drop index if exists myappdb.factura_detalles_factura_empresa_idx;
drop index if exists myappdb.nota_credito_detalles_nota_empresa_idx;
drop index if exists myappdb.usuarios_nombre_usuario_login_key;

-- Llaves foráneas sin índice.
create index if not exists cierres_caja_usuario_idx on myappdb.cierres_caja (usuario_id);
create index if not exists cotizaciones_idsucursal_idx on myappdb.cotizaciones (idsucursal);
create index if not exists facturas_forma_pago_codigo_idx on myappdb.facturas (forma_pago_codigo);
create index if not exists facturas_idsucursal_idx on myappdb.facturas (idsucursal);
create index if not exists notas_credito_idsucursal_idx on myappdb.notas_credito (idsucursal);
create index if not exists product_entries_producto_idx on myappdb.product_entries (producto_id);
create index if not exists product_entries_suplidor_idx on myappdb.product_entries (suplidor_id);
create index if not exists product_entry_headers_suplidor_idx on myappdb.product_entry_headers (suplidor_id);

commit;
