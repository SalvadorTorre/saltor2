import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { PlatformCompany, PlatformPayment, PlatformService } from '../../core/services/platform/platform.service';

@Component({
  selector: 'app-platform-payments-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-payments-page.component.html',
  styleUrls: ['./platform-payments-page.component.scss']
})
export class PlatformPaymentsPageComponent implements OnInit {
  companies: PlatformCompany[] = [];
  payments: PlatformPayment[] = [];
  from = '';
  to = '';
  companyId: number | null = null;
  showVoided = true;
  isLoading = false;
  errorMessage = '';

  constructor(private readonly platform: PlatformService) {}

  async ngOnInit(): Promise<void> {
    const today = new Date();
    this.from = this.iso(new Date(today.getFullYear(), today.getMonth(), 1));
    this.to = this.iso(today);
    try { this.companies = (await this.platform.getSummary()).empresas; } catch { /* el error se muestra al consultar */ }
    await this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.payments = await this.platform.getPayments({ from: this.from, to: this.to, companyId: this.companyId ?? undefined });
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? '');
      this.errorMessage = /plataforma_pagos/.test(message) ? 'Falta aplicar la migración de la plataforma en la base de datos.' : message || 'No se pudieron cargar los pagos.';
    } finally {
      this.isLoading = false;
    }
  }

  get visible(): PlatformPayment[] { return this.payments.filter((p) => this.showVoided || p.estado === 'Activo'); }
  get total(): number { return this.payments.filter((p) => p.estado === 'Activo').reduce((sum, p) => sum + Number(p.monto), 0); }
  get count(): number { return this.payments.filter((p) => p.estado === 'Activo').length; }

  companyName(id: number): string { return this.companies.find((c) => c.id === id)?.nombre_comercial ?? `Empresa #${id}`; }

  print(p: PlatformPayment): void {
    const company = this.companies.find((c) => c.id === p.empresa_id) ?? { nombre_comercial: this.companyName(p.empresa_id) };
    this.platform.printReceipt(p, company);
  }

  async voidPayment(p: PlatformPayment): Promise<void> {
    const { value } = await Swal.fire({
      icon: 'warning', title: `Anular ${p.numero}`, input: 'text', inputLabel: 'Motivo de la anulación', showCancelButton: true,
      confirmButtonText: 'Anular', cancelButtonText: 'Cancelar', inputValidator: (v) => (v?.trim() ? null : 'Escribe el motivo')
    });
    if (!value) return;
    try {
      await this.platform.voidPayment(p.id, String(value).toUpperCase());
      await this.load();
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo anular', text: String((error as { message?: string })?.message ?? error) });
    }
  }

  exportCsv(): void {
    const escape = (v: string) => /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const rows = this.visible.map((p) => [p.numero, p.fecha, this.companyName(p.empresa_id), String(p.meses), p.periodo_desde, p.periodo_hasta,
      Number(p.monto).toFixed(2), p.forma_pago, p.referencia ?? '', p.estado, p.motivo_anulacion ?? '', p.registrado_por ?? '']);
    const csv = '﻿' + [['Recibo', 'Fecha', 'Empresa', 'Meses', 'Desde', 'Hasta', 'Monto', 'Forma de pago', 'Referencia', 'Estado', 'Motivo anulación', 'Registrado por'], ...rows]
      .map((r) => r.map((v) => escape(String(v))).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `pagos-plataforma-${this.from}-a-${this.to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  date(value: string | null | undefined): string {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  private iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
}
