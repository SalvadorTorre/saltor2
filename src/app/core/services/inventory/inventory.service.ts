import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface InventoryMovement {
  id: number;
  productId: number;
  date: string;
  type: string;
  quantity: number;
  before: number;
  after: number;
  cost: number | null;
  document: string;
  notes: string;
  userName: string;
}

export type AdjustmentMode = 'entrada' | 'salida' | 'conteo';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Movimientos de un producto (kardex), del más antiguo al más reciente. */
  async getMovements(productId: number, from?: string, to?: string): Promise<InventoryMovement[]> {
    let query = this.supabase.client
      .from('movimientos_inventario')
      .select('*')
      .eq('producto_id', productId)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true })
      .limit(5000);
    if (from) query = query.gte('fecha', new Date(`${from}T00:00:00`).toISOString());
    if (to) query = query.lt('fecha', new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString());
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: Number(r.id),
      productId: Number(r.producto_id),
      date: r.fecha,
      type: r.tipo,
      quantity: Number(r.cantidad ?? 0),
      before: Number(r.existencia_anterior ?? 0),
      after: Number(r.existencia_nueva ?? 0),
      cost: r.costo_unitario == null ? null : Number(r.costo_unitario),
      document: r.documento ?? '',
      notes: r.notas ?? '',
      userName: r.usuario_nombre ?? ''
    }));
  }

  async adjust(productId: number, mode: AdjustmentMode, quantity: number, reason: string): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('ajustar_inventario', {
      p_producto_id: productId,
      p_modo: mode,
      p_cantidad: quantity,
      p_motivo: reason
    });
    if (error) throw error;
    return Number(data);
  }
}
