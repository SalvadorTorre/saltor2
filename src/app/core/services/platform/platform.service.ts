import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export type SubscriptionState = 'Prueba' | 'Activa' | 'Suspendida' | 'Cancelada';
export type ComputedState = SubscriptionState | 'Por vencer' | 'En gracia' | 'Vencida' | 'Sin suscripción';

export interface PlatformCompany {
  id: number;
  nombre_comercial: string;
  razon_social: string | null;
  rnc: string | null;
  correo: string | null;
  telefono: string | null;
  ciudad: string | null;
  estado_empresa: string | null;
  creado_en: string | null;
  usuarios: number;
  usuarios_activos: number;
  sucursales: number;
  ultimo_acceso: string | null;
  productos: number;
  facturas_mes: number;
  ventas_mes: number;
  plan_id: number | null;
  plan: string | null;
  max_usuarios: number | null;
  max_sucursales: number | null;
  estado: SubscriptionState | null;
  fecha_inicio: string | null;
  prueba_hasta: string | null;
  pagado_hasta: string | null;
  dias_gracia: number | null;
  precio_mensual: number | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  notas: string | null;
  ultimo_pago: string | null;
  contratos_vigentes?: number;
  contrato_vence?: string | null;
  equipos?: number;
  ultima_visita?: string | null;
  estado_calculado: ComputedState;
  vence: string | null;
  dias_restantes: number | null;
}

export interface PlatformTotals {
  empresas: number;
  activas: number;
  prueba: number;
  por_vencer: number;
  en_gracia: number;
  vencidas: number;
  suspendidas: number;
  ingreso_mensual: number;
  cobrado_mes: number;
  cobrado_anio: number;
  contratos_vigentes?: number;
  contratos_por_vencer?: number;
  contratos_vencidos?: number;
  equipos?: number;
  garantias_por_vencer?: number;
  visitas_mes?: number;
  servicios_mes?: number;
}

export interface PlatformSummary {
  hoy: string;
  empresas: PlatformCompany[];
  totales: PlatformTotals;
}

export interface PlatformPlan {
  id?: number;
  nombre: string;
  descripcion: string | null;
  precio_mensual: number;
  max_usuarios: number | null;
  max_sucursales: number | null;
  activo: boolean;
  orden: number;
}

export interface PlatformPayment {
  id: number;
  numero: string;
  empresa_id: number;
  fecha: string;
  meses: number;
  monto: number;
  forma_pago: string;
  referencia: string | null;
  notas: string | null;
  periodo_desde: string;
  periodo_hasta: string;
  estado: 'Activo' | 'Anulado';
  motivo_anulacion: string | null;
  registrado_por: string | null;
  creado_en: string;
}

export interface NewPlatformPayment {
  empresa_id: number;
  fecha: string;
  meses: number;
  monto: number;
  forma_pago: string;
  referencia?: string;
  notas?: string;
}

export interface SubscriptionUpdate {
  plan_id: number | null;
  estado: SubscriptionState;
  prueba_hasta: string | null;
  pagado_hasta: string | null;
  dias_gracia: number;
  precio_mensual: number;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  notas: string | null;
}

export interface ProformaSchedule {
  empresa_id: number;
  activo: boolean;
  hora_desde: string;
  hora_hasta: string;
  intervalo_minutos: number;
  lote_por_ciclo: number;
  maximo_diario: number;
  contador_fecha: string | null;
  enviadas_hoy: number;
  ultimo_proceso_en: string | null;
  ultimo_resumen: Record<string, unknown>;
  actualizado_en: string | null;
}

export interface SubscriptionNotice {
  estado: SubscriptionState;
  estado_calculado: ComputedState;
  vence: string | null;
  dias_restantes: number | null;
  mensaje: string | null;
}

export interface CompanyUserRow { codusuario: number; nombre_completo: string | null; idusuario: string | null; rol: string | null; estado: string | null; ultimo_acceso_en: string | null; }
export interface CompanyBranchRow { idsucursal: number; nombresucursal: string | null; ciudad: string | null; telefono: string | null; estado: string | null; }

export type ContractType = 'Suscripción' | 'Licencia' | 'Implementación' | 'Soporte' | 'Otro';
export type ContractState = 'Borrador' | 'Vigente' | 'Finalizado' | 'Cancelado';

export interface PlatformContract {
  id?: number;
  numero?: string;
  empresa_id: number | null;
  tipo: ContractType;
  descripcion: string | null;
  plan_id: number | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  renovacion_automatica: boolean;
  monto: number;
  periodicidad: 'Mensual' | 'Trimestral' | 'Anual' | 'Pago único';
  condiciones: string | null;
  representante_nombre: string | null;
  representante_cedula: string | null;
  representante_cargo: string | null;
  estado: ContractState;
  firmado_en: string | null;
  archivo?: string | null;
  archivo_nombre: string | null;
  notas: string | null;
}

export const INSTALLATION_TYPES = ['PC de caja', 'Servidor', 'PC de oficina', 'Laptop', 'Impresora térmica', 'Impresora fiscal', 'Lector de código', 'Cajón de dinero', 'Router / Red', 'Otro'];
export const VISIT_TYPES = ['Instalación', 'Mantenimiento', 'Soporte', 'Capacitación', 'Actualización', 'Otro'];

export interface PlatformInstallation {
  id?: number;
  empresa_id: number | null;
  sucursal_id: number | null;
  nombre_equipo: string;
  tipo: string;
  marca_modelo: string | null;
  serie: string | null;
  sistema_operativo: string | null;
  version_app: string | null;
  ip_local: string | null;
  acceso_remoto: string | null;
  ubicacion: string | null;
  responsable: string | null;
  telefono: string | null;
  fecha_instalacion: string | null;
  garantia_hasta: string | null;
  estado: 'Activa' | 'En mantenimiento' | 'Retirada';
  notas: string | null;
}

export interface PlatformVisit {
  id?: number;
  empresa_id: number | null;
  instalacion_id: number | null;
  fecha: string;
  tipo: string;
  modalidad: 'Presencial' | 'Remota';
  descripcion: string;
  tecnico: string | null;
  horas: number | null;
  monto: number;
}

/** Cláusulas de partida para un contrato nuevo; se editan en cada contrato. */
export const DEFAULT_CONTRACT_TERMS = `1. OBJETO: EL PROVEEDOR concede a EL CLIENTE el derecho de uso del sistema SaltorSystem (facturación, inventario, caja, cuentas por cobrar, comprobantes fiscales y reportes) bajo la modalidad indicada en este contrato.
2. PAGO: EL CLIENTE pagará el monto indicado según la periodicidad acordada, por adelantado. Al vencer un período EL CLIENTE dispone de los días de gracia indicados por EL PROVEEDOR para renovar.
3. SOPORTE: EL PROVEEDOR brindará soporte remoto en horario laborable. Las visitas presenciales, capacitaciones adicionales y trabajos fuera del alcance se cotizan aparte.
4. DATOS: Los datos registrados en el sistema son propiedad de EL CLIENTE. EL PROVEEDOR los resguarda con medidas de seguridad razonables y no los compartirá con terceros, salvo requerimiento de autoridad competente. Al terminar el contrato, EL CLIENTE podrá solicitar una copia de sus datos.
5. RESPONSABILIDAD FISCAL: EL CLIENTE es responsable de la veracidad de la información que registra y de sus obligaciones ante la DGII.
6. VIGENCIA Y TERMINACIÓN: Este contrato rige desde la fecha de inicio indicada. Cualquiera de las partes puede terminarlo con aviso escrito de treinta (30) días.`;

export type TicketState = 'Abierto' | 'En proceso' | 'Esperando cliente' | 'Resuelto' | 'Cerrado';
export const TICKET_CATEGORIES = ['Consulta', 'Error', 'Facturación electrónica', 'Mejora', 'Capacitación', 'Cobro', 'Otro'];
export const TICKET_PRIORITIES = ['Baja', 'Normal', 'Alta', 'Urgente'];
export const TICKET_STATES: TicketState[] = ['Abierto', 'En proceso', 'Esperando cliente', 'Resuelto', 'Cerrado'];

export interface SupportTicket {
  id: number;
  numero: string;
  empresa_id: number;
  asunto: string;
  categoria: string;
  prioridad: string;
  estado: TicketState;
  creado_por_nombre: string | null;
  ultimo_autor: 'Cliente' | 'Soporte';
  ultima_actividad: string;
  cerrado_en: string | null;
  creado_en: string;
}

export interface TicketMessage {
  id: number;
  ticket_id: number;
  autor_nombre: string | null;
  es_soporte: boolean;
  mensaje: string;
  creado_en: string;
}

export interface PlatformNotice {
  id?: number;
  titulo: string;
  mensaje: string | null;
  nivel: 'Información' | 'Advertencia' | 'Urgente';
  empresa_id: number | null;
  desde: string;
  hasta: string | null;
  activo: boolean;
}

export interface HealthCheck { area: string; nivel: 'ok' | 'warn' | 'bad' | 'info'; texto: string; }
export interface CompanyHealth { id: number; nombre_comercial: string; rnc: string | null; nivel: 'ok' | 'warn' | 'bad'; checks: HealthCheck[]; }

export const PAYMENT_METHODS = ['Transferencia', 'Efectivo', 'Depósito', 'Cheque', 'Tarjeta'];

@Injectable({ providedIn: 'root' })
export class PlatformService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() { return this.supabase.client; }

  async getSummary(): Promise<PlatformSummary> {
    const { data, error } = await this.db.rpc('plataforma_resumen');
    if (error) throw error;
    return data as PlatformSummary;
  }

  async getProformaSchedule(companyId: number): Promise<ProformaSchedule> {
    const { data, error } = await this.db.rpc('plataforma_obtener_programacion_proformas', { p_empresa_id: companyId });
    if (error) throw error;
    return data as ProformaSchedule;
  }

  async saveProformaSchedule(schedule: Pick<ProformaSchedule, 'empresa_id' | 'activo' | 'hora_desde' | 'hora_hasta' | 'intervalo_minutos' | 'lote_por_ciclo' | 'maximo_diario'>): Promise<ProformaSchedule> {
    const { data, error } = await this.db.rpc('plataforma_guardar_programacion_proformas', {
      p_empresa_id: schedule.empresa_id,
      p_activo: schedule.activo,
      p_hora_desde: schedule.hora_desde,
      p_hora_hasta: schedule.hora_hasta,
      p_intervalo_minutos: schedule.intervalo_minutos,
      p_lote_por_ciclo: schedule.lote_por_ciclo,
      p_maximo_diario: schedule.maximo_diario
    });
    if (error) throw error;
    return data as ProformaSchedule;
  }

  async getPlans(): Promise<PlatformPlan[]> {
    const { data, error } = await this.db.from('plataforma_planes').select('*').order('orden').order('id');
    if (error) throw error;
    return (data ?? []) as PlatformPlan[];
  }

  async savePlan(plan: PlatformPlan): Promise<void> {
    const row = { nombre: plan.nombre.trim(), descripcion: plan.descripcion?.trim() || null, precio_mensual: Number(plan.precio_mensual) || 0,
      max_usuarios: plan.max_usuarios || null, max_sucursales: plan.max_sucursales || null, activo: plan.activo, orden: Number(plan.orden) || 0 };
    const { error } = plan.id
      ? await this.db.from('plataforma_planes').update(row).eq('id', plan.id)
      : await this.db.from('plataforma_planes').insert(row);
    if (error) throw error;
  }

  async deletePlan(id: number): Promise<void> {
    const { error } = await this.db.from('plataforma_planes').delete().eq('id', id);
    if (error) throw error;
  }

  async updateSubscription(companyId: number, changes: SubscriptionUpdate): Promise<void> {
    const { error } = await this.db.from('plataforma_suscripciones')
      .upsert({ empresa_id: companyId, ...changes, actualizado_en: new Date().toISOString() }, { onConflict: 'empresa_id' });
    if (error) throw error;
  }

  async setSubscriptionState(companyId: number, estado: SubscriptionState): Promise<void> {
    const { error } = await this.db.from('plataforma_suscripciones').update({ estado, actualizado_en: new Date().toISOString() }).eq('empresa_id', companyId);
    if (error) throw error;
  }

  async getBillingMode(companyId: number): Promise<'Directo' | 'Caja'> {
    const { data, error } = await this.db.from('empresas').select('modo_facturacion').eq('id', companyId).maybeSingle();
    if (error) throw error;
    return (data as { modo_facturacion?: string } | null)?.modo_facturacion === 'Caja' ? 'Caja' : 'Directo';
  }

  async setBillingMode(companyId: number, mode: 'Directo' | 'Caja'): Promise<void> {
    const { data, error } = await this.db.from('empresas').update({ modo_facturacion: mode }).eq('id', companyId).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No se pudo cambiar el modo de facturación de esa empresa.');
  }

  async extendTrial(companyId: number, days: number): Promise<void> {
    const { error } = await this.db.rpc('extender_prueba_plataforma', { p_empresa_id: companyId, p_dias: days });
    if (error) throw error;
  }

  async registerPayment(payment: NewPlatformPayment): Promise<PlatformPayment> {
    const { data, error } = await this.db.rpc('registrar_pago_plataforma', { p_pago: payment });
    if (error) throw error;
    return data as PlatformPayment;
  }

  async voidPayment(id: number, reason: string): Promise<void> {
    const { error } = await this.db.rpc('anular_pago_plataforma', { p_pago_id: id, p_motivo: reason });
    if (error) throw error;
  }

  async getPayments(filters: { companyId?: number; from?: string; to?: string; limit?: number }): Promise<PlatformPayment[]> {
    let query = this.db.from('plataforma_pagos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }).limit(filters.limit ?? 1000);
    if (filters.companyId) query = query.eq('empresa_id', filters.companyId);
    if (filters.from) query = query.gte('fecha', filters.from);
    if (filters.to) query = query.lte('fecha', filters.to);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PlatformPayment[];
  }

  async getCompanyUsers(companyId: number): Promise<CompanyUserRow[]> {
    const { data, error } = await this.db.from('usuarios').select('codusuario, nombre_completo, idusuario, rol, estado, ultimo_acceso_en')
      .eq('empresa_id', companyId).order('nombre_completo');
    if (error) throw error;
    return (data ?? []) as CompanyUserRow[];
  }

  async getCompanyBranches(companyId: number): Promise<CompanyBranchRow[]> {
    const { data, error } = await this.db.from('sucursales').select('idsucursal, nombresucursal, ciudad, telefono, estado')
      .eq('idempresa', companyId).order('idsucursal');
    if (error) throw error;
    return (data ?? []) as CompanyBranchRow[];
  }

  // Contratos ------------------------------------------------------------------
  async getContracts(companyId?: number | null): Promise<PlatformContract[]> {
    let query = this.db.from('plataforma_contratos')
      .select('id, numero, empresa_id, tipo, descripcion, plan_id, fecha_inicio, fecha_fin, renovacion_automatica, monto, periodicidad, condiciones, representante_nombre, representante_cedula, representante_cargo, estado, firmado_en, archivo_nombre, notas')
      .order('fecha_inicio', { ascending: false }).order('id', { ascending: false });
    if (companyId) query = query.eq('empresa_id', companyId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PlatformContract[];
  }

  async saveContract(contract: PlatformContract): Promise<PlatformContract> {
    const { id, numero, archivo, ...rest } = contract;
    const row: Record<string, unknown> = { ...rest, actualizado_en: new Date().toISOString() };
    if (archivo !== undefined) row['archivo'] = archivo;
    const { data, error } = id
      ? await this.db.from('plataforma_contratos').update(row).eq('id', id).select('id, numero').single()
      : await this.db.from('plataforma_contratos').insert(row).select('id, numero').single();
    if (error) throw error;
    return { ...contract, ...(data as { id: number; numero: string }) };
  }

  async deleteContract(id: number): Promise<void> {
    const { data, error } = await this.db.from('plataforma_contratos').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Solo se pueden eliminar contratos en borrador y sin firmar. Los demás se cancelan.');
  }

  async getContractFile(id: number): Promise<string | null> {
    const { data, error } = await this.db.from('plataforma_contratos').select('archivo').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as { archivo?: string | null } | null)?.archivo ?? null;
  }

  // Instalaciones y visitas ---------------------------------------------------------
  async getInstallations(companyId?: number | null): Promise<PlatformInstallation[]> {
    let query = this.db.from('plataforma_instalaciones').select('*').order('empresa_id').order('nombre_equipo');
    if (companyId) query = query.eq('empresa_id', companyId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PlatformInstallation[];
  }

  async saveInstallation(item: PlatformInstallation): Promise<void> {
    const { id, ...rest } = item;
    const row = { ...rest, actualizado_en: new Date().toISOString() };
    const { error } = id
      ? await this.db.from('plataforma_instalaciones').update(row).eq('id', id)
      : await this.db.from('plataforma_instalaciones').insert(row);
    if (error) throw error;
  }

  async deleteInstallation(id: number): Promise<void> {
    const { error } = await this.db.from('plataforma_instalaciones').delete().eq('id', id);
    if (error) throw error;
  }

  async getVisits(filters: { companyId?: number | null; from?: string; to?: string }): Promise<PlatformVisit[]> {
    let query = this.db.from('plataforma_visitas').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }).limit(500);
    if (filters.companyId) query = query.eq('empresa_id', filters.companyId);
    if (filters.from) query = query.gte('fecha', filters.from);
    if (filters.to) query = query.lte('fecha', filters.to);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PlatformVisit[];
  }

  async saveVisit(visit: PlatformVisit): Promise<void> {
    const { id, ...row } = visit;
    const { error } = id
      ? await this.db.from('plataforma_visitas').update(row).eq('id', id)
      : await this.db.from('plataforma_visitas').insert(row);
    if (error) throw error;
  }

  async deleteVisit(id: number): Promise<void> {
    const { error } = await this.db.from('plataforma_visitas').delete().eq('id', id);
    if (error) throw error;
  }

  /** Abre el contrato listo para imprimir y firmar. */
  printContract(c: PlatformContract, company: PlatformCompany | { nombre_comercial: string; razon_social?: string | null; rnc?: string | null; ciudad?: string | null }, planName?: string | null): void {
    const esc = (v: unknown) => String(v ?? '').replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch] as string));
    const money = (n: number) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const date = (d: string | null) => { if (!d) return '—'; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
    const client = esc(company.razon_social || company.nombre_comercial);
    const terms = esc(c.condiciones || DEFAULT_CONTRACT_TERMS).split(/\r?\n/).filter((l) => l.trim()).map((l) => `<p>${l}</p>`).join('');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Contrato ${esc(c.numero)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1b2a3a; margin: 0; padding: 40px; font-size: 14px; line-height: 1.55; }
  .doc { max-width: 720px; margin: 0 auto; }
  .h { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1765d9; padding-bottom: 12px; margin-bottom: 18px; font-family: Arial, sans-serif; }
  .h img { height: 50px; } .h b { font-size: 18px; color: #1765d9; } .h span { display: block; color: #6b819d; font-size: 12px; text-align: right; }
  h1 { text-align: center; font-size: 18px; letter-spacing: .04em; margin: 8px 0 18px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-family: Arial, sans-serif; font-size: 13px; }
  td { padding: 6px 8px; border: 1px solid #d5e0ec; } td:first-child { width: 34%; background: #f4f8fc; color: #4d6a8a; }
  .terms p { margin: 0 0 9px; text-align: justify; }
  .sign { display: flex; justify-content: space-between; gap: 40px; margin-top: 70px; font-family: Arial, sans-serif; font-size: 13px; }
  .sign div { flex: 1; border-top: 1px solid #555; padding-top: 6px; text-align: center; }
  .draft { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 90px; color: rgba(23, 101, 217, .08); transform: rotate(-20deg); font-family: Arial, sans-serif; font-weight: 900; }
  @media print { body { padding: 18mm; } }
</style></head><body><div class="doc">
  ${c.estado === 'Borrador' ? '<div class="draft">BORRADOR</div>' : ''}
  <div class="h"><div><img src="${location.origin}/assets/logosaltor.jpg" alt=""> <b>SaltorSystem</b></div><span>Contrato ${esc(c.numero)}<br>${date(c.fecha_inicio)}</span></div>
  <h1>CONTRATO DE ${esc(c.tipo.toUpperCase())} DE SOFTWARE</h1>
  <p>Entre <b>SALTORSYSTEM</b>, en lo adelante EL PROVEEDOR, y <b>${client}</b>${company.rnc ? `, RNC ${esc(company.rnc)}` : ''}${c.representante_nombre ? `, representada por <b>${esc(c.representante_nombre)}</b>${c.representante_cedula ? `, cédula ${esc(c.representante_cedula)}` : ''}${c.representante_cargo ? `, en calidad de ${esc(c.representante_cargo)}` : ''}` : ''}, en lo adelante EL CLIENTE, se ha convenido lo siguiente:</p>
  <table>
    <tr><td>Modalidad</td><td>${esc(c.tipo)}${planName ? ` · Plan ${esc(planName)}` : ''}</td></tr>
    ${c.descripcion ? `<tr><td>Descripción</td><td>${esc(c.descripcion)}</td></tr>` : ''}
    <tr><td>Monto</td><td>${money(c.monto)} · ${esc(c.periodicidad)}</td></tr>
    <tr><td>Vigencia</td><td>Desde ${date(c.fecha_inicio)}${c.fecha_fin ? ` hasta ${date(c.fecha_fin)}` : ' por tiempo indefinido'}${c.renovacion_automatica ? ' · Renovación automática' : ''}</td></tr>
  </table>
  <div class="terms">${terms}</div>
  <p>Hecho y firmado en dos (2) originales de un mismo tenor${company.ciudad ? `, en ${esc(company.ciudad)}` : ''}, República Dominicana, el ${date(c.firmado_en || c.fecha_inicio)}.</p>
  <div class="sign"><div>Por EL PROVEEDOR<br>SaltorSystem</div><div>Por EL CLIENTE<br>${esc(c.representante_nombre || client)}</div></div>
</div><script>window.onload = () => { window.print(); };</script></body></html>`;
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  // Soporte -----------------------------------------------------------------------------
  async getTickets(filters: { companyId?: number | null; onlyOpen?: boolean } = {}): Promise<SupportTicket[]> {
    let query = this.db.from('plataforma_tickets').select('*').order('ultima_actividad', { ascending: false }).limit(500);
    if (filters.companyId) query = query.eq('empresa_id', filters.companyId);
    if (filters.onlyOpen) query = query.not('estado', 'in', '("Resuelto","Cerrado")');
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as SupportTicket[];
  }

  async createTicket(ticket: { asunto: string; categoria: string; prioridad: string; mensaje: string; empresa_id?: number | null }): Promise<SupportTicket> {
    const { data, error } = await this.db.from('plataforma_tickets')
      .insert({ asunto: ticket.asunto.trim(), categoria: ticket.categoria, prioridad: ticket.prioridad, empresa_id: ticket.empresa_id ?? null })
      .select('*').single();
    if (error) throw error;
    const created = data as SupportTicket;
    await this.addTicketMessage(created.id, ticket.mensaje);
    return created;
  }

  async getTicketMessages(ticketId: number): Promise<TicketMessage[]> {
    const { data, error } = await this.db.from('plataforma_ticket_mensajes').select('*').eq('ticket_id', ticketId).order('creado_en').order('id');
    if (error) throw error;
    return (data ?? []) as TicketMessage[];
  }

  async addTicketMessage(ticketId: number, message: string): Promise<void> {
    const { error } = await this.db.from('plataforma_ticket_mensajes').insert({ ticket_id: ticketId, mensaje: message.trim() });
    if (error) throw error;
  }

  async updateTicket(ticketId: number, changes: Partial<Pick<SupportTicket, 'estado' | 'prioridad' | 'categoria'>>): Promise<void> {
    const { error } = await this.db.from('plataforma_tickets').update(changes).eq('id', ticketId);
    if (error) throw error;
  }

  // Avisos --------------------------------------------------------------------------------
  async getNoticesAdmin(): Promise<PlatformNotice[]> {
    const { data, error } = await this.db.from('plataforma_avisos').select('*').order('desde', { ascending: false }).order('id', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PlatformNotice[];
  }

  /** Avisos vigentes para el usuario actual (la base de datos filtra por empresa y fecha). */
  async getActiveNotices(): Promise<PlatformNotice[]> {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const { data, error } = await this.db.from('plataforma_avisos').select('id, titulo, mensaje, nivel, empresa_id, desde, hasta, activo')
      .eq('activo', true).lte('desde', iso).or(`hasta.is.null,hasta.gte.${iso}`).order('id', { ascending: false });
    if (error) return [];
    return (data ?? []) as PlatformNotice[];
  }

  async saveNotice(notice: PlatformNotice): Promise<void> {
    const { id, ...row } = notice;
    const { error } = id
      ? await this.db.from('plataforma_avisos').update(row).eq('id', id)
      : await this.db.from('plataforma_avisos').insert(row);
    if (error) throw error;
  }

  async deleteNotice(id: number): Promise<void> {
    const { error } = await this.db.from('plataforma_avisos').delete().eq('id', id);
    if (error) throw error;
  }

  // Salud y exportación -------------------------------------------------------------------
  async getHealth(): Promise<CompanyHealth[]> {
    const { data, error } = await this.db.rpc('plataforma_salud');
    if (error) throw error;
    return (data ?? []) as CompanyHealth[];
  }

  async exportCompany(companyId: number): Promise<{ exportado_en: string; tablas: Record<string, Record<string, unknown>[]> }> {
    const { data, error } = await this.db.rpc('plataforma_exportar_empresa', { p_empresa_id: companyId });
    if (error) throw error;
    return data as { exportado_en: string; tablas: Record<string, Record<string, unknown>[]> };
  }

  /** Descarga un archivo generado en el navegador. */
  download(name: string, content: string, type: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  toCsv(rows: Record<string, unknown>[]): string {
    const columns = Array.from(rows.reduce((set, row) => { Object.keys(row).forEach((k) => set.add(k)); return set; }, new Set<string>()));
    const cell = (v: unknown) => {
      const text = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return '\uFEFF' + [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n');
  }

  /** Aviso de la suscripción de la empresa del usuario actual (nunca bloquea). */
  async getNotice(): Promise<SubscriptionNotice | null> {
    const { data, error } = await this.db.rpc('estado_suscripcion');
    if (error) return null;
    return (data ?? null) as SubscriptionNotice | null;
  }

  /** Abre el recibo del pago listo para imprimir. */
  printReceipt(payment: PlatformPayment, company: { nombre_comercial: string; rnc?: string | null; razon_social?: string | null }): void {
    const esc = (v: unknown) => String(v ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
    const money = (n: number) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const date = (d: string) => { const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
    const voided = payment.estado === 'Anulado';
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo ${esc(payment.numero)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #17385c; margin: 0; padding: 32px; }
  .r { max-width: 640px; margin: 0 auto; border: 1px solid #cfdcec; border-radius: 12px; padding: 28px 32px; position: relative; }
  .h { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1765d9; padding-bottom: 14px; margin-bottom: 18px; }
  .h img { height: 54px; } .h h1 { margin: 0; font-size: 22px; color: #102f52; } .h p { margin: 4px 0 0; color: #6b819d; font-size: 13px; }
  .n { text-align: right; } .n b { display: block; font-size: 20px; color: #1765d9; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; } td { padding: 8px 4px; border-bottom: 1px solid #e7eef6; font-size: 14px; }
  td:first-child { color: #6b819d; width: 40%; } .t { font-size: 22px; font-weight: 800; color: #087857; }
  .f { display: flex; justify-content: space-between; margin-top: 48px; font-size: 13px; color: #6b819d; } .f span { border-top: 1px solid #9fb3cb; padding-top: 6px; min-width: 200px; text-align: center; }
  .v { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 72px; color: rgba(200, 30, 50, .18); font-weight: 900; transform: rotate(-18deg); }
  @media print { body { padding: 0; } .r { border: 0; } }
</style></head><body><div class="r">
  ${voided ? '<div class="v">ANULADO</div>' : ''}
  <div class="h"><div><img src="${location.origin}/assets/logosaltor.jpg" alt=""><h1>SaltorSystem</h1><p>Recibo de pago de suscripción</p></div>
  <div class="n">Recibo<b>${esc(payment.numero)}</b><span>${date(payment.fecha)}</span></div></div>
  <table>
    <tr><td>Recibimos de</td><td><b>${esc(company.razon_social || company.nombre_comercial)}</b>${company.rnc ? ` · RNC ${esc(company.rnc)}` : ''}</td></tr>
    <tr><td>Concepto</td><td>Suscripción SaltorSystem · ${payment.meses} mes(es)</td></tr>
    <tr><td>Período cubierto</td><td>${date(payment.periodo_desde)} al ${date(payment.periodo_hasta)}</td></tr>
    <tr><td>Forma de pago</td><td>${esc(payment.forma_pago)}${payment.referencia ? ` · Ref. ${esc(payment.referencia)}` : ''}</td></tr>
    ${payment.notas ? `<tr><td>Notas</td><td>${esc(payment.notas)}</td></tr>` : ''}
    ${voided ? `<tr><td>Anulado</td><td>${esc(payment.motivo_anulacion)}</td></tr>` : ''}
    <tr><td>Monto recibido</td><td class="t">${money(payment.monto)}</td></tr>
  </table>
  <div class="f"><span>Recibido por: ${esc(payment.registrado_por || '')}</span><span>Firma del cliente</span></div>
</div><script>window.onload = () => { window.print(); };</script></body></html>`;
    const win = window.open('', '_blank', 'width=820,height=900');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}
