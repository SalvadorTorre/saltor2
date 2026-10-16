import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface FiscalSequence {
  tipo_ncf: string; serie: string; rango_inicial: string; rango_final: string; usados: number; total: number; restantes: number;
  pct_usado: number; porcentaje_alerta: number; fecha_vencimiento: string; vence: string | null; dias_para_vencer: number | null; estado: string;
}
export interface FiscalPendingDoc {
  tipo_doc: string; id: number; numero: string; encf: string; fecha: string; tercero: string | null; total: number;
  estado: string; mensaje: string | null; dias: number;
}
export interface FiscalPanel {
  ambiente: string | null;
  certificado: { titular: string | null; emisor: string | null; valido_hasta: string | null; dias_restantes: number | null } | null;
  secuencias: FiscalSequence[];
  ecf_resumen: Array<{ tipo_doc: string; total: number; aceptados: number; condicionales: number; en_proceso: number; rechazados: number; sin_enviar: number }>;
  ecf_pendientes: FiscalPendingDoc[];
  it1: {
    facturas: number; ventas_total: number; ventas_neto: number; ventas_gravadas: number; ventas_exentas: number;
    itbis_18: number; itbis_16: number; itbis_ventas: number;
    por_tipo: Array<{ tipo: string; cantidad: number; neto: number; itbis: number; total: number }>;
    nc_cantidad: number; nc_neto: number; itbis_nc: number;
    compras_cantidad: number; compras_neto: number; itbis_compras: number;
    gastos_menores_total: number; gastos_menores_itbis: number;
    itbis_neto: number; facturas_no_aceptadas: number;
  };
  retenciones: { comprobantes: number; monto_compras: number; retencion_itbis: number; retencion_isr: number };
}

@Injectable({ providedIn: 'root' })
export class FiscalPanelService {
  constructor(private readonly supabase: SupabaseService) {}

  async get(dateFrom: string, dateTo: string): Promise<FiscalPanel> {
    const { data, error } = await this.supabase.client.rpc('panel_fiscal', { p_desde: dateFrom, p_hasta: dateTo });
    if (error) throw error;
    return data as FiscalPanel;
  }
}
