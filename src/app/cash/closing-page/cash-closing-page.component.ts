import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CashClosingInvoice, CashClosingRecord, CashClosingsService } from '../../core/services/cash/cash-closings.service';
import { QzPrintService } from '../../core/services/printing/qz-print.service';

@Component({
  selector: 'app-cash-closing-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-closing-page.component.html',
  styleUrls: ['./cash-closing-page.component.scss']
})
export class CashClosingPageComponent implements OnInit {
  readonly viewMode = 'cash_closing';
  lastClosing = '';
  fromInvoice = '';
  toInvoice = '';
  formMessage = '';
  showConfirmation = false;
  closingNote = '';
  movements: CashClosingInvoice[] = [];
  isLoading = false;
  isSaving = false;
  errorMessage = '';

  constructor(private readonly cashClosings: CashClosingsService, private readonly printer: QzPrintService) {}

  async ngOnInit(): Promise<void> { await this.prepareClosing(); }

  get cashTotal(): number { return this.totalByPayment(1); }
  get cardsTotal(): number { return this.totalByPayment(3); }
  get depositsTotal(): number { return this.totalByPayment(2); }
  get creditTotal(): number { return this.totalByPayment(4); }
  get pendingTotal(): number { return 0; }
  get collectedTotal(): number { return this.total - this.creditTotal; }
  get uncollectedTotal(): number { return this.creditTotal + this.pendingTotal; }
  get total(): number { return this.movements.reduce((total, movement) => total + movement.value, 0); }
  get branch(): string { return this.activeUser().branch || 'Principal'; }
  get companyName(): string { return this.activeUser().companyName || 'Empresa'; }

  async prepareClosing(): Promise<void> {
    this.isLoading = true; this.errorMessage = '';
    try {
      const [lastClosing, pending] = await Promise.all([this.cashClosings.getLatestClosing(), this.cashClosings.getPendingInvoices()]);
      this.lastClosing = lastClosing?.toInvoice ?? '';
      this.movements = pending;
      this.fromInvoice = pending[0]?.invoice ?? '';
      this.toInvoice = pending[pending.length - 1]?.invoice ?? '';
    } catch (error) { this.errorMessage = this.message(error, 'No se pudieron preparar las facturas pendientes.'); }
    finally { this.isLoading = false; }
  }

  async loadPendingInvoices(): Promise<void> {
    this.isLoading = true; this.errorMessage = '';
    try { this.movements = await this.cashClosings.getPendingInvoices(this.fromInvoice, this.toInvoice); }
    catch (error) { this.errorMessage = this.message(error, 'No se pudieron consultar las facturas pendientes.'); }
    finally { this.isLoading = false; }
  }

  async confirmClosing(): Promise<void> { await this.loadPendingInvoices(); if (this.movements.length) this.showConfirmation = true; }
  cancelConfirmation(): void { this.showConfirmation = false; this.closingNote = ''; }
  async completeClosing(): Promise<void> {
    this.isSaving = true; this.errorMessage = '';
    try {
      const saved = await this.cashClosings.createClosing(this.fromInvoice, this.toInvoice, this.closingNote);
      this.showConfirmation = false; this.closingNote = '';
      try {
        const printResult = await this.printer.printHtml(this.closingTicket(saved), `Cierre ${saved.id}`);
        if (printResult !== 'unavailable') await this.cashClosings.markPrinted(saved.id);
        this.formMessage = printResult === 'qz'
          ? `Cierre #${saved.id} registrado e impreso.`
          : `Cierre #${saved.id} registrado. Se abrio la impresion del comprobante.`;
      } catch {
        this.formMessage = `Cierre #${saved.id} registrado. No se pudo iniciar la impresion del comprobante.`;
      }
      await this.prepareClosing();
    } catch (error) { this.errorMessage = this.message(error, 'No se pudo registrar el cierre.'); }
    finally { this.isSaving = false; }
  }
  exportPdf(): void { this.formMessage = 'El reporte de cierre esta listo para imprimir o guardar como PDF.'; }
  money(value: number): string { return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0); }
  private totalByPayment(code: number): number { return this.movements.filter(movement => movement.paymentCode === code).reduce((total, movement) => total + movement.value, 0); }
  private message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : (error as { message?: string })?.message ?? fallback; }
  private activeUser(): { companyName?: string; branch?: string; branchId?: number; fullName?: string } { try { return JSON.parse(localStorage.getItem('saltor.activeUser') ?? '{}'); } catch { return {}; } }
  private closingTicket(cierre: CashClosingRecord): string {
    const row = (label: string, value: string) => `<div class="row"><span>${label}</span><strong>${value}</strong></div>`;
    const note = this.escape(cierre.note || '');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Cierre de caja</title><style>@page{size:80mm auto;margin:3mm}body{font:11px Arial;color:#000}.print-document{width:74mm}.center{text-align:center}.row{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.sep{border-top:1px dashed #000;margin:7px 0}.total{font-size:14px;font-weight:700}.note{white-space:pre-wrap;overflow-wrap:anywhere}.sign{margin-top:28px;border-top:1px solid #000;text-align:center;padding-top:3px}</style></head><body><main class="print-document"><h2 class="center">${this.escape(this.companyName)}</h2><h3 class="center">CIERRE DE CAJA</h3><p class="center">${this.escape(this.branch)}</p><div class="sep"></div>${row('Cierre', String(cierre.id))}${row('Fecha', new Date(cierre.closedAt).toLocaleString('es-DO'))}${row('Cajero', this.escape(this.activeUser().fullName || ''))}${row('Factura inicial', this.escape(this.fromInvoice))}${row('Factura final', this.escape(this.toInvoice))}${row('Cant. facturas', String(cierre.invoices))}<div class="sep"></div>${row('Efectivo', this.money(cierre.cash))}${row('Tarjetas', this.money(cierre.cards))}${row('Deposito/Transf.', this.money(cierre.deposits))}${row('Cheques', this.money(cierre.checks))}${row('Credito pendiente', this.money(cierre.credit))}${row('Pendiente de pago', this.money(cierre.pending))}${row('Total cobrado', this.money(cierre.collected))}${row('Total no cobrado', this.money(cierre.uncollected))}<div class="sep"></div><div class="row total"><span>TOTAL:</span><strong>${this.money(cierre.total)}</strong></div>${note ? `<div class="sep"></div><strong>NOTA:</strong><div class="note">${note}</div>` : ''}<div class="sign">Firma del cajero</div></main></body></html>`;
  }
  private escape(value: string): string { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character)); }
}
