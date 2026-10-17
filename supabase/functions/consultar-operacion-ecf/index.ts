import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { queryOperation } from '../_shared/ecf-operation.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
    const { data: session, error } = await auth.auth.getUser();
    if (error || !session.user) return json({ error: 'Sesión no válida.' }, 401);
    const { kind, documentId } = await request.json();
    if (!['FACTURA', 'NOTA_CREDITO', 'GASTO_MENOR'].includes(kind) || !Number.isSafeInteger(documentId) || documentId <= 0) return json({ error: 'Documento inválido.' }, 400);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'myappdb' } });
    const { data: user } = await db.from('usuarios').select('empresa_id,sucursal_id').eq('auth_usuario_id', session.user.id).eq('estado', 'Activo').single();
    if (!user) return json({ error: 'Usuario sin empresa activa.' }, 403);
    const { data: op, error: lookupError } = await db.from('ecf_operaciones').select('*').eq('tipo', kind).eq('documento_id', documentId).eq('activa', true).eq('empresa_id', user.empresa_id).eq('sucursal_id', user.sucursal_id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!op) return json({ error: 'No se encontró la operación en la empresa y sucursal actuales.' }, 404);
    return json(await queryOperation(db, op));
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'No se pudo consultar la operación.' }, 502); }
});
