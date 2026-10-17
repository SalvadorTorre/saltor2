import { Injectable } from '@angular/core';
import { NcfCompany, NcfCompanyFormModel, NcfSequence, NcfSequenceFormModel } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

interface NcfCompanyRow {
  id: number;
  rnc: string;
  razon_social: string;
  nombre_comercial: string;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  estado: 'Activa' | 'Inactiva';
  fecha_registro: string | null;
}

export interface NcfSequenceHistory {
  id: number;
  accion: string;
  registrado_en: string;
  usuario_id: string | null;
  datos: NcfSequence;
}

interface NcfSequenceRow {
  autorizacion?: string | null;
  solicitados?: number | null;
  aceptados?: number;
  actualizado_en?: string;
  id: number;
  empresa_id: number;
  tipo_ncf: string;
  serie: string;
  rango_inicial: string;
  rango_final: string;
  fecha_autorizacion: string;
  fecha_vencimiento: string;
  usados: number | string | null;
  total: number | string | null;
  estado: 'Activa' | 'Agotada' | 'Vencida';
  alerta: boolean | null;
  porcentaje_alerta: number | string | null;
}

@Injectable({ providedIn: 'root' })
export class NcfService {
  private readonly companiesTable = 'ncf_empresas';
  private readonly sequencesTable = 'ncf_secuencias';

  constructor(private readonly supabase: SupabaseService) {}

  async getCompanies(): Promise<NcfCompany[]> {
    const { data, error } = await this.supabase.client
      .from(this.companiesTable)
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: NcfCompanyRow) => this.companyFromRow(row));
  }

  async getSequences(companyId: number): Promise<NcfSequence[]> {
    // Paginación por ID: incluye el historial completo aunque supere el límite de PostgREST.
    const rows: NcfSequenceRow[] = [];
    let beforeId: number | null = null;
    while (true) {
      let query = this.supabase.client.from(this.sequencesTable).select('*')
        .eq('empresa_id', companyId).order('id', { ascending: false }).limit(500);
      if (beforeId !== null) query = query.lt('id', beforeId);
      const { data, error } = await query;
      if (error) throw error;
      const page = (data ?? []) as NcfSequenceRow[];
      rows.push(...page);
      if (page.length < 500) break;
      beforeId = page[page.length - 1].id;
    }
    return rows.map((row) => this.sequenceFromRow(row));
  }

  async createCompany(form: NcfCompanyFormModel, createdAt: string): Promise<NcfCompany> {
    const { data, error } = await this.supabase.client
      .from(this.companiesTable)
      .insert(this.companyToRow(form, createdAt))
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.companyFromRow(data as NcfCompanyRow);
  }

  async updateCompany(id: number, form: NcfCompanyFormModel, createdAt: string): Promise<NcfCompany> {
    const { data, error } = await this.supabase.client
      .from(this.companiesTable)
      .update(this.companyToRow(form, createdAt))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.companyFromRow(data as NcfCompanyRow);
  }

  async deleteCompany(id: number): Promise<void> {
    const { error } = await this.supabase.client.from(this.companiesTable).delete().eq('id', id);

    if (error) {
      throw error;
    }
  }

  async createSequence(form: NcfSequenceFormModel, total: number, alert: boolean): Promise<NcfSequence> {
    const { data, error } = await this.supabase.client
      .from(this.sequencesTable)
      .insert(this.sequenceToRow(form, total, alert))
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.sequenceFromRow(data as NcfSequenceRow);
  }

  async updateSequence(id: number, form: NcfSequenceFormModel, total: number, alert: boolean, updatedAt?: string): Promise<NcfSequence> {
    let query = this.supabase.client.from(this.sequencesTable)
      .update(this.sequenceToRow(form, total, alert)).eq('id', id).eq('empresa_id', form.companyId).eq('usados', form.used);
    if (updatedAt) query = query.eq('actualizado_en', updatedAt);
    const { data, error } = await query.select('*').maybeSingle();
    if (!error && !data) throw new Error('La secuencia cambió mientras la editabas. Actualiza el grid y vuelve a intentarlo.');

    if (error) {
      throw error;
    }

    return this.sequenceFromRow(data as NcfSequenceRow);
  }

  async getSequenceHistory(id: number, companyId: number): Promise<NcfSequenceHistory[]> {
    const { data, error } = await this.supabase.client.from('ncf_secuencias_historial')
      .select('id, accion, registrado_en, usuario_id, datos').eq('secuencia_id', id).eq('empresa_id', companyId)
      .order('id', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ ...row, datos: this.sequenceFromRow(row.datos) }));
  }

  private companyFromRow(row: NcfCompanyRow): NcfCompany {
    return {
      id: row.id,
      rnc: row.rnc,
      legalName: row.razon_social,
      tradeName: row.nombre_comercial,
      address: row.direccion ?? '',
      phone: row.telefono ?? '',
      email: row.correo ?? '',
      status: row.estado,
      createdAt: row.fecha_registro ?? ''
    };
  }

  private companyToRow(form: NcfCompanyFormModel, createdAt: string): Omit<NcfCompanyRow, 'id'> {
    return {
      rnc: form.rnc.trim(),
      razon_social: form.legalName.trim(),
      nombre_comercial: form.tradeName.trim(),
      direccion: form.address.trim() || null,
      telefono: form.phone.trim() || null,
      correo: form.email.trim() || null,
      estado: form.status,
      fecha_registro: createdAt
    };
  }

  private sequenceFromRow(row: NcfSequenceRow): NcfSequence {
    return {
      authorization: row.autorizacion ?? '',
      requested: row.solicitados == null ? null : Number(row.solicitados),
      accepted: Number(row.aceptados ?? row.total ?? 0),
      updatedAt: row.actualizado_en,
      id: row.id,
      companyId: row.empresa_id,
      ncfType: row.tipo_ncf,
      series: row.serie,
      rangeStart: row.rango_inicial,
      rangeEnd: row.rango_final,
      authorizedAt: row.fecha_autorizacion,
      expiresAt: row.fecha_vencimiento,
      used: Number(row.usados ?? 0),
      total: Number(row.total ?? 0),
      status: row.estado,
      alert: Boolean(row.alerta),
      alertPercent: Number(row.porcentaje_alerta ?? 0)
    };
  }

  private sequenceToRow(form: NcfSequenceFormModel, total: number, alert: boolean): Omit<NcfSequenceRow, 'id'> {
    return {
      autorizacion: form.authorization?.trim() || null,
      solicitados: form.requested ?? null,
      aceptados: total,
      empresa_id: Number(form.companyId),
      tipo_ncf: form.ncfType,
      serie: form.series.trim(),
      rango_inicial: form.rangeStart.trim(),
      rango_final: form.rangeEnd.trim(),
      fecha_autorizacion: form.authorizedAt.trim(),
      fecha_vencimiento: form.expiresAt.trim(),
      usados: Math.max(0, Math.floor(Number(form.used) || 0)),
      total,
      estado: form.status,
      alerta: alert,
      porcentaje_alerta: Math.min(100, Math.max(0, Math.floor(Number(form.alertPercent) || 0)))
    };
  }
}
