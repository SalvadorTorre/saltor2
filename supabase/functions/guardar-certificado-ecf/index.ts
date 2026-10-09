import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const result = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string { let binary = ''; bytes.forEach((value) => binary += String.fromCharCode(value)); return btoa(binary); }

async function encryptPassword(password: string): Promise<string> {
  const secret = Deno.env.get('ECF_ENCRYPTION_KEY') ?? Deno.env.get('JWT_SECRET');
  if (!secret) throw new Error('No está configurada la clave de protección para el certificado digital.');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(password));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return result({ error: 'Método no permitido.' }, 405);
  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
    const { data: session } = await userClient.auth.getUser();
    if (!session.user) return result({ error: 'Sesión no válida.' }, 401);
    const body = await request.json();
    if (!body.password || !body.fileBase64 || !body.metadata?.fileName) return result({ error: 'Faltan datos del certificado.' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'myappdb' } });
    const { data: user } = await admin.from('usuarios').select('empresa_id, rol').eq('auth_usuario_id', session.user.id).eq('estado', 'Activo').single();
    if (!user) return result({ error: 'El usuario no tiene una empresa activa.' }, 403);
    if (user.rol !== 'Administrador') return result({ error: 'Solo un administrador puede cargar el certificado digital.' }, 403);
    const metadata = body.metadata;
    const { data, error } = await admin.rpc('guardar_certificado_firma_digital_servidor', {
      p_empresa_id: user.empresa_id, p_nombre_archivo: metadata.fileName, p_tipo_archivo: body.fileType || 'application/x-pkcs12',
      p_archivo_base64: body.fileBase64, p_clave_cifrada: await encryptPassword(String(body.password)),
      p_titular: metadata.holder, p_emisor: metadata.issuer, p_numero_serie: metadata.serialNumber,
      p_valido_desde: metadata.validFrom, p_valido_hasta: metadata.validUntil
    });
    if (error) throw error;
    return result(Array.isArray(data) ? data[0] : data);
  } catch (error) { console.error('guardar-certificado-ecf', error); return result({ error: error instanceof Error ? error.message : 'No se pudo guardar el certificado.' }, 500); }
});
