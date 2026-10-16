import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalesAnalysis, SalesAnalysisService } from '../../core/services/reports/sales-analysis.service';

type Period = 'today' | 'week' | 'month' | 'lastMonth' | 'quarter' | 'year' | 'all' | 'custom';
type ProductSort = 'neto' | 'margen' | 'pct' | 'cantidad';
interface Bar { label: string; value: number; pct: number; hint?: string; }

const WEEK_DAYS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

@Component({
  selector: 'app-sales-analysis-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analysis-page.component.html',
  styleUrls: ['./analysis-page.component.scss']
})
export class SalesAnalysisPageComponent implements OnInit {
  readonly periods: Array<{ value: Period; label: string }> = [
    { value: 'today', label: 'Hoy' }, { value: 'week', label: 'Esta semana' }, { value: 'month', label: 'Este mes' },
    { value: 'lastMonth', label: 'Mes anterior' }, { value: 'quarter', label: 'Trimestre' }, { value: 'year', label: 'Este año' },
    { value: 'all', label: 'Todo' }, { value: 'custom', label: 'Personalizado' }
  ];
  period: Period = 'month';
  dateFrom = '';
  dateTo = '';
  data: SalesAnalysis | null = null;
  isLoading = false;
  errorMessage = '';
  productSort: ProductSort = 'neto';
  showAllProducts = false;

  constructor(private readonly analysis: SalesAnalysisService) {}

  ngOnInit(): void { this.setPeriod('month'); }

  setPeriod(period: Period): void {
    this.period = period;
    if (period === 'custom') return;
    const today = new Date();
    let start: Date | null = new Date(today);
    let end: Date | null = new Date(today);
    if (period === 'week') start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    if (period === 'month') start.setDate(1);
    if (period === 'lastMonth') { start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); }
    if (period === 'quarter') start.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
    if (period === 'year') start.setMonth(0, 1);
    if (period === 'all') { start = null; end = null; }
    this.dateFrom = start ? this.toDateInput(start) : '';
    this.dateTo = end ? this.toDateInput(end) : '';
    void this.load();
  }

  async load(): Promise<void> {
    if (this.dateFrom && this.dateTo && this.dateFrom > this.dateTo) { this.errorMessage = 'La fecha inicial no puede ser mayor que la final.'; return; }
    this.isLoading = true;
    this.errorMessage = '';
    try { this.data = await this.analysis.get(this.dateFrom, this.dateTo); }
    catch (error) {
      this.data = null;
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
      this.errorMessage = /reporte_ventas_analisis/.test(message)
        ? 'Falta aplicar la migración del análisis de ventas en la base de datos.'
        : message || 'No se pudo cargar el análisis de ventas.';
    } finally { this.isLoading = false; }
  }

  // ---- Resumen ------------------------------------------------------------
  get s() { return this.data?.resumen; }
  get averageTicket(): number { return this.s?.facturas ? this.s.total / this.s.facturas : 0; }
  get grossMargin(): number { return this.s ? this.s.neto_lineas - this.s.costo : 0; }
  get grossMarginPct(): number { return this.s?.neto_lineas ? this.grossMargin / this.s.neto_lineas * 100 : 0; }
  get creditPct(): number { return this.s?.total ? this.s.credito / this.s.total * 100 : 0; }
  get prev() { return this.data?.anterior ?? null; }
  get prevMargin(): number { return this.prev ? this.prev.neto_lineas - this.prev.costo : 0; }
  get prevAverage(): number { return this.prev?.facturas ? this.prev.total / this.prev.facturas : 0; }
  change(current: number, previous: number | undefined | null): number | null {
    if (previous === undefined || previous === null || !this.prev) return null;
    if (!previous) return current ? 100 : 0;
    return (current - previous) / Math.abs(previous) * 100;
  }
  changeText(current: number, previous: number): string {
    const c = this.change(current, previous);
    if (c === null) return '';
    if (Math.abs(c) < 0.05) return '= igual al período anterior';
    return `${c > 0 ? '▲' : '▼'} ${Math.abs(c).toLocaleString('es-DO', { maximumFractionDigits: 1 })}% vs período anterior`;
  }
  get periodLabel(): string {
    if (!this.dateFrom && !this.dateTo) return 'Todo el historial';
    return `${this.formatDate(this.dateFrom)} al ${this.formatDate(this.dateTo)}`;
  }

  // ---- Gráficos -----------------------------------------------------------
  get trend(): Bar[] {
    const rows = this.data?.por_dia ?? [];
    const first = rows[0]?.fecha;
    const last = rows[rows.length - 1]?.fecha;
    const spanDays = first && last ? (Date.parse(last) - Date.parse(first)) / 86400000 : 0;
    let points: Array<{ label: string; value: number; hint: string }>;
    if (spanDays > 62) {
      const months = new Map<string, { total: number; facturas: number }>();
      rows.forEach((row) => {
        const key = row.fecha.slice(0, 7);
        const current = months.get(key) ?? { total: 0, facturas: 0 };
        current.total += Number(row.total); current.facturas += Number(row.facturas);
        months.set(key, current);
      });
      points = [...months.entries()].map(([key, value]) => ({
        label: `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`, value: value.total, hint: `${value.facturas} facturas`
      }));
    } else {
      points = rows.map((row) => ({ label: `${row.fecha.slice(8, 10)}/${row.fecha.slice(5, 7)}`, value: Number(row.total), hint: `${row.facturas} facturas` }));
    }
    return this.toBars(points);
  }
  get trendIsMonthly(): boolean { const t = this.trend; return t.length > 0 && /[a-z]/.test(t[0].label); }
  get paymentBars(): Bar[] { return this.toBars((this.data?.por_forma_pago ?? []).map((r) => ({ label: r.nombre, value: Number(r.total), hint: `${r.facturas} fact.` })), true); }
  get sellerBars(): Bar[] { return this.toBars((this.data?.por_vendedor ?? []).map((r) => ({ label: r.nombre, value: Number(r.total), hint: `${r.facturas} fact. · prom. ${this.money(Number(r.promedio))}` })), true); }
  get weekdayBars(): Bar[] {
    const byDay = new Map((this.data?.por_dia_semana ?? []).map((r) => [r.dia, r]));
    return this.toBars([1, 2, 3, 4, 5, 6, 7].map((day) => ({ label: WEEK_DAYS[day], value: Number(byDay.get(day)?.total ?? 0), hint: `${byDay.get(day)?.facturas ?? 0} fact.` })));
  }
  get hourBars(): Bar[] {
    const rows = this.data?.por_hora ?? [];
    if (!rows.length) return [];
    const byHour = new Map(rows.map((r) => [r.hora, r]));
    const from = Math.min(...rows.map((r) => r.hora));
    const to = Math.max(...rows.map((r) => r.hora));
    const points = [];
    for (let h = from; h <= to; h++) points.push({ label: `${h}h`, value: Number(byHour.get(h)?.total ?? 0), hint: `${byHour.get(h)?.facturas ?? 0} fact.` });
    return this.toBars(points);
  }
  get bestWeekday(): string { const best = [...this.weekdayBars].sort((a, b) => b.value - a.value)[0]; return best?.value ? best.label : '—'; }
  get bestHour(): string { const best = [...this.hourBars].sort((a, b) => b.value - a.value)[0]; return best?.value ? best.label.replace('h', ':00') : '—'; }

  // ---- Tablas -------------------------------------------------------------
  get categories() { return (this.data?.por_categoria ?? []).map((r) => ({ ...r, pct: this.pctOf(r.margen, r.neto), share: this.pctOf(r.neto, this.s?.neto_lineas ?? 0) })); }
  get wholesale() { return (this.data?.mayor_detalle ?? []).map((r) => ({ ...r, pct: this.pctOf(r.margen, r.neto), share: this.pctOf(r.neto, this.s?.neto_lineas ?? 0) })); }
  get products() {
    const rows = (this.data?.por_producto ?? []).map((r) => ({ ...r, pct: this.pctOf(Number(r.margen), Number(r.neto)) }));
    const key = this.productSort;
    rows.sort((a, b) => Number(b[key]) - Number(a[key]));
    return this.showAllProducts ? rows : rows.slice(0, 15);
  }
  get productCount(): number { return this.data?.por_producto.length ?? 0; }
  get losingProducts(): number { return (this.data?.por_producto ?? []).filter((r) => Number(r.margen) < 0).length; }
  get clients() { return (this.data?.por_cliente ?? []).map((r) => ({ ...r, share: this.pctOf(r.total, this.s?.total ?? 0) })); }
  get creditNotesTotal(): number { return (this.data?.notas_credito ?? []).reduce((sum, r) => sum + Number(r.total), 0); }
  get creditNotesPct(): number { return this.pctOf(this.creditNotesTotal, this.s?.total ?? 0); }
  get quoteConversion(): number { const q = this.data?.cotizaciones; return q?.cantidad ? q.facturadas / q.cantidad * 100 : 0; }

  // ---- Exportar -----------------------------------------------------------
  exportProducts(): void {
    const rows = (this.data?.por_producto ?? []).map((r) => [r.codigo, r.nombre, r.cantidad, r.neto, r.costo, r.margen, this.pctOf(Number(r.margen), Number(r.neto)).toFixed(1), r.costo_estimado ? 'Sí' : 'No']);
    this.downloadCsv('margen-por-producto', ['Código', 'Producto', 'Cantidad', 'Venta neta', 'Costo', 'Margen', 'Margen %', 'Costo estimado'], rows);
  }
  exportClients(): void {
    const rows = (this.data?.por_cliente ?? []).map((r) => [r.nombre, r.rnc ?? '', r.facturas, r.total, this.formatDate(r.ultima_compra)]);
    this.downloadCsv('ventas-por-cliente', ['Cliente', 'RNC/Cédula', 'Facturas', 'Total', 'Última compra'], rows);
  }

  // ---- Utilidades ---------------------------------------------------------
  money(value: number | null | undefined): string { return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 2 }).format(Number(value ?? 0)); }
  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : value;
  }
  private pctOf(part: number, whole: number): number { return whole ? Number(part) / Number(whole) * 100 : 0; }
  private toBars(points: Array<{ label: string; value: number; hint?: string }>, shareHint = false): Bar[] {
    const max = Math.max(0, ...points.map((p) => p.value));
    const sum = points.reduce((acc, p) => acc + p.value, 0);
    return points.map((p) => ({
      label: p.label, value: p.value, pct: max ? Math.max(p.value > 0 ? 2 : 0, p.value / max * 100) : 0,
      hint: shareHint && sum ? `${(p.value / sum * 100).toFixed(1)}% · ${p.hint ?? ''}` : p.hint
    }));
  }
  private downloadCsv(name: string, header: string[], rows: Array<Array<string | number | null>>): void {
    const escape = (value: string | number | null) => { const text = String(value ?? ''); return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
    const csv = '﻿' + [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `${name}-${this.dateFrom || 'inicio'}-a-${this.dateTo || 'hoy'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  private toDateInput(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
