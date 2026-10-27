import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export const COMPANY_MODULES = [
  'mantenimiento', 'facturacion', 'cotizacion', 'caja',
  'contabilidad', 'reportes', 'configuracion', 'transacciones'
] as const;

export type CompanyModule = typeof COMPANY_MODULES[number];

export interface CompanyModuleDefinition {
  code: CompanyModule;
  label: string;
  description: string;
}

interface CompanyModuleRow {
  modulo: string;
}

export const COMPANY_MODULE_DEFINITIONS: CompanyModuleDefinition[] = [
  { code: 'mantenimiento', label: 'Mantenimiento', description: 'Clientes, suplidores, productos e inventario.' },
  { code: 'facturacion', label: 'Facturación', description: 'Facturación electrónica y consulta de comprobantes.' },
  { code: 'cotizacion', label: 'Cotización', description: 'Cotizaciones comerciales.' },
  { code: 'caja', label: 'Caja', description: 'Apertura, cobro, cierre e histórico de caja.' },
  { code: 'contabilidad', label: 'Contabilidad', description: 'Reportes fiscales, e-NCF y cuentas por cobrar.' },
  { code: 'reportes', label: 'Reportes', description: 'Reportes y análisis de ventas.' },
  { code: 'configuracion', label: 'Configuración', description: 'Empresa, usuarios y ajustes.' },
  { code: 'transacciones', label: 'Transacciones', description: 'Órdenes de venta, facturación, cotización y conduce.' }
];

@Injectable({ providedIn: 'root' })
export class CompanyModulesService {
  constructor(private readonly supabase: SupabaseService) {}

  async getActiveModules(companyId?: number): Promise<CompanyModule[]> {
    let query = this.supabase.client
      .from('empresa_modulos')
      .select('modulo')
      .eq('activo', true);
    if (companyId !== undefined) query = query.eq('empresa_id', companyId);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as CompanyModuleRow[])
      .map((row: CompanyModuleRow) => row.modulo as CompanyModule)
      .filter((module: CompanyModule) => COMPANY_MODULES.includes(module));
  }

  async saveCompanyModules(companyId: number, activeModules: CompanyModule[]): Promise<void> {
    const { error } = await this.supabase.client.rpc('plataforma_guardar_modulos', {
      p_empresa_id: companyId,
      p_modulos: activeModules
    });
    if (error) throw error;
  }
}
