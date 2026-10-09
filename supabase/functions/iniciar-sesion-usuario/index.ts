import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const invalidCredentials = () => new Response(
  JSON.stringify({ error: 'ID de usuario o clave incorrectos.' }),
  { status: 401, headers: corsHeaders }
);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido.' }), { status: 405, headers: corsHeaders });
  }

  const body = await request.json().catch(() => ({}));
  const idUsuario = typeof body.idUsuario === 'string' ? body.idUsuario.trim() : '';
  const clave = typeof body.clave === 'string' ? body.clave : '';
  if (!idUsuario || !clave) return invalidCredentials();

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    console.error('Falta la configuración interna de Supabase para el inicio de sesión.');
    return new Response(JSON.stringify({ error: 'El inicio de sesión no está configurado.' }), { status: 503, headers: corsHeaders });
  }

  const admin = createClient(url, serviceRoleKey, {
    db: { schema: 'myappdb' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const { data: profile, error: profileError } = await admin
    .from('usuarios')
    .select('correo, auth_usuario_id')
    .ilike('nombre_usuario', idUsuario.replace(/[\\%_]/g, '\\$&'))
    .eq('estado', 'Activo')
    .maybeSingle();

  if (profileError || !profile?.correo || !profile.auth_usuario_id) {
    return invalidCredentials();
  }

  const authClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: login, error: loginError } = await authClient.auth.signInWithPassword({
    email: profile.correo,
    password: clave
  });

  if (loginError || !login.session || !login.user || login.user.id !== profile.auth_usuario_id) {
    return invalidCredentials();
  }

  return new Response(JSON.stringify({ session: login.session }), { status: 200, headers: corsHeaders });
});
