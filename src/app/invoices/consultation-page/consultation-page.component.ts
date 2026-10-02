import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DgiiInvoiceStatus, EditableInvoiceData, InvoicesService } from '../../core/services/invoices/invoices.service';
import { QzPrintService } from '../../core/services/printing/qz-print.service';

interface InvoiceConsultationRow {
  id: number;
  number: string;
  date: string;
  customer: string;
  ncf: string;
  total: number;
  dgiiStatus: DgiiInvoiceStatus;
  dgiiMessage: string;
  status: string;
}

@Component({
  selector: 'app-invoice-consultation-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consultation-page.component.html',
  styleUrls: ['./consultation-page.component.scss']
})
export class InvoiceConsultationPageComponent implements OnInit {
  @Output() editRequested = new EventEmitter<number>();
  @Output() resendRequested = new EventEmitter<number>();
  searchTerm = '';
  dgiiFilter = 'Todos';
  isLoading = false;
  errorMessage = '';
  invoices: InvoiceConsultationRow[] = [];
  selectedInvoice: InvoiceConsultationRow | null = null;
  viewingInvoice: (EditableInvoiceData & { dgiiStatus: DgiiInvoiceStatus; status: string }) | null = null;
  isLoadingView = false;
  actionMessage = '';
  isProcessingAction = false;

  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly qzPrintService: QzPrintService
  ) {}

  ngOnInit(): void {
    void this.loadInvoices();
  }

  get filteredInvoices(): InvoiceConsultationRow[] {
    const query = this.searchTerm.trim().toLocaleLowerCase();
    return this.invoices.filter((invoice) => {
      const matchesQuery = !query || [invoice.number, invoice.customer, invoice.ncf]
        .some((value) => value.toLocaleLowerCase().includes(query));
      return matchesQuery && (this.dgiiFilter === 'Todos' || invoice.dgiiStatus === this.dgiiFilter);
    });
  }

  async loadInvoices(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.invoices = await this.invoicesService.getInvoices();
      if (this.selectedInvoice) {
        this.selectedInvoice = this.invoices.find((invoice) => invoice.id === this.selectedInvoice?.id) ?? null;
      }
    } catch {
      this.errorMessage = 'No se pudieron cargar las facturas. Verifica la conexión con Supabase.';
    } finally {
      this.isLoading = false;
    }
  }

  async selectInvoice(invoice: InvoiceConsultationRow): Promise<void> {
    this.isLoadingView = true;
    this.actionMessage = '';
    try {
      const detail = await this.invoicesService.getInvoiceForEditing(invoice.id);
      this.selectedInvoice = invoice;
      this.viewingInvoice = { ...detail, dgiiStatus: invoice.dgiiStatus, status: invoice.status };
    } catch (error) {
      this.actionMessage = this.formatError(error, 'No se pudo cargar el detalle de la factura.');
    } finally {
      this.isLoadingView = false;
    }
  }

  closeInvoiceView(): void {
    this.viewingInvoice = null;
  }

  get dgiiResponseText(): string {
    if (!this.viewingInvoice?.dgiiResponse) return 'No hay detalle adicional registrado.';
    return typeof this.viewingInvoice.dgiiResponse === 'string'
      ? this.viewingInvoice.dgiiResponse
      : JSON.stringify(this.viewingInvoice.dgiiResponse, null, 2);
  }

  canEdit(invoice: InvoiceConsultationRow): boolean {
    return invoice.status !== 'Anulada' && !this.isDgiiLocked(invoice);
  }

  canSendToDgii(invoice: InvoiceConsultationRow): boolean {
    return invoice.status !== 'Anulada' && !this.isDgiiLocked(invoice);
  }

  isDgiiLocked(invoice: InvoiceConsultationRow): boolean {
    return ['Aceptado', 'Rechazado'].includes(invoice.dgiiStatus);
  }

  requestEdit(invoice: InvoiceConsultationRow): void {
    if (!this.canEdit(invoice)) {
      this.actionMessage = 'No se puede editar una factura anulada, enviada o aceptada por DGII.';
      return;
    }
    this.editRequested.emit(invoice.id);
  }

  async cancelInvoice(invoice: InvoiceConsultationRow): Promise<void> {
    if (invoice.status === 'Anulada' || this.isDgiiLocked(invoice) || this.isProcessingAction) return;
    if (!window.confirm(`¿Deseas anular la factura ${invoice.number}? Se devolverá la existencia al inventario.`)) return;
    this.isProcessingAction = true;
    try {
      await this.invoicesService.cancelInvoice(invoice.id);
      this.actionMessage = `Factura ${invoice.number} anulada y existencia devuelta al inventario.`;
      await this.loadInvoices();
    } catch (error) {
      this.actionMessage = this.formatError(error, 'No se pudo anular la factura.');
    } finally {
      this.isProcessingAction = false;
    }
  }

  resendToDgii(invoice: InvoiceConsultationRow): void {
    if (!this.canSendToDgii(invoice)) return;
    this.resendRequested.emit(invoice.id);
  }

  async printInvoice(invoice: InvoiceConsultationRow): Promise<void> {
    try {
      const detail = await this.invoicesService.getInvoiceForEditing(invoice.id);
      const rows = detail.lines.map((line) => {
        const priceWithoutTax = line.taxRate > 0 ? line.unitPrice / (1 + (line.taxRate / 100)) : line.unitPrice;
        return `<tr><td>${this.escape(line.description)}</td><td>${line.quantity}</td><td>RD$${priceWithoutTax.toFixed(2)}</td><td>RD$${line.taxAmount.toFixed(2)}</td><td>RD$${line.lineTotal.toFixed(2)}</td></tr>`;
      }).join('');
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${this.escape(detail.number)}</title><style>body{font-family:Arial;margin:34px;color:#111827}header{display:flex;justify-content:space-between;border-bottom:2px solid #1d4ed8;padding-bottom:14px}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#eff6ff}.total{margin:20px 0 0 auto;width:240px}.total p{display:flex;justify-content:space-between}</style></head><body><header><div><h1>Factura</h1><strong>No. ${this.escape(detail.number)}</strong></div><div>Fecha: ${this.escape(detail.invoiceDate)}<br>NCF: ${this.escape(detail.ncf || 'N/A')}</div></header><p><strong>Cliente:</strong> ${this.escape(detail.customerName)}</p><table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio sin ITBIS</th><th>ITBIS</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><p><span>Subtotal</span><span>RD$${detail.subtotal.toFixed(2)}</span></p><p><span>ITBIS</span><span>RD$${detail.taxTotal.toFixed(2)}</span></p><p><strong>Total</strong><strong>RD$${detail.grandTotal.toFixed(2)}</strong></p></div><script>window.onload=function(){window.print();};<\/script></body></html>`;
      const result = await this.qzPrintService.printHtml(html, `Factura ${detail.number}`);
      if (result === 'unavailable') throw new Error('No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
      await this.invoicesService.markInvoicePrinted(invoice.id);
    } catch (error) {
      this.actionMessage = this.formatError(error, 'No se pudo imprimir la factura.');
    }
  }

  private escape(value: string | number): string {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private formatError(error: unknown, fallback: string): string {
    return error && typeof error === 'object' && 'message' in error
      ? `${fallback} ${(error as { message?: string }).message ?? ''}`.trim()
      : fallback;
  }
}
