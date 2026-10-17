import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export const PROFORMA_MAX = 99999999999;
export interface ProformaSettings {
  companyId: number;
  enabled: boolean;
  current: number;
  updatedAt: string | null;
}
export interface ProformaMovement {
  id: number;
  accion: string;
  numero_anterior: number;
  numero_actual: number;
  activa: boolean;
  registrado_en: string;
}

@Injectable({ providedIn: 'root' })
export class ProformaService {
  constructor(private readonly supabase: SupabaseService) {}

  async getSettings(companyId: number): Promise<ProformaSettings> {
    const { data, error } = await this.supabase.client.from('empresas_proforma')
      .select('empresa_id, activa, ultimo_numero, actualizado_en').eq('empresa_id', companyId).maybeSingle();
    if (error) throw error;
    return this.fromRow(data, companyId);
  }

  async setEnabled(companyId: number, enabled: boolean): Promise<ProformaSettings> {
    const { data, error } = await this.supabase.client.rpc('plataforma_configurar_proforma', {
      p_empresa_id: companyId, p_activa: enabled
    });
    if (error) throw error;
    return this.fromRow(data, companyId);
  }

  async setCurrent(settings: ProformaSettings, current: number, forPlatform = false): Promise<ProformaSettings> {
    if (!Number.isSafeInteger(current) || current < 0 || current > PROFORMA_MAX)
      throw new Error('El número actual debe ser un entero entre 0 y 99999999999.');
    const { data, error } = await this.supabase.client.rpc('ajustar_contador_proforma', {
      p_ultimo_numero: current, p_numero_esperado: settings.current, p_actualizado_en: settings.updatedAt,
      ...(forPlatform ? { p_empresa_id: settings.companyId } : {})
    });
    if (error) throw error;
    return this.fromRow(data, settings.companyId);
  }

  async getHistory(companyId: number): Promise<ProformaMovement[]> {
    const { data, error } = await this.supabase.client.from('empresas_proforma_historial')
      .select('id, accion, numero_anterior, numero_actual, activa, registrado_en')
      .eq('empresa_id', companyId).order('id', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).map((row: ProformaMovement) => ({ ...row,
      numero_anterior: Number(row.numero_anterior), numero_actual: Number(row.numero_actual) }));
  }

  private fromRow(row: any, companyId: number): ProformaSettings {
    return { companyId, enabled: row?.activa === true, current: Number(row?.ultimo_numero ?? 0),
      updatedAt: row?.actualizado_en ?? null };
  }
}
