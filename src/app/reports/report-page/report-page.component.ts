import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalesReportRow, SalesReportService } from '../../core/services/reports/sales-report.service';

type PeriodOption = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';
interface InvoiceReportRow { invoiceId: number; invoiceNumber: string; date: string; client: string; products: number; quantity: number; total: number; }

@Component({
  selector: 'app-report-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-page.component.html',
  styleUrls: ['./report-page.component.scss']
})
export class ReportPageComponent implements OnInit {
  @Input() mode: 'products' | 'invoices' = 'products';
  readonly viewMode = 'report';
  readonly periods: Array<{ value: PeriodOption; label: string }> = [
    { value: 'today', label: 'Hoy' }, { value: 'week', label: 'Esta semana' },
    { value: 'month', label: 'Este mes' }, { value: 'quarter', label: 'Este trimestre' },
    { value: 'year', label: 'Este año' }, { value: 'all', label: 'Todo' }, { value: 'custom', label: 'Personalizado' }
  ];
  period: PeriodOption = 'all';
  dateFrom = '';
  dateTo = '';
  category = 'all';
  productDescription = '';
  client = '';
  rows: SalesReportRow[] = [];
  isLoading = false;
  errorMessage = '';

  constructor(private readonly salesReport: SalesReportService) {}

  ngOnInit(): void { void this.loadReport(); }
  get categories(): string[] { return [...new Set(this.rows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
  get filteredRows(): SalesReportRow[] {
    const term = this.client.trim().toLocaleLowerCase();
    const productTerm = this.productDescription.trim().toLocaleLowerCase();
    return this.rows.filter((row) =>
      (this.category === 'all' || row.category === this.category) &&
      (!productTerm || row.product.toLocaleLowerCase().includes(productTerm)) &&
      (!term || row.client.toLocaleLowerCase().includes(term))
    );
  }
  get productSuggestions(): string[] {
    const term = this.productDescription.trim().toLocaleLowerCase();
    if (!term) return [];
    return [...new Set(this.rows.map((row) => row.product).filter((product) => product.toLocaleLowerCase().includes(term)))].slice(0, 8);
  }
  get totalRevenue(): number { return this.filteredRows.reduce((sum, row) => sum + row.total, 0); }
  get totalUnits(): number { return this.filteredRows.reduce((sum, row) => sum + row.quantity, 0); }
  get transactions(): number { return new Set(this.filteredRows.map((row) => row.invoiceId)).size; }
  get averageSale(): number { return this.transactions ? this.totalRevenue / this.transactions : 0; }
  get title(): string { return this.mode === 'invoices' ? 'Reporte de Ventas' : 'Consulta de Ventas'; }
  get subtitle(): string { return this.mode === 'invoices' ? 'Ventas agrupadas por factura' : 'Reportes por período'; }
  get invoiceRows(): InvoiceReportRow[] {
    const grouped = new Map<number, InvoiceReportRow>();
    this.filteredRows.forEach((row) => {
      const current = grouped.get(row.invoiceId);
      if (current) { current.products += 1; current.quantity += row.quantity; current.total += row.total; }
      else grouped.set(row.invoiceId, { invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber, date: row.date, client: row.client, products: 1, quantity: row.quantity, total: row.total });
    });
    return [...grouped.values()];
  }

  setPeriod(period: PeriodOption): void {
    this.period = period;
    const today = new Date();
    if (period === 'all') { this.dateFrom = ''; this.dateTo = ''; }
    else if (period !== 'custom') {
      const start = new Date(today);
      if (period === 'week') start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      if (period === 'month') start.setDate(1);
      if (period === 'quarter') start.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
      if (period === 'year') start.setMonth(0, 1);
      this.dateFrom = this.toDateInput(start);
      this.dateTo = this.toDateInput(today);
    }
    if (period !== 'custom') void this.loadReport();
  }

  async loadReport(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try { this.rows = await this.salesReport.getSales(this.dateFrom, this.dateTo); }
    catch (error) { this.rows = []; this.errorMessage = error instanceof Error ? error.message : 'No se pudieron cargar las ventas.'; }
    finally { this.isLoading = false; }
  }

  clearFilters(): void {
    this.period = 'all'; this.dateFrom = ''; this.dateTo = ''; this.category = 'all'; this.productDescription = ''; this.client = '';
    void this.loadReport();
  }

  async exportPdf(): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const heading = this.exportHeading;
    const values = this.exportValues;
    const pageWidth = 277;
    const columnWidth = pageWidth / heading.length;
    let y = 20;

    document.setFontSize(16);
    document.text(this.title, 10, 12);
    document.setFontSize(9);
    document.setTextColor(92, 108, 132);
    document.text(`Generado el ${this.formatDate(this.toDateInput(new Date()))}`, 10, 18);
    document.setFillColor(8, 127, 118);
    document.rect(10, y, pageWidth, 8, 'F');
    document.setTextColor(255, 255, 255);
    document.setFontSize(7.5);
    heading.forEach((header, index) => document.text(header, 11 + index * columnWidth, y + 5.2, { maxWidth: columnWidth - 2 }));
    y += 13;

    document.setTextColor(30, 42, 62);
    values.forEach((row) => {
      if (y > 192) {
        document.addPage();
        y = 16;
      }
      row.forEach((value, index) => document.text(this.pdfValue(value), 11 + index * columnWidth, y, { maxWidth: columnWidth - 2 }));
      document.setDrawColor(221, 229, 239);
      document.line(10, y + 3, 287, y + 3);
      y += 7;
    });
    document.save(`${this.exportFileName}.pdf`);
  }

  exportExcel(): void {
    const xmlRows = [this.exportHeading, ...this.exportValues].map((row) =>
      `<Row>${row.map((value) => `<Cell><Data ss:Type="String">${this.escapeXml(value)}</Data></Cell>`).join('')}</Row>`
    ).join('');
    const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Ventas"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
    this.downloadFile(workbook, 'application/vnd.ms-excel;charset=utf-8;', `${this.exportFileName}.xls`);
  }

  private get exportHeading(): string[] {
    return this.mode === 'invoices'
      ? ['Fecha', 'Factura', 'Cliente', 'Productos', 'Cantidad', 'Total']
      : ['Fecha', 'Producto', 'Cliente', 'Categoría', 'Cantidad', 'Precio unitario', 'Total'];
  }

  private get exportValues(): string[][] {
    return this.mode === 'invoices'
      ? this.invoiceRows.map((row) => [this.formatDate(row.date), row.invoiceNumber, row.client, row.products.toString(), row.quantity.toString(), row.total.toFixed(2)])
      : this.filteredRows.map((row) => [this.formatDate(row.date), row.product, row.client, row.category, row.quantity.toString(), row.unitPrice.toFixed(2), row.total.toFixed(2)]);
  }

  private get exportFileName(): string { return `${this.mode === 'invoices' ? 'reporte-ventas' : 'ventas-por-producto'}-${this.toDateInput(new Date())}`; }
  private pdfValue(value: string): string { return String(value).length > 29 ? `${String(value).slice(0, 28)}…` : String(value); }
  private escapeXml(value: string): string { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
  private downloadFile(content: string, type: string, fileName: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  formatMoney(value: number): string { return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value); }
  formatDate(value: string): string {
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value || 'Sin fecha';
  }
  selectProduct(product: string): void { this.productDescription = product; }
  private toDateInput(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
