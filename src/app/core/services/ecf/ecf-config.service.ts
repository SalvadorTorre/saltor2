import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type EcfEnvironment = 'TEST' | 'PROD';
export interface EcfConfiguration { ambiente: EcfEnvironment; url_base: string; tipo_ingreso: string; persistir_certificado: boolean; }

@Injectable({ providedIn: 'root' })
export class EcfConfigService {
  constructor(private readonly supabase: SupabaseService) {}
  private companyId(): number { const stored = localStorage.getItem('saltor.activeUser'); return Number((stored ? JSON.parse(stored) : {}).companyId) || 0; }
  async get(): Promise<EcfConfiguration | null> { const { data, error } = await this.supabase.client.from('ecf_configuraciones').select('ambiente,url_base,tipo_ingreso,persistir_certificado').eq('empresa_id', this.companyId()).maybeSingle(); if (error) throw error; return data; }
  async save(configuration: EcfConfiguration): Promise<void> { const { error } = await this.supabase.client.from('ecf_configuraciones').update(configuration).eq('empresa_id', this.companyId()); if (error) throw error; }
}
