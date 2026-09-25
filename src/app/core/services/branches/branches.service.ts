import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface BranchRecord {
  id: number;
  companyId: number;
  name: string;
  phone: string;
  city: string;
  address: string;
  status: 'Activa' | 'Inactiva';
}

export type BranchFormModel = Omit<BranchRecord, 'id' | 'companyId'>;

interface BranchRow {
  idsucursal: number;
  idempresa: number;
  nombresucursal: string;
  telefono: string | null;
  ciudad: string | null;
  direcion: string | null;
  estado: 'Activa' | 'Inactiva';
}

@Injectable({ providedIn: 'root' })
export class BranchesService {
  constructor(private readonly supabase: SupabaseService) {}

  async getBranches(companyId: number): Promise<BranchRecord[]> {
    const { data, error } = await this.supabase.client
      .from('sucursales')
      .select('*')
      .eq('idempresa', companyId)
      .order('nombresucursal');

    if (error) throw error;
    return (data ?? []).map((row: BranchRow) => this.fromRow(row));
  }

  async createBranch(companyId: number, form: BranchFormModel): Promise<BranchRecord> {
    const { data, error } = await this.supabase.client
      .from('sucursales')
      .insert(this.toRow(companyId, form))
      .select('*')
      .single();

    if (error) throw error;
    return this.fromRow(data as BranchRow);
  }

  async updateBranch(id: number, companyId: number, form: BranchFormModel): Promise<BranchRecord> {
    const { data, error } = await this.supabase.client
      .from('sucursales')
      .update(this.toRow(companyId, form))
      .eq('idsucursal', id)
      .eq('idempresa', companyId)
      .select('*')
      .single();

    if (error) throw error;
    return this.fromRow(data as BranchRow);
  }

  private fromRow(row: BranchRow): BranchRecord {
    return {
      id: row.idsucursal,
      companyId: row.idempresa,
      name: row.nombresucursal,
      phone: row.telefono ?? '',
      city: row.ciudad ?? '',
      address: row.direcion ?? '',
      status: row.estado
    };
  }

  private toRow(companyId: number, form: BranchFormModel): Omit<BranchRow, 'idsucursal'> {
    return {
      idempresa: companyId,
      nombresucursal: form.name.trim(),
      telefono: form.phone.trim() || null,
      ciudad: form.city.trim() || null,
      direcion: form.address.trim() || null,
      estado: form.status
    };
  }
}
