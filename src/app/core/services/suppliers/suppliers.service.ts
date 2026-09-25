import { Injectable } from '@angular/core';
import { SupplierFormModel, SupplierRecord } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

interface SupplierRow {
  id: number;
  codigo: string;
  nombre_comercial: string;
  contacto: string | null;
  tipo_documento: 'RNC' | 'Cedula' | 'Pasaporte';
  numero_documento: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  ciudad: string | null;
  categoria: 'Local' | 'Importador' | 'Servicios';
  condiciones_pago: string | null;
  balance: number | string | null;
  estado: 'Activo' | 'Inactivo' | 'Suspendido';
  ultima_orden: string | null;
}

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly table = 'suplidores';

  constructor(private readonly supabase: SupabaseService) {}

  async getSuppliers(): Promise<SupplierRecord[]> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: SupplierRow) => this.fromRow(row));
  }

  async createSupplier(form: SupplierFormModel, lastOrder: string): Promise<SupplierRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .insert(this.toInsertRow(form, lastOrder))
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as SupplierRow);
  }

  async updateSupplier(id: number, form: SupplierFormModel): Promise<SupplierRecord> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .update(this.toUpdateRow(form))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as SupplierRow);
  }

  async deleteSupplier(id: number): Promise<void> {
    const { error } = await this.supabase.client
      .from(this.table)
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }
  }

  private fromRow(row: SupplierRow): SupplierRecord {
    return {
      id: row.id,
      code: row.codigo,
      companyName: row.nombre_comercial,
      contactName: row.contacto ?? '',
      documentType: row.tipo_documento,
      documentNumber: row.numero_documento,
      phone: row.telefono ?? '',
      email: row.correo ?? '',
      address: row.direccion ?? '',
      city: row.ciudad ?? '',
      category: row.categoria,
      paymentTerms: row.condiciones_pago ?? '',
      balance: Number(row.balance ?? 0),
      status: row.estado,
      lastOrder: row.ultima_orden ?? ''
    };
  }

  private toInsertRow(form: SupplierFormModel, lastOrder: string): Omit<SupplierRow, 'id'> {
    return {
      ...this.toUpdateRow(form),
      ultima_orden: lastOrder
    };
  }

  private toUpdateRow(form: SupplierFormModel): Omit<SupplierRow, 'id' | 'ultima_orden'> {
    return {
      codigo: form.code.trim(),
      nombre_comercial: form.companyName.trim(),
      contacto: form.contactName.trim() || null,
      tipo_documento: form.documentType,
      numero_documento: form.documentNumber.trim(),
      telefono: form.phone.trim() || null,
      correo: form.email.trim() || null,
      direccion: form.address.trim() || null,
      ciudad: form.city.trim() || null,
      categoria: form.category,
      condiciones_pago: form.paymentTerms.trim() || null,
      balance: Number(form.balance || 0),
      estado: form.status
    };
  }
}
