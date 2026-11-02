import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/services/auth/auth.service';
import { EcfService } from '../../core/services/ecf/ecf.service';
import { EditableInvoiceData, InvoiceSaveData, InvoicesService } from '../../core/services/invoices/invoices.service';
import { PaymentMethod, PaymentMethodsService } from '../../core/services/payment-methods/payment-methods.service';
import { PermissionsService } from '../../core/services/permissions/permissions.service';
import { CompanyBillingModeService } from '../../core/services/printing/company-billing-mode.service';
import { InvoicePrintService } from '../../core/services/printing/invoice-print.service';
import { SalesOrderHeaderRow, SalesOrdersService } from '../../core/services/sales-orders/sales-orders.service';

/**
 * Caja › Facturar órdenes (empresas que cobran en caja y usan órdenes de venta).
 * La cajera elige una orden pendiente (o escanea su volante), la ve tal como se
 * hizo (no se edita), elige el comprobante y la forma de pago y cobra: se genera
 * la factura, se cobra, se envía a la DGII si corresponde, se imprime y la orden
 * queda cerrada con su número de factura.
 */
@Component({
  selector: 'app-cash-orders-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-orders-page.component.html',
  styleUrls: ['./cash-orders-page.component.scss']
})
export class CashOrdersPageComponent implements OnInit {
  private readonly perms = inject(PermissionsService);

  orders: SalesOrderHeaderRow[] = [];
  paymentMethods: PaymentMethod[] = [];
  search = '';
  scanCode = '';
  selected: SalesOrderHeaderRow | null = null;
  detail: EditableInvoiceData | null = null;
  ncfType: 'E32' | 'E31' = 'E32';
  paymentCode = 1;
  received: number | null = null;
  isCashierMode = true;
  isLoading = false;
  isLoadingDetail = false;
  isWorking = false;
  message = '';
  isError = false;

  constructor(
    private readonly salesOrders: SalesOrdersService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly printService: InvoicePrintService,
    private readonly ecfService: EcfService,
    private readonly auth: AuthService,
    private readonly billingMode: CompanyBillingModeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.isCashierMode = (await this.billingMode.getMode()) === 'Caja';
    try { this.paymentMethods = await this.paymentMethodsService.getPaymentMethods(); } catch { /* se usan los códigos */ }
    await this.load();
  }

  get filteredOrders(): SalesOrderHeaderRow[] {
    const query = this.search.trim().toLocaleLowerCase();
    return this.orders.filter((order) => !query || [order.numero_orden, order.cliente_nombre, order.cliente_rnc, order.numero_cotizacion]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(query)));
  }

  get pendingTotal(): number { return this.filteredOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0); }
  get total(): number { return Number(this.detail?.grandTotal ?? 0); }
  get isCredit(): boolean { return this.paymentCode === 4; }
  get change(): number { return Math.max(0, Number(this.received || 0) - this.total); }
  get shortfall(): number { return Math.max(0, this.total - Number(this.received || 0)); }
  get rncDigits(): string { return (this.detail?.rnc ?? '').replace(/\D/g, ''); }
  get canFiscalCredit(): boolean { return this.rncDigits.length === 9 || this.rncDigits.length === 11; }
  get canCollect(): boolean {
    if (!this.detail || this.isWorking || !this.detail.lines.length) return false;
    if (this.ncfType === 'E31' && !this.canFiscalCredit) return false;
    if (this.isCredit) return !!this.detail.customerId;
    return this.paymentCode !== 1 || Number(this.received || 0) >= this.total;
  }

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      const all = await this.salesOrders.getOrders();
      this.orders = all.filter((order) => order.estado !== 'Anulada' && !order.numero_factura);
      if (this.selected && !this.orders.some((o) => o.id === this.selected?.id)) { this.selected = null; this.detail = null; }
    } catch (error) {
      this.setMessage(this.errorText(error), true);
    } finally {
      this.isLoading = false;
    }
  }

  async select(order: SalesOrderHeaderRow): Promise<void> {
    this.selected = order;
    this.detail = null;
    this.message = '';
    this.isLoadingDetail = true;
    try {
      this.detail = await this.salesOrders.getOrderForEditing(order.id);
      this.ncfType = this.rncDigits.length === 9 ? 'E31' : 'E32';
      this.paymentCode = this.detail.paymentMethodCode || 1;
      this.received = this.total;
      setTimeout(() => document.querySelector<HTMLInputElement>('#coReceived')?.select(), 50);
    } catch (error) {
      this.setMessage(this.errorText(error), true);
    } finally {
      this.isLoadingDetail = false;
    }
  }

  onMethodChange(): void {
    if (this.paymentCode !== 1) this.received = this.total;
  }

  /** El escáner leyó el volante de la orden. */
  async scan(): Promise<void> {
    const code = this.scanCode.trim();
    this.scanCode = '';
    if (!code) return;
    let order = this.orders.find((item) => item.numero_orden === code);
    if (!order) { await this.load(); order = this.orders.find((item) => item.numero_orden === code); }
    if (order) { await this.select(order); return; }
    try {
      const found = await this.salesOrders.findOrderByNumber(code);
      if (!found) this.setMessage(`No se encontró la orden ${code}.`, true);
      else if (found.estado === 'Anulada') this.setMessage(`La orden ${code} está anulada.`, true);
      else if (found.numero_factura) this.setMessage(`La orden ${code} ya fue facturada en la factura ${found.numero_factura}.`, true);
    } catch (error) {
      this.setMessage(this.errorText(error), true);
    }
  }

  async collect(): Promise<void> {
    const order = this.selected;
    const detail = this.detail;
    if (!order || !detail || !this.canCollect) return;
    if (!this.perms.ensure('facturas.crear')) return;
    this.isWorking = true;
    this.message = '';
    const change = this.change;
    const code = this.paymentCode;

    // 1) Factura con los datos de la orden, sin cambios.
    const invoiceData: InvoiceSaveData = {
      customerId: detail.customerId, customerName: detail.customerName, rnc: detail.rnc,
      customerPhone: detail.customerPhone, customerEmail: detail.customerEmail, customerAddress: detail.customerAddress, customerCity: detail.customerCity,
      invoiceDate: this.today(), ncfType: this.ncfType, ncf: '',
      paymentMethod: code === 4 ? 'Credito' : 'Contado', paymentMethodCode: code,
      notes: [detail.notes, `Orden ${detail.number}`].filter(Boolean).join(' · '),
      subtotal: detail.subtotal, taxTotal: detail.taxTotal, grandTotal: detail.grandTotal,
      lines: detail.lines.map((line) => ({ ...line, productCode: (line as { productCode?: string }).productCode ?? '' }))
    };
    let invoiceId: number;
    let invoiceNumber: string;
    try {
      const saved = await this.invoicesService.createInvoice(invoiceData);
      invoiceId = saved.id;
      invoiceNumber = saved.numero_factura;
    } catch (error) {
      this.isWorking = false;
      await Swal.fire({ icon: 'error', title: 'No se pudo generar la factura', text: this.errorText(error) });
      return;
    }

    // 2) La orden queda cerrada con su factura.
    try { await this.salesOrders.linkInvoice(invoiceId, order.id); }
    catch (error) { void Swal.fire({ icon: 'warning', title: `Factura ${invoiceNumber} generada`, text: `No se pudo anotar la factura en la orden: ${this.errorText(error)}` }); }

    // 3) Cobro (asigna el comprobante; con proformas activas el servidor cambia E32 a E332).
    let ncfType = this.ncfType as string;
    try {
      const collected = await this.invoicesService.collectInvoice(invoiceId, code);
      ncfType = collected.tipo_ncf;
    } catch (error) {
      this.isWorking = false;
      await Swal.fire({ icon: 'error', title: `Factura ${invoiceNumber} generada sin cobrar`, text: `${this.errorText(error)} Quedó pendiente en Caja › Cobro de facturas.` });
      await this.load();
      return;
    }

    // 4) DGII e impresión, igual que Cobro de facturas.
    const session = await this.auth.restoreSession();
    const seller = session?.fullName ?? '';
    let dgiiProblem = '';
    let queued = false;
    if (this.requiresDgii(ncfType)) {
      try {
        const sent = await this.ecfService.sendInvoice(invoiceId);
        if (this.isProforma(ncfType) && (sent.dgii_estado !== 'Firmada' || !sent.ecf_xml_firmado)) {
          throw new Error(sent.dgii_mensaje_respuesta || 'No se recibió el XML firmado de la proforma.');
        }
        queued = ['En cola', 'Enviando DGII', 'En proceso DGII'].includes(sent.dgii_estado ?? '');
        if (['Rechazado', 'Error', 'Envío por confirmar', 'Preparando envío'].includes(sent.dgii_estado ?? '')) dgiiProblem = sent.dgii_mensaje_respuesta || 'La DGII no aceptó la factura.';
      } catch (error) {
        dgiiProblem = this.errorText(error);
      }
    }

    const consumer = this.isConsumerInvoice(ncfType);
    if (!dgiiProblem || consumer) {
      try { await this.printService.print(invoiceId, seller, true); }
      catch (error) { await Swal.fire({ icon: 'warning', title: 'Cobrada, pero no se pudo imprimir', text: this.errorText(error) }); }
    }
    if (dgiiProblem) {
      await Swal.fire({
        icon: 'warning', title: `Factura ${invoiceNumber} cobrada`,
        html: consumer
          ? `La factura fue impresa. La DGII sigue pendiente: <b>${this.escape(dgiiProblem)}</b>`
          : `No se pudo enviar a la DGII: <b>${this.escape(dgiiProblem)}</b><br><br>Revisa el comprobante en Facturación › Consulta antes de imprimirlo.`
      });
    } else {
      void Swal.fire({
        icon: 'success', title: queued ? `Factura ${invoiceNumber} cobrada y en cola` : `Factura ${invoiceNumber} cobrada`,
        text: change > 0 ? `Devuelta: ${this.money(change)}` : queued ? 'Impresa; la DGII la confirma en unos momentos.' : '',
        timer: change > 0 ? 6000 : 1800, showConfirmButton: change > 0
      });
    }
    this.setMessage(`Orden ${detail.number} facturada en la factura ${invoiceNumber}.`, false);
    this.selected = null;
    this.detail = null;
    this.isWorking = false;
    await this.load();
  }

  methodName(code: number): string { return this.paymentMethods.find((m) => m.code === code)?.description ?? `Forma ${code}`; }
  money(value: number | string): string { return Number(value ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  qty(value: number): string { return Number(value ?? 0).toLocaleString('es-DO', { maximumFractionDigits: 2 }); }
  date(value: string): string { return value ? new Intl.DateTimeFormat('es-DO').format(new Date(`${value.slice(0, 10)}T12:00:00`)) : ''; }
  time(value?: string): string { return value ? new Date(value).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : ''; }

  private today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  private isProforma(ncfType: string): boolean { return /(?:^|\D)332(?:\D|$)/.test(ncfType || ''); }
  private isConsumerInvoice(ncfType: string): boolean { return /(?:^|\D)32(?:\D|$)/.test(ncfType || '') && !this.isProforma(ncfType); }
  private requiresDgii(ncfType: string): boolean { return /(?:^|\D)(332|31|32|44|45|46)(?:\D|$)/.test(ncfType || ''); }
  private escape(value: string): string { return value.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string)); }
  private errorText(error: unknown): string { return String((error as { message?: string })?.message ?? error ?? 'Error'); }
  private setMessage(text: string, isError: boolean): void { this.message = text; this.isError = isError; }
}
