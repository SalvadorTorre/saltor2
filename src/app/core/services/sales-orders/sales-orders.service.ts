import { Injectable } from '@angular/core';
import { InvoiceLine } from '../../../app.models';
import { EditableInvoiceData, InvoiceRow, InvoiceSaveData } from '../invoices/invoices.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface SalesOrderHeaderRow {
  id: number;
  numero_orden: string;
  numero_cotizacion: string | null;
  cliente_id: number | null;
  cliente_nombre: string;
  cliente_rnc: string | null;
  cliente_telefono: string | null;
  cliente_correo: string | null;
  cliente_direccion: string | null;
  cliente_ciudad: string | null;
  fecha_orden: string;
  condicion_pago: string;
  forma_pago_codigo: number | null;
  notas: string | null;
  subtotal: number | string;
  itbis: number | string;
  total: number | string;
  estado: string;
  creado_en?: string;
}

interface SalesOrderDetailRow {
  id: number;
  producto_id: number | null;
  descripcion: string;
  cantidad: number | string;
  precio_unitario: number | string;
  tasa_itbis: number | string;
  monto_itbis: number | string;
  total_linea: number | string;
}

@Injectable({ providedIn: 'root' })
export class SalesOrdersService {
  constructor(private readonly supabase: SupabaseService) {}

  async createOrder(order: InvoiceSaveData & { quotationNumber?: string }): Promise<InvoiceRow> {
    const { data, error } = await this.supabase.client.rpc('crear_orden_venta', {
      p_orden: order,
      p_detalles: order.lines
    });
    if (error) throw error;

    const saved = (Array.isArray(data) ? data[0] : data) as { id: number; numero_orden: string };
    if (order.quotationNumber) {
      const { error: linkError } = await this.supabase.client.rpc('vincular_orden_cotizacion', { p_orden_id: saved.id, p_numero_cotizacion: order.quotationNumber });
      if (linkError) throw linkError;
    }
    return { id: saved.id, numero_factura: saved.numero_orden, dgii_estado: 'No enviado' };
  }

  async getOrders(): Promise<SalesOrderHeaderRow[]> {
    const { data, error } = await this.supabase.client
      .from('ordenventa')
      .select('id, numero_orden, numero_cotizacion, cliente_id, cliente_nombre, cliente_rnc, cliente_telefono, cliente_correo, cliente_direccion, cliente_ciudad, fecha_orden, condicion_pago, forma_pago_codigo, notas, subtotal, itbis, total, estado, creado_en')
      .order('id', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SalesOrderHeaderRow[];
  }

  async updateOrder(orderId: number, order: InvoiceSaveData): Promise<InvoiceRow> {
    const header = this.toHeaderPayload(order);
    const { data, error } = await this.supabase.client
      .from('ordenventa')
      .update({ ...header, actualizado_en: new Date().toISOString() })
      .eq('id', orderId)
      .select('id, numero_orden')
      .single();
    if (error) throw error;

    const { error: removeError } = await this.supabase.client.from('ordenventa_detalle').delete().eq('ordenventa_id', orderId);
    if (removeError) throw removeError;
    const details = order.lines
      .filter((line) => line.productId && line.quantity > 0)
      .map((line) => ({
        ordenventa_id: orderId, producto_id: line.productId, codigo_producto: (line as InvoiceLine & { productCode?: string }).productCode ?? null,
        descripcion: line.description, cantidad: line.quantity, precio_unitario: line.unitPrice,
        tasa_itbis: line.taxRate, monto_itbis: line.taxAmount, total_linea: line.lineTotal
      }));
    const { error: detailsError } = await this.supabase.client.from('ordenventa_detalle').insert(details);
    if (detailsError) throw detailsError;
    return { id: data.id, numero_factura: data.numero_orden, dgii_estado: 'No enviado' };
  }

  async deleteOrder(orderId: number): Promise<void> {
    const { error } = await this.supabase.client.from('ordenventa').delete().eq('id', orderId);
    if (error) throw error;
  }

  async getOrderForEditing(orderId: number): Promise<EditableInvoiceData> {
    const { data: order, error: orderError } = await this.supabase.client
      .from('ordenventa')
      .select('id, numero_orden, cliente_id, cliente_nombre, cliente_rnc, cliente_telefono, cliente_correo, cliente_direccion, cliente_ciudad, fecha_orden, condicion_pago, forma_pago_codigo, notas, subtotal, itbis, total')
      .eq('id', orderId)
      .single();
    if (orderError) throw orderError;

    const { data: details, error: detailsError } = await this.supabase.client
      .from('ordenventa_detalle')
      .select('id, producto_id, descripcion, cantidad, precio_unitario, tasa_itbis, monto_itbis, total_linea')
      .eq('ordenventa_id', orderId)
      .order('id');
    if (detailsError) throw detailsError;

    const header = order as SalesOrderHeaderRow;
    return {
      id: header.id,
      number: header.numero_orden,
      dgiiTrackId: '',
      dgiiCode: '',
      dgiiMessage: '',
      dgiiSentAt: '',
      securityCode: '',
      qrLink: '',
      dgiiResponse: null,
      customerId: header.cliente_id,
      customerName: header.cliente_nombre ?? '',
      rnc: header.cliente_rnc ?? '',
      customerPhone: header.cliente_telefono ?? '',
      customerEmail: header.cliente_correo ?? '',
      customerAddress: header.cliente_direccion ?? '',
      customerCity: header.cliente_ciudad ?? '',
      invoiceDate: header.fecha_orden,
      ncfType: '',
      ncf: '',
      paymentMethod: header.condicion_pago === 'Credito' ? 'Credito' : 'Contado',
      paymentMethodCode: Number(header.forma_pago_codigo ?? (header.condicion_pago === 'Credito' ? 4 : 1)),
      notes: header.notas ?? '',
      subtotal: Number(header.subtotal ?? 0),
      taxTotal: Number(header.itbis ?? 0),
      grandTotal: Number(header.total ?? 0),
      lines: ((details ?? []) as SalesOrderDetailRow[]).map((detail) => this.toLine(detail))
    };
  }

  async markOrderPrinted(orderId: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('ordenventa')
      .update({ impreso_en: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw error;
  }

  private toHeaderPayload(order: InvoiceSaveData) {
    return {
      cliente_id: order.customerId, cliente_nombre: order.customerName || 'Cliente contado', cliente_rnc: order.rnc || null,
      cliente_telefono: order.customerPhone || null, cliente_correo: order.customerEmail || null,
      cliente_direccion: order.customerAddress || null, cliente_ciudad: order.customerCity || null,
      fecha_orden: order.invoiceDate, condicion_pago: order.paymentMethod === 'Credito' ? 'Credito' : 'Contado',
      forma_pago_codigo: order.paymentMethodCode, notas: order.notes || null,
      subtotal: order.subtotal, itbis: order.taxTotal, total: order.grandTotal
    };
  }

  private toLine(detail: SalesOrderDetailRow): InvoiceLine & { productCode: string } {
    return {
      id: detail.id,
      productId: detail.producto_id,
      description: detail.descripcion,
      quantity: Number(detail.cantidad),
      unitPrice: Number(detail.precio_unitario),
      taxRate: Number(detail.tasa_itbis),
      taxAmount: Number(detail.monto_itbis),
      lineTotal: Number(detail.total_linea),
      productCode: ''
    };
  }
}
