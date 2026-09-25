import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { Company, NcfCompany, NcfSequence, NcfCompanyFormModel, NcfSequenceFormModel } from '../../app.models';
import { NcfService } from '../../core/services/ncf/ncf.service';

@Component({
  selector: 'app-ncf-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ncf-page.component.html',
  styleUrls: ['./ncf-page.component.scss']
})
export class NcfPageComponent implements OnInit {
  ncfViewMode: 'companies' | 'sequences' = 'companies';
  ncfCompanyEditorMode: 'create' | 'edit' = 'create';
  ncfSequenceEditorMode: 'create' | 'edit' = 'create';

  ncfSearch = '';
  ncfSequenceSearch = '';
  ncfSequenceCompanyFilter = 'all';
  ncfSequenceTypeFilter = 'all';
  ncfSequenceStatusFilter = 'all';
  openNcfCompanyActionsId: number | null = null;
  ncfCompanyMessage = 'Registra empresas autorizadas para recibir secuencias de comprobantes fiscales.';
  ncfSequenceMessage = 'Asigna y controla los rangos NCF autorizados por la DGII.';
  isLoadingNcf = false;
  isSavingNcfCompany = false;
  isSavingNcfSequence = false;
  isDeletingNcfSequence = false;
  isSequenceEditorModalVisible = false;
  selectedNcfCompanyId: number | null = null;
  selectedNcfSequenceId: number | null = null;

  ncfCompanyForm: NcfCompanyFormModel = {
    rnc: '',
    legalName: '',
    tradeName: '',
    address: '',
    phone: '',
    email: '',
    status: 'Activa'
  };
  ncfSequenceForm: NcfSequenceFormModel = {
    companyId: null,
    ncfType: '01 - Credito Fiscal',
    series: 'E31',
    rangeStart: '',
    rangeEnd: '',
    authorizedAt: '',
    expiresAt: '',
    status: 'Activa',
    used: 0,
    alertPercent: 80
  };

  constructor(public data: AppDataService, private readonly ncfService: NcfService) {}

  ngOnInit(): void {
    void this.loadNcfData();
  }

  get selectedNcfCompany(): NcfCompany | null {
    return this.data.ncfCompanies.find((company) => company.id === this.selectedNcfCompanyId) ?? this.data.ncfCompanies[0] ?? null;
  }

  get selectedNcfSequence(): NcfSequence | null {
    return this.data.ncfSequences.find((sequence) => sequence.id === this.selectedNcfSequenceId) ?? this.data.ncfSequences[0] ?? null;
  }

  get filteredNcfCompanies(): NcfCompany[] {
    const term = this.ncfSearch.trim().toLowerCase();
    if (!term) {
      return this.data.ncfCompanies;
    }

    return this.data.ncfCompanies.filter((company) =>
      [company.rnc, company.legalName, company.tradeName].some((value) => value.toLowerCase().includes(term))
    );
  }

  get filteredNcfSequences(): NcfSequence[] {
    return this.data.ncfSequences.filter((sequence) => {
      const matchesSearch = !this.ncfSequenceSearch.trim()
        || [this.getNcfCompanyName(sequence.companyId), sequence.series, sequence.ncfType]
          .some((value) => value.toLowerCase().includes(this.ncfSequenceSearch.trim().toLowerCase()));
      const matchesCompany = this.ncfSequenceCompanyFilter === 'all'
        || String(sequence.companyId) === this.ncfSequenceCompanyFilter;
      const matchesType = this.ncfSequenceTypeFilter === 'all'
        || sequence.ncfType === this.ncfSequenceTypeFilter;
      const matchesStatus = this.ncfSequenceStatusFilter === 'all'
        || sequence.status === this.ncfSequenceStatusFilter;

      return matchesSearch && matchesCompany && matchesType && matchesStatus;
    });
  }

  get ncfStats(): { label: string; value: number; tone: string }[] {
    return [
      { label: 'Total Secuencias', value: this.data.ncfSequences.length, tone: 'neutral' },
      { label: 'Activas', value: this.data.ncfSequences.filter((item) => item.status === 'Activa').length, tone: 'success' },
      { label: 'Agotadas', value: this.data.ncfSequences.filter((item) => item.status === 'Agotada').length, tone: 'danger' },
      { label: 'Vencidas', value: this.data.ncfSequences.filter((item) => item.status === 'Vencida').length, tone: 'warning' },
      { label: 'Con Alertas', value: this.data.ncfSequences.filter((item) => item.alert).length, tone: 'alert' }
    ];
  }

  isSelectedNcfCompany(company: NcfCompany): boolean {
    return this.selectedNcfCompany?.id === company.id;
  }

  isSelectedNcfSequence(sequence: NcfSequence): boolean {
    return this.selectedNcfSequence?.id === sequence.id;
  }

  get hasSingleCompany(): boolean {
    return this.data.companies.length === 1;
  }

  get singleCompany(): Company | null {
    return this.hasSingleCompany ? this.data.companies[0] : null;
  }

  setNcfViewMode(mode: 'companies' | 'sequences'): void {
    this.ncfViewMode = mode;
  }

  getNcfCompanyName(companyId: number): string {
    const fromMain = this.data.companies.find((company) => company.id === companyId);
    if (fromMain) return fromMain.legalName;
    const fromNcf = this.data.ncfCompanies.find((company) => company.id === companyId);
    return fromNcf?.legalName ?? 'Empresa no disponible';
  }

  getNcfCompanyRnc(companyId: number): string {
    const fromMain = this.data.companies.find((company) => company.id === companyId);
    if (fromMain) return fromMain.rnc;
    const fromNcf = this.data.ncfCompanies.find((company) => company.id === companyId);
    return fromNcf?.rnc ?? '---';
  }

  getNcfSequencesByCompany(companyId: number): NcfSequence[] {
    return this.data.ncfSequences.filter((sequence) => sequence.companyId === companyId);
  }

  getNcfUsagePercent(sequence: NcfSequence): number {
    if (!sequence.total) {
      return 0;
    }

    return Math.min(100, Math.round((sequence.used / sequence.total) * 100));
  }

  canDeleteNcfCompany(company: NcfCompany): boolean {
    return this.getNcfSequencesByCompany(company.id).length === 0;
  }

  selectNcfCompany(company: NcfCompany): void {
    this.selectedNcfCompanyId = company.id;
    this.loadNcfCompanyIntoForm(company, 'edit');
    this.ncfCompanyMessage = `Editando la empresa ${company.tradeName}.`;
    this.openNcfCompanyActionsId = null;
  }

  private normalizeCompanySource(): Company | NcfCompany | null {
    return (
      this.selectedNcfCompany ??
      (this.singleCompany as NcfCompany | null) ??
      this.data.ncfCompanies[0] ??
      null
    );
  }

  startCreateNcfCompany(): void {
    this.ncfCompanyEditorMode = 'create';
    this.ncfCompanyForm = {
      rnc: '',
      legalName: '',
      tradeName: '',
      address: '',
      phone: '',
      email: '',
      status: 'Activa'
    };
    this.ncfCompanyMessage = 'Completa los datos para registrar una nueva empresa para e-NCF.';
  }

  async saveNcfCompany(): Promise<void> {
    if (!this.ncfCompanyForm.rnc.trim() || !this.ncfCompanyForm.legalName.trim() || !this.ncfCompanyForm.tradeName.trim()) {
      this.ncfCompanyMessage = 'Completa RNC, razon social y nombre comercial antes de guardar.';
      return;
    }

    this.isSavingNcfCompany = true;
    try {
      if (this.ncfCompanyEditorMode === 'create') {
        const newCompany = await this.ncfService.createCompany(this.ncfCompanyForm, this.formatDateOnly());
        this.data.ncfCompanies = [newCompany, ...this.data.ncfCompanies.filter((company) => company.id !== newCompany.id)];
        this.selectedNcfCompanyId = newCompany.id;
        this.loadNcfCompanyIntoForm(newCompany, 'edit');
        this.ncfCompanyMessage = `Empresa ${newCompany.tradeName} registrada correctamente.`;
        return;
      }

      const companyId = this.selectedNcfCompanyId ?? this.selectedNcfCompany?.id;
      const createdAt = this.selectedNcfCompany?.createdAt || this.formatDateOnly();
      if (!companyId) {
        this.ncfCompanyMessage = 'Selecciona una empresa NCF antes de actualizar.';
        return;
      }

      const updated = await this.ncfService.updateCompany(companyId, this.ncfCompanyForm, createdAt);
      this.data.ncfCompanies = this.data.ncfCompanies.map((company) => company.id === updated.id ? updated : company);
      this.selectedNcfCompanyId = updated.id;
      this.loadNcfCompanyIntoForm(updated, 'edit');
      this.ncfCompanyMessage = `Empresa ${updated.tradeName} actualizada correctamente.`;
    } catch (error) {
      this.ncfCompanyMessage = this.formatSupabaseError(error, 'No se pudo guardar la empresa NCF.');
    } finally {
      this.isSavingNcfCompany = false;
    }
  }

  async deleteNcfCompany(company: NcfCompany): Promise<void> {
    if (!this.canDeleteNcfCompany(company)) {
      this.ncfCompanyMessage = `No se puede eliminar ${company.tradeName} porque tiene secuencias asignadas.`;
      return;
    }

    try {
      await this.ncfService.deleteCompany(company.id);
      this.data.ncfCompanies = this.data.ncfCompanies.filter((item) => item.id !== company.id);
      this.openNcfCompanyActionsId = null;
      const firstCompany = this.data.ncfCompanies[0];
      if (firstCompany) {
        this.selectedNcfCompanyId = firstCompany.id;
        this.loadNcfCompanyIntoForm(firstCompany, 'edit');
      } else {
        this.selectedNcfCompanyId = null;
        this.startCreateNcfCompany();
      }
      this.ncfCompanyMessage = `Empresa ${company.tradeName} eliminada correctamente.`;
    } catch (error) {
      this.ncfCompanyMessage = this.formatSupabaseError(error, 'No se pudo eliminar la empresa NCF.');
    }
  }

  viewNcfCompanySequences(company: NcfCompany | Company): void {
    this.selectedNcfCompanyId = company.id;
    this.ncfSequenceCompanyFilter = String(company.id);
    this.openNcfCompanyActionsId = null;
    const firstSequence = this.getNcfSequencesByCompany(company.id)[0];
    if (firstSequence) {
      this.selectNcfSequence(firstSequence);
    }
    setTimeout(() => {
      const el = document.getElementById('ncf-sequences-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  }

  toggleNcfCompanyActions(companyId: number): void {
    this.openNcfCompanyActionsId = this.openNcfCompanyActionsId === companyId ? null : companyId;
  }

  selectNcfSequence(sequence: NcfSequence): void {
    this.selectedNcfSequenceId = sequence.id;
    this.loadNcfSequenceIntoForm(sequence, 'edit');
    this.ncfSequenceMessage = `Editando la secuencia ${sequence.series} de ${this.getNcfCompanyName(sequence.companyId)}.`;
    this.isSequenceEditorModalVisible = true;
  }

  startCreateNcfSequence(): void {
    this.ncfSequenceEditorMode = 'create';
    this.ncfSequenceForm = {
      companyId: this.data.companies[0]?.id ?? this.selectedNcfCompany?.id ?? this.data.ncfCompanies[0]?.id ?? null,
      ncfType: '01 - Credito Fiscal',
      series: 'E31',
      rangeStart: '',
      rangeEnd: '',
      authorizedAt: '',
      expiresAt: '',
      status: 'Activa',
      used: 0,
      alertPercent: 80
    };
    this.ncfSequenceMessage = 'Completa los datos para asignar un nuevo rango de secuencia NCF.';
    this.isSequenceEditorModalVisible = true;
  }

  closeNcfSequenceEditor(): void {
    if (!this.isSavingNcfSequence) {
      this.isSequenceEditorModalVisible = false;
    }
  }

  async deleteNcfSequence(sequence: NcfSequence): Promise<void> {
    if (this.isDeletingNcfSequence) return;
    const confirmed = window.confirm(`¿Deseas eliminar la secuencia ${sequence.series}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    this.isDeletingNcfSequence = true;
    try {
      await this.ncfService.deleteSequence(sequence.id);
      this.data.ncfSequences = this.data.ncfSequences.filter((item) => item.id !== sequence.id);
      if (this.selectedNcfSequenceId === sequence.id) {
        this.selectedNcfSequenceId = null;
        this.isSequenceEditorModalVisible = false;
      }
      this.ncfSequenceMessage = `Secuencia ${sequence.series} eliminada correctamente.`;
    } catch (error) {
      this.ncfSequenceMessage = this.formatSupabaseError(error, 'No se pudo eliminar la secuencia NCF.');
    } finally {
      this.isDeletingNcfSequence = false;
    }
  }

  async saveNcfSequence(): Promise<void> {
    const form = this.ncfSequenceForm;
    if (!form.companyId || !form.rangeStart.trim() || !form.rangeEnd.trim() || !form.authorizedAt || !form.expiresAt) {
      this.ncfSequenceMessage = 'Completa empresa, rango y fechas de autorizacion/vencimiento antes de guardar.';
      return;
    }

    const used = Math.max(0, Math.floor(Number(form.used) || 0));
    const alertPercent = Math.min(100, Math.max(0, Math.floor(Number(form.alertPercent) || 0)));
    const total = this.calculateSequenceCount(form.rangeStart, form.rangeEnd);
    const alert = total > 0 && used >= Math.max(1, Math.floor(total * (alertPercent / 100)));
    const normalizedForm = { ...form, used, alertPercent };

    this.isSavingNcfSequence = true;
    try {
      if (this.ncfSequenceEditorMode === 'create') {
        const newSequence = await this.ncfService.createSequence(normalizedForm, total, alert);
        this.data.ncfSequences = [newSequence, ...this.data.ncfSequences.filter((sequence) => sequence.id !== newSequence.id)];
        this.selectedNcfSequenceId = newSequence.id;
        this.loadNcfSequenceIntoForm(newSequence, 'edit');
        this.ncfSequenceMessage = `Secuencia ${newSequence.series} asignada correctamente.`;
        this.isSequenceEditorModalVisible = false;
        return;
      }

      const sequenceId = this.selectedNcfSequenceId ?? this.selectedNcfSequence?.id;
      if (!sequenceId) {
        this.ncfSequenceMessage = 'Selecciona una secuencia NCF antes de actualizar.';
        return;
      }

      const updated = await this.ncfService.updateSequence(sequenceId, normalizedForm, total, alert);
      this.data.ncfSequences = this.data.ncfSequences.map((sequence) => sequence.id === updated.id ? updated : sequence);
      this.selectedNcfSequenceId = updated.id;
      this.loadNcfSequenceIntoForm(updated, 'edit');
      this.ncfSequenceMessage = `Secuencia ${updated.series} actualizada correctamente.`;
      this.isSequenceEditorModalVisible = false;
    } catch (error) {
      this.ncfSequenceMessage = this.formatSupabaseError(error, 'No se pudo guardar la secuencia NCF.');
    } finally {
      this.isSavingNcfSequence = false;
    }
  }

  private loadNcfCompanyIntoForm(company: NcfCompany, mode: 'create' | 'edit'): void {
    this.ncfCompanyEditorMode = mode;
    this.selectedNcfCompanyId = company.id;
    this.ncfCompanyForm = {
      rnc: company.rnc,
      legalName: company.legalName,
      tradeName: company.tradeName,
      address: company.address,
      phone: company.phone,
      email: company.email,
      status: company.status
    };
  }

  private loadNcfSequenceIntoForm(sequence: NcfSequence, mode: 'create' | 'edit'): void {
    this.ncfSequenceEditorMode = mode;
    this.selectedNcfSequenceId = sequence.id;
    this.ncfSequenceForm = {
      companyId: sequence.companyId,
      ncfType: sequence.ncfType,
      series: sequence.series,
      rangeStart: sequence.rangeStart,
      rangeEnd: sequence.rangeEnd,
      authorizedAt: sequence.authorizedAt,
      expiresAt: sequence.expiresAt,
      status: sequence.status,
      used: sequence.used,
      alertPercent: sequence.alertPercent
    };
  }

  calculateSequenceCount(start: string, end: string): number {
    const startDigits = Number(start.replace(/\D/g, ''));
    const endDigits = Number(end.replace(/\D/g, ''));
    if (!startDigits || !endDigits || endDigits < startDigits) {
      return 0;
    }

    return (endDigits - startDigits) + 1;
  }

  private async loadNcfData(): Promise<void> {
    this.isLoadingNcf = true;
    try {
      const sequences = await this.ncfService.getSequences();
      this.data.ncfSequences = sequences;

      const firstCompany = this.data.companies[0] ?? this.data.ncfCompanies[0] ?? null;
      if (firstCompany) {
        this.selectedNcfCompanyId = firstCompany.id;
        this.startCreateNcfCompany();
      } else {
        this.selectedNcfCompanyId = null;
        this.startCreateNcfCompany();
      }

      const firstSequence = sequences[0];
      if (firstSequence) {
        this.selectedNcfSequenceId = firstSequence.id;
        this.loadNcfSequenceIntoForm(firstSequence, 'edit');
      } else {
        this.selectedNcfSequenceId = null;
        this.startCreateNcfSequence();
      }

      this.ncfCompanyMessage = (this.data.companies.length || this.data.ncfCompanies.length)
        ? 'Empresas cargadas desde el catalogo general de Configuracion.'
        : 'No hay empresas registradas. Registra una en Configuracion > Empresa.';
      this.ncfSequenceMessage = sequences.length ? 'Secuencias NCF cargadas desde Supabase.' : 'No hay secuencias NCF registradas. Puedes crear la primera.';
    } catch (error) {
      const message = this.formatSupabaseError(error, 'No se pudieron cargar los datos NCF desde Supabase.');
      this.ncfCompanyMessage = message;
      this.ncfSequenceMessage = message;
    } finally {
      this.isLoadingNcf = false;
    }
  }

  private formatDateOnly(): string {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }

  private formatSupabaseError(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return `${fallback} ${(error as { message?: string }).message ?? ''}`.trim();
    }
    return fallback;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.openNcfCompanyActionsId = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.openNcfCompanyActionsId = null;
  }
}
