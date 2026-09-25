import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { ProductRecord, ProductFormModel } from '../../app.models';
import { ProductsService } from '../../core/services/products/products.service';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products-page.component.html',
  styleUrls: ['./products-page.component.scss']
})
export class ProductsPageComponent implements OnInit {
  activeView = 'products';
  productSearch = '';
  productCategoryFilter = 'all';
  productStatusFilter = 'all';
  productMessage = 'Gestiona inventario, precios y stock de tus productos desde una sola pantalla.';
  openProductOptionsId: number | null = null;
  isProductEditorOpen = false;
  isLoadingProducts = false;
  isSavingProduct = false;
  productEditorMode: 'create' | 'edit' | 'view' = 'create';
  selectedProductId: number | null = null;
  activeMaintenanceLabel = 'Productos';

  readonly maintenanceLinks = [
    { label: 'Productos', icon: 'box' },
    { label: 'Clientes', icon: 'users' },
    { label: 'Suplidores', icon: 'truck' }
  ];

  get products(): ProductRecord[] {
    return this.data.products;
  }

  get selectedProduct(): ProductRecord | null {
    return this.data.products.find((product) => product.id === this.selectedProductId) ?? this.data.products[0] ?? null;
  }

  productForm: ProductFormModel = {
    code: '',
    description: '',
    unit: 'Unidad',
    category: 'Electronica',
    location: '',
    brand: '',
    type: '',
    size: '',
    stock: 0,
    minimumStock: 0,
    cost: 0,
    salePrice: 0,
    minimumPrice: 0,
    wholesalePrice: 0,
    minimumSaleQuantity: 1,
    minimumWholesaleQuantity: 0,
    replacementCode: '',
    exemptItbis: false,
    taxValue: 18,
    status: 'Activo'
  };

  constructor(
    public data: AppDataService,
    private readonly productsService: ProductsService,
    private readonly el: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    void this.loadProducts();
  }

  get filteredProducts(): ProductRecord[] {
    return this.products.filter((product) => {
      const matchesSearch = !this.productSearch.trim()
        || [product.code, product.description, product.brand].some((value) =>
          value.toLowerCase().includes(this.productSearch.trim().toLowerCase()));
      const matchesCategory = this.productCategoryFilter === 'all' || product.category === this.productCategoryFilter;
      const matchesStatus = this.productStatusFilter === 'all' || product.status === this.productStatusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }

  isSelectedProduct(product: ProductRecord): boolean {
    return this.selectedProduct?.id === product.id;
  }

  get totalProductsCount(): number {
    return this.products.length;
  }

  get activeProductsCount(): number {
    return this.products.filter((product) => product.status === 'Activo').length;
  }

  get lowStockProductsCount(): number {
    return this.products.filter((product) => product.stock > 0 && product.stock <= product.minimumStock).length;
  }

  get outOfStockProductsCount(): number {
    return this.products.filter((product) => product.stock === 0 || product.status === 'Agotado').length;
  }

  openProductOptions(productId: number, event: Event): void {
    event.stopPropagation();
    this.openProductOptionsId = this.openProductOptionsId === productId ? null : productId;
  }

  closeProductOptions(): void {
    this.openProductOptionsId = null;
  }

  startCreateProduct(): void {
    this.openProductOptionsId = null;
    this.productEditorMode = 'create';
    this.productForm = {
      code: '',
      description: '',
      unit: 'Unidad',
      category: 'Electronica',
      location: '',
      brand: '',
      type: '',
      size: '',
      stock: 0,
      minimumStock: 0,
      cost: 0,
      salePrice: 0,
      minimumPrice: 0,
      wholesalePrice: 0,
      minimumSaleQuantity: 1,
      minimumWholesaleQuantity: 0,
      replacementCode: '',
      exemptItbis: false,
      taxValue: 18,
      status: 'Activo'
    };
    this.productMessage = 'Completa los datos para registrar un nuevo producto.';
    this.isProductEditorOpen = true;
  }

  selectProduct(product: ProductRecord): void {
    this.openProductOptionsId = null;
    this.selectedProductId = product.id;
    this.productMessage = `Producto seleccionado: ${product.description}.`;
  }

  private editProductInternal(product: ProductRecord): void {
    this.openProductOptionsId = null;
    this.loadProductIntoForm(product, 'edit');
    this.productMessage = `Editando el producto ${product.description}.`;
    this.isProductEditorOpen = true;
  }

  editProductFromOptions(product: ProductRecord, event?: Event): void {
    event?.stopPropagation();
    this.editProductInternal(product);
  }

  viewProduct(product: ProductRecord, event?: Event): void {
    event?.stopPropagation();
    this.openProductOptionsId = null;
    this.loadProductIntoForm(product, 'view');
    this.productMessage = `Consultando el producto ${product.description}.`;
    this.isProductEditorOpen = true;
  }

  get isProductReadOnly(): boolean {
    return this.productEditorMode === 'view';
  }

  closeProductEditor(): void {
    this.isProductEditorOpen = false;
  }

  focusNextProductField(event: Event): void {
    event.preventDefault();
    if (!(event.target instanceof HTMLElement)) return;

    const form = this.el.nativeElement.querySelector<HTMLFormElement>('.product-editor-modal form');
    if (!form) return;
    const selector = 'input:not([readonly]):not([disabled]), select:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])';
    const fields = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector))
      .filter((field) => field.offsetParent !== null);
    const currentIndex = fields.indexOf(event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement);
    const nextField = fields[currentIndex + 1];

    if (nextField) {
      nextField.focus();
      if (nextField instanceof HTMLInputElement) {
        nextField.select();
      }
      return;
    }

    form.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  }

  async saveProduct(): Promise<void> {
    if (!this.productForm.code.trim() || !this.productForm.description.trim()) {
      this.productMessage = 'Completa codigo y descripcion antes de guardar.';
      return;
    }

    const cost = Number(this.productForm.cost) || 0;
    const salePrice = Number(this.productForm.salePrice) || 0;
    const minimumPrice = Number(this.productForm.minimumPrice) || 0;
    const wholesalePrice = Number(this.productForm.wholesalePrice) || 0;
    if (salePrice <= cost || minimumPrice <= cost || (wholesalePrice > 0 && wholesalePrice <= cost)) {
      this.productMessage = 'Los precios de venta, minimo y por mayor deben ser mayores que el costo.';
      return;
    }
    if (minimumPrice > salePrice) {
      this.productMessage = 'El precio minimo no puede ser mayor que el precio de venta.';
      return;
    }

    this.isSavingProduct = true;
    try {
      if (this.productEditorMode === 'create') {
        const newProduct = await this.productsService.createProduct(this.productForm);
        this.data.products = [newProduct, ...this.data.products.filter((product) => product.id !== newProduct.id)];
        this.selectedProductId = newProduct.id;
        this.loadProductIntoForm(newProduct, 'edit');
        this.productMessage = `Producto ${newProduct.description} registrado correctamente.`;
        this.isProductEditorOpen = false;
        return;
      }

      const productId = this.selectedProductId ?? this.selectedProduct?.id;
      if (!productId) {
        this.productMessage = 'Selecciona un producto antes de actualizar.';
        return;
      }

      const updated = await this.productsService.updateProduct(productId, this.productForm);
      this.data.products = this.data.products.map((product) => product.id === updated.id ? updated : product);
      this.selectedProductId = updated.id;
      this.loadProductIntoForm(updated, 'edit');
      this.productMessage = `Producto ${updated.description} actualizado correctamente.`;
      this.isProductEditorOpen = false;
    } catch (error) {
      this.productMessage = this.formatSupabaseError(error, 'No se pudo guardar el producto.');
    } finally {
      this.isSavingProduct = false;
    }
  }

  canDeleteProduct(product: ProductRecord): boolean {
    return product.stock === 0;
  }

  async deleteProduct(product: ProductRecord): Promise<void> {
    if (!this.canDeleteProduct(product)) {
      this.productMessage = `No se puede eliminar ${product.description} porque tiene stock disponible.`;
      this.openProductOptionsId = null;
      return;
    }

    try {
      await this.productsService.deleteProduct(product.id);
      this.data.products = this.data.products.filter((item) => item.id !== product.id);
      this.openProductOptionsId = null;
      const firstRemaining = this.data.products[0];
      if (firstRemaining) {
        this.selectedProductId = firstRemaining.id;
        this.loadProductIntoForm(firstRemaining, 'edit');
      } else {
        this.selectedProductId = null;
        this.startCreateProduct();
      }
      this.productMessage = `Producto ${product.description} eliminado correctamente.`;
    } catch (error) {
      this.productMessage = this.formatSupabaseError(error, 'No se pudo eliminar el producto.');
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeProductOptions();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeProductOptions();
    this.isProductEditorOpen = false;
  }

  private loadProductIntoForm(product: ProductRecord, mode: 'create' | 'edit' | 'view'): void {
    this.productEditorMode = mode;
    this.selectedProductId = product.id;
    this.productForm = { ...product };
    delete (this.productForm as Partial<ProductRecord>).id;
  }

  private async loadProducts(): Promise<void> {
    this.isLoadingProducts = true;
    try {
      const products = await this.productsService.getProducts();
      this.data.products = products;
      const firstProduct = products[0];
      if (firstProduct) {
        this.selectedProductId = firstProduct.id;
        this.loadProductIntoForm(firstProduct, 'edit');
        this.productMessage = 'Productos cargados desde Supabase.';
      } else {
        this.selectedProductId = null;
        this.startCreateProduct();
        this.productMessage = 'No hay productos registrados. Puedes crear el primero.';
      }
    } catch (error) {
      this.productMessage = this.formatSupabaseError(error, 'No se pudieron cargar los productos desde Supabase.');
    } finally {
      this.isLoadingProducts = false;
    }
  }

  private formatSupabaseError(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return `${fallback} ${(error as { message?: string }).message ?? ''}`.trim();
    }
    return fallback;
  }
}
