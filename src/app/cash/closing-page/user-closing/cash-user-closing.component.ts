import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CashUserClosingsService, DayClosing, DaySummary, PendingByUser, UserClosingInvoice, paymentCodeOf, paymentName
} from '../../../core/services/cash/cash-user-closings.service';
import { QzPrintService } from '../../../core/services/printing/qz-print.service';

interface Totals { count: number; cash: number; cards: number; deposits: number; credit: number; collected: number; total: number; }

interface SellerGroup { seller: string; closings: DayClosing[]; totals: Totals; }

/**
 * Cierre para empresas que cobran en la venta (modo "Directo"):
 *  - "Mi cierre": cada usuario cierra sus facturas, cuantas veces necesite en el día.
 *  - "Cierre general" (administrador): los cierres del día agrupados por usuario,
 *    con sus totales, el total general y lo que falta por cerrar.
 */
@Component({
  selector: 'app-cash-user-closing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-user-closing.component.html',
  styleUrls: ['./cash-user-closing.component.scss']
})
export class CashUserClosingComponent implements OnInit {
  tab: 'mine' | 'general' = 'mine';
  isAdmin = false;
  myUserId = 0;
  myName = '';

  // Mi cierre
  selectedUser: number | null = null;
  pending: UserClosingInvoice[] = [];
  todayClosings: DayClosing[] = [];
  pendingByUser: PendingByUser[] = [];
  isLoading = false;
  isSaving = false;
  showConfirmation = false;
  note = '';
  message = '';
  errorMessage = '';

  // Cierre general
  generalDate = this.today();
  general: DaySummary | null = null;
  branchFilter = '';
  expanded = new Set<number>();
  isLoadingGeneral = false;
  generalError = '';

  constructor(private readonly closings: CashUserClosingsService, private readonly printer: QzPrintService) {}

  async ngOnInit(): Promise<void> {
    await this.refreshMine();
  }

  // ---------- Mi cierre ----------
  get pendingTotals(): Totals { return this.sumInvoices(this.pending); }

  get selectedUserName(): string {
    if (this.selectedUser === null || this.selectedUser === this.myUserId) return this.myName;
    return this.pendingByUser.find((p) => p.usuarioId === this.selectedUser)?.usuario ?? (this.selectedUser === 0 ? 'Sin usuario' : '');
  }

  /** Usuarios con facturas pendientes que el administrador puede cerrar (además de él mismo). */
  get otherUsers(): PendingByUser[] {
    return this.pendingByUser.filter((p) => p.usuarioId !== this.myUserId);
  }

  get closingsForSelected(): DayClosing[] {
    const target = this.selectedUser ?? this.myUserId;
    return this.todayClosings.filter((c) => c.tipo === 'Usuario' && (target === 0 ? c.vendedorId === null : c.vendedorId === target));
  }

  async refreshMine(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [summary, pending] = await Promise.all([this.closings.getDaySummary(this.today()), this.closings.getPending(this.selectedUser)]);
      this.isAdmin = summary.esAdmin;
      this.myUserId = summary.usuarioId;
      this.myName = summary.usuario;
      this.todayClosings = summary.cierres;
      this.pendingByUser = summary.pendientes;
      this.pending = pending;
    } catch (error) {
      this.errorMessage = this.errorText(error, 'No se pudieron consultar las facturas pendientes.');
    } finally {
      this.isLoading = false;
    }
  }

  async changeUser(): Promise<void> {
    this.message = '';
    await this.refreshMine();
  }

  async openConfirmation(): Promise<void> {
    await this.refreshMine();
    if (this.pending.length) this.showConfirmation = true;
    else this.errorMessage = 'No hay facturas pendientes de cierre.';
  }

  cancelConfirmation(): void {
    this.showConfirmation = false;
    this.note = '';
  }

  async completeClosing(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMessage = '';
    try {
      const target = this.selectedUser === this.myUserId ? null : this.selectedUser;
      const saved = await this.closings.close(this.pending.map((p) => p.id), this.note, target);
      const totals = this.pendingTotals;
      const invoices = [...this.pending];
      this.showConfirmation = false;
      const noteText = this.note;
      this.note = '';
      try {
        const html = this.closingTicket({
          id: saved.id, closedAt: saved.closedAt, seller: saved.seller, closedBy: saved.closedBy, from: saved.fromInvoice, to: saved.toInvoice,
          count: saved.invoices, cash: saved.cash, cards: saved.cards, deposits: saved.deposits, credit: saved.credit,
          collected: saved.collected, total: saved.total, note: noteText,
          invoices: invoices.map((i) => ({ number: i.invoice, payment: i.payment, value: i.value }))
        });
        const result = await this.printer.printHtml(html, `Cierre ${saved.id}`);
        if (result !== 'unavailable') await this.closings.markPrinted(saved.id);
        this.message = `Cierre #${saved.id} de ${saved.seller} registrado (${saved.invoices} facturas, RD$${this.money(totals.total)}).`;
      } catch {
        this.message = `Cierre #${saved.id} registrado. No se pudo iniciar la impresión.`;
      }
      await this.refreshMine();
    } catch (error) {
      this.errorMessage = this.errorText(error, 'No se pudo registrar el cierre.');
    } finally {
      this.isSaving = false;
    }
  }

  async reprint(closing: DayClosing): Promise<void> {
    const html = this.closingTicket({
      id: closing.id, closedAt: closing.cerradoEn, seller: closing.vendedor, closedBy: closing.cajero || '', from: closing.desde, to: closing.hasta,
      count: closing.cantidad, cash: closing.efectivo, cards: closing.tarjetas, deposits: closing.depositos, credit: closing.credito,
      collected: closing.cobrados, total: closing.total, note: closing.nota || '', reprint: true,
      invoices: closing.facturas.map((f) => ({ number: f.numero, payment: paymentName(paymentCodeOf(f.formaPago, f.condicion)), value: f.total }))
    });
    try { await this.printer.printHtml(html, `Cierre ${closing.id}`); }
    catch (error) { this.errorMessage = this.errorText(error, 'No se pudo imprimir.'); }
  }

  // ---------- Cierre general ----------
  showGeneral(): void {
    this.tab = 'general';
    void this.loadGeneral();
  }

  async loadGeneral(): Promise<void> {
    this.isLoadingGeneral = true;
    this.generalError = '';
    try {
      this.general = await this.closings.getDaySummary(this.generalDate || this.today());
      this.expanded.clear();
    } catch (error) {
      this.generalError = this.errorText(error, 'No se pudo consultar el cierre general.');
    } finally {
      this.isLoadingGeneral = false;
    }
  }

  get branches(): string[] {
    return [...new Set((this.general?.cierres ?? []).map((c) => c.sucursal || 'Principal'))].sort();
  }

  get generalClosings(): DayClosing[] {
    return (this.general?.cierres ?? []).filter((c) => !this.branchFilter || (c.sucursal || 'Principal') === this.branchFilter);
  }

  get groups(): SellerGroup[] {
    const map = new Map<string, DayClosing[]>();
    for (const closing of this.generalClosings) {
      const key = closing.vendedor || 'Sin usuario';
      map.set(key, [...(map.get(key) ?? []), closing]);
    }
    return [...map.entries()].map(([seller, closings]) => ({ seller, closings, totals: this.sumClosings(closings) }));
  }

  get generalTotals(): Totals { return this.sumClosings(this.generalClosings); }

  get pendingGeneralTotal(): number {
    return (this.general?.pendientes ?? []).reduce((sum, p) => sum + p.total, 0);
  }

  toggle(id: number): void {
    if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
  }

  /** El administrador pasa a "Mi cierre" con ese usuario seleccionado para cerrarle lo pendiente. */
  async closeFor(user: PendingByUser): Promise<void> {
    this.tab = 'mine';
    this.selectedUser = user.usuarioId === this.myUserId ? null : user.usuarioId;
    await this.refreshMine();
  }

  async printGeneral(): Promise<void> {
    const t = this.generalTotals;
    const row = (label: string, value: string) => `<div class="row"><span>${label}</span><strong>${value}</strong></div>`;
    const groups = this.groups.map((g) => `<div class="group"><b>${this.escape(g.seller)}</b>`
      + g.closings.map((c) => `<div class="row small"><span>#${c.id} · ${this.time(c.cerradoEn)} · ${c.cantidad} fact.</span><strong>${this.money(c.total)}</strong></div>`).join('')
      + row('Efectivo', this.money(g.totals.cash)) + row('Tarjetas', this.money(g.totals.cards)) + row('Depósito/Transf.', this.money(g.totals.deposits))
      + row('Crédito', this.money(g.totals.credit)) + `<div class="row sub"><span>Total ${this.escape(g.seller)}</span><strong>${this.money(g.totals.total)}</strong></div></div>`).join('');
    const pendings = (this.general?.pendientes ?? []).map((p) => row(`${this.escape(p.usuario)} (${p.cantidad})`, this.money(p.total))).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cierre general</title><style>@page{size:80mm auto;margin:3mm}body{font:11px Arial;color:#000}.doc{width:74mm}.center{text-align:center}.row{display:flex;justify-content:space-between;gap:8px;padding:1px 0}.small{font-size:10px}.sep{border-top:1px dashed #000;margin:6px 0}.group{border-bottom:1px dashed #000;padding:5px 0}.sub{font-weight:700;border-top:1px solid #000;margin-top:2px}.total{font-size:14px;font-weight:700}</style></head><body><main class="doc">`
      + `<h2 class="center">${this.escape(this.companyName)}</h2><h3 class="center">CIERRE GENERAL DEL DÍA</h3><p class="center">${this.formatDate(this.generalDate)}${this.branchFilter ? ' · ' + this.escape(this.branchFilter) : ''}</p>`
      + `<div class="sep"></div>${groups || '<p class="center">Sin cierres en el día.</p>'}<div class="sep"></div>`
      + row('Cierres realizados', String(this.generalClosings.length)) + row('Facturas', String(t.count))
      + row('Efectivo', this.money(t.cash)) + row('Tarjetas', this.money(t.cards)) + row('Depósito/Transf.', this.money(t.deposits))
      + row('Crédito', this.money(t.credit)) + row('Total cobrado', this.money(t.collected))
      + `<div class="sep"></div><div class="row total"><span>TOTAL GENERAL:</span><strong>${this.money(t.total)}</strong></div>`
      + (pendings ? `<div class="sep"></div><b>Pendiente por cerrar</b>${pendings}` : '')
      + `<p class="center small">Impreso: ${new Date().toLocaleString('es-DO')}</p></main></body></html>`;
    try { await this.printer.printHtml(html, 'Cierre general'); }
    catch (error) { this.generalError = this.errorText(error, 'No se pudo imprimir.'); }
  }

  // ---------- utilidades ----------
  money(value: number): string {
    return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
  }

  time(value: string): string {
    return value ? new Date(value).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '';
  }

  formatDate(value: string): string {
    return value ? new Intl.DateTimeFormat('es-DO').format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '';
  }

  paymentLabel(code: number | null, condition: string | null): string {
    return paymentName(paymentCodeOf(code, condition));
  }

  get companyName(): string { return this.activeUser().companyName || 'Empresa'; }
  get branch(): string { return this.activeUser().branch || 'Principal'; }

  private sumInvoices(list: UserClosingInvoice[]): Totals {
    const by = (code: number) => list.filter((i) => i.paymentCode === code).reduce((s, i) => s + i.value, 0);
    const total = list.reduce((s, i) => s + i.value, 0);
    const credit = by(4);
    return { count: list.length, cash: by(1), cards: by(3), deposits: by(2), credit, collected: total - credit, total };
  }

  private sumClosings(list: DayClosing[]): Totals {
    const sum = (pick: (c: DayClosing) => number) => list.reduce((s, c) => s + pick(c), 0);
    return {
      count: sum((c) => c.cantidad), cash: sum((c) => c.efectivo), cards: sum((c) => c.tarjetas), deposits: sum((c) => c.depositos),
      credit: sum((c) => c.credito), collected: sum((c) => c.cobrados), total: sum((c) => c.total)
    };
  }

  private closingTicket(c: {
    id: number; closedAt: string; seller: string; closedBy: string; from: string; to: string; count: number; cash: number; cards: number;
    deposits: number; credit: number; collected: number; total: number; note: string; reprint?: boolean;
    invoices: { number: string; payment: string; value: number }[];
  }): string {
    const row = (label: string, value: string) => `<div class="row"><span>${label}</span><strong>${value}</strong></div>`;
    const lines = c.invoices.map((i) => `<div class="row small"><span>${this.escape(i.number)} · ${this.escape(i.payment)}</span><span>${this.money(i.value)}</span></div>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Cierre</title><style>@page{size:80mm auto;margin:3mm}body{font:11px Arial;color:#000}.doc{width:74mm}.center{text-align:center}.row{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.small{font-size:10px;padding:1px 0}.sep{border-top:1px dashed #000;margin:7px 0}.total{font-size:14px;font-weight:700}.note{white-space:pre-wrap;overflow-wrap:anywhere}.sign{margin-top:28px;border-top:1px solid #000;text-align:center;padding-top:3px}</style></head><body><main class="doc">`
      + `<h2 class="center">${this.escape(this.companyName)}</h2><h3 class="center">CIERRE DE USUARIO${c.reprint ? ' (REIMPRESIÓN)' : ''}</h3><p class="center">${this.escape(this.branch)}</p><div class="sep"></div>`
      + row('Cierre', String(c.id)) + row('Fecha', new Date(c.closedAt).toLocaleString('es-DO')) + row('Usuario', this.escape(c.seller))
      + (c.closedBy && c.closedBy !== c.seller ? row('Cerrado por', this.escape(c.closedBy)) : '')
      + row('Factura inicial', this.escape(c.from)) + row('Factura final', this.escape(c.to)) + row('Cant. facturas', String(c.count))
      + `<div class="sep"></div>${lines}<div class="sep"></div>`
      + row('Efectivo', this.money(c.cash)) + row('Tarjetas', this.money(c.cards)) + row('Depósito/Transf.', this.money(c.deposits))
      + row('Crédito', this.money(c.credit)) + row('Total cobrado', this.money(c.collected))
      + `<div class="sep"></div><div class="row total"><span>TOTAL:</span><strong>${this.money(c.total)}</strong></div>`
      + (c.note ? `<div class="sep"></div><strong>NOTA:</strong><div class="note">${this.escape(c.note)}</div>` : '')
      + `<div class="sign">Firma del usuario</div></main></body></html>`;
  }

  private today(): string {
    // El día de los cierres se cuenta en hora de República Dominicana (igual que en la base de datos).
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  private errorText(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : (error as { message?: string })?.message ?? fallback;
  }

  private activeUser(): { companyName?: string; branch?: string } {
    try { return JSON.parse(localStorage.getItem('saltor.activeUser') ?? '{}'); } catch { return {}; }
  }

  private escape(value: string): string {
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch] ?? ch));
  }
}
