import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Crea la cuenta de acceso y el perfil del usuario en un solo paso, con la
// llave de servicio.  Antes el navegador hacía signUp y luego insertaba el
// perfil: si el perfil fallaba (ID repetido, sucursal inválida) quedaba una
// cuenta huérfana y el correo ya no se podía volver a usar, y además obligaba a
// dejar abierto el registro público de Supabase.

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const result = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function profileErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === '23505') {
    return /correo/i.test(error.message ?? '') ? 'Ya existe un usuario con ese correo.' : 'Ya existe un usuario con ese ID.';
  }
  return error.message || 'No se pudo crear el perfil del usuario.';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return result({ error: 'Método no permitido.' }, 405);
  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
    const { data: session } = await userClient.auth.getUser();
    if (!session.user) return result({ error: 'Sesión no válida.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'myappdb' }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: caller } = await admin.from('usuarios').select('empresa_id, rol').eq('auth_usuario_id', session.user.id).eq('estado', 'Activo').maybeSingle();
    if (!caller) return result({ error: 'El usuario no tiene una empresa activa.' }, 403);
    if (caller.rol !== 'Administrador') return result({ error: 'Solo un administrador puede crear usuarios.' }, 403);

    const body = await request.json().catch(() => ({}));
    const firstName = text(body.firstName);
    const lastName = text(body.lastName);
    const username = text(body.username).toUpperCase();
    const email = text(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const branch = text(body.branch);
    const role = text(body.role);
    const status = body.status === 'Inactivo' ? 'Inactivo' : 'Activo';
    const companyId = Number(body.companyId);

    if (!firstName || !lastName || !username || !email || !branch || !role) return result({ error: 'Faltan datos del usuario.' }, 400);
    if (!/^[A-Z0-9._-]+$/.test(username)) return result({ error: 'El ID de usuario solo puede contener letras, numeros, punto, guion y guion bajo.' }, 400);
    if (password.length < 6) return result({ error: 'La clave debe tener al menos 6 caracteres.' }, 400);
    if (companyId !== caller.empresa_id) {
      // Solo el dueño del sistema puede crear usuarios en otra empresa (p. ej. el primer administrador).
      const { data: isOwner } = await admin.rpc('es_dueno_usuario', { p_auth_usuario_id: session.user.id });
      if (isOwner !== true) return result({ error: 'Solo puede crear usuarios en su propia empresa.' }, 403);
      const { data: targetCompany } = await admin.from('empresas').select('id').eq('id', companyId).maybeSingle();
      if (!targetCompany) return result({ error: 'La empresa indicada no existe.' }, 400);
    }

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre_usuario: username, empresa_id: companyId, rol: role }
    });
    if (authError || !created.user) {
      const exists = authError && /already|registered|exists/i.test(authError.message);
      return result({ error: exists ? 'Ya existe una cuenta de acceso con ese correo.' : authError?.message ?? 'No se pudo crear la cuenta de acceso.' }, exists ? 409 : 400);
    }

    const { data: profile, error: profileError } = await admin.from('usuarios').insert({
      nombre: firstName,
      apellido: lastName,
      nombre_completo: `${firstName} ${lastName}`,
      nombre_usuario: username,
      correo: email,
      telefono: text(body.phone) || null,
      empresa_id: companyId,
      sucursal: branch,
      rol: role,
      estado: status,
      avatar: `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase(),
      ultima_actualizacion: text(body.lastUpdate) || new Date().toISOString(),
      auth_usuario_id: created.user.id
    }).select('*').single();

    if (profileError) {
      // Sin perfil la cuenta no sirve y bloquearía el correo: se elimina.
      await admin.auth.admin.deleteUser(created.user.id);
      return result({ error: profileErrorMessage(profileError) }, profileError.code === '23505' ? 409 : 400);
    }

    return result(profile);
  } catch (error) { console.error('crear-usuario', error); return result({ error: error instanceof Error ? error.message : 'No se pudo crear el usuario.' }, 500); }
});
