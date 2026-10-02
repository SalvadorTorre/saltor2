import { Injectable } from '@angular/core';
import { RncFormModel, RncRecord } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

export interface RncLookupResult {
  rnc: string;
  legalName: string;
  tradeName: string;
  category: string;
  address: string;
  phone: string;
  email: string;
  dgiiStatus: RncRecord['dgiiStatus'];
}

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

  async lookup(rnc: string): Promise<RncLookupResult> {
    const normalizedRnc = rnc.replace(/\D/g, '');
    if (!normalizedRnc) throw new Error('Indica un RNC válido para consultar.');

    const { data, error } = await this.supabase.client.functions.invoke(`consultar-rnc?rnc=${encodeURIComponent(normalizedRnc)}`, {
      method: 'GET'
    });
    if (error) {
      const response = (error as { context?: { json?: () => Promise<{ mensaje?: string; error?: string }> } }).context;
      const detail = response?.json ? await response.json() : null;
      throw new Error(detail?.mensaje || detail?.error || 'No se pudo consultar el RNC en Megaplus.');
    }

    const response = this.firstRecord(data);
    if (!response || response['error'] === true) {
      throw new Error(response?.['mensaje'] || response?.['message'] || 'No se encontró información para ese RNC.');
    }

    const legalName = this.value(response, 'razon_social', 'razonSocial', 'nombre_razon_social', 'nombre', 'name');
    if (!legalName) throw new Error('Megaplus no devolvió una razón social para ese RNC.');

    return {
      rnc: this.value(response, 'rnc', 'RNC', 'numero_rnc', 'numeroRnc') || normalizedRnc,
      legalName,
      tradeName: this.value(response, 'nombre_comercial', 'nombreComercial', 'trade_name') || legalName,
      category: this.value(response, 'categoria', 'tipo_contribuyente', 'tipoContribuyente') || 'Contribuyente Normal',
      address: this.value(response, 'direccion', 'address'),
      phone: this.value(response, 'telefono', 'phone'),
      email: this.value(response, 'correo', 'email'),
      dgiiStatus: this.isInactive(response) ? 'Suspendido' : 'Activo'
    };
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

  private firstRecord(data: unknown): Record<string, any> | null {
    if (Array.isArray(data)) return (data[0] as Record<string, any>) ?? null;
    if (!data || typeof data !== 'object') return null;
    const object = data as Record<string, any>;
    if (Array.isArray(object['data'])) return object['data'][0] ?? null;
    if (object['data'] && typeof object['data'] === 'object') return object['data'];
    if (Array.isArray(object['resultado'])) return object['resultado'][0] ?? null;
    if (object['resultado'] && typeof object['resultado'] === 'object') return object['resultado'];
    return object;
  }

  private value(record: Record<string, any>, ...keys: string[]): string {
    for (const key of keys) {
      const value = record[key];
      if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
    }
    return '';
  }

  private isInactive(record: Record<string, any>): boolean {
    const status = this.value(record, 'estado', 'estado_dgii', 'estatus').toLowerCase();
    return status.includes('suspend') || status.includes('inactiv');
  }
}
