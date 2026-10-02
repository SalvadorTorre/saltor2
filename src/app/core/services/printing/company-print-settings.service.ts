import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type PrintPaper = '80mm' | '90mm' | 'carta' | 'media_carta';

const DEFAULT_PAPER: PrintPaper = 'carta';

@Injectable({ providedIn: 'root' })
export class CompanyPrintSettingsService {
  private cachedPaper: PrintPaper | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  async getPaper(): Promise<PrintPaper> {
    if (this.cachedPaper) return this.cachedPaper;

    const companyId = this.companyId();
    if (!companyId) return DEFAULT_PAPER;

    const { data, error } = await this.supabase.client
      .from('empresas')
      .select('tipo_papel_impresion')
      .eq('id', companyId)
      .maybeSingle();

    if (error) throw error;
    this.cachedPaper = this.normalize(data?.tipo_papel_impresion);
    return this.cachedPaper;
  }

  async savePaper(paper: PrintPaper): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) throw new Error('No se identificó la empresa activa.');

    const value = this.normalize(paper);
    const { error } = await this.supabase.client
      .from('empresas')
      .update({ tipo_papel_impresion: value })
      .eq('id', companyId);

    if (error) throw error;
    this.cachedPaper = value;
  }

  private companyId(): number {
    try {
      const value = localStorage.getItem('saltor.activeUser');
      return Number(value ? JSON.parse(value).companyId : 0) || 0;
    } catch {
      return 0;
    }
  }

  private normalize(value: unknown): PrintPaper {
    return value === '80mm' || value === '90mm' || value === 'media_carta' || value === 'carta'
      ? value
      : DEFAULT_PAPER;
  }
}
