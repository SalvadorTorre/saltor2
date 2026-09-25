import { Injectable } from '@angular/core';
import { RncFormModel, RncRecord } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

interface RncRow {
  id: number;
  rnc: string;
  razon_social: string;
  nombre_comercial: string;
  categoria: string;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  estado_dgii: 'Activo' | 'Suspendido' | 'Pendiente';
  estado_sincronizacion: 'Sincronizado' | 'Pendiente' | 'Error';
  ultima_consulta: string | null;
}

@Injectable({ providedIn: 'root' })
export class RncService {
  private readonly table = 'rnc';

  constructor(private readonly supabase: SupabaseService) {}

  async getRecords(): Promise<RncRecord[]> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: RncRow) => this.fromRow(row));
  }

  async createRecord(form: RncFormModel, syncStatus: RncRecord['syncStatus'], lastCheck: string): Promise<RncRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .insert(this.toRow(form, syncStatus, lastCheck))
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as RncRow);
  }

  async updateRecord(id: number, form: RncFormModel, syncStatus: RncRecord['syncStatus'], lastCheck: string): Promise<RncRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .update(this.toRow(form, syncStatus, lastCheck))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as RncRow);
  }

  async markSync(id: number, syncStatus: RncRecord['syncStatus'], lastCheck: string): Promise<RncRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .update({ estado_sincronizacion: syncStatus, ultima_consulta: lastCheck })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as RncRow);
  }

  private fromRow(row: RncRow): RncRecord {
    return {
      id: row.id,
      rnc: row.rnc,
      legalName: row.razon_social,
      tradeName: row.nombre_comercial,
      category: row.categoria,
      address: row.direccion ?? '',
      phone: row.telefono ?? '',
      email: row.correo ?? '',
      dgiiStatus: row.estado_dgii,
      syncStatus: row.estado_sincronizacion,
      lastCheck: row.ultima_consulta ?? ''
    };
  }

  private toRow(form: RncFormModel, syncStatus: RncRecord['syncStatus'], lastCheck: string): Omit<RncRow, 'id'> {
    return {
      rnc: form.rnc.trim(),
      razon_social: form.legalName.trim(),
      nombre_comercial: form.tradeName.trim(),
      categoria: form.category.trim(),
      direccion: form.address.trim() || null,
      telefono: form.phone.trim() || null,
      correo: form.email.trim() || null,
      estado_dgii: form.dgiiStatus,
      estado_sincronizacion: syncStatus,
      ultima_consulta: lastCheck
    };
  }
}
