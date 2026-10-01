import { Component, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InvoiceFormModel, InvoiceLine, ClientRecord, ProductRecord, NcfSequence, NcfType, RncRecord } from '../../app.models';
import { AppDataService } from '../../app-data.service';
import { DgiiInvoiceStatus, EditableInvoiceData, InvoiceRow, InvoicesService } from '../../core/services/invoices/invoices.service';
import { InvoiceConsultationPageComponent } from '../consultation-page/consultation-page.component';
import { NcfTypesService } from '../../core/services/ncf-types/ncf-types.service';
import { ProductsService } from '../../core/services/products/products.service';
import { RncService } from '../../core/services/rnc/rnc.service';
import { ClientsService } from '../../core/services/clients/clients.service';
import { PaymentMethod, PaymentMethodsService } from '../../core/services/payment-methods/payment-methods.service';
import { EcfService } from '../../core/services/ecf/ecf.service';

interface InvoiceFormModelExtended extends InvoiceFormModel {
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  customerCity: string;
}

@Component({
  selector: 'app-invoice-new-page',
  standalone: true,
  imports: [CommonModule, FormsModule, InvoiceConsultationPageComponent],
  templateUrl: './new-page.component.html',
  styleUrls: ['./new-page.component.scss']
})
export class InvoiceNewPageComponent implements OnInit {
  billingTab: 'create' | 'consultation' = 'create';
  ncfTypes: string[] = [];
  paymentMethods: PaymentMethod[] = [];
  paymentMethodCode = 1;

  get products(): ProductRecord[] {
    return this.data.products;
  }

  get clients(): ClientRecord[] {
    return this.data.clients;
  }

  get filteredRncClients(): ClientRecord[] {
    const q = this.invoiceForm.rnc.trim().toLowerCase();
    if (!q) return this.clients.slice(0, 50);
    return this.clients.filter((c) => c.documentNumber.toLowerCase().includes(q)).slice(0, 50);
  }

  get filteredRncRecords(): RncRecord[] {
    const q = this.invoiceForm.rnc.trim().toLowerCase();
    if (!q) return [];
    return this.data.rncRecords.filter((r) => r.rnc.toLowerCase().includes(q)).slice(0, 50);
  }

  get allRncSuggestions(): { source: 'client' | 'rnc'; client?: ClientRecord; record?: RncRecord; displayLabel: string; displayValue: string; }[] {
    const q = this.invoiceForm.rnc.trim().toLowerCase();
    if (!q) return [];
    const fromClients = this.filteredRncClients.map((c) => ({
      source: 'client' as const,
      client: c,
      displayLabel: `${c.documentNumber} - ${c.fullName}${c.companyName ? ` (${c.companyName})` : ''}`,
      displayValue: c.documentNumber
    }));
    const usedDocs = new Set(fromClients.map((x) => x.displayValue.toLowerCase()));
    const fromRncRecords = this.filteredRncRecords
      .filter((r) => !usedDocs.has(r.rnc.toLowerCase()))
      .map((r) => ({
        source: 'rnc' as const,
        record: r,
        displayLabel: `${r.rnc} - ${r.legalName} [RNC DGII]`,
        displayValue: r.rnc
      }));
    return [...fromClients, ...fromRncRecords].slice(0, 50);
  }

  get filteredCustomerClients(): ClientRecord[] {
    const q = this.invoiceForm.customerName.trim().toLowerCase();
    if (!q) return this.clients.slice(0, 50);
    return this.clients
      .filter((c) => {
        const byName = c.fullName.toLowerCase().includes(q);
        const byDoc = c.documentNumber.toLowerCase().includes(q);
        const byCompany = (c.companyName ?? '').toLowerCase().includes(q);
        return byName || byDoc || byCompany;
      })
      .slice(0, 50);
  }

  ncfSequences: NcfSequence[] = [
    {
      id: 1,
      companyId: 1,
      ncfType: '01 - Credito Fiscal',
      series: 'E31',
      rangeStart: 'E3100000001',
      rangeEnd: 'E3100000500',
      authorizedAt: '01/01/2026',
      expiresAt: '30/12/2026',
      used: 124,
      total: 500,
      status: 'Activa',
      alert: false,
      alertPercent: 80
    },
    {
      id: 2,
      companyId: 1,
      ncfType: '02 - Consumo',
      series: 'E32',
      rangeStart: 'E3200000001',
      rangeEnd: 'E3200001000',
      authorizedAt: '01/01/2026',
      expiresAt: '30/12/2026',
      used: 849,
      total: 1000,
      status: 'Activa',
      alert: true,
      alertPercent: 80
    },
    {
      id: 3,
      companyId: 2,
      ncfType: '01 - Credito Fiscal',
      series: 'E41',
      rangeStart: 'E4100000001',
      rangeEnd: 'E4100000300',
      authorizedAt: '15/01/2026',
      expiresAt: '15/12/2026',
      used: 300,
      total: 300,
      status: 'Agotada',
      alert: true,
      alertPercent: 80
    },
    {
      id: 4,
      companyId: 3,
      ncfType: '04 - Nota de Credito',
      series: 'B11',
      rangeStart: 'B1100000001',
      rangeEnd: 'B1100000200',
      authorizedAt: '01/02/2025',
      expiresAt: '01/02/2026',
      used: 88,
      total: 200,
      status: 'Vencida',
      alert: false,
      alertPercent: 80
    },
    {
      id: 5,
      companyId: 2,
      ncfType: '14 - Regimen Especial',
      series: 'A12',
      rangeStart: 'A1200000001',
      rangeEnd: 'A1200000400',
      authorizedAt: '01/03/2026',
      expiresAt: '01/03/2027',
      used: 120,
      total: 400,
      status: 'Activa',
      alert: false,
      alertPercent: 80
    }
  ];

  selectedClient: ClientRecord | null = null;
  invoiceCounter = 1;
  invoiceMessage = 'Completa la informacion y agrega productos para generar la factura.';
  invoiceForm: InvoiceFormModelExtended = {
    customerId: null,
    customerName: '',
    rnc: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    ncfType: '02 - Consumo',
    ncf: '',
    paymentMethod: 'Contado',
    notes: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    customerCity: ''
  };
  invoiceLines: InvoiceLine[] = [];
  readonly invoiceTableRowCount = 10;
  isSavingInvoice = false;
  isClearConfirmationVisible = false;
  isRncInvalid = false;
  isSendingDgii = false;
  isDgiiSendConfirmationVisible = false;
  dgiiDialog: 'processing' | 'success' | 'error' | null = null;
  dgiiDialogMessage = '';
  savedInvoice: InvoiceRow | null = null;
  private editingExistingInvoiceId: number | null = null;
  private nextInvoiceLineId = 1;

  editingLineId: number | null = null;
  lineEditorForm = {
    code: '',
    productName: '',
    productId: null as number | null,
    quantity: 1,
    unitPrice: 0,
    total: 0
  };
  lineEditorMessage = '';
  productSuggestionField: 'code' | 'name' | null = null;
  activeProductSuggestionIndex = 0;

  private readonly defaultNcfElectronic31 = '31 - Factura de Credito Fiscal Electronica';
  private readonly defaultNcfElectronic32 = '32 - Factura de Consumo Electronica';

  constructor(
    public data: AppDataService,
    private el: ElementRef<HTMLElement>,
    private readonly invoicesService: InvoicesService,
    private readonly ncfTypesService: NcfTypesService,
    private readonly productsService: ProductsService,
    private readonly rncService: RncService,
    private readonly clientsService: ClientsService,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly ecfService: EcfService
  ) {
    this.ncfTypes = this.toNcfOptions(this.data.ncfTypeList);
    this.startNewInvoice();
  }

  ngOnInit(): void {
    void this.loadProducts();
    void this.loadNcfTypes();
    void this.loadRncRecords();
    void this.loadClients();
    void this.loadPaymentMethods();
    this.startNewInvoice();
    this.restoreQuotationDraft();
    this.focusRncField();
  }

  private focusRncField(): void {
    setTimeout(() => {
      const root = this.el.nativeElement;
      const rncInput = root.querySelector<HTMLInputElement>('input[list="invoiceRncDatalist"]');
      if (rncInput) {
        rncInput.focus();
        try {
          rncInput.select();
        } catch {}
      }
    }, 50);
  }

  focusNextField(event: Event): void {
    event.preventDefault();
    if (!(event.target instanceof HTMLElement)) return;
    const root = this.el.nativeElement;
    const selectors =
      'input:not([readonly]):not([disabled]), select:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])';
    const fields = Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selectors)).filter(
      (el) =>
        !el.hasAttribute('disabled') &&
        el.getAttribute('readonly') !== 'true' &&
        el.offsetParent !== null &&
        el.getAttribute('tabindex') !== '-1' &&
        el.getAttribute('name') !== 'invoiceNcfType'
    );
    const idx = fields.indexOf(event.target as any);
    if (idx === -1) return;
    const next = fields[idx + 1];
    if (next) {
      next.focus();
      if ('select' in next && typeof (next as any).select === 'function') {
        try {
          (next as HTMLInputElement).select();
        } catch {}
      }
    }
  }

  get lineEditorIsEditing(): boolean {
    return this.editingLineId !== null;
  }

  // get lineEditorLabel(): string {
  //   return this.editingLineId !== null ? `Editando linea #${this.editingLineId}` : 'Agregar nueva linea';
  // }

  get invoiceSubtotal(): number {
    return this.invoiceLines.reduce((sum, line) => sum + (line.lineTotal - line.taxAmount), 0);
  }

  get invoiceTaxTotal(): number {
    return this.invoiceLines.reduce((sum, line) => sum + line.taxAmount, 0);
  }

  get invoiceGrandTotal(): number {
    return this.invoiceLines.reduce((sum, line) => sum + line.lineTotal, 0);
  }

  get invoiceSaved(): boolean {
    return this.savedInvoice !== null;
  }

  get availableNcfTypes(): string[] {
    const activeTypes = this.data.ncfTypeList.filter((type) => type.status === 'Activa');
    const allowedTypes = this.hasValidInvoiceRnc
      ? activeTypes.filter((type) => type.type === 1 && type.code !== '32')
      : activeTypes.filter((type) => type.code === '32');
    return this.toNcfOptions(allowedTypes);
  }

  get isEditingExistingInvoice(): boolean {
    return this.editingExistingInvoiceId !== null;
  }

  get dgiiStatus(): DgiiInvoiceStatus {
    return this.savedInvoice?.dgii_estado ?? 'No enviado';
  }

  get canSendToDgii(): boolean {
    return !['Aceptado', 'Rechazado'].includes(this.dgiiStatus);
  }

  get emptyInvoiceTableRows(): number[] {
    return Array.from({ length: Math.max(0, this.invoiceTableRowCount - this.invoiceLines.length) });
  }

  get invoiceCustomer(): ClientRecord | undefined {
    const id = this.invoiceForm.customerId;
    if (!id) {
      return undefined;
    }
    return this.clients.find((client) => client.id === id);
  }

  getInvoiceProductCode(productId: number | null): string {
    if (!productId) {
      return '---';
    }
    return this.products.find((p) => p.id === productId)?.code ?? '---';
  }

  private getProductById(id: number | null): ProductRecord | undefined {
    if (!id) return undefined;
    return this.products.find((p) => p.id === id);
  }

  get productSuggestions(): ProductRecord[] {
    const input = this.productSuggestionField === 'code'
      ? this.lineEditorForm.code
      : this.lineEditorForm.productName;
    const search = input.trim().toLocaleLowerCase();
    if (!search) return [];

    const matchesAtStart = (value: string) => value.trim().toLocaleLowerCase().startsWith(search);
    const sortByDescription = (products: ProductRecord[]) => products
      .sort((a, b) => a.description.localeCompare(b.description, 'es', { sensitivity: 'base' }))
      .slice(0, 8);

    if (this.productSuggestionField === 'code') {
      return sortByDescription(this.products.filter((product) => matchesAtStart(product.code)));
    }

    const startsWithProductText = this.products.filter((product) => this.getProductFullDescription(product).toLocaleLowerCase().startsWith(search));
    if (startsWithProductText.length) {
      return sortByDescription(startsWithProductText);
    }

    return sortByDescription(
      this.products.filter((product) => this.getProductFullDescription(product).toLocaleLowerCase().includes(search))
    );
  }

  isActiveProductSuggestion(index: number): boolean {
    return index === this.activeProductSuggestionIndex;
  }

  resetLineEditor(): void {
    // this.editingLineId = null;
    this.lineEditorForm = {
      code: '',
      productName: '',
      productId: null,
      quantity: 1,
      unitPrice: 0,
      total: 0
    };
    this.lineEditorMessage = '';
    this.closeProductSuggestions();
  }

  private recalcLineEditorTotal(): void {
    const qty = Number(this.lineEditorForm.quantity) || 0;
    const price = Number(this.lineEditorForm.unitPrice) || 0;
    this.lineEditorForm.total = qty * price;
  }

  onLineEditorCodeChange(): void {
    this.lineEditorMessage = '';
    this.productSuggestionField = 'code';
    this.activeProductSuggestionIndex = 0;
    const input = this.lineEditorForm.code.trim();
    if (!input) {
      this.lineEditorForm.productId = null;
      this.lineEditorForm.productName = '';
      this.lineEditorForm.unitPrice = 0;
      this.recalcLineEditorTotal();
      return;
    }
    const product = this.products.find((p) => p.code.trim().toLowerCase() === input.toLowerCase());
    if (product) {
      this.applyProductSelection(product, false);
    } else {
      this.lineEditorForm.productId = null;
      this.lineEditorForm.productName = '';
      this.lineEditorForm.unitPrice = 0;
    }
    this.recalcLineEditorTotal();
  }

  onLineEditorProductChange(): void {
    this.lineEditorMessage = '';
    this.productSuggestionField = 'name';
    this.activeProductSuggestionIndex = 0;
    const input = this.lineEditorForm.productName.trim();
    if (!input) {
      this.lineEditorForm.productId = null;
      this.lineEditorForm.code = '';
      this.lineEditorForm.unitPrice = 0;
      this.recalcLineEditorTotal();
      return;
    }
    const product = this.products.find((p) => {
      const byDesc = this.getProductFullDescription(p).toLowerCase() === input.toLowerCase();
      const byCode = p.code.trim().toLowerCase() === input.toLowerCase();
      return byDesc || byCode;
    });
    if (product) {
      this.applyProductSelection(product, false);
    } else {
      this.lineEditorForm.productId = null;
      this.lineEditorForm.code = '';
      this.lineEditorForm.unitPrice = 0;
    }
    this.recalcLineEditorTotal();
  }

  onLineEditorCodeEnter(event: Event): void {
    event.preventDefault();
    if (!this.lineEditorForm.code.trim()) {
      this.closeProductSuggestions();
      this.focusLineEditorProductName();
      return;
    }
    if (this.selectActiveProductSuggestion()) {
      this.focusLineEditorQuantity();
      return;
    }
    this.lineEditorMessage = `El codigo "${this.lineEditorForm.code.trim()}" no existe. Verifica el codigo e intenta de nuevo.`;
    this.focusLineEditorCode();
  }

  onLineEditorProductEnter(event: Event): void {
    event.preventDefault();
    if (this.selectActiveProductSuggestion()) {
      this.focusLineEditorQuantity();
      return;
    }
    if (!this.lineEditorForm.productName.trim()) {
      this.lineEditorMessage = 'El campo Producto es obligatorio.';
    } else {
      this.lineEditorMessage = `No existe un producto llamado "${this.lineEditorForm.productName.trim()}". Selecciona uno de la lista.`;
    }
    this.focusLineEditorProductName();
  }

  onLineEditorSuggestionKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    const suggestions = this.productSuggestions;
    if (event.key === 'Enter') return;
    if (event.key === 'Escape') {
      this.closeProductSuggestions();
      return;
    }
    if (!suggestions.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;

    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    this.activeProductSuggestionIndex =
      (this.activeProductSuggestionIndex + direction + suggestions.length) % suggestions.length;
  }

  onLineEditorFieldFocus(field: 'code' | 'name'): void {
    this.productSuggestionField = field;
    this.activeProductSuggestionIndex = 0;
  }

  onLineEditorFieldBlur(): void {
    window.setTimeout(() => {
      const activeElement = this.el.nativeElement.ownerDocument.activeElement;
      const isProductSearchField = activeElement instanceof HTMLInputElement
        && ['lineEditorCode', 'lineEditorProduct'].includes(activeElement.name);
      if (!isProductSearchField) {
        this.closeProductSuggestions();
      }
    }, 120);
  }

  selectProductSuggestion(product: ProductRecord): void {
    this.applyProductSelection(product);
  }

  private selectActiveProductSuggestion(): boolean {
    const product = this.productSuggestions[this.activeProductSuggestionIndex];
    if (product) {
      this.applyProductSelection(product);
      return true;
    }
    return false;
  }

  private applyProductSelection(product: ProductRecord, closeSuggestions = true): void {
    this.lineEditorForm.productId = product.id;
    this.lineEditorForm.productName = this.getProductFullDescription(product);
    this.lineEditorForm.code = product.code;
    this.applyProductPriceForQuantity(product);
    this.lineEditorMessage = '';
    this.recalcLineEditorTotal();
    if (closeSuggestions) {
      this.closeProductSuggestions();
    }
  }

  private applyProductPriceForQuantity(product: ProductRecord): void {
    const quantity = Number(this.lineEditorForm.quantity) || 0;
    const appliesWholesale = product.minimumWholesaleQuantity > 0
      && quantity >= product.minimumWholesaleQuantity
      && product.wholesalePrice > 0;
    const price = appliesWholesale ? product.wholesalePrice : product.salePrice;
    this.lineEditorForm.unitPrice = this.getInvoiceUnitPrice(product, price);
  }

  getProductFullDescription(product: ProductRecord): string {
    return [product.description, product.brand, product.type, product.size]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' ');
  }

  onNcfTypeChange(): void {
    this.invoiceLines = this.invoiceLines.map((line) => {
      const product = this.getProductById(line.productId);
      if (!product) return line;

      const taxRate = this.getInvoiceTaxRate(product);
      const usesWholesalePrice = product.minimumWholesaleQuantity > 0
        && line.quantity >= product.minimumWholesaleQuantity
        && product.wholesalePrice > 0;
      const normalPrice = usesWholesalePrice ? product.wholesalePrice : product.salePrice;
      const price = this.isSpecialRegimeInvoice
        ? this.getInvoiceUnitPrice(product, line.unitPrice, line.taxRate)
        : normalPrice;
      const lineTotal = line.quantity * price;
      return { ...line, unitPrice: price, taxRate, taxAmount: 0, lineTotal };
    });

    const selectedProduct = this.getProductById(this.lineEditorForm.productId);
    if (selectedProduct) {
      this.applyProductPriceForQuantity(selectedProduct);
      this.recalcLineEditorTotal();
    }
  }

  private get isSpecialRegimeInvoice(): boolean {
    const ncfType = this.invoiceForm.ncfType.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /^44(?:\s|-|$)/.test(ncfType) || ncfType.includes('regimen especial');
  }

  private getInvoiceTaxRate(product: ProductRecord): number {
    return this.isSpecialRegimeInvoice || product.exemptItbis ? 0 : product.taxValue;
  }

  private getInvoiceUnitPrice(product: ProductRecord, price: number, currentTaxRate?: number): number {
    if (!this.isSpecialRegimeInvoice || product.exemptItbis) return price;
    const taxRate = currentTaxRate ?? product.taxValue;
    return taxRate > 0 ? price / (1 + (taxRate / 100)) : price;
  }

  private closeProductSuggestions(): void {
    this.productSuggestionField = null;
    this.activeProductSuggestionIndex = 0;
  }

  private focusLineEditorProductName(): void {
    const productNameInput = this.el.nativeElement.querySelector<HTMLInputElement>('input[name="lineEditorProduct"]');
    productNameInput?.focus();
  }

  private focusLineEditorCode(): void {
    const codeInput = this.el.nativeElement.querySelector<HTMLInputElement>('input[name="lineEditorCode"]');
    codeInput?.focus();
    codeInput?.select();
  }

  private focusLineEditorQuantity(): void {
    const quantityInput = this.el.nativeElement.querySelector<HTMLInputElement>('input[name="lineEditorQuantity"]');
    quantityInput?.focus();
    quantityInput?.select();
  }

  onLineEditorQtyChange(): void {
    const qty = Number(this.lineEditorForm.quantity);
    this.lineEditorForm.quantity = isNaN(qty) ? 0 : qty;
    if (this.lineEditorForm.quantity <= 0) {
      this.lineEditorMessage = 'La cantidad debe ser mayor que cero.';
    } else {
      this.lineEditorMessage = '';
    }
    const product = this.getProductById(this.lineEditorForm.productId);
    if (product && this.lineEditorForm.quantity > 0) {
      this.applyProductPriceForQuantity(product);
    }
    this.recalcLineEditorTotal();
  }

  onLineEditorPriceChange(): void {
    const price = Number(this.lineEditorForm.unitPrice);
    this.lineEditorForm.unitPrice = isNaN(price) || price < 0 ? 0 : price;
    this.recalcLineEditorTotal();
  }

  onEditorPriceEnter(event: Event): void {
    event.preventDefault();
    if (!this.saveEditorLineToInvoice()) return;
    if (!this.editingLineId) {
      const root = this.el.nativeElement;
      const firstCode = root.querySelector<HTMLInputElement>('input[name="lineEditorCode"]');
      if (firstCode) {
        firstCode.focus();
        try {
          firstCode.select();
        } catch {}
      }
    }
  }

  editInvoiceLine(lineId: number): void {
    const line = this.invoiceLines.find((l) => l.id === lineId);
    if (!line) return;
    const product = this.getProductById(line.productId);
    this.editingLineId = lineId;
    this.lineEditorForm = {
      code: product?.code ?? '',
      productName: product?.description ?? line.description,
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.quantity * line.unitPrice
    };
  }

  cancelEditLine(): void {
    this.resetLineEditor();
  }

  saveEditorLineToInvoice(): boolean {
    const product = this.getProductById(this.lineEditorForm.productId);
    if (!product || !this.lineEditorForm.productName.trim()) {
      this.lineEditorMessage = 'El campo Producto es obligatorio. Selecciona un producto de la lista antes de agregar la linea.';
      if (this.lineEditorForm.code.trim()) {
        this.focusLineEditorCode();
      } else {
        this.focusLineEditorProductName();
      }
      return false;
    }

    const qty = Number(this.lineEditorForm.quantity) || 0;
    const price = Number(this.lineEditorForm.unitPrice) || 0;
    if (qty <= 0 || price <= 0) {
      this.lineEditorMessage = 'Ingresa cantidad y precio mayores a 0 antes de agregar la linea.';
      return false;
    }
    if (qty < product.minimumSaleQuantity) {
      this.lineEditorMessage = `La cantidad minima de venta de ${product.description} es ${product.minimumSaleQuantity}.`;
      return false;
    }
    const isWholesaleSale = product.minimumWholesaleQuantity > 0
      && product.wholesalePrice > 0
      && qty >= product.minimumWholesaleQuantity;
    const minimumAllowedPrice = this.getInvoiceUnitPrice(product, isWholesaleSale ? product.wholesalePrice : product.minimumPrice);
    const minimumAllowedCost = this.getInvoiceUnitPrice(product, product.cost);
    if (price <= minimumAllowedCost || price < minimumAllowedPrice) {
      this.lineEditorMessage = isWholesaleSale
        ? `La venta al por mayor requiere un precio minimo de RD$${minimumAllowedPrice.toFixed(2)}.`
        : `El precio no puede ser menor a RD$${minimumAllowedPrice.toFixed(2)} ni igual o menor al costo.`;
      return false;
    }
    const description = this.getProductFullDescription(product);
    const taxRate = this.getInvoiceTaxRate(product);
    const lineTotal = qty * price;
    const taxAmount = taxRate > 0 ? lineTotal - (lineTotal / (1 + (taxRate / 100))) : 0;

    if (this.editingLineId !== null) {
      const lineId = this.editingLineId;
      this.invoiceLines = this.invoiceLines.map((line) => {
        if (line.id !== lineId) return line;
        return {
          ...line,
          productId: this.lineEditorForm.productId,
          description,
          quantity: qty,
          unitPrice: price,
          taxRate,
          taxAmount,
          lineTotal
        };
      });
      this.invoiceMessage = `Linea #${lineId} actualizada.`;
    } else {
      const newLine: InvoiceLine = {
        id: this.nextInvoiceLineId++,
        productId: this.lineEditorForm.productId,
        description,
        quantity: qty,
        unitPrice: price,
        taxRate,
        taxAmount,
        lineTotal
      };
      this.invoiceLines = [...this.invoiceLines, newLine];
      this.invoiceMessage = `Linea #${newLine.id} agregada.`;
    }
    this.resetLineEditor();
    return true;
  }

  startNewInvoice(): void {
    this.selectedClient = null;
    this.invoiceForm = {
      customerId: null,
      customerName: '',
      rnc: '',
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      ncfType: this.getNcfOptionBySeriesOrCode(this.defaultNcfElectronic32),
      ncf: '',
      paymentMethod: 'Contado',
      notes: '',
      customerPhone: '',
      customerEmail: '',
      customerAddress: '',
      customerCity: ''
    };
    this.paymentMethodCode = 1;
    this.invoiceLines = [];
    this.savedInvoice = null;
    this.editingExistingInvoiceId = null;
    this.nextInvoiceLineId = 1;
    this.editingLineId = null;
    this.invoiceMessage = 'Completa la informacion y agrega productos para generar la factura.';
    this.resetLineEditor();
    this.closeProductSuggestions();
  }

  private restoreQuotationDraft(): void {
    const rawDraft = sessionStorage.getItem('saltor.quotationInvoiceDraft');
    if (!rawDraft) return;
    sessionStorage.removeItem('saltor.quotationInvoiceDraft');
    try {
      const quotation = JSON.parse(rawDraft) as {
        number: string; date: string; customer: string; rnc: string; phone: string; email: string; address: string; notes: string;
        lines: { code: string; description: string; quantity: number; price: number; itbis: number }[];
      };
      const client = this.clients.find((item) => item.documentNumber.trim() === quotation.rnc.trim());
      this.invoiceForm = {
        ...this.invoiceForm,
        customerId: client?.id ?? null,
        customerName: quotation.customer,
        rnc: quotation.rnc,
        invoiceDate: quotation.date || this.invoiceForm.invoiceDate,
        notes: [quotation.notes, `Generada desde cotización ${quotation.number}.`].filter(Boolean).join(' '),
        customerPhone: quotation.phone,
        customerEmail: quotation.email,
        customerAddress: quotation.address
      };
      this.invoiceLines = quotation.lines.map((line, index) => {
        const product = this.products.find((item) => item.code.trim().toLowerCase() === line.code.trim().toLowerCase());
        const taxRate = Number(line.itbis) || 0;
        const unitPrice = Number(line.price) * (1 + taxRate / 100);
        const lineTotal = Number(line.quantity) * unitPrice;
        return { id: index + 1, productId: product?.id ?? null, description: line.description, quantity: Number(line.quantity), unitPrice, taxRate, taxAmount: taxRate ? lineTotal - (lineTotal / (1 + taxRate / 100)) : 0, lineTotal };
      });
      this.nextInvoiceLineId = this.invoiceLines.length + 1;
      this.invoiceMessage = `Factura preparada desde la cotización ${quotation.number}.`;
    } catch {
      this.invoiceMessage = 'No se pudieron transferir los datos de la cotización.';
    }
  }

  private get invoiceHasData(): boolean {
    if (this.invoiceLines.length > 0) return true;
    if (this.invoiceForm.invoiceNumber) return true;
    if (this.invoiceForm.customerName || this.invoiceForm.rnc) return true;
    if (this.invoiceForm.notes) return true;
    if (this.lineEditorForm.code || this.lineEditorForm.productName) return true;
    return false;
  }

  requestClearInvoice(): void {
    if (this.invoiceHasData) {
      this.isClearConfirmationVisible = true;
      this.invoiceMessage = 'Confirma si deseas limpiar la factura actual.';
      return;
    }
    this.clearInvoice();
  }

  cancelInvoiceClear(): void {
    this.isClearConfirmationVisible = false;
    this.invoiceMessage = 'La factura no fue limpiada.';
  }

  confirmInvoiceClear(): void {
    this.clearInvoice();
  }

  clearInvoice(silent = false): void {
    this.isClearConfirmationVisible = false;
    this.selectedClient = null as any;
    this.invoiceForm = {
      customerId: null,
      customerName: '',
      rnc: '',
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      ncfType: this.getNcfOptionBySeriesOrCode(this.defaultNcfElectronic32),
      ncf: '',
      paymentMethod: 'Contado',
      notes: '',
      customerPhone: '',
      customerEmail: '',
      customerAddress: '',
      customerCity: ''
    };
    this.paymentMethodCode = 1;
    this.invoiceLines = [];
    this.savedInvoice = null;
    this.editingExistingInvoiceId = null;
    this.nextInvoiceLineId = 1;
    this.editingLineId = null;
    this.invoiceMessage = silent ? '' : 'Factura limpiada. Completa la informacion y agrega productos para generar la factura.';
    this.lineEditorMessage = '';
    this.resetLineEditor();
    this.closeProductSuggestions();
    this.focusRncField();
  }

  private populateCustomerFields(client: ClientRecord): void {
    this.invoiceForm.customerId = client.id;
    this.invoiceForm.customerName = client.fullName;
    this.invoiceForm.rnc = client.documentType === 'RNC' ? client.documentNumber : this.invoiceForm.rnc;
    this.invoiceForm.customerPhone = client.phone ?? '';
    this.invoiceForm.customerEmail = client.email ?? '';
    this.invoiceForm.customerAddress = client.address ?? '';
    this.invoiceForm.customerCity = client.city ?? '';
  }

  private populateCustomerFromRncRecord(record: RncRecord): void {
    this.invoiceForm.customerId = null;
    this.invoiceForm.customerName = record.tradeName?.trim() ? record.tradeName : record.legalName;
    this.invoiceForm.rnc = record.rnc;
    this.invoiceForm.customerPhone = record.phone ?? '';
    this.invoiceForm.customerEmail = record.email ?? '';
    this.invoiceForm.customerAddress = record.address ?? '';
    this.invoiceForm.customerCity = '';
  }

  private clearCustomerFields(): void {
    this.invoiceForm.customerId = null;
    this.invoiceForm.customerPhone = '';
    this.invoiceForm.customerEmail = '';
    this.invoiceForm.customerAddress = '';
    this.invoiceForm.customerCity = '';
  }

  onInvoiceRncChange(): void {
    const rnc = this.invoiceForm.rnc.trim();
    if (!rnc) {
      this.isRncInvalid = false;
      this.clearCustomerFields();
      this.applyNcfTypeByRnc(null);
      this.invoiceMessage = 'Completa la informacion y agrega productos para generar la factura.';
      return;
    }
    const exactClient = this.findClientByRnc(rnc);
    if (exactClient) {
      this.isRncInvalid = false;
      this.populateCustomerFields(exactClient);
      this.applyNcfTypeByRnc(exactClient);
      this.invoiceMessage = `Cliente registrado: ${exactClient.fullName} (RNC ${exactClient.documentNumber}).`;
      return;
    }
    const exactRnc = this.findRncRecord(rnc);
    if (exactRnc) {
      this.isRncInvalid = false;
      this.populateCustomerFromRncRecord(exactRnc);
      this.applyNcfTypeByRnc(null);
      this.invoiceMessage = `RNC registrado: ${exactRnc.legalName} (${exactRnc.rnc}).`;
      return;
    }
    this.isRncInvalid = true;
    this.clearCustomerFields();
    this.invoiceMessage = 'RNC invalido. Debe estar registrado en Clientes o en el catalogo RNC.';
  }

  onInvoiceCustomerNameChange(): void {
    const input = this.invoiceForm.customerName.trim();
    if (!input) {
      this.clearCustomerFields();
      this.applyNcfTypeByRnc(null);
      this.invoiceMessage = 'Completa la informacion y agrega productos para generar la factura.';
      return;
    }
    const exact = this.clients.find((c) => {
      const byName = c.fullName.trim().toLowerCase() === input.toLowerCase();
      const byDoc = c.documentNumber.trim().toLowerCase() === input.toLowerCase();
      return byName || byDoc;
    });
    if (exact) {
      this.populateCustomerFields(exact);
      this.applyNcfTypeByRnc(exact);
      this.invoiceMessage = `Cliente seleccionado: ${exact.fullName}${exact.documentType === 'RNC' ? ` (RNC ${exact.documentNumber})` : ''}.`;
      return;
    }
    const firstMatch =
      this.clients.find((c) => {
        const byName = c.fullName.toLowerCase().includes(input.toLowerCase());
        const byDoc = c.documentNumber.toLowerCase().includes(input.toLowerCase());
        const byCompany = (c.companyName ?? '').toLowerCase().includes(input.toLowerCase());
        return byName || byDoc || byCompany;
      }) ?? null;
    if (firstMatch) {
      this.invoiceMessage = `Coincidencia parcial: presiona Enter para cargar a "${firstMatch.fullName}".`;
      this.invoiceForm.customerId = null;
      this.applyNcfTypeByRnc(null);
      return;
    }
    this.invoiceForm.customerId = null;
    this.applyNcfTypeByRnc(null);
    this.invoiceMessage = `Cliente libre: "${input}" (no registrado). Puedes continuar facturando.`;
  }

  onInvoiceRncEnter(event: Event): void {
    event.preventDefault();
    this.onInvoiceRncChange();
    if (this.isRncInvalid) {
      this.focusRncField();
      return;
    }
    this.focusNextField(event);
  }

  onInvoiceCustomerBlur(): void {
    if (this.invoiceForm.customerName.trim()) return;
    this.invoiceForm.customerId = null;
    this.invoiceForm.customerName = 'CLIENTE CONTADO';
    this.clearCustomerFields();
    this.applyNcfTypeByRnc(null);
    this.invoiceMessage = 'Cliente asignado como CLIENTE CONTADO.';
  }

  onInvoiceCustomerEnter(event: Event): void {
    event.preventDefault();
    const input = this.invoiceForm.customerName.trim();
    if (input) {
      const exact = this.clients.find((c) => {
        const byName = c.fullName.trim().toLowerCase() === input.toLowerCase();
        const byDoc = c.documentNumber.trim().toLowerCase() === input.toLowerCase();
        return byName || byDoc;
      });
      const match = exact ?? this.filteredCustomerClients[0] ?? null;
      if (match) {
        this.populateCustomerFields(match);
        this.invoiceForm.customerName = match.fullName;
        this.applyNcfTypeByRnc(match);
        this.invoiceMessage = `Cliente seleccionado con Enter: ${match.fullName}.`;
      } else {
        this.applyNcfTypeByRnc(null);
      }
    } else {
      this.applyNcfTypeByRnc(null);
    }
    this.focusNextField(event);
  }

  addInvoiceLine(): void {
    this.invoiceLines = [...this.invoiceLines, this.createEmptyInvoiceLine()];
  }

  removeInvoiceLine(lineId: number): void {
    this.invoiceLines = this.invoiceLines.filter((line) => line.id !== lineId);
  }

  onInvoiceProductChange(line: InvoiceLine, productIdValue: string): void {
    const productId = productIdValue ? Number(productIdValue) : null;
    const product = productId ? this.products.find((p) => p.id === productId) : undefined;
    const taxRate = product ? this.getInvoiceTaxRate(product) : 0;
    const unitPrice = product ? this.getInvoiceUnitPrice(product, product.salePrice) : 0;
    const description = product ? this.getProductFullDescription(product) : '';

    this.updateInvoiceLine(line.id, {
      productId,
      description,
      unitPrice,
      taxRate
    });
  }

  onInvoiceLineChange(lineId: number, patch: Partial<Pick<InvoiceLine, 'quantity' | 'unitPrice'>>): void {
    this.updateInvoiceLine(lineId, patch);
  }

  async saveInvoice(): Promise<void> {
    if (this.isSavingInvoice) return;
    if (this.invoiceSaved) {
      this.invoiceMessage = `La factura ${this.savedInvoice?.numero_factura} ya fue guardada. Usa Enviar a DGII, Imprimir o Limpiar para continuar.`;
      return;
    }
    const rnc = this.invoiceForm.rnc.trim();
    let customerName = this.invoiceForm.customerName.trim();

    if (!customerName) {
      this.onInvoiceCustomerBlur();
      customerName = this.invoiceForm.customerName;
    }

    if (rnc && this.isRncInvalid) {
      this.invoiceMessage = 'RNC invalido. Registra el RNC en Clientes o en el catalogo RNC antes de guardar.';
      this.focusRncField();
      return;
    }

    let matchedClient: ClientRecord | undefined;
    if (rnc) {
      matchedClient = this.findClientByRnc(rnc);
      const rncRecord = this.findRncRecord(rnc);
      if (!matchedClient && !rncRecord) {
        this.isRncInvalid = true;
        this.invoiceMessage = 'RNC invalido. Registra el RNC en Clientes o en el catalogo RNC antes de guardar.';
        this.focusRncField();
        return;
      }
      if (!matchedClient && rncRecord) {
        this.populateCustomerFromRncRecord(rncRecord);
        customerName = this.invoiceForm.customerName.trim();
      }
    }

    if (!matchedClient && customerName) {
      matchedClient = this.clients.find((c) => {
        const byName = c.fullName.trim().toLowerCase() === customerName.toLowerCase();
        const byDoc = c.documentNumber.trim().toLowerCase() === customerName.toLowerCase();
        return byName || byDoc;
      });
    }

    if (matchedClient) {
      this.populateCustomerFields(matchedClient);
    } else {
      this.invoiceForm.customerId = null;
      if (!customerName) {
        this.invoiceMessage = 'Indica el nombre del cliente antes de guardar la factura.';
        return;
      }
    }

    const hasValidLine = this.invoiceLines.some((line) => line.productId && line.quantity > 0);
    if (!hasValidLine) {
      this.invoiceMessage = 'Agrega al menos un producto con cantidad mayor a 0.';
      return;
    }

    if (!this.invoiceForm.ncf) {
      const sequence = this.ncfSequences
        .filter((s) => s.status === 'Activa' && s.ncfType === this.invoiceForm.ncfType && s.total > 0)
        .find((s) => s.used < s.total);
      if (sequence) {
        const prefix = (sequence.rangeStart.match(/^[A-Za-z]+/) ?? [sequence.series])[0];
        const numericPart = sequence.rangeStart.replace(/^[A-Za-z]+/, '');
        const startNum = Number(numericPart) || 0;
        const nextNcfNum = startNum + sequence.used;
        const newNcf = `${prefix}${String(nextNcfNum).padStart(numericPart.length, '0')}`;
        this.invoiceForm.ncf = newNcf;
        sequence.used = Math.min(sequence.total, sequence.used + 1);
        const alertThreshold = Math.max(1, Math.floor(sequence.total * ((sequence.alertPercent ?? 80) / 100)));
        sequence.alert = sequence.used >= alertThreshold;
      } else {
        this.invoiceForm.ncf = `PENDIENTE-${Date.now().toString().slice(-6)}`;
      }
    }

    this.isSavingInvoice = true;
    try {
      const invoiceData = {
        customerId: this.invoiceForm.customerId,
        customerName,
        rnc,
        customerPhone: this.invoiceForm.customerPhone,
        customerEmail: this.invoiceForm.customerEmail,
        customerAddress: this.invoiceForm.customerAddress,
        customerCity: this.invoiceForm.customerCity,
        invoiceDate: this.invoiceForm.invoiceDate,
        ncfType: this.toStoredNcfType(this.invoiceForm.ncfType),
        ncf: this.invoiceForm.ncf,
        paymentMethod: this.invoiceForm.paymentMethod,
        paymentMethodCode: this.paymentMethodCode,
        notes: this.invoiceForm.notes,
        subtotal: this.invoiceSubtotal,
        taxTotal: this.invoiceTaxTotal,
        grandTotal: this.invoiceGrandTotal,
        lines: this.invoiceLines
          .filter((line) => line.productId && line.quantity > 0)
          .map((line) => ({ ...line, productCode: this.getInvoiceProductCode(line.productId) }))
      };
      const savedInvoice = this.editingExistingInvoiceId
        ? await this.invoicesService.updateInvoice(this.editingExistingInvoiceId, invoiceData)
        : await this.invoicesService.createInvoice(invoiceData);
      this.invoiceForm.invoiceNumber = savedInvoice.numero_factura;
      this.savedInvoice = { ...savedInvoice, dgii_estado: 'No enviado' };
      await this.loadProducts();
      this.invoiceMessage = this.editingExistingInvoiceId
        ? `Factura ${savedInvoice.numero_factura} actualizada correctamente.`
        : `Factura ${savedInvoice.numero_factura} guardada correctamente. Ahora puedes enviarla a DGII o imprimirla.`;
    } catch (error) {
      this.invoiceMessage = this.formatSupabaseError(error, 'No se pudo guardar la factura.');
    } finally {
      this.isSavingInvoice = false;
    }
  }

  async editSavedInvoice(invoiceId: number): Promise<void> {
    try {
      const invoice = await this.invoicesService.getInvoiceForEditing(invoiceId);
      this.loadInvoiceForEditing(invoice);
      this.billingTab = 'create';
    } catch (error) {
      this.invoiceMessage = this.formatSupabaseError(error, 'No se pudo cargar la factura para editar.');
      this.billingTab = 'create';
    }
  }

  async resendInvoiceToDgii(invoiceId: number): Promise<void> {
    try {
      const invoice = await this.invoicesService.getInvoiceForEditing(invoiceId);
      this.savedInvoice = {
        id: invoice.id,
        numero_factura: invoice.number,
        dgii_estado: 'No enviado',
        dgii_track_id: invoice.dgiiTrackId || null,
        dgii_codigo_respuesta: invoice.dgiiCode || null,
        dgii_mensaje_respuesta: invoice.dgiiMessage || null,
        dgii_enviado_en: invoice.dgiiSentAt || null
      };
      this.billingTab = 'create';
      this.requestSendInvoiceToDgii();
    } catch (error) {
      this.invoiceMessage = this.formatSupabaseError(error, 'No se pudo preparar la factura para reenviar a DGII.');
      this.billingTab = 'create';
    }
  }

  private loadInvoiceForEditing(invoice: EditableInvoiceData): void {
    this.selectedClient = null;
    this.invoiceForm = {
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      rnc: invoice.rnc,
      invoiceNumber: invoice.number,
      invoiceDate: invoice.invoiceDate,
      ncfType: this.getNcfOptionByStoredType(invoice.ncfType),
      ncf: invoice.ncf,
      paymentMethod: invoice.paymentMethod,
      notes: invoice.notes,
      customerPhone: invoice.customerPhone,
      customerEmail: invoice.customerEmail,
      customerAddress: invoice.customerAddress,
      customerCity: invoice.customerCity
    };
    this.paymentMethodCode = invoice.paymentMethodCode;
    this.invoiceLines = invoice.lines.map((line, index) => ({ ...line, id: index + 1 }));
    this.nextInvoiceLineId = this.invoiceLines.length + 1;
    this.editingExistingInvoiceId = invoice.id;
    this.savedInvoice = null;
    this.editingLineId = null;
    this.resetLineEditor();
    this.invoiceMessage = `Editando la factura ${invoice.number}. Guarda los cambios para actualizarla.`;
  }

  requestSendInvoiceToDgii(): void {
    if (!this.savedInvoice || this.isSendingDgii || !this.canSendToDgii) return;
    this.isDgiiSendConfirmationVisible = true;
  }

  cancelSendInvoiceToDgii(): void {
    this.isDgiiSendConfirmationVisible = false;
  }

  confirmSendInvoiceToDgii(): void {
    this.isDgiiSendConfirmationVisible = false;
    void this.sendInvoiceToDgii();
  }

  private async sendInvoiceToDgii(): Promise<void> {
    if (!this.savedInvoice || this.isSendingDgii) return;
    this.isSendingDgii = true;
    this.dgiiDialog = 'processing';
    this.dgiiDialogMessage = 'Enviando la factura a DGII. Por favor espera...';
    try {
      this.savedInvoice = await this.ecfService.sendInvoice(this.savedInvoice.id);
      this.invoiceForm.ncf = this.savedInvoice.ncf ?? this.invoiceForm.ncf;
      this.invoiceMessage = this.savedInvoice.dgii_mensaje_respuesta ?? 'La factura fue enviada al servicio e-CF.';
      const hasDgiiError = ['Rechazado', 'Error'].includes(this.savedInvoice.dgii_estado ?? '');
      this.dgiiDialog = hasDgiiError ? 'error' : 'success';
      this.dgiiDialogMessage = this.savedInvoice.dgii_mensaje_respuesta
        ?? (hasDgiiError
          ? `La factura ${this.savedInvoice.numero_factura} no fue aceptada por DGII.`
          : `La factura ${this.savedInvoice.numero_factura} fue enviada a DGII.`);
    } catch (error) {
      this.invoiceMessage = this.formatSupabaseError(error, 'No se pudo enviar la factura a DGII.');
      this.dgiiDialog = 'error';
      this.dgiiDialogMessage = this.invoiceMessage;
    } finally {
      this.isSendingDgii = false;
    }
  }

  closeDgiiDialog(): void {
    if (this.dgiiDialog === 'processing') return;
    this.dgiiDialog = null;
  }

  async printInvoice(): Promise<void> {
    if (!this.savedInvoice) return;

    const savedInvoiceId = this.savedInvoice.id;

    const isAcceptedByDgii = this.dgiiStatus === 'Aceptado';
    const documentTitle = isAcceptedByDgii ? 'Factura electrónica' : 'Factura de consumo final';
    const escape = (value: string | number | null | undefined): string => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const money = (value: number): string => `RD$${value.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const lines = this.invoiceLines.map((line) => {
      const priceWithoutTax = line.taxRate > 0 ? line.unitPrice / (1 + (line.taxRate / 100)) : line.unitPrice;
      return `
        <tr>
          <td>${escape(this.getInvoiceProductCode(line.productId))}</td>
          <td>${escape(line.description)}</td>
          <td>${escape(line.quantity)}</td>
          <td>${money(priceWithoutTax)}</td>
          <td>${money(line.taxAmount)}</td>
          <td>${money(line.lineTotal)}</td>
        </tr>`;
    }).join('');
    const printWindow = window.open('', '_blank', 'width=850,height=700');
    if (!printWindow) {
      this.invoiceMessage = 'El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e intenta otra vez.';
      return;
    }

    printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(documentTitle)} ${escape(this.savedInvoice.numero_factura)}</title><style>
      body{font-family:Arial,sans-serif;color:#111827;margin:34px}.head{display:flex;justify-content:space-between;border-bottom:2px solid #1d4ed8;padding-bottom:16px}.title{font-size:22px;font-weight:700;color:#123b85}.muted{color:#4b5563;font-size:13px}.customer{margin:22px 0;line-height:1.6}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:13px}th{background:#eff6ff}.total{margin-left:auto;margin-top:20px;width:260px}.total div{display:flex;justify-content:space-between;padding:5px 0}.total strong{font-size:17px}.footer{border-top:1px solid #cbd5e1;margin-top:32px;padding-top:10px;font-size:12px;color:#64748b}</style></head><body>
      <div class="head"><div><div class="title">${escape(documentTitle)}</div><div class="muted">No. ${escape(this.savedInvoice.numero_factura)}</div></div><div class="muted">Fecha: ${escape(this.invoiceForm.invoiceDate)}<br>NCF: ${escape(this.invoiceForm.ncf || 'N/A')}</div></div>
      <div class="customer"><strong>Cliente:</strong> ${escape(this.invoiceForm.customerName)}<br><strong>RNC:</strong> ${escape(this.invoiceForm.rnc || 'Consumidor final')}<br><strong>Dirección:</strong> ${escape(this.invoiceForm.customerAddress)}</div>
      <table><thead><tr><th>Código</th><th>Producto</th><th>Cant.</th><th>Precio sin ITBIS</th><th>ITBIS</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table>
      <div class="total"><div><span>Subtotal</span><span>${money(this.invoiceSubtotal)}</span></div><div><span>ITBIS</span><span>${money(this.invoiceTaxTotal)}</span></div><div><strong>Total</strong><strong>${money(this.invoiceGrandTotal)}</strong></div></div>
      <div class="footer">Estado DGII: ${escape(this.dgiiStatus)}${this.savedInvoice.dgii_track_id ? `<br>Track ID: ${escape(this.savedInvoice.dgii_track_id)}` : ''}</div>
      <script>window.onload=function(){window.print();};<\/script></body></html>`);
    printWindow.document.close();
    this.clearInvoice(true);

    try {
      await this.invoicesService.markInvoicePrinted(savedInvoiceId);
    } catch {
      // Printing should remain available even if only the print timestamp could not be stored.
    }
  }

  updateInvoiceLine(lineId: number, patch: Partial<InvoiceLine>): void {
    this.invoiceLines = this.invoiceLines.map((line) => {
      if (line.id !== lineId) {
        return line;
      }

      const next = { ...line, ...patch };
      const lineTotal = next.quantity * next.unitPrice;
      const taxAmount = this.isSpecialRegimeInvoice || next.taxRate <= 0
        ? 0
        : lineTotal - (lineTotal / (1 + (next.taxRate / 100)));
      return { ...next, taxAmount, lineTotal };
    });
  }

  private createEmptyInvoiceLine(): InvoiceLine {
    return {
      id: this.nextInvoiceLineId++,
      productId: null,
      description: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: 0,
      taxAmount: 0,
      lineTotal: 0
    };
  }

  private async loadProducts(): Promise<void> {
    try {
      const products = await this.productsService.getProducts();
      if (products.length) {
        this.data.products = products;
      }
    } catch {
      // Keeps the locally available products visible when the connection is unavailable.
    }
  }

  private async loadNcfTypes(): Promise<void> {
    try {
      const ncfTypes = await this.ncfTypesService.getTypes();
      if (!ncfTypes.length) return;

      this.data.ncfTypeList = ncfTypes;
      this.ncfTypes = this.toNcfOptions(ncfTypes);
      this.applyNcfTypeByRnc(this.selectedClient);
    } catch {
      // Uses the local catalog while Supabase is unavailable.
    }
  }

  private async loadRncRecords(): Promise<void> {
    try {
      const records = await this.rncService.getRecords();
      if (records.length) {
        this.data.rncRecords = records;
      }
    } catch {
      // Uses the local catalog while the connection is unavailable.
    }
  }

  private async loadClients(): Promise<void> {
    try {
      const clients = await this.clientsService.getClients();
      if (clients.length) {
        this.data.clients = clients;
      }
    } catch {
      // Uses the local catalog while the connection is unavailable.
    }
  }

  private async loadPaymentMethods(): Promise<void> {
    try {
      this.paymentMethods = await this.paymentMethodsService.getPaymentMethods();
    } catch {
      this.paymentMethods = [];
    }
  }

  private toNcfOptions(ncfTypes: NcfType[]): string[] {
    return ncfTypes
      .filter((type) => type.status === 'Activa')
      .sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }))
      .map((type) => `${type.code} - ${type.name}`);
  }

  private getNcfOptionBySeriesOrCode(seriesOrCode: string): string {
    const match = this.ncfTypes.find((opt) => {
      const normalized = opt.toLowerCase();
      const needle = seriesOrCode.toLowerCase().trim();
      return normalized.includes(` ${needle} -`) || normalized.startsWith(`${needle} -`) || normalized.includes(` - ${needle}`) || normalized.includes(needle);
    });
    return match ?? seriesOrCode;
  }

  private applyNcfTypeByRnc(client?: ClientRecord | null): void {
    const hasValidRnc = this.hasValidInvoiceRnc || !!client;

    if (hasValidRnc) {
      if (!this.availableNcfTypes.includes(this.invoiceForm.ncfType)) {
        this.invoiceForm.ncfType = this.availableNcfTypes.find((type) => this.isNcfCode(type, '31'))
          ?? this.availableNcfTypes[0]
          ?? '';
      }
      return;
    }
    this.invoiceForm.ncfType = this.availableNcfTypes.find((type) => this.isNcfCode(type, '32'))
      ?? this.getNcfOptionBySeriesOrCode(this.defaultNcfElectronic32);
  }

  private get hasValidInvoiceRnc(): boolean {
    const rnc = this.invoiceForm.rnc.trim();
    return !!rnc && !!(this.findClientByRnc(rnc) ?? this.findRncRecord(rnc));
  }

  private isNcfCode(option: string, code: string): boolean {
    return option.trim().startsWith(`${code} -`);
  }

  private toStoredNcfType(value: string): string {
    const code = value.match(/\d{2}/)?.[0];
    return code ? `E${code}` : value.trim().toUpperCase();
  }

  private getNcfOptionByStoredType(value: string): string {
    const code = value.match(/\d{2}/)?.[0];
    return code
      ? this.ncfTypes.find((option) => this.isNcfCode(option, code)) ?? value
      : value;
  }

  private findClientByRnc(rnc: string): ClientRecord | undefined {
    return this.clients.find((client) =>
      client.documentType === 'RNC' && client.documentNumber.trim().toLowerCase() === rnc.trim().toLowerCase()
    );
  }

  private findRncRecord(rnc: string): RncRecord | undefined {
    return this.data.rncRecords.find((record) => record.rnc.trim().toLowerCase() === rnc.trim().toLowerCase());
  }

  private formatSupabaseError(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return `${fallback} ${(error as { message?: string }).message ?? ''}`.trim();
    }
    return fallback;
  }
}
