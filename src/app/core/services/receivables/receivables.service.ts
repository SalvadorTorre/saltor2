import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

/** Factura a crédito con su saldo (vista myappdb.cxc_facturas). */
export interface ReceivableInvoice {
  id: number;
  branchId: number;
  invoiceNumber: string;
  ncf: string;
  clientId: number | null;
  clientName: string;
  clientDocument: string;
  date: string;
  dueDate: string;
  total: number;
  paid: number;
  creditNotes: number;
  balance: number;
  daysOverdue: number;
  /** 'Factura' o 'Saldo anterior' (deuda traída del sistema anterior; id negativo). */
  documentType: string;
}

export interface ReceivableClient {
  id: number;
  code: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  creditLimit: number;
  creditDays: number;
  balance: number;
  status: string;
}

export interface ReceiptApplication {
  invoiceId: number;
  invoiceNumber: string;
  amount: number;
}

export interface Receipt {
  id: number;
  number: string;
  clientId: number | null;
  clientName: string;
  date: string;
  paymentCode: number;
  reference: string;
  total: number;
  notes: string;
  status: 'Activo' | 'Anulado';
  userName: string;
  createdAt: string;
  applications: ReceiptApplication[];
}

export interface StatementCreditNote {
  invoiceId: number;
  number: string;
  date: string;
  total: number;
}

export interface NewReceipt {
  customerId: number;
  date: string;
  paymentCode: number;
  reference: string;
  notes: string;
  applications: { invoiceId: number; amount: number }[];
}

const num = (value: unknown): number => Number(value ?? 0) || 0;

@Injectable({ providedIn: 'root' })
export class ReceivablesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Facturas a crédito; por defecto solo las que tienen saldo. */
  async getInvoices(options: { clientId?: number; includePaid?: boolean } = {}): Promise<ReceivableInvoice[]> {
    let query = this.supabase.client.from('cxc_facturas').select('*').order('fecha_vencimiento', { ascending: true });
    if (options.clientId) query = query.eq('cliente_id', options.clientId);
    if (!options.includePaid) query = query.gt('saldo', 0);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: Number(row.id),
      branchId: Number(row.sucursal_id ?? 0),
      invoiceNumber: row.numero_factura ?? '',
      ncf: row.ncf ?? '',
      clientId: row.cliente_id == null ? null : Number(row.cliente_id),
      clientName: row.cliente_nombre ?? 'Sin cliente',
      clientDocument: row.cliente_documento ?? '',
      date: row.fecha_factura,
      dueDate: row.fecha_vencimiento,
      total: num(row.total),
      paid: num(row.abonado),
      creditNotes: num(row.notas_credito),
      balance: num(row.saldo),
      daysOverdue: Number(row.dias_vencida ?? 0),
      documentType: row.tipo_documento ?? 'Factura'
    }));
  }

  async getClients(): Promise<ReceivableClient[]> {
    const { data, error } = await this.supabase.client
      .from('clients')
      .select('id, codigo, nombre_completo, numero_documento, telefono, correo, direccion, limite_credito, dias_credito, balance, estado')
      .order('nombre_completo');
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: Number(row.id),
      code: row.codigo ?? '',
      name: row.nombre_completo ?? '',
      document: row.numero_documento ?? '',
      phone: row.telefono ?? '',
      email: row.correo ?? '',
      address: row.direccion ?? '',
      creditLimit: num(row.limite_credito),
      creditDays: Number(row.dias_credito ?? 30),
      balance: num(row.balance),
      status: row.estado ?? ''
    }));
  }

  async getReceipts(options: { clientId?: number; from?: string; to?: string; limit?: number } = {}): Promise<Receipt[]> {
    let query = this.supabase.client
      .from('recibos_cobro')
      .select('*, recibo_cobro_aplicaciones(factura_id, saldo_inicial_id, monto, facturas(numero_factura), cxc_saldos_iniciales(numero))')
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .limit(options.limit ?? 300);
    if (options.clientId) query = query.eq('cliente_id', options.clientId);
    if (options.from) query = query.gte('fecha', options.from);
    if (options.to) query = query.lte('fecha', options.to);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: Number(row.id),
      number: row.numero_recibo,
      clientId: row.cliente_id == null ? null : Number(row.cliente_id),
      clientName: row.cliente_nombre ?? '',
      date: row.fecha,
      paymentCode: Number(row.forma_pago_codigo ?? 1),
      reference: row.referencia ?? '',
      total: num(row.monto_total),
      notes: row.notas ?? '',
      status: row.estado,
      userName: row.usuario_nombre ?? '',
      createdAt: row.creado_en,
      applications: (row.recibo_cobro_aplicaciones ?? []).map((a: any) => ({
        // Los saldos anteriores usan id negativo, igual que en la vista de cuentas por cobrar.
        invoiceId: a.factura_id != null ? Number(a.factura_id) : -Number(a.saldo_inicial_id),
        invoiceNumber: a.facturas?.numero_factura ?? a.cxc_saldos_iniciales?.numero ?? String(a.factura_id ?? a.saldo_inicial_id),
        amount: num(a.monto)
      }))
    }));
  }

  async getCreditNotes(invoiceIds: number[]): Promise<StatementCreditNote[]> {
    if (!invoiceIds.length) return [];
    const { data, error } = await this.supabase.client
      .from('notas_credito')
      .select('factura_afectada_id, numero_nota, fecha_emision, total, estado_dgii')
      .in('factura_afectada_id', invoiceIds);
    if (error) throw error;
    return (data ?? [])
      .filter((row: any) => !/rechaz/i.test(row.estado_dgii ?? ''))
      .map((row: any) => ({ invoiceId: Number(row.factura_afectada_id), number: row.numero_nota, date: row.fecha_emision, total: num(row.total) }));
  }

  async createReceipt(receipt: NewReceipt): Promise<{ id: number; number: string }> {
    const { data, error } = await this.supabase.client.rpc('crear_recibo_cobro', {
      p_recibo: {
        customerId: receipt.customerId,
        date: receipt.date,
        paymentCode: receipt.paymentCode,
        reference: receipt.reference,
        notes: receipt.notes
      },
      p_aplicaciones: receipt.applications
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { id: Number(row.id), number: row.numero_recibo };
  }

  async voidReceipt(id: number, reason: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('anular_recibo_cobro', { p_recibo_id: id, p_motivo: reason });
    if (error) throw error;
  }
}
