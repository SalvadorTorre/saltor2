import { Injectable } from '@angular/core';
import * as QRCode from 'qrcode';
import * as JsBarcodeModule from 'jsbarcode';
import { AuthService } from '../auth/auth.service';
import { CompaniesService } from '../companies/companies.service';
import { EditableInvoiceData, InvoicesService } from '../invoices/invoices.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { QzPrintService } from './qz-print.service';
import { CompanyPrintSettingsService } from './company-print-settings.service';
import { SupabaseService } from '../supabase/supabase.service';

/** Código QR como SVG (vector): nítido en la térmica, sin el suavizado de una imagen reducida. */
async function qrSvgDataUrl(value: string): Promise<string> {
  const svg: string = await (QRCode as any).toString(value, { type: 'svg', errorCorrectionLevel: 'L', margin: 4 });
  const crisp = svg.includes('shape-rendering') ? svg : svg.replace('<svg ', '<svg shape-rendering="crispEdges" ');
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(crisp)));
}

/** Imprime una factura ya guardada (Consulta de facturas, Cobro en caja). */
@Injectable({ providedIn: 'root' })
export class InvoicePrintService {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly auth: AuthService,
    private readonly companiesService: CompaniesService,
    private readonly qzPrintService: QzPrintService,
    private readonly printSettings: CompanyPrintSettingsService,
    private readonly supabase: SupabaseService,
    private readonly salesOrders: SalesOrdersService
  ) {}

  /** Orden de venta en media carta (mismo formato que la factura, sin datos fiscales ni QR). */
  async printSalesOrder(orderId: number, sellerFallback?: string | null, useCompanyCopies = false): Promise<void> {
    const page = await this.buildSalesOrderHalfLetterHtml(orderId, sellerFallback);
    const copies = useCompanyCopies ? await this.qzPrintService.invoiceCopies() : 1;
    const printed = await this.qzPrintService.printHtml(page.html, `Orden de venta ${page.number}`, 'width=1000,height=700', copies);
    if (printed === 'unavailable') throw new Error('No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
    await this.salesOrders.markOrderPrinted(orderId);
  }

  /** La empresa imprime en media carta: Facturación, Caja y Consulta usan el formato de media carta. */
  async isHalfLetter(): Promise<boolean> {
    try { return (await this.printSettings.getPaper()) === 'media_carta'; } catch { return false; }
  }

  /**
   * @param useCompanyCopies true cuando la factura se acaba de generar (Caja → Cobro):
   *   imprime las copias configuradas por la empresa. Las reimpresiones salen en una.
   */
  async print(invoiceId: number, sellerFallback?: string | null, useCompanyCopies = false): Promise<void> {
      if (await this.isHalfLetter()) {
        const page = await this.buildHalfLetterHtml(invoiceId, sellerFallback);
        const pageCopies = useCompanyCopies ? await this.qzPrintService.invoiceCopies() : 1;
        const printed = await this.qzPrintService.printHtml(page.html, `Factura ${page.number}`, 'width=1000,height=700', pageCopies);
        if (printed === 'unavailable') throw new Error('No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
        await this.invoicesService.markInvoicePrinted(invoiceId);
        return;
      }
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
        return `<tr><td>${line.quantity} x ${priceWithoutTax.toFixed(2)}<br><b>${this.escape(line.description)}</b></td><td>${line.taxAmount.toFixed(2)}</td><td>${line.lineTotal.toFixed(2)}</td></tr>`;
      }).join('');
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${this.escape(detail.number)}</title><style>body{font:11px Arial;margin:0;color:#111}.head{text-align:center}.head .logo{display:block;max-width:42mm;max-height:22mm;margin:0 auto 4px;object-fit:contain}.company{font-size:15px;font-weight:800}.muted{font-size:11px}.receipt-type{border-top:1px dashed #111;border-bottom:1px dashed #111;margin:8px 0;padding:5px 0;text-align:center;font-size:12px;font-weight:800}.document{line-height:1.45;margin:8px 0}.document span{display:inline-block;min-width:76px}.customer{line-height:1.5;margin:10px 0}table{border-collapse:collapse;width:100%;margin-top:8px;table-layout:fixed}th{border-bottom:1px dashed #777;padding:4px 1px;text-align:left;font-size:10px}td{border:0;padding:3px 1px;text-align:left;vertical-align:top;font-size:10px}th:nth-child(1),td:nth-child(1){width:43%}th:nth-child(2),td:nth-child(2){width:19%;text-align:right}th:nth-child(3),td:nth-child(3){width:38%;text-align:right}.total{margin-top:10px}.total p{display:flex;justify-content:space-between;margin:4px 0}.total strong{font-size:13px}.fiscal{border-top:1px dashed #111;margin-top:10px;padding-top:8px;text-align:center;font-size:9px}.fiscal img.qr{width:36mm;height:36mm;display:block;margin:0 auto 5px;image-rendering:pixelated;image-rendering:crisp-edges}.fiscal p{margin:3px 0}.barcode{margin-top:9mm;max-width:100%;height:auto}</style></head><body><div class="head">${company?.logoUrl ? `<img class="logo" src="${this.escape(company.logoUrl)}" alt="">` : ''}<div class="company">${this.escape(company?.legalName || company?.tradeName || session?.companyName || 'SALTOR SYSTEM')}</div><div class="muted">RNC: ${this.escape(company?.rnc || 'N/D')}</div><div class="muted">${this.escape(company?.address || 'N/D')}</div><div class="muted">Tel.: ${this.escape(company?.phone || 'N/D')}</div></div><div class="document"><div><span>No. Factura:</span>${this.escape(detail.number)}</div><div><span>Fecha:</span>${this.escape(detail.invoiceDate)}</div><div><span>e-NCF:</span>${this.escape(detail.ncf || 'N/A')}</div></div><div class="receipt-type">${this.escape(this.receiptDocumentType(detail.ncfType))}</div><div class="customer"><strong>Cliente:</strong> ${this.escape(detail.customerName)}<br><strong>RNC/Cédula:</strong> ${this.escape(detail.rnc || 'Consumidor final')}<br><strong>Dirección:</strong> ${this.escape(detail.customerAddress || 'N/D')}<br><strong>Teléfono:</strong> ${this.escape(detail.customerPhone || 'N/D')}<br><strong>Vendedor:</strong> ${this.escape(seller)}</div><table><thead><tr><th>DESCRIPCIÓN</th><th>ITBIS</th><th>VALOR</th></tr></thead><tbody>${rows}</tbody></table><p><strong>Condición:</strong> ${this.escape(detail.paymentMethod)}</p>${detail.notes ? `<p><strong>Notas:</strong> ${this.escape(detail.notes)}</p>` : ''}<div class="total"><p><span>Subtotal</span><span>${detail.subtotal.toFixed(2)}</span></p><p><span>ITBIS</span><span>${detail.taxTotal.toFixed(2)}</span></p><p><strong>Total</strong><strong>${detail.grandTotal.toFixed(2)}</strong></p></div><div class="fiscal">${fiscalCodes.qr ? `<img class="qr" src="${fiscalCodes.qr}" alt="Código QR">` : ''}<p><b>Código de seguridad:</b> ${this.escape(detail.securityCode || 'Pendiente')}</p><p><b>Fecha firma digital:</b> ${this.escape(detail.signatureDate || 'Pendiente')}</p>${fiscalCodes.barcode ? `<img class="barcode" src="${fiscalCodes.barcode}" alt="Código de barras"><p>${this.escape(detail.number)}</p>` : ''}</div><script>window.onload=function(){window.print();};<\/script></body></html>`;
      const copies = useCompanyCopies ? await this.qzPrintService.invoiceCopies() : 1;
      const result = await this.qzPrintService.printHtml(html, `Factura ${detail.number}`, undefined, copies);
      if (result === 'unavailable') throw new Error('No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
      await this.invoicesService.markInvoicePrinted(invoiceId);
  }

  /**
   * Factura en media carta (mitad superior de una hoja carta): datos de la empresa al
   * centro, documento a la derecha, cliente a la izquierda, detalle en columnas y al pie
   * el QR fiscal a la izquierda, la página y la firma al centro (código de barras debajo)
   * y los totales a la derecha.
   */
  async buildHalfLetterHtml(invoiceId: number, sellerFallback?: string | null, copyLabel = 'ORIGINAL'): Promise<{ html: string; number: string }> {
    const detail = await this.invoicesService.getInvoiceForEditing(invoiceId);
    return this.renderHalfLetter(detail, sellerFallback, copyLabel, 'factura');
  }

  async buildSalesOrderHalfLetterHtml(orderId: number, sellerFallback?: string | null): Promise<{ html: string; number: string }> {
    const detail = await this.salesOrders.getOrderForEditing(orderId);
    return this.renderHalfLetter(detail, sellerFallback, 'ORIGINAL', 'orden');
  }

  private async renderHalfLetter(detail: EditableInvoiceData, sellerFallback: string | null | undefined, copyLabel: string, kind: 'factura' | 'orden'): Promise<{ html: string; number: string }> {
    const isInvoice = kind === 'factura';
    const session = await this.auth.restoreSession();
    const seller = sellerFallback || session?.fullName || 'N/D';
    const company = (await this.companiesService.getCompanies()).find((item) => item.id === session?.companyId);

    // Unidad (y código, si la línea no lo guardó) de cada producto.
    const productIds = [...new Set(detail.lines.map((line) => line.productId).filter((id): id is number => !!id))];
    const products = new Map<number, { codigo: string; unidad: string }>();
    if (productIds.length) {
      const { data } = await this.supabase.client.from('products').select('id, codigo, unidad').in('id', productIds);
      for (const row of (data ?? []) as Array<{ id: number; codigo: string | null; unidad: string | null }>) {
        products.set(row.id, { codigo: row.codigo ?? '', unidad: row.unidad ?? '' });
      }
    }

    const codes = await this.createFiscalCodes(detail.qrLink || detail.number, detail.number);
    // El QR solo se imprime cuando la DGII ya devolvió su enlace (factura firmada).
    const qr = { qr: isInvoice && detail.qrLink ? codes.qr : '', barcode: codes.barcode };
    const e = (value: string | number | null | undefined) => this.escape(value ?? '');
    const money = (value: number) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const qty = (value: number) => Number.isInteger(value) ? String(value) : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const now = new Date();
    const printTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const ncf = !detail.ncf || detail.ncf.startsWith('PENDIENTE') ? 'Pendiente' : detail.ncf;
    const companyName = company?.legalName || company?.tradeName || session?.companyName || 'SALTOR SYSTEM';

    const rows = detail.lines.map((line) => {
      const product = line.productId ? products.get(line.productId) : undefined;
      const code = line.productCode || product?.codigo || '';
      const unitPrice = line.quantity ? line.lineTotal / line.quantity : line.unitPrice;
      return `<tr><td>${e(code)}</td><td class="num qty">-${e(qty(line.quantity))}-</td><td>${e((product?.unidad || 'UNIDAD').toUpperCase())}</td>`
        + `<td class="desc">${e(line.description)}</td><td class="num">${money(unitPrice)}</td><td class="num">${money(line.taxAmount)}</td><td class="num">${money(line.lineTotal)}</td></tr>`;
    }).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${isInvoice ? 'Factura' : 'Orden de venta'} ${e(detail.number)}</title><style>
@page{size:letter portrait;margin:0}*{box-sizing:border-box}html{margin:0!important;padding:0!important}
body{width:100%!important;margin:0!important;padding:1cm!important;color:#111;font-family:Arial,sans-serif;font-size:10px}
.page{width:100%!important;min-height:4.01in;display:flex;flex-direction:column}
.mono{font-family:'Courier New',Courier,monospace}
.top{display:grid;grid-template-columns:1.9in 1fr 2.75in;gap:10px;align-items:start}
.copy{font-size:15px;font-weight:800;letter-spacing:.5px}
.client{margin-top:30px}.client b{display:block;font-size:11px}.client div{font-family:'Courier New',monospace;font-size:10px;line-height:1.25}
.company{text-align:center;line-height:1.2}.company .logo{display:block;max-width:1.1in;max-height:.45in;object-fit:contain;margin:0 auto 2px}
.company .name{font-size:13px}.company p{margin:0;font-size:11px}
.doc .title{text-align:center;font-size:16px;font-weight:800;letter-spacing:5px;margin:0}
.doc .type{display:flex;justify-content:space-between;font-size:11px;margin:1px 0 4px}
.doc .info{font-family:'Courier New',monospace;font-size:10.5px;line-height:1.45}
.doc .info div{display:grid;grid-template-columns:.95in 1fr}
.doc .info .no{font-family:Arial,sans-serif;font-size:14px;font-weight:800}
.items{width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed}
.items th{font-weight:400;font-size:11px;text-align:left;border-bottom:1px solid #111;padding:1px 3px}
.items td{font-family:'Courier New',monospace;font-size:9px;font-weight:700;padding:1px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.items td{vertical-align:top}.items td.desc{white-space:normal;overflow:visible;text-overflow:clip;word-break:break-word;line-height:1.25}
.items .num{text-align:right}.items .qty{text-align:center}
.c-code{width:10%}.c-qty{width:9%}.c-unit{width:8%}.c-desc{width:38%}.c-price{width:12%}.c-tax{width:10%}.c-total{width:13%}
.last{text-align:center;font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;padding-top:2px}
.notes{font-size:9.5px;margin-top:4px}
.foot{margin-top:auto;border-top:1px solid #111;display:grid;grid-template-columns:1.9in 1fr 2.35in;gap:10px;padding-top:3px;align-items:start}
.fiscal{font-size:8px;line-height:1.3}.fiscal img{width:22mm;height:22mm;display:block;image-rendering:pixelated}
.center{text-align:center}.center .pag{font-family:'Courier New',monospace;font-size:10px}
.sign{width:2.1in;margin:26px auto 0;border-top:1px solid #111;padding-top:2px;font-family:'Courier New',monospace;font-size:10px}
.barcode{display:block;margin:6px auto 0;max-width:2.2in;height:30px}
.totals div{display:grid;grid-template-columns:1fr 1.05in;font-size:11px;line-height:1.35}
.totals span{font-family:'Courier New',monospace;text-align:right;padding-right:10px}.totals b{text-align:right}
.totals .grand span,.totals .grand b{font-weight:800}
.peso{text-align:right;font-weight:800;font-size:12px;margin-top:2px}
</style></head><body><main class="page">
<section class="top">
  <div><div class="copy">${e(copyLabel)}</div>
    <div class="client"><b>CLIENTE</b><div>${e(detail.rnc || '')}</div><div>${e(detail.customerName)}${detail.customerId ? `(${e(detail.customerId)})` : ''}</div>${detail.customerPhone ? `<div>${e(detail.customerPhone)}</div>` : ''}</div></div>
  <div class="company">${company?.logoUrl ? `<img class="logo" src="${e(company.logoUrl)}" alt="">` : ''}<div class="name">${e(companyName)}</div><p>${e(company?.address || '')}</p><p>${e(company?.rnc || '')}</p><p>${e(company?.phone || '')}</p></div>
  <div class="doc">${isInvoice
      ? `<p class="title">FACTURA</p><div class="type"><span>${e(this.receiptDocumentType(detail.ncfType))}</span><span></span></div>`
      : `<p class="title" style="letter-spacing:3px">ORDEN DE VENTA</p><div class="type"><span>Documento no fiscal</span><span></span></div>`}
    <div class="info">${isInvoice ? `<div><span>NCF</span><span>${e(ncf)}</span></div>` : ''}<div><span>No.</span><span class="no">${e(detail.number)}</span></div><div><span>FECHA</span><span>${e(this.formatDate(detail.invoiceDate))}</span></div><div><span>HORA IMP.</span><span>${e(this.formatDate(now.toISOString()))} ${e(printTime)}</span></div><div><span>VENDEDOR</span><span>${e(seller)}</span></div><div><span>CONDICION</span><span>${e(detail.paymentMethod)}</span></div></div></div>
</section>
<table class="items"><thead><tr><th class="c-code">Codigo</th><th class="c-qty" style="text-align:center">Cantidad</th><th class="c-unit">Unidad</th><th class="c-desc">Descripcion</th><th class="c-price" style="text-align:right">Precio</th><th class="c-tax" style="text-align:right">Itbis</th><th class="c-total" style="text-align:right">Valor</th></tr></thead>
<tbody>${rows}<tr><td colspan="7" class="last">************ Ultima Linea ************</td></tr></tbody></table>
${detail.notes ? `<div class="notes"><b>Notas:</b> ${e(detail.notes)}</div>` : ''}
<footer class="foot">
  <div class="fiscal">${isInvoice ? `${qr.qr ? `<img src="${qr.qr}" alt="Código QR">` : ''}<div><b>Código de seguridad:</b> ${e(detail.securityCode || 'Pendiente')}</div><div><b>Fecha de firma:</b> ${e(detail.signatureDate || 'Pendiente')}</div>` : ''}</div>
  <div class="center"><div class="pag">Pag. 1/1</div><div class="sign">Recibido Conforme</div>${qr.barcode ? `<img class="barcode" src="${qr.barcode}" alt="">` : ''}</div>
  <div><div class="totals"><div><b>SUBTOTAL</b><span>${money(detail.subtotal)}</span></div><div><b>DESC.</b><span>0.00</span></div><div><b>ITBIS</b><span>${money(detail.taxTotal)}</span></div><div class="grand"><b>TOTAL</b><span>${money(detail.grandTotal)}</span></div></div><div class="peso">Valor en Peso RD$</div></div>
</footer>
</main><script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}<\/script></body></html>`;
    return { html, number: detail.number };
  }

  /** 2026-10-31 o fecha ISO → 31/10/2026. */
  private formatDate(value: string): string {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value || '');
  }

  private escape(value: string | number): string {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private async createFiscalCodes(qrValue: string, barcodeValue: string): Promise<{ qr: string; barcode: string }> {
    try {
      const canvas = document.createElement('canvas');
      const barcode = (JsBarcodeModule as any).default ?? JsBarcodeModule;
      barcode(canvas, barcodeValue, { format: 'CODE128', displayValue: false, margin: 0, width: 1.25, height: 42 });
      return { qr: await qrSvgDataUrl(qrValue), barcode: canvas.toDataURL('image/png') };
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
