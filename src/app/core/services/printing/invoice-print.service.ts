import { Injectable } from '@angular/core';
import * as QRCode from 'qrcode';
import * as JsBarcodeModule from 'jsbarcode';
import { AuthService } from '../auth/auth.service';
import { CompaniesService } from '../companies/companies.service';
import { InvoicesService } from '../invoices/invoices.service';
import { QzPrintService } from './qz-print.service';

/** Imprime una factura ya guardada (Consulta de facturas, Cobro en caja). */
@Injectable({ providedIn: 'root' })
export class InvoicePrintService {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly auth: AuthService,
    private readonly companiesService: CompaniesService,
    private readonly qzPrintService: QzPrintService
  ) {}

  async print(invoiceId: number, sellerFallback?: string | null): Promise<void> {
      const detail = await this.invoicesService.getInvoiceForEditing(invoiceId);
      const session = await this.auth.restoreSession();
      // Vendedor guardado en la factura; las facturas anteriores al cambio no lo tienen.
      const seller = sellerFallback || session?.fullName || 'N/D';
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
      await this.invoicesService.markInvoicePrinted(invoiceId);
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
    const type = (value || '').toLowerCase();
    if (/(?:^|\D)332(?:\D|$)/.test(type) || type.includes('proforma')) return 'Factura PROFORMA';
    if (type.includes('31') || type.includes('credito fiscal') || type.includes('crédito fiscal')) return 'Factura de Crédito Fiscal';
    if (type.includes('32') || type.includes('consumo')) return 'Factura de Consumo Electrónica';
    return (value || '').replace(/^\s*\d{2}\s*-\s*/, '').trim() || 'Factura';
  }
}
