import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CashClosingRecord, CashClosingsService } from '../../core/services/cash/cash-closings.service';

@Component({
  selector: 'app-cash-movements-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-movements-page.component.html',
  styleUrls: ['./cash-movements-page.component.scss']
})
export class CashMovementsPageComponent implements OnInit {
  readonly viewMode = 'cash_movements';
  records: CashClosingRecord[] = [];
  isLoading = false;
  errorMessage = '';
  searchTerm = '';

  constructor(private readonly cashClosings: CashClosingsService) {}
  async ngOnInit(): Promise<void> { await this.loadHistory(); }
  async loadHistory(): Promise<void> {
    this.isLoading = true; this.errorMessage = '';
    try { this.records = await this.cashClosings.getHistory(); }
    catch (error) { this.errorMessage = error instanceof Error ? error.message : 'No se pudo consultar el historico de cierres.'; }
    finally { this.isLoading = false; }
  }

  get filteredRecords(): CashClosingRecord[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.records;
    return this.records.filter((record) => [record.id, record.cashierName, record.fromInvoice, record.toInvoice, record.status, record.branchName]
      .some((value) => String(value ?? '').toLowerCase().includes(term)));
  }

  get totalClosed(): number { return this.records.reduce((total, record) => total + record.total, 0); }
  get totalCash(): number { return this.records.reduce((total, record) => total + record.cash, 0); }
  get totalCredit(): number { return this.records.reduce((total, record) => total + record.credit, 0); }

  money(value: number): string { return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value); }
}
