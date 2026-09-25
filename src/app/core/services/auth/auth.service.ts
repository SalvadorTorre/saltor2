import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
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
  role: string;
}

export interface LoginCompany {
  id: number;
  name: string;
}

export interface InitialAdminForm {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  companyId: number | null;
  branch: string;
}

interface UserProfileRow {
  codusuario: number;
  auth_usuario_id: string;
  nombre_usuario: string;
  nombre_completo: string;
  correo: string;
  empresa_id: number;
  sucursal: string | null;
  rol: string;
  estado: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly activeUserKey = 'saltor.activeUser';
  private readonly registrationClient = createClient(environment.supabase.url, environment.supabase.anonKey, {
    db: { schema: environment.supabase.schema },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  constructor(private readonly supabase: SupabaseService) {}

  async restoreSession(): Promise<ActiveUserSession | null> {
    const { data, error } = await this.supabase.client.auth.getSession();
    if (error || !data.session?.user) {
      this.clearStoredUser();
      return null;
    }

    try {
      return await this.loadActiveUser(data.session.user.id);
    } catch {
      await this.signOut();
      return null;
    }
  }

  async signIn(email: string, password: string): Promise<ActiveUserSession> {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error || !data.user) {
      throw error ?? new Error('No se pudo iniciar sesión.');
    }

    return this.loadActiveUser(data.user.id);
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this.clearStoredUser();
  }

  async hasRegisteredUsers(): Promise<boolean> {
    const { count, error } = await this.supabase.client
      .from('usuarios')
      .select('codusuario', { count: 'exact', head: true });

    if (error) {
      throw error;
    }

    return (count ?? 0) > 0;
  }

  async getCompanies(): Promise<LoginCompany[]> {
    const { data, error } = await this.supabase.client
      .from('empresas')
      .select('id, nombre_comercial')
      .eq('estado', 'Activa')
      .order('nombre_comercial');

    if (error) {
      throw error;
    }

    return (data ?? []).map((company: { id: number; nombre_comercial: string }) => ({
      id: company.id,
      name: company.nombre_comercial
    }));
  }

  async registerInitialAdmin(form: InitialAdminForm): Promise<ActiveUserSession> {
    if (await this.hasRegisteredUsers()) {
      throw new Error('Ya existe un usuario. Inicie sesión con su correo y clave.');
    }
    if (!form.companyId) {
      throw new Error('Seleccione la empresa del administrador.');
    }

    const { data, error } = await this.registrationClient.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          nombre_usuario: form.username.trim(),
          empresa_id: form.companyId,
          rol: 'Administrador'
        }
      }
    });

    if (error || !data.user) {
      throw error ?? new Error('No se pudo crear la cuenta inicial.');
    }

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const { error: profileError } = await this.supabase.client.from('usuarios').insert({
      nombre: firstName,
      apellido: lastName,
      nombre_completo: `${firstName} ${lastName}`.trim(),
      nombre_usuario: form.username.trim(),
      correo: form.email.trim(),
      telefono: null,
      empresa_id: form.companyId,
      sucursal: form.branch.trim() || 'Principal',
      rol: 'Administrador',
      estado: 'Activo',
      avatar: `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase(),
      ultima_actualizacion: new Date().toISOString(),
      auth_usuario_id: data.user.id
    });

    if (profileError) {
      throw profileError;
    }

    return this.signIn(form.email, form.password);
  }

  private async loadActiveUser(authUserId: string): Promise<ActiveUserSession> {
    const { data, error } = await this.supabase.client
      .from('usuarios')
      .select('codusuario, auth_usuario_id, nombre_usuario, nombre_completo, correo, empresa_id, sucursal, rol, estado')
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
      role: profile.rol
    };

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
