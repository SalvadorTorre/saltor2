import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type PrintPaper = '80mm' | '90mm' | 'carta' | 'media_carta';

const DEFAULT_PAPER: PrintPaper = 'carta';

@Injectable({ providedIn: 'root' })
export class CompanyPrintSettingsService {
  private cachedPaper: PrintPaper | null = null;
  private cachedCopies: number | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  async getPaper(): Promise<PrintPaper> {
    this.resetCacheIfCompanyChanged();
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
    const { data, error } = await this.supabase.client
      .from('empresas')
      .update({ tipo_papel_impresion: value })
      .eq('id', companyId)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('No se guardó el tipo de papel: solo un administrador de la empresa puede cambiarlo.');
    this.cachedPaper = value;
  }

  /** Copias que se imprimen al generar una factura (1 a 5). Las reimpresiones salen en una. */
  async getInvoiceCopies(): Promise<number> {
    this.resetCacheIfCompanyChanged();
    if (this.cachedCopies) return this.cachedCopies;
    const companyId = this.companyId();
    if (!companyId) return 1;
    const { data, error } = await this.supabase.client
      .from('empresas')
      .select('copias_factura')
      .eq('id', companyId)
      .maybeSingle();
    if (error) return 1;
    this.cachedCopies = this.normalizeCopies(data?.copias_factura);
    return this.cachedCopies;
  }

  async saveInvoiceCopies(copies: number): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) throw new Error('No se identificó la empresa activa.');
    const value = this.normalizeCopies(copies);
    const { data, error } = await this.supabase.client
      .from('empresas')
      .update({ copias_factura: value })
      .eq('id', companyId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No se guardaron las copias: solo un administrador de la empresa puede cambiarlas.');
    this.cachedCopies = value;
  }

  private normalizeCopies(value: unknown): number {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 1;
  }

  private cachedOrderSlip: boolean | null = null;
  private cachedFooter: string | null = null;
  /** Empresa de los valores guardados: al cambiar de empresa se vuelven a leer (papel, copias, volante). */
  private cachedCompanyId = 0;

  private resetCacheIfCompanyChanged(): void {
    const companyId = this.companyId();
    if (companyId === this.cachedCompanyId) return;
    this.cachedCompanyId = companyId;
    this.cachedPaper = null;
    this.cachedCopies = null;
    this.cachedOrderSlip = null;
    this.cachedFooter = null;
  }

  /** Mensaje de pie de página de la impresión (hasta 3 líneas), debajo de la firma. */
  async getFooterText(): Promise<string> {
    this.resetCacheIfCompanyChanged();
    if (this.cachedFooter !== null) return this.cachedFooter;
    const companyId = this.companyId();
    if (!companyId) return '';
    const { data, error } = await this.supabase.client.from('empresas').select('pie_impresion').eq('id', companyId).maybeSingle();
    if (error) return '';
    this.cachedFooter = String((data as { pie_impresion?: string | null } | null)?.pie_impresion ?? '');
    return this.cachedFooter;
  }

  async saveFooterText(text: string): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) throw new Error('No se identificó la empresa activa.');
    const value = String(text ?? '').split(/\r?\n/).slice(0, 3).map((line) => line.trimEnd()).join('\n').trim();
    const { data, error } = await this.supabase.client.from('empresas').update({ pie_impresion: value || null }).eq('id', companyId).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No se guardó el pie de página: solo un administrador de la empresa puede cambiarlo.');
    this.cachedFooter = value;
  }

  /** Orden de venta con volante: al grabarla se imprime solo un volante con código de barras. */
  async getOrderSlip(): Promise<boolean> {
    this.resetCacheIfCompanyChanged();
    if (this.cachedOrderSlip !== null) return this.cachedOrderSlip;
    const companyId = this.companyId();
    if (!companyId) return false;
    const { data, error } = await this.supabase.client.from('empresas').select('orden_volante').eq('id', companyId).maybeSingle();
    if (error) return false;
    this.cachedOrderSlip = !!(data as { orden_volante?: boolean } | null)?.orden_volante;
    return this.cachedOrderSlip;
  }

  async saveOrderSlip(enabled: boolean): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) throw new Error('No se identificó la empresa activa.');
    const { data, error } = await this.supabase.client.from('empresas').update({ orden_volante: !!enabled }).eq('id', companyId).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No se guardó el volante de la orden de venta: solo un administrador de la empresa puede cambiarlo.');
    this.cachedOrderSlip = !!enabled;
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
