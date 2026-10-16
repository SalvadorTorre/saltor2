import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DgiiInvoiceStatus, EditableInvoiceData, InvoicesService } from '../../core/services/invoices/invoices.service';
import { QzPrintService } from '../../core/services/printing/qz-print.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { CompaniesService } from '../../core/services/companies/companies.service';
import { CANCELLATION_TYPES } from '../../core/services/invoices/cancellation-types';
import Swal from 'sweetalert2';
import * as QRCode from 'qrcode';
import * as JsBarcodeModule from 'jsbarcode';

interface InvoiceConsultationRow {
  id: number;
  number: string;
  date: string;
  customer: string;
  ncf: string;
  ncfType: string;
  total: number;
  dgiiStatus: DgiiInvoiceStatus;
  dgiiMessage: string;
  status: string;
  seller: string;
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
    private readonly qzPrintService: QzPrintService,
    private readonly auth: AuthService,
    private readonly companiesService: CompaniesService
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
    // Una factura pendiente de cobro se envía a la DGII cuando la cajera la cobra.
    return invoice.status !== 'Anulada' && invoice.status !== 'Pendiente de cobro' && !this.isDgiiLocked(invoice);
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
    const result = await Swal.fire({
      icon: 'warning',
      title: `Anular factura ${invoice.number}`,
      html: '<p style="margin:0 0 10px">Se devolverá la existencia al inventario.</p>'
        + '<label for="anul-tipo" style="display:block;text-align:left;font-weight:700;margin:8px 0 4px">Tipo de anulación (DGII 608)</label>'
        + `<select id="anul-tipo" class="swal2-select" style="display:block;width:100%;margin:0">${CANCELLATION_TYPES.map((t) => `<option value="${t.code}"${t.code === 4 ? ' selected' : ''}>${String(t.code).padStart(2, '0')} - ${t.description}</option>`).join('')}</select>`
        + '<label for="anul-motivo" style="display:block;text-align:left;font-weight:700;margin:12px 0 4px">Motivo</label>'
        + '<input id="anul-motivo" class="swal2-input" style="display:block;width:100%;margin:0" placeholder="Ej.: cliente pidió cambiar la factura">',
      showCancelButton: true,
      confirmButtonText: 'Anular factura',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b42318',
      preConfirm: () => {
        const type = Number((document.getElementById('anul-tipo') as HTMLSelectElement | null)?.value ?? 4);
        const reason = ((document.getElementById('anul-motivo') as HTMLInputElement | null)?.value ?? '').trim();
        if (!reason) { Swal.showValidationMessage('Indique el motivo de la anulación.'); return false; }
        return { type, reason };
      }
    });
    if (!result.isConfirmed || !result.value) return;
    this.isProcessingAction = true;
    try {
      await this.invoicesService.cancelInvoice(invoice.id, result.value.type, result.value.reason);
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
      const session = await this.auth.restoreSession();
      // Vendedor guardado en la factura; las facturas anteriores al cambio no lo tienen.
      const seller = invoice.seller || session?.fullName || 'N/D';
      const company = (await this.companiesService.getCompanies()).find((item) => item.id === session?.companyId);
      const fiscalCodes = await this.createFiscalCodes(
        detail.qrLink || `${detail.number}|${detail.ncf}|${detail.grandTotal.toFixed(2)}`,
        detail.number
      );
      const rows = detail.lines.map((line) => {
        const priceWithoutTax = line.taxRate > 0 ? line.unitPrice / (1 + (line.taxRate / 100)) : line.unitPrice;
        return `<tr><td>${line.quantity} x RD$${priceWithoutTax.toFixed(2)}<br><b>${this.escape(line.description)}</b></td><td>RD$${line.taxAmount.toFixed(2)}</td><td>RD$${line.lineTotal.toFixed(2)}</td></tr>`;
      }).join('');
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${this.escape(detail.number)}</title><style>body{font:11px Arial;margin:0;color:#111}.head{text-align:center}.head .logo{display:block;max-width:42mm;max-height:22mm;margin:0 auto 4px;object-fit:contain}.company{font-size:15px;font-weight:800}.muted{font-size:11px}.receipt-type{border-top:1px dashed #111;border-bottom:1px dashed #111;margin:8px 0;padding:5px 0;text-align:center;font-size:12px;font-weight:800}.document{line-height:1.45;margin:8px 0}.document span{display:inline-block;min-width:76px}.customer{line-height:1.5;margin:10px 0}table{border-collapse:collapse;width:100%;margin-top:8px}th{border-bottom:1px dashed #777;padding:4px 1px;text-align:left;font-size:10px}td{border:0;padding:3px 1px;text-align:left;vertical-align:top;font-size:10px}th:nth-child(2),th:nth-child(3),td:nth-child(2),td:nth-child(3){text-align:right}.total{margin-top:10px}.total p{display:flex;justify-content:space-between;margin:4px 0}.total strong{font-size:13px}.fiscal{border-top:1px dashed #111;margin-top:10px;padding-top:8px;text-align:center;font-size:9px}.fiscal img.qr{width:28mm;height:28mm;display:block;margin:0 auto 5px}.fiscal p{margin:3px 0}.barcode{margin-top:9mm;max-width:100%;height:auto}</style></head><body><div class="head">${company?.logoUrl ? `<img class="logo" src="${this.escape(company.logoUrl)}" alt="">` : ''}<div class="company">${this.escape(company?.legalName || company?.tradeName || session?.companyName || 'SALTOR SYSTEM')}</div><div class="muted">RNC: ${this.escape(company?.rnc || 'N/D')}</div><div class="muted">${this.escape(company?.address || 'N/D')}</div><div class="muted">Tel.: ${this.escape(company?.phone || 'N/D')}</div></div><div class="document"><div><span>No. Factura:</span>${this.escape(detail.number)}</div><div><span>Fecha:</span>${this.escape(detail.invoiceDate)}</div><div><span>e-NCF:</span>${this.escape(detail.ncf || 'N/A')}</div></div><div class="receipt-type">${this.escape(this.receiptDocumentType(detail.ncfType))}</div><div class="customer"><strong>Cliente:</strong> ${this.escape(detail.customerName)}<br><strong>RNC/Cédula:</strong> ${this.escape(detail.rnc || 'Consumidor final')}<br><strong>Dirección:</strong> ${this.escape(detail.customerAddress || 'N/D')}<br><strong>Teléfono:</strong> ${this.escape(detail.customerPhone || 'N/D')}<br><strong>Vendedor:</strong> ${this.escape(seller)}</div><table><thead><tr><th>DESCRIPCIÓN</th><th>ITBIS</th><th>VALOR</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><p><span>Subtotal</span><span>RD$${detail.subtotal.toFixed(2)}</span></p><p><span>ITBIS</span><span>RD$${detail.taxTotal.toFixed(2)}</span></p><p><strong>Total</strong><strong>RD$${detail.grandTotal.toFixed(2)}</strong></p></div><div class="fiscal">${fiscalCodes.qr ? `<img class="qr" src="${fiscalCodes.qr}" alt="Código QR">` : ''}<p><b>Código de seguridad:</b> ${this.escape(detail.securityCode || 'Pendiente')}</p><p><b>Fecha firma digital:</b> ${this.escape(detail.dgiiSentAt || 'Pendiente')}</p>${fiscalCodes.barcode ? `<img class="barcode" src="${fiscalCodes.barcode}" alt="Código de barras"><p>${this.escape(detail.number)}</p>` : ''}</div><script>window.onload=function(){window.print();};<\/script></body></html>`;
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

  private async createFiscalCodes(qrValue: string, barcodeValue: string): Promise<{ qr: string; barcode: string }> {
    try {
      const canvas = document.createElement('canvas');
      const barcode = (JsBarcodeModule as any).default ?? JsBarcodeModule;
      barcode(canvas, barcodeValue, { format: 'CODE128', displayValue: false, margin: 0, width: 1.25, height: 42 });
      return { qr: await QRCode.toDataURL(qrValue, { width: 150, margin: 1 }), barcode: canvas.toDataURL('image/png') };
    } catch {
      return { qr: '', barcode: '' };
    }
  }

  private receiptDocumentType(value: string): string {
    const type = value.toLowerCase();
    if (type.includes('31') || type.includes('credito fiscal') || type.includes('crédito fiscal')) return 'Factura de Crédito Fiscal';
    if (type.includes('32') || type.includes('consumo')) return 'Factura de Consumo Electrónica';
    return value.replace(/^\s*\d{2}\s*-\s*/, '').trim() || 'Factura';
  }

  private formatError(error: unknown, fallback: string): string {
    return error && typeof error === 'object' && 'message' in error
      ? `${fallback} ${(error as { message?: string }).message ?? ''}`.trim()
      : fallback;
  }
}
