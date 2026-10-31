import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type DeliveryNoteOrigin = 'Orden de venta' | 'Factura';
export type DeliveryNoteStatus = 'Despachado' | 'Entregado' | 'Anulado';

/** Línea del documento de origen con lo que queda por despachar. */
export interface DeliverySourceLine {
  lineaId: number;
  productoId: number | null;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: number;
  despachado: number;
  pendiente: number;
}

/** Orden de venta o factura de la que sale el conduce. */
export interface DeliverySourceDocument {
  origen: DeliveryNoteOrigin;
  id: number;
  numero: string;
  fecha: string;
  ncf: string | null;
  clienteId: number | null;
  cliente: string;
  rnc: string | null;
  telefono: string | null;
  direccion: string | null;
  estado: string;
  lineas: DeliverySourceLine[];
}

export interface DeliveryNoteRow {
  id: number;
  numero: string;
  fecha: string;
  origen_tipo: DeliveryNoteOrigin;
  orden_id: number | null;
  factura_id: number | null;
  numero_origen: string;
  cliente_id: number | null;
  cliente_nombre: string;
  cliente_rnc: string | null;
  cliente_telefono: string | null;
  direccion_entrega: string | null;
  chofer: string | null;
  vehiculo: string | null;
  notas: string | null;
  estado: DeliveryNoteStatus;
  usuario_nombre: string | null;
  entregado_en: string | null;
  recibido_por: string | null;
  anulado_en: string | null;
  anulado_por: string | null;
  motivo_anulacion: string | null;
  creado_en: string;
}

export interface DeliveryNoteLineRow {
  id: number;
  linea_origen_id: number;
  producto_id: number | null;
  codigo_producto: string | null;
  descripcion: string;
  unidad: string | null;
  cantidad_documento: number;
  cantidad: number;
}

export interface DeliveryNoteDetail extends DeliveryNoteRow {
  lineas: DeliveryNoteLineRow[];
}

export interface DeliveryNoteSaveData {
  origen: DeliveryNoteOrigin;
  documentoId: number;
  fecha: string;
  direccion: string;
  chofer: string;
  vehiculo: string;
  notas: string;
  lineas: { lineaId: number; cantidad: number }[];
}

const NOTE_COLUMNS = 'id, numero, fecha, origen_tipo, orden_id, factura_id, numero_origen, cliente_id, cliente_nombre, cliente_rnc, cliente_telefono, direccion_entrega, chofer, vehiculo, notas, estado, usuario_nombre, entregado_en, recibido_por, anulado_en, anulado_por, motivo_anulacion, creado_en';

@Injectable({ providedIn: 'root' })
export class DeliveryNotesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Busca la orden o factura (por id o por número) con lo pendiente por despachar. */
  async getSourceDocument(origin: DeliveryNoteOrigin, id: number | null, number: string | null = null): Promise<DeliverySourceDocument> {
    const { data, error } = await this.supabase.client.rpc('conduce_documento', { p_origen: origin, p_id: id, p_numero: number });
    if (error) throw error;
    const doc = data as DeliverySourceDocument;
    doc.lineas = (doc.lineas ?? []).map((line) => ({
      ...line,
      cantidad: Number(line.cantidad ?? 0),
      despachado: Number(line.despachado ?? 0),
      pendiente: Number(line.pendiente ?? 0)
    }));
    return doc;
  }

  async create(note: DeliveryNoteSaveData): Promise<{ id: number; numero: string }> {
    const { lineas, ...header } = note;
    const { data, error } = await this.supabase.client.rpc('crear_conduce', { p_conduce: header, p_detalles: lineas });
    if (error) throw error;
    return (Array.isArray(data) ? data[0] : data) as { id: number; numero: string };
  }

  async list(from: string | null, to: string | null): Promise<DeliveryNoteRow[]> {
    let query = this.supabase.client.from('conduces').select(NOTE_COLUMNS).order('id', { ascending: false }).limit(1000);
    if (from) query = query.gte('fecha', from);
    if (to) query = query.lte('fecha', to);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as DeliveryNoteRow[];
  }

  async get(id: number): Promise<DeliveryNoteDetail> {
    const [{ data, error }, { data: lines, error: linesError }] = await Promise.all([
      this.supabase.client.from('conduces').select(NOTE_COLUMNS).eq('id', id).single(),
      this.supabase.client.from('conduce_detalles')
        .select('id, linea_origen_id, producto_id, codigo_producto, descripcion, unidad, cantidad_documento, cantidad')
        .eq('conduce_id', id).order('id')
    ]);
    if (error) throw error;
    if (linesError) throw linesError;
    return {
      ...(data as DeliveryNoteRow),
      lineas: ((lines ?? []) as DeliveryNoteLineRow[]).map((line) => ({ ...line, cantidad: Number(line.cantidad), cantidad_documento: Number(line.cantidad_documento) }))
    };
  }

  async markDelivered(id: number, receivedBy: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('marcar_conduce_entregado', { p_id: id, p_recibido_por: receivedBy });
    if (error) throw error;
  }

  async cancel(id: number, reason: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('anular_conduce', { p_id: id, p_motivo: reason });
    if (error) throw error;
  }

  async markPrinted(id: number): Promise<void> {
    await this.supabase.client.from('conduces').update({ impreso_en: new Date().toISOString() }).eq('id', id);
  }
}
