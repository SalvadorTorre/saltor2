import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

/** Pestañas para saltar entre las pantallas de Mantenimiento. */
@Component({
  selector: 'app-maintenance-tabs',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="maintenance-tabs" aria-label="Navegacion de mantenimiento">
      <a
        *ngFor="let link of links"
        class="maintenance-tab"
        [routerLink]="link.path"
        routerLinkActive="maintenance-tab--active"
        ariaCurrentWhenActive="page">
        {{ link.label }}
      </a>
    </nav>
  `
})
export class MaintenanceTabsComponent {
  readonly links = [
    { label: 'Productos', path: '/mantenimiento/productos' },
    { label: 'Clientes', path: '/mantenimiento/clientes' },
    { label: 'Suplidores', path: '/mantenimiento/suplidores' }
  ];
}
