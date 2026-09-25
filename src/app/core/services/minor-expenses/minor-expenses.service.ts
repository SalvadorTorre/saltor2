import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type MinorExpenseStatus = 'Borrador' | 'Enviado' | 'Aceptado' | 'Aceptado condicional' | 'Rechazado' | 'Error';

export interface MinorExpenseRecord {
  id: number;
  voucher: string;
  date: string;
  supplier: string;
  rnc: string;
  supplierNcf: string;
  document: string;
  category: string;
  center: string;
  person: string;
  taxable: number;
  exempt: number;
  itbisRate: number;
  itbisAmount: number;
  total: number;
  payment: string;
  concept: string;
  notes: string;
  status: MinorExpenseStatus;
  trackId?: string;
  securityCode?: string;
  eNcf?: string;
  dgiiCode?: string;
  dgiiMessage?: string;
  dgiiError?: string;
  dgiiMessages?: unknown;
  dgiiResponse?: unknown;
  dgiiResponseRaw?: string;
}

export interface MinorExpenseSaveData {
  date: string;
  supplier: string;
  rnc: string;
  supplierNcf: string;
  document: string;
  category: string;
  center: string;
  person: string;
  taxable: number;
  exempt: number;
  itbisRate: number;
  itbisAmount: number;
  total: number;
  payment: string;
  concept: string;
  notes: string;
  status: MinorExpenseStatus;
}

@Injectable({ providedIn: 'root' })
export class MinorExpensesService {
  constructor(private readonly supabase: SupabaseService) {}

  async getCategories(): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('categorias_gastos')
      .select('descripcion')
      .eq('activo', true)
      .order('descripcion');
    if (error) throw error;
    return (data ?? []).map((row: { descripcion: string }) => row.descripcion);
  }

  async list(): Promise<MinorExpenseRecord[]> {
    const { data, error } = await this.supabase.client
      .from('gastos_menores')
      .select('id, numero_control, fecha, beneficiario, rnc_cedula, ncf_suplidor, documento_referencia, centro_costo, responsable, monto_gravado, monto_exento, tasa_itbis, monto_itbis, total, forma_pago, concepto, notas, estado_dgii, dgii_track_id, dgii_codigo_seguridad, dgii_codigo, dgii_mensaje_respuesta, dgii_error_message, dgii_mensajes, dgii_response_json, dgii_response_raw, encf, categorias_gastos(descripcion)')
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => this.fromRow(row));
  }

  async create(expense: MinorExpenseSaveData): Promise<MinorExpenseRecord> {
    const { data, error } = await this.supabase.client.rpc('crear_gasto_menor', {
      p_gasto: this.toPayload(expense)
    });
    if (error) throw error;
    const saved = Array.isArray(data) ? data[0] : data;
    return this.getById(Number(saved?.id));
  }

  async update(id: number, expense: MinorExpenseSaveData): Promise<MinorExpenseRecord> {
    const categoryId = await this.categoryId(expense.category);
    const { error } = await this.supabase.client
      .from('gastos_menores')
      .update({
        fecha: expense.date,
        categoria_id: categoryId,
        beneficiario: expense.supplier.trim(),
        rnc_cedula: expense.rnc.trim() || null,
        ncf_suplidor: expense.supplierNcf.trim() || null,
        documento_referencia: expense.document.trim() || null,
        centro_costo: expense.center.trim() || null,
        responsable: expense.person.trim() || null,
        monto_gravado: expense.taxable,
        monto_exento: expense.exempt,
        tasa_itbis: expense.itbisRate,
        monto_itbis: expense.itbisAmount,
        total: expense.total,
        forma_pago: expense.payment,
        concepto: expense.concept.trim(),
        notas: expense.notes.trim() || null,
        estado_dgii: expense.status
      })
      .eq('id', id);
    if (error) throw error;
    return this.getById(id);
  }

  async delete(id: number): Promise<void> {
    const { error } = await this.supabase.client.from('gastos_menores').delete().eq('id', id);
    if (error) throw error;
  }

  private async getById(id: number): Promise<MinorExpenseRecord> {
    const { data, error } = await this.supabase.client
      .from('gastos_menores')
      .select('id, numero_control, fecha, beneficiario, rnc_cedula, ncf_suplidor, documento_referencia, centro_costo, responsable, monto_gravado, monto_exento, tasa_itbis, monto_itbis, total, forma_pago, concepto, notas, estado_dgii, dgii_track_id, dgii_codigo_seguridad, dgii_codigo, dgii_mensaje_respuesta, dgii_error_message, dgii_mensajes, dgii_response_json, dgii_response_raw, encf, categorias_gastos(descripcion)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return this.fromRow(data);
  }

  private async categoryId(category: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('categorias_gastos')
      .select('id')
      .eq('descripcion', category)
      .eq('activo', true)
      .single();
    if (error || !data) throw error ?? new Error('La categoría de gasto no está disponible.');
    return Number(data.id);
  }

  private toPayload(expense: MinorExpenseSaveData): Record<string, unknown> {
    return {
      fecha: expense.date,
      beneficiario: expense.supplier.trim(),
      rncCedula: expense.rnc.trim(),
      ncfSuplidor: expense.supplierNcf.trim(),
      documentoReferencia: expense.document.trim(),
      categoria: expense.category,
      centroCosto: expense.center.trim(),
      responsable: expense.person.trim(),
      montoGravado: expense.taxable,
      montoExento: expense.exempt,
      tasaItbis: expense.itbisRate,
      montoItbis: expense.itbisAmount,
      total: expense.total,
      formaPago: expense.payment,
      concepto: expense.concept.trim(),
      notas: expense.notes.trim(),
      estadoDgii: expense.status
    };
  }

  private fromRow(row: any): MinorExpenseRecord {
    const category = Array.isArray(row.categorias_gastos) ? row.categorias_gastos[0] : row.categorias_gastos;
    return {
      id: Number(row.id), voucher: row.numero_control, date: row.fecha,
      supplier: row.beneficiario ?? '', rnc: row.rnc_cedula ?? '', supplierNcf: row.ncf_suplidor ?? '',
      document: row.documento_referencia ?? '', category: category?.descripcion ?? '', center: row.centro_costo ?? '',
      person: row.responsable ?? '', taxable: Number(row.monto_gravado ?? 0), exempt: Number(row.monto_exento ?? 0),
      itbisRate: Number(row.tasa_itbis ?? 0), itbisAmount: Number(row.monto_itbis ?? 0), total: Number(row.total ?? 0),
      payment: row.forma_pago ?? 'Efectivo', concept: row.concepto ?? '', notes: row.notas ?? '',
      status: row.estado_dgii ?? 'Borrador', trackId: row.dgii_track_id ?? '', securityCode: row.dgii_codigo_seguridad ?? '', eNcf: row.encf ?? '',
      dgiiCode: row.dgii_codigo ?? '', dgiiMessage: row.dgii_mensaje_respuesta ?? '', dgiiError: row.dgii_error_message ?? '',
      dgiiMessages: row.dgii_mensajes ?? null, dgiiResponse: row.dgii_response_json ?? null, dgiiResponseRaw: row.dgii_response_raw ?? ''
    };
  }
}
