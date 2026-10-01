import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Quotation, QuotationLine, QuotationsService } from '../../core/services/quotations/quotations.service';
import { AppDataService } from '../../app-data.service';
import { ClientRecord, ProductRecord, RncRecord, UserRecord } from '../../app.models';
import { ClientsService } from '../../core/services/clients/clients.service';
import { ProductsService } from '../../core/services/products/products.service';
import { RncService } from '../../core/services/rnc/rnc.service';
import { UsersService } from '../../core/services/users/users.service';

@Component({ selector: 'app-quotation-page', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './quotation-page.component.html', styleUrls: ['./quotation-page.component.scss'] })
export class QuotationPageComponent implements OnInit {
  @Output() readonly convertToInvoice = new EventEmitter<void>();
  tab: 'create' | 'consult' = 'create';
  editingId: number | null = null;
  isReadOnly = false;
  message = '';
  quotes: Quotation[] = [];
  search = '';
  statusFilter = 'Todas';
  readonly statusFilters = ['Todas', 'Borrador', 'Facturada'];
  quoteStatus = 'Borrador';
  validityDays = 15;
  taxRate = 18;
  quotationUserCode = '';
  quotationUserName = '';
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
    private readonly usersService: UsersService
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
  reset() { this.quote = this.emptyQuote(); this.editingId = null; this.isReadOnly = false; this.message = ''; this.isRncInvalid = false; this.resetLineEditor(); }
  onQuoteRncChange(): void {
    const rnc = this.quote.rnc.trim();
    if (!rnc) { this.isRncInvalid = false; this.clearCustomerContact(); return; }
    const client = this.clients.find((item) => item.documentNumber.trim().toLowerCase() === rnc.toLowerCase());
    if (client) { this.populateClient(client); this.isRncInvalid = false; this.message = `Cliente registrado: ${client.fullName} (RNC ${client.documentNumber}).`; return; }
    const record = this.data.rncRecords.find((item) => item.rnc.trim().toLowerCase() === rnc.toLowerCase());
    if (record) { this.quote.customer = record.tradeName?.trim() || record.legalName; this.quote.rnc = record.rnc; this.quote.phone = record.phone ?? ''; this.quote.email = record.email ?? ''; this.quote.address = record.address ?? ''; this.isRncInvalid = false; this.message = `RNC registrado: ${record.legalName} (${record.rnc}).`; return; }
    this.clearCustomerContact(); this.isRncInvalid = true; this.message = 'RNC inválido. Debe estar registrado en Clientes o en el catálogo RNC.';
  }
  onQuoteRncEnter(event: Event): void { event.preventDefault(); this.onQuoteRncChange(); this.focusEditorField('quotationCustomer'); }
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
    const user = this.users.find((item) => String(item.id) === this.quotationUserCode.trim());
    this.quotationUserName = user?.fullName ?? '';
  }
  async onQuotationUserCodeEnter(event: Event): Promise<void> {
    event.preventDefault();
    const code = this.quotationUserCode.trim();
    this.quotationUserName = '';
    if (code) {
      try {
        const users = await this.usersService.getUsers();
        this.data.users = users;
        this.quotationUserName = users.find((item) => String(item.id) === code)?.fullName ?? '';
      } catch {
        this.onQuotationUserCodeChange();
      }
    }
    this.focusEditorField('quotationLineCode');
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
  private async loadUsers(): Promise<void> { try { const users = await this.usersService.getUsers(); if (users.length) this.data.users = users; } catch {} }
  async load() { try { this.quotes = await this.quotations.list(); } catch (error) { this.message = error instanceof Error ? error.message : 'No se pudieron cargar las cotizaciones.'; } }
  private payload(): Omit<Quotation, 'id' | 'number'> { return { date: this.quote.date, validUntil: this.quote.validUntil, customer: this.quote.customer.trim(), rnc: this.quote.rnc.trim(), phone: this.quote.phone.trim(), email: this.quote.email.trim(), address: this.quote.address.trim(), notes: this.quote.notes.trim(), subtotal: this.subtotal, itbis: this.tax, total: this.total, status: this.quoteStatus, lines: this.quote.lines.map((line) => ({ ...line, code: line.code.trim(), description: line.description.trim(), quantity: Number(line.quantity), price: Number(line.price), itbis: Number(line.itbis), total: Number(line.quantity) * Number(line.price) * (1 + Number(line.itbis) / 100) })) }; }
  async save() { if (this.isReadOnly) return; if (this.isRncInvalid || !this.quote.customer.trim() || !this.quote.lines.length || this.quote.lines.some((line) => !line.description.trim() || line.quantity <= 0)) { this.message = this.isRncInvalid ? 'RNC inválido. Regístralo en Clientes o en el catálogo RNC antes de guardar.' : 'Completa el cliente y agrega al menos un producto antes de guardar.'; return; } try { const payload = this.payload(); if (this.editingId) { if (!window.confirm('Se reemplazarán las líneas actuales de la cotización. ¿Deseas guardar los cambios?')) return; await this.quotations.update(this.editingId, payload); this.message = 'Cotización actualizada correctamente.'; } else { const saved = await this.quotations.create(payload); this.quote.number = saved.number; this.editingId = saved.id; this.quoteStatus = 'Borrador'; this.message = `Cotización ${saved.number} creada correctamente.`; } await this.load(); } catch (error) { this.message = error instanceof Error ? error.message : 'No se pudo guardar la cotización.'; } }
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
    if (this.displayStatus(item.status) === 'Facturada') { this.message = 'Esta cotización ya fue convertida en factura.'; return; }
    const detail = await this.quotations.get(item.id);
    if (!detail) return;
    try {
      await this.quotations.markAsInvoiced(detail.id);
      sessionStorage.setItem('saltor.quotationInvoiceDraft', JSON.stringify(detail));
      await this.load();
      this.convertToInvoice.emit();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo convertir la cotización en factura.';
    }
  }
  async print(item: Quotation) {
    const q = await this.quotations.get(item.id);
    if (!q) return;
    const company = this.data.companies[0];
    const rows = q.lines.map((line) => `<tr><td>${this.e(line.description)}<br><small>${line.quantity} x RD$${line.price.toFixed(2)}</small></td><td>RD$${line.total.toFixed(2)}</td></tr>`).join('');
    const win = window.open('', '_blank', 'width=420,height=700');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cotización ${this.e(q.number)}</title><style>
      @page { size: 80mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body { color:#111; font:11px Arial,sans-serif; margin:0; width:80mm; }
      .print-document { padding:4mm; width:80mm; }
      .center { text-align:center; } h1 { font-size:14px; margin:0 0 3px; } p { margin:3px 0; }
      .rule { border-top:1px dashed #111; margin:5px 0; } table { border-collapse:collapse; width:100%; } th,td { padding:4px 0; text-align:left; vertical-align:top; } th:last-child,td:last-child { text-align:right; } small { font-size:10px; } .total p { display:flex; justify-content:space-between; } .grand { font-size:14px; font-weight:700; }
    </style></head><body><main class="print-document"><section class="center"><h1>${this.e(company?.legalName || this.data.companyName)}</h1><p>RNC: ${this.e(company?.rnc || '')}</p><p>${this.e(company?.address || '')}</p><p>Tel.: ${this.e(company?.phone || '')}</p></section><div class="rule"></div><section><p><b>COTIZACIÓN ${this.e(q.number)}</b></p><p>Fecha: ${q.date}</p><p>Válida hasta: ${q.validUntil || 'N/D'}</p><p>Cliente: ${this.e(q.customer)}</p><p>RNC/Cédula: ${this.e(q.rnc)}</p><p>Teléfono: ${this.e(q.phone)}</p><p>Dirección: ${this.e(q.address)}</p></section><div class="rule"></div><table><thead><tr><th>Producto</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="rule"></div><section class="total"><p><span>Subtotal</span><b>RD$${q.subtotal.toFixed(2)}</b></p><p><span>ITBIS</span><b>RD$${q.itbis.toFixed(2)}</b></p><p class="grand"><span>TOTAL</span><span>RD$${q.total.toFixed(2)}</span></p></section><div class="rule"></div><p class="center">Gracias por su preferencia</p></main><script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}<\/script></body></html>`);
    win.document.close();
  }
  async pdf(item: Quotation) { const q = await this.quotations.get(item.id); if (!q) return; const { jsPDF } = await import('jspdf'); const doc = new jsPDF({ unit: 'mm', format: 'letter' }); let y = 18; const write = (text: string, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); const lines = doc.splitTextToSize(text, 170); doc.text(lines, 20, y); y += lines.length * 6 + 3; }; write(`COTIZACIÓN ${q.number}`, true); write(`Fecha: ${q.date}    Válida hasta: ${q.validUntil || 'N/D'}`); write(`Cliente: ${q.customer}`); q.lines.forEach((l) => write(`${l.quantity} x ${l.description} - RD$${l.total.toFixed(2)}`)); write(`TOTAL: RD$${q.total.toFixed(2)}`, true); doc.save(`cotizacion-${q.number}.pdf`); }
  private e(value: string) { return String(value || '').replace(/[&<>'\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c)); }
}
