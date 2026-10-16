import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface DashboardSummary {
  hoy: string;
  ventas: { hoy: number; hoy_facturas: number; ayer: number; semana_pasada: number; mes: number; mes_facturas: number; mes_anterior_corte: number; mes_credito: number };
  unidades_mes: number;
  serie_30: Array<{ fecha: string; total: number; facturas: number }>;
  top_productos: Array<{ nombre: string; cantidad: number; total: number }>;
  categorias: Array<{ nombre: string; total: number }>;
  stock: { activos: number; negativos: number; bajo_minimo: number; lista: Array<{ codigo: string; descripcion: string; existencia: number; existenciamin: number }> };
  sin_movimiento: { cantidad: number; valor: number; lista: Array<{ codigo: string; descripcion: string; existencia: number; ultima_venta: string | null; dias: number | null }> };
  inventario_mes: { entradas: number; salidas: number; ajustes: number };
  cxc: { saldo: number; vencido: number; facturas_vencidas: number; clientes: number };
  cotizaciones: { activas: number; por_vencer: number; monto_activas: number };
  fiscal: { ambiente: string | null; rechazados: number; sin_enviar: number; secuencias_alerta: number; certificado_dias: number | null };
  ultimas: Array<{ id: number; fecha: string; numero: string; cliente: string; total: number; estado: string }>;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private readonly supabase: SupabaseService) {}

  async getSummary(): Promise<DashboardSummary> {
    const { data, error } = await this.supabase.client.rpc('dashboard_inicio');
    if (error) throw error;
    return data as DashboardSummary;
  }
}
