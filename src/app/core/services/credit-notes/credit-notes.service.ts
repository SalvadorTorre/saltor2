import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreditNoteLineSaveData { description: string; quantity: number; price: number; discount: number; itbis: number; taxAmount: number; lineTotal: number; }
export interface CreditNoteSaveData {
  invoiceId: number | null; invoice: string; encfAffected: string; affectedDate: string; rnc: string; customer: string; email: string; address: string;
  noteEncf: string; date: string; expiry: string; modificationCode: string; incomeType: string; payment: string;
  reason: string; internalNotes: string; subtotal: number; discounts: number; itbis: number; total: number; lines: CreditNoteLineSaveData[];
}
export interface CreditNoteRecord { id: number; number: string; invoice: string; encf: string; noteEncf: string; customer: string; date: string; amount: number; status: string; }
export interface CreditInvoiceData {
  id: number; number: string; encf: string; date: string; rnc: string; customer: string; email: string; address: string; payment: string;
  lines: Array<{ description: string; quantity: number; price: number; itbis: number }>;
}
export interface CreditNoteDetail {
  id: number; number: string; invoiceId: number | null; invoice: string; encfAffected: string; noteEncf: string; affectedDate: string; date: string; expiry: string;
  rnc: string; customer: string; email: string; address: string; modificationCode: string; incomeType: string; payment: string; reason: string; internalNotes: string;
  subtotal: number; discounts: number; itbis: number; total: number; status: string; trackId: string; securityCode: string; dgiiCode: string; dgiiMessage: string; dgiiMessages: unknown; dgiiResponse: unknown; dgiiResponseRaw: string; dgiiError: string;
  lines: CreditNoteLineSaveData[];
}
interface CreditNoteRow { id: number; numero_nota: string; numero_factura_afectada: string; encf_afectado: string; encf_nota: string | null; cliente_nombre: string | null; fecha_emision: string; total: number | string; estado_dgii: string; }

@Injectable({ providedIn: 'root' })
export class CreditNotesService {
  constructor(private readonly supabase: SupabaseService) {}

  async createCreditNote(note: CreditNoteSaveData): Promise<{ id: number; number: string }> {
    const { data, error } = await this.supabase.client.rpc('crear_nota_credito', {
      p_nota: { invoiceId: note.invoiceId, invoice: note.invoice, encfAffected: note.encfAffected, affectedDate: note.affectedDate, rnc: note.rnc, customer: note.customer, email: note.email, address: note.address, noteEncf: note.noteEncf, date: note.date, expiry: note.expiry, modificationCode: note.modificationCode, incomeType: note.incomeType, payment: note.payment, reason: note.reason, internalNotes: note.internalNotes, subtotal: note.subtotal, discounts: note.discounts, itbis: note.itbis, total: note.total },
      p_detalles: note.lines
    });
    if (error) throw error;
    const saved = (Array.isArray(data) ? data[0] : data) as { id: number; numero_nota: string };
    return { id: Number(saved.id), number: saved.numero_nota };
  }

  async getCreditNotes(): Promise<CreditNoteRecord[]> {
    const { data, error } = await this.supabase.client.from('notas_credito')
      .select('id, numero_nota, numero_factura_afectada, encf_afectado, encf_nota, cliente_nombre, fecha_emision, total, estado_dgii')
      .order('id', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as CreditNoteRow[]).map((row) => ({ id: row.id, number: row.numero_nota, invoice: row.numero_factura_afectada, encf: row.encf_afectado, noteEncf: row.encf_nota ?? '', customer: row.cliente_nombre ?? 'CLIENTE CONTADO', date: row.fecha_emision, amount: Number(row.total), status: row.estado_dgii ?? 'Sin enviar' }));
  }

  async resetCreditNoteEcf(noteId: number): Promise<void> {
    const { data, error } = await this.supabase.client.from('notas_credito').update({
      encf_nota: null,
      estado_dgii: 'Sin enviar',
      estado_envio_dgii: 'Sin enviar',
      dgii_track_id: null,
      dgii_codigo_seguridad: null,
      dgii_codigo: null,
      dgii_mensaje_respuesta: null,
      dgii_mensajes: null,
      dgii_request_json: null,
      dgii_response_json: null,
      dgii_response_raw: null,
      dgii_error_message: null,
      dgii_enviado_en: null,
      dgii_updated_at: new Date().toISOString(),
      qr_link: null,
      fec_firma: null
    }).eq('id', noteId).eq('estado_dgii', 'Rechazado').select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La nota ya no está rechazada o no se encontró. Actualiza la lista e inténtalo de nuevo.');
  }

  async updateCreditNote(noteId: number, note: CreditNoteSaveData): Promise<{ id: number; number: string }> {
    const { data, error } = await this.supabase.client.rpc('actualizar_nota_credito', {
      p_nota_id: noteId,
      p_nota: { invoiceId: note.invoiceId, invoice: note.invoice, encfAffected: note.encfAffected, affectedDate: note.affectedDate, rnc: note.rnc, customer: note.customer, email: note.email, address: note.address, date: note.date, expiry: note.expiry, modificationCode: note.modificationCode, incomeType: note.incomeType, payment: note.payment, reason: note.reason, internalNotes: note.internalNotes, subtotal: note.subtotal, discounts: note.discounts, itbis: note.itbis, total: note.total },
      p_detalles: note.lines
    });
    if (error) throw error;
    const saved = (Array.isArray(data) ? data[0] : data) as { id: number; numero_nota: string };
    return { id: Number(saved.id), number: saved.numero_nota };
  }

  async getCreditNoteById(noteId: number): Promise<CreditNoteDetail | null> {
    const { data: note, error } = await this.supabase.client.from('notas_credito').select('id, numero_nota, factura_afectada_id, numero_factura_afectada, encf_afectado, encf_nota, fecha_comprobante_afectado, fecha_emision, fecha_vencimiento_secuencia, cliente_rnc, cliente_nombre, cliente_correo, cliente_direccion, codigo_modificacion, tipo_ingreso, forma_pago, motivo, notas_internas, subtotal, descuentos, itbis, total, estado_dgii, dgii_track_id, dgii_codigo_seguridad, dgii_codigo, dgii_mensaje_respuesta, dgii_mensajes, dgii_response_json, dgii_response_raw, dgii_error_message').eq('id', noteId).maybeSingle();
    if (error) throw error;
    if (!note) return null;
    const { data: details, error: detailsError } = await this.supabase.client.from('nota_credito_detalles').select('descripcion, cantidad, precio_unitario, descuento_porcentaje, tasa_itbis, monto_itbis, total_linea').eq('nota_credito_id', noteId).order('id');
    if (detailsError) throw detailsError;
    return {
      id: Number(note.id), number: note.numero_nota, invoiceId: note.factura_afectada_id ? Number(note.factura_afectada_id) : null, invoice: note.numero_factura_afectada, encfAffected: note.encf_afectado, noteEncf: note.encf_nota ?? '', affectedDate: note.fecha_comprobante_afectado ?? '', date: note.fecha_emision, expiry: note.fecha_vencimiento_secuencia ?? '', rnc: note.cliente_rnc ?? '', customer: note.cliente_nombre ?? 'CLIENTE CONTADO', email: note.cliente_correo ?? '', address: note.cliente_direccion ?? '', modificationCode: note.codigo_modificacion, incomeType: note.tipo_ingreso, payment: note.forma_pago, reason: note.motivo, internalNotes: note.notas_internas ?? '', subtotal: Number(note.subtotal ?? 0), discounts: Number(note.descuentos ?? 0), itbis: Number(note.itbis ?? 0), total: Number(note.total ?? 0), status: note.estado_dgii, trackId: note.dgii_track_id ?? '', securityCode: note.dgii_codigo_seguridad ?? '', dgiiCode: note.dgii_codigo ?? '', dgiiMessage: note.dgii_mensaje_respuesta ?? '', dgiiMessages: note.dgii_mensajes, dgiiResponse: note.dgii_response_json, dgiiResponseRaw: note.dgii_response_raw ?? '', dgiiError: note.dgii_error_message ?? '',
      lines: (details ?? []).map((line: { descripcion: string; cantidad: number | string; precio_unitario: number | string; descuento_porcentaje: number | string; tasa_itbis: number | string; monto_itbis: number | string; total_linea: number | string }) => ({ description: line.descripcion, quantity: Number(line.cantidad), price: Number(line.precio_unitario), discount: Number(line.descuento_porcentaje), itbis: Number(line.tasa_itbis), taxAmount: Number(line.monto_itbis), lineTotal: Number(line.total_linea) }))
    };
  }

  async getInvoiceByNumber(number: string): Promise<CreditInvoiceData | null> {
    const { data: invoice, error: invoiceError } = await this.supabase.client.from('facturas')
      .select('id, numero_factura, ncf, fecha_factura, cliente_rnc, cliente_nombre, cliente_correo, cliente_direccion, condicion_pago')
      .eq('numero_factura', number.trim()).maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) return null;

    const { data: details, error: detailsError } = await this.supabase.client.from('factura_detalles')
      .select('descripcion, cantidad, precio_unitario, tasa_itbis').eq('factura_id', invoice.id).order('id');
    if (detailsError) throw detailsError;
    return {
      id: Number(invoice.id), number: invoice.numero_factura, encf: invoice.ncf ?? '', date: invoice.fecha_factura,
      rnc: invoice.cliente_rnc ?? '', customer: invoice.cliente_nombre ?? '', email: invoice.cliente_correo ?? '',
      address: invoice.cliente_direccion ?? '', payment: invoice.condicion_pago ?? 'Contado',
      lines: (details ?? []).map((line: { descripcion: string; cantidad: number | string; precio_unitario: number | string; tasa_itbis: number | string }) => ({ description: line.descripcion, quantity: Number(line.cantidad), price: Number(line.precio_unitario), itbis: Number(line.tasa_itbis) }))
    };
  }
}
