import { Injectable } from '@angular/core';
import * as JsBarcodeModule from 'jsbarcode';
import { AuthService } from '../auth/auth.service';
import { CompaniesService } from '../companies/companies.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { QzPrintService } from './qz-print.service';

/**
 * Volante de la orden de venta: un ticket pequeño con el número de la orden en
 * código de barras. Quien factura lo escanea en Facturación para convertirla en factura.
 */
@Injectable({ providedIn: 'root' })
export class SalesOrderSlipService {
  constructor(
    private readonly salesOrders: SalesOrdersService,
    private readonly auth: AuthService,
    private readonly companiesService: CompaniesService,
    private readonly qzPrintService: QzPrintService
  ) {}

  async print(orderId: number): Promise<void> {
    const order = await this.salesOrders.getOrderForEditing(orderId);
    const session = await this.auth.restoreSession();
    const company = (await this.companiesService.getCompanies()).find((item) => item.id === session?.companyId);
    const e = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
    const items = order.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const money = (n: number) => Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let barcode = '';
    try {
      const canvas = document.createElement('canvas');
      const draw = (JsBarcodeModule as any).default ?? JsBarcodeModule;
      draw(canvas, order.number, { format: 'CODE128', displayValue: false, margin: 0, width: 2, height: 70 });
      barcode = canvas.toDataURL('image/png');
    } catch { /* sin código de barras se imprime el número grande */ }

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Orden ${e(order.number)}</title><style>
@page{size:80mm auto;margin:3mm}body{margin:0;font:12px Arial;color:#000}.slip{width:72mm;text-align:center}
.company{font-size:13px;font-weight:800}.title{margin:6px 0;padding:4px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;font-size:14px;font-weight:800;letter-spacing:1px}
.barcode{display:block;width:66mm;height:22mm;margin:6px auto 2px;object-fit:contain}.number{font:800 20px 'Courier New',monospace;letter-spacing:2px}
.info{text-align:left;margin-top:8px;line-height:1.5}.info div{display:flex;justify-content:space-between;gap:8px}.total{font-size:15px;font-weight:800;border-top:1px solid #000;margin-top:4px;padding-top:3px}
.hint{margin-top:8px;font-size:10px}
</style></head><body><main class="slip">
<div class="company">${e(company?.tradeName || company?.legalName || session?.companyName || '')}</div>
<div class="title">ORDEN DE VENTA</div>
${barcode ? `<img class="barcode" src="${barcode}" alt="">` : ''}
<div class="number">${e(order.number)}</div>
<div class="info">
  <div><span>Fecha</span><span>${new Date().toLocaleString('es-DO')}</span></div>
  <div><span>Cliente</span><span>${e(order.customerName || 'CLIENTE CONTADO')}</span></div>
  <div><span>Vendedor</span><span>${e(session?.fullName || '')}</span></div>
  <div><span>Artículos</span><span>${items.toLocaleString('es-DO', { maximumFractionDigits: 2 })}</span></div>
  <div class="total"><span>TOTAL</span><span>RD$ ${money(order.grandTotal)}</span></div>
</div>
<div class="hint">Presente este volante en caja para facturar y pagar.</div>
</main><script>window.onload=function(){window.print();};<\/script></body></html>`;

    await this.qzPrintService.printHtml(html, `Orden ${order.number}`);
  }
}
