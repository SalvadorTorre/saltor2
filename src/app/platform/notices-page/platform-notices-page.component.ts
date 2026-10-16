import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { PlatformCompany, PlatformNotice, PlatformService } from '../../core/services/platform/platform.service';

@Component({
  selector: 'app-platform-notices-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-notices-page.component.html',
  styleUrls: ['./platform-notices-page.component.scss']
})
export class PlatformNoticesPageComponent implements OnInit {
  notices: PlatformNotice[] = [];
  companies: PlatformCompany[] = [];
  form: PlatformNotice = this.empty();
  isLoading = false;
  isSaving = false;
  errorMessage = '';

  constructor(private readonly platform: PlatformService) {}

  async ngOnInit(): Promise<void> {
    try { this.companies = (await this.platform.getSummary()).empresas; } catch { /* sin nombres */ }
    await this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try { this.notices = await this.platform.getNoticesAdmin(); }
    catch (error) {
      const message = this.message(error);
      this.errorMessage = /plataforma_avisos/.test(message) ? 'Falta aplicar la migración de la fase 3 de la plataforma.' : message;
    } finally { this.isLoading = false; }
  }

  companyName(id: number | null): string { return id ? (this.companies.find((c) => c.id === id)?.nombre_comercial ?? `Empresa #${id}`) : 'Todas las empresas'; }

  status(n: PlatformNotice): string {
    if (!n.activo) return 'Inactivo';
    const today = this.iso(new Date());
    if (n.desde > today) return 'Programado';
    if (n.hasta && n.hasta < today) return 'Terminado';
    return 'Visible';
  }
  statusClass(s: string): string { return ({ Visible: 'is-ok', Programado: 'is-trial', Terminado: 'is-off', Inactivo: 'is-off' } as Record<string, string>)[s] ?? ''; }
  levelClass(l: string): string { return ({ Urgente: 'is-bad', Advertencia: 'is-warn', 'Información': 'is-trial' } as Record<string, string>)[l] ?? ''; }

  edit(n: PlatformNotice): void { this.form = { ...n }; }
  reset(): void { this.form = this.empty(); }

  async save(): Promise<void> {
    if (!this.form.titulo?.trim()) { this.errorMessage = 'Escribe el título del aviso.'; return; }
    if (this.form.hasta && this.form.hasta < this.form.desde) { this.errorMessage = 'La fecha final no puede ser antes de la inicial.'; return; }
    this.isSaving = true;
    this.errorMessage = '';
    try {
      await this.platform.saveNotice({
        ...this.form, titulo: this.form.titulo.trim(), mensaje: this.form.mensaje?.trim() || null,
        empresa_id: this.form.empresa_id ? Number(this.form.empresa_id) : null, hasta: this.form.hasta || null
      });
      this.reset();
      await this.load();
    } catch (error) { this.errorMessage = this.message(error); }
    finally { this.isSaving = false; }
  }

  async toggle(n: PlatformNotice): Promise<void> {
    try { await this.platform.saveNotice({ ...n, activo: !n.activo }); await this.load(); }
    catch (error) { this.errorMessage = this.message(error); }
  }

  async remove(n: PlatformNotice): Promise<void> {
    if (!n.id) return;
    const result = await Swal.fire({ icon: 'warning', title: `¿Eliminar el aviso "${n.titulo}"?`, showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Volver' });
    if (!result.isConfirmed) return;
    try { await this.platform.deleteNotice(n.id); if (this.form.id === n.id) this.reset(); await this.load(); }
    catch (error) { this.errorMessage = this.message(error); }
  }

  date(value: string | null | undefined): string {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  private empty(): PlatformNotice {
    return { titulo: '', mensaje: '', nivel: 'Información', empresa_id: null, desde: this.iso(new Date()), hasta: null, activo: true };
  }
  private iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  private message(error: unknown): string { return String((error as { message?: string })?.message ?? error ?? 'Error'); }
}
