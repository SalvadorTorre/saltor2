import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Un administrador pone una clave nueva a un usuario de su empresa.
// El dueño del sistema puede hacerlo con cualquier usuario. La clave nunca se
// guarda en la base del sistema: se cambia directamente en Supabase Auth.

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const result = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return result({ error: 'Método no permitido.' }, 405);
  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
    const { data: session } = await userClient.auth.getUser();
    if (!session.user) return result({ error: 'Sesión no válida.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'myappdb' }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: caller } = await admin.from('usuarios').select('empresa_id, rol, nombre_completo').eq('auth_usuario_id', session.user.id).eq('estado', 'Activo').maybeSingle();
    if (!caller) return result({ error: 'El usuario no tiene una empresa activa.' }, 403);
    if (caller.rol !== 'Administrador') return result({ error: 'Solo un administrador puede cambiar claves.' }, 403);

    const body = await request.json().catch(() => ({}));
    const userId = Number(body.userId);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!Number.isInteger(userId) || userId <= 0) return result({ error: 'Usuario no válido.' }, 400);
    if (password.length < 6) return result({ error: 'La clave debe tener al menos 6 caracteres.' }, 400);
    if (password.length > 72) return result({ error: 'La clave es demasiado larga (máximo 72 caracteres).' }, 400);

    const { data: target } = await admin.from('usuarios').select('codusuario, empresa_id, auth_usuario_id, nombre_completo, nombre_usuario').eq('codusuario', userId).maybeSingle();
    if (!target?.auth_usuario_id) return result({ error: 'El usuario no tiene una cuenta de acceso.' }, 404);

    const { data: callerIsOwner } = await admin.rpc('es_dueno_usuario', { p_auth_usuario_id: session.user.id });
    const { data: targetIsOwner } = await admin.rpc('es_dueno_usuario', { p_auth_usuario_id: target.auth_usuario_id });
    if (callerIsOwner !== true) {
      if (target.empresa_id !== caller.empresa_id) return result({ error: 'Solo puede cambiar claves de usuarios de su empresa.' }, 403);
      if (targetIsOwner === true && target.auth_usuario_id !== session.user.id) return result({ error: 'La clave de un dueño del sistema solo la puede cambiar otro dueño.' }, 403);
    }

    const { error: authError } = await admin.auth.admin.updateUserById(target.auth_usuario_id, { password, email_confirm: true });
    // email_confirm: la cuenta queda confirmada (un administrador responde por ella); sin esto no puede entrar.
    if (authError) return result({ error: authError.message || 'No se pudo cambiar la clave.' }, 400);

    // Queda en la bitácora (sin la clave).
    await admin.from('bitacora').insert({
      empresa_id: target.empresa_id, auth_uid: session.user.id, usuario_nombre: caller.nombre_completo,
      tabla: 'usuarios', registro_id: String(target.codusuario), accion: 'Cambiar clave',
      resumen: target.nombre_completo || target.nombre_usuario, cambios: {}
    });

    return result({ ok: true });
  } catch (error) { console.error('cambiar-clave-usuario', error); return result({ error: error instanceof Error ? error.message : 'No se pudo cambiar la clave.' }, 500); }
});
