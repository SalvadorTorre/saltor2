begin;

-- ===========================================================================
-- Instalador local: datos maestros de una empresa existente
--
-- Genera el SQL que carga en el servidor local los datos maestros de una
-- empresa de la nube, con los mismos id:
--   empresa, sucursales, usuarios (con su acceso y contraseña actual),
--   clientes, suplidores, productos con su existencia, secuencias de NCF,
--   contadores de documentos y configuración e-CF.
-- No lleva historial (facturas, notas, cobros, cierres...). El balance
-- pendiente de cada cliente entra como "saldo anterior" en Cuentas por cobrar
-- y la existencia de cada producto como "Saldo inicial" en el Kardex.
-- La firma digital (certificado .p12) NO se copia: se vuelve a cargar en local.
-- ===========================================================================

create or replace function private.generar_datos_maestros_instalador(p_empresa_id integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_out text;
  v_nombre text;
  t record;
  v_json text;
  v_cols text;
  v_count integer;
begin
  select nombre_comercial into v_nombre from myappdb.empresas where id = p_empresa_id;
  if not found then raise exception 'La empresa % no existe.', p_empresa_id; end if;

  v_out := format(E'-- SaltorSystem: datos maestros de %s (empresa %s)\n-- Generado: %s\n\n', v_nombre, p_empresa_id, now())
    || E'set client_min_messages = warning;\n\n';

  -- 1) Accesos (Supabase Auth) de los usuarios de la empresa, con su contraseña actual.
  select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password, 'created_at', u.created_at))::text
    into v_json
    from auth.users u
   where u.id in (select auth_usuario_id from myappdb.usuarios where empresa_id = p_empresa_id and auth_usuario_id is not null);
  if v_json is not null then
    v_out := v_out || E'-- Accesos de los usuarios\ndo $acc$\ndeclare u record; v_col text;\nbegin\n'
      || format(E'  for u in select * from jsonb_to_recordset(%L::jsonb) as x(id uuid, email text, encrypted_password text, created_at timestamptz) loop\n', v_json)
      || E'    if exists (select 1 from auth.users a where a.id = u.id or lower(a.email) = lower(u.email)) then continue; end if;\n'
      || E'    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)\n'
      || E'    values (''00000000-0000-0000-0000-000000000000'', u.id, ''authenticated'', ''authenticated'', lower(u.email), u.encrypted_password, now(),\n'
      || E'            ''{"provider":"email","providers":["email"]}''::jsonb, ''{}''::jsonb, coalesce(u.created_at, now()), now());\n'
      || E'    for v_col in select column_name from information_schema.columns where table_schema = ''auth'' and table_name = ''users''\n'
      || E'                 and data_type in (''character varying'', ''text'') and column_name in (''confirmation_token'', ''recovery_token'', ''email_change_token_new'',\n'
      || E'                 ''email_change'', ''email_change_token_current'', ''phone_change'', ''phone_change_token'', ''reauthentication_token'') loop\n'
      || E'      execute format(''update auth.users set %I = coalesce(%I, '''''''') where id = $1'', v_col, v_col) using u.id;\n'
      || E'    end loop;\n'
      || E'    if exists (select 1 from information_schema.columns where table_schema = ''auth'' and table_name = ''identities'' and column_name = ''provider_id'') then\n'
      || E'      execute ''insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)\n'
      || E'               values (gen_random_uuid(), $1, $1::text, $2, ''''email'''', now(), now(), now())''\n'
      || E'        using u.id, jsonb_build_object(''sub'', u.id::text, ''email'', lower(u.email), ''email_verified'', true);\n'
      || E'    end if;\n'
      || E'  end loop;\nend;\n$acc$;\n\n';
  end if;

  -- 2) Tablas maestras, en orden de dependencias y con los mismos id.
  for t in select * from (values
      (1, 'empresas', 'id = $1', array[]::text[]),
      (2, 'sucursales', 'idempresa = $1', array[]::text[]),
      (3, 'usuarios', 'empresa_id = $1', array['claveusuario']),
      (4, 'clients', 'empresa_id = $1', array[]::text[]),
      (5, 'suplidores', 'empresa_id = $1', array[]::text[]),
      (6, 'products', 'empresa_id = $1', array[]::text[]),
      (7, 'ncf_empresas', 'empresa_id = $1', array[]::text[]),
      (8, 'ncf_secuencias', 'empresa_id = $1', array[]::text[]),
      (9, 'ecf_configuraciones', 'empresa_id = $1', array[]::text[]),
      (10, 'contadores_ecf', 'empresa_id = $1', array[]::text[]),
      (11, 'contador_doc', 'id_empres = $1', array[]::text[])
    ) as x(orden, tabla, condicion, excluir) order by orden loop
    if to_regclass('myappdb.' || t.tabla) is null then continue; end if;
    execute format('select count(*), jsonb_agg(to_jsonb(r) - $2)::text from myappdb.%I r where %s', t.tabla, t.condicion)
      into v_count, v_json using p_empresa_id, t.excluir;
    continue when v_count = 0;
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
      from pg_attribute a
     where a.attrelid = ('myappdb.' || t.tabla)::regclass and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = '' and not (a.attname = any (t.excluir));
    v_out := v_out || format(E'-- %s (%s)\n', t.tabla, v_count)
      || format(E'alter table myappdb.%I disable trigger user;\n', t.tabla)
      || format(E'insert into myappdb.%I (%s) overriding system value\n  select %s from jsonb_populate_recordset(null::myappdb.%I, %L)\n  on conflict do nothing;\n',
                t.tabla, v_cols, v_cols, t.tabla, v_json)
      || format(E'alter table myappdb.%I enable trigger user;\n', t.tabla);
    v_out := v_out || coalesce((
      select string_agg(format(E'select setval(pg_get_serial_sequence(%L, %L), coalesce((select max(%I) from myappdb.%I), 0) + 1, false);\n',
               'myappdb.' || quote_ident(t.tabla), a.attname, a.attname, t.tabla), '')
      from pg_attribute a where a.attrelid = ('myappdb.' || t.tabla)::regclass and a.attidentity <> ''), '');
    v_out := v_out || E'\n';
  end loop;

  -- 3) Lo que cada cliente debe hoy (vista cxc_facturas, la misma de Cuentas por
  --    cobrar) -> un "saldo anterior" por cliente, y su balance queda igual.
  select jsonb_agg(jsonb_build_object('cliente_id', x.cliente_id, 'monto', x.monto))::text into v_json
    from (select v.cliente_id, round(sum(v.saldo), 2) as monto
            from myappdb.cxc_facturas v
           where v.cliente_id in (select c.id from myappdb.clients c where c.empresa_id = p_empresa_id)
           group by v.cliente_id
          having sum(v.saldo) > 0) x;
  if v_json is not null then
    v_out := v_out || E'-- Saldos pendientes de clientes\n'
      || E'alter table myappdb.cxc_saldos_iniciales disable trigger user;\n'
      || format(E'insert into myappdb.cxc_saldos_iniciales (empresa_id, cliente_id, numero, monto, nota, estado, creado_por)\n'
                '  select %s, x.cliente_id, ''SN-'' || x.cliente_id, x.monto, ''Saldo pendiente traído de la nube'', ''Activo'', ''Instalador''\n'
                '  from jsonb_to_recordset(%L::jsonb) as x(cliente_id integer, monto numeric)\n  on conflict do nothing;\n', p_empresa_id, v_json)
      || E'alter table myappdb.cxc_saldos_iniciales enable trigger user;\n'
      || E'alter table myappdb.clients disable trigger user;\n'
      || format(E'update myappdb.clients c set balance = x.monto\n  from jsonb_to_recordset(%L::jsonb) as x(cliente_id integer, monto numeric)\n  where c.id = x.cliente_id;\n', v_json)
      || E'alter table myappdb.clients enable trigger user;\n\n';
  end if;

  -- 4) Existencia de cada producto -> "Saldo inicial" en el Kardex.
  v_out := v_out || E'-- Existencias iniciales en el Kardex\n'
    || E'alter table myappdb.movimientos_inventario disable trigger user;\n'
    || format(E'insert into myappdb.movimientos_inventario (empresa_id, producto_id, tipo, cantidad, existencia_anterior, existencia_nueva, costo_unitario, documento, notas, usuario_nombre)\n'
              '  select p.empresa_id, p.id, ''Saldo inicial'', p.existencia, 0, p.existencia, p.costo, ''INSTALACION'', ''Existencia traída de la nube'', ''Instalador''\n'
              '  from myappdb.products p where p.empresa_id = %s and coalesce(p.existencia, 0) <> 0;\n', p_empresa_id)
    || E'alter table myappdb.movimientos_inventario enable trigger user;\n';

  return v_out;
end;
$fn$;

revoke all on function private.generar_datos_maestros_instalador(integer) from public, anon, authenticated;
grant execute on function private.generar_datos_maestros_instalador(integer) to service_role;

create or replace function myappdb.plataforma_datos_maestros_instalador(p_empresa_id integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.es_dueno_sistema() then
    raise exception 'Solo los dueños del sistema pueden generar el instalador.' using errcode = '42501';
  end if;
  return private.generar_datos_maestros_instalador(p_empresa_id);
end;
$$;

revoke all on function myappdb.plataforma_datos_maestros_instalador(integer) from public, anon;
grant execute on function myappdb.plataforma_datos_maestros_instalador(integer) to authenticated;

commit;
