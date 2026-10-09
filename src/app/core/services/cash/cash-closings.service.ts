import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface CashClosingInvoice {
  id: number;
  invoice: string;
  date: string;
  client: string;
  type: string;
  payment: string;
  paymentCode: number;
  value: number;
  status: string;
}

export interface CashClosingRecord {
  id: number;
  companyName: string;
  companyRnc: string;
  branchName: string;
  cashierName: string;
  closedAt: string;
  fromInvoice: string;
  toInvoice: string;
  invoices: number;
  cash: number;
  cards: number;
  deposits: number;
  checks: number;
  credit: number;
  pending: number;
  collected: number;
  uncollected: number;
  total: number;
  note: string;
  status: string;
  printedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class CashClosingsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getPendingInvoices(from?: string, to?: string): Promise<CashClosingInvoice[]> {
    let query = this.supabase.client.from('facturas')
      .select('id, numero_factura, fecha_factura, cliente_nombre, tipo_ncf, condicion_pago, forma_pago_codigo, total')
      .is('cierre_caja_id', null)
      .neq('estado', 'Anulada')
      .order('numero_factura');

    const branchId = this.branchId();
    if (branchId) query = query.eq('idsucursal', branchId);

    if (from?.trim()) query = query.gte('numero_factura', from.trim());
    if (to?.trim()) query = query.lte('numero_factura', to.trim());
    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row: any) => {
      const paymentCode = Number(row.forma_pago_codigo ?? (row.condicion_pago === 'Credito' ? 4 : 1));
      return {
        id: Number(row.id), invoice: row.numero_factura, date: row.fecha_factura,
        client: row.cliente_nombre ?? 'CLIENTE CONTADO', type: row.tipo_ncf ?? 'Factura',
        payment: this.paymentName(paymentCode, row.condicion_pago), paymentCode,
        value: Number(row.total ?? 0), status: row.condicion_pago === 'Credito' ? 'CREDITO' : 'Pendiente Pago'
      };
    });
  }

  async getLatestClosing(): Promise<CashClosingRecord | null> {
    const { data, error } = await this.supabase.client.from('cierres_caja')
      .select('id, empresa_nombre, empresa_rnc, sucursal_nombre, cajero_nombre, cerrado_en, factura_desde, factura_hasta, cantidad_facturas, total_efectivo, total_tarjetas, total_depositos, total_cheques, total_credito, total_pendiente, valores_cobrados, valores_no_cobrados, total_cierre, nota, estado, impreso_en')
      .order('cerrado_en', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? this.mapClosing(data) : null;
  }

  async createClosing(fromInvoice: string, toInvoice: string, note: string): Promise<CashClosingRecord> {
    const { data, error } = await this.supabase.client.rpc('crear_cierre_caja', {
      p_factura_desde: fromInvoice.trim(), p_factura_hasta: toInvoice.trim(), p_nota: note.trim() || null
    });
    if (error) {
      console.error('Error detallado al crear el cierre de caja:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw new Error(error.message || 'No se pudo crear el cierre de caja.');
    }
    const row = Array.isArray(data) ? data[0] : data;
    return this.mapClosing(row);
  }

  async getHistory(): Promise<CashClosingRecord[]> {
    const { data, error } = await this.supabase.client.from('cierres_caja')
      .select('id, empresa_nombre, empresa_rnc, sucursal_nombre, cajero_nombre, cerrado_en, factura_desde, factura_hasta, cantidad_facturas, total_efectivo, total_tarjetas, total_depositos, total_cheques, total_credito, total_pendiente, valores_cobrados, valores_no_cobrados, total_cierre, nota, estado, impreso_en')
      .order('cerrado_en', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => this.mapClosing(row));
  }

  private mapClosing(row: any): CashClosingRecord {
    return { id: Number(row.id), companyName: row.empresa_nombre ?? '', companyRnc: row.empresa_rnc ?? '',
      branchName: row.sucursal_nombre ?? '', cashierName: row.cajero_nombre ?? '', closedAt: row.cerrado_en, fromInvoice: row.factura_desde, toInvoice: row.factura_hasta,
      invoices: Number(row.cantidad_facturas ?? 0), cash: Number(row.total_efectivo ?? 0), cards: Number(row.total_tarjetas ?? 0),
      deposits: Number(row.total_depositos ?? 0), checks: Number(row.total_cheques ?? 0), credit: Number(row.total_credito ?? 0),
      pending: Number(row.total_pendiente ?? 0), collected: Number(row.valores_cobrados ?? 0), uncollected: Number(row.valores_no_cobrados ?? 0),
      total: Number(row.total_cierre ?? 0), note: row.nota ?? '', status: row.estado ?? 'Confirmado', printedAt: row.impreso_en ?? null };
  }

  async markPrinted(closingId: number): Promise<void> {
    const { error } = await this.supabase.client.from('cierres_caja')
      .update({ impreso_en: new Date().toISOString() }).eq('id', closingId);
    if (error) throw error;
  }

  private paymentName(code: number, fallback: string): string {
    return ({ 1: 'Efectivo', 2: 'Deposito/transferencia', 3: 'Tarjeta', 4: 'Credito', 5: 'Bonos', 6: 'Permuta', 7: 'Nota de credito', 8: 'Otras ventas' } as Record<number, string>)[code] ?? fallback;
  }

  private branchId(): number {
    try { return Number(JSON.parse(localStorage.getItem('saltor.activeUser') ?? '{}').branchId) || 0; }
    catch { return 0; }
  }
}
