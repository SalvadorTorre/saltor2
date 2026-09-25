import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface PaymentMethod {
  code: number;
  description: string;
}

interface PaymentMethodRow {
  codigo: number;
  descripcion: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentMethodsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const { data, error } = await this.supabase.client
      .from('formapago')
      .select('codigo, descripcion')
      .order('codigo');

    if (error) throw error;

    return (data ?? []).map((row: PaymentMethodRow) => ({
      code: Number(row.codigo),
      description: row.descripcion
    }));
  }
}
