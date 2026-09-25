import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { Company, CompanyFormModel } from '../../app.models';
import { CompaniesService } from '../../core/services/companies/companies.service';
import { BranchesService, BranchFormModel, BranchRecord } from '../../core/services/branches/branches.service';

type CompanyEditorMode = 'create' | 'edit';

@Component({
  selector: 'app-company-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './company-page.component.html',
  styleUrls: ['./company-page.component.scss']
})
export class CompanyPageComponent implements OnInit {
  readonly companyBranches: Record<number, BranchRecord[]> = {};

  companyEditorMode: CompanyEditorMode = 'create';
  companyMessage = 'Formulario listo para registrar una nueva empresa.';
  isLoadingCompanies = false;
  isSavingCompany = false;
  isBranchModalOpen = false;
  isLoadingBranches = false;
  isSavingBranch = false;
  branchMessage = '';
  editingBranchId: number | null = null;
  branchForm: BranchFormModel = this.createEmptyBranchForm();
  selectedCompanyId: number | null = null;
  companyForm: CompanyFormModel = this.createEmptyCompanyForm();

  constructor(
    public data: AppDataService,
    private readonly companiesService: CompaniesService,
    private readonly branchesService: BranchesService
  ) {}

  ngOnInit(): void {
    void this.loadCompanies();
  }

  get companies(): Company[] {
    return this.data.companies;
  }

  get selectedCompany(): Company | null {
    return this.companies.find((company) => company.id === this.selectedCompanyId) ?? this.companies[0] ?? null;
  }

  get activeCompanyCount(): number {
    return this.companies.filter((company) => company.status === 'Activa').length;
  }

  get inactiveCompanyCount(): number {
    return this.companies.filter((company) => company.status === 'Inactiva').length;
  }

  calculateBranchCount(companyId: number): number {
    const company = this.companies.find((item) => item.id === companyId);
    return this.companyBranches[companyId]?.length ?? company?.branchCount ?? 0;
  }

  isSelectedCompany(company: Company): boolean {
    return this.selectedCompany?.id === company.id && this.companyEditorMode === 'edit';
  }

  selectCompany(company: Company): void {
    this.selectedCompanyId = company.id;
    this.loadCompanyIntoForm(company, 'edit');
    this.companyMessage = `Editando la empresa ${company.tradeName}.`;
  }

  startCreateCompany(): void {
    this.companyEditorMode = 'create';
    this.companyForm = this.createEmptyCompanyForm();
    this.companyMessage = 'Completa los datos para agregar una nueva empresa.';
  }

  async saveCompany(): Promise<void> {
    if (!this.companyForm.tradeName.trim() || !this.companyForm.rnc.trim() || !this.companyForm.email.trim()) {
      this.companyMessage = 'Completa nombre comercial, RNC y correo antes de guardar.';
      return;
    }

    this.isSavingCompany = true;
    try {
      const lastUpdate = this.formatTimestamp();
      if (this.companyEditorMode === 'create') {
        const company = await this.companiesService.createCompany(this.companyForm, lastUpdate);
        this.data.companies = [company, ...this.companies.filter((item) => item.id !== company.id)];
        this.selectedCompanyId = company.id;
        this.loadCompanyIntoForm(company, 'edit');
        this.companyMessage = `Empresa ${company.tradeName} agregada correctamente.`;
        return;
      }

      const companyId = this.selectedCompanyId ?? this.selectedCompany?.id;
      if (!companyId) {
        this.companyMessage = 'Selecciona una empresa antes de actualizar.';
        return;
      }

      const updatedCompany = await this.companiesService.updateCompany(companyId, this.companyForm, lastUpdate);
      this.data.companies = this.companies.map((company) => company.id === updatedCompany.id ? updatedCompany : company);
      this.selectedCompanyId = updatedCompany.id;
      this.loadCompanyIntoForm(updatedCompany, 'edit');
      this.companyMessage = `Empresa ${updatedCompany.tradeName} actualizada correctamente.`;
    } catch (error) {
      this.companyMessage = this.formatSupabaseError(error, 'No se pudo guardar la empresa.');
    } finally {
      this.isSavingCompany = false;
    }
  }

  async deleteCompany(company: Company | null): Promise<void> {
    if (!company) {
      this.companyMessage = 'No hay una empresa seleccionada para eliminar.';
      return;
    }

    try {
      await this.companiesService.deleteCompany(company.id);
      this.data.companies = this.companies.filter((item) => item.id !== company.id);
      if (this.selectedCompanyId === company.id) {
        const remaining = this.companies[0];
        if (remaining) {
          this.selectedCompanyId = remaining.id;
          this.loadCompanyIntoForm(remaining, 'edit');
        } else {
          this.selectedCompanyId = null;
          this.startCreateCompany();
        }
      }
      this.companyMessage = `Empresa ${company.tradeName} eliminada correctamente.`;
    } catch (error) {
      this.companyMessage = this.formatSupabaseError(error, 'No se pudo eliminar la empresa.');
    }
  }

  toggleSelectedCompanyStatus(): void {
    const selectedCompany = this.selectedCompany;
    if (!selectedCompany) {
      this.companyMessage = 'No hay una empresa seleccionada para cambiar el estado.';
      return;
    }

    const nextStatus = selectedCompany.status === 'Activa' ? 'Inactiva' : 'Activa';
    this.companyForm.status = nextStatus;
    void this.saveCompany();
  }

  cancelCompanyEdit(): void {
    const selectedCompany = this.selectedCompany;
    if (!selectedCompany) {
      this.startCreateCompany();
      return;
    }

    if (this.companyEditorMode === 'create') {
      this.selectCompany(selectedCompany);
      return;
    }

    this.loadCompanyIntoForm(selectedCompany, 'edit');
    this.companyMessage = `Se restauraron los datos de ${selectedCompany.tradeName}.`;
  }

  async openBranchesModal(company: Company): Promise<void> {
    this.selectedCompanyId = company.id;
    this.isBranchModalOpen = true;
    this.editingBranchId = null;
    this.branchForm = this.createEmptyBranchForm();
    this.branchMessage = `Sucursales de ${company.tradeName}.`;
    await this.loadBranches(company.id);
  }

  closeBranchesModal(): void {
    if (this.isSavingBranch) return;
    this.isBranchModalOpen = false;
    this.editingBranchId = null;
    this.branchForm = this.createEmptyBranchForm();
  }

  get selectedCompanyBranches(): BranchRecord[] {
    const companyId = this.selectedCompanyId;
    return companyId ? this.companyBranches[companyId] ?? [] : [];
  }

  editBranch(branch: BranchRecord): void {
    this.editingBranchId = branch.id;
    this.branchForm = {
      name: branch.name,
      phone: branch.phone,
      city: branch.city,
      address: branch.address,
      status: branch.status
    };
    this.branchMessage = `Editando la sucursal ${branch.name}.`;
  }

  newBranch(): void {
    this.editingBranchId = null;
    this.branchForm = this.createEmptyBranchForm();
    this.branchMessage = 'Completa los datos para registrar una sucursal.';
  }

  async saveBranch(): Promise<void> {
    const company = this.selectedCompany;
    if (!company) return;
    if (!this.branchForm.name.trim()) {
      this.branchMessage = 'Indica el nombre de la sucursal antes de guardar.';
      return;
    }

    this.isSavingBranch = true;
    try {
      const savedBranch = this.editingBranchId
        ? await this.branchesService.updateBranch(this.editingBranchId, company.id, this.branchForm)
        : await this.branchesService.createBranch(company.id, this.branchForm);
      const current = this.companyBranches[company.id] ?? [];
      this.companyBranches[company.id] = this.editingBranchId
        ? current.map((branch) => branch.id === savedBranch.id ? savedBranch : branch)
        : [...current, savedBranch].sort((a, b) => a.name.localeCompare(b.name, 'es'));
      this.editingBranchId = null;
      this.branchForm = this.createEmptyBranchForm();
      this.branchMessage = `Sucursal ${savedBranch.name} guardada correctamente.`;
    } catch (error) {
      this.branchMessage = this.formatSupabaseError(error, 'No se pudo guardar la sucursal.');
    } finally {
      this.isSavingBranch = false;
    }
  }

  private loadCompanyIntoForm(company: Company, mode: CompanyEditorMode): void {
    this.companyEditorMode = mode;
    this.selectedCompanyId = company.id;
    this.companyForm = {
      tradeName: company.tradeName,
      legalName: company.legalName,
      rnc: company.rnc,
      email: company.email,
      phone: company.phone,
      city: company.city,
      website: company.website,
      address: company.address,
      category: company.category,
      status: company.status
    };
  }

  private createEmptyCompanyForm(): CompanyFormModel {
    return {
      tradeName: '',
      legalName: '',
      rnc: '',
      email: '',
      phone: '',
      city: '',
      website: '',
      address: '',
      category: 'Principal',
      status: 'Activa'
    };
  }

  private createEmptyBranchForm(): BranchFormModel {
    return { name: '', phone: '', city: '', address: '', status: 'Activa' };
  }

  private async loadBranches(companyId: number): Promise<void> {
    this.isLoadingBranches = true;
    try {
      this.companyBranches[companyId] = await this.branchesService.getBranches(companyId);
    } catch (error) {
      this.branchMessage = this.formatSupabaseError(error, 'No se pudieron cargar las sucursales.');
    } finally {
      this.isLoadingBranches = false;
    }
  }

  private async loadCompanies(): Promise<void> {
    this.isLoadingCompanies = true;
    try {
      this.data.companies = await this.companiesService.getCompanies();
      const firstCompany = this.companies[0];
      if (firstCompany) {
        this.selectedCompanyId = firstCompany.id;
        this.loadCompanyIntoForm(firstCompany, 'edit');
        this.companyMessage = 'Empresas cargadas desde Supabase.';
      } else {
        this.selectedCompanyId = null;
        this.startCreateCompany();
        this.companyMessage = 'No hay empresas registradas. Puedes crear la primera.';
      }
    } catch (error) {
      this.companyMessage = this.formatSupabaseError(error, 'No se pudieron cargar las empresas desde Supabase.');
    } finally {
      this.isLoadingCompanies = false;
    }
  }

  private formatTimestamp(): string {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }

  private formatSupabaseError(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return `${fallback} ${(error as { message?: string }).message ?? ''}`.trim();
    }
    return fallback;
  }
}
