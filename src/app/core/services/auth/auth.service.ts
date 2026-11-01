import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface ActiveUserSession {
  id: number;
  authUserId: string;
  username: string;
  fullName: string;
  email: string;
  companyId: number;
  companyName: string;
  branch: string;
  branchId: number;
  role: string;
}

interface UserProfileRow {
  codusuario: number;
  auth_usuario_id: string;
  nombre_usuario: string;
  nombre_completo: string;
  correo: string;
  empresa_id: number;
  sucursal: string | null;
  sucursal_id: number | null;
  rol: string;
  estado: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly activeUserKey = 'saltor.activeUser';
  private restoring: Promise<ActiveUserSession | null> | null = null;

  /** Usuario con sesión activa; null antes de iniciar sesión o después de salir. */
  currentUser: ActiveUserSession | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  get isAdmin(): boolean {
    return this.currentUser?.role === 'Administrador';
  }

  /**
   * Restaura la sesión guardada una sola vez; la pantalla principal y las
   * guardas de ruta esperan la misma promesa.
   */
  restoreSession(): Promise<ActiveUserSession | null> {
    this.restoring ??= this.loadStoredSession();
    return this.restoring;
  }

  private async loadStoredSession(): Promise<ActiveUserSession | null> {
    // Si la sesión guardada en este navegador quedó trabada (token viejo, renovación
    // colgada), getSession() puede no responder nunca y la pantalla se queda en blanco.
    // Con un tiempo límite se descarta esa sesión y se muestra el inicio de sesión.
    let result: { data: { session: { user: { id: string } } | null }; error: unknown };
    try {
      result = await this.withTimeout(this.supabase.client.auth.getSession(), 12000);
    } catch {
      this.discardBrowserSession();
      return null;
    }
    const { data, error } = result;
    if (error || !data.session?.user) {
      this.clearStoredUser();
      return null;
    }

    try {
      return await this.withTimeout(this.loadActiveUser(data.session.user.id), 15000);
    } catch {
      this.discardBrowserSession();
      return null;
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then((value) => { clearTimeout(timer); resolve(value); }, (err) => { clearTimeout(timer); reject(err); });
    });
  }

  /** Borra la sesión de Supabase guardada en este navegador sin esperar al servidor. */
  private discardBrowserSession(): void {
    this.currentUser = null;
    try {
      Object.keys(localStorage).filter((key) => key.startsWith('sb-') && key.includes('auth-token')).forEach((key) => localStorage.removeItem(key));
    } catch { /* sin almacenamiento */ }
    this.clearStoredUser();
    void this.supabase.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  async signIn(username: string, password: string): Promise<ActiveUserSession> {
    const { data, error } = await this.supabase.client.functions.invoke('iniciar-sesion-usuario', {
      body: { idUsuario: username.trim(), clave: password }
    });
    if (error) {
      // La función devuelve el motivo en el cuerpo (p. ej. "ID de usuario o clave incorrectos.").
      const context = (error as { context?: { json?: () => Promise<{ error?: string }>; status?: number } }).context;
      const detail = await context?.json?.().catch(() => null);
      throw new Error(detail?.error || 'No se pudo iniciar sesión. Verifica tu conexión e intenta de nuevo.');
    }

    const session = data?.session;
    if (!session?.access_token || !session?.refresh_token) {
      throw new Error('ID de usuario o clave incorrectos.');
    }

    const { data: sessionData, error: sessionError } = await this.supabase.client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
    if (sessionError || !sessionData.user) {
      throw sessionError ?? new Error('No se pudo establecer la sesión del usuario.');
    }

    return this.loadActiveUser(sessionData.user.id);
  }

  async signOut(): Promise<void> {
    this.currentUser = null;
    this.restoring = Promise.resolve(null);
    await this.supabase.client.auth.signOut();
    this.clearStoredUser();
  }

  /** Cambia el contexto del dueño de Plataforma a una empresa y sucursal elegidas. */
  async switchCompanyContext(companyId: number, branchId: number): Promise<ActiveUserSession> {
    const authUserId = this.currentUser?.authUserId;
    if (!authUserId) throw new Error('No hay una sesión activa para cambiar de empresa.');

    const { error } = await this.supabase.client.rpc('cambiar_contexto_empresa', {
      p_empresa_id: companyId,
      p_sucursal_id: branchId
    });
    if (error) throw error;

    return this.loadActiveUser(authUserId);
  }

  private async loadActiveUser(authUserId: string): Promise<ActiveUserSession> {
    const { data, error } = await this.supabase.client
      .from('usuarios')
      .select('codusuario, auth_usuario_id, nombre_usuario, nombre_completo, correo, empresa_id, sucursal, sucursal_id, rol, estado')
      .eq('auth_usuario_id', authUserId)
      .eq('estado', 'Activo')
      .maybeSingle();

    if (error || !data) {
      throw error ?? new Error('La cuenta no tiene un perfil activo en el sistema.');
    }

    const profile = data as UserProfileRow;
    const { data: company } = await this.supabase.client
      .from('empresas')
      .select('nombre_comercial')
      .eq('id', profile.empresa_id)
      .maybeSingle();

    const activeUser: ActiveUserSession = {
      id: profile.codusuario,
      authUserId: profile.auth_usuario_id,
      username: profile.nombre_usuario,
      fullName: profile.nombre_completo,
      email: profile.correo,
      companyId: profile.empresa_id,
      companyName: company?.nombre_comercial ?? 'Empresa',
      branch: profile.sucursal ?? '',
      branchId: Number(profile.sucursal_id ?? 0),
      role: profile.rol
    };

    this.currentUser = activeUser;
    this.restoring = Promise.resolve(activeUser);
    localStorage.setItem(this.activeUserKey, JSON.stringify(activeUser));
    await this.supabase.client
      .from('usuarios')
      .update({ ultimo_acceso_en: new Date().toISOString() })
      .eq('codusuario', profile.codusuario);

    return activeUser;
  }

  private clearStoredUser(): void {
    localStorage.removeItem(this.activeUserKey);
  }
}
