import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import { ProductRecord } from '../../app.models';
import { AdjustmentMode, InventoryMovement, InventoryService } from '../../core/services/inventory/inventory.service';
import { ProductsService } from '../../core/services/products/products.service';
import { AuditService } from '../../core/services/audit/audit.service';

@Component({
  selector: 'app-kardex-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './kardex-page.component.html',
  styleUrls: ['./kardex-page.component.scss']
})
export class KardexPageComponent implements OnInit {
  products: ProductRecord[] = [];
  productSearch = '';
  showSuggestions = false;
  selected: ProductRecord | null = null;
  movements: InventoryMovement[] = [];
  from = '';
  to = '';
  isLoading = false;
  errorMessage = '';

  // Ajuste
  isAdjustOpen = false;
  isSaving = false;
  adjustError = '';
  adjustMode: AdjustmentMode = 'conteo';
  adjustQuantity: number | null = null;
  adjustReason = '';

  constructor(private readonly productsService: ProductsService, private readonly inventory: InventoryService, private readonly audit: AuditService) {}

  // Historial de costo y precios (bitácora; solo administradores)
  priceRows: Array<{ date: string; user: string | null; field: string; before: string; after: string; pct: number | null }> = [];
  priceMessage = 'Sin cambios de costo o precio registrados desde que se activó la bitácora.';

  private async loadPriceHistory(): Promise<void> {
    this.priceRows = [];
    if (!this.selected || !this.isAdmin) return;
    const labels: Record<string, string> = { costo: 'Costo', precio_venta: 'Precio de venta', precio_minimo: 'Precio mínimo', precio_mayor: 'Precio por mayor', cantidadxmayor: 'Cant. mínima por mayor', cantidad_minima_mayor: 'Cant. mínima por mayor', ventaxmayor: 'Venta por mayor' };
    try {
      const entries = await this.audit.getPriceHistory(this.selected.id);
      this.priceRows = entries.flatMap((e) => Object.entries(e.cambios ?? {})
        .filter(([field]) => field in labels)
        .map(([field, v]) => {
          const before = v?.antes as number | string | null | undefined;
          const after = (e.accion === 'Crear' ? v?.antes : v?.despues) as number | string | null | undefined;
          const isMoney = !['cantidadxmayor', 'cantidad_minima_mayor', 'ventaxmayor'].includes(field);
          const b = Number(before); const a = Number(after);
          return {
            date: e.fecha, user: e.usuario_nombre, field: labels[field],
            before: e.accion === 'Crear' ? '—' : (isMoney && before !== null && before !== undefined ? this.money(b) : String(before ?? '—')),
            after: isMoney && after !== null && after !== undefined ? this.money(a) : String(after ?? '—'),
            pct: e.accion !== 'Crear' && isMoney && Number.isFinite(b) && b !== 0 && Number.isFinite(a) ? (a - b) / b * 100 : null
          };
        }));
    } catch (error) {
      this.priceMessage = /bitacora/.test(String((error as { message?: string })?.message)) ? 'Falta aplicar la migración de la bitácora.' : 'No se pudo cargar el historial de precios.';
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      this.products = await this.productsService.getProducts();
    } catch (error) {
      this.errorMessage = this.messageFrom(error, 'No se pudieron cargar los productos.');
    }
  }

  get suggestions(): ProductRecord[] {
    const term = this.productSearch.trim().toLowerCase();
    if (!term) return [];
    return this.products
      .filter((p) => `${p.code} ${p.description} ${p.brand ?? ''}`.toLowerCase().includes(term))
      .slice(0, 12);
  }

  get negativeProducts(): ProductRecord[] { return this.products.filter((p) => p.stock < 0); }
  get lowProducts(): ProductRecord[] { return this.products.filter((p) => p.stock >= 0 && p.minimumStock > 0 && p.stock <= p.minimumStock); }

  async selectProduct(product: ProductRecord): Promise<void> {
    this.selected = product;
    this.productSearch = `${product.code} · ${product.description}`;
    this.showSuggestions = false;
    await Promise.all([this.loadMovements(), this.loadPriceHistory()]);
  }

  async loadMovements(): Promise<void> {
    if (!this.selected) return;
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.movements = await this.inventory.getMovements(this.selected.id, this.from || undefined, this.to || undefined);
    } catch (error) {
      this.errorMessage = this.messageFrom(error, 'No se pudo consultar el kardex.');
    } finally {
      this.isLoading = false;
    }
  }

  clearDates(): void { this.from = ''; this.to = ''; void this.loadMovements(); }

  get totalIn(): number { return this.movements.filter((m) => m.quantity > 0).reduce((t, m) => t + m.quantity, 0); }
  get totalOut(): number { return this.movements.filter((m) => m.quantity < 0).reduce((t, m) => t - m.quantity, 0); }
  get newestFirst(): InventoryMovement[] { return [...this.movements].reverse(); }

  get isAdmin(): boolean {
    try { return JSON.parse(localStorage.getItem('saltor.activeUser') ?? '{}').role === 'Administrador'; } catch { return false; }
  }

  // -------------------------------------------------------------------------
  // Ajuste
  // -------------------------------------------------------------------------
  openAdjust(): void {
    if (!this.selected) return;
    this.isAdjustOpen = true;
    this.adjustError = '';
    this.adjustMode = 'conteo';
    this.adjustQuantity = null;
    this.adjustReason = '';
  }

  get adjustPreview(): number | null {
    if (!this.selected || this.adjustQuantity == null || Number.isNaN(Number(this.adjustQuantity))) return null;
    const q = Number(this.adjustQuantity);
    return this.adjustMode === 'entrada' ? this.selected.stock + q : this.adjustMode === 'salida' ? this.selected.stock - q : q;
  }

  async saveAdjust(): Promise<void> {
    if (!this.selected) return;
    const q = Number(this.adjustQuantity);
    if (this.adjustQuantity == null || Number.isNaN(q) || q < 0 || (this.adjustMode !== 'conteo' && q === 0)) {
      this.adjustError = 'Indique una cantidad válida.'; return;
    }
    if (!this.adjustReason.trim()) { this.adjustError = 'Indique el motivo del ajuste.'; return; }
    this.isSaving = true;
    this.adjustError = '';
    try {
      const newStock = await this.inventory.adjust(this.selected.id, this.adjustMode, q, this.adjustReason.trim());
      this.selected = { ...this.selected, stock: newStock };
      this.products = this.products.map((p) => (p.id === this.selected!.id ? { ...p, stock: newStock } : p));
      this.isAdjustOpen = false;
      await this.loadMovements();
      void Swal.fire({ icon: 'success', title: 'Ajuste registrado', text: `Nueva existencia: ${newStock}`, confirmButtonColor: '#0f4c81' });
    } catch (error) {
      this.adjustError = this.messageFrom(error, 'No se pudo registrar el ajuste.');
    } finally {
      this.isSaving = false;
    }
  }

  // -------------------------------------------------------------------------
  exportCsv(): void {
    if (!this.selected) return;
    const head = ['Fecha', 'Tipo', 'Documento', 'Entrada', 'Salida', 'Existencia anterior', 'Existencia', 'Costo', 'Usuario', 'Notas'];
    const rows = this.movements.map((m) => [new Date(m.date).toLocaleString('es-DO'), m.type, m.document,
      m.quantity > 0 ? m.quantity : '', m.quantity < 0 ? -m.quantity : '', m.before, m.after, m.cost ?? '', m.userName, m.notes]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `kardex_${this.selected.code}.csv` });
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  typeTone(type: string): string {
    if (type.startsWith('Ajuste')) return 'adjust';
    if (type === 'Saldo inicial') return 'initial';
    if (type.startsWith('Entrada') || type === 'Edición de entrada') return 'in';
    if (type === 'Factura anulada') return 'void';
    if (type === 'Cambio manual') return 'manual';
    return 'out';
  }

  num(v: number): string { return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 2 }).format(v); }
  money(v: number | null): string { return v == null ? '' : new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(v); }

  private messageFrom(error: unknown, fallback: string): string {
    const message = (error as { message?: string })?.message;
    return message && message.trim() ? message : fallback;
  }
}
