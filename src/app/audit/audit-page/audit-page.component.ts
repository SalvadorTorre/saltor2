import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AUDIT_TABLES, AuditEntry, AuditService, PLATFORM_AUDIT_TABLES } from '../../core/services/audit/audit.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { PlatformService } from '../../core/services/platform/platform.service';

const FIELD_LABELS: Record<string, string> = {
  codigo: 'Código', descripcion: 'Descripción', costo: 'Costo', precio_venta: 'Precio de venta', precio_minimo: 'Precio mínimo',
  precio_mayor: 'Precio por mayor', cantidadxmayor: 'Cant. mínima por mayor', cantidad_minima_mayor: 'Cant. mínima por mayor', ventaxmayor: 'Venta por mayor',
  existenciamin: 'Existencia mínima', cantidadminventa: 'Cant. mínima de venta', cantidad_minima_venta: 'Cant. mínima de venta', existencia_minima: 'Existencia mínima', categoria: 'Categoría', ubicacion: 'Ubicación', marca: 'Marca', unidad: 'Unidad',
  reemplazo: 'Usa reemplazo', codigo_reemplazo: 'Código de reemplazo', exento_itbis: 'Exento de ITBIS', valor_impuesto: 'ITBIS %',
  estado: 'Estado', nombre_completo: 'Nombre', rol: 'Rol', correo: 'Correo', telefono: 'Teléfono', limite_credito: 'Límite de crédito',
  dias_credito: 'Días de crédito', numero_documento: 'Documento', tipo_anulacion: 'Tipo de anulación', motivo_anulacion: 'Motivo de anulación',
  anulada_por: 'Anulada por', anulada_en: 'Anulada en', total: 'Total', subtotal: 'Subtotal', itbis: 'ITBIS', cliente_nombre: 'Cliente',
  condicion_pago: 'Condición de pago', forma_pago_codigo: 'Forma de pago', rango_inicial: 'Rango inicial', rango_final: 'Rango final',
  fecha_vencimiento: 'Fecha de vencimiento', ambiente: 'Ambiente', url_base: 'URL de envío', sucursal: 'Sucursal', sucursal_id: 'Sucursal',
  plan_id: 'Plan', prueba_hasta: 'Prueba hasta', pagado_hasta: 'Pagado hasta', dias_gracia: 'Días de gracia', precio_mensual: 'Precio mensual',
  contacto_nombre: 'Contacto', contacto_telefono: 'Tel. contacto', numero: 'Recibo', monto: 'Monto', meses: 'Meses', forma_pago: 'Forma de pago',
  periodo_desde: 'Desde', periodo_hasta: 'Hasta', referencia: 'Referencia', nombre_comercial: 'Nombre comercial', razon_social: 'Razón social', rnc: 'RNC'
};

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-page.component.html',
  styleUrls: ['./audit-page.component.scss']
})
export class AuditPageComponent implements OnInit {
  /** Bitácora de la plataforma: todas las empresas, solo para dueños del sistema (viene de la ruta). */
  @Input() platform = false;
  tables = Object.entries(AUDIT_TABLES).map(([value, label]) => ({ value, label }));
  companies: Array<{ id: number; nombre_comercial: string }> = [];
  companyFilter: number | null = null;
  readonly actions = ['Crear', 'Editar', 'Anular', 'Eliminar'];
  from = '';
  to = '';
  table = '';
  action = '';
  text = '';
  entries: AuditEntry[] = [];
  expanded = new Set<number>();
  isLoading = false;
  errorMessage = '';

  constructor(private readonly audit: AuditService, private readonly auth: AuthService, private readonly platformService: PlatformService) {}

  ngOnInit(): void {
    if (this.platform) {
      this.tables = Object.entries(PLATFORM_AUDIT_TABLES).map(([value, label]) => ({ value, label }));
      void this.platformService.getSummary().then((s) => this.companies = s.empresas).catch(() => undefined);
    }
    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - 30);
    this.from = this.iso(start); this.to = this.iso(today);
    void this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.entries = await this.audit.getEntries({
        from: this.from, to: this.to, table: this.table, action: this.action,
        // Los dueños del sistema pueden leer todas las empresas: la bitácora de Configuración se limita a la propia.
        companyId: this.platform ? this.companyFilter : this.auth.currentUser?.companyId ?? null,
        tables: this.platform ? Object.keys(PLATFORM_AUDIT_TABLES) : undefined
      });
    }
    catch (error) {
      const message = String((error as { message?: string })?.message ?? '');
      this.errorMessage = /bitacora/.test(message) ? 'Falta aplicar la migración de la bitácora en la base de datos.' : message || 'No se pudo cargar la bitácora.';
    } finally { this.isLoading = false; }
  }

  get filtered(): AuditEntry[] {
    const term = this.text.trim().toLowerCase();
    if (!term) return this.entries;
    return this.entries.filter((e) => `${e.usuario_nombre ?? ''} ${e.resumen ?? ''} ${JSON.stringify(e.cambios)}`.toLowerCase().includes(term));
  }

  toggle(id: number): void { this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id); }
  tableLabel(table: string): string { return (this.platform ? PLATFORM_AUDIT_TABLES[table] : undefined) ?? AUDIT_TABLES[table] ?? PLATFORM_AUDIT_TABLES[table] ?? table; }
  companyName(id: number | null | undefined): string { return this.companies.find((c) => c.id === id)?.nombre_comercial ?? (id ? `Empresa #${id}` : ''); }
  fieldLabel(field: string): string { return FIELD_LABELS[field] ?? field.replace(/_/g, ' '); }
  changeList(entry: AuditEntry): Array<{ field: string; before: string; after: string }> {
    return Object.entries(entry.cambios ?? {}).map(([field, v]) => ({ field: this.fieldLabel(field), before: this.show(v?.antes), after: this.show(v?.despues) }));
  }
  summary(entry: AuditEntry): string {
    const keys = Object.keys(entry.cambios ?? {});
    if (entry.accion === 'Editar') return keys.slice(0, 4).map((k) => this.fieldLabel(k)).join(', ') + (keys.length > 4 ? ` y ${keys.length - 4} más` : '');
    if (entry.accion === 'Anular') { const m = entry.cambios?.['motivo_anulacion']?.despues; return m ? `Motivo: ${m}` : ''; }
    return '';
  }
  actionClass(action: string): string { return ({ Crear: 'is-new', Editar: 'is-edit', Anular: 'is-void', Eliminar: 'is-del' } as Record<string, string>)[action] ?? ''; }

  exportCsv(): void {
    const rows = this.filtered.flatMap((e) => {
      const base = [new Date(e.fecha).toLocaleString('es-DO'), e.usuario_nombre ?? '', this.tableLabel(e.tabla), e.accion, e.resumen ?? ''];
      const changes = this.changeList(e);
      return changes.length ? changes.map((c) => [...base, c.field, c.before, c.after]) : [[...base, '', '', '']];
    });
    const escape = (v: string) => /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = '﻿' + [['Fecha', 'Usuario', 'Módulo', 'Acción', 'Registro', 'Campo', 'Antes', 'Después'], ...rows].map((r) => r.map((v) => escape(String(v))).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `bitacora-${this.from}-a-${this.to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private show(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
  private iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
}
