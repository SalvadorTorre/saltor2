import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductRecord } from '../../app.models';
import { ProductsService } from '../../core/services/products/products.service';

/** Consulta rápida de precio para el mostrador (F2 desde cualquier pantalla). */
@Component({
  selector: 'app-price-lookup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './price-lookup.component.html',
  styleUrls: ['./price-lookup.component.scss']
})
export class PriceLookupComponent implements OnChanges {
  @Input() open = false;
  @Input() showCost = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  term = '';
  results: ProductRecord[] = [];
  selected: ProductRecord | null = null;
  replacement: ProductRecord | null = null;
  isSearching = false;
  errorMessage = '';
  activeIndex = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;

  constructor(private readonly products: ProductsService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue) {
      this.term = ''; this.results = []; this.selected = null; this.replacement = null; this.errorMessage = '';
      setTimeout(() => this.searchInput?.nativeElement.focus(), 30);
    }
  }

  onTermChange(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.search(), 220);
  }

  async search(): Promise<void> {
    const term = this.term.trim();
    const id = ++this.requestId;
    if (!term) { this.results = []; this.selected = null; return; }
    this.isSearching = true;
    this.errorMessage = '';
    try {
      const rows = await this.products.searchProducts(term);
      if (id !== this.requestId) return;
      // Coincidencia exacta de código primero.
      const upper = term.toUpperCase();
      rows.sort((a, b) => Number(b.code.toUpperCase() === upper) - Number(a.code.toUpperCase() === upper));
      this.results = rows.slice(0, 20);
      this.activeIndex = 0;
      if (this.results.length === 1 || this.results[0]?.code.toUpperCase() === upper) await this.pick(this.results[0]);
      else { this.selected = null; this.replacement = null; }
    } catch (error) {
      if (id === this.requestId) this.errorMessage = (error as { message?: string })?.message || 'No se pudo consultar.';
    } finally {
      if (id === this.requestId) this.isSearching = false;
    }
  }

  async pick(product: ProductRecord | undefined): Promise<void> {
    if (!product) return;
    this.selected = product;
    this.replacement = null;
    if (product.replacementEnabled && product.replacementCode) {
      try {
        const rows = await this.products.searchProducts(product.replacementCode);
        this.replacement = rows.find((p) => p.code.toUpperCase() === product.replacementCode.toUpperCase()) ?? null;
      } catch { this.replacement = null; }
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' && this.results.length) { event.preventDefault(); this.activeIndex = Math.min(this.results.length - 1, this.activeIndex + 1); }
    else if (event.key === 'ArrowUp' && this.results.length) { event.preventDefault(); this.activeIndex = Math.max(0, this.activeIndex - 1); }
    else if (event.key === 'Enter') { event.preventDefault(); if (this.results[this.activeIndex]) void this.pick(this.results[this.activeIndex]); else void this.search(); }
    else if (event.key === 'Escape') { event.preventDefault(); this.close(); }
  }

  newSearch(): void {
    this.term = ''; this.results = []; this.selected = null; this.replacement = null;
    this.searchInput?.nativeElement.focus();
  }

  close(): void { this.closed.emit(); }

  get stockForSale(): number { return this.replacement ? this.replacement.stock : this.selected?.stock ?? 0; }
  money(value: number): string { return `RD$${Number(value ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
}
