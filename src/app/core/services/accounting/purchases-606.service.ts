import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface Purchase606Record {
  id: number;
  sequence: string;
  registrationDate: string;
  supplier: string;
  rnc: string;
  document: string;
  ncf: string;
  invoiceDate: string;
  paymentDate: string;
  paymentType: string;
  goodsType: string;
  invoiceAmount: number;
  itbisAmount: number;
  subtotal: number;
  documentType: string;
}

export interface Purchase606SaveData {
  supplier: string;
  rnc: string;
  document: string;
  ncf: string;
  invoiceDate: string;
  paymentDate: string;
  paymentType: string;
  goodsType: string;
  invoiceAmount: number;
  itbisAmount: number;
  subtotal: number;
}

@Injectable({ providedIn: 'root' })
export class Purchases606Service {
  constructor(private readonly supabase: SupabaseService) {}

  async list(): Promise<Purchase606Record[]> {
    const { data, error } = await this.supabase.client
      .from('compras_606')
      .select('*')
      .order('fecha_factura', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => this.toRecord(row));
  }

  async create(purchase: Purchase606SaveData): Promise<{ id: number; sequence: string }> {
    await this.ensureAuthenticatedSession();
    const { data, error } = await this.supabase.client.rpc('crear_compra_606', {
      p_compra: {
        proveedorNombre: purchase.supplier,
        rncCedula: purchase.rnc,
        numeroFactura: purchase.document,
        ncf: purchase.ncf,
        fechaFactura: purchase.invoiceDate,
        fechaPago: purchase.paymentDate,
        tipoPago: purchase.paymentType,
        tipoBienServicio: purchase.goodsType,
        montoFacturado: purchase.invoiceAmount,
        montoItbis: purchase.itbisAmount,
        subtotal: purchase.subtotal
      }
    });
    if (error) throw this.toSaveError(error);
    const saved = Array.isArray(data) ? data[0] : data;
    return { id: Number(saved.id), sequence: saved.numero_registro };
  }

  private toRecord(row: any): Purchase606Record {
    return {
      id: Number(row.id), sequence: row.numero_registro ?? String(row.id), registrationDate: row.fecha_registro,
      supplier: row.proveedor_nombre, rnc: row.rnc_cedula, document: row.numero_factura, ncf: row.ncf,
      invoiceDate: row.fecha_factura, paymentDate: row.fecha_pago ?? '', paymentType: row.tipo_pago,
      goodsType: row.tipo_bien_servicio, invoiceAmount: Number(row.monto_facturado ?? 0),
      itbisAmount: Number(row.monto_itbis ?? 0), subtotal: Number(row.subtotal ?? 0),
      documentType: row.tipo_identificacion ?? 'RNC'
    };
  }

  private async ensureAuthenticatedSession(): Promise<void> {
    const { data, error } = await this.supabase.client.auth.getSession();
    if (error) throw new Error('No se pudo validar la sesión de Supabase. Cierra sesión e inicia nuevamente.');
    if (data.session?.user) return;
    const { data: refreshed, error: refreshError } = await this.supabase.client.auth.refreshSession();
    if (refreshError || !refreshed.session?.user) throw new Error('Tu sesión expiró. Cierra sesión e inicia nuevamente para guardar la factura de compra.');
  }

  private toSaveError(error: unknown): Error {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 0;
    if (status === 401) return new Error('Tu sesión no es válida o no tiene permiso para registrar compras. Cierra sesión e inicia nuevamente.');
    return error instanceof Error ? error : new Error('No se pudo guardar la factura de compra.');
  }
}
