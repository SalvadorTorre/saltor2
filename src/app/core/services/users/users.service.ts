import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { UserFormModel, UserRecord } from '../../../app.models';
import { environment } from '../../../../environments/environment';
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
  private readonly registrationClient = createClient(environment.supabase.url, environment.supabase.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  constructor(private readonly supabase: SupabaseService) {}

  async getUsers(): Promise<UserRecord[]> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .select('*')
      .order('codusuario', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: UserRow) => this.fromRow(row));
  }

  async createUser(form: UserFormModel, lastUpdate: string): Promise<UserRecord> {
    const authUserId = await this.createAuthUser(form);
    const { data, error } = await this.supabase.client
      .from(this.table)
      .insert({ ...this.toProfileRow(form, lastUpdate), auth_usuario_id: authUserId })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as UserRow);
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

  private async createAuthUser(form: UserFormModel): Promise<string> {
    const { data, error } = await this.registrationClient.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          nombre_usuario: form.username.trim(),
          empresa_id: form.companyId,
          rol: form.role
        }
      }
    });

    if (error || !data.user) {
      throw error ?? new Error('No se pudo crear la cuenta de acceso.');
    }

    return data.user.id;
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
