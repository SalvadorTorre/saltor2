import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SupabaseService } from '../../core/services/supabase/supabase.service';

interface CancelledRow {
  id: number;
  invoiceNumber: string;
  ncf: string;
  kind: 'NCF' | 'e-NCF' | 'Sin NCF';
  ncfType: string;
  invoiceDate: string;
  cancelledAt: string;
  cancelledBy: string;
  typeCode: number | null;
  typeDescription: string;
  reason: string;
  client: string;
  total: number;
}

/**
 * Comprobantes anulados por mes.  El TXT del Formato 608 solo incluye NCF de
 * serie B: los e-NCF se anulan con nota de crédito o ANECF, no por el 608.
 */
@Component({
  selector: 'app-cancelled-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cancelled-page.component.html',
  styleUrls: ['./cancelled-page.component.scss']
})
export class CancelledInvoicesPageComponent implements OnInit {
  period = this.currentPeriod();
  rows: CancelledRow[] = [];
  isLoading = false;
  errorMessage = '';
  search = '';
  companyRnc = '';

  constructor(private readonly supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    void this.loadCompanyRnc();
    await this.load();
  }

  async load(): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(this.period)) return;
    this.isLoading = true;
    this.errorMessage = '';
    const [year, month] = this.period.split('-').map(Number);
    const from = new Date(year, month - 1, 1).toISOString();
    const to = new Date(year, month, 1).toISOString();
    try {
      const { data, error } = await this.supabase.client
        .from('comprobantes_anulados')
        .select('*')
        .gte('anulada_en', from)
        .lt('anulada_en', to)
        .order('anulada_en', { ascending: true });
      if (error) throw error;
      this.rows = (data ?? []).map((r: any) => ({
        id: Number(r.id),
        invoiceNumber: r.numero_factura ?? '',
        ncf: r.ncf ?? '',
        kind: r.tipo_comprobante,
        ncfType: r.tipo_ncf ?? '',
        invoiceDate: r.fecha_factura,
        cancelledAt: r.anulada_en,
        cancelledBy: r.anulada_por ?? '',
        typeCode: r.tipo_anulacion == null ? null : Number(r.tipo_anulacion),
        typeDescription: r.tipo_anulacion_descripcion ?? 'Sin tipo registrado',
        reason: r.motivo_anulacion ?? '',
        client: r.cliente_nombre ?? '',
        total: Number(r.total ?? 0)
      }));
    } catch (error) {
      this.errorMessage = (error as { message?: string })?.message || 'No se pudieron consultar los comprobantes anulados.';
    } finally {
      this.isLoading = false;
    }
  }

  get filteredRows(): CancelledRow[] {
    const term = this.search.trim().toLowerCase();
    return term ? this.rows.filter((r) => `${r.invoiceNumber} ${r.ncf} ${r.client} ${r.reason} ${r.typeDescription}`.toLowerCase().includes(term)) : this.rows;
  }

  get ncfRows(): CancelledRow[] { return this.rows.filter((r) => r.kind === 'NCF'); }
  get encfRows(): CancelledRow[] { return this.rows.filter((r) => r.kind === 'e-NCF'); }
  get totalAmount(): number { return this.rows.reduce((t, r) => t + r.total, 0); }
  get missingType(): CancelledRow[] { return this.ncfRows.filter((r) => !r.typeCode); }

  /** TXT del 608: encabezado y detalle separados por "|", como los formatos 606/607. */
  download608(): void {
    if (!this.ncfRows.length || this.missingType.length || !this.companyRnc) return;
    const periodCode = this.period.replace('-', '');
    const lines = [
      ['608', this.companyRnc, periodCode, String(this.ncfRows.length)].join('|'),
      ...this.ncfRows.map((r) => [r.ncf, r.invoiceDate.replace(/-/g, '').slice(0, 8), String(r.typeCode).padStart(2, '0')].join('|'))
    ];
    this.download(`DGII_F_608_${this.companyRnc}_${periodCode}.TXT`, lines.join('\r\n') + '\r\n', 'text/plain');
  }

  downloadCsv(): void {
    const head = ['Factura', 'Comprobante', 'Tipo', 'Fecha comprobante', 'Fecha anulacion', 'Anulada por', 'Tipo anulacion', 'Motivo', 'Cliente', 'Total'];
    const body = this.rows.map((r) => [r.invoiceNumber, r.ncf, r.kind, r.invoiceDate, r.cancelledAt?.slice(0, 10), r.cancelledBy,
      r.typeCode ? `${String(r.typeCode).padStart(2, '0')} ${r.typeDescription}` : '', r.reason, r.client, r.total.toFixed(2)]);
    const csv = [head, ...body].map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    this.download(`anulados_${this.period}.csv`, '﻿' + csv, 'text/csv');
  }

  typeLabel(r: CancelledRow): string { return r.typeCode ? `${String(r.typeCode).padStart(2, '0')} · ${r.typeDescription}` : 'Sin tipo'; }
  money(v: number): string { return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(v || 0); }
  date(v: string): string { if (!v) return ''; const [y, m, d] = v.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }

  private download(name: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  private async loadCompanyRnc(): Promise<void> {
    try {
      const companyId = JSON.parse(localStorage.getItem('saltor.activeUser') ?? '{}').companyId;
      const { data } = await this.supabase.client.from('empresas').select('rnc').eq('id', companyId).maybeSingle();
      this.companyRnc = String(data?.rnc ?? '').replace(/\D/g, '');
    } catch { this.companyRnc = ''; }
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
