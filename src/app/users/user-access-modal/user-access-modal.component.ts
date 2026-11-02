import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { CompanyModulesService } from '../../core/services/company-modules/company-modules.service';
import { ADMIN_ONLY_SCREENS, PERMISSION_MODULES, PermissionModule, roleDefaults } from '../../core/services/permissions/permission-catalog';
import { SupabaseService } from '../../core/services/supabase/supabase.service';

export interface AccessModalUser { id: number; fullName: string; role: string; companyId: number | null; }

/** Ventana "Accesos por módulo" de un usuario: pantallas y acciones que puede usar. */
@Component({
  selector: 'app-user-access-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-access-modal.component.html',
  styleUrls: ['./user-access-modal.component.scss']
})
export class UserAccessModalComponent implements OnInit {
  @Input({ required: true }) user!: AccessModalUser;
  @Output() closed = new EventEmitter<boolean>();

  modules: PermissionModule[] = [];
  screens = new Set<string>();
  actions = new Set<string>();
  customized = false;
  updatedBy = '';
  updatedAt = '';
  isLoading = true;
  isSaving = false;
  error = '';
  readonly adminOnly = ADMIN_ONLY_SCREENS;

  constructor(private readonly supabase: SupabaseService, private readonly companyModules: CompanyModulesService) {}

  get isAdminUser(): boolean { return this.user.role === 'Administrador'; }

  async ngOnInit(): Promise<void> {
    try {
      let active: string[] = PERMISSION_MODULES.map((m) => m.companyModule);
      try { active = await this.companyModules.getActiveModules(this.user.companyId ?? undefined); } catch { /* todos */ }
      this.modules = PERMISSION_MODULES.filter((m) => active.includes(m.companyModule));
      if (this.isAdminUser) { this.applyDefaults(); return; }
      const { data, error } = await this.supabase.client.rpc('permisos_usuario', { p_codusuario: this.user.id });
      if (error) throw error;
      const row = data as { personalizado: boolean; pantallas: string[]; acciones: string[]; actualizadoPor?: string; actualizadoEn?: string };
      if (row?.personalizado) {
        this.customized = true;
        this.screens = new Set(row.pantallas ?? []);
        this.actions = new Set(row.acciones ?? []);
        this.updatedBy = row.actualizadoPor ?? '';
        this.updatedAt = row.actualizadoEn ? new Date(row.actualizadoEn).toLocaleString('es-DO') : '';
      } else {
        this.applyDefaults();
      }
    } catch (error) {
      this.error = String((error as { message?: string })?.message ?? error);
    } finally {
      this.isLoading = false;
    }
  }

  moduleState(module: PermissionModule): 'all' | 'some' | 'none' {
    const keys = this.screenKeys(module);
    const on = keys.filter((k) => this.screens.has(k)).length + module.actions.filter((a) => this.actions.has(a.key)).length;
    const total = keys.length + module.actions.length;
    return on === 0 ? 'none' : on === total ? 'all' : 'some';
  }

  toggleModule(module: PermissionModule): void {
    if (this.isAdminUser) return;
    const turnOn = this.moduleState(module) !== 'all';
    for (const key of this.screenKeys(module)) this.set(this.screens, key, turnOn);
    for (const action of module.actions) this.set(this.actions, action.key, turnOn);
  }

  toggleScreen(path: string): void {
    if (this.isAdminUser || this.adminOnly.includes(path)) return;
    this.set(this.screens, path, !this.screens.has(path));
  }

  toggleAction(key: string): void {
    if (this.isAdminUser) return;
    this.set(this.actions, key, !this.actions.has(key));
  }

  isScreenLocked(path: string): boolean {
    return this.isAdminUser || this.adminOnly.includes(path);
  }

  async resetToRole(): Promise<void> {
    const answer = await Swal.fire({ icon: 'question', title: 'Volver a los accesos del rol', text: `${this.user.fullName} tendrá los accesos normales del rol ${this.user.role}.`, showCancelButton: true, confirmButtonText: 'Sí, restablecer', cancelButtonText: 'Cancelar' });
    if (!answer.isConfirmed) return;
    this.isSaving = true;
    try {
      const { error } = await this.supabase.client.rpc('guardar_permisos_usuario', { p_codusuario: this.user.id, p_pantallas: null, p_acciones: null });
      if (error) throw error;
      void Swal.fire({ icon: 'success', title: 'Accesos del rol restablecidos', timer: 1400, showConfirmButton: false, toast: true, position: 'top-end' });
      this.closed.emit(true);
    } catch (error) {
      this.error = String((error as { message?: string })?.message ?? error);
    } finally {
      this.isSaving = false;
    }
  }

  async save(): Promise<void> {
    if (this.isAdminUser) { this.closed.emit(false); return; }
    this.isSaving = true;
    this.error = '';
    try {
      const { error } = await this.supabase.client.rpc('guardar_permisos_usuario', {
        p_codusuario: this.user.id,
        p_pantallas: [...this.screens].filter((s) => !this.adminOnly.includes(s)),
        p_acciones: [...this.actions]
      });
      if (error) throw error;
      void Swal.fire({ icon: 'success', title: 'Accesos guardados', text: 'El usuario los verá al volver a entrar o recargar la página.', timer: 2200, showConfirmButton: false, toast: true, position: 'top-end' });
      this.closed.emit(true);
    } catch (error) {
      this.error = String((error as { message?: string })?.message ?? error);
    } finally {
      this.isSaving = false;
    }
  }

  close(): void { this.closed.emit(false); }

  private screenKeys(module: PermissionModule): string[] {
    return module.screens.map((s) => s.path).filter((p) => !this.adminOnly.includes(p));
  }

  private applyDefaults(): void {
    const defaults = roleDefaults(this.user.role);
    this.screens = new Set(defaults.screens);
    this.actions = new Set(defaults.actions);
    this.customized = false;
  }

  private set(target: Set<string>, key: string, on: boolean): void {
    if (on) target.add(key); else target.delete(key);
  }
}
