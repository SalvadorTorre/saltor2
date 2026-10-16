import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface AuditEntry {
  id: number;
  empresa_id?: number | null;
  fecha: string;
  usuario_nombre: string | null;
  tabla: string;
  registro_id: string | null;
  accion: 'Crear' | 'Editar' | 'Anular' | 'Eliminar' | string;
  resumen: string | null;
  cambios: Record<string, { antes?: unknown; despues?: unknown }>;
}

export const AUDIT_TABLES: Record<string, string> = {
  products: 'Productos', clients: 'Clientes', suplidores: 'Suplidores', usuarios: 'Usuarios',
  facturas: 'Facturas', notas_credito: 'Notas de crédito', recibos_cobro: 'Recibos de cobro',
  cotizaciones: 'Cotizaciones', ncf_secuencias: 'Secuencias NCF', ecf_configuraciones: 'Configuración e-CF', empresas: 'Empresa'
};

/** Tablas propias de la plataforma (solo dueños del sistema). */
export const PLATFORM_AUDIT_TABLES: Record<string, string> = {
  empresas: 'Empresas', usuarios: 'Usuarios', plataforma_suscripciones: 'Suscripciones', plataforma_pagos: 'Pagos de suscripción', plataforma_planes: 'Planes',
  plataforma_contratos: 'Contratos', plataforma_instalaciones: 'Equipos instalados', plataforma_visitas: 'Visitas'
};

export const PRICE_FIELDS = ['costo', 'precio_venta', 'precio_minimo', 'precio_mayor', 'cantidadxmayor', 'cantidad_minima_mayor', 'ventaxmayor'];

@Injectable({ providedIn: 'root' })
export class AuditService {
  constructor(private readonly supabase: SupabaseService) {}

  async getEntries(filters: { from?: string; to?: string; table?: string; tables?: string[]; action?: string; companyId?: number | null; limit?: number }): Promise<AuditEntry[]> {
    let query = this.supabase.client.from('bitacora')
      .select('id, empresa_id, fecha, usuario_nombre, tabla, registro_id, accion, resumen, cambios')
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(filters.limit ?? 500);
    if (filters.from) query = query.gte('fecha', `${filters.from}T00:00:00-04:00`);
    if (filters.to) query = query.lte('fecha', `${filters.to}T23:59:59.999-04:00`);
    if (filters.table) query = query.eq('tabla', filters.table);
    else if (filters.tables?.length) query = query.in('tabla', filters.tables);
    if (filters.companyId) query = query.eq('empresa_id', filters.companyId);
    if (filters.action) query = query.eq('accion', filters.action);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AuditEntry[];
  }

  /** Cambios de costo y precios de un producto (más reciente primero). */
  async getPriceHistory(productId: number): Promise<AuditEntry[]> {
    const { data, error } = await this.supabase.client.from('bitacora')
      .select('id, fecha, usuario_nombre, tabla, registro_id, accion, resumen, cambios')
      .eq('tabla', 'products').eq('registro_id', String(productId))
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(200);
    if (error) throw error;
    return ((data ?? []) as AuditEntry[]).filter((e) => e.accion === 'Crear' || PRICE_FIELDS.some((f) => f in (e.cambios ?? {})));
  }
}
