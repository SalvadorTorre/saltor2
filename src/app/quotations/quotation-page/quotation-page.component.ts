import { Component, Input, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Quotation, QuotationLine, QuotationsService } from '../../core/services/quotations/quotations.service';
import { AppDataService } from '../../app-data.service';
import { ClientRecord, ProductRecord, RncRecord, UserRecord } from '../../app.models';
import { ClientsService } from '../../core/services/clients/clients.service';
import { ProductsService } from '../../core/services/products/products.service';
import { RncService } from '../../core/services/rnc/rnc.service';
import { UsersService } from '../../core/services/users/users.service';
import { QzPrintService } from '../../core/services/printing/qz-print.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { CompanyPrintSettingsService } from '../../core/services/printing/company-print-settings.service';
import { CompaniesService } from '../../core/services/companies/companies.service';
import Swal from 'sweetalert2';

@Component({ selector: 'app-quotation-page', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './quotation-page.component.html', styleUrls: ['./quotation-page.component.scss'] })
export class QuotationPageComponent implements OnInit {
  @Input() transactionQuotation = false;
  private readonly router = inject(Router);
  tab: 'create' | 'consult' = 'create';
  editingId: number | null = null;
  isReadOnly = false;
  private _message = '';
  get message(): string { return this._message; }
  set message(value: string) {
    this._message = value;
    if (!value || !this.transactionQuotation) return;
    const isError = /no se pudo|inválid|incorrect|obligatori|completa|demasiados|no existe/i.test(value);
    void Swal.fire({ icon: isError ? 'error' : 'info', title: isError ? 'Información requerida' : 'Información', text: value, confirmButtonText: 'OK' });
  }
  quotes: Quotation[] = [];
  search = '';
  statusFilter = 'Todas';
  readonly statusFilters = ['Todas', 'Borrador', 'Facturada'];
  quoteStatus = 'Borrador';
  validityDays = 15;
  taxRate = 18;
  quotationUserCode = '';
  quotationUserName = '';
  private quotationUserLookupVersion = 0;
  isRncInvalid = false;
  editingLineIndex: number | null = null;
  lineEditor = { code: '', description: '', quantity: 1, price: 0 };
  lineEditorMessage = '';
  productSuggestionField: 'code' | 'name' | null = null;
  activeProductSuggestionIndex = 0;
  quote = this.emptyQuote();
  constructor(
    private readonly quotations: QuotationsService,
    public readonly data: AppDataService,
    private readonly clientsService: ClientsService,
    private readonly productsService: ProductsService,
    private readonly rncService: RncService,
    private readonly usersService: UsersService,
    private readonly qzPrintService: QzPrintService,
    private readonly printSettings: CompanyPrintSettingsService,
    private readonly auth: AuthService,
    private readonly companiesService: CompaniesService
  ) {}
  ngOnInit(): void { void this.load(); void this.loadClients(); void this.loadProducts(); void this.loadRncRecords(); void this.loadUsers(); }
  emptyQuote() { return { number: '', date: new Date().toISOString().slice(0, 10), validUntil: '', customer: '', rnc: '', phone: '', email: '', address: '', notes: '', lines: [] as Omit<QuotationLine, 'total'>[] }; }
  get clients(): ClientRecord[] { return this.data.clients; }
  get products(): ProductRecord[] { return this.data.products; }
  get users(): UserRecord[] { return this.data.users; }
  get filteredRncClients(): ClientRecord[] { const value = this.quote.rnc.trim().toLowerCase(); return this.clients.filter((client) => !value || client.documentNumber.toLowerCase().includes(value)).slice(0, 50); }
  get filteredRncRecords(): RncRecord[] { const value = this.quote.rnc.trim().toLowerCase(); return value ? this.data.rncRecords.filter((record) => record.rnc.toLowerCase().includes(value)).slice(0, 50) : []; }
  get filteredCustomerClients(): ClientRecord[] { const value = this.quote.customer.trim().toLowerCase(); return this.clients.filter((client) => !value || [client.fullName, client.documentNumber, client.companyName ?? ''].some((item) => item.toLowerCase().includes(value))).slice(0, 50); }
  get productSuggestions(): ProductRecord[] {
    const value = (this.productSuggestionField === 'code' ? this.lineEditor.code : this.lineEditor.description).trim().toLocaleLowerCase();
    if (!value) return [];
    const sortByDescription = (products: ProductRecord[]) => products
      .sort((a, b) => a.description.localeCompare(b.description, 'es', { sensitivity: 'base' }))
      .slice(0, 8);
    if (this.productSuggestionField === 'code') {
      return sortByDescription(this.products.filter((product) => product.code.trim().toLocaleLowerCase().startsWith(value)));
    }
    const startsWith = this.products.filter((product) => this.getProductFullDescription(product).toLocaleLowerCase().startsWith(value));
    return sortByDescription(startsWith.length ? startsWith : this.products.filter((product) => this.getProductFullDescription(product).toLocaleLowerCase().includes(value)));
  }
  get lineEditorTotal(): number { return this.round2(Number(this.lineEditor.quantity || 0) * Number(this.lineEditor.price || 0) * (1 + this.taxRate / 100)); }
  get subtotal() { return this.quote.lines.reduce((sum, line) => sum + line.quantity * line.price, 0); }
  get tax() { return this.quote.lines.reduce((sum, line) => sum + line.quantity * line.price * line.itbis / 100, 0); }
  get total() { return this.subtotal + this.tax; }
  get filtered() {
    const value = this.search.toLowerCase().trim();
    return this.quotes.filter((quote) => {
      const matchesSearch = !value || [quote.number, quote.customer, quote.rnc, quote.email].join(' ').toLowerCase().includes(value);
      return matchesSearch && (this.statusFilter === 'Todas' || this.displayStatus(quote.status) === this.statusFilter);
    });
  }
  displayStatus(status: string): string { return status?.toLowerCase() === 'activa' ? 'Borrador' : (status || 'Borrador'); }
  statusClass(status: string): string {
    const value = this.displayStatus(status).toLowerCase();
    if (value.includes('factur')) return 'status--accepted';
    if (value.includes('rechaz')) return 'status--rejected';
    if (value.includes('envi') || value.includes('activ')) return 'status--sent';
    return 'status--draft';
  }
  newQuotation() { this.reset(); this.tab = 'create'; this.quoteStatus = 'Borrador'; this.validityDays = 15; this.taxRate = 18; this.updateValidUntil(); }
  backToList() { this.tab = 'consult'; this.message = ''; }
  updateValidUntil() {
    if (!this.quote.date || this.validityDays === null || this.validityDays === undefined) return;
    const date = new Date(`${this.quote.date}T12:00:00`);
    date.setDate(date.getDate() + Math.max(0, Number(this.validityDays) || 0));
    this.quote.validUntil = date.toISOString().slice(0, 10);
  }
  applyTaxRate() { this.quote.lines.forEach((line) => line.itbis = Number(this.taxRate) || 0); }
  reset() { this.quote = this.emptyQuote(); this.editingId = null; this.isReadOnly = false; this.message = ''; this.isRncInvalid = false; this.quotationUserCode = ''; this.quotationUserName = ''; this.quotationUserLookupVersion += 1; this.resetLineEditor(); }
  onQuoteRncChange(showMessage = false): void {
    const rnc = this.quote.rnc.trim();
    if (!rnc) { this.isRncInvalid = false; this.clearCustomerContact(); return; }
    const client = this.clients.find((item) => item.documentNumber.trim().toLowerCase() === rnc.toLowerCase());
    if (client) { this.populateClient(client); this.isRncInvalid = false; if (showMessage) this.message = `Cliente registrado: ${client.fullName} (RNC ${client.documentNumber}).`; return; }
    const record = this.data.rncRecords.find((item) => item.rnc.trim().toLowerCase() === rnc.toLowerCase());
    if (record) { this.quote.customer = record.tradeName?.trim() || record.legalName; this.quote.rnc = record.rnc; this.quote.phone = record.phone ?? ''; this.quote.email = record.email ?? ''; this.quote.address = record.address ?? ''; this.isRncInvalid = false; if (showMessage) this.message = `RNC registrado: ${record.legalName} (${record.rnc}).`; return; }
    this.clearCustomerContact(); this.isRncInvalid = true; if (showMessage) this.message = 'RNC inválido. Debe estar registrado en Clientes o en el catálogo RNC.';
  }
  async onQuoteRncEnter(event: Event): Promise<void> {
    event.preventDefault();
    this.onQuoteRncChange(false);
    if (this.isRncInvalid) {
      try {
        const result = await this.rncService.lookup(this.quote.rnc);
        const record: RncRecord = {
          id: 0, rnc: result.rnc, legalName: result.legalName, tradeName: result.tradeName,
          category: result.category, address: result.address, phone: result.phone, email: result.email,
          dgiiStatus: result.dgiiStatus, syncStatus: 'Sincronizado', lastCheck: new Date().toISOString()
        };
        this.data.rncRecords = [record, ...this.data.rncRecords.filter((item) => item.rnc !== record.rnc)];
        this.quote.customer = record.tradeName || record.legalName;
        this.quote.rnc = record.rnc;
        this.quote.phone = record.phone;
        this.quote.email = record.email;
        this.quote.address = record.address;
        this.isRncInvalid = false;
        this.message = `RNC consultado en Megaplus: ${record.legalName}.`;
      } catch (error) {
        this.message = error instanceof Error ? error.message : 'No se pudo consultar el RNC.';
        return;
      }
    }
    this.focusEditorField('quotationCustomer');
  }
  onQuoteCustomerChange(): void {
    const value = this.quote.customer.trim().toLowerCase();
    const client = this.clients.find((item) => [item.fullName, item.documentNumber, item.companyName ?? ''].some((text) => text.trim().toLowerCase() === value));
    if (client) { this.populateClient(client); this.isRncInvalid = false; }
  }
  onQuoteCustomerEnter(event: Event): void { event.preventDefault(); const client = this.filteredCustomerClients[0]; if (client) { this.populateClient(client); this.isRncInvalid = false; } this.focusEditorField('quotationAddress'); }
  getProductFullDescription(product: ProductRecord): string { return [product.description, product.brand, product.type, product.size].filter(Boolean).join(' - '); }
  isActiveProductSuggestion(index: number): boolean { return index === this.activeProductSuggestionIndex; }
  onQuoteProductCodeChange(): void {
    this.lineEditorMessage = ''; this.productSuggestionField = 'code'; this.activeProductSuggestionIndex = 0;
    const product = this.products.find((item) => item.code.trim().toLowerCase() === this.lineEditor.code.trim().toLowerCase());
    if (product) this.selectProduct(product, false); else { this.lineEditor.description = ''; this.lineEditor.price = 0; }
  }
  onQuoteProductNameChange(): void {
    this.lineEditorMessage = ''; this.productSuggestionField = 'name'; this.activeProductSuggestionIndex = 0;
    const value = this.lineEditor.description.trim().toLowerCase();
    const product = this.products.find((item) => this.getProductFullDescription(item).toLowerCase() === value || item.code.trim().toLowerCase() === value);
    if (product) this.selectProduct(product, false); else { this.lineEditor.code = ''; this.lineEditor.price = 0; }
  }
  onQuoteProductCodeEnter(event: Event): void { event.preventDefault(); if (!this.lineEditor.code.trim()) { this.closeProductSuggestions(); this.focusEditorField('quotationLineDescription'); return; } if (this.selectActiveProductSuggestion()) this.focusEditorField('quotationLineQuantity'); else this.lineEditorMessage = `El código "${this.lineEditor.code.trim()}" no existe. Selecciona un producto de la lista.`; }
  onQuoteProductNameEnter(event: Event): void { event.preventDefault(); if (this.selectActiveProductSuggestion()) this.focusEditorField('quotationLineQuantity'); else this.lineEditorMessage = `El producto "${this.lineEditor.description.trim()}" no existe. Selecciona un producto de la lista.`; }
  onProductSuggestionKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent) || event.key === 'Enter') return;
    if (event.key === 'Escape') { this.closeProductSuggestions(); return; }
    const suggestions = this.productSuggestions;
    if (!suggestions.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    this.activeProductSuggestionIndex = (this.activeProductSuggestionIndex + direction + suggestions.length) % suggestions.length;
  }
  onProductSuggestionFocus(field: 'code' | 'name'): void { this.productSuggestionField = field; this.activeProductSuggestionIndex = 0; }
  onProductSuggestionBlur(): void {
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLInputElement) || !['quotationLineCode', 'quotationLineDescription'].includes(activeElement.id)) this.closeProductSuggestions();
    }, 120);
  }
  selectProductSuggestion(product: ProductRecord): void { this.selectProduct(product); }
  private selectActiveProductSuggestion(): boolean { const product = this.productSuggestions[this.activeProductSuggestionIndex]; if (!product) return false; this.selectProduct(product); return true; }
  onQuotationUserCodeChange(): void {
    this.quotationUserName = '';
    this.quotationUserLookupVersion += 1;
  }
  async onQuotationUserCodeEnter(event: Event): Promise<void> {
    event.preventDefault();
    const code = this.quotationUserCode.trim();
    const found = code ? await this.lookupQuotationUser(code) : false;
    if (!found) {
      if (!this.message) this.message = code ? 'No se pudo validar la clave.' : 'La clave de usuario es obligatoria.';
      this.focusEditorField('quotationUserCode');
      return;
    }
    this.focusEditorField('quotationLineCode');
  }
  private async lookupQuotationUser(code: string): Promise<boolean> {
    const version = ++this.quotationUserLookupVersion;
    try {
      this.message = '';
      const name = await this.quotations.validateUserKey(code);
      if (version !== this.quotationUserLookupVersion || code !== this.quotationUserCode.trim()) return false;
      this.quotationUserName = name;
      return true;
    } catch (error) {
      if (version === this.quotationUserLookupVersion) { this.quotationUserName = ''; this.message = error instanceof Error ? error.message : 'No se pudo validar la clave.'; }
      return false;
    }
  }
  focusEditorField(eventOrId: Event | string, nextFieldId?: string): void {
    if (eventOrId instanceof Event) eventOrId.preventDefault();
    const fieldId = typeof eventOrId === 'string' ? eventOrId : nextFieldId;
    if (!fieldId) return;
    setTimeout(() => document.getElementById(fieldId)?.focus());
  }
  selectFieldValue(event: FocusEvent): void { setTimeout(() => (event.target as HTMLInputElement | null)?.select()); }
  addQuotationLine(event?: Event): void {
    event?.preventDefault();
    if (!this.lineEditor.description.trim() || Number(this.lineEditor.quantity) <= 0 || Number(this.lineEditor.price) < 0) { this.lineEditorMessage = 'Completa producto, cantidad y precio para agregar la línea.'; return; }
    const line = { code: this.lineEditor.code.trim(), description: this.lineEditor.description.trim(), quantity: Number(this.lineEditor.quantity), price: Number(this.lineEditor.price), itbis: Number(this.taxRate) || 0 };
    if (this.editingLineIndex === null) this.quote.lines.push(line); else this.quote.lines[this.editingLineIndex] = line;
    this.resetLineEditor();
    this.focusEditorField('quotationLineCode');
  }
  editQuotationLine(index: number): void { const line = this.quote.lines[index]; if (!line) return; this.editingLineIndex = index; this.lineEditor = { code: line.code, description: line.description, quantity: line.quantity, price: line.price }; this.focusEditorField('quotationLineQuantity'); }
  removeQuotationLine(index: number): void { this.quote.lines.splice(index, 1); if (this.editingLineIndex === index) this.resetLineEditor(); }
  private resetLineEditor(): void { this.editingLineIndex = null; this.lineEditor = { code: '', description: '', quantity: 1, price: 0 }; this.lineEditorMessage = ''; this.closeProductSuggestions(); }
  private selectProduct(product: ProductRecord, closeSuggestions = true): void { this.lineEditor = { ...this.lineEditor, code: product.code, description: this.getProductFullDescription(product), price: Number(product.salePrice ?? 0) }; this.lineEditorMessage = ''; if (closeSuggestions) this.closeProductSuggestions(); }
  private closeProductSuggestions(): void { this.productSuggestionField = null; this.activeProductSuggestionIndex = 0; }
  private populateClient(client: ClientRecord): void { this.quote.customer = client.fullName; this.quote.rnc = client.documentType === 'RNC' ? client.documentNumber : this.quote.rnc; this.quote.phone = client.phone ?? ''; this.quote.email = client.email ?? ''; this.quote.address = client.address ?? ''; }
  private clearCustomerContact(): void { this.quote.customer = ''; this.quote.phone = ''; this.quote.email = ''; this.quote.address = ''; }
  private round2(value: number): number { return Math.round((Number(value) || 0) * 100) / 100; }
  private async loadClients(): Promise<void> { try { const clients = await this.clientsService.getClients(); if (clients.length) this.data.clients = clients; } catch {} }
  private async loadProducts(): Promise<void> { try { const products = await this.productsService.getProducts(); if (products.length) this.data.products = products; } catch {} }
  private async loadRncRecords(): Promise<void> { try { const records = await this.rncService.getRecords(); if (records.length) this.data.rncRecords = records; } catch {} }
  private async loadUsers(): Promise<void> { try { const session = this.auth.currentUser ?? await this.auth.restoreSession(); if (session) this.data.users = await this.usersService.getUsers(session.companyId); } catch {} }
  async load() { try { this.quotes = await this.quotations.list(); } catch (error) { this.message = error instanceof Error ? error.message : 'No se pudieron cargar las cotizaciones.'; } }
  private payload(): Omit<Quotation, 'id' | 'number'> { return { date: this.quote.date, validUntil: this.quote.validUntil, customer: this.quote.customer.trim(), rnc: this.quote.rnc.trim(), phone: this.quote.phone.trim(), email: this.quote.email.trim(), address: this.quote.address.trim(), notes: this.quote.notes.trim(), subtotal: this.subtotal, itbis: this.tax, total: this.total, status: this.quoteStatus, lines: this.quote.lines.map((line) => ({ ...line, code: line.code.trim(), description: line.description.trim(), quantity: Number(line.quantity), price: Number(line.price), itbis: Number(line.itbis), total: Number(line.quantity) * Number(line.price) * (1 + Number(line.itbis) / 100) })) }; }
  async save() { if (this.isReadOnly) return; const validUser = !this.transactionQuotation || Boolean(this.quotationUserCode.trim() && this.quotationUserName); if (this.isRncInvalid || !validUser || !this.quote.customer.trim() || !this.quote.lines.length || this.quote.lines.some((line) => !line.description.trim() || line.quantity <= 0)) { this.message = this.isRncInvalid ? 'RNC inválido. Regístralo en Clientes o en el catálogo RNC antes de guardar.' : !validUser ? 'Indica un código de usuario activo antes de guardar.' : 'Completa el cliente y agrega al menos un producto antes de guardar.'; return; } try { const payload = this.payload(); if (this.editingId) { if (!window.confirm('Se reemplazarán las líneas actuales de la cotización. ¿Deseas guardar los cambios?')) return; await this.quotations.update(this.editingId, payload); this.message = 'Cotización actualizada correctamente.'; } else { const saved = await this.quotations.create(payload); this.quote.number = saved.number; this.editingId = saved.id; this.quoteStatus = 'Borrador'; this.message = `Cotización ${saved.number} creada correctamente.`; } await this.load(); } catch (error) { this.message = error instanceof Error ? error.message : 'No se pudo guardar la cotización.'; } }
  async edit(item: Quotation) {
    const detail = await this.quotations.get(item.id);
    if (!detail) return;
    this.openQuotation(detail, false);
  }
  async view(item: Quotation): Promise<void> {
    const detail = await this.quotations.get(item.id);
    if (!detail) return;
    this.openQuotation(detail, true);
  }
  private openQuotation(detail: Quotation, readOnly: boolean): void {
    this.editingId = detail.id;
    this.quote = { number: detail.number, date: detail.date, validUntil: detail.validUntil, customer: detail.customer, rnc: detail.rnc, phone: detail.phone, email: detail.email, address: detail.address, notes: detail.notes, lines: detail.lines.map(({ total, ...line }) => line) };
    this.quoteStatus = this.displayStatus(detail.status);
    this.isReadOnly = readOnly;
    this.taxRate = Number(detail.lines[0]?.itbis ?? 18);
    if (detail.validUntil) this.validityDays = Math.max(0, Math.round((new Date(`${detail.validUntil}T12:00:00`).getTime() - new Date(`${detail.date}T12:00:00`).getTime()) / 86400000));
    this.tab = 'create';
    this.message = readOnly ? `Consultando ${detail.number}.` : `Editando ${detail.number}.`;
  }
  async convert(item: Quotation): Promise<void> {
    if (this.transactionQuotation && item.orderNumber) { this.message = `Esta cotización ya fue convertida en la orden ${item.orderNumber}.`; return; }
    if (!this.transactionQuotation && this.displayStatus(item.status) === 'Facturada') { this.message = 'Esta cotización ya fue convertida en factura.'; return; }
    const detail = await this.quotations.get(item.id);
    if (!detail) return;
    try {
      if (!this.transactionQuotation) await this.quotations.markAsInvoiced(detail.id);
      sessionStorage.setItem('saltor.quotationInvoiceDraft', JSON.stringify(detail));
      await this.load();
      // El mismo borrador puede continuar como factura o como orden de venta.
      await this.router.navigateByUrl(this.transactionQuotation ? '/transacciones/orden-venta' : '/facturacion');
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo convertir la cotización en factura.';
    }
  }
  async print(item: Quotation) {
    let q: Quotation | null;
    try {
      q = await this.quotations.get(item.id);
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo cargar la cotización para imprimir.';
      return;
    }
    if (!q) {
      this.message = 'No se encontró la cotización seleccionada para imprimir.';
      return;
    }
    const session = await this.auth.restoreSession();
    const seller = session?.fullName ?? this.data.userName;
    let company = this.data.companies.find((item) => item.id === session?.companyId) ?? null;
    try {
      const companies = await this.companiesService.getCompanies();
      company = companies.find((item) => item.id === session?.companyId) ?? company;
    } catch {
      // Si el listado no está disponible, se conserva la empresa de la sesión cargada en memoria.
    }
    let isHalfLetter = false;
    try {
      isHalfLetter = await this.printSettings.getPaper() === 'media_carta';
    } catch {
      // La impresión debe seguir disponible aunque no pueda leerse la preferencia.
      isHalfLetter = false;
    }
    const formatAmount = (value: number): string => Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const thermalRows = q.lines.map((line) => {
      const itbis = line.total - (line.quantity * line.price);
      return `<tr><td><b>${this.e(line.description)}</b><br><small>${formatAmount(line.quantity)} x ${formatAmount(line.price)} &nbsp; ITBIS ${formatAmount(itbis)} &nbsp; VALOR ${formatAmount(line.total)}</small></td></tr>`;
    }).join('');
    const halfLetterRows = q.lines.map((line) => {
      const itbis = line.total - (line.quantity * line.price);
      return `<tr><td><b>${this.e(line.description)}</b><br><span>${formatAmount(line.quantity)} x ${formatAmount(line.price)} &nbsp; ITBIS ${formatAmount(itbis)} &nbsp; VALOR ${formatAmount(line.total)}</span></td></tr>`;
    }).join('');
    const companyName = [session?.companyName, company?.tradeName, company?.legalName, this.data.companyName, 'SALTOR SYSTEM']
      .map((value) => String(value ?? '').trim())
      .find(Boolean) as string;
    const thermalHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Cotización ${this.e(q.number)}</title><style>
      @page { size:80mm auto; margin:0; } * { box-sizing:border-box; } body { color:#111; font:11px Arial,sans-serif; margin:0; width:80mm; } .print-document { padding:4mm; width:80mm; } .center{text-align:center}.logo{display:block;max-width:42mm;max-height:22mm;object-fit:contain;margin:0 auto 4px}h1{font-size:14px;margin:0 0 3px} p{margin:3px 0}.rule{border-top:1px dashed #111;margin:5px 0}.doc span{display:inline-block;min-width:72px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px dashed #777;padding:4px 1px;text-align:left;vertical-align:top;font-size:10px}small{font-size:9px;white-space:nowrap}.total p{display:flex;justify-content:space-between}.grand{font-size:14px;font-weight:700}
    </style></head><body><main class="print-document"><section class="center">${company?.logoUrl ? `<img class="logo" src="${this.e(company.logoUrl)}" alt="">` : ''}<h1>${this.e(companyName)}</h1><p>RNC: ${this.e(company?.rnc || '')}</p><p>${this.e(company?.address || '')}</p><p>Tel.: ${this.e(company?.phone || '')}</p></section><div class="rule"></div><section class="doc"><p class="center"><b>COTIZACIÓN ${this.e(q.number)}</b></p><p><span>Fecha:</span>${q.date}</p><p>Cliente: ${this.e(q.customer)}</p><p>RNC/Cédula: ${this.e(q.rnc || 'N/D')}</p><p>Dirección: ${this.e(q.address || 'N/D')}</p><p>Teléfono: ${this.e(q.phone || 'N/D')}</p><p>Vendedor: ${this.e(seller)}</p></section><div class="rule"></div><table><thead><tr><th>DESCRIPCIÓN</th></tr></thead><tbody>${thermalRows}</tbody></table><div class="rule"></div><section class="total"><p><span>Subtotal</span><b>${formatAmount(q.subtotal)}</b></p><p><span>ITBIS</span><b>${formatAmount(q.itbis)}</b></p><p class="grand"><span>TOTAL</span><span>${formatAmount(q.total)}</span></p></section><div class="rule"></div><p class="center">Gracias por su preferencia</p></main><script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}<\/script></body></html>`;
    const halfLetterHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cotización ${this.e(q.number)}</title><style>
      @page{size:letter portrait;margin:0}*{box-sizing:border-box}html{padding:0!important;margin:0!important}body{width:100%!important;min-height:100%!important;margin:0!important;padding:1cm!important;color:#111;font-family:Arial,sans-serif;font-size:10px}.page{width:100%!important;min-height:4.01in;display:flex;flex-direction:column}.company{text-align:center;line-height:1.22;margin-bottom:8px;padding-top:8px}.company-logo{display:block;max-width:1.15in;max-height:.52in;object-fit:contain;margin:0 auto 4px}.company-name{display:block;margin:0 0 4px;font-size:15px;font-weight:800;line-height:1.15}.company p{margin:1px 0;font-size:10px}.header{display:grid;grid-template-columns:1fr 2.05in;gap:.3in;align-items:end}.customer-label{font-weight:700;font-size:11px;margin:0 0 -1px 6px}.customer{border:1px solid #111;min-height:.83in;padding:5px 6px;font-size:11px}.customer .rnc{margin-top:22px;text-align:center}.quote-title{text-align:center;letter-spacing:4px;font-weight:800;font-size:16px;margin:0 0 1px}.quote-info{border:1px solid #111;padding:7px 12px;font-size:11px;line-height:1.35}.quote-info div{display:grid;grid-template-columns:.72in 1fr}.quote-info b{font-size:11px}.items{width:100%;border-collapse:collapse;margin-top:9px;border-top:1px solid #111}.items th{font-weight:400;text-align:left;border-bottom:1px solid #111;padding:1px 4px;font-size:10px;white-space:nowrap}.items td{padding:3px 4px;vertical-align:top;font-size:10px}.items td span{font-size:9px;white-space:nowrap}.footer{margin-top:auto;border-top:1px solid #111;display:grid;grid-template-columns:1fr 2.15in;gap:18px;padding:5px 8px 0}.terms{text-align:center;font-size:10px;font-weight:700;line-height:1.25}.page-number{font-size:10px;font-style:italic;margin-top:13px}.totals{font-size:11px}.totals div{display:flex;justify-content:space-between;padding:1px 0}.totals b{font-size:11px}
    </style></head><body><main class="page"><section class="company">${company?.logoUrl ? `<img class="company-logo" src="${this.e(company.logoUrl)}" alt="">` : ''}<h1 class="company-name">${this.e(companyName)}</h1><p>${this.e(company?.address || '')}</p><p>${this.e(company?.phone || '')}</p><p>${this.e(company?.rnc || '')}</p></section><section class="header"><div><p class="customer-label">PARA:</p><div class="customer"><div>${this.e(q.customer)}</div><div class="rnc">${this.e(q.rnc || '')}</div></div></div><div><p class="quote-title">COTIZACION</p><div class="quote-info"><div><b>No.</b><strong>${this.e(q.number)}</strong></div><div><b>Fecha</b><span>${this.e(q.date)}</span></div><div><b>Vendedor</b><span>${this.e(seller)}</span></div></div></div></section><table class="items"><thead><tr><th>DESCRIPCIÓN</th></tr></thead><tbody>${halfLetterRows}</tbody></table><footer class="footer"><div><div class="terms">${this.e(q.notes || 'Estos precios están sujetos a cambio sin previo aviso')}</div><div class="page-number">Pag 1/1</div></div><div class="totals"><div><b>Sub-Total</b><span>${formatAmount(q.subtotal)}</span></div><div><b>Itbis</b><span>${formatAmount(q.itbis)}</span></div><div><b>Total</b><span>${formatAmount(q.total)}</span></div></div></footer></main><script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}<\/script></body></html>`;
    const html = isHalfLetter ? halfLetterHtml : thermalHtml;
    try {
      const result = await this.qzPrintService.printHtml(html, `Cotización ${q.number}`, isHalfLetter ? 'width=1000,height=680' : 'width=420,height=700');
      if (result === 'unavailable') this.message = 'No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo de nuevo.';
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo preparar la impresión de la cotización.';
    }
  }
  async pdf(item: Quotation) { const q = await this.quotations.get(item.id); if (!q) return; const { jsPDF } = await import('jspdf'); const doc = new jsPDF({ unit: 'mm', format: 'letter' }); let y = 18; const write = (text: string, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); const lines = doc.splitTextToSize(text, 170); doc.text(lines, 20, y); y += lines.length * 6 + 3; }; write(`COTIZACIÓN ${q.number}`, true); write(`Fecha: ${q.date}    Válida hasta: ${q.validUntil || 'N/D'}`); write(`Cliente: ${q.customer}`); q.lines.forEach((l) => write(`${l.quantity} x ${l.description} - ${l.total.toFixed(2)}`)); write(`TOTAL: ${q.total.toFixed(2)}`, true); doc.save(`cotizacion-${q.number}.pdf`); }
  private e(value: string) { return String(value || '').replace(/[&<>'\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c)); }
}
