import { Component, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { ProductFormModel, ProductRecord, SupplierFormModel, SupplierRecord, UserRecord } from '../../app.models';
import { ProductEntryPayload, ProductEntryRecord, ProductsService } from '../../core/services/products/products.service';
import { SuppliersService } from '../../core/services/suppliers/suppliers.service';
import { RncService } from '../../core/services/rnc/rnc.service';
import { QzPrintService } from '../../core/services/printing/qz-print.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { CompaniesService } from '../../core/services/companies/companies.service';
import { UsersService } from '../../core/services/users/users.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-product-entries-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-entries-page.component.html',
  styleUrls: ['./product-entries-page.component.scss']
})
export class ProductEntriesPageComponent implements OnInit {
  activeTab: 'new' | 'consultation' = 'new';
  isLoading = false;
  catalogLoaded = false;
  isSaving = false;
  message = '';
  entries: ProductEntryRecord[] = [];
  selectedEntry: ProductEntryRecord | null = null;
  showProductDialog = false;
  showSupplierDialog = false;
  filters = { search: '', supplierId: 0, from: '', to: '' };
  form = { supplierId: 0, date: new Date().toISOString().slice(0, 10), reference: '', purchaseOrder: '', supplierInvoiceDate: new Date().toISOString().slice(0, 10), receivedBy: '', userCode: '', notes: '' };
  supplierDocumentSearch = '';
  supplierNameSearch = '';
  supplierSearchResults: SupplierRecord[] = [];
  entryUserName = '';
  private entryUsers: UserRecord[] = [];
  private userSearchRequest = 0;
  lineEditor = { productId: 0, code: '', productName: '', quantity: 1, cost: 0 };
  productSuggestionField: 'code' | 'description' | null = null;
  activeProductSuggestionIndex = 0;
  productSearchResults: ProductRecord[] = [];
  private productSearchRequest = 0;
  private supplierSearchRequest = 0;
  entryEditorMode: 'create' | 'view' | 'edit' = 'create';
  editingEntryId: number | null = null;
  editingEntryCode = '';
  editingLineIndex: number | null = null;
  lines: Array<{ product: ProductRecord; quantity: number; cost: number }> = [];
  productForm: ProductFormModel = this.emptyProductForm();
  supplierForm: SupplierFormModel = this.emptySupplierForm();

  constructor(
    public readonly data: AppDataService,
    private readonly productsService: ProductsService,
    private readonly suppliersService: SuppliersService,
    private readonly rncService: RncService,
    private readonly qzPrintService: QzPrintService,
    private readonly auth: AuthService,
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly el: ElementRef<HTMLElement>
  ) {}

  get products(): ProductRecord[] { return this.data.products.filter((product) => product.status !== 'Inactivo'); }
  get suppliers(): SupplierRecord[] { return this.data.suppliers.filter((supplier) => supplier.status === 'Activo'); }
  get selectedProduct(): ProductRecord | null { return this.products.find((product) => product.id === Number(this.lineEditor.productId)) ?? null; }
  get selectedSupplier(): SupplierRecord | null { return this.suppliers.find((supplier) => supplier.id === Number(this.form.supplierId)) ?? null; }
  get entryTotal(): number { return this.lines.reduce((total, line) => total + line.quantity * line.cost, 0); }
  get entryCode(): string { return this.editingEntryCode || 'Se genera al guardar'; }
  get isEntryReadOnly(): boolean { return this.entryEditorMode === 'view'; }
  get saveEntryLabel(): string {
    if (this.isSaving) return this.entryEditorMode === 'edit' ? 'Actualizando...' : 'Guardando...';
    return this.entryEditorMode === 'edit' ? 'Actualizar entrada' : 'Guardar entrada';
  }

  get messageIsError(): boolean {
    return /no se pudo|no existe|completa|indica|debe |error/i.test(this.message);
  }

  get messageTitle(): string {
    return this.messageIsError ? 'Aviso' : 'Completado';
  }

  get filteredSupplierDocuments(): SupplierRecord[] {
    const search = this.supplierDocumentSearch.trim().toLocaleLowerCase();
    if (!search) return [];
    const startsWithDocument = this.suppliers.filter((supplier) => supplier.documentNumber.toLocaleLowerCase().startsWith(search));
    return (startsWithDocument.length ? startsWithDocument : this.suppliers.filter((supplier) =>
      supplier.documentNumber.toLocaleLowerCase().includes(search)
    )).slice(0, 8);
  }

  get supplierNameSuggestions(): SupplierRecord[] {
    return this.supplierSearchResults;
  }

  get productSuggestions(): ProductRecord[] {
    const input = this.productSuggestionField === 'code' ? this.lineEditor.code : this.lineEditor.productName;
    const search = input.trim().toLocaleLowerCase();
    if (!search) return [];

    const sortByDescription = (products: ProductRecord[]) => products
      .sort((a, b) => this.getProductFullDescription(a).localeCompare(this.getProductFullDescription(b), 'es', { sensitivity: 'base' }))
      .slice(0, 8);
    const results = this.productSearchResults;
    if (this.productSuggestionField === 'code') {
      return sortByDescription(results.filter((product) => product.code.trim().toLocaleLowerCase().startsWith(search)));
    }

    const startsWithDescription = results.filter((product) => this.getProductFullDescription(product).toLocaleLowerCase().startsWith(search));
    return startsWithDescription.length
      ? sortByDescription(startsWithDescription)
      : sortByDescription(results.filter((product) => this.getProductFullDescription(product).toLocaleLowerCase().includes(search)));
  }

  get filteredEntries(): ProductEntryRecord[] {
    const search = this.filters.search.trim().toLowerCase();
    return this.entries.filter((entry) => {
      const productText = entry.lines.map((line) => `${line.productCode} ${line.productDescription}`).join(' ');
      const matchesSearch = !search || [entry.code, productText, entry.supplierName, entry.reference].some((value) => value.toLowerCase().includes(search));
      const matchesSupplier = !this.filters.supplierId || entry.supplierId === Number(this.filters.supplierId);
      const matchesFrom = !this.filters.from || entry.date >= this.filters.from;
      const matchesTo = !this.filters.to || entry.date <= this.filters.to;
      return matchesSearch && matchesSupplier && matchesFrom && matchesTo;
    });
  }

  getEntryProductSummary(entry: ProductEntryRecord): string {
    return entry.lines.map((line) => line.productDescription).join(', ');
  }

  getEntryTotal(entry: ProductEntryRecord): number {
    return entry.lines.reduce((total, line) => total + (line.quantity * line.unitCost), 0);
  }

  onSupplierDocumentChange(): void {
    const documentNumber = this.supplierDocumentSearch.trim().toLocaleLowerCase();
    const supplier = this.suppliers.find((item) => item.documentNumber.trim().toLocaleLowerCase() === documentNumber);
    if (supplier) {
      this.selectSupplier(supplier);
      return;
    }
    this.form.supplierId = 0;
  }

  onSupplierNameChange(): void {
    const name = this.supplierNameSearch.trim();
    this.form.supplierId = 0;
    if (!name) {
      this.supplierSearchResults = [];
      return;
    }
    void this.searchSuppliers(name);
  }

  onSupplierNameEnter(event: Event): void {
    event.preventDefault();
    const exactSupplier = this.suppliers.find((supplier) => supplier.companyName.trim().toLocaleLowerCase() === this.supplierNameSearch.trim().toLocaleLowerCase());
    const supplier = exactSupplier ?? this.supplierNameSuggestions[0];
    if (supplier) {
      this.selectSupplier(supplier);
      this.focusNextEntryHeaderField(event);
      return;
    }
    this.focusNextEntryHeaderField(event);
  }

  onEntryUserCodeChange(): void {
    this.entryUserName = '';
    if (this.form.userCode.trim()) void this.resolveEntryUser(false);
  }

  async onEntryUserCodeEnter(event: Event): Promise<void> {
    event.preventDefault();
    if (await this.resolveEntryUser(true)) this.focusNextEntryHeaderField(event);
  }

  async onSupplierDocumentEnter(event: Event): Promise<void> {
    event.preventDefault();
    const supplier = this.suppliers.find((item) => item.documentNumber.trim().toLocaleLowerCase() === this.supplierDocumentSearch.trim().toLocaleLowerCase())
      ?? this.filteredSupplierDocuments[0];
    if (supplier) {
      this.selectSupplier(supplier);
      this.focusNextEntryHeaderField(event);
      return;
    }

    const rnc = this.supplierDocumentSearch.replace(/\D/g, '');
    if (!rnc) {
      this.focusNextEntryHeaderField(event);
      return;
    }

    try {
      const result = await this.rncService.lookup(rnc);
      const supplier = await this.suppliersService.createSupplier({
        ...this.emptySupplierForm(),
        code: `RNC-${result.rnc}`,
        documentType: 'RNC',
        documentNumber: result.rnc,
        companyName: result.tradeName || result.legalName,
        address: result.address,
        phone: result.phone,
        email: result.email
      }, this.form.date);
      this.data.suppliers = [supplier, ...this.data.suppliers.filter((item) => item.id !== supplier.id)];
      this.selectSupplier(supplier);
      this.focusNextEntryHeaderField(event);
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No existe un suplidor registrado con ese RNC o cédula.';
    }
  }

  onSupplierSelectionChange(): void {
    const supplier = this.selectedSupplier;
    this.supplierDocumentSearch = supplier?.documentNumber ?? '';
  }

  ngOnInit(): void { void this.load().then(() => this.focusEntryHeaderField('supplierDocument')); }

  selectTab(tab: 'new' | 'consultation'): void {
    this.activeTab = tab;
    this.selectedEntry = null;
    if (tab === 'consultation') {
      void this.loadEntries();
      return;
    }
    if (this.entryEditorMode === 'create') {
      this.resetEntryEditor();
      this.focusEntryHeaderField('supplierDocument');
    }
  }

  viewEntry(entry: ProductEntryRecord): void { this.openEntry(entry, 'view'); }

  editEntry(entry: ProductEntryRecord): void { this.openEntry(entry, 'edit'); }

  returnToConsultation(): void {
    this.entryEditorMode = 'create';
    this.editingEntryId = null;
    this.editingEntryCode = '';
    this.activeTab = 'consultation';
    void this.loadEntries();
  }

  setSuggestedCost(): void { if (this.selectedProduct) this.lineEditor.cost = this.selectedProduct.cost; }

  getProductFullDescription(product: ProductRecord): string {
    return [product.description, product.brand, product.type, product.size]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' ');
  }

  isActiveProductSuggestion(index: number): boolean { return index === this.activeProductSuggestionIndex; }

  onProductCodeChange(): void {
    this.productSuggestionField = 'code';
    this.activeProductSuggestionIndex = 0;
    const code = this.lineEditor.code.trim();
    if (!code) {
      this.clearSelectedProduct();
      this.productSearchResults = [];
      return;
    }
    this.clearSelectedProduct('code');
    void this.searchProducts(code, 'code');
  }

  onProductDescriptionChange(): void {
    this.productSuggestionField = 'description';
    this.activeProductSuggestionIndex = 0;
    const description = this.lineEditor.productName.trim();
    if (!description) {
      this.clearSelectedProduct();
      this.productSearchResults = [];
      return;
    }
    this.clearSelectedProduct('description');
    void this.searchProducts(description, 'description');
  }

  onProductSearchFocus(field: 'code' | 'description'): void {
    this.productSuggestionField = field;
    this.activeProductSuggestionIndex = 0;
    const search = field === 'code' ? this.lineEditor.code : this.lineEditor.productName;
    if (search.trim()) void this.searchProducts(search, field);
  }

  onProductSearchBlur(): void {
    window.setTimeout(() => this.closeProductSuggestions(), 120);
  }

  onProductSuggestionKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    const suggestions = this.productSuggestions;
    if (event.key === 'Escape') {
      this.closeProductSuggestions();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if ((event.target as HTMLInputElement).name === 'lineProductCode' && !this.lineEditor.code.trim()) {
        this.focusEntryLineField('lineProductDescription');
        return;
      }
      const product = suggestions[this.activeProductSuggestionIndex];
      if (product) {
        this.applyProductSelection(product);
        const nextField = (event.target as HTMLInputElement).name === 'lineProductCode'
          ? 'lineQuantity'
          : 'lineQuantity';
        this.focusEntryLineField(nextField);
      }
      return;
    }
    if (!suggestions.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;

    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    this.activeProductSuggestionIndex = (this.activeProductSuggestionIndex + direction + suggestions.length) % suggestions.length;
  }

  selectProductSuggestion(product: ProductRecord): void { this.applyProductSelection(product); }

  clearEntryForm(): void {
    this.resetEntryEditor();
    this.message = 'Formulario limpiado.';
    this.focusEntryLineField('lineProductCode');
  }

  dismissMessage(): void {
    this.message = '';
  }

  focusNextEntryHeaderField(event: Event): void {
    event.preventDefault();
    const fields = Array.from(this.el.nativeElement.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      '.entry-header-grid input:not([readonly]):not([disabled]), .entry-header-grid select:not([disabled]), .entry-header-grid textarea:not([disabled])'
    )).filter((field) => field.offsetParent !== null);
    const currentIndex = fields.indexOf(event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement);
    const next = fields[currentIndex + 1];
    if (next) next.focus();
    else this.focusEntryLineField('lineProductCode');
  }

  private focusEntryHeaderField(name: string): void {
    window.setTimeout(() => this.el.nativeElement.querySelector<HTMLInputElement>(`[name="${name}"]`)?.focus());
  }

  onLineEditorQuantityEnter(event: Event): void {
    event.preventDefault();
    this.focusEntryLineField('lineCost');
  }

  onLineEditorCostEnter(event: Event): void {
    event.preventDefault();
    const canAdd = Boolean(this.selectedProduct) && Number(this.lineEditor.quantity) > 0 && Number(this.lineEditor.cost) >= 0;
    this.addLine();
    if (canAdd) this.focusEntryLineField('lineProductCode');
  }

  selectEntryLineInput(event: FocusEvent): void {
    const input = event.target as HTMLInputElement;
    window.setTimeout(() => input.select());
  }

  addLine(): void {
    const product = this.selectedProduct;
    const quantity = Number(this.lineEditor.quantity);
    const cost = Number(this.lineEditor.cost);
    if (!product || quantity <= 0 || cost < 0) { this.message = 'Selecciona un producto e indica cantidad y precio válidos.'; return; }
    if (this.editingLineIndex !== null) {
      this.lines[this.editingLineIndex] = { product, quantity, cost };
    } else {
      const current = this.lines.find((line) => line.product.id === product.id);
      if (current) { current.quantity += quantity; current.cost = cost; }
      else this.lines.push({ product, quantity, cost });
    }
    this.editingLineIndex = null;
    this.lineEditor = { productId: 0, code: '', productName: '', quantity: 1, cost: 0 };
    this.closeProductSuggestions();
  }

  removeLine(index: number): void { this.lines.splice(index, 1); }

  editLine(index: number): void {
    const line = this.lines[index];
    if (!line || this.isEntryReadOnly) return;
    this.editingLineIndex = index;
    this.applyProductSelection(line.product);
    this.lineEditor.quantity = line.quantity;
    this.lineEditor.cost = line.cost;
    this.focusEntryLineField('lineQuantity');
  }

  async save(): Promise<void> {
    if (!this.catalogLoaded) {
      this.message = 'Aún no se pudo cargar el catálogo de productos de la empresa. Actualiza la página e inténtalo de nuevo.';
      return;
    }
    if (!this.supplierNameSearch.trim()) {
      this.message = 'Indica el nombre del suplidor antes de guardar la entrada.';
      return;
    }
    if (!this.form.userCode.trim()) { this.message = 'Indica el código de usuario antes de guardar la entrada.'; return; }
    if (!await this.resolveEntryUser(true)) return;
    if (!this.lines.length) { this.message = 'Agrega al menos un producto a la entrada.'; return; }

    this.isSaving = true;
    this.message = '';
    try {
      if (!await this.confirmEntryProducts()) return;
      const payload = this.getEntryPayload();
      const savedEntryId = this.entryEditorMode === 'edit' && this.editingEntryId
        ? (await this.productsService.updateEntry(this.editingEntryId, payload), this.editingEntryId)
        : await this.productsService.createEntry(payload);
      await this.load();
      const savedEntry = this.entries.find((entry) => entry.id === savedEntryId);
      if (savedEntry) {
        const answer = await Swal.fire({
          icon: 'success',
          title: 'Entrada guardada',
          text: `Entrada ${savedEntry.code} registrada correctamente. ¿Deseas imprimirla ahora?`,
          showCancelButton: true,
          confirmButtonText: 'Imprimir',
          cancelButtonText: 'No imprimir'
        });
        if (answer.isConfirmed) await this.printEntry(savedEntry);
      }
      this.message = this.entryEditorMode === 'edit' ? 'Entrada actualizada correctamente.' : 'Entrada registrada correctamente.';
      this.resetEntryEditor();
    } catch (error) {
      this.message = this.entrySaveErrorMessage(error);
    } finally { this.isSaving = false; }
  }

  async createQuickProduct(): Promise<void> {
    if (!this.productForm.code.trim() || !this.productForm.description.trim()) { this.message = 'Completa el código y la descripción del producto.'; return; }
    try {
      const product = await this.productsService.createProduct(this.productForm);
      this.data.products = [product, ...this.data.products.filter((item) => item.id !== product.id)];
      this.applyProductSelection(product);
      this.showProductDialog = false;
      this.productForm = this.emptyProductForm();
    } catch (error) { this.message = error instanceof Error ? error.message : 'No se pudo agregar el producto.'; }
  }

  async createQuickSupplier(): Promise<void> {
    if (!this.supplierForm.companyName.trim() || !this.supplierForm.documentNumber.trim()) { this.message = 'Completa el nombre y el documento del proveedor.'; return; }
    try {
      const supplier = await this.suppliersService.createSupplier(this.supplierForm, this.form.date);
      this.data.suppliers = [supplier, ...this.data.suppliers.filter((item) => item.id !== supplier.id)];
      this.selectSupplier(supplier);
      this.showSupplierDialog = false;
      this.supplierForm = this.emptySupplierForm();
    } catch (error) { this.message = error instanceof Error ? error.message : 'No se pudo agregar el proveedor.'; }
  }

  async deleteEntry(entry: ProductEntryRecord): Promise<void> {
    if (!window.confirm('¿Eliminar la entrada ' + entry.code + '? Se descontarán las cantidades del inventario.')) return;
    try {
      await this.productsService.deleteEntry(entry.id);
      this.selectedEntry = null;
      await this.load();
      this.message = 'Entrada eliminada y existencia actualizada.';
    } catch (error) { this.message = error instanceof Error ? error.message : 'No se pudo eliminar la entrada.'; }
  }

  async printEntry(entry: ProductEntryRecord): Promise<void> {
    const session = await this.auth.restoreSession();
    let company = null;
    try {
      company = (await this.companiesService.getCompanies()).find((item) => item.id === session?.companyId) ?? null;
    } catch {
      // La impresión sigue disponible aunque no pueda cargarse el logo.
    }
    const money = (value: number): string => Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = entry.lines.map((line) => `<tr><td><b>${this.escape(line.productDescription)}</b><br><small>${this.escape(line.productCode)} · ${line.quantity} x ${money(line.unitCost)}</small></td><td>${money(line.quantity * line.unitCost)}</td></tr>`).join('');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Entrada ${this.escape(entry.code)}</title><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;width:74mm;margin:0;color:#111}.center{text-align:center}.logo{display:block;max-width:42mm;max-height:22mm;object-fit:contain;margin:0 auto 4px}.company{font-size:14px;font-weight:800}.rule{border-top:1px dashed #222;margin:8px 0}.line{display:flex;justify-content:space-between;gap:8px;margin:3px 0}table{width:100%;border-collapse:collapse}th,td{padding:3px 0;text-align:left;vertical-align:top;font-size:10px}th:last-child,td:last-child{text-align:right}.total{font-size:13px;font-weight:800}.footer{font-size:9px;margin-top:12px;text-align:center}</style></head><body><div class="center">${company?.logoUrl ? `<img class="logo" src="${this.escape(company.logoUrl)}" alt="">` : ''}<div class="company">${this.escape(company?.legalName || company?.tradeName || session?.companyName || this.data.companyName)}</div></div><div class="center">ENTRADA DE PRODUCTOS</div><div class="rule"></div><div class="line"><span>Entrada:</span><b>${this.escape(entry.code)}</b></div><div class="line"><span>Fecha:</span><span>${this.escape(entry.date)}</span></div><div class="line"><span>Suplidor:</span><span>${this.escape(entry.supplierName)}</span></div>${entry.reference ? `<div class="line"><span>Factura:</span><span>${this.escape(entry.reference)}</span></div>` : ''}<div class="rule"></div><table><thead><tr><th>DESCRIPCIÓN</th><th>VALOR</th></tr></thead><tbody>${rows}</tbody></table><div class="rule"></div><div class="line total"><span>TOTAL</span><span>${money(this.getEntryTotal(entry))}</span></div>${entry.notes ? `<p><b>Nota:</b> ${this.escape(entry.notes)}</p>` : ''}<div class="footer">Documento generado por SaltoSystem</div><script>window.onload=()=>window.print()<\/script></body></html>`;
    try {
      const result = await this.qzPrintService.printHtml(html, `Entrada ${entry.code}`, 'width=420,height=720');
      if (result === 'unavailable') this.message = 'No fue posible abrir la impresión. Permite las ventanas emergentes e inténtalo otra vez.';
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo imprimir la entrada.';
    }
  }

  private async load(): Promise<void> {
    this.isLoading = true;
    this.catalogLoaded = false;
    try {
      const [products, suppliers] = await Promise.all([this.productsService.getProducts(), this.suppliersService.getSuppliers()]);
      this.data.products = products;
      this.data.suppliers = suppliers;
      this.catalogLoaded = true;
      await this.loadEntries();
    } catch {
      // No se conservan datos de demostración: sus identificadores no son
      // necesariamente válidos para la empresa del usuario conectado.
      this.data.products = [];
      this.data.suppliers = [];
      this.lines = [];
      this.message = 'No se pudo cargar el catálogo de productos y suplidores de la empresa. Actualiza la página e inténtalo de nuevo.';
    }
    finally { this.isLoading = false; }
  }

  private async loadEntries(): Promise<void> {
    try { this.entries = await this.productsService.getEntries(); }
    catch (error) { this.message = error instanceof Error ? error.message : 'No se pudieron cargar las entradas.'; }
  }

  private async resolveEntryUser(showMessage: boolean): Promise<boolean> {
    const code = this.form.userCode.trim();
    if (!code) {
      this.entryUserName = '';
      if (showMessage) this.message = 'Indica el código de usuario.';
      return false;
    }

    const requestId = ++this.userSearchRequest;
    try {
      const session = await this.auth.restoreSession();
      if (!session?.companyId) throw new Error('No se encontró la empresa activa.');
      if (!this.entryUsers.length || showMessage) this.entryUsers = await this.usersService.getUsers(session.companyId);
      if (requestId !== this.userSearchRequest) return false;
      const user = this.entryUsers.find((item) => String(item.id) === code && item.status === 'Activo');
      this.entryUserName = user?.fullName ?? '';
      if (!user && showMessage) this.message = 'El código de usuario no existe o está inactivo en la empresa actual.';
      return Boolean(user);
    } catch (error) {
      this.entryUserName = '';
      if (showMessage) this.message = error instanceof Error ? error.message : 'No se pudo validar el código de usuario.';
      return false;
    }
  }

  private emptyProductForm(): ProductFormModel {
    return { code: '', description: '', unit: 'Unidad', category: 'General', location: '', brand: '', type: '', size: '', stock: 0, minimumStock: 0, cost: 0, salePrice: 0, minimumPrice: 0, wholesaleEnabled: false, wholesalePrice: 0, minimumSaleQuantity: 1, minimumWholesaleQuantity: 0, replacementEnabled: false, replacementCode: '', exemptItbis: false, taxValue: 18, status: 'Activo' };
  }

  private escape(value: string | number | null | undefined): string {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
  }

  private emptySupplierForm(): SupplierFormModel {
    return { code: '', companyName: '', contactName: '', documentType: 'RNC', documentNumber: '', phone: '', email: '', address: '', city: '', category: 'Local', paymentTerms: '', balance: 0, status: 'Activo' };
  }

  private clearSelectedProduct(field?: 'code' | 'description'): void {
    this.lineEditor.productId = 0;
    this.lineEditor.cost = 0;
    if (field !== 'code') this.lineEditor.code = '';
    if (field !== 'description') this.lineEditor.productName = '';
  }

  private applyProductSelection(product: ProductRecord, closeSuggestions = true): void {
    this.lineEditor.productId = product.id;
    this.lineEditor.code = product.code;
    this.lineEditor.productName = this.getProductFullDescription(product);
    this.lineEditor.cost = product.cost;
    if (closeSuggestions) this.closeProductSuggestions();
  }

  private closeProductSuggestions(): void {
    this.productSuggestionField = null;
    this.activeProductSuggestionIndex = 0;
  }

  private focusEntryLineField(name: string): void {
    window.setTimeout(() => this.el.nativeElement.querySelector<HTMLInputElement>(`[name="${name}"]`)?.focus());
  }

  private openEntry(entry: ProductEntryRecord, mode: 'view' | 'edit'): void {
    this.entryEditorMode = mode;
    this.editingEntryId = entry.id;
    this.editingEntryCode = entry.code;
    this.form = {
      supplierId: entry.supplierId ?? 0,
      date: entry.date,
      reference: entry.reference,
      purchaseOrder: entry.purchaseOrder,
      supplierInvoiceDate: entry.supplierInvoiceDate || entry.date,
      receivedBy: '',
      userCode: entry.userCode,
      notes: entry.notes
    };
    this.supplierDocumentSearch = this.suppliers.find((supplier) => supplier.id === entry.supplierId)?.documentNumber ?? '';
    this.supplierNameSearch = this.suppliers.find((supplier) => supplier.id === entry.supplierId)?.companyName ?? entry.supplierName;
    this.entryUserName = entry.userName;
    this.lines = entry.lines
      .map((line) => {
        const product = this.data.products.find((item) => item.id === line.productId);
        return product ? { product, quantity: line.quantity, cost: line.unitCost } : null;
      })
      .filter((line): line is { product: ProductRecord; quantity: number; cost: number } => line !== null);
    this.editingLineIndex = null;
    this.lineEditor = { productId: 0, code: '', productName: '', quantity: 1, cost: 0 };
    this.activeTab = 'new';
    this.selectedEntry = null;
    this.message = mode === 'view' ? `Consulta de entrada ${entry.code}.` : `Editando entrada ${entry.code}.`;
  }

  private getEntryPayload(): ProductEntryPayload {
    return {
      supplierId: this.form.supplierId ? Number(this.form.supplierId) : null,
      supplierName: this.supplierNameSearch.trim(),
      date: this.form.date,
      reference: this.form.reference,
      purchaseOrder: this.form.purchaseOrder,
      supplierInvoiceDate: this.form.supplierInvoiceDate,
      userCode: this.form.userCode,
      userName: this.entryUserName,
      notes: this.form.notes,
      lines: this.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, unitCost: line.cost }))
    };
  }

  private async confirmEntryProducts(): Promise<boolean> {
    const currentProducts = await this.productsService.getProductsByIds(this.lines.map((line) => line.product.id));
    const productsById = new Map(currentProducts.map((product) => [product.id, product]));
    const unavailable = this.lines.filter((line) => {
      const current = productsById.get(line.product.id);
      return !current || current.code.trim().toLocaleLowerCase() !== line.product.code.trim().toLocaleLowerCase();
    });

    if (unavailable.length) {
      const descriptions = unavailable.map((line) => line.product.description).join(', ');
      this.message = `El producto seleccionado ya no existe o no pertenece a la empresa activa: ${descriptions}. Selecciónalo nuevamente.`;
      return false;
    }

    // Usa las filas recién verificadas, incluido el costo y la descripción
    // actualizados, antes de construir el envío a Supabase.
    this.lines = this.lines.map((line) => ({
      ...line,
      product: productsById.get(line.product.id)!
    }));
    return true;
  }

  private entrySaveErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : 'No se pudo registrar la entrada de producto.';
    if (/producto .*no pertenece a la empresa activa/i.test(message)) {
      return 'El producto seleccionado no pertenece a la empresa activa. Actualiza la página y vuelve a seleccionarlo desde la lista.';
    }
    return message;
  }

  private resetEntryEditor(): void {
    this.entryEditorMode = 'create';
    this.editingEntryId = null;
    this.editingEntryCode = '';
    this.form = { ...this.form, supplierId: 0, reference: '', purchaseOrder: '', receivedBy: '', userCode: '', notes: '' };
    this.supplierDocumentSearch = '';
    this.supplierNameSearch = '';
    this.supplierSearchResults = [];
    this.entryUserName = '';
    this.entryUsers = [];
    this.productSearchResults = [];
    this.lines = [];
    this.editingLineIndex = null;
    this.lineEditor = { productId: 0, code: '', productName: '', quantity: 1, cost: 0 };
    this.closeProductSuggestions();
  }

  private selectSupplier(supplier: SupplierRecord): void {
    this.form.supplierId = supplier.id;
    this.supplierDocumentSearch = supplier.documentNumber;
    this.supplierNameSearch = supplier.companyName;
    this.supplierSearchResults = [];
  }

  private async searchProducts(search: string, field: 'code' | 'description'): Promise<void> {
    const requestId = ++this.productSearchRequest;
    try {
      const results = await this.productsService.searchProducts(search);
      if (requestId !== this.productSearchRequest || this.productSuggestionField !== field) return;
      this.productSearchResults = results;
      this.data.products = [...results, ...this.data.products.filter((product) => !results.some((result) => result.id === product.id))];
      const exactProduct = field === 'code'
        ? results.find((product) => product.code.trim().toLocaleLowerCase() === search.trim().toLocaleLowerCase())
        : results.find((product) => this.getProductFullDescription(product).toLocaleLowerCase() === search.trim().toLocaleLowerCase());
        if (exactProduct) {
          this.applyProductSelection(exactProduct, false);
          if (field === 'code') this.focusEntryLineField('lineQuantity');
        }
    } catch {
      this.productSearchResults = [];
      this.message = 'No se pudieron consultar los productos.';
    }
  }

  private async searchSuppliers(search: string): Promise<void> {
    const requestId = ++this.supplierSearchRequest;
    try {
      const results = await this.suppliersService.searchSuppliers(search);
      if (requestId !== this.supplierSearchRequest) return;
      this.supplierSearchResults = results;
      this.data.suppliers = [...results, ...this.data.suppliers.filter((supplier) => !results.some((result) => result.id === supplier.id))];
      const exactSupplier = results.find((supplier) => supplier.companyName.trim().toLocaleLowerCase() === search.trim().toLocaleLowerCase());
      if (exactSupplier) this.selectSupplier(exactSupplier);
    } catch {
      this.supplierSearchResults = [];
      this.message = 'No se pudieron consultar los suplidores.';
    }
  }
}
