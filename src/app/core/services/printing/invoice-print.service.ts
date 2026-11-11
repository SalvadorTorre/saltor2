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

/**
 * Notas de la factura para imprimir: se quitan las referencias automáticas a la orden de venta
 * ("Orden 2026…") y a la cotización ("Generada desde cotización …"). Se conservan en el sistema.
 */
export function printableInvoiceNotes(notes: string | null | undefined): string {
  return String(notes ?? '')
    .replace(/Generada desde cotizaci[oó]n\s+\S+?\.?(?=\s|$)/gi, '')
    .replace(/(?:^|\s)Orden(?:\s+de\s+venta)?\s+[A-Z0-9-]*\d[A-Z0-9-]*/gi, ' ')
    .replace(/\s*·\s*(?=·|$)/g, '')
    .replace(/^\s*·\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  ) {
    // Al abrir Facturación, Caja o Consulta se deja lista la conexión con QZ Tray y el tipo de
    // papel, para que la primera impresión no tenga que esperar por eso.
    setTimeout(() => {
      void this.qzPrintService.checkConnection().catch(() => false);
      void this.printSettings.getPaper().catch(() => null);
    }, 0);
  }

  /**
   * Orden de venta según el papel de la empresa:
   * media carta → formato en columnas (el de Bella Real); 80/90 mm → ticket para la térmica.
   * Ninguno lleva datos fiscales ni QR; los dos llevan el número en código de barras.
   */
  async printSalesOrder(orderId: number, sellerFallback?: string | null, useCompanyCopies = false): Promise<void> {
    // Solo la térmica (80/90 mm) usa el ticket; carta, media carta y cualquier otro papel usan el formato en columnas.
    const halfLetter = await this.isHalfLetter();
    const page = halfLetter
      ? await this.buildSalesOrderHalfLetterHtml(orderId, sellerFallback)
      : await this.buildSalesOrderTicketHtml(orderId, sellerFallback);
    const copies = useCompanyCopies ? await this.qzPrintService.invoiceCopies() : 1;
    const printed = halfLetter
      ? await this.qzPrintService.printHtml(page.html, `Orden de venta ${page.number}`, 'width=1000,height=700', copies, 'media_carta')
      : await this.qzPrintService.printHtml(page.html, `Orden de venta ${page.number}`, undefined, copies);
    if (printed === 'unavailable') throw new Error('No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
    await this.salesOrders.markOrderPrinted(orderId);
  }

  /** Orden de venta para impresora térmica (80/90 mm). */
  private async buildSalesOrderTicketHtml(orderId: number, sellerFallback?: string | null): Promise<{ html: string; number: string }> {
    const detail = await this.salesOrders.getOrderForEditing(orderId);
    const session = await this.auth.restoreSession();
    const seller = sellerFallback || session?.fullName || 'N/D';
    const company = await this.activeCompany(session?.companyId);
    const codes = await this.createFiscalCodes(detail.number, detail.number);
    const e = (value: string | number | null | undefined) => this.escape(value ?? '');
    const money = (value: number) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const qty = (value: number) => Number.isInteger(value) ? String(value) : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const printTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const rows = detail.lines.map((line) => {
      const price = line.quantity ? line.lineTotal / line.quantity : line.unitPrice;
      const code = (line as { productCode?: string }).productCode;
      return `<tr><td>${code ? `${e(code)} &nbsp; ` : ''}${qty(line.quantity)} x ${money(price)}<br><b>${e(line.description)}</b></td><td>${money(line.lineTotal)}</td></tr>`;
    }).join('');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Orden de venta ${e(detail.number)}</title><style>`
      + `body{font:11px Arial,sans-serif;margin:0;color:#111}.head{text-align:center}.head .logo{display:block;max-width:42mm;max-height:22mm;margin:0 auto 4px;object-fit:contain}`
      + `.company{font-size:15px;font-weight:800}.muted{font-size:11px}.type{border-top:1px dashed #111;border-bottom:1px dashed #111;margin:8px 0;padding:5px 0;text-align:center;font-size:13px;font-weight:800;letter-spacing:.5px}`
      + `.document{line-height:1.45;margin:8px 0}.document span{display:inline-block;min-width:70px}.customer{line-height:1.5;margin:8px 0}`
      + `table{border-collapse:collapse;width:100%;margin-top:6px;table-layout:fixed}th{border-bottom:1px dashed #777;padding:4px 1px;text-align:left;font-size:10px}td{padding:3px 1px;vertical-align:top;font-size:10px}`
      + `th:nth-child(1),td:nth-child(1){width:68%}th:nth-child(2),td:nth-child(2){width:32%;text-align:right}`
      + `.total{margin-top:8px;border-top:1px dashed #111;padding-top:6px}.total p{display:flex;justify-content:space-between;margin:3px 0}.total strong{font-size:14px}`
      + `.foot{text-align:center;margin-top:10px;font-size:10px}.barcode{display:block;margin:8px auto 2px;max-width:100%;height:auto}.note{text-align:center;font-size:10px;margin-top:6px}`
      + `</style></head><body>`
      + `<div class="head">${company?.logoUrl ? `<img class="logo" src="${e(company.logoUrl)}" alt="">` : ''}<div class="company">${e(company?.legalName || company?.tradeName || session?.companyName || 'SALTOR SYSTEM')}</div>`
      + `<div class="muted">RNC: ${e(company?.rnc || 'N/D')}</div><div class="muted">${e(company?.address || '')}</div><div class="muted">Tel.: ${e(company?.phone || 'N/D')}</div></div>`
      + `<div class="type">ORDEN DE VENTA</div>`
      + `<div class="document"><div><span>No. Orden:</span><b>${e(detail.number)}</b></div><div><span>Fecha:</span>${e(detail.invoiceDate)} ${e(printTime)}</div><div><span>Vendedor:</span>${e(seller)}</div></div>`
      + `<div class="customer"><strong>Cliente:</strong> ${e(detail.customerName || 'CLIENTE CONTADO')}${detail.rnc ? `<br><strong>RNC/Cédula:</strong> ${e(detail.rnc)}` : ''}${detail.customerPhone ? `<br><strong>Teléfono:</strong> ${e(detail.customerPhone)}` : ''}</div>`
      + `<table><thead><tr><th>DESCRIPCIÓN</th><th>VALOR</th></tr></thead><tbody>${rows}</tbody></table>`
      + `${detail.notes ? `<p><strong>Notas:</strong> ${e(detail.notes)}</p>` : ''}`
      + `<div class="total"><p><span>Subtotal</span><span>${money(detail.subtotal)}</span></p><p><span>ITBIS</span><span>${money(detail.taxTotal)}</span></p><p><strong>Total</strong><strong>${money(detail.grandTotal)}</strong></p></div>`
      + `<div class="foot">${codes.barcode ? `<img class="barcode" src="${codes.barcode}" alt="Código de barras">` : ''}<div>${e(detail.number)}</div></div>`
      + `<div class="note">Documento no válido como factura.</div>`
      + `<script>window.onload=function(){window.print();};<\/script></body></html>`;
    return { html, number: detail.number };
  }

  /**
   * Formato en columnas (media carta) para todo papel que no sea de impresora térmica:
   * carta, media carta, etc. Solo 80/90 mm usan el ticket. Lo usan Facturación, Caja y Consulta.
   */
  async isHalfLetter(): Promise<boolean> {
    try {
      const paper = String(await this.printSettings.getPaper());
      return paper !== '80mm' && paper !== '90mm';
    } catch { return false; }
  }

  /**
   * @param useCompanyCopies true cuando la factura se acaba de generar (Caja → Cobro):
   *   imprime las copias configuradas por la empresa. Las reimpresiones salen en una.
   */
  async print(invoiceId: number, sellerFallback?: string | null, useCompanyCopies = false): Promise<void> {
      if (await this.isHalfLetter()) {
        // Al generar la factura: la primera copia dice ORIGINAL y las demás COPIA.
        // Reimpresión desde Consulta: sale una sola, marcada COPIA.
        const pageCopies = useCompanyCopies ? await this.qzPrintService.invoiceCopies() : 1;
        // La factura se arma una sola vez; las copias solo cambian la etiqueta ORIGINAL/COPIA
        // y van todas en un mismo trabajo de impresión (una conexión y una firma de QZ).
        const firstLabel = useCompanyCopies ? 'ORIGINAL' : 'COPIA';
        const page = await this.buildHalfLetterHtml(invoiceId, sellerFallback, firstLabel);
        const documents = Array.from({ length: pageCopies }, (_, copy) => copy === 0
          ? page.html
          : page.html.split(`<div class="copy">${firstLabel}</div>`).join('<div class="copy">COPIA</div>'));
        const printed = await this.qzPrintService.printHtml(this.mergeDocuments(documents), `Factura ${page.number}`, 'width=1000,height=700', 1, 'media_carta');
        if (printed === 'unavailable') throw new Error('No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
        await this.invoicesService.markInvoicePrinted(invoiceId);
        return;
      }
      const [detail, session] = await Promise.all([this.invoicesService.getInvoiceForEditing(invoiceId), this.auth.restoreSession()]);
      // Vendedor guardado en la factura; las facturas anteriores al cambio no lo tienen.
      const seller = sellerFallback || session?.fullName || 'N/D';
      const company = await this.activeCompany(session?.companyId);
      const fiscalCodes = await this.createFiscalCodes(
        detail.qrLink || `${detail.number}|${detail.ncf}|${detail.grandTotal.toFixed(2)}`,
        detail.number
      );
      // Forma de pago (Efectivo, Tarjeta…) junto a la condición.
      const paymentName = await this.paymentMethodName(detail);
      const rows = detail.lines.map((line) => {
        const priceWithoutTax = line.taxRate > 0 ? line.unitPrice / (1 + (line.taxRate / 100)) : line.unitPrice;
        return `<tr><td>${line.quantity} x ${priceWithoutTax.toFixed(2)}<br><b>${this.escape(line.description)}</b></td><td>${line.taxAmount.toFixed(2)}</td><td>${line.lineTotal.toFixed(2)}</td></tr>`;
      }).join('');
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${this.escape(detail.number)}</title><style>body{font:11px Arial;margin:0;color:#111}.head{text-align:center}.head .logo{display:block;max-width:42mm;max-height:22mm;margin:0 auto 4px;object-fit:contain}.company{font-size:15px;font-weight:800}.muted{font-size:11px}.receipt-type{border-top:1px dashed #111;border-bottom:1px dashed #111;margin:8px 0;padding:5px 0;text-align:center;font-size:12px;font-weight:800}.document{line-height:1.45;margin:8px 0}.document span{display:inline-block;min-width:76px}.customer{line-height:1.5;margin:10px 0}table{border-collapse:collapse;width:100%;margin-top:8px;table-layout:fixed}th{border-bottom:1px dashed #777;padding:4px 1px;text-align:left;font-size:10px}td{border:0;padding:3px 1px;text-align:left;vertical-align:top;font-size:10px}th:nth-child(1),td:nth-child(1){width:43%}th:nth-child(2),td:nth-child(2){width:19%;text-align:right}th:nth-child(3),td:nth-child(3){width:38%;text-align:right}.total{margin-top:10px}.total p{display:flex;justify-content:space-between;margin:4px 0}.total strong{font-size:13px}.fiscal{border-top:1px dashed #111;margin-top:10px;padding-top:8px;text-align:center;font-size:9px}.fiscal img.qr{width:36mm;height:36mm;display:block;margin:0 auto 5px;image-rendering:pixelated;image-rendering:crisp-edges}.fiscal p{margin:3px 0}.barcode{margin-top:9mm;max-width:100%;height:auto}</style></head><body><div class="head">${company?.logoUrl ? `<img class="logo" src="${this.escape(company.logoUrl)}" alt="">` : ''}<div class="company">${this.escape(company?.legalName || company?.tradeName || session?.companyName || 'SALTOR SYSTEM')}</div><div class="muted">RNC: ${this.escape(company?.rnc || 'N/D')}</div><div class="muted">${this.escape(company?.address || 'N/D')}</div><div class="muted">Tel.: ${this.escape(company?.phone || 'N/D')}</div></div><div class="document"><div><span>No. Factura:</span>${this.escape(detail.number)}</div><div><span>Fecha:</span>${this.escape(detail.invoiceDate)}</div><div><span>e-NCF:</span>${this.escape(detail.ncf || 'N/A')}</div></div><div class="receipt-type">${this.escape(this.receiptDocumentType(detail.ncfType))}</div><div class="customer"><strong>Cliente:</strong> ${this.escape(detail.customerName)}<br><strong>RNC/Cédula:</strong> ${this.escape(detail.rnc || 'Consumidor final')}<br><strong>Dirección:</strong> ${this.escape(detail.customerAddress || 'N/D')}<br><strong>Teléfono:</strong> ${this.escape(detail.customerPhone || 'N/D')}<br><strong>Vendedor:</strong> ${this.escape(seller)}</div><table><thead><tr><th>DESCRIPCIÓN</th><th>ITBIS</th><th>VALOR</th></tr></thead><tbody>${rows}</tbody></table><p><strong>Condición:</strong> ${this.escape(detail.paymentMethod)}${paymentName ? ` — ${this.escape(paymentName)}` : ''}</p>${printableInvoiceNotes(detail.notes) ? `<p><strong>Notas:</strong> ${this.escape(printableInvoiceNotes(detail.notes))}</p>` : ''}<div class="total"><p><span>Subtotal</span><span>${detail.subtotal.toFixed(2)}</span></p><p><span>ITBIS</span><span>${detail.taxTotal.toFixed(2)}</span></p><p><strong>Total</strong><strong>${detail.grandTotal.toFixed(2)}</strong></p></div><div class="fiscal">${fiscalCodes.qr ? `<img class="qr" src="${fiscalCodes.qr}" alt="Código QR">` : ''}<p><b>Código de seguridad:</b> ${this.escape(detail.securityCode || 'Pendiente')}</p><p><b>Fecha firma digital:</b> ${this.escape(detail.signatureDate || 'Pendiente')}</p>${fiscalCodes.barcode ? `<img class="barcode" src="${fiscalCodes.barcode}" alt="Código de barras"><p>${this.escape(detail.number)}</p>` : ''}</div><script>window.onload=function(){window.print();};<\/script></body></html>`;
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

  /** Une varios documentos del mismo formato en uno, separados por salto de página. */
  private mergeDocuments(documents: string[]): string {
    if (documents.length <= 1) return documents[0] ?? '';
    const bodyOf = (html: string) => {
      const start = html.indexOf('<body>');
      const end = html.lastIndexOf('</body>');
      return start >= 0 && end > start ? html.slice(start + 6, end).replace(/<script[\s\S]*?<\/script>/gi, '') : html;
    };
    const first = documents[0];
    const end = first.lastIndexOf('</body>');
    if (first.indexOf('<body>') < 0 || end < 0) return first;
    const extra = documents.slice(1).map((html) => `<div class="page-break"></div>${bodyOf(html)}`).join('');
    return first.slice(0, end) + extra + first.slice(end);
  }

  private companyCache: { id: number; promise: Promise<Awaited<ReturnType<CompaniesService['getCompanies']>>[number] | undefined> } | null = null;
  /** Datos de la empresa activa (logo, RNC…): se leen una vez y se guardan para las siguientes impresiones. */
  private activeCompany(companyId: number | null | undefined) {
    const id = Number(companyId || 0);
    if (!this.companyCache || this.companyCache.id !== id) {
      const promise = this.companiesService.getCompanies().then((list) => list.find((item) => item.id === id));
      promise.catch(() => { if (this.companyCache?.promise === promise) this.companyCache = null; });
      this.companyCache = { id, promise };
    }
    return this.companyCache.promise;
  }

  private paymentNameCache = new Map<number, string>();

  /** Descripción de la forma de pago de la factura (Efectivo, Tarjeta, Transferencia, Crédito…). */
  private async paymentMethodName(detail: EditableInvoiceData): Promise<string> {
    const paymentCode = Number((detail as { paymentMethodCode?: number }).paymentMethodCode || 0);
    if (!paymentCode) return '';
    if (this.paymentNameCache.has(paymentCode)) return this.paymentNameCache.get(paymentCode)!;
    try {
      const { data } = await this.supabase.client.from('formapago').select('descripcion').eq('codigo', paymentCode).maybeSingle();
      const name = String((data as { descripcion?: string } | null)?.descripcion ?? '');
      this.paymentNameCache.set(paymentCode, name);
      return name;
    } catch {
      return '';
    }
  }

  private async renderHalfLetter(detail: EditableInvoiceData, sellerFallback: string | null | undefined, copyLabel: string, kind: 'factura' | 'orden'): Promise<{ html: string; number: string }> {
    const isInvoice = kind === 'factura';
    const session = await this.auth.restoreSession();
    const seller = sellerFallback || session?.fullName || 'N/D';

    // Unidad (y código, si la línea no lo guardó) de cada producto.
    const productIds = [...new Set(detail.lines.map((line) => line.productId).filter((id): id is number => !!id))];
    const products = new Map<number, { codigo: string; unidad: string }>();
    type ProductRow = { id: number; codigo: string | null; unidad: string | null };
    // Todo lo que no depende entre sí se consulta a la vez (antes iba uno detrás de otro).
    const [company, productRows, codes, footerTextValue, paymentName] = await Promise.all([
      this.activeCompany(session?.companyId),
      productIds.length
        ? Promise.resolve(this.supabase.client.from('products').select('id, codigo, unidad').in('id', productIds)).then(({ data }) => (data ?? []) as ProductRow[])
        : Promise.resolve([] as ProductRow[]),
      this.createFiscalCodes(detail.qrLink || detail.number, detail.number),
      this.printSettings.getFooterText().catch(() => ''),
      this.paymentMethodName(detail)
    ]);
    for (const row of productRows) products.set(row.id, { codigo: row.codigo ?? '', unidad: row.unidad ?? '' });
    // El QR solo se imprime cuando la DGII ya devolvió su enlace (factura firmada).
    const qr = { qr: isInvoice && detail.qrLink ? codes.qr : '', barcode: codes.barcode };
    const e = (value: string | number | null | undefined) => this.escape(value ?? '');
    const money = (value: number) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const qty = (value: number) => Number.isInteger(value) ? String(value) : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const now = new Date();
    const printTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    // NCF pendiente: el espacio queda en blanco (no se imprime ningún mensaje).
    const ncf = !detail.ncf || detail.ncf.toUpperCase().startsWith('PENDIENTE') ? '' : detail.ncf;
    // Mensaje de pie de página configurado por la empresa (hasta 3 líneas), debajo de la firma.
    const footerText = String(footerTextValue ?? '');
    // El pie de página solo va en la factura (no en la orden de venta).
    const footerLines = isInvoice ? footerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3) : [];
    // Forma de pago (Efectivo, Tarjeta…) debajo de la condición.
    // Fecha de firma legible: 2026-11-03T14:36:10+00:00 -> 03-11-2026 10:36:10 (hora de RD).
    const signatureDate = (() => {
      const raw = String(detail.signatureDate || '');
      const parsed = raw ? new Date(raw) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) return raw;
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(parsed);
      const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
      return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
    })();
    const companyName = company?.legalName || company?.tradeName || session?.companyName || 'SALTOR SYSTEM';

    const rows = detail.lines.map((line) => {
      const product = line.productId ? products.get(line.productId) : undefined;
      const code = line.productCode || product?.codigo || '';
      const unitPrice = line.quantity ? line.lineTotal / line.quantity : line.unitPrice;
      return `<tr><td>${e(code)}</td><td class="num qty">-${e(qty(line.quantity))}-</td><td>${e((product?.unidad || 'UNIDAD').toUpperCase())}</td>`
        + `<td class="desc">${e(line.description)}</td><td class="num">${money(unitPrice)}</td><td class="num">${money(line.taxAmount)}</td><td class="num">${money(line.lineTotal)}</td></tr>`;
    });
    // Varias hojas: cada media carta repite el encabezado. Las hojas intermedias solo llevan
    // "continúa" al pie y admiten más productos; la última lleva QR y totales y admite menos.
    // Capacidad en renglones (letra de 11 px): una descripción larga ocupa más de un renglón.
    const ROWS_FULL_PAGE = 15;
    const ROWS_LAST_PAGE = 11;
    const weights = detail.lines.map((line) => Math.max(1, Math.ceil(String(line.description || '').length / 40)));
    const sum = (from: number, to: number) => weights.slice(from, to).reduce((total, value) => total + value, 0);
    const rowPages: string[][] = [];
    let start = 0;
    while (sum(start, rows.length) > ROWS_LAST_PAGE) {
      let end = start;
      while (end < rows.length - 1 && sum(start, end + 1) <= ROWS_FULL_PAGE) end++;
      if (end === start) end = start + 1;
      rowPages.push(rows.slice(start, end));
      start = end;
    }
    rowPages.push(rows.slice(start));

    const topSection = `<section class="top${isInvoice ? ' top--qr' : ''}">
  <div><div class="copy">${e(copyLabel)}</div>
    <div class="client"><b>CLIENTE</b><div>${e(detail.rnc || '')}</div><div>${e(detail.customerName)}${detail.customerId ? `(${e(detail.customerId)})` : ''}</div>${detail.customerPhone ? `<div>${e(detail.customerPhone)}</div>` : ''}</div></div>
  <div class="company">${company?.logoUrl ? `<img class="logo" src="${e(company.logoUrl)}" alt="">` : ''}<div class="name">${e(companyName)}</div><p>${e(company?.address || '')}</p><p>${e(company?.rnc || '')}</p><p>${e(company?.phone || '')}</p></div>
  <div class="doc">${isInvoice
      ? `<p class="title">FACTURA</p><div class="type"><span>${e(this.receiptDocumentType(detail.ncfType))}</span><span></span></div>`
      : `<p class="title" style="letter-spacing:3px">ORDEN DE VENTA</p><div class="type"><span>Documento no fiscal</span><span></span></div>`}
    <div class="info">${isInvoice ? `<div><span>NCF</span><span>${e(ncf)}</span></div>` : ''}<div><span>No.</span><span class="no">${e(detail.number)}</span></div><div><span>FECHA</span><span>${e(this.formatDate(detail.invoiceDate))}</span></div><div><span>HORA IMP.</span><span>${e(this.formatDate(now.toISOString()))} ${e(printTime)}</span></div><div><span>VENDEDOR</span><span>${e(seller)}</span></div><div><span>CONDICION</span><span>${e(detail.paymentMethod)}${paymentName ? ` — ${e(paymentName)}` : ''}</span></div></div></div>
  ${isInvoice ? `<div class="qr-head">${qr.qr ? `<img src="${qr.qr}" alt="Código QR">` : ''}${detail.securityCode ? `<div><b>Código de seguridad:</b> ${e(detail.securityCode)}</div>` : ''}${signatureDate ? `<div><b>Fecha de firma:</b> ${e(signatureDate)}</div>` : ''}</div>` : ''}
</section>`;
    const tableHead = `<table class="items"><thead><tr><th class="c-code">Codigo</th><th class="c-qty" style="text-align:center">Cantidad</th><th class="c-unit">Unidad</th><th class="c-desc">Descripcion</th><th class="c-price" style="text-align:right">Precio</th><th class="c-tax" style="text-align:right">Itbis</th><th class="c-total" style="text-align:right">Valor</th></tr></thead>`;
    const lastPage = rowPages.length - 1;
    // En la factura no se imprimen las referencias a la orden de venta ni a la cotización.
    const pageNotes = isInvoice ? printableInvoiceNotes(detail.notes) : String(detail.notes ?? '');
    const pagesHtml = rowPages.map((pageRows, index) => {
      const isLast = index === lastPage;
      const closingRow = isLast
        ? '<tr><td colspan="7" class="last">************ Ultima Linea ************</td></tr>'
        : '<tr><td colspan="7" class="last">************ Continúa en la siguiente página ************</td></tr>';
      return `<main class="page">\n${topSection}\n${tableHead}\n<tbody>${pageRows.join('')}${closingRow}</tbody></table>\n`
        + `${isLast && pageNotes ? `<div class="notes"><b>Notas:</b> ${e(pageNotes)}</div>` : ''}`
        + `<footer class="foot">`
        + `<div class="fiscal"></div>`
        + `<div class="center"><div class="pag">Pag. ${index + 1}/${rowPages.length}</div>${isLast ? `<div class="sign">Recibido Conforme</div>${footerLines.length ? `<div class="pie">${footerLines.map((line) => `<div>${e(line)}</div>`).join('')}</div>` : ''}` : ''}</div>`
        + `${isLast ? `<div><div class="totals"><div><b>SUBTOTAL</b><span>${money(detail.subtotal)}</span></div><div><b>DESC.</b><span>0.00</span></div><div><b>ITBIS</b><span>${money(detail.taxTotal)}</span></div><div class="grand"><b>TOTAL</b><span>${money(detail.grandTotal)}</span></div></div><div class="peso">Valor en Peso RD$</div></div>` : '<div></div>'}`
        + `</footer></main>`;
    }).join('<div class="page-break"></div>');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${isInvoice ? 'Factura' : 'Orden de venta'} ${e(detail.number)}</title><style>
@page{size:letter portrait;margin:0}*{box-sizing:border-box}html{margin:0!important;padding:0!important}
body{width:100%!important;margin:0!important;padding:.8cm 1cm .25cm!important;color:#111;font-family:Arial,sans-serif;font-size:10px}
.page{width:100%!important;min-height:4.7in;display:flex;flex-direction:column}
.mono{font-family:'Courier New',Courier,monospace}
.top{display:grid;grid-template-columns:1.9in 1fr 2.75in;gap:10px;align-items:start}
.top--qr{grid-template-columns:1.8in 1fr 2.5in 1.35in}
.qr-head{text-align:right;font-size:7.5px;line-height:1.3}.qr-head img{width:23mm;height:23mm;display:block;margin:0 0 2px auto;image-rendering:pixelated}
.pie{margin-top:4px;text-align:center;font-size:10px;line-height:1.25;font-family:Arial,sans-serif}
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
.items th{font-weight:400;font-size:12px;text-align:left;border-bottom:1px solid #111;padding:1px 3px}
.items td{font-family:'Courier New',monospace;font-size:11px;font-weight:700;padding:1px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
.page-break{page-break-after:always;break-after:page;height:0}
.continua{font-family:'Courier New',monospace;font-size:10px;text-align:right;padding-top:8px}
</style></head><body>${pagesHtml}<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}<\/script></body></html>`;
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
    // La proforma (E332) se imprime como factura de consumo: el cliente no ve la palabra "proforma".
    if (/(?:^|\D)332(?:\D|$)/.test(type) || type.includes('proforma')) return 'Factura de Consumo Electrónica';
    if (type.includes('31') || type.includes('credito fiscal') || type.includes('crédito fiscal')) return 'Factura de Crédito Fiscal';
    if (type.includes('32') || type.includes('consumo')) return 'Factura de Consumo Electrónica';
    return (value || '').replace(/^\s*\d{2}\s*-\s*/, '').trim() || 'Factura';
  }
}
