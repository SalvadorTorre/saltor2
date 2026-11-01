import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

/** Factura pendiente de cierre de un usuario (empresas que cobran en la venta). */
export interface UserClosingInvoice {
  id: number;
  invoice: string;
  date: string;
  client: string;
  type: string;
  paymentCode: number;
  payment: string;
  value: number;
  userId: number | null;
  userName: string;
}

export interface UserClosingResult {
  id: number;
  invoices: number;
  cash: number;
  cards: number;
  deposits: number;
  checks: number;
  credit: number;
  collected: number;
  total: number;
  closedAt: string;
  fromInvoice: string;
  toInvoice: string;
  seller: string;
  closedBy: string;
}

export interface DayClosingInvoice {
  numero: string;
  cliente: string;
  tipo: string | null;
  formaPago: number | null;
  condicion: string | null;
  total: number;
}

export interface DayClosing {
  id: number;
  cerradoEn: string;
  tipo: 'Caja' | 'Usuario';
  sucursal: string | null;
  cajero: string | null;
  vendedorId: number | null;
  vendedor: string;
  desde: string;
  hasta: string;
  cantidad: number;
  efectivo: number;
  tarjetas: number;
  depositos: number;
  cheques: number;
  credito: number;
  cobrados: number;
  total: number;
  nota: string | null;
  facturas: DayClosingInvoice[];
}

export interface PendingByUser {
  usuarioId: number;
  usuario: string;
  cantidad: number;
  total: number;
}

export interface DaySummary {
  esAdmin: boolean;
  modo: string;
  usuarioId: number;
  usuario: string;
  cierres: DayClosing[];
  pendientes: PendingByUser[];
}

const PAYMENT_NAMES: Record<number, string> = {
  1: 'Efectivo', 2: 'Depósito/transferencia', 3: 'Tarjeta', 4: 'Crédito', 5: 'Bonos', 6: 'Permuta', 7: 'Nota de crédito', 8: 'Otras ventas'
};

export function paymentCodeOf(code: number | null | undefined, condition: string | null | undefined): number {
  return Number(code ?? (condition === 'Credito' ? 4 : 1));
}

export function paymentName(code: number): string {
  return PAYMENT_NAMES[code] ?? 'Otro';
}

@Injectable({ providedIn: 'root' })
export class CashUserClosingsService {
  constructor(private readonly supabase: SupabaseService) {}

  /** userId: null = las mías; 0 = las que no tienen usuario (administrador). */
  async getPending(userId: number | null): Promise<UserClosingInvoice[]> {
    const { data, error } = await this.supabase.client.rpc('cierre_usuario_pendientes', { p_usuario_id: userId });
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => {
      const code = paymentCodeOf(row.forma_pago_codigo, row.condicion_pago);
      return {
        id: Number(row.id), invoice: row.numero_factura, date: row.fecha_factura, client: row.cliente_nombre ?? 'CLIENTE CONTADO',
        type: row.tipo_ncf ?? 'Factura', paymentCode: code, payment: paymentName(code), value: Number(row.total ?? 0),
        userId: row.usuario_id ?? null, userName: row.usuario_nombre ?? 'Sin usuario'
      };
    });
  }

  async close(invoiceIds: number[], note: string, userId: number | null): Promise<UserClosingResult> {
    const { data, error } = await this.supabase.client.rpc('crear_cierre_usuario', {
      p_factura_ids: invoiceIds, p_nota: note.trim() || null, p_usuario_id: userId
    });
    if (error) throw new Error(error.message || 'No se pudo registrar el cierre.');
    const row = (Array.isArray(data) ? data[0] : data) as any;
    return {
      id: Number(row.id), invoices: Number(row.cantidad_facturas), cash: Number(row.total_efectivo), cards: Number(row.total_tarjetas),
      deposits: Number(row.total_depositos), checks: Number(row.total_cheques), credit: Number(row.total_credito),
      collected: Number(row.valores_cobrados), total: Number(row.total_cierre), closedAt: row.cerrado_en,
      fromInvoice: row.factura_desde, toInvoice: row.factura_hasta, seller: row.vendedor_nombre ?? '', closedBy: row.cajero_nombre ?? ''
    };
  }

  /** Cierres del día (todos para el administrador; los propios para los demás) y lo pendiente por usuario. */
  async getDaySummary(date: string): Promise<DaySummary> {
    const { data, error } = await this.supabase.client.rpc('cierre_resumen_dia', { p_fecha: date });
    if (error) throw error;
    const summary = data as DaySummary;
    const num = (value: unknown) => Number(value ?? 0);
    summary.cierres = (summary.cierres ?? []).map((c) => ({
      ...c, cantidad: num(c.cantidad), efectivo: num(c.efectivo), tarjetas: num(c.tarjetas), depositos: num(c.depositos),
      cheques: num(c.cheques), credito: num(c.credito), cobrados: num(c.cobrados), total: num(c.total),
      facturas: (c.facturas ?? []).map((f) => ({ ...f, total: num(f.total) }))
    }));
    summary.pendientes = (summary.pendientes ?? []).map((p) => ({ ...p, cantidad: num(p.cantidad), total: num(p.total) }));
    return summary;
  }

  async markPrinted(closingId: number): Promise<void> {
    await this.supabase.client.from('cierres_caja').update({ impreso_en: new Date().toISOString() }).eq('id', closingId);
  }
}
