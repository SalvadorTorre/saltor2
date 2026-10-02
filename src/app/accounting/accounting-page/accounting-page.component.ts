import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { BranchRecord, BranchesService } from '../../core/services/branches/branches.service';
import { PendingInvoice, Rep607Invoice, Rep607Service } from '../../core/services/accounting/rep607.service';
import { EcfService } from '../../core/services/ecf/ecf.service';
import { NcfType, SupplierFormModel, SupplierRecord } from '../../app.models';
import { NcfTypesService } from '../../core/services/ncf-types/ncf-types.service';
import { CreditNoteDetail, CreditNoteRecord, CreditNotesService } from '../../core/services/credit-notes/credit-notes.service';
import { MinorExpenseRecord, MinorExpensesService, MinorExpenseSaveData, MinorExpenseStatus } from '../../core/services/minor-expenses/minor-expenses.service';
import { SuppliersService } from '../../core/services/suppliers/suppliers.service';
import { Purchase606Record, Purchases606Service } from '../../core/services/accounting/purchases-606.service';
import { E41Record, E41SaveData, E41Service, E41Status, IsrRate } from '../../core/services/accounting/e41.service';
import { RncService } from '../../core/services/rnc/rnc.service';
import { QzPrintService } from '../../core/services/printing/qz-print.service';

type FiscalView = 'pending' | 'rep607' | 'encf' | 'credit' | 'expenses' | 'receivables' | 'rep606' | 'e41';
type DgiiSendDialog = { phase: 'confirm' | 'processing' | 'success' | 'error'; invoiceNumber: string; message: string };
type DgiiSendTarget = { source: 'pending' | 'rep607'; invoice: PendingInvoice | Rep607Invoice };
const MINOR_CATEGORIES = ['Oficina y suministros', 'Combustible', 'Viáticos', 'Hospedaje', 'Alimentación', 'Mantenimiento', 'Transporte', 'Comunicaciones', 'Servicios profesionales', 'Publicidad', 'Impuestos y tasas', 'Otros gastos'];
const MINOR_CENTERS = ['Administración', 'Ventas', 'Operaciones', 'Logística', 'Mercadeo', 'General'];
const MINOR_PAYMENTS = ['Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Transferencia', 'Cheque', 'Otro'];
const MINOR_QUICK_CATEGORIES = ['Alimentos y bebidas', 'Peajes y parqueos', 'Combustible', 'Oficina y suministros', 'Transporte', 'Viáticos', 'Hospedaje', 'Servicios profesionales', 'Comunicaciones', 'Impuestos y tasas', 'Otros gastos'];
const currentMonthRange = (): { from: string; to: string } => {
  const today = new Date();
  const format = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { from: format(new Date(today.getFullYear(), today.getMonth(), 1)), to: format(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
};

@Component({ selector: 'app-accounting-page', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './accounting-page.component.html', styleUrls: ['./accounting-page.component.scss'] })
export class AccountingPageComponent implements OnInit {
  active: FiscalView = 'rep607';
  message = 'Selecciona los filtros y pulsa Filtrar para consultar.';
  filters = { branchId: 'Todas', type: 'Todos', status: 'Todos', invoice: '', encf: '', ...currentMonthRange() };
  rep607Invoices: Rep607Invoice[] = [];
  branches: BranchRecord[] = [];
  ncfFilterTypes: NcfType[] = [];
  loggedCompanyName = '';
  isLoadingRep607 = false;
  rep607Error = '';
  pendingFilters = { branchId: 'Todas', invoice: '', from: '', to: '' };
  pendingInvoices: PendingInvoice[] = [];
  isLoadingPending = false;
  pendingError = '';
  isProcessingPending = false;
  pendingActionMessage = '';
  dgiiSendDialog: DgiiSendDialog | null = null;
  private dgiiSendTarget: DgiiSendTarget | null = null;
  selectedDgiiInvoice: Rep607Invoice | null = null;
  isResending = false;
  actionMessage = '';
  private companyId: number | null = null;
  private initialized = false;
  encf = { type: '32 - Factura de Consumo', series: 'E32', from: 1, to: 1000, expiry: '' };
  creditTab: 'create' | 'consult' = 'create';
  creditSearch = '';
  creditNotes: CreditNoteRecord[] = [];
  isSavingCreditNote = false;
  isSendingCreditNote = false;
  creditNotesError = '';
  creditMode: 'create' | 'view' | 'edit' = 'create';
  editingCreditNoteId: number | null = null;
  selectedCreditDgii: CreditNoteDetail | null = null;
  lastSavedCreditNoteId: number | null = null;
  creditDgii = { status: 'Sin enviar', trackId: '-', securityCode: '-' };
  credit = {
    invoiceId: null as number | null, invoice: '', encf: '', affectedDate: '', rnc: '', customer: '', email: '', address: '',
    noteNumber: '', noteEncf: '', date: new Date().toISOString().slice(0, 10), expiry: '',
    modificationCode: '3 - Corrige montos del e-CF', incomeType: '01 - Ingresos por operaciones',
    payment: 'Contado', reason: '', internalNotes: '', amount: 0
  };
  creditLines: Array<{ description: string; quantity: number; price: number; discount: number; itbis: number; priceIncludesItbis: boolean }> = [{ description: '', quantity: 1, price: 0, discount: 0, itbis: 18, priceIncludesItbis: false }];
  expense = {
    voucher: '', date: new Date().toISOString().slice(0, 10), supplier: '', rnc: '', supplierNcf: '', document: '',
    category: 'Alimentos y bebidas', center: 'Administración', person: '',
    taxable: 0, exempt: 0, itbisRate: 18, payment: 'Efectivo',
    concept: '', notes: '', status: 'Borrador' as MinorExpenseStatus
  };
  minorTab: 'create' | 'consult' = 'create';
  minorSearch = '';
  minorFilterCategory = 'Todas';
  minorFilterStatus: MinorExpenseStatus | 'Todos' = 'Todos';
  minorFilterFrom = currentMonthRange().from;
  minorFilterTo = currentMonthRange().to;
  minorMode: 'create' | 'view' | 'edit' = 'create';
  editingMinorExpenseId: number | null = null;
  minorExpenses: MinorExpenseRecord[] = [];
  selectedMinorDgii: MinorExpenseRecord | null = null;
  isLoadingMinor = false;
  private nextMinorId = 11;
  minorCategories = [...MINOR_CATEGORIES];
  readonly minorCenters = MINOR_CENTERS;
  readonly minorPayments = MINOR_PAYMENTS;
  minorQuickCategories = [...MINOR_QUICK_CATEGORIES];
  get minorItbisAmount(): number { return this.round2(Math.max(0, this.expense.taxable) * Math.max(0, Math.min(100, this.expense.itbisRate)) / 100); }
  get minorTotal(): number { return this.round2(Math.max(0, this.expense.taxable) + Math.max(0, this.expense.exempt) + this.minorItbisAmount); }
  get minorCount(): number { return this.minorExpenses.length; }
  get minorTotalGrand(): number { return this.minorExpenses.reduce((sum, m) => sum + (m.total || 0), 0); }
  get minorItbisGrand(): number { return this.minorExpenses.reduce((sum, m) => sum + (m.itbisAmount || 0), 0); }
  get minorAvgTicket(): number { return this.minorExpenses.length ? this.round2(this.minorTotalGrand / this.minorExpenses.length) : 0; }
  get minorExpensesSorted(): MinorExpenseRecord[] {
    return [...this.minorExpenses].sort((a, b) => b.date.localeCompare(a.date));
  }
  private inCurrentMonth(dateStr: string): boolean {
    const d = new Date(dateStr); const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
  }
  get minorMonthlyCount(): number { return this.minorExpenses.filter((m) => this.inCurrentMonth(m.date)).length; }
  get minorPendingCount(): number { return this.minorExpenses.filter((m) => m.status === 'Borrador' || m.status === 'Rechazado' || m.status === 'Error').length; }
  get minorPendingTotal(): number { return this.round2(this.minorExpenses.filter((m) => m.status === 'Borrador' || m.status === 'Rechazado' || m.status === 'Error').reduce((s, m) => s + (m.total || 0), 0)); }
  clearMinorExpenseQuick(): void {
    this.expense = { ...this.expense, voucher: '', date: new Date().toISOString().slice(0, 10), supplier: '', rnc: '', supplierNcf: '', document: '', category: 'Alimentos y bebidas', taxable: 0, exempt: 0, concept: '', notes: '' };
    this.editingMinorExpenseId = null;
    this.minorMode = 'create';
  }
  async addMinorFromQuick(): Promise<void> {
    if (!this.expense.supplier.trim()) { this.message = 'Completa el nombre del suplidor / beneficiario.'; return; }
    if (!this.expense.concept.trim()) { this.message = 'Agrega una descripción (concepto) del gasto.'; return; }
    const taxable = Math.max(0, this.expense.taxable);
    const exempt = Math.max(0, this.expense.exempt);
    if (taxable <= 0 && exempt <= 0) { this.message = 'Ingresa el monto del gasto (RD$).'; return; }
    const rate = Math.max(0, Math.min(100, this.expense.itbisRate));
    const itbis = this.round2(taxable * rate / 100);
    const total = this.round2(taxable + exempt + itbis);
    try {
      const data: MinorExpenseSaveData = {
        ...this.expense, date: this.expense.date, supplier: this.expense.supplier.trim(), rnc: this.expense.rnc.trim(),
        supplierNcf: this.expense.supplierNcf.trim(), document: this.expense.document.trim(), category: this.expense.category,
        center: this.expense.center, person: this.expense.person, taxable, exempt, itbisRate: rate, itbisAmount: itbis,
        total, payment: this.expense.payment, concept: this.expense.concept.trim(), notes: this.expense.notes.trim(), status: this.expense.status
      };
      const saved = this.editingMinorExpenseId
        ? await this.minorExpensesService.update(this.editingMinorExpenseId, data)
        : await this.minorExpensesService.create(data);
      this.message = this.editingMinorExpenseId
        ? `Gasto ${saved.voucher} actualizado correctamente.`
        : `Gasto ${saved.voucher} guardado correctamente.`;
      this.clearMinorExpenseQuick();
      await this.loadMinorData();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo guardar el gasto menor.';
    }
  }
  editMinorQuick(m: MinorExpenseRecord): void {
    this.expense = {
      voucher: m.voucher, date: m.date, supplier: m.supplier, rnc: m.rnc, supplierNcf: m.supplierNcf, document: m.document,
      category: this.minorQuickCategories.includes(m.category) ? m.category : this.minorQuickCategories[0] ?? 'Otros gastos',
      center: m.center, person: m.person, taxable: m.taxable, exempt: m.exempt, itbisRate: m.itbisRate, payment: m.payment,
      concept: m.concept, notes: m.notes, status: m.status
    };
    this.editingMinorExpenseId = m.id;
    this.minorMode = 'edit';
    this.message = `Editando gasto ${m.voucher}. Actualiza los campos y pulsa Actualizar gasto.`;
  }
  isSendingMinor = false;
  async sendPendingMinorToDgii(): Promise<void> {
    if (this.isSendingMinor) return;
    const count = this.minorPendingCount;
    if (count <= 0) { this.message = 'No hay gastos pendientes para enviar a la DGII.'; return; }
    if (!window.confirm(`Se intentará enviar ${count} gasto(s) (Borrador / Rechazado / Error) como e-CF 43. ¿Continuar?`)) return;
    this.isSendingMinor = true;
    try {
      const pending = this.minorExpenses.filter((expense) => expense.status === 'Borrador' || expense.status === 'Rechazado' || expense.status === 'Error');
      let sent = 0;
      const failures: string[] = [];
      for (const expense of pending) {
        try {
          await this.ecfService.sendMinorExpense(expense.id);
          sent++;
        } catch (error) {
          failures.push(`${expense.voucher}: ${error instanceof Error ? error.message : 'Error al enviar.'}`);
        }
      }
      await this.loadMinorData();
      this.message = failures.length
        ? `Se enviaron ${sent} gasto(s). ${failures.length} no se pudieron enviar. ${failures[0]}`
        : `${sent} gasto(s) enviados a la DGII.`;
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo enviar el lote.';
    } finally {
      this.isSendingMinor = false;
    }
  }
  showMinorDgiiMessage(expense: MinorExpenseRecord): void { this.selectedMinorDgii = expense; }
  closeMinorDgiiMessage(): void { this.selectedMinorDgii = null; }
  get selectedMinorDgiiResponse(): string {
    const expense = this.selectedMinorDgii;
    if (!expense) return '';
    if (expense.dgiiResponse) return JSON.stringify(expense.dgiiResponse, null, 2);
    return expense.dgiiResponseRaw || 'No hay respuesta completa registrada.';
  }
  get selectedMinorDgiiMessages(): string[] {
    const expense = this.selectedMinorDgii;
    if (!expense) return [];
    const messages = expense.dgiiMessages;
    if (Array.isArray(messages)) return messages.map((message) => typeof message === 'string' ? message : JSON.stringify(message));
    if (typeof messages === 'string') return [messages];
    if (messages) return [JSON.stringify(messages)];
    return [expense.dgiiError || expense.dgiiMessage || 'Sin mensajes adicionales.'];
  }
  receivable = { customer: '', invoice: '', dueDate: '', amount: 0 };
  e41Mode: 'list' | 'create' | 'view' | 'edit' = 'list';
  e41Search = '';
  e41StatusFilter: E41Status | 'Todos' = 'Todos';
  e41Records: E41Record[] = [];
  e41IsrRates: IsrRate[] = [];
  e41 = this.newE41Form();
  private editingE41Id: number | null = null;
  get e41ItbisAmount(): number { return this.round2(Math.max(0, Number(this.e41.purchaseAmount) || 0) * (Number(this.e41.itbisRate) || 0) / 100); }
  get e41ItbisWithheld(): number { return this.round2(this.e41ItbisAmount * (Number(this.e41.itbisWithholding) || 0) / 100); }
  get e41IsrWithheld(): number { return this.round2(Math.max(0, Number(this.e41.purchaseAmount) || 0) * (Number(this.e41.isrWithholding) || 0) / 100); }
  get e41PayableTotal(): number { return this.round2(Math.max(0, Number(this.e41.purchaseAmount) || 0) + this.e41ItbisAmount - this.e41ItbisWithheld - this.e41IsrWithheld); }
  get e41TotalPurchases(): number { return this.e41Records.reduce((sum, record) => sum + record.total, 0); }
  get e41TotalItbis(): number { return this.e41Records.reduce((sum, record) => sum + record.itbis, 0); }
  get e41TotalWithheld(): number { return this.e41Records.reduce((sum, record) => sum + record.withheld, 0); }
  get filteredE41Records(): E41Record[] {
    const search = this.e41Search.trim().toLocaleLowerCase();
    return this.e41Records.filter((record) => (this.e41StatusFilter === 'Todos' || record.status === this.e41StatusFilter) && (!search || [record.ncf, record.provider, record.identification].some((value) => value.toLocaleLowerCase().includes(search))));
  }
  newE41Form(): { sequence: string; ncf: string; date: string; purchaseType: string; description: string; providerIdType: string; providerId: string; providerName: string; purchaseAmount: number; itbisRate: number; itbisWithholding: number; isrWithholding: number } {
    return { sequence: '', ncf: '', date: new Date().toISOString().slice(0, 10), purchaseType: 'Producto', description: '', providerIdType: 'Cédula', providerId: '', providerName: '', purchaseAmount: 0, itbisRate: 18, itbisWithholding: 100, isrWithholding: 0 };
  }
  openNewE41(): void { this.e41 = this.newE41Form(); this.editingE41Id = null; this.e41Mode = 'create'; }
  cancelE41(): void { this.editingE41Id = null; this.e41Mode = 'list'; }
  onE41Enter(event: Event, next?: HTMLElement): void {
    event.preventDefault();
    next?.focus();
  }
  openE41Record(record: E41Record, mode: 'view' | 'edit'): void {
    this.e41 = { sequence: record.sequence, ncf: record.ncf, date: record.date, purchaseType: record.purchaseType, description: record.description, providerIdType: record.providerIdType, providerId: record.identification, providerName: record.provider, purchaseAmount: record.amount, itbisRate: record.itbisRate, itbisWithholding: record.itbisWithholding, isrWithholding: record.isrWithholding };
    this.editingE41Id = record.id;
    this.e41Mode = mode;
  }
  async deleteE41(record: E41Record): Promise<void> {
    if (record.status === 'Aceptado') return;
    if (!window.confirm(`¿Deseas eliminar el comprobante ${record.ncf}? Esta acción no se puede deshacer.`)) return;
    try {
      await this.e41Service.delete(record.id);
      await this.loadE41Data();
      this.message = `El comprobante ${record.ncf} fue eliminado.`;
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo eliminar el comprobante E41.';
    }
  }
  async printE41(record: E41Record): Promise<void> {
    const escape = (value: unknown): string => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
    const money = (value: number): string => `RD$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const issueDate = new Date(`${record.date}T00:00:00`).toLocaleDateString('es-DO');
    const controlDate = new Date(`${record.controlDate}T00:00:00`).toLocaleDateString('es-DO');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Compra ${escape(record.ncf)}</title><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{color:#111;font-family:Arial,sans-serif;font-size:11px;margin:0;width:74mm}.center{text-align:center}.company{font-size:14px;font-weight:800}.rule{border-top:1px dashed #222;margin:8px 0}.line{display:flex;justify-content:space-between;gap:8px;margin:4px 0}.line span:last-child{text-align:right}.total{font-size:13px;font-weight:800;margin-top:6px}.muted{color:#444}h1{font-size:13px;margin:7px 0}.footer{font-size:9px;margin-top:12px;text-align:center}</style></head><body><div class="center company">${escape(this.loggedCompanyName || 'SALTOR SYSTEM')}</div><div class="center muted">Comprobante de Compra Electrónica E41</div><div class="rule"></div><div><b>e-NCF:</b> ${escape(record.ncf)}</div><div><b>Control:</b> ${escape(record.sequence)}</div><div><b>Fecha emisión:</b> ${escape(issueDate)}</div><div><b>Fecha control:</b> ${escape(controlDate)}</div><div><b>Estado:</b> ${escape(record.status)}</div><div class="rule"></div><h1>Proveedor informal</h1><div><b>Nombre:</b> ${escape(record.provider)}</div><div><b>${escape(record.providerIdType)}:</b> ${escape(record.identification)}</div><div><b>Tipo de compra:</b> ${escape(record.purchaseType)}</div>${record.description ? `<div><b>Descripción:</b> ${escape(record.description)}</div>` : ''}<div class="rule"></div><div class="line"><span>Monto compra</span><span>${money(record.amount)}</span></div><div class="line"><span>ITBIS (${escape(record.itbisRate)}%)</span><span>${money(record.itbis)}</span></div><div class="line"><span>Retención ITBIS (${escape(record.itbisWithholding)}%)</span><span>-${money(record.itbis * record.itbisWithholding / 100)}</span></div><div class="line"><span>Retención ISR (${escape(record.isrWithholding)}%)</span><span>-${money(record.amount * record.isrWithholding / 100)}</span></div><div class="rule"></div><div class="line total"><span>TOTAL A PAGAR</span><span>${money(record.total)}</span></div><div class="footer">Documento generado por SaltoSystem</div><script>window.onload=()=>window.print()<\/script></body></html>`;
    const result = await this.qzPrintService.printHtml(html, `Compra ${record.ncf}`, 'width=420,height=760');
    if (result === 'unavailable') this.message = 'No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo de nuevo.';
  }
  async sendE41ToDgii(record: E41Record): Promise<void> {
    if (!record || record.status === 'Aceptado') return;
    try {
      await this.e41Service.markAsSent(record.id);
      await this.loadE41Data();
      this.message = `El comprobante ${record.ncf} fue marcado como enviado a la DGII.`;
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo actualizar el comprobante E41.';
    }
  }
  async saveE41(status: Extract<E41Status, 'Borrador' | 'Enviado'>): Promise<void> {
    if (!this.e41.providerId.trim() || !this.e41.providerName.trim() || Number(this.e41.purchaseAmount) <= 0) {
      this.message = 'Completa los datos del proveedor y el monto de compra para continuar.';
      return;
    }
    const data: E41SaveData = {
      date: this.e41.date, purchaseType: this.e41.purchaseType, description: this.e41.description,
      providerIdType: this.e41.providerIdType, providerId: this.e41.providerId, providerName: this.e41.providerName,
      purchaseAmount: Number(this.e41.purchaseAmount), itbisRate: Number(this.e41.itbisRate),
      itbisWithholding: Number(this.e41.itbisWithholding), isrWithholding: Number(this.e41.isrWithholding), status
    };
    try {
      const saved = this.editingE41Id === null
        ? await this.e41Service.create(data)
        : await this.e41Service.update(this.editingE41Id, data);
      this.e41Mode = 'list';
      this.editingE41Id = null;
      await this.loadE41Data();
      this.message = status === 'Enviado'
        ? `Comprobante ${saved.ncf}, secuencia ${saved.sequence}, guardado y marcado para envío a la DGII.`
        : `Comprobante ${saved.ncf}, secuencia ${saved.sequence}, guardado como borrador.`;
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo guardar el comprobante E41.';
    }
  }
  async loadE41Data(): Promise<void> {
    try {
      const [records, isrRates] = await Promise.all([
        this.e41Service.list(),
        this.e41Service.getIsrRates()
      ]);
      this.e41Records = records;
      this.e41IsrRates = isrRates;
    } catch (error) {
      this.e41Records = [];
      this.e41IsrRates = [];
      this.message = error instanceof Error ? error.message : 'No se pudieron cargar los comprobantes E41.';
    }
  }
  purchaseTab: 'register' | 'list' | 'report' = 'register';
  purchaseSearch = '';
  purchaseReportMonth = new Date().getMonth() + 1;
  purchaseReportYear = new Date().getFullYear();
  readonly purchaseMonths = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  purchaseRecords: Purchase606Record[] = [];
  isLoadingPurchases = false;
  isSavingPurchase = false;
  purchasesError = '';
  showPurchaseSupplierForm = false;
  isSavingPurchaseSupplier = false;
  purchaseSuppliers: SupplierRecord[] = [];
  purchaseSupplier = { documentType: 'RNC' as 'RNC' | 'Cedula' | 'Pasaporte', documentNumber: '', companyName: '' };
  purchase = {
    period: new Date().toISOString().slice(0, 7), supplier: '', rnc: '', document: '', ncf: '', sequence: '', invoiceDate: new Date().toISOString().slice(0, 10), registrationDate: new Date().toISOString().slice(0, 10),
    paymentDate: '', paymentType: '01 - Efectivo', goodsType: '02 - Bienes', invoiceAmount: 0, servicesAmount: 0, goodsAmount: 0,
    itbis: 0, itbisWithheld: 0, itbisAdvanced: 0
  };
  get purchaseTotal(): number { return this.round2(Number(this.purchase.invoiceAmount || 0)); }
  get purchaseItbis(): number { return this.round2(this.purchaseTotal * 18 / 118); }
  get purchaseSubtotal(): number { return this.round2(this.purchaseTotal - this.purchaseItbis); }
  get purchaseSupplierSuggestions(): SupplierRecord[] {
    const rnc = this.purchase.rnc.trim().toLowerCase();
    return this.purchaseSuppliers.filter((supplier) => !rnc || supplier.documentNumber.toLowerCase().includes(rnc)).slice(0, 30);
  }
  get filteredPurchaseRecords(): Purchase606Record[] {
    const search = this.purchaseSearch.trim().toLowerCase();
    return !search ? this.purchaseRecords : this.purchaseRecords.filter((record) =>
      [record.rnc, record.ncf, record.document, record.supplier].some((value) => value.toLowerCase().includes(search)));
  }
  get purchaseReportRecords(): Purchase606Record[] {
    const month = String(this.purchaseReportMonth).padStart(2, '0');
    return this.purchaseRecords.filter((record) => record.invoiceDate.startsWith(`${this.purchaseReportYear}-${month}`));
  }
  get purchaseAmountTotal(): number { return this.purchaseRecords.reduce((sum, record) => sum + record.invoiceAmount, 0); }
  get purchaseItbisTotal(): number { return this.purchaseRecords.reduce((sum, record) => sum + record.itbisAmount, 0); }
  get purchaseReportAmountTotal(): number { return this.purchaseReportRecords.reduce((sum, record) => sum + record.invoiceAmount, 0); }
  get purchaseReportItbisTotal(): number { return this.purchaseReportRecords.reduce((sum, record) => sum + record.itbisAmount, 0); }
  clearPurchase(): void {
    this.purchase = {
      period: new Date().toISOString().slice(0, 7), supplier: '', rnc: '', document: '', ncf: '', sequence: '', invoiceDate: new Date().toISOString().slice(0, 10), registrationDate: new Date().toISOString().slice(0, 10),
      paymentDate: '', paymentType: '01 - Efectivo', goodsType: '02 - Bienes', invoiceAmount: 0, servicesAmount: 0, goodsAmount: 0,
      itbis: 0, itbisWithheld: 0, itbisAdvanced: 0
    };
    this.showPurchaseSupplierForm = false;
    this.message = '';
  }
  openPurchaseSupplierForm(): void {
    this.purchaseSupplier = { documentType: 'RNC', documentNumber: '', companyName: '' };
    this.showPurchaseSupplierForm = true;
  }
  cancelPurchaseSupplierForm(): void { this.showPurchaseSupplierForm = false; }
  async loadPurchaseRecords(): Promise<void> {
    this.isLoadingPurchases = true;
    this.purchasesError = '';
    try {
      this.purchaseRecords = await this.purchases606Service.list();
    } catch (error) {
      this.purchaseRecords = [];
      this.purchasesError = error instanceof Error ? error.message : 'No se pudieron cargar las facturas de compra.';
    } finally {
      this.isLoadingPurchases = false;
    }
  }
  async loadPurchaseSuppliers(): Promise<void> {
    try { this.purchaseSuppliers = await this.suppliersService.getSuppliers(); } catch { this.purchaseSuppliers = []; }
  }
  onPurchaseRncChange(): void {
    const rnc = this.purchase.rnc.trim().toLowerCase();
    const supplier = this.purchaseSuppliers.find((item) => item.documentNumber.trim().toLowerCase() === rnc);
    if (supplier) this.purchase.supplier = supplier.companyName;
  }
  async onPurchaseRncEnter(event: Event): Promise<void> {
    this.onPurchaseRncChange();
    if (!this.purchase.supplier.trim() && this.purchase.rnc.trim()) {
      try {
        const result = await this.rncService.lookup(this.purchase.rnc);
        this.purchase.rnc = result.rnc;
        this.purchase.supplier = result.tradeName || result.legalName;
      } catch (error) {
        this.message = error instanceof Error ? error.message : 'No se pudo consultar el RNC en Megaplus.';
        return;
      }
    }
    this.focusPurchaseNext(event);
  }
  focusPurchaseNext(event: Event): void {
    if (event.defaultPrevented || !(event.target instanceof HTMLElement)) return;
    event.preventDefault();
    const form = event.target.closest('form.purchase606__form');
    if (!form) return;
    const fields = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input:not([readonly]):not([disabled]), select:not([disabled])"));
    const currentIndex = fields.indexOf(event.target as HTMLInputElement | HTMLSelectElement);
    fields[currentIndex + 1]?.focus();
  }
  async savePurchase606(): Promise<void> {
    if (this.isSavingPurchase) return;
    if (!this.purchase.supplier.trim() || !this.purchase.rnc.trim() || !this.purchase.document.trim() || !this.purchase.ncf.trim()) {
      this.message = 'Completa el proveedor, RNC/Cédula, número de factura y NCF.';
      return;
    }
    if (this.purchaseTotal <= 0) {
      this.message = 'El monto facturado debe ser mayor que cero.';
      return;
    }
    this.isSavingPurchase = true;
    try {
      const saved = await this.purchases606Service.create({
        supplier: this.purchase.supplier.trim(), rnc: this.purchase.rnc.trim(), document: this.purchase.document.trim(), ncf: this.purchase.ncf.trim(),
        invoiceDate: this.purchase.invoiceDate, paymentDate: this.purchase.paymentDate, paymentType: this.purchase.paymentType,
        goodsType: this.purchase.goodsType, invoiceAmount: this.purchaseTotal, itbisAmount: this.purchaseItbis, subtotal: this.purchaseSubtotal
      });
      this.purchase.sequence = saved.sequence;
      this.message = `Factura de compra ${this.purchase.document} guardada con el registro ${saved.sequence}.`;
      await this.loadPurchaseRecords();
    } catch (error) {
      this.message = error instanceof Error ? `No se pudo guardar la factura de compra. ${error.message}` : 'No se pudo guardar la factura de compra.';
    } finally {
      this.isSavingPurchase = false;
    }
  }
  async savePurchaseSupplier(): Promise<void> {
    if (this.isSavingPurchaseSupplier) return;
    if (!this.purchaseSupplier.documentNumber.trim() || !this.purchaseSupplier.companyName.trim()) {
      this.message = 'Completa el RNC/Cédula y el nombre del proveedor.';
      return;
    }
    this.isSavingPurchaseSupplier = true;
    const form: SupplierFormModel = {
      code: `SUP-${Date.now().toString().slice(-8)}`,
      companyName: this.purchaseSupplier.companyName.trim(),
      contactName: '',
      documentType: this.purchaseSupplier.documentType,
      documentNumber: this.purchaseSupplier.documentNumber.trim(),
      phone: '', email: '', address: '', city: '', category: 'Local', paymentTerms: '', balance: 0, status: 'Activo'
    };
    try {
      const supplier = await this.suppliersService.createSupplier(form, new Date().toISOString().slice(0, 10));
      this.purchase.supplier = supplier.companyName;
      this.purchase.rnc = supplier.documentNumber;
      this.showPurchaseSupplierForm = false;
      this.message = `Proveedor ${supplier.companyName} guardado y seleccionado.`;
    } catch (error) {
      this.message = error instanceof Error ? `No se pudo guardar el proveedor. ${error.message}` : 'No se pudo guardar el proveedor.';
    } finally {
      this.isSavingPurchaseSupplier = false;
    }
  }
  @Input() set section(value: string) {
    const views: Record<string, FiscalView> = {
      'Facturas pendientes': 'pending',
      'Rep. 607': 'rep607',
      'e-NCF': 'encf',
      'Nota de crédito': 'credit',
      'Gastos menores': 'expenses',
      'Cuentas por cobrar': 'receivables',
      'Rep. 606': 'rep606',
      'Compra informal E41': 'e41'
    };
    this.active = views[value] ?? 'rep607';
    this.message = this.active === 'rep607' ? 'Selecciona los filtros y pulsa Filtrar para consultar.' : '';
    if (this.initialized && this.active === 'rep607') void this.loadRep607();
    if (this.initialized && this.active === 'pending') void this.loadPendingInvoices();
    if (this.initialized && this.active === 'credit') void this.loadCreditNotes();
    if (this.initialized && this.active === 'expenses') void this.loadMinorData();
    if (this.initialized && this.active === 'rep606') void this.loadPurchaseRecords();
    if (this.initialized && this.active === 'e41') void this.loadE41Data();
  }
  constructor(
    public data: AppDataService,
    private readonly auth: AuthService,
    private readonly branchesService: BranchesService,
    private readonly rep607Service: Rep607Service,
    private readonly ecfService: EcfService,
    private readonly ncfTypesService: NcfTypesService,
    private readonly creditNotesService: CreditNotesService,
    private readonly minorExpensesService: MinorExpensesService,
    private readonly suppliersService: SuppliersService,
    private readonly purchases606Service: Purchases606Service,
    private readonly e41Service: E41Service,
    private readonly rncService: RncService,
    private readonly qzPrintService: QzPrintService
  ) {}

  ngOnInit(): void {
    this.initialized = true;
    void this.loadMinorData();
    void this.loadRep607();
    void this.loadPendingInvoices();
    void this.loadCreditNotes();
    void this.loadPurchaseRecords();
    void this.loadPurchaseSuppliers();
    void this.loadE41Data();
  }

  get rep607Accepted(): number { return this.rep607Invoices.filter((invoice) => invoice.status === 'Aceptado').length; }
  get rep607RejectedOrError(): number { return this.rep607Invoices.filter((invoice) => ['Rechazado', 'Error'].includes(invoice.status)).length; }
  get rep607Conditional(): number { return this.rep607Invoices.filter((invoice) => /condicional/i.test(invoice.status)).length; }
  get rep607Period(): string { return this.filters.from || this.filters.to ? `${this.filters.from || 'Inicio'} - ${this.filters.to || 'Hoy'}` : 'Todas las fechas'; }
  get filteredCreditNotes(): CreditNoteRecord[] {
    const search = this.creditSearch.trim().toLowerCase();
    return !search ? this.creditNotes : this.creditNotes.filter((note) =>
      [note.number, note.invoice, note.encf, note.customer, note.status].some((value) => value.toLowerCase().includes(search)));
  }
  private getLineGross(line: { quantity: number; price: number; discount: number }): number {
    return Math.max(0, line.quantity) * Math.max(0, line.price) * (1 - Math.max(0, Math.min(100, line.discount)) / 100);
  }
  private getLineTaxable(line: { quantity: number; price: number; discount: number; itbis: number; priceIncludesItbis: boolean }): number {
    const gross = this.getLineGross(line);
    const rate = Math.max(0, Math.min(100, line.itbis)) / 100;
    if (!line.priceIncludesItbis) return gross;
    return rate > 0 ? gross / (1 + rate) : gross;
  }
  private getLineTax(line: { quantity: number; price: number; discount: number; itbis: number; priceIncludesItbis: boolean }): number {
    const gross = this.getLineGross(line);
    const rate = Math.max(0, Math.min(100, line.itbis)) / 100;
    if (!line.priceIncludesItbis) return gross * rate;
    return rate > 0 ? gross - gross / (1 + rate) : 0;
  }
  private getLineFinalTotal(line: { quantity: number; price: number; discount: number; itbis: number; priceIncludesItbis: boolean }): number {
    return this.getLineTaxable(line) + this.getLineTax(line);
  }
  getCreditLineDisplayTotal(line: { quantity: number; price: number; discount: number; itbis: number; priceIncludesItbis: boolean }): number {
    return this.getLineFinalTotal(line);
  }
  get creditLineTotal(): number { return this.creditLines.reduce((total, line) => total + this.getLineTaxable(line), 0); }
  get creditDiscountTotal(): number {
    return this.creditLines.reduce((total, line) => total + Math.max(0, line.quantity) * Math.max(0, line.price) * Math.max(0, Math.min(100, line.discount)) / 100, 0);
  }
  get creditItbisTotal(): number { return this.creditLines.reduce((total, line) => total + this.getLineTax(line), 0); }
  get creditGrandTotal(): number { return this.creditLines.reduce((total, line) => total + this.getLineFinalTotal(line), 0); }

  async loadCreditNotes(): Promise<void> {
    this.creditNotesError = '';
    try {
      this.creditNotes = await this.creditNotesService.getCreditNotes();
    } catch (error) {
      this.creditNotes = [];
      this.creditNotesError = error instanceof Error ? error.message : 'No se pudieron cargar las notas de crédito.';
    }
  }

  async loadCreditNoteInForm(note: CreditNoteRecord, mode: 'view' | 'edit'): Promise<void> {
    try {
      const detail = await this.creditNotesService.getCreditNoteById(note.id);
      if (!detail) throw new Error('No se encontró la nota de crédito.');
      this.credit = { invoiceId: detail.invoiceId, invoice: detail.invoice, encf: detail.encfAffected, affectedDate: detail.affectedDate, rnc: detail.rnc, customer: detail.customer, email: detail.email, address: detail.address, noteNumber: detail.number, noteEncf: detail.noteEncf, date: detail.date, expiry: detail.expiry, modificationCode: detail.modificationCode, incomeType: detail.incomeType, payment: detail.payment, reason: detail.reason, internalNotes: detail.internalNotes, amount: detail.total };
      this.creditLines = detail.lines.map((line) => ({ description: line.description, quantity: line.quantity, price: line.price, discount: line.discount, itbis: line.itbis, priceIncludesItbis: false }));
      this.lastSavedCreditNoteId = detail.id;
      this.editingCreditNoteId = mode === 'edit' ? detail.id : null;
      this.creditMode = mode;
      this.creditDgii = { status: detail.status, trackId: detail.trackId || '-', securityCode: detail.securityCode || '-' };
      this.creditTab = 'create';
      this.message = mode === 'view' ? `Visualizando nota de crédito ${detail.number}.` : `Editando nota de crédito ${detail.number}.`;
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo cargar la nota de crédito.';
    }
  }

  async showCreditDgiiMessage(note: CreditNoteRecord): Promise<void> {
    try {
      this.selectedCreditDgii = await this.creditNotesService.getCreditNoteById(note.id);
      if (!this.selectedCreditDgii) throw new Error('No se encontró la nota de crédito.');
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo cargar la respuesta de DGII.';
    }
  }

  closeCreditDgiiMessage(): void { this.selectedCreditDgii = null; }

  async printCreditNote(note: CreditNoteRecord): Promise<void> {
    const detail = await this.creditNotesService.getCreditNoteById(note.id);
    if (!detail) return;
    const rows = detail.lines.map((line) => `<tr><td>${this.escapeHtml(line.description)}</td><td>${line.quantity}</td><td>${this.money(line.price)}</td><td>${this.money(line.lineTotal + line.taxAmount)}</td></tr>`).join('');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Nota ${this.escapeHtml(detail.number)}</title><style>@page{size:80mm auto;margin:3mm}body{font:11px Arial;width:74mm;margin:0;color:#111}h2,p{margin:4px 0;text-align:center}.left{text-align:left}.line{border-top:1px dashed #555;margin:7px 0}table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:3px 0;text-align:left}th:last-child,td:last-child{text-align:right}.total{font-size:13px;font-weight:bold}</style></head><body><h2>NOTA DE CRÉDITO</h2><p>No. ${this.escapeHtml(detail.number)}</p><p>e-NCF: ${this.escapeHtml(detail.noteEncf || 'Pendiente')}</p><div class="line"></div><p class="left">Cliente: ${this.escapeHtml(detail.customer)}</p><p class="left">Factura afectada: ${this.escapeHtml(detail.invoice)}</p><p class="left">Fecha: ${this.escapeHtml(detail.date)}</p><div class="line"></div><table><thead><tr><th>Detalle</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="line"></div><p class="left">Subtotal: RD$${this.money(detail.subtotal)}</p><p class="left">ITBIS: RD$${this.money(detail.itbis)}</p><p class="left total">TOTAL: RD$${this.money(detail.total)}</p><div class="line"></div><p>Estado DGII: ${this.escapeHtml(detail.status)}</p><script>window.onload=()=>window.print();<\/script></body></html>`;
    const result = await this.qzPrintService.printHtml(html, `Nota ${detail.number}`, 'width=420,height=720');
    if (result === 'unavailable') this.message = 'No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo de nuevo.';
  }

  async downloadCreditNotePdf(note: CreditNoteRecord): Promise<void> {
    const detail = await this.creditNotesService.getCreditNoteById(note.id);
    if (!detail) return;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'letter' });
    let y = 18;
    const write = (text: string, size = 10, bold = false): void => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); const lines = pdf.splitTextToSize(text, 170); pdf.text(lines, 20, y); y += lines.length * (size * .48) + 3; };
    write('NOTA DE CRÉDITO ELECTRÓNICA', 16, true); write(`No. nota: ${detail.number}`); write(`e-NCF nota: ${detail.noteEncf || 'Pendiente'}`); write(`Factura afectada: ${detail.invoice}  |  e-NCF afectado: ${detail.encfAffected}`); write(`Cliente: ${detail.customer}`); write(`Fecha: ${detail.date}`); y += 3; write('Detalle', 12, true);
    detail.lines.forEach((line) => { if (y > 245) { pdf.addPage('letter'); y = 18; } write(`${line.quantity} x ${line.description}  |  RD$${this.money(line.lineTotal + line.taxAmount)}`); });
    y += 4; write(`Subtotal: RD$${this.money(detail.subtotal)}`, 11); write(`ITBIS: RD$${this.money(detail.itbis)}`, 11); write(`TOTAL: RD$${this.money(detail.total)}`, 13, true); write(`Estado DGII: ${detail.status}`); pdf.save(`nota-credito-${detail.number}.pdf`);
  }

  private money(value: number): string { return Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  private escapeHtml(value: string): string { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character)); }

  canSendCreditNote(note: CreditNoteRecord): boolean {
    return !['Aceptado', 'Aceptado condicional'].includes(note.status);
  }

  isRejectedCreditNote(note: CreditNoteRecord): boolean {
    return note.status === 'Rechazado';
  }

  async sendCreditNoteFromList(note: CreditNoteRecord): Promise<void> {
    if (!this.canSendCreditNote(note) || this.isSendingCreditNote) return;
    this.isSendingCreditNote = true;
    this.message = `Enviando la nota de crédito ${note.number} a DGII...`;
    try {
      const result = await this.ecfService.sendCreditNote(note.id);
      this.message = result.dgii_mensaje_respuesta || `Nota de crédito ${note.number} enviada a DGII.`;
      await this.loadCreditNotes();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo enviar la nota de crédito a DGII.';
    } finally {
      this.isSendingCreditNote = false;
    }
  }

  async resetCreditNoteEcf(note: CreditNoteRecord): Promise<void> {
    if (!this.isRejectedCreditNote(note) || this.isSendingCreditNote) return;
    if (!window.confirm(`¿Deseas eliminar el e-NCF de la nota ${note.number} para generar uno nuevo?`)) return;
    this.isSendingCreditNote = true;
    try {
      await this.creditNotesService.resetCreditNoteEcf(note.id);
      this.message = `e-NCF eliminado de la nota ${note.number}. Ya puede reenviarse.`;
      await this.loadCreditNotes();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo eliminar el e-NCF de la nota de crédito.';
    } finally {
      this.isSendingCreditNote = false;
    }
  }

  async loadRep607(): Promise<void> {
    this.isLoadingRep607 = true;
    this.rep607Error = '';
    try {
      const user = await this.auth.restoreSession();
      if (!user) throw new Error('No hay una sesión activa.');
      this.companyId = user.companyId;
      this.loggedCompanyName = user.companyName;
      const [branches, ncfTypes] = await Promise.all([
        this.branchesService.getBranches(user.companyId),
        this.ncfTypesService.getTypes()
      ]);
      this.branches = branches;
      this.ncfFilterTypes = ncfTypes.filter((type) => type.status === 'Activa' && type.type === 1);
      this.rep607Invoices = await this.rep607Service.getInvoices(user.companyId, this.filters);
      this.message = this.rep607Invoices.length ? '' : 'No hay comprobantes con información DGII para los filtros indicados.';
    } catch (error) {
      this.rep607Invoices = [];
      this.rep607Error = error instanceof Error ? error.message : 'No se pudo consultar Rep. 607 en Supabase.';
    } finally {
      this.isLoadingRep607 = false;
    }
  }

  get pendingTotal(): number { return this.pendingInvoices.reduce((total, invoice) => total + invoice.total, 0); }

  async loadPendingInvoices(): Promise<void> {
    this.isLoadingPending = true;
    this.pendingError = '';
    try {
      const user = await this.auth.restoreSession();
      if (!user) throw new Error('No hay una sesión activa.');
      this.loggedCompanyName = user.companyName;
      if (!this.branches.length) this.branches = await this.branchesService.getBranches(user.companyId);
      this.pendingInvoices = await this.rep607Service.getPendingInvoices(user.companyId, this.pendingFilters);
    } catch (error) {
      this.pendingInvoices = [];
      this.pendingError = error instanceof Error ? error.message : 'No se pudieron consultar las facturas pendientes.';
    } finally {
      this.isLoadingPending = false;
    }
  }

  clearPendingFilters(): void {
    this.pendingFilters = { branchId: 'Todas', invoice: '', from: '', to: '' };
    void this.loadPendingInvoices();
  }

  canSendPending(invoice: PendingInvoice): boolean {
    return !['Aceptado', 'Aceptado condicional'].includes(invoice.status);
  }

  sendPendingInvoice(invoice: PendingInvoice): void {
    if (!this.canSendPending(invoice) || this.isProcessingPending) return;
    this.requestDgiiSend('pending', invoice);
  }

  private async processPendingInvoice(invoice: PendingInvoice): Promise<void> {
    this.isProcessingPending = true;
    this.pendingActionMessage = '';
    this.openDgiiSendDialog(invoice.number);
    try {
      const result = await this.ecfService.sendInvoice(invoice.id);
      this.pendingActionMessage = `Factura ${invoice.number} enviada a DGII.`;
      this.completeDgiiSendDialog('success', result.dgii_mensaje_respuesta || `La factura ${invoice.number} fue procesada por DGII.`);
      await this.loadPendingInvoices();
    } catch (error) {
      this.pendingActionMessage = error instanceof Error ? error.message : 'No se pudo enviar la factura a DGII.';
      this.completeDgiiSendDialog('error', this.pendingActionMessage);
    } finally {
      this.isProcessingPending = false;
    }
  }

  async resetPendingInvoiceEcf(invoice: PendingInvoice): Promise<void> {
    if (this.isProcessingPending || !window.confirm(`¿Deseas eliminar el e-CF de la factura ${invoice.number} para generar uno nuevo?`)) return;
    this.isProcessingPending = true;
    this.pendingActionMessage = '';
    try {
      await this.rep607Service.resetInvoiceEcf(invoice.id);
      this.pendingActionMessage = `Comprobante eliminado de la factura ${invoice.number}. Ya puede reenviarse.`;
      await this.loadPendingInvoices();
    } catch (error) {
      this.pendingActionMessage = error instanceof Error ? error.message : 'No se pudo editar el comprobante de la factura.';
    } finally {
      this.isProcessingPending = false;
    }
  }

  filter(): void { void this.loadRep607(); }
  clear(): void {
    this.filters = { branchId: 'Todas', type: 'Todos', status: 'Todos', invoice: '', encf: '', ...currentMonthRange() };
    void this.loadRep607();
  }

  viewDgiiResponse(invoice: Rep607Invoice): void { this.selectedDgiiInvoice = invoice; }
  closeDgiiResponse(): void { this.selectedDgiiInvoice = null; }
  requestDgiiSend(source: 'pending' | 'rep607', invoice: PendingInvoice | Rep607Invoice): void {
    this.dgiiSendTarget = { source, invoice };
    this.dgiiSendDialog = { phase: 'confirm', invoiceNumber: invoice.number, message: '¿Deseas enviar esta factura a DGII?' };
  }
  confirmDgiiSend(): void {
    const target = this.dgiiSendTarget;
    if (!target) return;
    this.dgiiSendTarget = null;
    if (target.source === 'pending') void this.processPendingInvoice(target.invoice as PendingInvoice);
    else void this.processRep607Invoice(target.invoice as Rep607Invoice);
  }
  openDgiiSendDialog(invoiceNumber: string): void {
    this.dgiiSendDialog = { phase: 'processing', invoiceNumber, message: 'Enviando el comprobante a DGII. Espera un momento...' };
  }
  completeDgiiSendDialog(phase: 'success' | 'error', message: string): void {
    if (!this.dgiiSendDialog) return;
    this.dgiiSendDialog = { ...this.dgiiSendDialog, phase, message };
  }
  closeDgiiSendDialog(): void {
    if (this.dgiiSendDialog?.phase !== 'processing') {
      this.dgiiSendDialog = null;
      this.dgiiSendTarget = null;
    }
  }
  canResend(invoice: Rep607Invoice): boolean { return !['Aceptado', 'Aceptado condicional'].includes(invoice.status); }
  isAcceptedStatus(status: string): boolean { return status === 'Aceptado'; }
  isRejectedStatus(status: string): boolean { return status === 'Rechazado'; }

  openQr(invoice: Rep607Invoice): void {
    if (!invoice.qrLink) return;
    try {
      const url = new URL(invoice.qrLink);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL no permitida');
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      this.actionMessage = 'El enlace QR no tiene un formato válido.';
    }
  }

  async copyQrLink(invoice: Rep607Invoice): Promise<void> {
    if (!invoice.qrLink) return;
    try {
      await navigator.clipboard.writeText(invoice.qrLink);
      this.actionMessage = 'Enlace QR copiado al portapapeles.';
    } catch {
      this.actionMessage = 'No se pudo copiar el enlace QR.';
    }
  }

  resendToDgii(invoice: Rep607Invoice): void {
    if (!this.canResend(invoice) || this.isResending) return;
    this.requestDgiiSend('rep607', invoice);
  }

  async resetRep607InvoiceEcf(invoice: Rep607Invoice): Promise<void> {
    if (!this.isRejectedStatus(invoice.status) || this.isResending) return;
    if (!window.confirm(`¿Deseas eliminar el e-CF de la factura ${invoice.number} para generar uno nuevo?`)) return;

    this.isResending = true;
    this.actionMessage = '';
    try {
      await this.rep607Service.resetRejectedInvoiceEcf(invoice.id);
      this.actionMessage = `e-CF eliminado de la factura ${invoice.number}. Ya puede reenviarse.`;
      await this.loadRep607();
    } catch (error) {
      this.actionMessage = error instanceof Error ? error.message : 'No se pudo eliminar el e-CF de la factura.';
    } finally {
      this.isResending = false;
    }
  }

  private async processRep607Invoice(invoice: Rep607Invoice): Promise<void> {
    this.isResending = true;
    this.actionMessage = '';
    this.openDgiiSendDialog(invoice.number);
    try {
      const result = await this.ecfService.sendInvoice(invoice.id);
      this.actionMessage = `Factura ${invoice.number} reenviada a DGII.`;
      this.completeDgiiSendDialog('success', result.dgii_mensaje_respuesta || `La factura ${invoice.number} fue procesada por DGII.`);
      await this.loadRep607();
    } catch (error) {
      this.actionMessage = error instanceof Error ? error.message : 'No se pudo reenviar la factura a DGII.';
      this.completeDgiiSendDialog('error', this.actionMessage);
    } finally {
      this.isResending = false;
    }
  }

  get selectedDgiiResponse(): string {
    const invoice = this.selectedDgiiInvoice;
    if (!invoice) return '';
    if (invoice.response) return JSON.stringify(invoice.response, null, 2);
    if (invoice.responseRaw) return invoice.responseRaw;
    return 'No hay respuesta completa registrada.';
  }

  get selectedDgiiMessages(): string[] {
    const invoice = this.selectedDgiiInvoice;
    if (!invoice) return [];
    const messages = invoice.messages;
    if (Array.isArray(messages)) return messages.map((message) => typeof message === 'string' ? message : JSON.stringify(message));
    if (typeof messages === 'string') return [messages];
    if (messages) return [JSON.stringify(messages)];
    return [invoice.errorMessage || invoice.message || 'Sin mensajes adicionales.'];
  }
  save(label: string): void { this.message = `${label} guardado correctamente.`; }

  async loadMinorData(): Promise<void> {
    this.isLoadingMinor = true;
    try {
      const [categories, expenses] = await Promise.all([
        this.minorExpensesService.getCategories(),
        this.minorExpensesService.list()
      ]);
      this.minorCategories = categories;
      this.minorQuickCategories = categories;
      if (!categories.includes(this.expense.category)) {
        this.expense.category = categories[0] ?? '';
      }
      this.minorExpenses = expenses;
    } catch (error) {
      this.minorExpenses = [];
      this.message = error instanceof Error ? error.message : 'No se pudieron cargar los gastos menores.';
    } finally {
      this.isLoadingMinor = false;
    }
  }

  get minorByCategory(): { name: string; amount: number; percent: number }[] {
    const agg: Record<string, number> = {};
    for (const m of this.minorExpenses) agg[m.category] = (agg[m.category] || 0) + (m.total || 0);
    const list = Object.keys(agg).map((k) => ({ name: k, amount: agg[k] })).sort((a, b) => b.amount - a.amount);
    const max = list[0]?.amount || 1;
    return list.map((row) => ({ ...row, percent: Math.max(2, Math.round((row.amount / max) * 100)) }));
  }
  get filteredMinorExpenses(): MinorExpenseRecord[] {
    const search = this.minorSearch.trim().toLowerCase();
    const fromMs = this.minorFilterFrom ? new Date(this.minorFilterFrom).getTime() : 0;
    const toMs = this.minorFilterTo ? new Date(this.minorFilterTo).getTime() + 86400000 : Infinity;
    return this.minorExpenses.filter((m) => {
      if (this.minorFilterCategory !== 'Todas' && m.category !== this.minorFilterCategory) return false;
      if (this.minorFilterStatus !== 'Todos' && m.status !== this.minorFilterStatus) return false;
      const dMs = new Date(m.date).getTime();
      if (dMs < fromMs || dMs >= toMs) return false;
      if (!search) return true;
      return [m.voucher, m.supplier, m.rnc, m.supplierNcf, m.document, m.category, m.person, m.concept, m.status].some((v) => v.toLowerCase().includes(search));
    }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  get filteredMinorTotal(): number { return this.filteredMinorExpenses.reduce((sum, m) => sum + (m.total || 0), 0); }
  private round2(value: number): number { return Math.round(value * 100) / 100; }
  private nextMinorVoucher(): string {
    const index = this.minorExpenses.length + 1;
    return `GME-${String(new Date().getFullYear()).slice(-2)}${String(index).padStart(5, '0')}`;
  }
  seedMinorExpenses(): void {
    if (this.minorExpenses.length) return;
    const demo: MinorExpenseRecord[] = [
      { id: 1, voucher: 'GME-2600001', date: new Date(Date.now()-86400000*18).toISOString().slice(0,10), supplier: 'Papelería La Fe SRL', rnc: '131723942', supplierNcf: 'E310000000101', document: 'FAC-1234', category: 'Oficina y suministros', center: 'Administración', person: 'Ana Pérez', taxable: 847.46, exempt: 0, itbisRate: 18, itbisAmount: 152.54, total: 1000, payment: 'Tarjeta débito', concept: 'Resmas de papel, tonner y artículos de oficina', notes: 'Compra mensual', status: 'Aceptado', trackId: 'TRK88123', securityCode: 'SEC88A1B', eNcf: 'E430000000001' },
      { id: 2, voucher: 'GME-2600002', date: new Date(Date.now()-86400000*15).toISOString().slice(0,10), supplier: 'Gasolinería Texaco', rnc: '401008672', supplierNcf: 'E320000000040', document: 'BOM-778', category: 'Combustible', center: 'Logística', person: 'Luis Rosa', taxable: 6779.66, exempt: 0, itbisRate: 18, itbisAmount: 1220.34, total: 8000, payment: 'Tarjeta crédito', concept: 'Tanqueo de 3 vehículos de reparto', notes: '', status: 'Enviado', trackId: 'TRK88456' },
      { id: 3, voucher: 'GME-2600003', date: new Date(Date.now()-86400000*12).toISOString().slice(0,10), supplier: 'Restaurante El Fogón', rnc: '101123456', supplierNcf: 'E320000000102', document: 'TKT-5501', category: 'Alimentación', center: 'Ventas', person: 'María López', taxable: 2542.37, exempt: 0, itbisRate: 18, itbisAmount: 457.63, total: 3000, payment: 'Efectivo', concept: 'Almuerzo con clientes potenciales', notes: 'Gestión comercial', status: 'Aceptado', trackId: 'TRK89012', securityCode: 'SEC89B2C', eNcf: 'E430000000002' },
      { id: 4, voucher: 'GME-2600004', date: new Date(Date.now()-86400000*10).toISOString().slice(0,10), supplier: 'DHL Express', rnc: '201234567', supplierNcf: 'E310000000203', document: 'ENV-9091', category: 'Transporte', center: 'Logística', person: 'Luis Rosa', taxable: 1440.68, exempt: 0, itbisRate: 18, itbisAmount: 259.32, total: 1700, payment: 'Transferencia', concept: 'Envío de documentos y mercancía a Santiago', notes: '', status: 'Aceptado', trackId: 'TRK90234', securityCode: 'SEC90C3D', eNcf: 'E430000000003' },
      { id: 5, voucher: 'GME-2600005', date: new Date(Date.now()-86400000*8).toISOString().slice(0,10), supplier: 'Hotel Jaragua', rnc: '302010010', supplierNcf: 'E310000000304', document: 'HTL-1102', category: 'Hospedaje', center: 'Ventas', person: 'Pedro Méndez', taxable: 7627.12, exempt: 0, itbisRate: 18, itbisAmount: 1372.88, total: 9000, payment: 'Tarjeta crédito', concept: 'Estancia 3 noches por visita a clientes del Norte', notes: '', status: 'Borrador' },
      { id: 6, voucher: 'GME-2600006', date: new Date(Date.now()-86400000*6).toISOString().slice(0,10), supplier: 'Claro Dominicana', rnc: '104582739', supplierNcf: 'E310000000405', document: 'TEL-202609', category: 'Comunicaciones', center: 'Administración', person: 'Ana Pérez', taxable: 2372.88, exempt: 0, itbisRate: 18, itbisAmount: 427.12, total: 2800, payment: 'Transferencia', concept: 'Plan de datos corporativos y telefonía', notes: '', status: 'Enviado', trackId: 'TRK91567' },
      { id: 7, voucher: 'GME-2600007', date: new Date(Date.now()-86400000*4).toISOString().slice(0,10), supplier: 'Agencias de Viajes Punta Cana', rnc: '122987123', supplierNcf: '', document: 'VIA-4566', category: 'Viáticos', center: 'Mercadeo', person: 'Pedro Méndez', taxable: 0, exempt: 5500, itbisRate: 0, itbisAmount: 0, total: 5500, payment: 'Tarjeta crédito', concept: 'Boleto aéreo a Punta Cana para feria comercial', notes: 'Pasaje exento ITBIS', status: 'Rechazado' },
      { id: 8, voucher: 'GME-2600008', date: new Date(Date.now()-86400000*3).toISOString().slice(0,10), supplier: 'Mantenimiento Express SRL', rnc: '131111009', supplierNcf: 'E310000000506', document: 'MAN-881', category: 'Mantenimiento', center: 'Operaciones', person: 'José Soto', taxable: 3305.08, exempt: 0, itbisRate: 18, itbisAmount: 594.92, total: 3900, payment: 'Cheque', concept: 'Mantenimiento preventivo de aires acondicionados de oficina', notes: '', status: 'Aceptado', trackId: 'TRK92678', securityCode: 'SEC92D4E', eNcf: 'E430000000004' },
      { id: 9, voucher: 'GME-2600009', date: new Date(Date.now()-86400000*2).toISOString().slice(0,10), supplier: 'DGII - Impuestos', rnc: '-', supplierNcf: '-', document: 'IMP-202609', category: 'Impuestos y tasas', center: 'Administración', person: 'Ana Pérez', taxable: 0, exempt: 6200, itbisRate: 0, itbisAmount: 0, total: 6200, payment: 'Transferencia', concept: 'Pago de ITBIS retenido y tasa municipal mensual', notes: 'Transacción sin factura fiscal', status: 'Borrador' },
      { id: 10, voucher: 'GME-2600010', date: new Date(Date.now()-86400000).toISOString().slice(0,10), supplier: 'Estudio Jurídico Asociados', rnc: '117000442', supplierNcf: 'E310000000607', document: 'LEG-3318', category: 'Servicios profesionales', center: 'Administración', person: 'Ana Pérez', taxable: 10169.49, exempt: 0, itbisRate: 18, itbisAmount: 1830.51, total: 12000, payment: 'Transferencia', concept: 'Asesoría legal y revisión de contratos comerciales', notes: 'Factura quincenal', status: 'Borrador' }
    ];
    this.minorExpenses = [...demo];
    this.nextMinorId = 11;
  }
  clearMinorExpense(): void {
    this.expense = { voucher: '', date: new Date().toISOString().slice(0, 10), supplier: '', rnc: '', supplierNcf: '', document: '', category: 'Otros gastos', center: 'Administración', person: '', taxable: 0, exempt: 0, itbisRate: 18, payment: 'Efectivo', concept: '', notes: '', status: 'Borrador' };
    this.editingMinorExpenseId = null;
    this.minorMode = 'create';
  }
  saveMinorExpense(): void {
    if (!this.expense.supplier.trim()) { this.message = 'Completa el suplidor.'; return; }
    if (!this.expense.category || !this.minorCategories.includes(this.expense.category)) { this.message = 'Selecciona una categoría.'; return; }
    if (!this.expense.concept.trim()) { this.message = 'Completa el concepto o descripción del gasto.'; return; }
    if (this.minorTotal <= 0) { this.message = 'El gasto no tiene monto válido. Ingresa un monto gravable o exento.'; return; }
    if (this.editingMinorExpenseId && !window.confirm('Se actualizará este gasto. ¿Deseas guardar los cambios?')) return;
    const tax = this.minorItbisAmount;
    const total = this.minorTotal;
    if (this.editingMinorExpenseId) {
      const idx = this.minorExpenses.findIndex((m) => m.id === this.editingMinorExpenseId);
      if (idx >= 0) {
        const m = this.minorExpenses[idx];
        this.minorExpenses[idx] = { ...m, ...this.expense, itbisAmount: tax, total };
      }
      this.message = `Gasto ${this.expense.voucher} actualizado correctamente.`;
    } else {
      const id = this.nextMinorId++;
      const voucher = this.expense.voucher.trim() || this.nextMinorVoucher();
      const record: MinorExpenseRecord = { id, ...this.expense, voucher, itbisAmount: tax, total };
      this.minorExpenses.unshift(record);
      this.editingMinorExpenseId = id;
      this.message = `Gasto ${voucher} guardado correctamente.`;
    }
    this.minorMode = 'edit';
  }
  loadMinorExpenseInForm(m: MinorExpenseRecord, mode: 'view' | 'edit'): void {
    this.expense = {
      voucher: m.voucher, date: m.date, supplier: m.supplier, rnc: m.rnc, supplierNcf: m.supplierNcf, document: m.document,
      category: m.category, center: m.center, person: m.person,
      taxable: m.taxable, exempt: m.exempt, itbisRate: m.itbisRate, payment: m.payment,
      concept: m.concept, notes: m.notes, status: m.status
    };
    this.editingMinorExpenseId = mode === 'edit' ? m.id : null;
    this.minorMode = mode;
    this.minorTab = 'create';
    this.message = mode === 'view' ? `Visualizando gasto ${m.voucher}.` : `Editando gasto ${m.voucher}.`;
  }
  async deleteMinorExpense(m: MinorExpenseRecord): Promise<void> {
    if (!window.confirm(`¿Estás seguro que deseas eliminar el gasto ${m.voucher} (${m.supplier})? Esta acción no se puede deshacer.`)) return;
    try {
      await this.minorExpensesService.delete(m.id);
      if (this.editingMinorExpenseId === m.id) this.clearMinorExpense();
      this.message = `Gasto ${m.voucher} eliminado.`;
      await this.loadMinorData();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo eliminar el gasto menor.';
    }
  }
  getMinorStatusColor(status: MinorExpenseStatus): string {
    switch (status) {
      case 'Aceptado': return '#059669';
      case 'Aceptado condicional': return '#0891b2';
      case 'Enviado':  return '#2563eb';
      case 'Borrador': return '#64748b';
      case 'Rechazado':return '#dc2626';
      case 'Error': return '#dc2626';
    }
  }

  addCreditLine(): void { this.creditLines.push({ description: '', quantity: 1, price: 0, discount: 0, itbis: 18, priceIncludesItbis: false }); }
  removeCreditLine(index: number): void { if (this.creditLines.length > 1) this.creditLines.splice(index, 1); }
  clearCreditNote(): void {
    this.credit = { invoiceId: null, invoice: '', encf: '', affectedDate: '', rnc: '', customer: '', email: '', address: '', noteNumber: '', noteEncf: '', date: new Date().toISOString().slice(0, 10), expiry: '', modificationCode: '3 - Corrige montos del e-CF', incomeType: '01 - Ingresos por operaciones', payment: 'Contado', reason: '', internalNotes: '', amount: 0 };
    this.creditLines = [{ description: '', quantity: 1, price: 0, discount: 0, itbis: 18, priceIncludesItbis: false }];
    this.lastSavedCreditNoteId = null;
    this.editingCreditNoteId = null;
    this.creditMode = 'create';
    this.creditDgii = { status: 'Sin enviar', trackId: '-', securityCode: '-' };
  }
  onCreditInvoiceChange(): void { this.credit.invoiceId = null; this.lastSavedCreditNoteId = null; }
  async searchCreditInvoice(event?: Event): Promise<void> {
    event?.preventDefault();
    const number = this.credit.invoice.trim();
    if (!number) {
      this.message = 'Introduce un número de factura para buscar.';
      return;
    }
    try {
      const invoice = await this.creditNotesService.getInvoiceByNumber(number);
      if (!invoice) {
        this.message = `La factura ${number} no existe o no pertenece a la empresa actual.`;
        return;
      }
      this.credit.invoiceId = invoice.id;
      this.credit.invoice = invoice.number;
      this.credit.encf = invoice.encf;
      this.credit.affectedDate = invoice.date;
      this.credit.rnc = invoice.rnc;
      this.credit.customer = invoice.customer;
      this.credit.email = invoice.email;
      this.credit.address = invoice.address;
      this.credit.payment = invoice.payment === 'Credito' ? 'Crédito' : 'Contado';
      this.creditLines = invoice.lines.length ? invoice.lines.map((line) => ({ description: line.description, quantity: line.quantity, price: line.price, discount: 0, itbis: line.itbis, priceIncludesItbis: true })) : [{ description: '', quantity: 1, price: 0, discount: 0, itbis: 18, priceIncludesItbis: false }];
      this.message = `Factura ${invoice.number} cargada con ${invoice.lines.length} detalle(s). Los precios ya incluyen ITBIS y se detallarán sin volver a sumar.`;
    } catch (error) {
      this.message = error instanceof Error ? `No se pudo buscar la factura. ${error.message}` : 'No se pudo buscar la factura.';
    }
  }
  async saveCreditNote(): Promise<{ id: number; number: string } | null> {
    if (this.isSavingCreditNote || this.creditMode === 'view') return null;
    if (!this.credit.invoice.trim() || !this.credit.encf.trim() || !this.credit.reason.trim() || this.creditLines.some((line) => !line.description.trim() || line.quantity <= 0)) {
      this.message = 'Completa la factura afectada, e-NCF afectado y motivo antes de guardar.';
      return null;
    }
    this.isSavingCreditNote = true;
    try {
      const payload = {
        invoiceId: this.credit.invoiceId, invoice: this.credit.invoice, encfAffected: this.credit.encf, affectedDate: this.credit.affectedDate, rnc: this.credit.rnc, customer: this.credit.customer, email: this.credit.email, address: this.credit.address, noteEncf: this.credit.noteEncf, date: this.credit.date, expiry: this.credit.expiry, modificationCode: this.credit.modificationCode, incomeType: this.credit.incomeType, payment: this.credit.payment, reason: this.credit.reason, internalNotes: this.credit.internalNotes, subtotal: this.creditLineTotal, discounts: this.creditDiscountTotal, itbis: this.creditItbisTotal, total: this.creditGrandTotal,
        lines: this.creditLines.map((line) => {
          const lineTaxable = this.getLineTaxable(line);
          const lineTax = this.getLineTax(line);
          const unitPrice = lineTaxable / Math.max(1, line.quantity);
          return { description: line.description.trim(), quantity: line.quantity, price: unitPrice, discount: line.discount, itbis: line.itbis, taxAmount: lineTax, lineTotal: lineTaxable };
        })
      };
      if (this.editingCreditNoteId && !window.confirm('Se actualizarán los datos de la nota y se reemplazarán sus líneas de detalle actuales. ¿Deseas guardar los cambios?')) return null;
      const saved = this.editingCreditNoteId ? await this.creditNotesService.updateCreditNote(this.editingCreditNoteId, payload) : await this.creditNotesService.createCreditNote(payload);
      this.credit.noteNumber = saved.number;
      this.lastSavedCreditNoteId = saved.id;
      this.message = `Nota de crédito ${saved.number} ${this.editingCreditNoteId ? 'actualizada' : 'guardada'} correctamente.`;
      await this.loadCreditNotes();
      return saved;
    } catch (error) {
      this.message = error instanceof Error ? `No se pudo guardar la nota de crédito. ${error.message}` : 'No se pudo guardar la nota de crédito.';
      return null;
    } finally {
      this.isSavingCreditNote = false;
    }
  }

  async sendCreditNote(): Promise<void> {
    if (this.isSavingCreditNote || this.isSendingCreditNote) return;
    let creditNoteId = this.lastSavedCreditNoteId;
    if (!creditNoteId) {
      const saved = await this.saveCreditNote();
      if (!saved) return;
      creditNoteId = saved.id;
    }

    this.isSendingCreditNote = true;
    this.message = 'Enviando la nota de crédito a DGII...';
    try {
      const result = await this.ecfService.sendCreditNote(creditNoteId);
      this.credit.noteEncf = result.encf;
      this.creditDgii = {
        status: result.dgii_estado || 'Enviado',
        trackId: result.dgii_track_id || '-',
        securityCode: result.dgii_codigo_seguridad || '-'
      };
      this.message = result.dgii_mensaje_respuesta || `Nota de crédito ${this.credit.noteNumber} enviada a DGII.`;
      await this.loadCreditNotes();
    } catch (error) {
      this.creditDgii.status = 'Error';
      this.message = error instanceof Error ? error.message : 'No se pudo enviar la nota de crédito a DGII.';
    } finally {
      this.isSendingCreditNote = false;
    }
  }
}
