import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  CompanyBranchRow, INSTALLATION_TYPES, PlatformCompany, PlatformInstallation, PlatformService, PlatformVisit, VISIT_TYPES
} from '../../core/services/platform/platform.service';

type View = 'equipos' | 'visitas';

@Component({
  selector: 'app-platform-installations-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-installations-page.component.html',
  styleUrls: ['./platform-installations-page.component.scss']
})
export class PlatformInstallationsPageComponent implements OnInit {
  /** ?empresa=ID y ?vista=visitas desde el panel de empresas. */
  @Input() empresa?: string;
  @Input() vista?: string;

  readonly types = INSTALLATION_TYPES;
  readonly visitTypes = VISIT_TYPES;

  view: View = 'equipos';
  companies: PlatformCompany[] = [];
  installations: PlatformInstallation[] = [];
  visits: PlatformVisit[] = [];
  branches: CompanyBranchRow[] = [];
  companyId: number | null = null;
  showRetired = false;
  text = '';
  from = '';
  to = '';
  isLoading = false;
  errorMessage = '';

  equipment: PlatformInstallation | null = null;
  visit: PlatformVisit | null = null;
  isSaving = false;
  formError = '';

  constructor(private readonly platform: PlatformService) {}

  async ngOnInit(): Promise<void> {
    this.companyId = this.empresa ? Number(this.empresa) || null : null;
    if (this.vista === 'visitas') this.view = 'visitas';
    const today = new Date();
    this.from = this.iso(new Date(today.getFullYear(), today.getMonth() - 2, 1));
    this.to = this.iso(today);
    try { this.companies = (await this.platform.getSummary()).empresas; } catch { /* se informa al consultar */ }
    await this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      [this.installations, this.visits] = await Promise.all([
        this.platform.getInstallations(),
        this.platform.getVisits({ from: this.from, to: this.to })
      ]);
    } catch (error) {
      const message = this.message(error);
      this.errorMessage = /plataforma_(instalaciones|visitas)/.test(message) ? 'Falta aplicar la migración de la fase 2 de la plataforma.' : message;
    } finally { this.isLoading = false; }
  }

  get visibleEquipment(): PlatformInstallation[] {
    const term = this.text.trim().toLowerCase();
    return this.installations.filter((i) => {
      if (this.companyId && i.empresa_id !== this.companyId) return false;
      if (!this.showRetired && i.estado === 'Retirada') return false;
      return !term || `${i.nombre_equipo} ${i.tipo} ${i.marca_modelo ?? ''} ${i.serie ?? ''} ${i.ip_local ?? ''} ${i.acceso_remoto ?? ''} ${i.responsable ?? ''} ${this.companyName(i.empresa_id)}`.toLowerCase().includes(term);
    });
  }

  get visibleVisits(): PlatformVisit[] {
    const term = this.text.trim().toLowerCase();
    return this.visits.filter((v) => (!this.companyId || v.empresa_id === this.companyId)
      && (!term || `${v.descripcion} ${v.tipo} ${v.tecnico ?? ''} ${this.companyName(v.empresa_id)} ${this.equipmentName(v.instalacion_id)}`.toLowerCase().includes(term)));
  }

  get visitsTotal(): number { return this.visibleVisits.reduce((sum, v) => sum + Number(v.monto || 0), 0); }
  get visitsHours(): number { return this.visibleVisits.reduce((sum, v) => sum + Number(v.horas || 0), 0); }

  companyName(id: number | null): string { return this.companies.find((c) => c.id === id)?.nombre_comercial ?? (id ? `Empresa #${id}` : '—'); }
  equipmentName(id: number | null): string { return this.installations.find((i) => i.id === id)?.nombre_equipo ?? ''; }
  equipmentFor(companyId: number | null): PlatformInstallation[] { return this.installations.filter((i) => i.empresa_id === companyId && i.estado !== 'Retirada'); }

  warrantyClass(i: PlatformInstallation): string {
    if (!i.garantia_hasta) return '';
    const days = this.daysTo(i.garantia_hasta);
    return days < 0 ? 'is-off' : days <= 30 ? 'is-warn' : 'is-ok';
  }

  async newEquipment(): Promise<void> {
    this.formError = '';
    this.equipment = {
      empresa_id: this.companyId, sucursal_id: null, nombre_equipo: '', tipo: 'PC de caja', marca_modelo: '', serie: '', sistema_operativo: 'WINDOWS 11',
      version_app: '', ip_local: '', acceso_remoto: '', ubicacion: '', responsable: '', telefono: '', fecha_instalacion: this.iso(new Date()),
      garantia_hasta: null, estado: 'Activa', notas: ''
    };
    await this.loadBranches();
  }

  async editEquipment(i: PlatformInstallation): Promise<void> {
    this.formError = '';
    this.equipment = { ...i };
    await this.loadBranches();
  }

  async loadBranches(): Promise<void> {
    const id = this.equipment?.empresa_id;
    this.branches = id ? await this.platform.getCompanyBranches(Number(id)).catch(() => []) : [];
    if (this.equipment && this.equipment.sucursal_id && !this.branches.some((b) => b.idsucursal === this.equipment?.sucursal_id)) this.equipment.sucursal_id = null;
    if (this.equipment && !this.equipment.sucursal_id && this.branches.length === 1) this.equipment.sucursal_id = this.branches[0].idsucursal;
  }

  branchName(id: number | null): string { return id ? (this.branches.find((b) => b.idsucursal === id)?.nombresucursal ?? `#${id}`) : ''; }

  async saveEquipment(): Promise<void> {
    const e = this.equipment;
    if (!e) return;
    if (!e.empresa_id) { this.formError = 'Elige la empresa.'; return; }
    if (!e.nombre_equipo?.trim()) { this.formError = 'Escribe el nombre del equipo.'; return; }
    this.isSaving = true;
    this.formError = '';
    try {
      const clean = (v: string | null) => (v ?? '').trim() || null;
      await this.platform.saveInstallation({
        ...e, empresa_id: Number(e.empresa_id), sucursal_id: e.sucursal_id ? Number(e.sucursal_id) : null, nombre_equipo: e.nombre_equipo.trim(),
        marca_modelo: clean(e.marca_modelo), serie: clean(e.serie), sistema_operativo: clean(e.sistema_operativo), version_app: clean(e.version_app),
        ip_local: clean(e.ip_local), acceso_remoto: clean(e.acceso_remoto), ubicacion: clean(e.ubicacion), responsable: clean(e.responsable),
        telefono: clean(e.telefono), fecha_instalacion: e.fecha_instalacion || null, garantia_hasta: e.garantia_hasta || null, notas: clean(e.notas)
      });
      this.equipment = null;
      await this.load();
    } catch (error) { this.formError = this.message(error); }
    finally { this.isSaving = false; }
  }

  async deleteEquipment(): Promise<void> {
    if (!this.equipment?.id) return;
    const result = await Swal.fire({
      icon: 'warning', title: `¿Eliminar ${this.equipment.nombre_equipo}?`, text: 'Si el equipo ya no se usa, es mejor marcarlo como Retirada para conservar su historial.',
      showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Volver'
    });
    if (!result.isConfirmed) return;
    try { await this.platform.deleteInstallation(this.equipment.id); this.equipment = null; await this.load(); }
    catch (error) { this.formError = this.message(error); }
  }

  newVisit(installation?: PlatformInstallation): void {
    this.formError = '';
    this.equipment = null;
    this.visit = {
      empresa_id: installation?.empresa_id ?? this.companyId, instalacion_id: installation?.id ?? null, fecha: this.iso(new Date()), tipo: 'Soporte',
      modalidad: 'Remota', descripcion: '', tecnico: '', horas: null, monto: 0
    };
  }

  editVisit(v: PlatformVisit): void { this.formError = ''; this.visit = { ...v }; }

  async saveVisit(): Promise<void> {
    const v = this.visit;
    if (!v) return;
    if (!v.empresa_id) { this.formError = 'Elige la empresa.'; return; }
    if (!v.descripcion?.trim()) { this.formError = 'Describe el trabajo realizado.'; return; }
    this.isSaving = true;
    this.formError = '';
    try {
      await this.platform.saveVisit({
        ...v, empresa_id: Number(v.empresa_id), instalacion_id: v.instalacion_id ? Number(v.instalacion_id) : null, descripcion: v.descripcion.trim(),
        tecnico: v.tecnico?.trim() || null, horas: v.horas === null || (v.horas as unknown) === '' ? null : Number(v.horas), monto: Number(v.monto) || 0
      });
      this.visit = null;
      await this.load();
    } catch (error) { this.formError = this.message(error); }
    finally { this.isSaving = false; }
  }

  async deleteVisit(): Promise<void> {
    if (!this.visit?.id) return;
    const result = await Swal.fire({ icon: 'warning', title: '¿Eliminar esta visita?', showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Volver' });
    if (!result.isConfirmed) return;
    try { await this.platform.deleteVisit(this.visit.id); this.visit = null; await this.load(); }
    catch (error) { this.formError = this.message(error); }
  }

  closeForms(): void { this.equipment = null; this.visit = null; }

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
