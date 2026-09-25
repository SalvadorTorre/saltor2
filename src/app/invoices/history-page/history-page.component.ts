import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';

interface Transaction {
  date: string;
  invoice: string;
  client: string;
  total: string;
  status: string;
}

@Component({
  selector: 'app-invoice-history-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history-page.component.html',
  styleUrls: ['./history-page.component.scss']
})
export class InvoiceHistoryPageComponent {
  readonly moduleView = {
    category: 'Facturacion',
    title: 'Historial de Facturas',
    description: 'Consulta y administra facturas emitidas, estados, reimpresiones y anulaciones.',
    pill: 'Modulo Historial'
  };

  statusFilter = 'all';
  searchTerm = '';

  transactions: Transaction[] = [
    { date: '10/04/2026', invoice: '#2045', client: 'Carlos Perez', total: '$150', status: 'Pagada' },
    { date: '10/04/2026', invoice: '#2044', client: 'Ana Garcia', total: '$220', status: 'Pendiente' },
    { date: '09/04/2026', invoice: '#2043', client: 'Luis Martinez', total: '$340', status: 'Pagada' },
    { date: '09/04/2026', invoice: '#2042', client: 'Sofia Torres', total: '$85', status: 'Anulada' }
  ];

  constructor(public data: AppDataService) {}

  get filteredTransactions(): Transaction[] {
    return this.transactions.filter((item) => {
      const matchesSearch = !this.searchTerm.trim()
        || [item.invoice, item.client].some((value) =>
          value.toLowerCase().includes(this.searchTerm.trim().toLowerCase()));
      const matchesStatus = this.statusFilter === 'all' || item.status === this.statusFilter;
      return matchesSearch && matchesStatus;
    });
  }

  get totalCount(): number {
    return this.transactions.length;
  }

  get paidCount(): number {
    return this.transactions.filter((item) => item.status === 'Pagada').length;
  }

  get pendingCount(): number {
    return this.transactions.filter((item) => item.status === 'Pendiente').length;
  }

  get cancelledCount(): number {
    return this.transactions.filter((item) => item.status === 'Anulada').length;
  }
}
