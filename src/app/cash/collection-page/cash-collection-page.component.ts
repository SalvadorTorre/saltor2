import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/services/auth/auth.service';
import { EcfService } from '../../core/services/ecf/ecf.service';
import { CANCELLATION_TYPES } from '../../core/services/invoices/cancellation-types';
import { EditableInvoiceData, InvoicesService, PendingCollectionInvoice } from '../../core/services/invoices/invoices.service';
import { PaymentMethod, PaymentMethodsService } from '../../core/services/payment-methods/payment-methods.service';
import { CompanyBillingModeService } from '../../core/services/printing/company-billing-mode.service';
import { InvoicePrintService } from '../../core/services/printing/invoice-print.service';

const REFRESH_MS = 20000;

/**
 * Caja → Cobro de facturas. En las empresas con modo "Cobro en caja" los vendedores
 * guardan la factura pendiente; aquí la cajera la cobra, se envía a la DGII si el
 * tipo lo requiere y se imprime.
 */
@Component({
  selector: 'app-cash-collection-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-collection-page.component.html',
  styleUrls: ['./cash-collection-page.component.scss']
})
export class CashCollectionPageComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly pendingPrints = new Map<number, string>();
  invoices: PendingCollectionInvoice[] = [];
  paymentMethods: PaymentMethod[] = [];
  selected: PendingCollectionInvoice | null = null;
  detail: EditableInvoiceData | null = null;
  paymentCode = 1;
  received: number | null = null;
  text = '';
  isLoading = false;
  isWorking = false;
  isCashierMode = true;
  errorMessage = '';
  lastRefresh: Date | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly printService: InvoicePrintService,
    private readonly ecfService: EcfService,
    private readonly auth: AuthService,
    private readonly billingMode: CompanyBillingModeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.ecfService.updates$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event.kind !== 'FACTURA' || !this.pendingPrints.has(event.documentId)) return;
      const seller = this.pendingPrints.get(event.documentId)!;
      if (['Aceptado', 'Aceptado condicional', 'Firmada'].includes(event.result.dgii_estado ?? '')) {
        this.pendingPrints.delete(event.documentId);
        void this.printService.print(event.documentId, seller).catch(error => Swal.fire({ icon: 'warning', title: 'No se pudo imprimir', text: this.message(error) }));
      } else if (['Error', 'Rechazado'].includes(event.result.dgii_estado ?? '')) {
        this.pendingPrints.delete(event.documentId);
        void Swal.fire({ icon: 'warning', title: 'Revisar comprobante cobrado', text: event.result.dgii_mensaje_respuesta ?? 'DGII no aceptó el comprobante.' });
      }
    });
    this.isCashierMode = (await this.billingMode.getMode()) === 'Caja';
    try { this.paymentMethods = await this.paymentMethodsService.getPaymentMethods(); } catch { /* se usan los códigos */ }
    await this.load();
    this.timer = setInterval(() => { if (!this.isWorking) void this.load(true); }, REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async load(silent = false): Promise<void> {
    if (!silent) this.isLoading = true;
    try {
      const session = await this.auth.restoreSession();
      this.invoices = await this.invoicesService.getPendingCollection(session?.branchId);
      this.lastRefresh = new Date();
      if (this.selected && !this.invoices.some((i) => i.id === this.selected?.id)) { this.selected = null; this.detail = null; }
      if (!silent) this.errorMessage = '';
    } catch (error) {
      if (!silent) this.errorMessage = this.message(error);
    } finally { this.isLoading = false; }
  }

  get visible(): PendingCollectionInvoice[] {
    const term = this.text.trim().toLowerCase();
    return term ? this.invoices.filter((i) => `${i.number} ${i.customerName} ${i.rnc} ${i.seller}`.toLowerCase().includes(term)) : this.invoices;
  }

  get pendingTotal(): number { return this.invoices.reduce((sum, i) => sum + i.total, 0); }
  get isCredit(): boolean { return this.paymentCode === 4; }
  get change(): number { return Math.max(0, Number(this.received || 0) - (this.selected?.total ?? 0)); }
  get shortfall(): number { return Math.max(0, (this.selected?.total ?? 0) - Number(this.received || 0)); }
  get canCollect(): boolean {
    if (!this.selected || this.isWorking) return false;
    if (this.isCredit) return !!this.selected.customerId;
    return this.paymentCode !== 1 || Number(this.received || 0) >= this.selected.total;
  }

  methodName(code: number): string { return this.paymentMethods.find((m) => m.code === code)?.description ?? `Forma ${code}`; }
  waitLabel(i: PendingCollectionInvoice): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(i.createdAt).getTime()) / 60000));
    return minutes < 60 ? `hace ${minutes} min` : `hace ${Math.round(minutes / 60)} h`;
  }

  async select(invoice: PendingCollectionInvoice): Promise<void> {
    this.selected = invoice;
    this.detail = null;
    this.paymentCode = invoice.condition === 'Credito' ? 4 : 1;
    this.received = invoice.total;
    try { this.detail = await this.invoicesService.getInvoiceForEditing(invoice.id); }
    catch (error) { this.errorMessage = this.message(error); }
    setTimeout(() => document.querySelector<HTMLInputElement>('#ccReceived')?.select(), 50);
  }

  onMethodChange(): void {
    if (!this.selected) return;
    if (this.paymentCode !== 1) this.received = this.selected.total;
  }

  async collect(): Promise<void> {
    const invoice = this.selected;
    if (!invoice || !this.canCollect) return;
    this.isWorking = true;
    this.errorMessage = '';
    const change = this.change;
    try {
      const collected = await this.invoicesService.collectInvoice(invoice.id, this.paymentCode);
      // El servidor convierte E32 a E332 solo si la empresa tiene proformas activas.
      invoice.ncfType = collected.tipo_ncf;
    } catch (error) {
      this.isWorking = false;
      await Swal.fire({ icon: 'error', title: 'No se pudo cobrar', text: this.message(error) });
      await this.load(true);
      return;
    }

    let dgiiProblem = '';
    let queued = false;
    if (this.requiresDgii(invoice.ncfType)) {
      try {
        const sent = await this.ecfService.sendInvoice(invoice.id);
        if (this.isProforma(invoice.ncfType) && (sent.dgii_estado !== 'Firmada' || !sent.ecf_xml_firmado)) {
          throw new Error(sent.dgii_mensaje_respuesta || 'No se recibió el XML firmado de la proforma. Se conserva la factura cobrada para revisar su firma.');
        }
        queued = ['En cola', 'Enviando DGII', 'En proceso DGII'].includes(sent.dgii_estado ?? '');
        if (queued) this.pendingPrints.set(invoice.id, invoice.seller);
        if (['Rechazado', 'Error', 'Envío por confirmar', 'Preparando envío'].includes(sent.dgii_estado ?? '')) dgiiProblem = sent.dgii_mensaje_respuesta || 'La DGII no aceptó la factura.';
      } catch (error) {
        dgiiProblem = this.message(error);
      }
    }

    if (dgiiProblem) {
      await Swal.fire({
        icon: 'warning', title: `Factura ${invoice.number} cobrada`,
        html: `${this.isProforma(invoice.ncfType) ? 'No se pudo completar la firma de la proforma' : 'No se pudo enviar a la DGII'}: <b>${this.escape(dgiiProblem)}</b><br><br>Revisa el comprobante desde Facturación → Consulta antes de imprimirlo.`
      });
    } else if (queued) {
      await Swal.fire({ icon: 'info', title: `Factura ${invoice.number} cobrada y en cola`, text: 'Se imprimirá al ser aceptada mientras esta pantalla siga abierta. También puedes consultar e imprimir desde Facturación → Consulta.' });
    } else {
      try { await this.printService.print(invoice.id, invoice.seller); }
      catch (error) { await Swal.fire({ icon: 'warning', title: 'Cobrada, pero no se pudo imprimir', text: this.message(error) }); }
      void Swal.fire({
        icon: 'success', title: `Factura ${invoice.number} cobrada`,
        text: change > 0 ? `Devuelta: RD$ ${change.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '',
        timer: change > 0 ? 6000 : 1800, showConfirmButton: change > 0
      });
    }
    this.selected = null;
    this.detail = null;
    this.isWorking = false;
    await this.load(true);
  }

  async cancel(): Promise<void> {
    const invoice = this.selected;
    if (!invoice) return;
    const options = Object.fromEntries(CANCELLATION_TYPES.map((t) => [String(t.code), `${t.code} - ${t.description}`]));
    const result = await Swal.fire({
      icon: 'warning', title: `¿Anular la factura ${invoice.number}?`, text: 'El cliente no la pagó. Los productos vuelven al inventario.',
      input: 'select', inputOptions: options, inputValue: '4', showCancelButton: true, confirmButtonText: 'Anular', cancelButtonText: 'Volver'
    });
    if (!result.isConfirmed) return;
    this.isWorking = true;
    try {
      await this.invoicesService.cancelInvoice(invoice.id, Number(result.value) || 4, 'NO PAGADA EN CAJA');
      this.selected = null;
      this.detail = null;
      await this.load(true);
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo anular', text: this.message(error) });
    } finally { this.isWorking = false; }
  }

  private isProforma(ncfType: string): boolean { return /(?:^|\D)332(?:\D|$)/.test(ncfType || ''); }
  private requiresDgii(ncfType: string): boolean { return /(?:^|\D)(332|31|32|44|45|46)(?:\D|$)/.test(ncfType || ''); }
  private escape(value: string): string { return value.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string)); }
  private message(error: unknown): string { return String((error as { message?: string })?.message ?? error ?? 'Error'); }
}
