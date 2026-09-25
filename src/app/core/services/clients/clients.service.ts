import { Injectable } from '@angular/core';
import { ClientFormModel, ClientRecord } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

interface ClientRow {
  id: number;
  codigo: string;
  nombre_completo: string;
  empresa: string | null;
  tipo_documento: 'Cedula' | 'RNC' | 'Pasaporte';
  numero_documento: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  ciudad: string | null;
  categoria: 'Credito' | 'Contado';
  limite_credito: number | string | null;
  balance: number | string | null;
  estado: 'Activo' | 'Inactivo' | 'Bloqueado';
  ultima_compra: string | null;
}

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly table = 'clients';

  constructor(private readonly supabase: SupabaseService) {}

  async getClients(): Promise<ClientRecord[]> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: ClientRow) => this.fromRow(row));
  }

  async createClient(form: ClientFormModel, lastPurchase: string): Promise<ClientRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .insert(this.toInsertRow(form, lastPurchase))
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as ClientRow);
  }

  async updateClient(id: number, form: ClientFormModel): Promise<ClientRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .update(this.toUpdateRow(form))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as ClientRow);
  }

  async deleteClient(id: number): Promise<void> {
    const { error } = await this.supabase.client
      .from(this.table)
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }
  }

  private fromRow(row: ClientRow): ClientRecord {
    return {
      id: row.id,
      code: row.codigo,
      fullName: row.nombre_completo,
      companyName: row.empresa ?? '',
      documentType: row.tipo_documento,
      documentNumber: row.numero_documento,
      phone: row.telefono ?? '',
      email: row.correo ?? '',
      address: row.direccion ?? '',
      city: row.ciudad ?? '',
      category: row.categoria,
      creditLimit: Number(row.limite_credito ?? 0),
      balance: Number(row.balance ?? 0),
      status: row.estado,
      lastPurchase: row.ultima_compra ?? ''
    };
  }

  private toInsertRow(form: ClientFormModel, lastPurchase: string): Omit<ClientRow, 'id'> {
    return {
      ...this.toUpdateRow(form),
      ultima_compra: lastPurchase
    };
  }

  private toUpdateRow(form: ClientFormModel): Omit<ClientRow, 'id' | 'ultima_compra'> {
    return {
      codigo: form.code.trim(),
      nombre_completo: form.fullName.trim(),
      empresa: form.companyName.trim() || null,
      tipo_documento: form.documentType,
      numero_documento: form.documentNumber.trim(),
      telefono: form.phone.trim() || null,
      correo: form.email.trim() || null,
      direccion: form.address.trim() || null,
      ciudad: form.city.trim() || null,
      categoria: form.category,
      limite_credito: Number(form.creditLimit || 0),
      balance: Number(form.balance || 0),
      estado: form.status
    };
  }
}
