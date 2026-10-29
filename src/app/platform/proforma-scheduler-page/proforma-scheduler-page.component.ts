import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { PlatformCompany, PlatformService, ProformaSchedule } from '../../core/services/platform/platform.service';

type ScheduleForm = Pick<ProformaSchedule, 'empresa_id' | 'activo' | 'hora_desde' | 'hora_hasta' | 'intervalo_minutos' | 'lote_por_ciclo' | 'maximo_diario'>;

@Component({
  selector: 'app-proforma-scheduler-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proforma-scheduler-page.component.html',
  styleUrls: ['./proforma-scheduler-page.component.scss']
})
export class ProformaSchedulerPageComponent implements OnInit {
  companies: PlatformCompany[] = [];
  selectedCompanyId: number | null = null;
  form: ScheduleForm = this.defaultForm(0);
  schedule: ProformaSchedule | null = null;
  isLoading = false;
  isSaving = false;
  errorMessage = '';

  constructor(private readonly platform: PlatformService) {}

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      const summary = await this.platform.getSummary();
      this.companies = summary.empresas;
      if (this.companies.length) {
        this.selectedCompanyId = this.companies[0].id;
        await this.loadSchedule();
      }
    } catch (error) {
      this.errorMessage = this.error(error);
    } finally {
      this.isLoading = false;
    }
  }

  async changeCompany(): Promise<void> {
    await this.loadSchedule();
  }

  async loadSchedule(): Promise<void> {
    if (!this.selectedCompanyId) return;
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.schedule = await this.platform.getProformaSchedule(this.selectedCompanyId);
      this.form = {
        empresa_id: this.schedule.empresa_id,
        activo: this.schedule.activo,
        hora_desde: this.toInputTime(this.schedule.hora_desde),
        hora_hasta: this.toInputTime(this.schedule.hora_hasta),
        intervalo_minutos: this.schedule.intervalo_minutos,
        lote_por_ciclo: this.schedule.lote_por_ciclo,
        maximo_diario: this.schedule.maximo_diario
      };
    } catch (error) {
      this.errorMessage = this.error(error);
    } finally {
      this.isLoading = false;
    }
  }

  async save(): Promise<void> {
    if (!this.selectedCompanyId) return;
    this.form.empresa_id = this.selectedCompanyId;
    if (!this.form.hora_desde || !this.form.hora_hasta) {
      await Swal.fire({ icon: 'warning', title: 'Horas requeridas', text: 'Indica la hora desde y hasta.' });
      return;
    }
    this.isSaving = true;
    this.errorMessage = '';
    try {
      this.schedule = await this.platform.saveProformaSchedule(this.form);
      this.form.hora_desde = this.toInputTime(this.schedule.hora_desde);
      this.form.hora_hasta = this.toInputTime(this.schedule.hora_hasta);
      await Swal.fire({ icon: 'success', title: 'Programación guardada', text: this.form.activo ? 'El procesamiento gradual quedó activo.' : 'La programación quedó pausada.' });
    } catch (error) {
      this.errorMessage = this.error(error);
      await Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: this.error(error) });
    } finally {
      this.isSaving = false;
    }
  }

  get selectedCompany(): PlatformCompany | undefined { return this.companies.find((company) => company.id === this.selectedCompanyId); }
  get latestSummary(): Record<string, unknown> { return this.schedule?.ultimo_resumen ?? {}; }

  private defaultForm(companyId: number): ScheduleForm {
    return { empresa_id: companyId, activo: false, hora_desde: '18:00', hora_hasta: '23:00', intervalo_minutos: 2, lote_por_ciclo: 1, maximo_diario: 100 };
  }
  private toInputTime(value: string): string { return String(value ?? '').slice(0, 5) || '18:00'; }
  private error(value: unknown): string { return String((value as { message?: string })?.message ?? value ?? 'Ocurrió un error inesperado.'); }
}
