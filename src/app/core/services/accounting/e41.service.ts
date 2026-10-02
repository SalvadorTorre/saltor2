import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type E41Status = 'Borrador' | 'Enviado' | 'Aceptado' | 'Rechazado' | 'Error';

export interface E41Record {
  id: number;
  sequence: string;
  controlDate: string;
  ncf: string;
  date: string;
  purchaseType: string;
  description: string;
  providerIdType: string;
  provider: string;
  identification: string;
  total: number;
  amount: number;
  itbis: number;
  itbisRate: number;
  itbisWithholding: number;
  isrWithholding: number;
  withheld: number;
  status: E41Status;
}

export interface E41SaveData {
  date: string;
  purchaseType: string;
  description: string;
  providerIdType: string;
  providerId: string;
  providerName: string;
  purchaseAmount: number;
  itbisRate: number;
  itbisWithholding: number;
  isrWithholding: number;
  status: Extract<E41Status, 'Borrador' | 'Enviado'>;
}

export interface IsrRate {
  id: number;
  percentage: number;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class E41Service {
  constructor(private readonly supabase: SupabaseService) {}

  async list(): Promise<E41Record[]> {
    const { data, error } = await this.supabase.client
      .from('comprobantes_e41')
      .select('*')
      .order('fecha_control', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => this.toRecord(row));
  }

  async getIsrRates(): Promise<IsrRate[]> {
    const { data, error } = await this.supabase.client
      .from('isr')
      .select('id, porcentaje, descripcion')
      .eq('activo', true)
      .order('porcentaje');
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: Number(row.id),
      percentage: Number(row.porcentaje),
      description: row.descripcion
    }));
  }

  async create(comprobante: E41SaveData): Promise<E41Record> {
    await this.ensureAuthenticatedSession();
    const { data, error } = await this.supabase.client.rpc('crear_comprobante_e41', {
      p_comprobante: this.toPayload(comprobante)
    });
    if (error) throw this.toSaveError(error);
    const saved = Array.isArray(data) ? data[0] : data;
    return this.getById(Number(saved?.id));
  }

  async update(id: number, comprobante: E41SaveData): Promise<E41Record> {
    await this.ensureAuthenticatedSession();
    const { error } = await this.supabase.client.rpc('actualizar_comprobante_e41', {
      p_id: id,
      p_comprobante: this.toPayload(comprobante)
    });
    if (error) throw this.toSaveError(error);
    return this.getById(id);
  }

  async delete(id: number): Promise<void> {
    await this.ensureAuthenticatedSession();
    const { data, error } = await this.supabase.client
      .from('comprobantes_e41')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data?.length) {
      throw new Error('No se puede eliminar un comprobante aceptado o que no pertenece a la empresa activa.');
    }
  }

  async markAsSent(id: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('comprobantes_e41')
      .update({ estado_dgii: 'Enviado', actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .neq('estado_dgii', 'Aceptado');
    if (error) throw error;
  }

  private async getById(id: number): Promise<E41Record> {
    const { data, error } = await this.supabase.client
      .from('comprobantes_e41')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return this.toRecord(data);
  }

  private toPayload(comprobante: E41SaveData): Record<string, unknown> {
    return {
      fechaEmision: comprobante.date,
      tipoCompra: comprobante.purchaseType,
      descripcionOperacion: comprobante.description.trim(),
      tipoDocumentoProveedor: comprobante.providerIdType,
      numeroDocumentoProveedor: comprobante.providerId.trim(),
      proveedorNombre: comprobante.providerName.trim(),
      montoCompra: comprobante.purchaseAmount,
      tasaItbis: comprobante.itbisRate,
      retencionItbis: comprobante.itbisWithholding,
      retencionIsr: comprobante.isrWithholding,
      estadoDgii: comprobante.status
    };
  }

  private toRecord(row: any): E41Record {
    const itbisWithheld = Number(row.monto_retencion_itbis ?? 0);
    const isrWithheld = Number(row.monto_retencion_isr ?? 0);
    return {
      id: Number(row.id),
      sequence: row.numero_control ?? String(row.id),
      controlDate: row.fecha_control ?? row.fecha_emision,
      ncf: row.encf ?? '',
      date: row.fecha_emision,
      purchaseType: row.tipo_compra ?? 'Producto',
      description: row.descripcion_operacion ?? '',
      providerIdType: row.tipo_documento_proveedor ?? 'Cédula',
      provider: row.proveedor_nombre ?? '',
      identification: row.numero_documento_proveedor ?? '',
      total: Number(row.total_pagar ?? 0),
      amount: Number(row.monto_compra ?? 0),
      itbis: Number(row.monto_itbis ?? 0),
      itbisRate: Number(row.tasa_itbis ?? 0),
      itbisWithholding: Number(row.porcentaje_retencion_itbis ?? 0),
      isrWithholding: Number(row.porcentaje_retencion_isr ?? 0),
      withheld: itbisWithheld + isrWithheld,
      status: (row.estado_dgii ?? 'Borrador') as E41Status
    };
  }

  private async ensureAuthenticatedSession(): Promise<void> {
    const { data, error } = await this.supabase.client.auth.getSession();
    if (error) throw new Error('No se pudo validar la sesión de Supabase. Cierra sesión e inicia nuevamente.');
    if (data.session?.user) return;
    const { data: refreshed, error: refreshError } = await this.supabase.client.auth.refreshSession();
    if (refreshError || !refreshed.session?.user) {
      throw new Error('Tu sesión expiró. Cierra sesión e inicia nuevamente para registrar el comprobante E41.');
    }
  }

  private toSaveError(error: unknown): Error {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 0;
    if (status === 401) return new Error('Tu sesión no es válida o no tiene permiso para registrar comprobantes E41. Cierra sesión e inicia nuevamente.');
    return error instanceof Error ? error : new Error('No se pudo guardar el comprobante E41.');
  }
}
