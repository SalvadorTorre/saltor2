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
  | 'Preparando envío' | 'En cola' | 'Enviando DGII' | 'En proceso DGII' | 'Envío por confirmar' | 'Firmada' | 'Aceptado condicional'
  | 'Aceptado'
  | 'Rechazado'
  | 'Error';

export interface InvoiceRow {
  id: number;
  numero_factura: string;
  ecf_operation_id?: string | null;
  ecf_queue_status?: string | null;
  ecf_xml_firmado?: string | null;
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
  ecfOperationId?: string;
  ecfQueueStatus?: string;
  dgiiAttempts?: number;
  dgiiUpdatedAt?: string;
  ecfEnvironment?: string;
  dgiiTrackId: string;
  dgiiCode: string;
  dgiiMessage: string;
  dgiiSentAt: string;
  signatureDate?: string;
  signedXml?: string;
  securityCode: string;
  qrLink: string;
  dgiiResponse: unknown;
}

interface InvoiceConsultationDatabaseRow {
  id: number;
  numero_factura: string;
  fecha_factura: string;
  cliente_nombre: string;
  ncf: string | null;
  tipo_ncf: string | null;
  condicion_pago?: string | null;
  forma_pago_codigo?: number | string | null;
  total: number | string;
  dgii_estado: DgiiInvoiceStatus | null;
  dgii_mensaje_respuesta: string | null;
  ecf_operation_id?: string | null;
  ecf_queue_status?: string | null;
  dgii_intentos?: number | null;
  dgii_updated_at?: string | null;
  estado?: string | null;
  usuario_nombre?: string | null;
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

export interface PendingCollectionInvoice {
  id: number;
  number: string;
  date: string;
  createdAt: string;
  customerId: number | null;
  customerName: string;
  rnc: string;
  ncfType: string;
  condition: 'Contado' | 'Credito';
  subtotal: number;
  tax: number;
  total: number;
  seller: string;
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

  async cancelInvoice(invoiceId: number, cancellationType = 4, reason = ''): Promise<void> {
    const { error } = await this.supabase.client.rpc('anular_factura', {
      p_factura_id: invoiceId,
      p_tipo_anulacion: cancellationType,
      p_motivo: reason
    });
    if (error) throw error;
  }

  /** Facturas guardadas por los vendedores que esperan cobro en caja. */
  async getPendingCollection(branchId?: number | null): Promise<PendingCollectionInvoice[]> {
    let query = this.supabase.client.from('facturas')
      .select('id, numero_factura, fecha_factura, creado_en, cliente_id, cliente_nombre, cliente_rnc, tipo_ncf, condicion_pago, subtotal, itbis, total, usuario_nombre, idsucursal')
      .eq('estado', 'Pendiente de cobro').order('creado_en', { ascending: true }).limit(300);
    if (branchId) query = query.eq('idsucursal', branchId);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r['id']), number: String(r['numero_factura'] ?? ''), date: String(r['fecha_factura'] ?? ''), createdAt: String(r['creado_en'] ?? ''),
      customerId: (r['cliente_id'] as number | null) ?? null, customerName: String(r['cliente_nombre'] ?? ''), rnc: String(r['cliente_rnc'] ?? ''),
      ncfType: String(r['tipo_ncf'] ?? ''), condition: r['condicion_pago'] === 'Credito' ? 'Credito' : 'Contado',
      subtotal: Number(r['subtotal'] ?? 0), tax: Number(r['itbis'] ?? 0), total: Number(r['total'] ?? 0), seller: String(r['usuario_nombre'] ?? '')
    }));
  }

  /** La cajera cobra: la factura pasa a Emitida con la forma de pago elegida. */
  async collectInvoice(invoiceId: number, paymentMethodCode: number): Promise<{ id: number; numero_factura: string; tipo_ncf: string }> {
    const { data, error } = await this.supabase.client.rpc('cobrar_factura_caja_proforma', { p_factura_id: invoiceId, p_forma_pago_codigo: paymentMethodCode });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id || !row.tipo_ncf) throw new Error('El cobro no devolvió el tipo de comprobante guardado. Consulta la factura antes de continuar.');
    return row;
  }

  async getInvoiceForEditing(invoiceId: number): Promise<EditableInvoiceData> {
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) {
      throw new Error('No se recibió un identificador válido para consultar la factura.');
    }

    const { data: invoice, error: invoiceError } = await this.supabase.client
      .from('facturas')
      .select('id, numero_factura, cliente_id, cliente_nombre, cliente_rnc, cliente_telefono, cliente_correo, cliente_direccion, cliente_ciudad, fecha_factura, tipo_ncf, ncf, condicion_pago, forma_pago_codigo, notas, subtotal, itbis, total, ecf_operation_id, ecf_queue_status, ecf_ambiente, dgii_intentos, dgii_updated_at, dgii_track_id, dgii_codigo_respuesta, dgii_mensaje_respuesta, dgii_enviado_en, dgii_respuesta, codSeguridad, qr_link, fec_firma, ecf_xml_firmado')
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
      ecfOperationId: invoice.ecf_operation_id ?? '',
      ecfQueueStatus: invoice.ecf_queue_status ?? '',
      dgiiAttempts: Number(invoice.dgii_intentos ?? 0),
      dgiiUpdatedAt: invoice.dgii_updated_at ?? '',
      ecfEnvironment: invoice.ecf_ambiente ?? '',
      dgiiTrackId: invoice.dgii_track_id ?? '',
      dgiiCode: invoice.dgii_codigo_respuesta ?? '',
      dgiiMessage: invoice.dgii_mensaje_respuesta ?? '',
      dgiiSentAt: invoice.dgii_enviado_en ?? '',
      signatureDate: invoice.fec_firma ?? '',
      signedXml: invoice.ecf_xml_firmado ?? '',
      securityCode: invoice.codSeguridad ?? '',
      qrLink: invoice.qr_link ?? '',
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
    ncfType: string;
    paymentMethod: string;
    total: number;
    status: string;
    dgiiStatus: DgiiInvoiceStatus;
    dgiiMessage: string;
    operationId: string;
    queueStatus: string;
    attempts: number;
    updatedAt: string;
    seller: string;
  }>> {
    const { data, error } = await this.supabase.client
      .from('facturas')
      .select('id, numero_factura, fecha_factura, cliente_nombre, ncf, tipo_ncf, condicion_pago, forma_pago_codigo, total, estado, dgii_estado, dgii_mensaje_respuesta, ecf_operation_id, ecf_queue_status, dgii_intentos, dgii_updated_at, usuario_nombre')
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
      ncfType: row.tipo_ncf ?? '',
      paymentMethod: this.paymentMethodName(Number(row.forma_pago_codigo), row.condicion_pago),
      total: Number(row.total),
      status: row.estado ?? 'Activa',
      dgiiStatus: row.dgii_estado ?? 'No enviado',
      dgiiMessage: row.dgii_mensaje_respuesta ?? '',
      operationId: row.ecf_operation_id ?? '',
      queueStatus: row.ecf_queue_status ?? '',
      attempts: Number(row.dgii_intentos ?? 0),
      updatedAt: row.dgii_updated_at ?? '',
      seller: row.usuario_nombre ?? ''
    }));
  }

  private paymentMethodName(code: number, fallback: string | null | undefined): string {
    const names: Record<number, string> = {
      1: 'Efectivo',
      2: 'Depósito/transferencia',
      3: 'Tarjeta de crédito/débito',
      4: 'Crédito',
      5: 'Bonos',
      6: 'Permuta',
      7: 'Nota de crédito',
      8: 'Otras ventas'
    };
    return names[code] ?? (fallback === 'Credito' ? 'Crédito' : 'Efectivo');
  }
}
