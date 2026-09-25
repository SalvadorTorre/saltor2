import { Injectable } from '@angular/core';
import { Company, CompanyFormModel } from '../../../app.models';
import { SupabaseService } from '../supabase/supabase.service';

interface CompanyRow {
  id: number;
  nombre_comercial: string;
  razon_social: string;
  rnc: string;
  correo: string;
  telefono: string | null;
  ciudad: string | null;
  sitio_web: string | null;
  direccion: string | null;
  categoria: string;
  estado: 'Activa' | 'Inactiva';
  cantidad_sucursales: number | string | null;
  ultima_actualizacion: string | null;
}

@Injectable({ providedIn: 'root' })
export class CompaniesService {
  private readonly table = 'empresas';

  constructor(private readonly supabase: SupabaseService) {}

  async getCompanies(): Promise<Company[]> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row: CompanyRow) => this.fromRow(row));
  }

  async createCompany(form: CompanyFormModel, lastUpdate: string): Promise<Company> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .insert(this.toInsertRow(form, lastUpdate))
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as CompanyRow);
  }

  async updateCompany(id: number, form: CompanyFormModel, lastUpdate: string): Promise<Company> {
    const { data, error } = await this.supabase.client
      .from(this.table)
      .update(this.toInsertRow(form, lastUpdate))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.fromRow(data as CompanyRow);
  }

  async deleteCompany(id: number): Promise<void> {
    const { error } = await this.supabase.client
      .from(this.table)
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }
  }

  private fromRow(row: CompanyRow): Company {
    return {
      id: row.id,
      tradeName: row.nombre_comercial,
      legalName: row.razon_social,
      rnc: row.rnc,
      email: row.correo,
      phone: row.telefono ?? '',
      city: row.ciudad ?? '',
      website: row.sitio_web ?? '',
      address: row.direccion ?? '',
      category: row.categoria,
      status: row.estado,
      branchCount: Number(row.cantidad_sucursales ?? 0),
      lastUpdate: row.ultima_actualizacion ?? ''
    };
  }

  private toInsertRow(form: CompanyFormModel, lastUpdate: string): Omit<CompanyRow, 'id'> {
    return {
      nombre_comercial: form.tradeName.trim(),
      razon_social: form.legalName.trim(),
      rnc: form.rnc.trim(),
      correo: form.email.trim(),
      telefono: form.phone.trim() || null,
      ciudad: form.city.trim() || null,
      sitio_web: form.website.trim() || null,
      direccion: form.address.trim() || null,
      categoria: form.category.trim() || 'Principal',
      estado: form.status,
      cantidad_sucursales: 1,
      ultima_actualizacion: lastUpdate
    };
  }
}
