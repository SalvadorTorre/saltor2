import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth/auth.service';
import { DashboardService, DashboardSummary } from '../../core/services/dashboard/dashboard.service';

interface StatCard { label: string; value: string; hint: string; trend?: 'up' | 'down' | ''; tone: string; icon: string; link?: string; }
interface AlertItem { text: string; detail?: string; link?: string; }
interface AlertGroup { title: string; icon: 'alert' | 'box' | 'fiscal' | 'money'; tone: 'danger' | 'warning' | 'info'; items: AlertItem[]; more?: { text: string; link: string }; }
interface ChartPoint { label: string; value: string; x: number; y: number; showLabel: boolean; highlight: boolean; }

const CATEGORY_COLORS = ['#2563eb', '#14b8a6', '#f97316', '#ef4444', '#8b5cf6', '#94a3b8'];

@Component({ selector: 'app-dashboard-page', standalone: true, imports: [CommonModule, RouterLink], templateUrl: './dashboard-page.component.html', styleUrls: ['./dashboard-page.component.scss'] })
export class DashboardPageComponent implements OnInit {
  isLoading = true;
  errorMessage = '';
  companyName = '';
  updatedAt = '';
  chartDays: 7 | 30 = 7;
  data: DashboardSummary | null = null;

  statCards: StatCard[] = [];
  topProducts: Array<{ name: string; quantity: number; amount: string }> = [];
  alertGroups: AlertGroup[] = [];
  categories: Array<{ label: string; percent: number; color: string; amount: string }> = [];
  donutBackground = '';
  inventoryFlow: Array<{ label: string; value: number; width: number; tone: string }> = [];
  transactions: Array<{ date: string; invoice: string; client: string; total: string; status: string }> = [];

  constructor(private readonly auth: AuthService, private readonly dashboard: DashboardService) {}
  ngOnInit(): void { void this.loadDashboard(); }

  async loadDashboard(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const session = await this.auth.restoreSession();
      if (!session) throw new Error('No se encontró una sesión activa.');
      this.companyName = session.companyName;
      this.data = await this.dashboard.getSummary();
      this.applyData(this.data);
      this.updatedAt = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? '');
      this.errorMessage = /dashboard_inicio/.test(message) ? 'Falta aplicar la migración del resumen de Inicio en la base de datos.' : message || 'No fue posible cargar el resumen de Inicio.';
    } finally { this.isLoading = false; }
  }

  setChartDays(days: 7 | 30): void { this.chartDays = days; }

  get salesSeries(): ChartPoint[] {
    const rows = (this.data?.serie_30 ?? []).slice(-this.chartDays);
    if (!rows.length) return [];
    const max = Math.max(1, ...rows.map((row) => Number(row.total)));
    const maxIndex = rows.findIndex((row) => Number(row.total) === max);
    const step = rows.length > 1 ? 92 / (rows.length - 1) : 0;
    return rows.map((row, index) => {
      const date = new Date(`${row.fecha}T12:00:00`);
      const label = this.chartDays === 7
        ? date.toLocaleDateString('es-DO', { weekday: 'short' }).replace('.', '')
        : `${row.fecha.slice(8, 10)}/${row.fecha.slice(5, 7)}`;
      return {
        label, value: this.money(Number(row.total)),
        x: 4 + index * step, y: 6 + Math.round((Number(row.total) / max) * 84),
        showLabel: this.chartDays === 7 || index % 5 === (rows.length - 1) % 5,
        highlight: index === maxIndex || index === rows.length - 1
      };
    });
  }
  get chartLine(): string { return this.salesSeries.map((p) => `${p.x},${100 - p.y}`).join(' '); }
  get chartArea(): string {
    const pts = this.salesSeries;
    return pts.length ? `${pts[0].x},100 ${this.chartLine} ${pts[pts.length - 1].x},100` : '';
  }
  get chartTotal(): string { return this.money((this.data?.serie_30 ?? []).slice(-this.chartDays).reduce((s, r) => s + Number(r.total), 0)); }

  private applyData(d: DashboardSummary): void {
    const v = d.ventas;
    const dayTrend = this.trend(v.hoy, v.ayer);
    const monthTrend = this.trend(v.mes, v.mes_anterior_corte);
    const stockIssues = d.stock.negativos + d.stock.bajo_minimo;
    const fiscalIssues = d.fiscal.rechazados + d.fiscal.sin_enviar;
    this.statCards = [
      { label: 'Ventas del Día', value: this.money(v.hoy), hint: `${v.hoy_facturas} fact. · ${dayTrend.text} vs ayer`, trend: dayTrend.dir, tone: 'success', icon: 'sale', link: '/reportes/analisis' },
      { label: 'Ventas del Mes', value: this.money(v.mes), hint: `${v.mes_facturas} fact. · ${monthTrend.text} vs mes ant.`, trend: monthTrend.dir, tone: 'primary', icon: 'wallet', link: '/reportes/analisis' },
      { label: 'Por Cobrar', value: this.money(d.cxc.saldo), hint: d.cxc.vencido ? `${this.money(d.cxc.vencido)} vencido` : `${d.cxc.clientes} cliente(s)`, tone: d.cxc.vencido ? 'danger' : 'emerald', icon: 'bag', link: '/contabilidad/cuentas-por-cobrar' },
      { label: 'Pendientes DGII', value: fiscalIssues.toLocaleString('es-DO'), hint: d.fiscal.rechazados ? `${d.fiscal.rechazados} rechazado(s)` : (d.fiscal.sin_enviar ? 'Sin enviar' : 'Todo aceptado'), tone: fiscalIssues ? 'danger' : 'sky', icon: 'file', link: '/contabilidad/panel-fiscal' },
      { label: 'Stock Bajo', value: stockIssues.toLocaleString('es-DO'), hint: d.stock.negativos ? `${d.stock.negativos} en negativo` : (stockIssues ? 'Requiere revisión' : 'Inventario al día'), tone: 'danger', icon: 'alert', link: '/mantenimiento/kardex' }
    ];

    this.topProducts = d.top_productos.map((p) => ({ name: p.nombre, quantity: Number(p.cantidad), amount: this.money(Number(p.total)) }));

    // Categorías: las 5 principales + "Otras".
    const totalCat = d.categorias.reduce((s, c) => s + Number(c.total), 0);
    const main = d.categorias.slice(0, 5);
    const rest = d.categorias.slice(5).reduce((s, c) => s + Number(c.total), 0);
    const cats = [...main.map((c) => ({ label: c.nombre, value: Number(c.total) })), ...(rest > 0 ? [{ label: 'Otras', value: rest }] : [])];
    this.categories = cats.map((c, i) => ({ label: c.label, value: c.value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], percent: totalCat ? Math.round(c.value / totalCat * 1000) / 10 : 0, amount: this.money(c.value) }));
    let acc = 0;
    const stops = this.categories.map((c) => { const from = acc; acc += totalCat ? (cats.find((x) => x.label === c.label)!.value / totalCat * 100) : 0; return `${c.color} ${from}% ${acc}%`; });
    this.donutBackground = `radial-gradient(circle at center, #fff 0 34%, transparent 35%), ${stops.length ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(#e2e8f0 0 100%)'}`;

    const inv = d.inventario_mes;
    const maxInv = Math.max(1, inv.entradas, inv.salidas);
    this.inventoryFlow = [
      { label: 'Entradas del mes', value: Number(inv.entradas), width: Number(inv.entradas) / maxInv * 100, tone: 'green' },
      { label: 'Salidas del mes', value: Number(inv.salidas), width: Number(inv.salidas) / maxInv * 100, tone: 'orange' },
      { label: 'Ajustes del mes', value: Number(inv.ajustes), width: Math.min(100, Number(inv.ajustes) * 10), tone: 'blue' }
    ];

    this.alertGroups = this.buildAlerts(d);
    this.transactions = d.ultimas.map((t) => ({ date: this.date(t.fecha), invoice: t.numero, client: t.cliente, total: this.money(Number(t.total)), status: t.estado }));
  }

  private buildAlerts(d: DashboardSummary): AlertGroup[] {
    const groups: AlertGroup[] = [];
    const fiscal: AlertItem[] = [];
    if ((d.fiscal.ambiente ?? '').toUpperCase() !== 'PROD') fiscal.push({ text: `Ambiente DGII en ${d.fiscal.ambiente || 'sin configurar'}`, detail: 'Los e-CF no tienen validez fiscal' });
    if (d.fiscal.rechazados) fiscal.push({ text: `${d.fiscal.rechazados} comprobante(s) rechazado(s)` });
    if (d.fiscal.sin_enviar) fiscal.push({ text: `${d.fiscal.sin_enviar} comprobante(s) sin enviar` });
    if (d.fiscal.secuencias_alerta) fiscal.push({ text: `${d.fiscal.secuencias_alerta} secuencia(s) por agotarse o vencer` });
    if (d.fiscal.certificado_dias === null) fiscal.push({ text: 'No hay certificado digital cargado' });
    else if (d.fiscal.certificado_dias <= 60) fiscal.push({ text: d.fiscal.certificado_dias < 0 ? 'Certificado digital vencido' : `Certificado vence en ${d.fiscal.certificado_dias} días` });
    if (fiscal.length) groups.push({ title: 'Fiscal / DGII', icon: 'fiscal', tone: 'danger', items: fiscal, more: { text: 'Abrir panel fiscal', link: '/contabilidad/panel-fiscal' } });

    if (d.stock.lista.length) groups.push({
      title: `Stock bajo (${d.stock.negativos + d.stock.bajo_minimo})`, icon: 'alert', tone: 'warning',
      items: d.stock.lista.slice(0, 5).map((p) => ({ text: `${p.codigo} · ${p.descripcion}`, detail: Number(p.existencia) < 0 ? `Existencia negativa: ${p.existencia}` : `Quedan ${p.existencia} (mín. ${p.existenciamin})` })),
      more: { text: 'Ver en Kardex', link: '/mantenimiento/kardex' }
    });

    if (d.cxc.facturas_vencidas) groups.push({
      title: 'Cuentas por cobrar', icon: 'money', tone: 'danger',
      items: [{ text: `${this.money(d.cxc.vencido)} vencido`, detail: `${d.cxc.facturas_vencidas} factura(s) vencida(s)` }],
      more: { text: 'Ver cuentas por cobrar', link: '/contabilidad/cuentas-por-cobrar' }
    });

    if (d.cotizaciones.por_vencer) groups.push({
      title: 'Cotizaciones', icon: 'box', tone: 'info',
      items: [{ text: `${d.cotizaciones.por_vencer} cotización(es) vencen esta semana`, detail: `${d.cotizaciones.activas} activas por ${this.money(d.cotizaciones.monto_activas)}` }],
      more: { text: 'Ver cotizaciones', link: '/cotizaciones' }
    });

    if (d.sin_movimiento.cantidad) groups.push({
      title: `Sin ventas en 60 días (${d.sin_movimiento.cantidad})`, icon: 'box', tone: 'info',
      items: d.sin_movimiento.lista.slice(0, 5).map((p) => ({ text: `${p.codigo} · ${p.descripcion}`, detail: `${p.existencia} en inventario · ${p.ultima_venta ? `última venta hace ${p.dias} días` : 'nunca vendido'}` })),
      more: d.sin_movimiento.valor ? { text: `Inventario detenido: ${this.money(d.sin_movimiento.valor)} al costo`, link: '/mantenimiento/kardex' } : undefined
    });
    return groups;
  }

  statusClass(status: string): string {
    if (status === 'Anulada' || status === 'Rechazado') return 'status-pill--cancelled';
    if (status === 'Aceptado' || status === 'Aceptado condicional') return '';
    return 'status-pill--pending';
  }

  private trend(current: number, previous: number): { text: string; dir: 'up' | 'down' | '' } {
    if (!previous) return { text: current ? 'nuevo' : '—', dir: current ? 'up' : '' };
    const pct = (current - previous) / previous * 100;
    return { text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toLocaleString('es-DO', { maximumFractionDigits: 0 })}%`, dir: pct >= 0 ? 'up' : 'down' };
  }
  money(value: number): string { return `RD$${Number(value ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  private date(value: string): string { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-DO') : 'N/D'; }
}
