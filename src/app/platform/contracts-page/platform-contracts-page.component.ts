import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  DEFAULT_CONTRACT_TERMS, PlatformCompany, PlatformContract, PlatformPlan, PlatformService
} from '../../core/services/platform/platform.service';

const MAX_FILE_BYTES = 3 * 1024 * 1024;

@Component({
  selector: 'app-platform-contracts-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-contracts-page.component.html',
  styleUrls: ['./platform-contracts-page.component.scss']
})
export class PlatformContractsPageComponent implements OnInit {
  /** ?empresa=ID desde el panel de empresas. */
  @Input() empresa?: string;

  readonly types = ['Suscripción', 'Licencia', 'Implementación', 'Soporte', 'Otro'];
  readonly periods = ['Mensual', 'Trimestral', 'Anual', 'Pago único'];
  readonly stateOptions = ['', 'Borrador', 'Vigente', 'Por vencer', 'Vencido', 'Finalizado', 'Cancelado'];

  companies: PlatformCompany[] = [];
  plans: PlatformPlan[] = [];
  contracts: PlatformContract[] = [];
  companyId: number | null = null;
  stateFilter = '';
  text = '';
  isLoading = false;
  errorMessage = '';

  form: PlatformContract | null = null;
  isSaving = false;
  formError = '';
  pendingFile: { data: string; name: string } | null = null;

  constructor(private readonly platform: PlatformService) {}

  async ngOnInit(): Promise<void> {
    this.companyId = this.empresa ? Number(this.empresa) || null : null;
    try {
      const [summary, plans] = await Promise.all([this.platform.getSummary(), this.platform.getPlans()]);
      this.companies = summary.empresas; this.plans = plans;
    } catch { /* se informa al consultar */ }
    await this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try { this.contracts = await this.platform.getContracts(); }
    catch (error) {
      const message = this.message(error);
      this.errorMessage = /plataforma_contratos/.test(message) ? 'Falta aplicar la migración de la fase 2 de la plataforma.' : message;
    } finally { this.isLoading = false; }
  }

  get visible(): PlatformContract[] {
    const term = this.text.trim().toLowerCase();
    return this.contracts.filter((c) => {
      if (this.companyId && c.empresa_id !== this.companyId) return false;
      if (this.stateFilter && this.state(c) !== this.stateFilter) return false;
      return !term || `${c.numero} ${this.companyName(c.empresa_id)} ${c.tipo} ${c.descripcion ?? ''} ${c.representante_nombre ?? ''}`.toLowerCase().includes(term);
    });
  }

  /** Estado a mostrar: un contrato vigente puede estar por vencer (30 días) o vencido. */
  state(c: PlatformContract): string {
    if (c.estado !== 'Vigente' || !c.fecha_fin) return c.estado;
    const days = this.daysTo(c.fecha_fin);
    if (days < 0) return 'Vencido';
    if (days <= 30) return 'Por vencer';
    return 'Vigente';
  }

  stateClass(state: string): string {
    return ({ Vigente: 'is-ok', Borrador: 'is-trial', 'Por vencer': 'is-warn', Vencido: 'is-bad', Finalizado: 'is-off', Cancelado: 'is-off' } as Record<string, string>)[state] ?? '';
  }

  companyName(id: number | null): string { return this.companies.find((c) => c.id === id)?.nombre_comercial ?? (id ? `Empresa #${id}` : '—'); }
  planName(id: number | null): string | null { return this.plans.find((p) => p.id === id)?.nombre ?? null; }

  newContract(): void {
    const company = this.companies.find((c) => c.id === this.companyId);
    const today = this.iso(new Date());
    const end = new Date(); end.setFullYear(end.getFullYear() + 1); end.setDate(end.getDate() - 1);
    this.pendingFile = null;
    this.formError = '';
    this.form = {
      empresa_id: this.companyId, tipo: 'Suscripción', descripcion: '', plan_id: company?.plan_id ?? null, fecha_inicio: today, fecha_fin: this.iso(end),
      renovacion_automatica: true, monto: Number(company?.precio_mensual ?? 0), periodicidad: 'Mensual', condiciones: DEFAULT_CONTRACT_TERMS,
      representante_nombre: company?.contacto_nombre ?? '', representante_cedula: '', representante_cargo: '', estado: 'Borrador',
      firmado_en: null, archivo_nombre: null, notas: ''
    };
  }

  edit(c: PlatformContract): void {
    this.pendingFile = null;
    this.formError = '';
    this.form = { ...c };
  }

  close(): void { this.form = null; }

  onCompanyChange(): void {
    if (!this.form || this.form.id) return;
    const company = this.companies.find((c) => c.id === Number(this.form?.empresa_id));
    if (!company) return;
    this.form.plan_id = company.plan_id;
    this.form.monto = Number(company.precio_mensual ?? 0);
    if (!this.form.representante_nombre) this.form.representante_nombre = company.contacto_nombre ?? '';
  }

  onPlanChange(): void {
    const plan = this.plans.find((p) => p.id === Number(this.form?.plan_id));
    if (plan && this.form && this.form.periodicidad === 'Mensual') this.form.monto = Number(plan.precio_mensual);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { this.formError = 'El archivo pasa de 3 MB. Escanéalo con menor resolución.'; return; }
    if (!/pdf|image\//.test(file.type)) { this.formError = 'Sube el contrato firmado en PDF o como imagen.'; return; }
    const reader = new FileReader();
    reader.onload = () => { this.pendingFile = { data: String(reader.result), name: file.name }; this.formError = ''; };
    reader.readAsDataURL(file);
  }

  async openFile(c: PlatformContract): Promise<void> {
    if (!c.id) return;
    try {
      const data = await this.platform.getContractFile(c.id);
      if (!data) return;
      const blob = await (await fetch(data)).blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo abrir el archivo', text: this.message(error) });
    }
  }

  async save(next?: Partial<PlatformContract>): Promise<void> {
    if (!this.form) return;
    const f = { ...this.form, ...next };
    if (!f.empresa_id) { this.formError = 'Elige la empresa.'; return; }
    if (f.fecha_fin && f.fecha_fin < f.fecha_inicio) { this.formError = 'La fecha final no puede ser antes de la de inicio.'; return; }
    this.isSaving = true;
    this.formError = '';
    try {
      const payload: PlatformContract = {
        ...f, empresa_id: Number(f.empresa_id), plan_id: f.plan_id ? Number(f.plan_id) : null, monto: Number(f.monto) || 0,
        fecha_fin: f.fecha_fin || null, firmado_en: f.firmado_en || null,
        descripcion: f.descripcion?.trim() || null, condiciones: f.condiciones?.trim() || null, notas: f.notas?.trim() || null,
        representante_nombre: f.representante_nombre?.trim() || null, representante_cedula: f.representante_cedula?.trim() || null,
        representante_cargo: f.representante_cargo?.trim() || null
      };
      if (this.pendingFile) { payload.archivo = this.pendingFile.data; payload.archivo_nombre = this.pendingFile.name; }
      const saved = await this.platform.saveContract(payload);
      this.form = { ...payload, id: saved.id, numero: saved.numero, archivo: undefined };
      this.pendingFile = null;
      await this.load();
      void Swal.fire({ icon: 'success', title: `Contrato ${saved.numero} guardado`, timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
    } catch (error) {
      this.formError = this.message(error);
    } finally { this.isSaving = false; }
  }

  async markSigned(): Promise<void> {
    if (!this.form) return;
    const { value } = await Swal.fire({ title: 'Fecha de firma', input: 'date', inputValue: this.form.firmado_en || this.iso(new Date()), showCancelButton: true, confirmButtonText: 'Marcar vigente', cancelButtonText: 'Cancelar' });
    if (!value) return;
    await this.save({ estado: 'Vigente', firmado_en: String(value) });
  }

  async cancelContract(): Promise<void> {
    const result = await Swal.fire({ icon: 'warning', title: '¿Cancelar este contrato?', text: 'Quedará como cancelado. No se borra.', showCancelButton: true, confirmButtonText: 'Cancelar contrato', cancelButtonText: 'Volver' });
    if (result.isConfirmed) await this.save({ estado: 'Cancelado' });
  }

  async remove(): Promise<void> {
    if (!this.form?.id) return;
    const result = await Swal.fire({ icon: 'warning', title: `¿Eliminar el borrador ${this.form.numero}?`, showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Volver' });
    if (!result.isConfirmed) return;
    try { await this.platform.deleteContract(this.form.id); this.form = null; await this.load(); }
    catch (error) { this.formError = this.message(error); }
  }

  print(c: PlatformContract): void {
    const company = this.companies.find((x) => x.id === c.empresa_id) ?? { nombre_comercial: this.companyName(c.empresa_id) };
    this.platform.printContract(c, company, this.planName(c.plan_id));
  }

  date(value: string | null | undefined): string {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  private daysTo(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
  }
  private iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  private message(error: unknown): string { return String((error as { message?: string })?.message ?? error ?? 'Error'); }
}
