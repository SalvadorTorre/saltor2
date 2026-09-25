import { Injectable } from '@angular/core';
import { InvoiceLine } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

export interface InvoiceSaveData {
  customerId: number | null;
  customerName: string;
  rnc: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  customerCity: string;
  invoiceDate: string;
  ncfType: string;
  ncf: string;
  paymentMethod: 'Contado' | 'Credito';
  paymentMethodCode: number;
  notes: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  lines: Array<InvoiceLine & { productCode: string }>;
}

export type DgiiInvoiceStatus =
  | 'No enviado'
  | 'Pendiente de configuración'
  | 'Enviado'
  | 'Aceptado'
  | 'Rechazado'
  | 'Error';

export interface InvoiceRow {
  id: number;
  numero_factura: string;
  ncf?: string | null;
  dgii_estado?: DgiiInvoiceStatus;
  dgii_track_id?: string | null;
  dgii_codigo_respuesta?: string | null;
  dgii_mensaje_respuesta?: string | null;
  dgii_enviado_en?: string | null;
  impreso_en?: string | null;
}

export interface EditableInvoiceData extends InvoiceSaveData {
  id: number;
  number: string;
  dgiiTrackId: string;
  dgiiCode: string;
  dgiiMessage: string;
  dgiiSentAt: string;
  dgiiResponse: unknown;
}

interface InvoiceConsultationDatabaseRow {
  id: number;
  numero_factura: string;
  fecha_factura: string;
  cliente_nombre: string;
  ncf: string | null;
  total: number | string;
  dgii_estado: DgiiInvoiceStatus | null;
  dgii_mensaje_respuesta: string | null;
  estado?: string | null;
}

interface InvoiceDetailDatabaseRow {
  id: number;
  producto_id: number;
  descripcion: string;
  cantidad: number | string;
  precio_unitario: number | string;
  tasa_itbis: number | string;
  monto_itbis: number | string;
  total_linea: number | string;
}

@Injectable({ providedIn: 'root' })
export class InvoicesService {
  constructor(private readonly supabase: SupabaseService) {}

  async createInvoice(invoice: InvoiceSaveData): Promise<InvoiceRow> {
    const { data, error } = await this.supabase.client.rpc('crear_factura', {
      p_factura: invoice,
      p_detalles: invoice.lines
    });

    if (error) {
      throw error;
    }

    const savedInvoice = (Array.isArray(data) ? data[0] : data) as InvoiceRow;
    const { error: paymentError } = await this.supabase.client.from('facturas')
      .update({ forma_pago_codigo: invoice.paymentMethodCode }).eq('id', savedInvoice.id);
    if (paymentError) throw paymentError;
    return savedInvoice;
  }

  async updateInvoice(invoiceId: number, invoice: InvoiceSaveData): Promise<InvoiceRow> {
    const { data, error } = await this.supabase.client.rpc('actualizar_factura', {
      p_factura_id: invoiceId,
      p_factura: invoice,
      p_detalles: invoice.lines
    });
    if (error) throw error;
    const savedInvoice = (Array.isArray(data) ? data[0] : data) as InvoiceRow;
    const { error: paymentError } = await this.supabase.client.from('facturas')
      .update({ forma_pago_codigo: invoice.paymentMethodCode }).eq('id', savedInvoice.id);
    if (paymentError) throw paymentError;
    return savedInvoice;
  }

  async cancelInvoice(invoiceId: number): Promise<void> {
    const { error } = await this.supabase.client.rpc('anular_factura', { p_factura_id: invoiceId });
    if (error) throw error;
  }

  async getInvoiceForEditing(invoiceId: number): Promise<EditableInvoiceData> {
    const { data: invoice, error: invoiceError } = await this.supabase.client
      .from('facturas')
      .select('id, numero_factura, cliente_id, cliente_nombre, cliente_rnc, cliente_telefono, cliente_correo, cliente_direccion, cliente_ciudad, fecha_factura, tipo_ncf, ncf, condicion_pago, forma_pago_codigo, notas, subtotal, itbis, total, dgii_track_id, dgii_codigo_respuesta, dgii_mensaje_respuesta, dgii_enviado_en, dgii_respuesta')
      .eq('id', invoiceId)
      .single();
    if (invoiceError) throw invoiceError;

    const { data: details, error: detailsError } = await this.supabase.client
      .from('factura_detalles')
      .select('id, producto_id, descripcion, cantidad, precio_unitario, tasa_itbis, monto_itbis, total_linea')
      .eq('factura_id', invoiceId)
      .order('id');
    if (detailsError) throw detailsError;

    return {
      id: invoice.id,
      number: invoice.numero_factura,
      dgiiTrackId: invoice.dgii_track_id ?? '',
      dgiiCode: invoice.dgii_codigo_respuesta ?? '',
      dgiiMessage: invoice.dgii_mensaje_respuesta ?? '',
      dgiiSentAt: invoice.dgii_enviado_en ?? '',
      dgiiResponse: invoice.dgii_respuesta ?? null,
      customerId: invoice.cliente_id,
      customerName: invoice.cliente_nombre ?? '',
      rnc: invoice.cliente_rnc ?? '',
      customerPhone: invoice.cliente_telefono ?? '',
      customerEmail: invoice.cliente_correo ?? '',
      customerAddress: invoice.cliente_direccion ?? '',
      customerCity: invoice.cliente_ciudad ?? '',
      invoiceDate: invoice.fecha_factura,
      ncfType: invoice.tipo_ncf ?? '',
      ncf: invoice.ncf ?? '',
      paymentMethod: invoice.condicion_pago === 'Credito' ? 'Credito' : 'Contado',
      paymentMethodCode: Number(invoice.forma_pago_codigo ?? (invoice.condicion_pago === 'Credito' ? 4 : 1)),
      notes: invoice.notas ?? '',
      subtotal: Number(invoice.subtotal),
      taxTotal: Number(invoice.itbis),
      grandTotal: Number(invoice.total),
      lines: ((details ?? []) as InvoiceDetailDatabaseRow[]).map((detail) => ({
        id: detail.id,
        productId: detail.producto_id,
        description: detail.descripcion,
        quantity: Number(detail.cantidad),
        unitPrice: Number(detail.precio_unitario),
        taxRate: Number(detail.tasa_itbis),
        taxAmount: Number(detail.monto_itbis),
        lineTotal: Number(detail.total_linea),
        productCode: ''
      }))
    };
  }

  async markInvoicePrinted(invoiceId: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('facturas')
      .update({ impreso_en: new Date().toISOString() })
      .eq('id', invoiceId);

    if (error) {
      throw error;
    }
  }

  async getInvoices(): Promise<Array<{
    id: number;
    number: string;
    date: string;
    customer: string;
    ncf: string;
    total: number;
    status: string;
    dgiiStatus: DgiiInvoiceStatus;
    dgiiMessage: string;
  }>> {
    const { data, error } = await this.supabase.client
      .from('facturas')
      .select('id, numero_factura, fecha_factura, cliente_nombre, ncf, total, estado, dgii_estado, dgii_mensaje_respuesta')
      .order('id', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: InvoiceConsultationDatabaseRow) => ({
      id: row.id,
      number: row.numero_factura,
      date: row.fecha_factura,
      customer: row.cliente_nombre,
      ncf: row.ncf ?? '',
      total: Number(row.total),
      status: row.estado ?? 'Activa',
      dgiiStatus: row.dgii_estado ?? 'No enviado',
      dgiiMessage: row.dgii_mensaje_respuesta ?? ''
    }));
  }
}
