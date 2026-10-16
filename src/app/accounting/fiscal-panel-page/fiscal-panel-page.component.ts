import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FiscalPanel, FiscalPanelService, FiscalPendingDoc } from '../../core/services/accounting/fiscal-panel.service';

type Severity = 'danger' | 'warn' | 'info';
interface FiscalAlert { severity: Severity; title: string; detail: string; link?: string; }

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOC_LINKS: Record<string, string> = {
  'Factura': '/contabilidad/facturas-pendientes',
  'Nota de crédito': '/contabilidad/notas-credito',
  'Gasto menor': '/contabilidad/gastos-menores',
  'Compra (E41)': '/contabilidad/compras-e41'
};

@Component({
  selector: 'app-fiscal-panel-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './fiscal-panel-page.component.html',
  styleUrls: ['./fiscal-panel-page.component.scss']
})
export class FiscalPanelPageComponent implements OnInit {
  month = '';
  data: FiscalPanel | null = null;
  isLoading = false;
  errorMessage = '';
  pendingType = 'all';
  pendingState = 'all';
  readonly docLinks = DOC_LINKS;

  constructor(private readonly panel: FiscalPanelService) {}

  ngOnInit(): void {
    const today = new Date();
    this.month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    void this.load();
  }

  shiftMonth(delta: number): void {
    const [y, m] = this.month.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    this.month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    void this.load();
  }

  get monthLabel(): string {
    const [y, m] = this.month.split('-').map(Number);
    return y && m ? `${MONTHS[m - 1]} ${y}` : '';
  }
  get isCurrentMonth(): boolean {
    const today = new Date();
    return this.month === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }

  async load(): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(this.month)) return;
    const [y, m] = this.month.split('-').map(Number);
    const from = `${this.month}-01`;
    const last = new Date(y, m, 0).getDate();
    const to = `${this.month}-${String(last).padStart(2, '0')}`;
    this.isLoading = true;
    this.errorMessage = '';
    try { this.data = await this.panel.get(from, to); }
    catch (error) {
      this.data = null;
      const message = String((error as { message?: string })?.message ?? '');
      this.errorMessage = /panel_fiscal/.test(message) ? 'Falta aplicar la migración del panel fiscal en la base de datos.' : message || 'No se pudo cargar el panel fiscal.';
    } finally { this.isLoading = false; }
  }

  // ---- Alertas --------------------------------------------------------------
  get alerts(): FiscalAlert[] {
    const d = this.data;
    if (!d) return [];
    const list: FiscalAlert[] = [];
    const env = (d.ambiente ?? '').toUpperCase();
    if (env && env !== 'PROD') {
      list.push({ severity: 'warn', title: `Ambiente DGII de pruebas (${d.ambiente})`,
        detail: 'Los e-CF se envían a un ambiente que no es el de producción; no tienen validez fiscal. Cámbialo en Configuración → Otros ajustes cuando la DGII te habilite.', link: '/configuracion/otros' });
    }

    const cert = d.certificado;
    if (!cert?.valido_hasta) list.push({ severity: 'danger', title: 'No hay certificado digital cargado', detail: 'Sin certificado no se pueden firmar ni enviar e-CF.', link: '/configuracion/otros' });
    else if ((cert.dias_restantes ?? 0) < 0) list.push({ severity: 'danger', title: 'El certificado digital está vencido', detail: `Venció el ${this.formatDate(cert.valido_hasta)}. Carga uno nuevo para seguir enviando e-CF.`, link: '/configuracion/otros' });
    else if ((cert.dias_restantes ?? 0) <= 30) list.push({ severity: 'danger', title: `El certificado digital vence en ${cert.dias_restantes} días`, detail: `Vence el ${this.formatDate(cert.valido_hasta)}. Solicita la renovación ya.`, link: '/configuracion/otros' });
    else if ((cert.dias_restantes ?? 0) <= 60) list.push({ severity: 'warn', title: `El certificado digital vence en ${cert.dias_restantes} días`, detail: `Vence el ${this.formatDate(cert.valido_hasta)}.`, link: '/configuracion/otros' });

    d.secuencias.forEach((s) => {
      const name = `${s.serie} · ${this.shortType(s.tipo_ncf)}`;
      if (s.restantes <= 0) list.push({ severity: 'danger', title: `Secuencia ${name} agotada`, detail: 'Solicita una nueva autorización en la DGII y regístrala en Tipos de NCF.', link: '/contabilidad/e-ncf' });
      else if (s.pct_usado >= s.porcentaje_alerta) list.push({ severity: 'warn', title: `Secuencia ${name} al ${s.pct_usado}%`, detail: `Quedan ${s.restantes} de ${s.total} comprobantes.`, link: '/contabilidad/e-ncf' });
      if (s.dias_para_vencer !== null && s.dias_para_vencer < 0) list.push({ severity: 'danger', title: `Secuencia ${name} vencida`, detail: `Venció el ${s.fecha_vencimiento}.`, link: '/contabilidad/e-ncf' });
      else if (s.dias_para_vencer !== null && s.dias_para_vencer <= 30) list.push({ severity: 'danger', title: `Secuencia ${name} vence en ${s.dias_para_vencer} días`, detail: `Vence el ${s.fecha_vencimiento}; quedan ${s.restantes} sin usar.`, link: '/contabilidad/e-ncf' });
      else if (s.dias_para_vencer !== null && s.dias_para_vencer <= 90) list.push({ severity: 'info', title: `Secuencia ${name} vence en ${s.dias_para_vencer} días`, detail: `Vence el ${s.fecha_vencimiento}; quedan ${s.restantes} sin usar.`, link: '/contabilidad/e-ncf' });
    });

    const rejected = d.ecf_pendientes.filter((p) => p.estado === 'Rechazado');
    if (rejected.length) list.push({ severity: 'danger', title: `${rejected.length} comprobante(s) rechazado(s) por la DGII`, detail: 'Revisa el motivo en la lista de abajo y corrígelos con una nota de crédito o reenvío.' });
    const late = d.ecf_pendientes.filter((p) => p.estado === 'Sin enviar' && p.dias >= 1);
    if (late.length) list.push({ severity: 'warn', title: `${late.length} comprobante(s) sin enviar a la DGII`, detail: 'Los e-CF deben enviarse a la DGII al emitirse. Envíalos desde Facturas pendientes.', link: '/contabilidad/facturas-pendientes' });
    const inProcess = d.ecf_pendientes.filter((p) => p.estado === 'En proceso' && p.dias >= 1);
    if (inProcess.length) list.push({ severity: 'info', title: `${inProcess.length} comprobante(s) enviados sin respuesta final`, detail: 'Consulta su estado nuevamente en la DGII.' });

    const order: Record<Severity, number> = { danger: 0, warn: 1, info: 2 };
    return list.sort((a, b) => order[a.severity] - order[b.severity]);
  }
  get alertCounts() { const a = this.alerts; return { danger: a.filter((x) => x.severity === 'danger').length, warn: a.filter((x) => x.severity === 'warn').length }; }

  // ---- Pendientes ------------------------------------------------------------
  get pendingTypes(): string[] { return [...new Set((this.data?.ecf_pendientes ?? []).map((p) => p.tipo_doc))]; }
  get pending(): FiscalPendingDoc[] {
    return (this.data?.ecf_pendientes ?? [])
      .filter((p) => (this.pendingType === 'all' || p.tipo_doc === this.pendingType) && (this.pendingState === 'all' || p.estado === this.pendingState))
      .sort((a, b) => (a.estado === 'Rechazado' ? 0 : 1) - (b.estado === 'Rechazado' ? 0 : 1) || b.fecha.localeCompare(a.fecha));
  }
  acceptedPct(row: { total: number; aceptados: number; condicionales: number }): number { return row.total ? (row.aceptados + row.condicionales) / row.total * 100 : 0; }

  exportPending(): void {
    const rows = this.pending.map((p) => [p.tipo_doc, p.numero, p.encf, this.formatDate(p.fecha), p.tercero ?? '', p.total, p.estado, p.mensaje ?? '']);
    const escape = (v: string | number) => { const t = String(v ?? ''); return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const csv = '﻿' + [['Documento', 'Número', 'e-NCF', 'Fecha', 'Cliente / tercero', 'Total', 'Estado DGII', 'Mensaje'], ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `ecf-pendientes-${this.month}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ---- Utilidades ------------------------------------------------------------
  money(value: number | null | undefined): string { return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(Number(value ?? 0)); }
  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : value;
  }
  shortType(value: string): string { return value.replace(/^\d+\s*-\s*/, '').replace(/ Electronica$/i, ''); }
  stateClass(state: string): string {
    return ({ 'Rechazado': 'is-bad', 'Sin enviar': 'is-warn', 'En proceso': 'is-info', 'Aceptado': 'is-ok', 'Aceptado condicional': 'is-ok' } as Record<string, string>)[state] ?? '';
  }
}
