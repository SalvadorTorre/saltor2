import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { PlatformPlan, PlatformService } from '../../core/services/platform/platform.service';

@Component({
  selector: 'app-platform-plans-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-plans-page.component.html',
  styleUrls: ['./platform-plans-page.component.scss']
})
export class PlatformPlansPageComponent implements OnInit {
  plans: PlatformPlan[] = [];
  form: PlatformPlan = this.empty();
  isLoading = false;
  isSaving = false;
  errorMessage = '';

  constructor(private readonly platform: PlatformService) {}

  async ngOnInit(): Promise<void> { await this.load(); }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try { this.plans = await this.platform.getPlans(); }
    catch (error) {
      const message = String((error as { message?: string })?.message ?? '');
      this.errorMessage = /plataforma_planes/.test(message) ? 'Falta aplicar la migración de la plataforma en la base de datos.' : message;
    } finally { this.isLoading = false; }
  }

  edit(plan: PlatformPlan): void { this.form = { ...plan }; }
  reset(): void { this.form = this.empty(); }

  async save(): Promise<void> {
    if (!this.form.nombre?.trim()) { this.errorMessage = 'Escribe el nombre del plan.'; return; }
    this.isSaving = true;
    this.errorMessage = '';
    try {
      await this.platform.savePlan(this.form);
      this.reset();
      await this.load();
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error);
      this.errorMessage = /duplicate|unique/i.test(message) ? 'Ya existe un plan con ese nombre.' : message;
    } finally { this.isSaving = false; }
  }

  async remove(plan: PlatformPlan): Promise<void> {
    if (!plan.id) return;
    const result = await Swal.fire({ icon: 'warning', title: `¿Eliminar el plan ${plan.nombre}?`, showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar' });
    if (!result.isConfirmed) return;
    try {
      await this.platform.deletePlan(plan.id);
      if (this.form.id === plan.id) this.reset();
      await this.load();
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error);
      await Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: /foreign key|violates/i.test(message) ? 'Hay empresas con este plan. Desactívalo en lugar de eliminarlo.' : message });
    }
  }

  private empty(): PlatformPlan {
    return { nombre: '', descripcion: '', precio_mensual: 0, max_usuarios: null, max_sucursales: null, activo: true, orden: (this.plans?.length ?? 0) + 1 };
  }
}
