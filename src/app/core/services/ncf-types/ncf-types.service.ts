import { Injectable } from '@angular/core';
import { NcfType, NcfTypeFormModel } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

interface NcfTypeRow {
  id: number;
  codigo: string;
  tipo: number | null;
  serie: string;
  nombre: string;
  descripcion: string | null;
  tasa_itbis: number | string | null;
  es_electronico: boolean | null;
  estado: 'Activa' | 'Inactiva';
  fecha_registro: string | null;
}

@Injectable({ providedIn: 'root' })
export class NcfTypesService {
  private readonly table = 'tipos_ncf';

  constructor(private readonly supabase: SupabaseService) {}

  async getTypes(): Promise<NcfType[]> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .select('*')
      .order('codigo', { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: NcfTypeRow) => this.fromRow(row));
  }

  async createType(form: NcfTypeFormModel, createdAt: string): Promise<NcfType> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .insert(this.toRow(form, createdAt))
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as NcfTypeRow);
  }

  async updateType(id: number, form: NcfTypeFormModel, createdAt: string): Promise<NcfType> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .update(this.toRow(form, createdAt))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as NcfTypeRow);
  }

  async deleteType(id: number): Promise<void> {
    const { error } = await this.supabase.client.from(this.table).delete().eq('id', id);

    if (error) {
      throw error;
    }
  }

  private fromRow(row: NcfTypeRow): NcfType {
    return {
      id: row.id,
      code: row.codigo,
      type: row.tipo == null ? null : Number(row.tipo),
      series: row.serie,
      name: row.nombre,
      description: row.descripcion ?? '',
      taxRate: Number(row.tasa_itbis ?? 0),
      isElectronic: Boolean(row.es_electronico),
      status: row.estado,
      createdAt: row.fecha_registro ?? ''
    };
  }

  private toRow(form: NcfTypeFormModel, createdAt: string): Omit<NcfTypeRow, 'id'> {
    return {
      codigo: form.code.trim(),
      tipo: Number(form.type) || null,
      serie: form.series.trim().toUpperCase(),
      nombre: form.name.trim(),
      descripcion: form.description.trim() || null,
      tasa_itbis: Number(form.taxRate) || 0,
      es_electronico: form.isElectronic,
      estado: form.status,
      fecha_registro: createdAt
    };
  }
}
