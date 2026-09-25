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

interface Rep607DatabaseRow {
  id: number;
  numero_factura: string;
  fecha_factura: string;
  fechanf: string | null;
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
      .select('id, numero_factura, fecha_factura, fechanf, tipo_ncf, ncf, cliente_nombre, total, estado_dgii, dgii_estado, dgii_mensaje_respuesta, dgii_track_id, dgii_codigo, dgii_codigo_respuesta, dgii_response_json, dgii_respuesta, dgii_response_raw, dgii_mensajes, dgii_error_message, codSeguridad, qr_link, idsucursal')
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
    if (filters.from) query = query.gte('fechanf', filters.from);
    if (filters.to) query = query.lte('fechanf', `${filters.to}T23:59:59.999`);

    const { data, error } = await query;
    if (error) throw error;

    return ((data ?? []) as Rep607DatabaseRow[])
      .map((row) => ({
        id: row.id,
        number: row.numero_factura,
        date: row.fechanf ?? row.fecha_factura,
        sentAt: row.fechanf ?? '',
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
      .filter((invoice) => !['No enviado', 'Pendiente de configuración'].includes(invoice.status));
  }

  async getPendingInvoices(companyId: number, filters: Pick<Rep607Filters, 'branchId' | 'invoice' | 'from' | 'to'>): Promise<PendingInvoice[]> {
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
      .filter((invoice) => ['No enviado', 'Pendiente de configuración', 'Error', 'Rechazado'].includes(invoice.status));
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
      .eq('id', invoiceId);
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
