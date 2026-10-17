import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import {
  CompanyBranchRow, CompanyUserRow, ComputedState, PAYMENT_METHODS, PlatformCompany, PlatformPayment, PlatformPlan,
  PlatformService, PlatformSummary, SubscriptionUpdate
} from '../../core/services/platform/platform.service';

import { ProformaService, ProformaSettings, PROFORMA_MAX } from '../../core/services/proforma/proforma.service';

type DrawerTab = 'suscripcion' | 'pagos' | 'usuarios' | 'sucursales';

@Component({
  selector: 'app-platform-companies-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './platform-companies-page.component.html',
  styleUrls: ['./platform-companies-page.component.scss']
})
export class PlatformCompaniesPageComponent implements OnInit {
  readonly states: Array<{ value: string; label: string }> = [
    { value: '', label: 'Todas' }, { value: 'Activa', label: 'Activas' }, { value: 'Prueba', label: 'En prueba' },
    { value: 'Por vencer', label: 'Por vencer' }, { value: 'En gracia', label: 'En gracia' }, { value: 'Vencida', label: 'Vencidas' },
    { value: 'Suspendida', label: 'Suspendidas' }
  ];
  readonly paymentMethods = PAYMENT_METHODS;

  summary: PlatformSummary | null = null;
  plans: PlatformPlan[] = [];
  stateFilter = '';
  text = '';
  isLoading = false;
  errorMessage = '';

  selected: PlatformCompany | null = null;
  tab: DrawerTab = 'suscripcion';
  form: SubscriptionUpdate | null = null;
  payments: PlatformPayment[] = [];
  users: CompanyUserRow[] = [];
  branches: CompanyBranchRow[] = [];
  isSaving = false;
  drawerError = '';
  payment = this.emptyPayment();
  billingMode: 'Directo' | 'Caja' = 'Directo';

  proforma: ProformaSettings | null = null;
  proformaEnabled = false;
  proformaCurrent = 0;
  readonly proformaMax = PROFORMA_MAX;
  isSavingProforma = false;

  constructor(private readonly platform: PlatformService, private readonly proformas: ProformaService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      [this.summary, this.plans] = await Promise.all([this.platform.getSummary(), this.platform.getPlans()]);
      if (this.selected) {
        const fresh = this.summary.empresas.find((c) => c.id === this.selected?.id) ?? null;
        this.selected = fresh;
      }
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? '');
      this.errorMessage = /plataforma_resumen|does not exist|schema cache/.test(message)
        ? 'Falta aplicar la migración de la plataforma en la base de datos.' : message || 'No se pudo cargar la plataforma.';
    } finally {
      this.isLoading = false;
    }
  }

  get companies(): PlatformCompany[] {
    const term = this.text.trim().toLowerCase();
    return (this.summary?.empresas ?? []).filter((c) => {
      if (this.stateFilter && c.estado_calculado !== this.stateFilter) return false;
      if (!term) return true;
      return `${c.nombre_comercial} ${c.razon_social ?? ''} ${c.rnc ?? ''} ${c.contacto_nombre ?? ''} ${c.plan ?? ''}`.toLowerCase().includes(term);
    });
  }

  /** Empresas que requieren atención: por vencer, en gracia o vencidas. */
  get alerts(): PlatformCompany[] {
    return (this.summary?.empresas ?? []).filter((c) => ['Por vencer', 'En gracia', 'Vencida'].includes(c.estado_calculado)
      || (c.estado_calculado === 'Prueba' && (c.dias_restantes ?? 99) <= 3));
  }

  stateClass(state: ComputedState | string | null): string {
    return ({
      Activa: 'is-ok', Prueba: 'is-trial', 'Por vencer': 'is-warn', 'En gracia': 'is-grace', Vencida: 'is-bad',
      Suspendida: 'is-off', Cancelada: 'is-off', 'Sin suscripción': 'is-off'
    } as Record<string, string>)[state ?? ''] ?? '';
  }

  daysLabel(c: PlatformCompany): string {
    const d = c.dias_restantes;
    if (d === null || d === undefined) return '—';
    if (d === 0) return 'Vence hoy';
    return d > 0 ? `${d} día(s)` : `Hace ${-d} día(s)`;
  }

  overLimit(c: PlatformCompany): string {
    const parts: string[] = [];
    if (c.max_usuarios && c.usuarios_activos > c.max_usuarios) parts.push(`usuarios ${c.usuarios_activos}/${c.max_usuarios}`);
    if (c.max_sucursales && c.sucursales > c.max_sucursales) parts.push(`sucursales ${c.sucursales}/${c.max_sucursales}`);
    return parts.length ? `Excede el plan: ${parts.join(', ')}` : '';
  }

  async open(company: PlatformCompany, tab: DrawerTab = 'suscripcion'): Promise<void> {
    this.selected = company;
    this.tab = tab;
    this.drawerError = '';
    this.proforma = null;
    this.proformaEnabled = false;
    this.proformaCurrent = 0;
    this.isSavingProforma = false;
    this.form = {
      plan_id: company.plan_id, estado: company.estado ?? 'Prueba', prueba_hasta: company.prueba_hasta, pagado_hasta: company.pagado_hasta,
      dias_gracia: company.dias_gracia ?? 5, precio_mensual: Number(company.precio_mensual ?? 0),
      contacto_nombre: company.contacto_nombre, contacto_telefono: company.contacto_telefono, notas: company.notas
    };
    this.payment = this.emptyPayment();
    await this.loadDrawerData();
  }

  close(): void {
    this.selected = null;
    this.form = null;
  }

  private async loadDrawerData(): Promise<void> {
    if (!this.selected) return;
    const id = this.selected.id;
    try {
      const [payments, users, branches, mode, proforma] = await Promise.all([
        this.platform.getPayments({ companyId: id, limit: 200 }), this.platform.getCompanyUsers(id), this.platform.getCompanyBranches(id), this.platform.getBillingMode(id), this.proformas.getSettings(id).catch(error => {
          if (this.selected?.id === id) this.drawerError = this.message(error);
          return null;
        })
      ]);
      if (this.selected?.id !== id) return;
      this.payments = payments; this.users = users; this.branches = branches;
      this.billingMode = mode;
      this.proforma = proforma;
      this.proformaEnabled = proforma?.enabled ?? false;
      this.proformaCurrent = proforma?.current ?? 0;
    } catch (error) {
      this.drawerError = this.message(error);
    }
  }

  async changeBillingMode(mode: 'Directo' | 'Caja'): Promise<void> {
    if (!this.selected) return;
    const previous = this.billingMode;
    this.billingMode = mode;
    try {
      await this.platform.setBillingMode(this.selected.id, mode);
      this.toast(mode === 'Caja' ? 'Ahora cobra en caja' : 'Ahora factura directo');
    } catch (error) {
      this.billingMode = previous;
      this.drawerError = this.message(error);
    }
  }

  async changeProforma(enabled: boolean): Promise<void> {
    if (!this.selected || this.isSavingProforma || !this.proforma) return;
    const id = this.selected.id;
    const previous = this.proforma;
    this.proformaEnabled = enabled;
    this.isSavingProforma = true;
    this.drawerError = '';
    try {
      const saved = await this.proformas.setEnabled(id, enabled);
      if (this.selected?.id !== id) return;
      this.proforma = saved;
      this.proformaEnabled = saved.enabled;
      this.proformaCurrent = saved.current;
      this.toast(enabled ? 'Factura proforma activada' : 'Factura proforma desactivada');
    } catch (error) {
      if (this.selected?.id !== id) return;
      this.proformaEnabled = previous.enabled;
      this.drawerError = this.message(error);
    } finally { if (this.selected?.id === id) this.isSavingProforma = false; }
  }

  async saveProformaCounter(): Promise<void> {
    if (!this.selected || !this.proforma?.enabled || this.isSavingProforma) return;
    const id = this.selected.id;
    this.isSavingProforma = true;
    this.drawerError = '';
    try {
      const saved = await this.proformas.setCurrent(this.proforma, this.proformaCurrent, true);
      if (this.selected?.id !== id) return;
      this.proforma = saved;
      this.proformaCurrent = saved.current;
      this.toast('Contador E332 guardado');
    } catch (error) {
      if (this.selected?.id === id) this.drawerError = this.message(error);
    } finally { if (this.selected?.id === id) this.isSavingProforma = false; }
  }

  onPlanChange(): void {
    if (!this.form) return;
    const plan = this.plans.find((p) => p.id === Number(this.form?.plan_id));
    if (plan) this.form.precio_mensual = Number(plan.precio_mensual);
  }

  async saveSubscription(): Promise<void> {
    if (!this.selected || !this.form) return;
    this.isSaving = true;
    this.drawerError = '';
    try {
      await this.platform.updateSubscription(this.selected.id, {
        ...this.form, plan_id: this.form.plan_id ? Number(this.form.plan_id) : null,
        prueba_hasta: this.form.prueba_hasta || null, pagado_hasta: this.form.pagado_hasta || null,
        dias_gracia: Number(this.form.dias_gracia) || 0, precio_mensual: Number(this.form.precio_mensual) || 0,
        contacto_nombre: this.form.contacto_nombre?.trim() || null, contacto_telefono: this.form.contacto_telefono?.trim() || null,
        notas: this.form.notas?.trim() || null
      });
      await this.load();
      this.toast('Suscripción guardada');
    } catch (error) {
      this.drawerError = this.message(error);
    } finally {
      this.isSaving = false;
    }
  }

  async extendTrial(): Promise<void> {
    if (!this.selected) return;
    const { value } = await Swal.fire({
      title: 'Dar días de prueba', input: 'number', inputValue: 15, inputLabel: `Días a agregar para ${this.selected.nombre_comercial}`,
      inputAttributes: { min: '1', max: '90' }, showCancelButton: true, confirmButtonText: 'Agregar', cancelButtonText: 'Cancelar',
      inputValidator: (v) => (Number(v) >= 1 && Number(v) <= 90 ? null : 'Entre 1 y 90 días')
    });
    if (!value) return;
    try {
      await this.platform.extendTrial(this.selected.id, Number(value));
      await this.load();
      if (this.selected) await this.open(this.selected, this.tab);
      this.toast('Prueba extendida');
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo extender', text: this.message(error) });
    }
  }

  async toggleSuspend(): Promise<void> {
    if (!this.selected) return;
    const suspend = this.selected.estado !== 'Suspendida';
    const target = suspend ? 'Suspendida' : (this.selected.pagado_hasta ? 'Activa' : 'Prueba');
    const result = await Swal.fire({
      icon: suspend ? 'warning' : 'question', title: suspend ? '¿Suspender la suscripción?' : '¿Reactivar la suscripción?',
      text: suspend ? 'Los usuarios de la empresa verán un aviso. No se bloquea el acceso.' : `Quedará en estado ${target}.`,
      showCancelButton: true, confirmButtonText: suspend ? 'Suspender' : 'Reactivar', cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;
    try {
      await this.platform.setSubscriptionState(this.selected.id, target);
      await this.load();
      if (this.selected) await this.open(this.selected, this.tab);
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo cambiar', text: this.message(error) });
    }
  }

  onMonthsChange(): void {
    const price = Number(this.selected?.precio_mensual ?? 0);
    if (price > 0) this.payment.monto = Math.round(price * (Number(this.payment.meses) || 1) * 100) / 100;
  }

  async registerPayment(): Promise<void> {
    if (!this.selected) return;
    if (!(Number(this.payment.monto) > 0)) { this.drawerError = 'El monto debe ser mayor que cero.'; return; }
    this.isSaving = true;
    this.drawerError = '';
    try {
      const saved = await this.platform.registerPayment({ ...this.payment, empresa_id: this.selected.id, meses: Number(this.payment.meses), monto: Number(this.payment.monto) });
      const company = this.selected;
      await this.load();
      if (this.selected) await this.open(this.selected, 'pagos');
      const result = await Swal.fire({
        icon: 'success', title: `Pago ${saved.numero} registrado`, text: `Cubre hasta el ${this.date(saved.periodo_hasta)}.`,
        showCancelButton: true, confirmButtonText: 'Imprimir recibo', cancelButtonText: 'Cerrar'
      });
      if (result.isConfirmed) this.platform.printReceipt(saved, company);
    } catch (error) {
      this.drawerError = this.message(error);
    } finally {
      this.isSaving = false;
    }
  }

  print(p: PlatformPayment): void {
    if (this.selected) this.platform.printReceipt(p, this.selected);
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
      if (this.selected) await this.open(this.selected, 'pagos');
      this.toast('Pago anulado');
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo anular', text: this.message(error) });
    }
  }

  date(value: string | null | undefined): string {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  private emptyPayment() {
    const price = Number(this.selected?.precio_mensual ?? 0);
    return { fecha: this.today(), meses: 1, monto: price, forma_pago: 'Transferencia', referencia: '', notas: '' };
  }

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private toast(title: string): void {
    void Swal.fire({ icon: 'success', title, timer: 1600, showConfirmButton: false, toast: true, position: 'top-end' });
  }

  private message(error: unknown): string {
    const detail = String((error as { message?: string })?.message ?? error ?? 'Error desconocido');
    return /empresas_proforma|configurar_proforma|ajustar_contador_proforma/i.test(detail) ? 'Falta aplicar la migración de factura proforma E332.' : detail;
  }
}
