import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductRecord } from '../../app.models';
import { ProductsService } from '../../core/services/products/products.service';

type StockFilter = 'all' | 'with' | 'without' | 'below-min' | 'at-or-below-min' | 'negative' | 'range';
type SortKey = 'code' | 'description' | 'stock' | 'value';

/** Reporte de inventario: existencias con filtros por código, descripción, existencia y mínimo. */
@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory-page.component.html',
  styleUrls: ['./inventory-page.component.scss']
})
export class InventoryReportPageComponent implements OnInit {
  readonly stockOptions: Array<{ value: StockFilter; label: string }> = [
    { value: 'all', label: 'Todas' },
    { value: 'with', label: 'Con existencia (> 0)' },
    { value: 'without', label: 'Sin existencia (0 o menos)' },
    { value: 'below-min', label: 'Debajo del mínimo' },
    { value: 'at-or-below-min', label: 'En o debajo del mínimo' },
    { value: 'negative', label: 'Existencia negativa' },
    { value: 'range', label: 'Rango de existencia' }
  ];

  products: ProductRecord[] = [];
  isLoading = false;
  errorMessage = '';

  code = '';
  description = '';
  category = 'all';
  brand = 'all';
  status = 'active';
  stockFilter: StockFilter = 'all';
  stockFrom: number | null = null;
  stockTo: number | null = null;
  sortKey: SortKey = 'code';

  constructor(private readonly productsService: ProductsService) {}

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.products = await this.productsService.getProducts();
    } catch (error) {
      this.products = [];
      this.errorMessage = error instanceof Error ? error.message : 'No se pudo consultar el inventario.';
    } finally {
      this.isLoading = false;
    }
  }

  get categories(): string[] { return this.distinct((product) => product.category); }
  get brands(): string[] { return this.distinct((product) => product.brand); }

  get rows(): ProductRecord[] {
    const code = this.code.trim().toLocaleLowerCase();
    const words = this.description.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const rows = this.products.filter((product) => {
      const stock = product.stock;
      const min = product.minimumStock;
      if (code && !String(product.code ?? '').toLocaleLowerCase().includes(code)) return false;
      if (words.length) {
        const text = `${product.description ?? ''} ${product.brand ?? ''} ${product.type ?? ''} ${product.size ?? ''}`.toLocaleLowerCase();
        if (!words.every((word) => text.includes(word))) return false;
      }
      if (this.category !== 'all' && product.category !== this.category) return false;
      if (this.brand !== 'all' && product.brand !== this.brand) return false;
      if (this.status === 'active' && product.status === 'Inactivo') return false;
      if (this.status !== 'active' && this.status !== 'all' && product.status !== this.status) return false;
      switch (this.stockFilter) {
        case 'with': return stock > 0;
        case 'without': return stock <= 0;
        case 'below-min': return min > 0 && stock < min;
        case 'at-or-below-min': return min > 0 && stock <= min;
        case 'negative': return stock < 0;
        case 'range':
          return (this.stockFrom === null || stock >= Number(this.stockFrom)) && (this.stockTo === null || stock <= Number(this.stockTo));
        default: return true;
      }
    });
    const byCode = (a: ProductRecord, b: ProductRecord) => String(a.code ?? '').localeCompare(String(b.code ?? ''), 'es', { numeric: true, sensitivity: 'base' });
    const sorters: Record<SortKey, (a: ProductRecord, b: ProductRecord) => number> = {
      code: byCode,
      description: (a, b) => String(a.description ?? '').localeCompare(String(b.description ?? ''), 'es', { sensitivity: 'base' }) || byCode(a, b),
      stock: (a, b) => a.stock - b.stock || byCode(a, b),
      value: (a, b) => this.costValue(b) - this.costValue(a) || byCode(a, b)
    };
    return rows.sort(sorters[this.sortKey]);
  }

  get totals(): { products: number; units: number; cost: number; sale: number; belowMin: number; withoutStock: number } {
    const rows = this.rows;
    return {
      products: rows.length,
      units: rows.reduce((total, product) => total + product.stock, 0),
      cost: rows.reduce((total, product) => total + this.costValue(product), 0),
      sale: rows.reduce((total, product) => total + this.saleValue(product), 0),
      belowMin: rows.filter((product) => this.isBelowMinimum(product)).length,
      withoutStock: rows.filter((product) => product.stock <= 0).length
    };
  }

  costValue(product: ProductRecord): number { return Math.max(0, product.stock) * (product.cost || 0); }
  saleValue(product: ProductRecord): number { return Math.max(0, product.stock) * (product.salePrice || 0); }
  isBelowMinimum(product: ProductRecord): boolean { return product.minimumStock > 0 && product.stock <= product.minimumStock; }

  clear(): void {
    this.code = '';
    this.description = '';
    this.category = 'all';
    this.brand = 'all';
    this.status = 'active';
    this.stockFilter = 'all';
    this.stockFrom = null;
    this.stockTo = null;
    this.sortKey = 'code';
  }

  money(value: number): string { return `RD$ ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  qty(value: number): string { return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

  exportExcel(): void {
    const head = ['Código', 'Descripción', 'Categoría', 'Marca', 'Ubicación', 'Existencia', 'Exist. mínima', 'Costo', 'Precio venta', 'Valor costo', 'Valor venta', 'Estado'];
    const rows = this.rows.map((p) => [p.code, p.description, p.category, p.brand, p.location, p.stock, p.minimumStock, p.cost, p.salePrice, this.costValue(p), this.saleValue(p), p.status]);
    const t = this.totals;
    rows.push(['TOTAL', `${t.products} productos`, '', '', '', t.units, '', '', '', t.cost, t.sale, '']);
    const cell = (value: unknown) => typeof value === 'number'
      ? `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
      : `<Cell><Data ss:Type="String">${this.escapeXml(String(value ?? ''))}</Data></Cell>`;
    const xml = [head, ...rows].map((row) => `<Row>${row.map(cell).join('')}</Row>`).join('');
    const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Inventario"><Table>${xml}</Table></Worksheet></Workbook>`;
    const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventario-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  print(): void { window.print(); }

  private distinct(pick: (product: ProductRecord) => string | undefined): string[] {
    return [...new Set(this.products.map(pick).map((value) => String(value ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  }

  private escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
