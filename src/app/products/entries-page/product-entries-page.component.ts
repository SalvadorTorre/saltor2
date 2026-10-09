import { Component, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { ProductFormModel, ProductRecord, SupplierFormModel, SupplierRecord } from '../../app.models';
import { ProductEntryPayload, ProductEntryRecord, ProductsService } from '../../core/services/products/products.service';
import { SuppliersService } from '../../core/services/suppliers/suppliers.service';
import { RncService } from '../../core/services/rnc/rnc.service';

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
  lineEditor = { productId: 0, code: '', productName: '', quantity: 1, cost: 0 };
  productSuggestionField: 'code' | 'description' | null = null;
  activeProductSuggestionIndex = 0;
  productSearchResults: ProductRecord[] = [];
  private productSearchRequest = 0;
  private supplierSearchRequest = 0;
  entryEditorMode: 'create' | 'view' | 'edit' = 'create';
  editingEntryId: number | null = null;
  editingEntryCode = '';
  lines: Array<{ product: ProductRecord; quantity: number; cost: number }> = [];
  productForm: ProductFormModel = this.emptyProductForm();
  supplierForm: SupplierFormModel = this.emptySupplierForm();

  constructor(
    public readonly data: AppDataService,
    private readonly productsService: ProductsService,
    private readonly suppliersService: SuppliersService,
    private readonly rncService: RncService,
    private readonly el: ElementRef<HTMLElement>
  ) {}

  get products(): ProductRecord[] { return this.data.products.filter((product) => product.status !== 'Inactivo'); }
  get suppliers(): SupplierRecord[] { return this.data.suppliers.filter((supplier) => supplier.status === 'Activo'); }
  get selectedProduct(): ProductRecord | null { return this.products.find((product) => product.id === Number(this.lineEditor.productId)) ?? null; }
  get selectedSupplier(): SupplierRecord | null { return this.suppliers.find((supplier) => supplier.id === Number(this.form.supplierId)) ?? null; }
  get entryTotal(): number { return this.lines.reduce((total, line) => total + line.quantity * line.cost, 0); }
  get entryCode(): string { return this.editingEntryCode || 'ENT-' + String(this.entries.length + 1).padStart(6, '0'); }
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

  async onSupplierDocumentEnter(event: Event): Promise<void> {
    event.preventDefault();
    const supplier = this.suppliers.find((item) => item.documentNumber.trim().toLocaleLowerCase() === this.supplierDocumentSearch.trim().toLocaleLowerCase())
      ?? this.filteredSupplierDocuments[0];
    if (supplier) {
      this.selectSupplier(supplier);
      return;
    }

    const rnc = this.supplierDocumentSearch.replace(/\D/g, '');
    if (!rnc) {
      this.message = 'Indica un RNC válido para consultar.';
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
      this.message = `RNC consultado en Megaplus y suplidor seleccionado: ${supplier.companyName}.`;
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No existe un suplidor registrado con ese RNC o cédula.';
    }
  }

  onSupplierSelectionChange(): void {
    const supplier = this.selectedSupplier;
    this.supplierDocumentSearch = supplier?.documentNumber ?? '';
  }

  ngOnInit(): void { void this.load(); }

  selectTab(tab: 'new' | 'consultation'): void {
    this.activeTab = tab;
    this.selectedEntry = null;
    if (tab === 'consultation') {
      void this.loadEntries();
      return;
    }
    if (this.entryEditorMode === 'create') this.resetEntryEditor();
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
    fields[currentIndex + 1]?.focus();
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
    const current = this.lines.find((line) => line.product.id === product.id);
    if (current) { current.quantity += quantity; current.cost = cost; }
    else this.lines.push({ product, quantity, cost });
    this.lineEditor = { productId: 0, code: '', productName: '', quantity: 1, cost: 0 };
    this.closeProductSuggestions();
  }

  removeLine(index: number): void { this.lines.splice(index, 1); }

  async save(): Promise<void> {
    if (!this.form.supplierId || !this.selectedSupplier) {
      this.message = 'Selecciona el nombre del suplidor antes de guardar la entrada.';
      return;
    }
    if (!this.lines.length) { this.message = 'Agrega al menos un producto a la entrada.'; return; }

    this.isSaving = true;
    this.message = '';
    try {
      const payload = this.getEntryPayload();
      if (this.entryEditorMode === 'edit' && this.editingEntryId) await this.productsService.updateEntry(this.editingEntryId, payload);
      else await this.productsService.createEntry(payload);
      await this.load();
      this.message = this.entryEditorMode === 'edit' ? 'Entrada actualizada correctamente.' : 'Entrada registrada correctamente.';
      this.resetEntryEditor();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'No se pudo registrar la entrada de producto.';
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

  private async load(): Promise<void> {
    this.isLoading = true;
    try {
      const [products, suppliers] = await Promise.all([this.productsService.getProducts(), this.suppliersService.getSuppliers()]);
      this.data.products = products;
      this.data.suppliers = suppliers;
      await this.loadEntries();
    } catch { this.message = 'No se pudieron actualizar los datos. Se muestran los datos disponibles.'; }
    finally { this.isLoading = false; }
  }

  private async loadEntries(): Promise<void> {
    try { this.entries = await this.productsService.getEntries(); }
    catch (error) { this.message = error instanceof Error ? error.message : 'No se pudieron cargar las entradas.'; }
  }

  private emptyProductForm(): ProductFormModel {
    return { code: '', description: '', unit: 'Unidad', category: 'General', location: '', brand: '', type: '', size: '', stock: 0, minimumStock: 0, cost: 0, salePrice: 0, minimumPrice: 0, wholesaleEnabled: false, wholesalePrice: 0, minimumSaleQuantity: 1, minimumWholesaleQuantity: 0, replacementEnabled: false, replacementCode: '', exemptItbis: false, taxValue: 18, status: 'Activo' };
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
    this.lines = entry.lines
      .map((line) => {
        const product = this.data.products.find((item) => item.id === line.productId);
        return product ? { product, quantity: line.quantity, cost: line.unitCost } : null;
      })
      .filter((line): line is { product: ProductRecord; quantity: number; cost: number } => line !== null);
    this.lineEditor = { productId: 0, code: '', productName: '', quantity: 1, cost: 0 };
    this.activeTab = 'new';
    this.selectedEntry = null;
    this.message = mode === 'view' ? `Consulta de entrada ${entry.code}.` : `Editando entrada ${entry.code}.`;
  }

  private getEntryPayload(): ProductEntryPayload {
    return {
      supplierId: Number(this.form.supplierId),
      date: this.form.date,
      reference: this.form.reference,
      purchaseOrder: this.form.purchaseOrder,
      supplierInvoiceDate: this.form.supplierInvoiceDate,
      userCode: this.form.userCode,
      userName: this.data.userName,
      notes: this.form.notes,
      lines: this.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, unitCost: line.cost }))
    };
  }

  private resetEntryEditor(): void {
    this.entryEditorMode = 'create';
    this.editingEntryId = null;
    this.editingEntryCode = '';
    this.form = { ...this.form, supplierId: 0, reference: '', purchaseOrder: '', receivedBy: '', userCode: '', notes: '' };
    this.supplierDocumentSearch = '';
    this.supplierNameSearch = '';
    this.supplierSearchResults = [];
    this.productSearchResults = [];
    this.lines = [];
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
