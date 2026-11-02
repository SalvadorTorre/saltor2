/**
 * Arma el paquete de instalación local de SaltorSystem (Supabase self-hosted +
 * el sistema web) como un .zip listo para copiar a la PC servidor del cliente.
 *
 * Todo se genera en el navegador: los secretos (contraseña de Postgres, JWT,
 * llaves anon/service_role) son únicos por paquete y nunca pasan por la nube.
 */

/** Versiones fijas de las imágenes: así cada instalación queda igual. */
export const INSTALLER_IMAGES = {
  postgres: 'supabase/postgres:17.6.1.136',
  auth: 'supabase/gotrue:v2.196.0',
  rest: 'postgrest/postgrest:v14.17',
  functions: 'supabase/edge-runtime:v1.76.2',
  web: 'nginx:1.27-alpine'
} as const;

export type LicenseType = 'Prueba' | 'Activa';

export interface LocalInstallerOptions {
  cliente: string;
  rnc: string;
  correoEmpresa: string;
  telefono: string;
  rootCorreo: string;
  rootUsuario: string;
  rootNombre: string;
  rootPassword: string;
  postgresPassword: string;
  licencia: LicenseType;
  licenciaHasta: string;
  plan: string;
  puertoWeb: number;
  exponerPostgres: boolean;
  puertoPostgres: number;
  qzCertificado: string;
  qzLlave: string;
  /** Empresa de la nube cuyos datos maestros van en el paquete (null = instalación vacía). */
  empresaDatosId: number | null;
  /** Otras empresas de la nube que también se llevan con sus datos (además de la principal). */
  empresasExtraIds: number[];
}

export interface InstallerSources {
  /** SQL del esquema real (myappdb.plataforma_esquema_instalador). */
  esquemaSql: string;
  /** Archivos del sistema web ya compilado (dist/saltor2). */
  web: { ruta: string; datos: Uint8Array }[];
  /** Funciones Edge (supabase/functions) y el enrutador main/index.ts. */
  funciones: { ruta: string; contenido: string }[];
  version: string;
  /** SQL con los datos maestros de las empresas elegidas (myappdb.plataforma_datos_maestros_instalador). */
  datosSql?: string;
}

export interface InstallerPackage {
  nombreArchivo: string;
  zip: Blob;
  /** Para mostrar en pantalla después de generar. */
  resumen: { carpeta: string; archivos: number; bytes: number };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Cadena aleatoria segura (sin caracteres que estorben en URLs o en el .env). */
export function randomSecret(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALNUM[b % ALNUM.length];
  return out;
}

export function slugify(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cliente';
}

const sqlText = (value: string): string => `'${String(value ?? '').replace(/'/g, "''")}'`;

const base64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** JWT HS256 firmado con el secreto de esta instalación (llaves anon y service_role). */
export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = base64Url(utf8(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64Url(utf8(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(`${header}.${body}`)));
  return `${header}.${body}.${base64Url(signature)}`;
}

/** Valor para el .env entre comillas dobles; los saltos de línea quedan como \n. */
const envQuoted = (value: string): string =>
  `"${value.replace(/\r\n/g, '\n').trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

/** Archivos .bat con fin de línea de Windows. */
const crlf = (text: string): string => text.replace(/\r?\n/g, '\r\n');

// ---------------------------------------------------------------------------
// Validación del formulario
// ---------------------------------------------------------------------------

export function validateOptions(o: LocalInstallerOptions): string | null {
  if (!o.cliente.trim()) return 'Escribe el nombre del cliente.';
  if (!o.rnc.trim()) return 'Escribe el RNC o cédula de la empresa del cliente.';
  if (!/^\S+@\S+\.\S+$/.test(o.rootCorreo.trim())) return 'El correo del usuario dueño no es válido.';
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(o.rootUsuario.trim())) return 'El usuario de acceso debe tener de 3 a 30 letras, números, punto, guion o guion bajo.';
  if (o.rootPassword.length < 8) return 'La contraseña del dueño debe tener al menos 8 caracteres.';
  if (/['\r\n]/.test(o.rootPassword)) return 'La contraseña del dueño no puede llevar comillas simples.';
  if (!/^[A-Za-z0-9._-]{12,64}$/.test(o.postgresPassword)) return 'La contraseña de Postgres debe tener de 12 a 64 letras, números, punto, guion o guion bajo.';
  if (!o.licenciaHasta) return 'Indica hasta qué fecha es válida la licencia.';
  const ports = [o.puertoWeb, ...(o.exponerPostgres ? [o.puertoPostgres] : [])];
  if (ports.some((p) => !Number.isInteger(p) || p < 1 || p > 65535)) return 'Revisa los puertos (1 a 65535).';
  if (o.exponerPostgres && o.puertoPostgres === o.puertoWeb) return 'El puerto web y el de Postgres deben ser distintos.';
  if (!!o.qzCertificado.trim() !== !!o.qzLlave.trim()) return 'Para la firma de QZ Tray pega el certificado y la llave privada, o deja ambos vacíos.';
  return null;
}

// ---------------------------------------------------------------------------
// Contenido del paquete
// ---------------------------------------------------------------------------

function dockerCompose(o: LocalInstallerOptions, project: string): string {
  const img = INSTALLER_IMAGES;
  const dbPorts = o.exponerPostgres ? `\n    ports:\n      - "\${POSTGRES_PORT_HOST}:5432"` : '';
  return `# SaltorSystem - instalación local (${o.cliente})
# Generado por Plataforma > Instalador local. Los valores están en el archivo .env.
name: ${project}

services:
  db:
    image: ${img.postgres}
    restart: unless-stopped
    volumes:
      - ./db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro
      - ./db/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:ro
      - ./db/auth-owner.sql:/docker-entrypoint-initdb.d/init-scripts/99-auth-owner.sql:ro
      - db-data:/var/lib/postgresql/data
      - db-config:/etc/postgresql-custom
      - ./respaldos:/respaldos${dbPorts}
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 20
    environment:
      POSTGRES_HOST: /var/run/postgresql
      PGPORT: 5432
      POSTGRES_PORT: 5432
      PGPASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      PGDATABASE: postgres
      POSTGRES_DB: postgres
      JWT_SECRET: \${JWT_SECRET}
      JWT_EXP: \${JWT_EXPIRY}
    command: ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf", "-c", "log_min_messages=fatal", "-c", "timezone=America/Santo_Domingo"]

  auth:
    image: ${img.auth}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9999/health"]
      interval: 5s
      timeout: 5s
      retries: 30
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: \${SITE_URL}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:\${POSTGRES_PASSWORD}@db:5432/postgres
      GOTRUE_SITE_URL: \${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: ""
      GOTRUE_DISABLE_SIGNUP: "true"
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: \${JWT_EXPIRY}
      GOTRUE_JWT_SECRET: \${JWT_SECRET}
      GOTRUE_JWT_ISSUER: \${SITE_URL}/auth/v1
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: "false"
      GOTRUE_MAILER_AUTOCONFIRM: "true"
      GOTRUE_EXTERNAL_PHONE_ENABLED: "false"
      GOTRUE_SMS_AUTOCONFIRM: "false"
      # Todos los inicios de sesión pasan por la función iniciar-sesion-usuario (una sola IP).
      GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "3000"
      GOTRUE_RATE_LIMIT_VERIFY: "3000"

  instalador:
    # Crea la base de SaltorSystem la primera vez y luego termina.
    image: ${img.postgres}
    restart: "no"
    depends_on:
      db:
        condition: service_healthy
      auth:
        condition: service_healthy
    entrypoint: ["bash", "/instalador/instalar.sh"]
    volumes:
      - ./db:/instalador:ro
    environment:
      PGHOST: db
      PGPORT: 5432
      PGUSER: postgres
      PGDATABASE: postgres
      PGPASSWORD: \${POSTGRES_PASSWORD}
      SALTOR_ROOT_PASSWORD: \${SALTOR_ROOT_PASSWORD}
      SALTOR_VERSION: \${SALTOR_VERSION}

  rest:
    image: ${img.rest}
    restart: unless-stopped
    depends_on:
      instalador:
        condition: service_completed_successfully
    environment:
      PGRST_DB_URI: postgres://authenticator:\${POSTGRES_PASSWORD}@db:5432/postgres
      PGRST_DB_SCHEMAS: myappdb,public
      PGRST_DB_MAX_ROWS: 10000
      PGRST_DB_EXTRA_SEARCH_PATH: public,extensions
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: \${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
      PGRST_APP_SETTINGS_JWT_SECRET: \${JWT_SECRET}
      PGRST_APP_SETTINGS_JWT_EXP: \${JWT_EXPIRY}
    command: ["postgrest"]

  functions:
    image: ${img.functions}
    restart: unless-stopped
    depends_on:
      instalador:
        condition: service_completed_successfully
    volumes:
      - ./functions:/home/deno/functions:ro
      - deno-cache:/root/.cache/deno
    environment:
      JWT_SECRET: \${JWT_SECRET}
      SUPABASE_URL: http://web
      SUPABASE_PUBLIC_URL: \${SITE_URL}
      SUPABASE_ANON_KEY: \${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: \${SERVICE_ROLE_KEY}
      SUPABASE_DB_URL: postgresql://postgres:\${POSTGRES_PASSWORD}@db:5432/postgres
      VERIFY_JWT: "true"
      APP_SCHEMA: myappdb
      ECF_ENCRYPTION_KEY: \${ECF_ENCRYPTION_KEY}
      QZ_CERTIFICATE: \${QZ_CERTIFICATE}
      QZ_PRIVATE_KEY: \${QZ_PRIVATE_KEY}
    command: ["start", "--user-worker-request-idle-timeout", "150000", "--main-service", "/home/deno/functions/main"]

  web:
    # Sistema web + puerta de entrada a la API (/auth/v1, /rest/v1, /functions/v1).
    image: ${img.web}
    restart: unless-stopped
    depends_on:
      - rest
      - functions
    ports:
      - "\${WEB_PORT}:80"
    volumes:
      - ./web:/usr/share/nginx/html:ro
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro

volumes:
  db-data:
  db-config:
  deno-cache:
`;
}

function envFile(o: LocalInstallerOptions, s: { jwtSecret: string; anonKey: string; serviceKey: string; ecfKey: string }, version: string): string {
  return `# SaltorSystem - instalación local de ${o.cliente}
# Generado: ${new Date().toISOString()} - versión ${version}
# CONFIDENCIAL: este archivo tiene las contraseñas y llaves de esta instalación.

WEB_PORT=${o.puertoWeb}
SITE_URL=http://localhost:${o.puertoWeb}
POSTGRES_PORT_HOST=${o.puertoPostgres}

POSTGRES_PASSWORD=${o.postgresPassword}
JWT_SECRET=${s.jwtSecret}
JWT_EXPIRY=3600
ANON_KEY=${s.anonKey}
SERVICE_ROLE_KEY=${s.serviceKey}
ECF_ENCRYPTION_KEY=${s.ecfKey}

# Usuario dueño del sistema (${o.rootCorreo.trim().toLowerCase()} / ${o.rootUsuario.trim()})
SALTOR_ROOT_PASSWORD='${o.rootPassword}'
SALTOR_VERSION=${version}

# Firma de QZ Tray (opcional)
QZ_CERTIFICATE=${o.qzCertificado.trim() ? envQuoted(o.qzCertificado) : '""'}
QZ_PRIVATE_KEY=${o.qzLlave.trim() ? envQuoted(o.qzLlave) : '""'}
`;
}

const NGINX_CONF = `# SaltorSystem: sistema web y API en el mismo puerto.
server {
  listen 80;
  server_name _;
  client_max_body_size 25m;

  # DNS interno de Docker: vuelve a resolver los servicios si se reinician.
  resolver 127.0.0.11 valid=10s ipv6=off;
  set $auth_up http://auth:9999;
  set $rest_up http://rest:3000;
  set $functions_up http://functions:9000;

  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;

  location /auth/v1/ {
    rewrite ^/auth/v1/(.*)$ /$1 break;
    proxy_pass $auth_up;
  }

  location /rest/v1/ {
    rewrite ^/rest/v1/(.*)$ /$1 break;
    proxy_pass $rest_up;
  }

  location /functions/v1/ {
    rewrite ^/functions/v1/(.*)$ /$1 break;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
    proxy_pass $functions_up;
  }

  root /usr/share/nginx/html;
  index index.html;

  location = /config.js {
    add_header Cache-Control "no-store";
  }

  location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
`;

const ROLES_SQL = `-- Contraseñas de los roles internos de Supabase (igual que el docker oficial).
\\set pgpass \`echo "$POSTGRES_PASSWORD"\`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
`;

const JWT_SQL = `\\set jwt_exp \`echo "$JWT_EXP"\`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
`;

/** El servicio de autenticación necesita ser dueño de las funciones del esquema auth. */
const AUTH_OWNER_SQL = `-- GoTrue modifica auth.uid(), auth.role(), etc. en sus migraciones.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as f from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' loop
    execute format('alter function %s owner to supabase_auth_admin', r.f);
  end loop;
end $$;
`;

const INSTALL_SH = `#!/bin/bash
# SaltorSystem: prepara la base de datos (solo la primera vez) y termina.
set -euo pipefail

echo "Esperando la base de datos..."
until pg_isready -q; do sleep 2; done

if [ "$(psql -X -tA -c "select to_regclass('myappdb.empresas') is not null")" != "t" ]; then
  echo "Creando la base de SaltorSystem (esto puede tardar un minuto)..."
  psql -X -q -v ON_ERROR_STOP=1 -f /instalador/esquema.sql
  echo "Esquema creado."
else
  echo "La base de SaltorSystem ya existe."
fi

# Datos de la empresa y datos iniciales: solo la primera vez.
if [ "$(psql -X -tA -c "select to_regclass('private.instalacion_local') is not null")" != "t" ]; then
  if [ -s /instalador/datos.sql ]; then
    echo "Cargando los datos de la empresa (usuarios, clientes, productos, NCF)..."
    psql -X -q -v ON_ERROR_STOP=1 --single-transaction -f /instalador/datos.sql
  fi
  echo "Cargando los datos iniciales..."
  psql -X -q -v ON_ERROR_STOP=1 -v root_password="$SALTOR_ROOT_PASSWORD" -f /instalador/semilla.sql
else
  echo "Los datos iniciales ya estaban cargados."
fi

psql -X -q -v ON_ERROR_STOP=1 -v version="$SALTOR_VERSION" <<'SQL'
create table if not exists private.instalacion_local (
  id smallint primary key default 1 check (id = 1),
  version text,
  instalado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
revoke all on private.instalacion_local from public, anon, authenticated;
insert into private.instalacion_local (version) values (:'version')
on conflict (id) do update set version = excluded.version, actualizado_en = now();
notify pgrst, 'reload schema';
SQL

echo "SaltorSystem está listo."
`;

function semillaSql(o: LocalInstallerOptions): string {
  return `-- SaltorSystem: datos iniciales de esta instalación.
-- Crea (solo la primera vez) la empresa del cliente, el usuario dueño del sistema
-- y la licencia. La contraseña llega desde el archivo .env (SALTOR_ROOT_PASSWORD).
select set_config('saltor.root_password', :'root_password', false);

do $semilla$
declare
  c_empresa      constant text := ${sqlText(o.cliente.trim().toUpperCase())};
  c_rnc          constant text := ${sqlText(o.rnc.replace(/\D/g, '') || o.rnc.trim())};
  c_correo_emp   constant text := ${sqlText((o.correoEmpresa.trim() || o.rootCorreo.trim()).toLowerCase())};
  c_telefono     constant text := ${sqlText(o.telefono.trim())};
  c_correo       constant text := lower(${sqlText(o.rootCorreo.trim())});
  c_usuario      constant text := ${sqlText(o.rootUsuario.trim())};
  c_nombre       constant text := ${sqlText(o.rootNombre.trim() || 'Soporte')};
  c_licencia     constant text := ${sqlText(o.licencia)};
  c_hasta        constant date := date ${sqlText(o.licenciaHasta)};
  c_plan         constant text := ${sqlText(o.plan)};
  c_empresa_datos constant integer := ${o.empresaDatosId ?? 'null'};
  c_empresas_extra constant integer[] := array[${(o.empresasExtraIds ?? []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0).join(', ')}]::integer[];
  v_sus_empresa  integer;
  v_password     text := current_setting('saltor.root_password');
  v_uid          uuid;
  v_empresa_id   integer;
  v_plan_id      integer;
  v_col          text;
begin
  if coalesce(length(v_password), 0) < 8 then
    raise exception 'Falta SALTOR_ROOT_PASSWORD en el archivo .env (mínimo 8 caracteres).';
  end if;

  -- 1) Usuario de acceso (Supabase Auth)
  select id into v_uid from auth.users where lower(email) = c_correo;
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', c_correo,
            extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
    -- El servicio de autenticación no acepta estos campos en NULL.
    for v_col in select column_name from information_schema.columns
                 where table_schema = 'auth' and table_name = 'users' and data_type in ('character varying', 'text')
                   and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                                       'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token') loop
      execute format('update auth.users set %I = coalesce(%I, '''') where id = $1', v_col, v_col) using v_uid;
    end loop;
    if to_regclass('auth.identities') is not null then
      if exists (select 1 from information_schema.columns
                 where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id') then
        execute 'insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
                 values (gen_random_uuid(), $1, $1::text, $2, ''email'', now(), now(), now())'
          using v_uid, jsonb_build_object('sub', v_uid::text, 'email', c_correo, 'email_verified', true);
      else
        execute 'insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
                 values ($1::text, $1, $2, ''email'', now(), now(), now())'
          using v_uid, jsonb_build_object('sub', v_uid::text, 'email', c_correo);
      end if;
    end if;
  else
    update auth.users set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
                          email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
    where id = v_uid;
  end if;

  -- 2) Empresa (los triggers crean la sucursal PRINCIPAL y la suscripción)
  if c_empresa_datos is not null then
    v_empresa_id := c_empresa_datos;   -- empresa traída de la nube con sus datos
  else
    select id into v_empresa_id from myappdb.empresas where rnc = c_rnc;
  end if;
  if v_empresa_id is null then
    insert into myappdb.empresas (nombre_comercial, razon_social, rnc, correo, telefono)
    values (c_empresa, c_empresa, c_rnc, c_correo_emp, nullif(c_telefono, ''))
    returning id into v_empresa_id;
  end if;

  select id into v_plan_id from myappdb.plataforma_planes where nombre = c_plan;
  if v_plan_id is null then
    select id into v_plan_id from myappdb.plataforma_planes where activo order by orden, id limit 1;
  end if;
  -- Licencia para la empresa principal y para cada empresa adicional traída de la nube.
  foreach v_sus_empresa in array (array[v_empresa_id] || c_empresas_extra) loop
  continue when not exists (select 1 from myappdb.empresas where id = v_sus_empresa);
  insert into myappdb.plataforma_suscripciones (empresa_id, plan_id, estado, fecha_inicio, prueba_hasta, pagado_hasta, notas)
  values (v_sus_empresa, v_plan_id, c_licencia, current_date,
          case when c_licencia = 'Prueba' then c_hasta end, case when c_licencia = 'Activa' then c_hasta end, 'Instalación local')
  on conflict (empresa_id) do update
    set estado = excluded.estado, plan_id = coalesce(excluded.plan_id, myappdb.plataforma_suscripciones.plan_id),
        prueba_hasta = case when excluded.estado = 'Prueba' then excluded.prueba_hasta else myappdb.plataforma_suscripciones.prueba_hasta end,
        pagado_hasta = case when excluded.estado = 'Activa' then excluded.pagado_hasta else myappdb.plataforma_suscripciones.pagado_hasta end,
        notas = excluded.notas;
  end loop;

  -- 3) Usuario del sistema y dueño de la plataforma
  if exists (select 1 from myappdb.usuarios where lower(correo) = c_correo) then
    update myappdb.usuarios set auth_usuario_id = v_uid, estado = 'Activo' where lower(correo) = c_correo;
  else
    insert into myappdb.usuarios (nombre, apellido, nombre_completo, correo, empresa_id, sucursal, rol, estado,
                                  nombre_usuario, auth_usuario_id)
    values (c_nombre, 'SaltorSystem', c_nombre || ' SaltorSystem', c_correo, v_empresa_id,
            (select nombresucursal from myappdb.sucursales where idempresa = v_empresa_id order by idsucursal limit 1),
            'Administrador', 'Activo', c_usuario, v_uid)
    on conflict do nothing;
    if not found then
      raise warning 'El usuario de acceso % ya existe en la empresa: entra con el correo % o cambia el usuario.', c_usuario, c_correo;
    end if;
  end if;

  insert into private.duenos_sistema (auth_usuario_id) values (v_uid) on conflict do nothing;

  raise notice 'Instalación lista: empresa % y usuario %.', c_empresa, c_usuario;
end;
$semilla$;

select set_config('saltor.root_password', '', false);
`;
}

function configJs(o: LocalInstallerOptions, anonKey: string, version: string): string {
  return `// SaltorSystem - instalación local de ${o.cliente.replace(/[\r\n*/]/g, ' ')}
// El sistema usa la API de este mismo servidor (sirve en la PC servidor y en la red local).
window.SALTOR_CONFIG = {
  instalacionLocal: true,
  cliente: ${JSON.stringify(o.cliente.trim())},
  version: ${JSON.stringify(version)},
  supabaseUrl: window.location.origin,
  anonKey: ${JSON.stringify(anonKey)}
};
`;
}

function installBat(o: LocalInstallerOptions): string {
  const p = o.puertoWeb;
  return crlf(`@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title SaltorSystem - Instalacion local

echo.
echo  ==============================================
echo   SaltorSystem - ${o.cliente.replace(/[&|<>^%"]/g, ' ')}
echo  ==============================================
echo.

docker version >nul 2>&1
if errorlevel 1 (
  echo  Docker no esta instalado o Docker Desktop no esta abierto.
  echo  Instala Docker Desktop desde https://www.docker.com/products/docker-desktop/
  echo  abrelo, espera a que diga "Engine running" y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if not exist respaldos mkdir respaldos

echo  Descargando e iniciando los servicios.
echo  La primera vez descarga cerca de 1.5 GB y puede tardar varios minutos.
echo.
docker compose up -d
if errorlevel 1 (
  echo.
  echo  No se pudo iniciar SaltorSystem. Revisa los mensajes de arriba.
  pause
  exit /b 1
)

echo.
echo  Preparando la base de datos...
docker compose logs -f instalador
set CODE=1
for /f %%i in ('docker compose ps -a -q instalador') do for /f %%c in ('docker inspect -f "{{.State.ExitCode}}" %%i') do set CODE=%%c
if not "%CODE%"=="0" (
  echo.
  echo  La preparacion de la base de datos fallo. Envia a soporte el texto de arriba.
  pause
  exit /b 1
)

rem Permite entrar desde otras PCs de la red (requiere ejecutar como administrador).
netsh advfirewall firewall add rule name="SaltorSystem ${p}" dir=in action=allow protocol=TCP localport=${p} >nul 2>&1

echo.
echo  ==============================================
echo   SaltorSystem esta listo.
echo   En esta PC:        http://localhost:${p}
echo   En la red local:   http://IP-DE-ESTA-PC:${p}
echo  ==============================================
echo.
echo  IP de esta PC:
ipconfig | findstr /i "IPv4"
echo.
start "" http://localhost:${p}
pause
`);
}

const STOP_BAT = crlf(`@echo off
cd /d "%~dp0"
echo Deteniendo SaltorSystem (los datos se conservan)...
docker compose stop
pause
`);

const START_BAT = (port: number) => crlf(`@echo off
cd /d "%~dp0"
echo Iniciando SaltorSystem...
docker compose up -d
if errorlevel 1 ( pause & exit /b 1 )
start "" http://localhost:${port}
`);

const BACKUP_BAT = crlf(`@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist respaldos mkdir respaldos
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set FECHA=%%i
echo Creando respaldo respaldos\\saltor-%FECHA%.dump ...
docker compose exec -T db pg_dump -U supabase_admin -d postgres -Fc -n myappdb -n private -n auth -f /respaldos/saltor-%FECHA%.dump
if errorlevel 1 (
  echo No se pudo crear el respaldo. Verifica que SaltorSystem este iniciado.
) else (
  echo Respaldo listo. Copialo a una memoria USB o a la nube.
)
pause
`);

/** Restaura solo los DATOS de un respaldo (.dump) sobre la estructura de esta instalación. Corre dentro del contenedor db. */
const RESTORE_SH = `#!/bin/bash
# SaltorSystem: restaura SOLO LOS DATOS de un respaldo (.dump) en esta instalación.
# La estructura (tablas, funciones, versión) se queda la de esta instalación.
# Todo se hace en una sola transacción: si algo falla, no se cambia nada.
set -euo pipefail

ARCHIVO="\${1:-}"
PSQL="psql -X -q -U supabase_admin -d postgres -v ON_ERROR_STOP=1"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [ ! -f "$ARCHIVO" ]; then echo "No se encontró el respaldo $ARCHIVO"; exit 1; fi
if ! pg_restore -l "$ARCHIVO" > "$WORK/todo.lst" 2>/dev/null; then
  echo "El archivo no es un respaldo válido de SaltorSystem."; exit 1
fi
if ! grep -q " TABLE DATA myappdb empresas " "$WORK/todo.lst"; then
  echo "El respaldo no tiene los datos de las empresas de SaltorSystem."; exit 1
fi

# Tablas que existen en esta instalación.
$PSQL -tA -c "select n.nspname || ' ' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where c.relkind in ('r', 'p') and n.nspname in ('myappdb', 'private', 'auth')" > "$WORK/existen.txt"

# Solo los datos de las tablas de SaltorSystem y de los usuarios de acceso.
awk -v ex="$WORK/existen.txt" -v om="$WORK/omitidas.txt" '
  BEGIN { while ((getline l < ex) > 0) ok[l] = 1 }
  / TABLE DATA / {
    for (i = 1; i <= NF; i++) if ($i == "DATA") { s = $(i + 1); t = $(i + 2) }
    if (s == "auth" && t != "users" && t != "identities") next
    if (s == "private" && t == "instalacion_local") next
    if (!((s " " t) in ok)) { print s "." t > om; next }
    print
  }' "$WORK/todo.lst" > "$WORK/restaurar.lst"

TABLAS=$(wc -l < "$WORK/restaurar.lst" | tr -d ' ')
echo "Tablas con datos en el respaldo: $TABLAS"
if [ -s "$WORK/omitidas.txt" ]; then
  echo "Estas tablas del respaldo ya no existen en esta versión y se omiten:"
  sed 's/^/  - /' "$WORK/omitidas.txt"
fi

cat > "$WORK/antes.sql" <<'SQL'
\\o /dev/null
set client_min_messages = warning;
begin;
set session_replication_role = replica;
set statement_timeout = 0;

-- Catálogos generales de esta versión (planes, tipos, etc.): se guardan para
-- devolver después las filas nuevas que el respaldo viejo no tenga.
create temp table _hold_reg (tabla regclass, hold text, cols text) on commit drop;
do $$
declare r record; v_cols text; i integer := 0;
begin
  for r in
    select c.oid::regclass as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('myappdb', 'private')
       and not (n.nspname = 'private' and c.relname in ('instalacion_local', 'duenos_sistema'))
       and not (n.nspname = 'myappdb' and c.relname in ('empresas', 'sucursales', 'usuarios', 'plataforma_suscripciones', 'usuario_permisos'))
       and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                         and a.attname in ('empresa_id', 'idempresa', 'id_empres', 'empresa', 'auth_usuario_id'))
       and exists (select 1 from pg_index x where x.indrelid = c.oid and (x.indisprimary or x.indisunique))
  loop
    select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
      from pg_attribute where attrelid = r.t and attnum > 0 and not attisdropped and attgenerated = '';
    i := i + 1;
    execute format('create temp table %I on commit drop as select * from %s', '_hold_' || i, r.t);
    insert into _hold_reg values (r.t, '_hold_' || i, v_cols);
  end loop;
end $$;

-- Vaciar los datos actuales (los de la instalación nueva).
do $$
declare v text;
begin
  select string_agg(c.oid::regclass::text, ', ') into v
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p')
     and ((n.nspname in ('myappdb', 'private') and not (n.nspname = 'private' and c.relname = 'instalacion_local'))
          or (n.nspname = 'auth' and c.relname in ('users', 'identities')));
  execute 'truncate table ' || v || ' restart identity cascade';
end $$;
SQL

cat > "$WORK/despues.sql" <<'SQL'
-- Devolver las filas de catálogo de esta versión que el respaldo no tenía.
do $$
declare r record;
begin
  for r in select * from _hold_reg loop
    execute format('insert into %s (%s) overriding system value select %s from %I on conflict do nothing', r.tabla, r.cols, r.cols, r.hold);
  end loop;
end $$;

-- Contadores (id automáticos) al siguiente número libre.
do $$
declare r record;
begin
  for r in
    select a.attrelid::regclass as t, a.attname,
           coalesce(pg_get_serial_sequence(a.attrelid::regclass::text, a.attname),
                    substring(pg_get_expr(d.adbin, d.adrelid) from 'nextval\\(''([^'']+)''')) as s
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname in ('myappdb', 'private') and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
       and a.atttypid in ('int2'::regtype, 'int4'::regtype, 'int8'::regtype, 'numeric'::regtype)
  loop
    continue when r.s is null;
    execute format('select setval(%L, coalesce((select max(%I) from %s), 0) + 1, false)', r.s, r.attname, r.t);
  end loop;
end $$;

\\o
\\pset tuples_only on
\\echo 'Datos restaurados:'
select format('  Empresas: %s  Usuarios: %s  Clientes: %s  Productos: %s',
              (select count(*) from myappdb.empresas), (select count(*) from myappdb.usuarios),
              (select count(*) from myappdb.clients), (select count(*) from myappdb.products));
commit;
notify pgrst, 'reload schema';
SQL

echo "Restaurando los datos (no cierres esta ventana)..."
{
  cat "$WORK/antes.sql"
  pg_restore --data-only --no-owner --no-acl -L "$WORK/restaurar.lst" -f - "$ARCHIVO"
  cat "$WORK/despues.sql"
} | $PSQL

echo "Restauración terminada."
`;

const RESTORE_BAT = crlf(`@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title SaltorSystem - Restaurar respaldo

echo.
echo  ==============================================
echo   SaltorSystem - Restaurar datos de un respaldo
echo  ==============================================
echo.
echo  Reemplaza TODOS los datos de esta instalacion por los del respaldo.
echo  La version del sistema (estructura) se queda la de esta instalacion.
echo  Copia antes el respaldo (.dump) a la carpeta "respaldos" de esta instalacion.
echo.

docker version >nul 2>&1
if errorlevel 1 (
  echo  Docker Desktop no esta abierto. Abrelo y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)
if not exist "respaldos\\*.dump" (
  echo  No hay respaldos .dump en la carpeta "respaldos".
  pause
  exit /b 1
)

set N=0
for /f "delims=" %%f in ('dir /b /o-d "respaldos\\*.dump"') do (
  set /a N+=1
  set "F!N!=%%f"
  echo   !N!^) %%f
)
echo.
set "OPC=1"
set /p "OPC=  Numero del respaldo a restaurar [1]: "
set "ARCHIVO=!F%OPC%!"
if "!ARCHIVO!"=="" (
  echo  Opcion no valida.
  pause
  exit /b 1
)

echo.
echo  Se va a restaurar: !ARCHIVO!
echo  Los datos actuales de esta instalacion se reemplazan (antes se guarda una copia).
set "OK="
set /p "OK=  Escribe SI para continuar: "
if /i not "!OK!"=="SI" (
  echo  Cancelado. No se cambio nada.
  pause
  exit /b 0
)

echo.
echo  Iniciando la base de datos...
docker compose up -d db
if errorlevel 1 ( pause & exit /b 1 )
set INTENTOS=0
:espera
docker compose exec -T db pg_isready -U postgres -h localhost -q >nul 2>&1
if not errorlevel 1 goto lista
set /a INTENTOS+=1
if !INTENTOS! geq 60 (
  echo  La base de datos no responde.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto espera
:lista

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set FECHA=%%i
echo  Guardando copia de los datos actuales: respaldos\\antes-de-restaurar-!FECHA!.dump
docker compose exec -T db pg_dump -U supabase_admin -d postgres -Fc -n myappdb -n private -n auth -f /respaldos/antes-de-restaurar-!FECHA!.dump
if errorlevel 1 (
  echo  No se pudo guardar la copia de seguridad. No se cambio nada.
  pause
  exit /b 1
)

echo  Deteniendo el sistema mientras se restaura...
docker compose stop web rest functions auth >nul 2>&1

docker compose exec -T db bash -s -- "/respaldos/!ARCHIVO!" < db\\restaurar.sh
set CODE=!errorlevel!

echo.
echo  Iniciando SaltorSystem...
docker compose up -d >nul 2>&1
docker compose restart rest auth >nul 2>&1

echo.
if not "!CODE!"=="0" (
  echo  ==============================================
  echo   La restauracion fallo y NO se cambio nada.
  echo   Envia a soporte el texto de arriba.
  echo  ==============================================
) else (
  echo  ==============================================
  echo   Restauracion lista. Los usuarios entran con
  echo   las contrasenas que tenian en el respaldo.
  echo  ==============================================
)
pause
`);

const RESTORE_UNIX_SH = `#!/bin/sh
# SaltorSystem - restaurar los datos de un respaldo (Linux / macOS)
# Uso: ./restaurar.sh saltor-AAAAMMDD-HHMM.dump   (el archivo debe estar en la carpeta respaldos)
set -e
cd "$(dirname "$0")"
ARCHIVO="$1"
if [ -z "$ARCHIVO" ]; then echo "Respaldos disponibles:"; ls -1t respaldos/*.dump 2>/dev/null | sed 's#respaldos/#  #'; echo "Uso: ./restaurar.sh NOMBRE.dump"; exit 1; fi
ARCHIVO=$(basename "$ARCHIVO")
[ -f "respaldos/$ARCHIVO" ] || { echo "No existe respaldos/$ARCHIVO"; exit 1; }
printf "Se reemplazan TODOS los datos por los de %s. Escribe SI para continuar: " "$ARCHIVO"
read OK
[ "$OK" = "SI" ] || [ "$OK" = "si" ] || { echo "Cancelado."; exit 0; }
docker compose up -d db
until docker compose exec -T db pg_isready -U postgres -h localhost -q >/dev/null 2>&1; do sleep 2; done
FECHA=$(date +%Y%m%d-%H%M)
docker compose exec -T db pg_dump -U supabase_admin -d postgres -Fc -n myappdb -n private -n auth -f "/respaldos/antes-de-restaurar-$FECHA.dump"
echo "Copia de los datos actuales: respaldos/antes-de-restaurar-$FECHA.dump"
docker compose stop web rest functions auth >/dev/null 2>&1 || true
CODE=0
docker compose exec -T db bash -s -- "/respaldos/$ARCHIVO" < db/restaurar.sh || CODE=$?
docker compose up -d >/dev/null 2>&1
docker compose restart rest auth >/dev/null 2>&1 || true
if [ "$CODE" != "0" ]; then echo "La restauración falló y NO se cambió nada."; exit 1; fi
echo "Restauración lista."
`;

function installSh(o: LocalInstallerOptions): string {
  return `#!/bin/sh
# SaltorSystem - instalación local (Linux / macOS)
set -e
cd "$(dirname "$0")"
mkdir -p respaldos
docker compose up -d
echo "Preparando la base de datos..."
docker compose logs -f instalador
code=$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -a -q instalador)")
if [ "$code" != "0" ]; then echo "La preparación de la base de datos falló."; exit 1; fi
echo "SaltorSystem está listo en http://localhost:${o.puertoWeb}"
`;
}

function readme(o: LocalInstallerOptions, version: string): string {
  return crlf(`SALTORSYSTEM - INSTALACIÓN LOCAL
Cliente: ${o.cliente}
Versión del sistema: ${version}
Generado: ${new Date().toLocaleString('es-DO')}

QUÉ NECESITA LA PC SERVIDOR
- Windows 10/11 de 64 bits con 8 GB de RAM (mínimo 4 GB) y 10 GB libres.
- Docker Desktop instalado y abierto: https://www.docker.com/products/docker-desktop/
- Internet SOLO durante la primera instalación (descarga ~1.5 GB). Después funciona sin internet.

INSTALAR
1. Descomprime esta carpeta en la PC servidor (por ejemplo C:\\SaltorSystem).
2. Abre Docker Desktop y espera a que diga "Engine running".
3. Ejecuta instalar.bat (clic derecho > Ejecutar como administrador, para abrir el
   puerto en el firewall y que las demás PCs puedan entrar).
4. Se abre http://localhost:${o.puertoWeb}. Entra con:
     Usuario: ${o.rootUsuario.trim()}
     Contraseña: la que pusiste al generar el paquete (está en el archivo .env).

PCS DE LA RED (CAJAS, OFICINA)
- Abren el navegador en http://IP-DEL-SERVIDOR:${o.puertoWeb}
  (la IP aparece al final de instalar.bat; conviene fijarla en el router).
- No necesitan instalar nada.

PRIMEROS PASOS DENTRO DEL SISTEMA
- La empresa ${o.cliente.trim().toUpperCase()} ya está creada con su sucursal PRINCIPAL.
- Licencia: ${o.licencia} hasta ${o.licenciaHasta}. Se extiende en Plataforma > Empresas y suscripciones.
${o.empresaDatosId
  ? `${o.empresasExtraIds?.length ? `- Se trajeron ${o.empresasExtraIds.length + 1} empresas de la nube, todas con la misma licencia.
  El usuario dueño (ROOT) entra en ${o.cliente.trim().toUpperCase()} y cambia de empresa desde Plataforma.
` : ''}- Se trajeron de la nube los usuarios (con sus mismas contraseñas), clientes con su saldo
  pendiente, suplidores, productos con su existencia, secuencias de NCF y configuración e-CF.
  No se trajo historial (facturas, cobros, cierres).
- IMPORTANTE: desde ahora ${o.empresasExtraIds?.length ? 'estas empresas deben' : 'esta empresa debe'} facturar SOLO en este servidor. Si sigue
  facturando también en la nube, se repetirían los números de e-NCF.
- Vuelve a cargar la firma digital (.p12) en Configuración > Firma Digital DGII.`
  : `- Crea los usuarios del cliente en Configuración > Usuarios.
- Completa los datos de la empresa, logo, NCF y firma digital.`}

USO DIARIO
- iniciar.bat   inicia el sistema (si la PC se reinició y no arrancó solo).
- detener.bat   lo detiene sin borrar datos.
- respaldo.bat  crea un respaldo en la carpeta "respaldos". Hazlo a diario y
                copia el archivo fuera de la PC.
- restaurar.bat pone en esta instalación los datos de un respaldo (.dump).

ACTUALIZAR A UNA VERSIÓN NUEVA (reinstalando)
1. En la instalación actual ejecuta respaldo.bat y copia el .dump fuera de la PC.
2. Ejecuta detener.bat.
3. Genera un paquete nuevo en Plataforma > Instalador local, SIN marcar
   "Llevar los datos de empresas", y descomprímelo en otra carpeta.
4. Si es en la misma PC, el puerto web debe estar libre: no vuelvas a iniciar la
   instalación vieja. Ejecuta instalar.bat del paquete nuevo.
5. Copia el .dump a la carpeta "respaldos" del paquete nuevo y ejecuta restaurar.bat.
   - Solo se restauran los DATOS: la estructura queda la de la versión nueva.
   - Antes de restaurar se guarda una copia (antes-de-restaurar-...dump).
   - Si algo falla no se cambia nada y se muestra el error.
   - Los usuarios (incluido el ROOT) entran con las contraseñas del respaldo.
6. Cuando compruebes que todo está bien, borra la carpeta vieja y sus volúmenes
   (docker compose down -v dentro de la carpeta vieja).
- En Docker Desktop > Settings > General activa "Start Docker Desktop when you
  sign in" para que SaltorSystem arranque solo al encender la PC.

QUÉ NECESITA INTERNET DESPUÉS
- Enviar comprobantes electrónicos (e-CF) a la DGII y consultar RNC en línea.
  Todo lo demás (facturar, caja, inventario, reportes) funciona sin internet.

SEGURIDAD
- El archivo .env tiene las contraseñas y llaves de esta instalación. No lo compartas.
- No borres los volúmenes de Docker: ahí está la base de datos.
`);
}

// ---------------------------------------------------------------------------
// ZIP (sin compresión: los archivos del sistema web ya vienen minificados)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(files: { ruta: string; datos: Uint8Array }[]): Blob {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = utf8(file.ruta);
    const crc = crc32(file.datos);
    const size = file.datos.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true);      // sin compresión
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, file.datos);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 0x031e, true); // creado en Unix: conserva permisos
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, dosTime, true);
    entry.setUint16(14, dosDate, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, size, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(38, (file.ruta.endsWith('.sh') ? 0o100755 : 0o100644) << 16, true);
    entry.setUint32(42, offset, true);
    const header = new Uint8Array(46 + name.length);
    header.set(new Uint8Array(entry.buffer), 0);
    header.set(name, 46);
    central.push(header);

    offset += 30 + name.length + size;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  parts.push(...central, end.buffer);
  return new Blob(parts, { type: 'application/zip' });
}

// ---------------------------------------------------------------------------
// Paquete completo
// ---------------------------------------------------------------------------

/**
 * En la nube el sistema vive en una subcarpeta (--base-href /erpsaltorsystem/);
 * en el servidor local se sirve desde la raíz. También asegura que cargue config.js.
 */
function localIndex(file: { ruta: string; datos: Uint8Array }): Uint8Array {
  if (file.ruta !== 'index.html') return file.datos;
  let html = new TextDecoder().decode(file.datos).replace(/<base href="[^"]*"\s*\/?>/i, '<base href="/">');
  if (!/src="config\.js"/.test(html)) html = html.replace(/<\/head>/i, '  <script src="config.js"></script>\n</head>');
  return utf8(html);
}

export async function buildInstallerPackage(o: LocalInstallerOptions, src: InstallerSources): Promise<InstallerPackage> {
  const slug = slugify(o.cliente);
  const carpeta = `SaltorSystem-${slug}`;
  const jwtSecret = randomSecret(48);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 10 * 365 * 24 * 3600;
  const anonKey = await signJwt({ role: 'anon', iss: 'supabase', iat, exp }, jwtSecret);
  const serviceKey = await signJwt({ role: 'service_role', iss: 'supabase', iat, exp }, jwtSecret);
  const ecfKey = randomSecret(48);

  const text: [string, string][] = [
    ['LEEME.txt', readme(o, src.version)],
    // Nombre único por paquete: una reinstalación en otra carpeta usa volúmenes nuevos
    // y no se monta sobre la base de la instalación anterior.
    ['docker-compose.yml', dockerCompose(o, `saltor-${slug}-${Date.now().toString(36)}`)],
    ['.env', envFile(o, { jwtSecret, anonKey, serviceKey, ecfKey }, src.version)],
    ['instalar.bat', installBat(o)],
    ['instalar.sh', installSh(o)],
    ['iniciar.bat', START_BAT(o.puertoWeb)],
    ['detener.bat', STOP_BAT],
    ['respaldo.bat', BACKUP_BAT],
    ['restaurar.bat', RESTORE_BAT],
    ['restaurar.sh', RESTORE_UNIX_SH],
    ['respaldos/.gitkeep', ''],
    ['nginx/default.conf', NGINX_CONF],
    ['db/roles.sql', ROLES_SQL],
    ['db/jwt.sql', JWT_SQL],
    ['db/auth-owner.sql', AUTH_OWNER_SQL],
    ['db/instalar.sh', INSTALL_SH],
    ['db/restaurar.sh', RESTORE_SH],
    ['db/esquema.sql', src.esquemaSql],
    ['db/semilla.sql', semillaSql(o)],
    ['db/datos.sql', src.datosSql ?? ''],
    ['web/config.js', configJs(o, anonKey, src.version)],
    ...src.funciones.map((f): [string, string] => [`functions/${f.ruta}`, f.contenido])
  ];

  const files = [
    ...text.map(([ruta, contenido]) => ({ ruta: `${carpeta}/${ruta}`, datos: utf8(contenido) })),
    ...src.web.filter((f) => f.ruta !== 'config.js').map((f) => ({ ruta: `${carpeta}/web/${f.ruta}`, datos: localIndex(f) }))
  ];

  const zip = buildZip(files);
  return {
    nombreArchivo: `${carpeta}.zip`,
    zip,
    resumen: { carpeta, archivos: files.length, bytes: zip.size }
  };
}
