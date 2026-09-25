import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface QuotationLine { code: string; description: string; quantity: number; price: number; itbis: number; total: number; }
export interface Quotation { id: number; number: string; date: string; validUntil: string; customer: string; rnc: string; phone: string; email: string; address: string; notes: string; subtotal: number; itbis: number; total: number; status: string; lines: QuotationLine[]; }

@Injectable({ providedIn: 'root' })
export class QuotationsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(): Promise<Quotation[]> {
    const { data, error } = await this.supabase.client.from('cotizaciones').select('id,numero_cotizacion,fecha,vigencia_hasta,cliente_nombre,cliente_rnc,cliente_telefono,cliente_correo,cliente_direccion,notas,subtotal,itbis,total,estado').order('id', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ id: Number(row.id), number: row.numero_cotizacion, date: row.fecha, validUntil: row.vigencia_hasta ?? '', customer: row.cliente_nombre, rnc: row.cliente_rnc ?? '', phone: row.cliente_telefono ?? '', email: row.cliente_correo ?? '', address: row.cliente_direccion ?? '', notes: row.notas ?? '', subtotal: Number(row.subtotal), itbis: Number(row.itbis), total: Number(row.total), status: row.estado, lines: [] }));
  }

  async get(id: number): Promise<Quotation | null> {
    const { data: row, error } = await this.supabase.client.from('cotizaciones').select('*').eq('id', id).maybeSingle();
    if (error || !row) { if (error) throw error; return null; }
    const { data: details, error: detailsError } = await this.supabase.client.from('cotizacion_detalles').select('*').eq('cotizacion_id', id).order('id');
    if (detailsError) throw detailsError;
    return { id: Number(row.id), number: row.numero_cotizacion, date: row.fecha, validUntil: row.vigencia_hasta ?? '', customer: row.cliente_nombre, rnc: row.cliente_rnc ?? '', phone: row.cliente_telefono ?? '', email: row.cliente_correo ?? '', address: row.cliente_direccion ?? '', notes: row.notas ?? '', subtotal: Number(row.subtotal), itbis: Number(row.itbis), total: Number(row.total), status: row.estado, lines: (details ?? []).map((line: any) => ({ code: line.codigo_producto ?? '', description: line.descripcion, quantity: Number(line.cantidad), price: Number(line.precio_unitario), itbis: Number(line.tasa_itbis), total: Number(line.total_linea) })) };
  }

  async create(quote: Omit<Quotation, 'id' | 'number' | 'status'>): Promise<{ id: number; number: string }> {
    const { data, error } = await this.supabase.client.rpc('crear_cotizacion', { p_cotizacion: { fecha: quote.date, vigenciaHasta: quote.validUntil, clienteNombre: quote.customer, clienteRnc: quote.rnc, clienteTelefono: quote.phone, clienteCorreo: quote.email, clienteDireccion: quote.address, notas: quote.notes, subtotal: quote.subtotal, itbis: quote.itbis, total: quote.total }, p_detalles: quote.lines.map((line) => ({ codigo: line.code, descripcion: line.description, cantidad: line.quantity, precio: line.price, itbis: line.itbis, total: line.total })) });
    if (error) throw error;
    const saved = Array.isArray(data) ? data[0] : data;
    return { id: Number(saved.id), number: saved.numero_cotizacion };
  }

  async update(id: number, quote: Omit<Quotation, 'id' | 'number' | 'status'>): Promise<void> {
    const header = { fecha: quote.date, vigencia_hasta: quote.validUntil || null, cliente_nombre: quote.customer, cliente_rnc: quote.rnc || null, cliente_telefono: quote.phone || null, cliente_correo: quote.email || null, cliente_direccion: quote.address || null, notas: quote.notes || null, subtotal: quote.subtotal, itbis: quote.itbis, total: quote.total };
    const { error: updateError } = await this.supabase.client.from('cotizaciones').update(header).eq('id', id);
    if (updateError) throw updateError;
    const { error: deleteError } = await this.supabase.client.from('cotizacion_detalles').delete().eq('cotizacion_id', id);
    if (deleteError) throw deleteError;
    const { error: insertError } = await this.supabase.client.from('cotizacion_detalles').insert(quote.lines.map((line) => ({ cotizacion_id: id, codigo_producto: line.code || null, descripcion: line.description, cantidad: line.quantity, precio_unitario: line.price, tasa_itbis: line.itbis, total_linea: line.total })));
    if (insertError) throw insertError;
  }
}
