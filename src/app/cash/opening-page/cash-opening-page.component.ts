import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';

type CashShift = 'Manana' | 'Tarde' | 'Noche';

interface CashOpeningRecord {
  id: number;
  cashNumber: string;
  cashier: string;
  shift: CashShift;
  currency: string;
  openingFund: number;
  notes: string;
  openedAt: Date;
}

@Component({
  selector: 'app-cash-opening-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-opening-page.component.html',
  styleUrls: ['./cash-opening-page.component.scss']
})
export class CashOpeningPageComponent {
  readonly viewMode = 'cash_opening';
  cashNumber = '';
  cashierName = '';
  shift: CashShift = 'Manana';
  currency = 'DOP';
  openingFund: number | null = null;
  notes = '';
  searchTerm = '';
  formMessage = '';
  records: CashOpeningRecord[] = [];

  constructor(public data: AppDataService) {}

  get todayLabel(): string {
    return new Intl.DateTimeFormat('es-DO', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }

  get openCashCount(): number { return this.records.length; }
  get totalActiveFund(): number { return this.records.reduce((total, record) => total + record.openingFund, 0); }
  get filteredRecords(): CashOpeningRecord[] {
    const search = this.searchTerm.trim().toLocaleLowerCase();
    if (!search) return this.records;
    return this.records.filter((record) => [record.cashNumber, record.cashier, record.shift]
      .some((value) => value.toLocaleLowerCase().includes(search)));
  }

  openCash(): void {
    if (!this.cashNumber.trim() || !this.cashierName.trim() || this.openingFund === null || this.openingFund < 0) {
      this.formMessage = 'Completa el numero de caja, el cajero y el fondo inicial.';
      return;
    }
    if (this.records.some((record) => record.cashNumber === this.cashNumber.trim())) {
      this.formMessage = `La caja ${this.cashNumber.trim()} ya esta abierta.`;
      return;
    }
    this.records = [{
      id: Date.now(), cashNumber: this.cashNumber.trim(), cashier: this.cashierName.trim(), shift: this.shift,
      currency: this.currency, openingFund: Number(this.openingFund), notes: this.notes.trim(), openedAt: new Date()
    }, ...this.records];
    this.formMessage = `Caja ${this.cashNumber.trim()} abierta correctamente.`;
    this.clearForm(false);
  }

  clearForm(clearMessage = true): void {
    this.cashNumber = '';
    this.cashierName = '';
    this.shift = 'Manana';
    this.currency = 'DOP';
    this.openingFund = null;
    this.notes = '';
    if (clearMessage) this.formMessage = '';
  }

  money(amount: number, currency: string = 'DOP'): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  }
}
