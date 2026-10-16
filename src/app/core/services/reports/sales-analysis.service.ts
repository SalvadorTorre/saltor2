import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface SalesAnalysisSummary {
  facturas: number; total: number; neto: number; itbis: number; contado: number; credito: number; clientes: number;
  costo: number; neto_lineas: number; unidades: number; lineas_costo_estimado: number; lineas_sin_costo: number;
}
export interface SalesAnalysisPrevious { desde: string; hasta: string; facturas: number; total: number; neto: number; costo: number; neto_lineas: number; }
export interface SalesAnalysis {
  resumen: SalesAnalysisSummary;
  anterior: SalesAnalysisPrevious | null;
  por_dia: Array<{ fecha: string; facturas: number; total: number }>;
  por_forma_pago: Array<{ codigo: number | null; nombre: string; facturas: number; total: number }>;
  por_cliente: Array<{ nombre: string; rnc: string | null; facturas: number; total: number; ultima_compra: string }>;
  por_categoria: Array<{ nombre: string; cantidad: number; neto: number; costo: number; margen: number }>;
  por_vendedor: Array<{ nombre: string; facturas: number; total: number; promedio: number }>;
  por_producto: Array<{ codigo: string; nombre: string; cantidad: number; neto: number; costo: number; margen: number; costo_estimado: boolean }>;
  mayor_detalle: Array<{ tipo: string; lineas: number; cantidad: number; neto: number; margen: number }>;
  reemplazos: Array<{ codigo: string; nombre: string; rebaja_de: string; lineas: number; cantidad: number; neto: number }>;
  por_hora: Array<{ hora: number; facturas: number; total: number }>;
  por_dia_semana: Array<{ dia: number; facturas: number; total: number }>;
  notas_credito: Array<{ codigo: string; motivo: string; cantidad: number; total: number }>;
  cotizaciones: { cantidad: number; total: number; facturadas: number; total_facturado: number; vencidas: number; por_estado: Array<{ estado: string; cantidad: number; total: number }> };
}

@Injectable({ providedIn: 'root' })
export class SalesAnalysisService {
  constructor(private readonly supabase: SupabaseService) {}

  async get(dateFrom: string, dateTo: string): Promise<SalesAnalysis> {
    const { data, error } = await this.supabase.client.rpc('reporte_ventas_analisis', {
      p_desde: dateFrom || null,
      p_hasta: dateTo || null
    });
    if (error) throw error;
    return data as SalesAnalysis;
  }
}
