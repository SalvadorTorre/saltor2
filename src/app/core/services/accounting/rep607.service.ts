import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface Rep607Filters {
  branchId: string;
  type: string;
  status: string;
  invoice: string;
  encf: string;
  from: string;
  to: string;
}

export interface Rep607Invoice {
  id: number;
  number: string;
  date: string;
  sentAt: string;
  type: string;
  encf: string;
  customer: string;
  total: number;
  status: string;
  message: string;
  securityCode: string;
  qrLink: string;
  trackId: string;
  code: string;
  response: unknown;
  responseRaw: string;
  messages: unknown;
  errorMessage: string;
  branchId: number | null;
}

export interface PendingInvoice {
  id: number;
  number: string;
  date: string;
  customer: string;
  type: string;
  ncf: string;
  paymentMethod: string;
  total: number;
  status: string;
  branchId: number | null;
}

export type PendingInvoiceView = 'pending' | 'proforma';

export interface ProformaPeriodSummary {
  period: string;
  from: string;
  to: string;
  invoices: number;
  billedTotal: number;
  proformas: number;
  proformaTotal: number;
  deliveryNotes: number;
  deliveryNoteTotal: number;
  total: number;
}

export interface ProformaPeriodCandidate {
  id: number;
  number: string;
  date: string;
  total: number;
}

interface Rep607DatabaseRow {
  id: number;
  numero_factura: string;
  fecha_factura: string;
  fec_firma: string | null;
  dgii_enviado_en: string | null;
  tipo_ncf: string | null;
  ncf: string | null;
  cliente_nombre: string | null;
  total: number | string;
  estado_dgii: string | null;
  dgii_estado: string | null;
  dgii_mensaje_respuesta: string | null;
  dgii_track_id: string | null;
  dgii_codigo: string | null;
  dgii_codigo_respuesta: string | null;
  dgii_response_json: unknown;
  dgii_respuesta: unknown;
  dgii_response_raw: string | null;
  dgii_mensajes: unknown;
  dgii_error_message: string | null;
  codSeguridad: string | null;
  qr_link: string | null;
  idsucursal: number | null;
}

@Injectable({ providedIn: 'root' })
export class Rep607Service {
  constructor(private readonly supabase: SupabaseService) {}

  async getInvoices(companyId: number, filters: Rep607Filters): Promise<Rep607Invoice[]> {
    let query = this.supabase.client
      .from('facturas')
      .select('id, numero_factura, fecha_factura, fec_firma, dgii_enviado_en, tipo_ncf, ncf, cliente_nombre, total, estado_dgii, dgii_estado, dgii_mensaje_respuesta, dgii_track_id, dgii_codigo, dgii_codigo_respuesta, dgii_response_json, dgii_respuesta, dgii_response_raw, dgii_mensajes, dgii_error_message, codSeguridad, qr_link, idsucursal')
      .eq('idempres', companyId)
      .order('fecha_factura', { ascending: false })
      .order('id', { ascending: false });

    if (filters.branchId !== 'Todas') query = query.eq('idsucursal', Number(filters.branchId));
    if (filters.type !== 'Todos') {
      const typeCode = filters.type.match(/^\d{2}/)?.[0] ?? filters.type;
      query = query.or(`tipo_ncf.ilike.${typeCode}%,tipo_ncf.ilike.E${typeCode}%`);
    }
    if (filters.status !== 'Todos') query = query.eq('estado_dgii', filters.status);
    if (filters.invoice.trim()) query = query.ilike('numero_factura', `%${filters.invoice.trim()}%`);
    if (filters.encf.trim()) query = query.ilike('ncf', `%${filters.encf.trim()}%`);
    if (filters.from) query = query.gte('fec_firma', filters.from);
    if (filters.to) query = query.lte('fec_firma', `${filters.to}T23:59:59.999`);

    const { data, error } = await query;
    if (error) throw error;

    return ((data ?? []) as Rep607DatabaseRow[])
      .map((row) => ({
        id: row.id,
        number: row.numero_factura,
        date: row.fec_firma ?? row.fecha_factura,
        sentAt: row.dgii_enviado_en ?? row.fec_firma ?? '',
        type: row.tipo_ncf ?? '',
        encf: row.ncf ?? '',
        customer: row.cliente_nombre ?? 'CLIENTE CONTADO',
        total: Number(row.total ?? 0),
        status: row.estado_dgii ?? row.dgii_estado ?? 'No enviado',
        message: row.dgii_mensaje_respuesta ?? '',
        securityCode: row.codSeguridad ?? '',
        qrLink: row.qr_link ?? '',
        trackId: row.dgii_track_id ?? '',
        code: row.dgii_codigo ?? row.dgii_codigo_respuesta ?? '',
        response: row.dgii_response_json ?? row.dgii_respuesta ?? null,
        responseRaw: row.dgii_response_raw ?? '',
        messages: row.dgii_mensajes ?? null,
        errorMessage: row.dgii_error_message ?? '',
        branchId: row.idsucursal
      }))
      .filter((invoice) => ['Aceptado', 'Rechazado', 'Aceptado condicional', 'Error'].includes(invoice.status));
  }

  async getPendingInvoices(
    companyId: number,
    filters: Pick<Rep607Filters, 'branchId' | 'invoice' | 'from' | 'to'>,
    view: PendingInvoiceView = 'pending'
  ): Promise<PendingInvoice[]> {
    let query = this.supabase.client
      .from('facturas')
      .select('id, numero_factura, fecha_factura, cliente_nombre, tipo_ncf, ncf, condicion_pago, total, estado_dgii, dgii_estado, idsucursal')
      .eq('idempres', companyId)
      .order('fecha_factura', { ascending: false })
      .order('id', { ascending: false });

    if (filters.branchId !== 'Todas') query = query.eq('idsucursal', Number(filters.branchId));
    if (filters.invoice.trim()) query = query.ilike('numero_factura', `%${filters.invoice.trim()}%`);
    if (filters.from) query = query.gte('fecha_factura', filters.from);
    if (filters.to) query = query.lte('fecha_factura', filters.to);
    if (view === 'proforma') {
      query = query.or('tipo_ncf.ilike.E332%,tipo_ncf.ilike.332%');
    }

    const { data, error } = await query;
    if (error) throw error;

    return ((data ?? []) as Array<Rep607DatabaseRow & { condicion_pago: string | null }>)
      .map((row) => ({
        id: row.id,
        number: row.numero_factura,
        date: row.fecha_factura,
        customer: row.cliente_nombre ?? 'CLIENTE CONTADO',
        type: row.tipo_ncf ?? '',
        ncf: row.ncf ?? '',
        paymentMethod: row.condicion_pago ?? 'Contado',
        total: Number(row.total ?? 0),
        status: row.estado_dgii ?? row.dgii_estado ?? 'No enviado',
        branchId: row.idsucursal
      }))
      .filter((invoice) => {
        const isProforma = /(?:^|\D)332(?:\D|$)/.test(invoice.type);
        if (view === 'proforma') return isProforma;
        return !isProforma && ['No enviado', 'Pendiente de configuración', 'Error', 'Rechazado', 'Preparando envío', 'En cola', 'Enviando DGII', 'En proceso DGII', 'Envío por confirmar'].includes(invoice.status);
      });
  }

  async getProformaPeriodSales(
    companyId: number,
    filters: Pick<Rep607Filters, 'branchId' | 'from' | 'to'>
  ): Promise<ProformaPeriodSummary[]> {
    let query = this.supabase.client
      .from('facturas')
      .select('fecha_factura, tipo_ncf, total, estado')
      .eq('idempres', companyId)
      .neq('estado', 'Anulada')
      .order('fecha_factura', { ascending: true });

    if (filters.branchId !== 'Todas') query = query.eq('idsucursal', Number(filters.branchId));
    if (filters.from) query = query.gte('fecha_factura', filters.from);
    if (filters.to) query = query.lte('fecha_factura', filters.to);

    const { data, error } = await query;
    if (error) throw error;

    const parseDate = (value: string) => new Date(`${value}T12:00:00`);
    const groups = new Map<string, ProformaPeriodSummary>();
    const format = (value: Date) => value.toISOString().slice(0, 10);
    const monthName = new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' });
    for (const row of (data ?? []) as Array<{ fecha_factura: string; tipo_ncf: string | null; total: number | string; estado: string | null }>) {
      const date = parseDate(row.fecha_factura);
      let key: string;
      let period: string;
      // Cada fila es un mes calendario; nunca se mezclan meses distintos.
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      period = monthName.format(date);
      const summary = groups.get(key) ?? {
        period, from: format(date), to: format(date), invoices: 0, billedTotal: 0, proformas: 0, proformaTotal: 0,
        deliveryNotes: 0, deliveryNoteTotal: 0, total: 0
      };
      if (format(date) < summary.from) summary.from = format(date);
      if (format(date) > summary.to) summary.to = format(date);
      const amount = Number(row.total ?? 0);
      const status = String(row.estado ?? '').trim().toUpperCase();
      summary.total += amount;
      if (status === 'PROFORMA') {
        summary.proformas += 1;
        summary.proformaTotal += amount;
      } else if (status === 'CONDUCE') {
        summary.deliveryNotes += 1;
        summary.deliveryNoteTotal += amount;
      } else if (status === 'FACTURA') {
        summary.invoices += 1;
        summary.billedTotal += amount;
      }
      groups.set(key, summary);
    }
    return [...groups.values()];
  }

  async getProformaCandidates(companyId: number, branchId: string, from: string, to: string): Promise<ProformaPeriodCandidate[]> {
    let query = this.supabase.client.from('facturas').select('id, numero_factura, fecha_factura, total')
      .eq('idempres', companyId).eq('estado', 'PROFORMA').gte('fecha_factura', from).lte('fecha_factura', to)
      .order('fecha_factura', { ascending: true }).order('id', { ascending: true });
    if (branchId !== 'Todas') query = query.eq('idsucursal', Number(branchId));
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: { id: number; numero_factura: string; fecha_factura: string; total: number | string }) => ({ id: row.id, number: row.numero_factura, date: row.fecha_factura, total: Number(row.total ?? 0) }));
  }

  async convertProformasToDeliveryNotes(from: string, to: string, branchId: string, amount: number): Promise<{ count: number; total: number; queuedCount: number; queuedTotal: number }> {
    const { data, error } = await this.supabase.client.rpc('convertir_proformas_a_conduce', {
      p_desde: from, p_hasta: to, p_sucursal_id: branchId === 'Todas' ? null : Number(branchId), p_monto: amount
    });
    if (error) throw error;
    return { count: Number(data?.cantidad ?? 0), total: Number(data?.monto ?? 0), queuedCount: Number(data?.facturas_pendientes ?? 0), queuedTotal: Number(data?.monto_pendiente ?? 0) };
  }

  async resetInvoiceEcf(invoiceId: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('facturas')
      .update({
        ncf: null,
        estado_dgii: 'No enviado',
        dgii_estado: 'No enviado',
        estado_envio_dgii: 'No enviado',
        dgii_track_id: null,
        dgii_codigo: null,
        dgii_codigo_respuesta: null,
        dgii_mensaje_respuesta: null,
        dgii_respuesta: null,
        dgii_response_json: null,
        dgii_response_raw: null,
        dgii_mensajes: null,
        dgii_error_message: null,
        qr_link: null,
        codSeguridad: null,
        fec_firma: null,
        fechanf: null,
        dgii_updated_at: new Date().toISOString()
      })
      .eq('id', invoiceId).in('dgii_estado', ['Rechazado', 'Error']);
    if (error) throw error;
  }

  async resetRejectedInvoiceEcf(invoiceId: number): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('facturas')
      .update({
        ncf: null,
        estado_dgii: 'No enviado',
        dgii_estado: 'No enviado',
        estado_envio_dgii: 'No enviado',
        dgii_track_id: null,
        dgii_codigo: null,
        dgii_codigo_respuesta: null,
        dgii_mensaje_respuesta: null,
        dgii_respuesta: null,
        dgii_response_json: null,
        dgii_response_raw: null,
        dgii_mensajes: null,
        dgii_error_message: null,
        qr_link: null,
        codSeguridad: null,
        fec_firma: null,
        fechanf: null,
        dgii_updated_at: new Date().toISOString()
      })
      .eq('id', invoiceId)
      .eq('estado_dgii', 'Rechazado')
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Solo se puede eliminar el e-CF de una factura rechazada.');
  }
}
