import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Cómo factura la empresa:
 *  - Directo: quien factura cobra e imprime en el mismo momento.
 *  - Caja: el vendedor guarda la factura pendiente y la cajera la cobra e imprime en Caja.
 */
export type BillingMode = 'Directo' | 'Caja';

@Injectable({ providedIn: 'root' })
export class CompanyBillingModeService {
  private cache: { companyId: number; mode: BillingMode } | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  async getMode(): Promise<BillingMode> {
    const companyId = this.companyId();
    if (!companyId) return 'Directo';
    if (this.cache?.companyId === companyId) return this.cache.mode;
    const { data, error } = await this.supabase.client.from('empresas').select('modo_facturacion').eq('id', companyId).maybeSingle();
    if (error) return 'Directo';
    const mode: BillingMode = (data as { modo_facturacion?: string } | null)?.modo_facturacion === 'Caja' ? 'Caja' : 'Directo';
    this.cache = { companyId, mode };
    return mode;
  }

  async saveMode(mode: BillingMode): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) throw new Error('No se identificó la empresa activa.');
    const { data, error } = await this.supabase.client.from('empresas').update({ modo_facturacion: mode }).eq('id', companyId).select('id');
    if (error) throw error;
    // Sin permiso la base de datos no da error: simplemente no cambia nada.
    if (!data?.length) throw new Error('No se guardó el modo de facturación: solo un administrador de la empresa puede cambiarlo.');
    this.cache = { companyId, mode };
  }

  private companyId(): number {
    try {
      const value = localStorage.getItem('saltor.activeUser');
      return Number(value ? JSON.parse(value).companyId : 0) || 0;
    } catch {
      return 0;
    }
  }
}
