import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { SalesOrderHeaderRow, SalesOrdersService } from '../../core/services/sales-orders/sales-orders.service';

@Component({
  selector: 'app-orders-consultation-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders-consultation-page.component.html',
  styleUrls: ['./orders-consultation-page.component.scss']
})
export class OrdersConsultationPageComponent implements OnInit {
  @Output() editRequested = new EventEmitter<number>();
  @Output() viewRequested = new EventEmitter<number>();
  @Output() printRequested = new EventEmitter<number>();

  orders: SalesOrderHeaderRow[] = [];
  search = '';
  status = '';
  isLoading = false;
  error = '';

  constructor(private readonly ordersService: SalesOrdersService, private readonly router: Router) {}

  async ngOnInit(): Promise<void> { await this.load(); }

  get filteredOrders(): SalesOrderHeaderRow[] {
    const term = this.search.trim().toLowerCase();
    return this.orders.filter((order) => {
      const matchesStatus = !this.status || order.estado === this.status;
      const matchesText = !term || `${order.numero_orden} ${order.cliente_nombre} ${order.cliente_rnc ?? ''}`.toLowerCase().includes(term);
      return matchesStatus && matchesText;
    });
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.error = '';
    try { this.orders = await this.ordersService.getOrders(); }
    catch (error) { this.error = String((error as { message?: string })?.message ?? 'No se pudieron cargar las órdenes.'); }
    finally { this.isLoading = false; }
  }

  view(order: SalesOrderHeaderRow): void { this.viewRequested.emit(order.id); }

  edit(order: SalesOrderHeaderRow): void { this.editRequested.emit(order.id); }
  print(order: SalesOrderHeaderRow): void { this.printRequested.emit(order.id); }

  async remove(order: SalesOrderHeaderRow): Promise<void> {
    const result = await Swal.fire({ icon: 'warning', title: `¿Borrar ${order.numero_orden}?`, text: 'La orden y sus productos serán eliminados.', showCancelButton: true, confirmButtonText: 'Borrar', cancelButtonText: 'Cancelar', confirmButtonColor: '#b42318' });
    if (!result.isConfirmed) return;
    try {
      await this.ordersService.deleteOrder(order.id);
      await this.load();
      void Swal.fire({ icon: 'success', title: 'Orden eliminada', timer: 1300, showConfirmButton: false, toast: true, position: 'top-end' });
    } catch (error) { await Swal.fire({ icon: 'error', title: 'No se pudo borrar', text: String((error as { message?: string })?.message ?? error) }); }
  }

  createInvoice(order: SalesOrderHeaderRow): void {
    void this.router.navigate(['/transacciones/facturacion'], { queryParams: { orden: order.id } });
  }

  date(value: string): string { return value ? new Intl.DateTimeFormat('es-DO').format(new Date(`${value}T12:00:00`)) : '—'; }
  money(value: number | string): string { return Number(value ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
}
