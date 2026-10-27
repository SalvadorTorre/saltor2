import { Injectable } from '@angular/core';
import { UserFormModel, UserRecord } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

interface UserRow {
  codusuario: number;
  nombre: string;
  apellido: string;
  nombre_completo: string;
  nombre_usuario: string;
  auth_usuario_id: string | null;
  correo: string;
  telefono: string | null;
  empresa_id: number | null;
  sucursal: string | null;
  rol: string;
  estado: 'Activo' | 'Inactivo';
  avatar: string | null;
  ultima_actualizacion: string | null;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly table = 'usuarios';

  constructor(private readonly supabase: SupabaseService) {}

  async getUsers(companyId?: number): Promise<UserRecord[]> {
    let request = this.supabase.client
      .from(this.table)
      .select('*')
      .order('codusuario', { ascending: false });

    if (companyId !== undefined) {
      request = request.eq('empresa_id', companyId);
    }

    const { data, error } = await request;

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: UserRow) => this.fromRow(row));
  }

  async createUser(form: UserFormModel, lastUpdate: string): Promise<UserRecord> {
    // La cuenta de acceso y el perfil se crean juntos en el servidor; si el
    // perfil falla, la cuenta se elimina y el correo queda libre.
    const { data, error } = await this.supabase.client.functions.invoke('crear-usuario', {
      body: {
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        email: form.email,
        password: form.password,
        phone: form.phone,
        companyId: form.companyId,
        branch: form.branch,
        role: form.role,
        status: form.status,
        lastUpdate
      }
    });

    if (error) {
      const response = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      const detail = await response?.json?.().catch(() => null);
      throw new Error(detail?.error || 'No se pudo crear el usuario.');
    }

    return this.fromRow(data as UserRow);
  }

  /** Pone una clave nueva (solo administradores; se cambia en Supabase Auth, no se guarda aquí). */
  async changePassword(userId: number, password: string): Promise<void> {
    const { error } = await this.supabase.client.functions.invoke('cambiar-clave-usuario', { body: { userId, password } });
    if (error) {
      const response = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      const detail = await response?.json?.().catch(() => null);
      throw new Error(detail?.error || 'No se pudo cambiar la clave. Verifica que la función cambiar-clave-usuario esté desplegada.');
    }
  }

  async updateUser(id: number, form: UserFormModel, lastUpdate: string): Promise<UserRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .update(this.toProfileRow(form, lastUpdate))
      .eq('codusuario', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as UserRow);
  }

  async deleteUser(id: number): Promise<void> {
    const { error } = await this.supabase.client.from(this.table).delete().eq('codusuario', id);

    if (error) {
      throw error;
    }
  }

  private fromRow(row: UserRow): UserRecord {
    return {
      id: row.codusuario,
      firstName: row.nombre,
      lastName: row.apellido,
      fullName: row.nombre_completo,
      username: row.nombre_usuario,
      authUserId: row.auth_usuario_id,
      email: row.correo,
      phone: row.telefono ?? '',
      companyId: row.empresa_id,
      branch: row.sucursal ?? '',
      role: row.rol,
      status: row.estado,
      avatar: row.avatar ?? this.buildAvatar(row.nombre, row.apellido),
      lastUpdate: row.ultima_actualizacion ?? ''
    };
  }

  private toProfileRow(form: UserFormModel, lastUpdate: string): Omit<UserRow, 'codusuario' | 'auth_usuario_id'> {
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    return {
      nombre: firstName,
      apellido: lastName,
      nombre_completo: `${firstName} ${lastName}`.trim(),
      nombre_usuario: form.username.trim(),
      correo: form.email.trim(),
      telefono: form.phone.trim() || null,
      empresa_id: form.companyId,
      sucursal: form.branch.trim() || null,
      rol: form.role,
      estado: form.status,
      avatar: this.buildAvatar(firstName, lastName),
      ultima_actualizacion: lastUpdate
    };
  }

  private buildAvatar(firstName: string, lastName: string): string {
    return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  }
}
