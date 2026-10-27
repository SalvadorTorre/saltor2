import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import { PaymentMethod, PaymentMethodsService } from '../../core/services/payment-methods/payment-methods.service';
import {
  Receipt, ReceivableClient, ReceivableInvoice, ReceivablesService
} from '../../core/services/receivables/receivables.service';
import { SupabaseService } from '../../core/services/supabase/supabase.service';

type Tab = 'clientes' | 'facturas' | 'recibos';

interface AgingBucket { key: string; label: string; amount: number; count: number; tone: string; }

interface ClientSummary {
  clientId: number | null;
  name: string;
  document: string;
  invoices: number;
  balance: number;
  overdue: number;
  maxDaysOverdue: number;
  creditLimit: number;
  overLimit: boolean;
}

interface PaymentRow { invoice: ReceivableInvoice; selected: boolean; amount: number; }

interface StatementLine { date: string; type: string; document: string; detail: string; charge: number; credit: number; balance: number; }

interface CompanyInfo { name: string; rnc: string; address: string; phone: string; }

const CREDIT_PAYMENT_CODE = 4;

@Component({
  selector: 'app-receivables-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './receivables-page.component.html',
  styleUrls: ['./receivables-page.component.scss']
})
export class ReceivablesPageComponent implements OnInit {
  tab: Tab = 'clientes';
  invoices: ReceivableInvoice[] = [];
  clients: ReceivableClient[] = [];
  receipts: Receipt[] = [];
  paymentMethods: PaymentMethod[] = [];
  company: CompanyInfo = { name: '', rnc: '', address: '', phone: '' };

  isLoading = false;
  errorMessage = '';
  search = '';
  onlyOverdue = false;
  receiptSearch = '';

  // Registrar cobro
  isPaymentOpen = false;
  isSaving = false;
  paymentError = '';
  paymentClientId: number | null = null;
  paymentDate = this.today();
  paymentCode = 1;
  paymentReference = '';
  paymentNotes = '';
  amountReceived: number | null = null;
  paymentRows: PaymentRow[] = [];

  constructor(
    private readonly receivables: ReceivablesService,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly supabase: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
    void this.loadCompany();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [invoices, clients, receipts, methods] = await Promise.all([
        this.receivables.getInvoices(),
        this.receivables.getClients(),
        this.receivables.getReceipts(),
        this.paymentMethods.length ? Promise.resolve(this.paymentMethods) : this.paymentMethodsService.getPaymentMethods()
      ]);
      this.invoices = invoices;
      this.clients = clients;
      this.receipts = receipts;
      this.paymentMethods = methods;
    } catch (error) {
      this.errorMessage = this.messageFrom(error, 'No se pudieron cargar las cuentas por cobrar.');
    } finally {
      this.isLoading = false;
    }
  }

  // -------------------------------------------------------------------------
  // Resumen
  // -------------------------------------------------------------------------
  get totalReceivable(): number { return this.sum(this.invoices.map((i) => i.balance)); }
  get totalOverdue(): number { return this.sum(this.invoices.filter((i) => i.daysOverdue > 0).map((i) => i.balance)); }
  get clientsWithBalance(): number { return new Set(this.invoices.map((i) => i.clientId ?? `n:${i.clientName}`)).size; }
  get collectedThisMonth(): number {
    const month = this.today().slice(0, 7);
    return this.sum(this.receipts.filter((r) => r.status === 'Activo' && r.date?.startsWith(month)).map((r) => r.total));
  }

  get aging(): AgingBucket[] {
    const buckets: AgingBucket[] = [
      { key: 'current', label: 'Por vencer', amount: 0, count: 0, tone: 'ok' },
      { key: '1-30', label: '1 a 30 días', amount: 0, count: 0, tone: 'low' },
      { key: '31-60', label: '31 a 60 días', amount: 0, count: 0, tone: 'mid' },
      { key: '61-90', label: '61 a 90 días', amount: 0, count: 0, tone: 'high' },
      { key: '90+', label: 'Más de 90 días', amount: 0, count: 0, tone: 'critical' }
    ];
    for (const invoice of this.invoices) {
      const d = invoice.daysOverdue;
      const bucket = d <= 0 ? buckets[0] : d <= 30 ? buckets[1] : d <= 60 ? buckets[2] : d <= 90 ? buckets[3] : buckets[4];
      bucket.amount += invoice.balance;
      bucket.count += 1;
    }
    return buckets;
  }

  agingShare(bucket: AgingBucket): number {
    return this.totalReceivable > 0 ? Math.max(bucket.amount / this.totalReceivable * 100, bucket.amount > 0 ? 2 : 0) : 0;
  }

  get clientSummaries(): ClientSummary[] {
    const map = new Map<string, ClientSummary>();
    for (const invoice of this.invoices) {
      const key = invoice.clientId != null ? `c${invoice.clientId}` : `n${invoice.clientName}`;
      const client = invoice.clientId != null ? this.clients.find((c) => c.id === invoice.clientId) : undefined;
      const row = map.get(key) ?? {
        clientId: invoice.clientId, name: invoice.clientName, document: invoice.clientDocument,
        invoices: 0, balance: 0, overdue: 0, maxDaysOverdue: 0, creditLimit: client?.creditLimit ?? 0, overLimit: false
      };
      row.invoices += 1;
      row.balance += invoice.balance;
      if (invoice.daysOverdue > 0) row.overdue += invoice.balance;
      row.maxDaysOverdue = Math.max(row.maxDaysOverdue, invoice.daysOverdue);
      row.overLimit = row.creditLimit > 0 && row.balance > row.creditLimit;
      map.set(key, row);
    }
    const term = this.search.trim().toLowerCase();
    return [...map.values()]
      .filter((r) => !term || `${r.name} ${r.document}`.toLowerCase().includes(term))
      .filter((r) => !this.onlyOverdue || r.overdue > 0)
      .sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);
  }

  get filteredInvoices(): ReceivableInvoice[] {
    const term = this.search.trim().toLowerCase();
    return this.invoices
      .filter((i) => !term || `${i.invoiceNumber} ${i.ncf} ${i.clientName} ${i.clientDocument}`.toLowerCase().includes(term))
      .filter((i) => !this.onlyOverdue || i.daysOverdue > 0);
  }

  get filteredReceipts(): Receipt[] {
    const term = this.receiptSearch.trim().toLowerCase();
    return this.receipts.filter((r) => !term
      || `${r.number} ${r.clientName} ${r.reference} ${r.applications.map((a) => a.invoiceNumber).join(' ')}`.toLowerCase().includes(term));
  }

  get isAdmin(): boolean {
    try { return JSON.parse(localStorage.getItem('saltor.activeUser') ?? '{}').role === 'Administrador'; } catch { return false; }
  }

  // -------------------------------------------------------------------------
  // Registrar cobro
  // -------------------------------------------------------------------------
  get collectionMethods(): PaymentMethod[] { return this.paymentMethods.filter((m) => m.code !== CREDIT_PAYMENT_CODE); }

  get payableClients(): { id: number; name: string; balance: number }[] {
    const map = new Map<number, { id: number; name: string; balance: number }>();
    for (const i of this.invoices) {
      if (i.clientId == null) continue;
      const row = map.get(i.clientId) ?? { id: i.clientId, name: i.clientName, balance: 0 };
      row.balance += i.balance;
      map.set(i.clientId, row);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  openPayment(clientId: number | null = null): void {
    this.isPaymentOpen = true;
    this.paymentError = '';
    this.paymentDate = this.today();
    this.paymentCode = this.collectionMethods[0]?.code ?? 1;
    this.paymentReference = '';
    this.paymentNotes = '';
    this.amountReceived = null;
    this.paymentClientId = clientId;
    this.onPaymentClientChange();
  }

  closePayment(): void { this.isPaymentOpen = false; }

  onPaymentClientChange(): void {
    this.paymentRows = this.invoices
      .filter((i) => i.clientId != null && i.clientId === this.paymentClientId)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.invoiceNumber.localeCompare(b.invoiceNumber))
      .map((invoice) => ({ invoice, selected: false, amount: 0 }));
    if (this.amountReceived) this.distribute();
  }

  /** Reparte el monto recibido empezando por la factura más vieja. */
  distribute(): void {
    let remaining = this.round(Number(this.amountReceived) || 0);
    for (const row of this.paymentRows) {
      const amount = Math.min(remaining, row.invoice.balance);
      row.amount = this.round(Math.max(amount, 0));
      row.selected = row.amount > 0;
      remaining = this.round(remaining - row.amount);
    }
  }

  toggleRow(row: PaymentRow): void {
    row.amount = row.selected ? row.invoice.balance : 0;
    this.amountReceived = this.paymentTotal;
  }

  onRowAmountChange(row: PaymentRow): void {
    const amount = this.round(Math.min(Math.max(Number(row.amount) || 0, 0), row.invoice.balance));
    row.amount = amount;
    row.selected = amount > 0;
    this.amountReceived = this.paymentTotal;
  }

  get paymentTotal(): number { return this.round(this.sum(this.paymentRows.map((r) => (r.selected ? Number(r.amount) || 0 : 0)))); }
  get paymentClientBalance(): number { return this.sum(this.paymentRows.map((r) => r.invoice.balance)); }
  get unappliedAmount(): number { return this.round((Number(this.amountReceived) || 0) - this.paymentTotal); }

  async savePayment(): Promise<void> {
    this.paymentError = '';
    const applications = this.paymentRows
      .filter((r) => r.selected && Number(r.amount) > 0)
      .map((r) => ({ invoiceId: r.invoice.id, amount: this.round(Number(r.amount)) }));
    if (!this.paymentClientId) { this.paymentError = 'Seleccione el cliente.'; return; }
    if (!applications.length) { this.paymentError = 'Indique el monto a aplicar en al menos una factura.'; return; }
    if (this.unappliedAmount > 0.009) {
      this.paymentError = `Quedan ${this.money(this.unappliedAmount)} sin aplicar. El monto recibido no puede ser mayor que lo aplicado a facturas.`;
      return;
    }

    this.isSaving = true;
    try {
      const created = await this.receivables.createReceipt({
        customerId: this.paymentClientId,
        date: this.paymentDate,
        paymentCode: Number(this.paymentCode),
        reference: this.paymentReference,
        notes: this.paymentNotes,
        applications
      });
      this.isPaymentOpen = false;
      await this.load();
      const receipt = this.receipts.find((r) => r.id === created.id);
      const result = await Swal.fire({
        icon: 'success', title: `Recibo ${created.number} registrado`,
        text: `Cobro de ${this.money(applications.reduce((t, a) => t + a.amount, 0))} aplicado.`,
        showCancelButton: true, confirmButtonText: 'Imprimir recibo', cancelButtonText: 'Cerrar', confirmButtonColor: '#0f4c81'
      });
      if (result.isConfirmed && receipt) this.printReceipt(receipt);
    } catch (error) {
      this.paymentError = this.messageFrom(error, 'No se pudo registrar el cobro.');
    } finally {
      this.isSaving = false;
    }
  }

  // -------------------------------------------------------------------------
  // Anular recibo
  // -------------------------------------------------------------------------
  async voidReceipt(receipt: Receipt): Promise<void> {
    const result = await Swal.fire({
      icon: 'warning', title: `Anular recibo ${receipt.number}`,
      text: `El saldo de ${this.money(receipt.total)} volverá a las facturas de ${receipt.clientName}.`,
      input: 'text', inputLabel: 'Motivo de la anulación', inputPlaceholder: 'Ej.: cheque devuelto',
      showCancelButton: true, confirmButtonText: 'Anular recibo', cancelButtonText: 'Cancelar', confirmButtonColor: '#b42318',
      inputValidator: (value) => (value?.trim() ? undefined : 'Indique el motivo.')
    });
    if (!result.isConfirmed) return;
    try {
      await this.receivables.voidReceipt(receipt.id, String(result.value ?? ''));
      await this.load();
    } catch (error) {
      void Swal.fire({ icon: 'error', title: 'No se pudo anular', text: this.messageFrom(error, 'Intente de nuevo.') });
    }
  }

  // -------------------------------------------------------------------------
  // Impresiones
  // -------------------------------------------------------------------------
  printReceipt(receipt: Receipt): void {
    const method = this.methodName(receipt.paymentCode);
    const rows = receipt.applications.map((a) => `<tr><td>${this.esc(a.invoiceNumber)}</td><td class="n">${this.printMoney(a.amount)}</td></tr>`).join('');
    const body = `
      ${this.printHeader('RECIBO DE COBRO', receipt.number)}
      ${receipt.status === 'Anulado' ? '<p class="void">ANULADO</p>' : ''}
      <table class="meta">
        <tr><th>Fecha</th><td>${this.date(receipt.date)}</td><th>Forma de pago</th><td>${this.esc(method)}</td></tr>
        <tr><th>Cliente</th><td colspan="3">${this.esc(receipt.clientName)}</td></tr>
        ${receipt.reference ? `<tr><th>Referencia</th><td colspan="3">${this.esc(receipt.reference)}</td></tr>` : ''}
      </table>
      <table class="lines"><thead><tr><th>Factura</th><th class="n">Monto aplicado</th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><th>Total recibido</th><th class="n">${this.printMoney(receipt.total)}</th></tr></tfoot></table>
      ${receipt.notes ? `<p class="notes">${this.esc(receipt.notes)}</p>` : ''}
      <div class="signs"><span>Recibido por: ${this.esc(receipt.userName)}</span><span>Firma del cliente</span></div>`;
    this.openPrint(`Recibo ${receipt.number}`, body);
  }

  async printStatement(clientId: number | null, clientName: string): Promise<void> {
    if (clientId == null) {
      void Swal.fire({ icon: 'info', title: 'Cliente sin ficha', text: 'Las facturas sin cliente registrado no tienen estado de cuenta.' });
      return;
    }
    try {
      const [invoices, receipts] = await Promise.all([
        this.receivables.getInvoices({ clientId, includePaid: true }),
        this.receivables.getReceipts({ clientId, limit: 1000 })
      ]);
      const creditNotes = await this.receivables.getCreditNotes(invoices.filter((i) => i.id > 0).map((i) => i.id));
      const client = this.clients.find((c) => c.id === clientId);

      const movements: Omit<StatementLine, 'balance'>[] = [
        ...invoices.map((i) => ({ date: i.date, type: i.documentType === 'Saldo anterior' ? 'Saldo anterior' : 'Factura', document: i.invoiceNumber, detail: i.documentType === 'Saldo anterior' ? 'Deuda traída del sistema anterior' : `Vence ${this.date(i.dueDate)}${i.ncf ? ' · NCF ' + i.ncf : ''}`, charge: i.total, credit: 0 })),
        ...receipts.filter((r) => r.status === 'Activo').map((r) => ({ date: r.date, type: 'Recibo', document: r.number, detail: `${this.methodName(r.paymentCode)} · ${r.applications.map((a) => a.invoiceNumber).join(', ')}`, charge: 0, credit: r.total })),
        ...creditNotes.map((n) => ({ date: n.date, type: 'Nota de crédito', document: n.number, detail: `Factura ${invoices.find((i) => i.id === n.invoiceId)?.invoiceNumber ?? ''}`, charge: 0, credit: n.total }))
      ].sort((a, b) => a.date.localeCompare(b.date) || (a.charge ? -1 : 1));

      let balance = 0;
      const lines: StatementLine[] = movements.map((m) => { balance = this.round(balance + m.charge - m.credit); return { ...m, balance }; });
      const open = invoices.filter((i) => i.balance > 0);
      const buckets = [
        ['Por vencer', open.filter((i) => i.daysOverdue <= 0)],
        ['1-30 días', open.filter((i) => i.daysOverdue > 0 && i.daysOverdue <= 30)],
        ['31-60 días', open.filter((i) => i.daysOverdue > 30 && i.daysOverdue <= 60)],
        ['61-90 días', open.filter((i) => i.daysOverdue > 60 && i.daysOverdue <= 90)],
        ['Más de 90', open.filter((i) => i.daysOverdue > 90)]
      ] as const;

      const body = `
        ${this.printHeader('ESTADO DE CUENTA', `Al ${this.date(this.today())}`)}
        <table class="meta">
          <tr><th>Cliente</th><td>${this.esc(client?.name ?? clientName)}</td><th>Documento</th><td>${this.esc(client?.document ?? '')}</td></tr>
          <tr><th>Teléfono</th><td>${this.esc(client?.phone ?? '')}</td><th>Límite de crédito</th><td>${client?.creditLimit ? this.printMoney(client.creditLimit) : 'Sin límite'}</td></tr>
          <tr><th>Días de crédito</th><td>${client?.creditDays ?? 30}</td><th>Saldo actual</th><td><b>${this.printMoney(this.sum(open.map((i) => i.balance)))}</b></td></tr>
        </table>
        <table class="lines"><thead><tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Detalle</th><th class="n">Cargo</th><th class="n">Abono</th><th class="n">Saldo</th></tr></thead>
          <tbody>${lines.map((l) => `<tr><td>${this.date(l.date)}</td><td>${l.type}</td><td>${this.esc(l.document)}</td><td>${this.esc(l.detail)}</td><td class="n">${l.charge ? this.printMoney(l.charge) : ''}</td><td class="n">${l.credit ? this.printMoney(l.credit) : ''}</td><td class="n">${this.printMoney(l.balance)}</td></tr>`).join('') || '<tr><td colspan="7">Sin movimientos a crédito.</td></tr>'}</tbody></table>
        <h3>Antigüedad del saldo</h3>
        <table class="lines aging"><thead><tr>${buckets.map(([label]) => `<th class="n">${label}</th>`).join('')}<th class="n">Total</th></tr></thead>
          <tbody><tr>${buckets.map(([, list]) => `<td class="n">${this.printMoney(this.sum(list.map((i) => i.balance)))}</td>`).join('')}<td class="n"><b>${this.printMoney(this.sum(open.map((i) => i.balance)))}</b></td></tr></tbody></table>`;
      this.openPrint(`Estado de cuenta ${client?.name ?? clientName}`, body);
    } catch (error) {
      void Swal.fire({ icon: 'error', title: 'No se pudo generar el estado de cuenta', text: this.messageFrom(error, 'Intente de nuevo.') });
    }
  }

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------
  methodName(code: number): string { return this.paymentMethods.find((m) => m.code === code)?.description ?? `Forma ${code}`; }
  money(value: number): string { return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value || 0); }
  private printMoney(value: number): string { return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0); }
  date(value: string): string { if (!value) return ''; const [y, m, d] = value.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
  overdueLabel(days: number): string { return days <= 0 ? 'Al día' : `${days} día${days === 1 ? '' : 's'}`; }

  private async loadCompany(): Promise<void> {
    try {
      const companyId = JSON.parse(localStorage.getItem('saltor.activeUser') ?? '{}').companyId;
      const { data } = await this.supabase.client.from('empresas').select('nombre_comercial, razon_social, rnc, direccion, telefono').eq('id', companyId).maybeSingle();
      if (data) this.company = { name: data.razon_social || data.nombre_comercial || '', rnc: data.rnc ?? '', address: data.direccion ?? '', phone: data.telefono ?? '' };
    } catch { /* la impresión usa lo que haya */ }
  }

  private printHeader(title: string, subtitle: string): string {
    return `<header><div><h1>${this.esc(this.company.name || 'Empresa')}</h1>
      <p>${this.company.rnc ? 'RNC ' + this.esc(this.company.rnc) : ''}${this.company.address ? ' · ' + this.esc(this.company.address) : ''}${this.company.phone ? ' · ' + this.esc(this.company.phone) : ''}</p></div>
      <div class="doc"><strong>${title}</strong><span>${this.esc(subtitle)}</span></div></header>`;
  }

  private openPrint(title: string, body: string): void {
    const win = window.open('', '_blank', 'width=900,height=900');
    if (!win) { void Swal.fire({ icon: 'warning', title: 'Ventana bloqueada', text: 'Permita las ventanas emergentes para imprimir.' }); return; }
    win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${this.esc(title)}</title><style>
      body{font:13px Arial,sans-serif;color:#111;margin:28px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #0f4c81;padding-bottom:10px;margin-bottom:16px}
      h1{font-size:18px;margin:0 0 4px}header p{margin:0;color:#555}.doc{text-align:right}.doc strong{display:block;font-size:16px;color:#0f4c81}.doc span{color:#555}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}.meta th{text-align:left;width:16%;color:#555;font-weight:600;padding:4px 6px}.meta td{padding:4px 6px}
      .lines th,.lines td{border-bottom:1px solid #ddd;padding:6px;text-align:left}.lines thead th{background:#eef4fb}.lines tfoot th{font-size:14px}.n{text-align:right!important}
      h3{font-size:14px;margin:18px 0 6px}.notes{color:#444}.void{color:#b42318;font-size:22px;font-weight:800;text-align:center;border:2px solid #b42318;padding:6px}
      .signs{display:flex;justify-content:space-between;margin-top:60px}.signs span{border-top:1px solid #333;padding-top:6px;width:40%;text-align:center}
      @media print{body{margin:12mm}}</style></head><body>${body}<script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  }

  private today(): string {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  private sum(values: number[]): number { return this.round(values.reduce((t, v) => t + (Number(v) || 0), 0)); }
  private round(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
  private esc(value: string): string { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)); }
  private messageFrom(error: unknown, fallback: string): string {
    const message = (error as { message?: string })?.message;
    return message && message.trim() ? message : fallback;
  }
}
