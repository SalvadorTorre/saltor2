import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth/auth.service';
import { SupabaseService } from '../../core/services/supabase/supabase.service';

interface InvoiceRow { id: number; numero_factura: string; fecha_factura: string; cliente_nombre: string | null; total: number | string | null; estado: string | null; dgii_estado: string | null; }
interface DetailRow { factura_id: number; descripcion: string; cantidad: number | string; total_linea: number | string; }
interface ProductRow { descripcion: string; existencia: number | string | null; existencia_minima: number | string | null; }

@Component({ selector: 'app-dashboard-page', standalone: true, imports: [CommonModule], templateUrl: './dashboard-page.component.html', styleUrls: ['./dashboard-page.component.scss'] })
export class DashboardPageComponent implements OnInit {
  isLoading = true;
  errorMessage = '';
  companyName = '';
  updatedAt = '';
  statCards: Array<{ label: string; value: string; hint: string; tone: string; icon: string }> = [];
  salesSeries: Array<{ label: string; value: string; x: number; y: number }> = [];
  topProducts: Array<{ name: string; quantity: number; amount: string }> = [];
  alertGroups: Array<{ title: string; icon: string; items: string[] }> = [];
  categories: Array<{ label: string; percent: number; color: string }> = [];
  inventoryFlow: Array<{ label: string; value: number; width: number; tone: string }> = [];
  transactions: Array<{ date: string; invoice: string; client: string; total: string; status: string }> = [];

  constructor(private readonly auth: AuthService, private readonly supabase: SupabaseService) {}
  ngOnInit(): void { void this.loadDashboard(); }

  async loadDashboard(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const session = await this.auth.restoreSession();
      if (!session) throw new Error('No se encontró una sesión activa.');
      this.companyName = session.companyName;
      const { data, error } = await this.supabase.client.from('facturas')
        .select('id, numero_factura, fecha_factura, cliente_nombre, total, estado, dgii_estado')
        .eq('idempres', session.companyId).order('fecha_factura', { ascending: false }).order('id', { ascending: false });
      if (error) throw error;
      const invoices = (data ?? []) as InvoiceRow[];
      const invoiceIds = invoices.map((invoice) => invoice.id);
      const [details, products] = await Promise.all([this.loadDetails(invoiceIds), this.loadProducts()]);
      this.applyData(invoices, details, products);
      this.updatedAt = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'No fue posible cargar el resumen de Inicio.';
    } finally { this.isLoading = false; }
  }

  private async loadDetails(invoiceIds: number[]): Promise<DetailRow[]> {
    if (!invoiceIds.length) return [];
    const { data, error } = await this.supabase.client.from('factura_detalles').select('factura_id, descripcion, cantidad, total_linea').in('factura_id', invoiceIds);
    if (error) throw error;
    return (data ?? []) as DetailRow[];
  }

  private async loadProducts(): Promise<ProductRow[]> {
    const { data, error } = await this.supabase.client.from('products').select('descripcion, existencia, existencia_minima');
    if (error) throw error;
    return (data ?? []) as ProductRow[];
  }

  private applyData(invoices: InvoiceRow[], details: DetailRow[], products: ProductRow[]): void {
    const today = this.isoDate(new Date());
    const monthStart = `${today.slice(0, 7)}-01`;
    const active = invoices.filter((invoice) => invoice.estado?.toLowerCase() !== 'anulada');
    const todayInvoices = active.filter((invoice) => invoice.fecha_factura === today);
    const monthInvoices = active.filter((invoice) => invoice.fecha_factura >= monthStart);
    const activeIds = new Set(active.map((invoice) => invoice.id));
    const activeDetails = details.filter((detail) => activeIds.has(detail.factura_id));
    const todayIds = new Set(todayInvoices.map((invoice) => invoice.id));
    const todayDetails = activeDetails.filter((detail) => todayIds.has(detail.factura_id));
    const lowStock = products.filter((product) => Number(product.existencia ?? 0) <= Number(product.existencia_minima ?? 0));
    const pending = invoices.filter((invoice) => !['Aceptado', 'Anulada'].includes(invoice.dgii_estado ?? invoice.estado ?? '')).length;
    this.statCards = [
      { label: 'Ventas del Día', value: this.money(this.sum(todayInvoices)), hint: `${todayInvoices.length} factura(s) hoy`, tone: 'success', icon: 'sale' },
      { label: 'Ventas del Mes', value: this.money(this.sum(monthInvoices)), hint: `${monthInvoices.length} factura(s) este mes`, tone: 'primary', icon: 'wallet' },
      { label: 'Productos Vendidos', value: this.quantity(activeDetails).toLocaleString('es-DO'), hint: `${this.quantity(todayDetails)} hoy`, tone: 'emerald', icon: 'bag' },
      { label: 'Total Facturas', value: active.length.toLocaleString('es-DO'), hint: `${pending} pendiente(s)`, tone: 'sky', icon: 'file' },
      { label: 'Stock Bajo', value: lowStock.length.toLocaleString('es-DO'), hint: lowStock.length ? 'Requiere revisión' : 'Inventario al día', tone: 'danger', icon: 'alert' }
    ];
    this.salesSeries = this.lastSevenDays(active);
    this.topProducts = this.getTopProducts(activeDetails);
    this.alertGroups = [
      { title: 'Stock Bajo', icon: 'alert', items: lowStock.slice(0, 5).map((product) => product.descripcion) },
      { title: 'Sin Movimiento', icon: 'box', items: [] }
    ];
    this.inventoryFlow = [
      { label: 'Entradas', value: 0, width: 0, tone: 'green' },
      { label: 'Salidas', value: this.quantity(activeDetails), width: Math.min(100, this.quantity(activeDetails)), tone: 'orange' },
      { label: 'Productos activos', value: products.length, width: Math.min(100, products.length), tone: 'blue' }
    ];
    this.transactions = invoices.slice(0, 8).map((invoice) => ({ date: this.date(invoice.fecha_factura), invoice: invoice.numero_factura, client: invoice.cliente_nombre || 'CLIENTE CONTADO', total: this.money(Number(invoice.total ?? 0)), status: invoice.dgii_estado || invoice.estado || 'Borrador' }));
  }

  private lastSevenDays(invoices: InvoiceRow[]): Array<{ label: string; value: string; x: number; y: number }> {
    const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); return { date, total: this.sum(invoices.filter((invoice) => invoice.fecha_factura === this.isoDate(date))) }; });
    const max = Math.max(1, ...days.map((day) => day.total));
    return days.map((day, index) => ({ label: day.date.toLocaleDateString('es-DO', { weekday: 'short' }).replace('.', ''), value: this.money(day.total), x: 8 + index * 14, y: 10 + Math.round((day.total / max) * 78) }));
  }

  private getTopProducts(details: DetailRow[]): Array<{ name: string; quantity: number; amount: string }> {
    const grouped = new Map<string, { quantity: number; amount: number }>();
    details.forEach((detail) => { const item = grouped.get(detail.descripcion) ?? { quantity: 0, amount: 0 }; item.quantity += Number(detail.cantidad ?? 0); item.amount += Number(detail.total_linea ?? 0); grouped.set(detail.descripcion, item); });
    return [...grouped.entries()].map(([name, item]) => ({ name, quantity: item.quantity, amount: this.money(item.amount) })).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }

  private sum(rows: InvoiceRow[]): number { return rows.reduce((total, row) => total + Number(row.total ?? 0), 0); }
  private quantity(rows: DetailRow[]): number { return rows.reduce((total, row) => total + Number(row.cantidad ?? 0), 0); }
  private money(value: number): string { return `RD$${value.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  private isoDate(value: Date): string { return value.toISOString().slice(0, 10); }
  private date(value: string): string { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-DO') : 'N/D'; }
}
