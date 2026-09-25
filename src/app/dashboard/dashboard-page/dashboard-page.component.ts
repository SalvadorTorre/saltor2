import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss']
})
export class DashboardPageComponent {
  readonly statCards = [
    { label: 'Ventas del Dia', value: '$18,450', hint: '+12.4%', tone: 'success', icon: 'sale' },
    { label: 'Ventas del Mes', value: '$286,900', hint: '+8.2%', tone: 'primary', icon: 'wallet' },
    { label: 'Productos Vendidos', value: '136', hint: '23 hoy', tone: 'emerald', icon: 'bag' },
    { label: 'Total Facturas', value: '18', hint: '5 pendientes', tone: 'sky', icon: 'file' },
    { label: 'Stock Bajo', value: '8', hint: 'Requiere revision', tone: 'danger', icon: 'alert' }
  ];

  readonly salesSeries = [
    { label: 'Lun', value: '$32K', x: 8, y: 24 },
    { label: 'Mar', value: '$74K', x: 22, y: 54 },
    { label: 'Mie', value: '$58K', x: 36, y: 40 },
    { label: 'Jue', value: '$92K', x: 50, y: 72 },
    { label: 'Vie', value: '$69K', x: 64, y: 50 },
    { label: 'Sab', value: '$81K', x: 78, y: 60 },
    { label: 'Dom', value: '$118K', x: 92, y: 88 }
  ];

  readonly topProducts = [
    { name: 'Laptop HP 15', quantity: 56, amount: '$840' },
    { name: 'Monitor Samsung 24', quantity: 42, amount: '$630' },
    { name: 'Teclado Logitech', quantity: 35, amount: '$420' },
    { name: 'Mouse Inalambrico', quantity: 50, amount: '$375' },
    { name: 'Impresora Epson', quantity: 30, amount: '$320' }
  ];

  readonly alertGroups = [
    {
      title: 'Stock Bajo',
      icon: 'alert',
      items: ['Toner HP 85A', 'Mouse Genius', 'Papel Carta Premium']
    },
    {
      title: 'Sin Movimiento',
      icon: 'box',
      items: ['Camara Web HD', 'Cable VGA', 'Base para Laptop']
    }
  ];

  readonly categories = [
    { label: 'Computadoras', percent: 32, color: '#2563eb' },
    { label: 'Accesorios', percent: 25, color: '#14b8a6' },
    { label: 'Impresion', percent: 20, color: '#f97316' },
    { label: 'Redes', percent: 15, color: '#ef4444' },
    { label: 'Oficina', percent: 8, color: '#8b5cf6' }
  ];

  readonly inventoryFlow = [
    { label: 'Entradas', value: 120, width: 62, tone: 'green' },
    { label: 'Salidas', value: 145, width: 78, tone: 'orange' },
    { label: 'Transferencias', value: 38, width: 34, tone: 'blue' }
  ];

  readonly transactions = [
    { date: '10/04/2026', invoice: '#2045', client: 'Carlos Perez', total: '$150', status: 'Pagada' },
    { date: '10/04/2026', invoice: '#2044', client: 'Ana Garcia', total: '$220', status: 'Pendiente' },
    { date: '09/04/2026', invoice: '#2043', client: 'Luis Martinez', total: '$340', status: 'Pagada' },
    { date: '09/04/2026', invoice: '#2042', client: 'Sofia Torres', total: '$85', status: 'Anulada' }
  ];

  constructor(public data: AppDataService) {}
}
