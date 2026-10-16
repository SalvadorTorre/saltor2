import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { CompanyHealth, PlatformService } from '../../core/services/platform/platform.service';

const TABLE_LABELS: Record<string, string> = {
  empresas: 'Empresa', sucursales: 'Sucursales', usuarios: 'Usuarios', clients: 'Clientes', suplidores: 'Suplidores', products: 'Productos',
  movimientos_inventario: 'Kardex', product_entry_headers: 'Entradas', product_entries: 'Entradas (detalle)', facturas: 'Facturas',
  factura_detalles: 'Facturas (detalle)', notas_credito: 'Notas de crédito', nota_credito_detalles: 'Notas de crédito (detalle)',
  cotizaciones: 'Cotizaciones', cotizacion_detalles: 'Cotizaciones (detalle)', cxc_saldos_iniciales: 'Saldos iniciales CxC',
  recibos_cobro: 'Recibos de cobro', recibo_cobro_aplicaciones: 'Recibos (aplicaciones)', cierres_caja: 'Cierres de caja',
  cierre_caja_facturas: 'Cierres (facturas)', gastos_menores: 'Gastos menores', compras_606: 'Compras 606', comprobantes_e41: 'Comprobantes E41',
  ncf_secuencias: 'Secuencias NCF', ncf_empresas: 'Empresas NCF', ecf_configuraciones: 'Configuración e-CF'
};

type ExportData = { exportado_en: string; tablas: Record<string, Record<string, unknown>[]> };

@Component({
  selector: 'app-platform-health-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './platform-health-page.component.html',
  styleUrls: ['./platform-health-page.component.scss']
})
export class PlatformHealthPageComponent implements OnInit {
  companies: CompanyHealth[] = [];
  isLoading = false;
  errorMessage = '';
  exporting: number | null = null;
  exports = new Map<number, ExportData>();

  constructor(private readonly platform: PlatformService) {}

  async ngOnInit(): Promise<void> { await this.load(); }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try { this.companies = await this.platform.getHealth(); }
    catch (error) {
      const message = String((error as { message?: string })?.message ?? error);
      this.errorMessage = /plataforma_salud/.test(message) ? 'Falta aplicar la migración de la fase 3 de la plataforma.' : message;
    } finally { this.isLoading = false; }
  }

  get counts(): { ok: number; warn: number; bad: number } {
    return { ok: this.companies.filter((c) => c.nivel === 'ok').length, warn: this.companies.filter((c) => c.nivel === 'warn').length, bad: this.companies.filter((c) => c.nivel === 'bad').length };
  }

  label(table: string): string { return TABLE_LABELS[table] ?? table; }
  tablesOf(id: number): Array<{ key: string; rows: number }> {
    const data = this.exports.get(id);
    return data ? Object.entries(data.tablas).map(([key, rows]) => ({ key, rows: rows.length })).filter((t) => t.rows > 0) : [];
  }

  async exportCompany(c: CompanyHealth): Promise<void> {
    this.exporting = c.id;
    try {
      const data = await this.platform.exportCompany(c.id);
      this.exports.set(c.id, data);
      const total = Object.values(data.tablas).reduce((sum, rows) => sum + rows.length, 0);
      this.platform.download(`respaldo-${this.slug(c.nombre_comercial)}-${this.stamp()}.json`, JSON.stringify(data, null, 1), 'application/json');
      void Swal.fire({ icon: 'success', title: 'Respaldo descargado', text: `${total.toLocaleString('es-DO')} registros. Abajo puedes bajar cada tabla en Excel (CSV).`, timer: 2600, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo exportar', text: String((error as { message?: string })?.message ?? error) });
    } finally { this.exporting = null; }
  }

  downloadTable(c: CompanyHealth, table: string): void {
    const rows = this.exports.get(c.id)?.tablas[table] ?? [];
    this.platform.download(`${this.slug(c.nombre_comercial)}-${table}-${this.stamp()}.csv`, this.platform.toCsv(rows), 'text/csv;charset=utf-8;');
  }

  private slug(text: string): string { return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
  private stamp(): string { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
}
