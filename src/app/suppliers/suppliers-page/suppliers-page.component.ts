import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupplierRecord, SupplierFormModel, NavigationItem } from '../../app.models';
import { AppDataService } from '../../app-data.service';
import { SuppliersService } from '../../core/services/suppliers/suppliers.service';

@Component({
  selector: 'app-suppliers-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './suppliers-page.component.html',
  styleUrls: ['./suppliers-page.component.scss']
})
export class SuppliersPageComponent implements OnInit {
  readonly maintenanceLinks: NavigationItem[] = [
    { label: 'Productos', icon: 'box' },
    { label: 'Clientes', icon: 'users' },
    { label: 'Suplidores', icon: 'truck' }
  ];
  activeMaintenanceLabel = 'Suplidores';

  supplierEditorMode: 'create' | 'edit' = 'create';
  supplierMessage = 'Gestiona suplidores, contactos, balances y condiciones de compra desde una sola pantalla.';
  supplierSearch = '';
  supplierCategoryFilter = 'all';
  supplierStatusFilter = 'all';
  openSupplierOptionsId: number | null = null;
  isSupplierEditorOpen = false;
  isLoadingSuppliers = false;
  isSavingSupplier = false;
  selectedSupplierId: number | null = null;
  suppliers: SupplierRecord[] = [];
  supplierForm: SupplierFormModel = {
    code: '',
    companyName: '',
    contactName: '',
    documentType: 'RNC',
    documentNumber: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    category: 'Local',
    paymentTerms: '',
    balance: 0,
    status: 'Activo'
  };

  constructor(public data: AppDataService, private readonly suppliersService: SuppliersService) {}

  ngOnInit(): void {
    void this.loadSuppliers();
  }

  get selectedSupplier(): SupplierRecord | null {
    return this.suppliers.find((supplier) => supplier.id === this.selectedSupplierId) ?? this.suppliers[0] ?? null;
  }

  get filteredSuppliers(): SupplierRecord[] {
    return this.suppliers.filter((supplier) => {
      const matchesSearch = !this.supplierSearch.trim()
        || [supplier.code, supplier.companyName, supplier.contactName, supplier.documentNumber]
          .some((value) => value.toLowerCase().includes(this.supplierSearch.trim().toLowerCase()));
      const matchesCategory = this.supplierCategoryFilter === 'all' || supplier.category === this.supplierCategoryFilter;
      const matchesStatus = this.supplierStatusFilter === 'all' || supplier.status === this.supplierStatusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }

  get totalSuppliersCount(): number {
    return this.suppliers.length;
  }

  get activeSuppliersCount(): number {
    return this.suppliers.filter((supplier) => supplier.status === 'Activo').length;
  }

  get suppliersWithBalanceCount(): number {
    return this.suppliers.filter((supplier) => supplier.balance > 0).length;
  }

  get importerSuppliersCount(): number {
    return this.suppliers.filter((supplier) => supplier.category === 'Importador').length;
  }

  selectMaintenanceItem(item: NavigationItem): void {
    this.activeMaintenanceLabel = item.label;
  }

  selectSupplier(supplier: SupplierRecord): void {
    this.openSupplierOptionsId = null;
    this.selectedSupplierId = supplier.id;
    this.supplierMessage = `Suplidor seleccionado: ${supplier.companyName}.`;
  }

  isSelectedSupplier(supplier: SupplierRecord): boolean {
    return this.selectedSupplier?.id === supplier.id;
  }

  toggleSupplierOptions(supplierId: number, event: Event): void {
    event.stopPropagation();
    this.openSupplierOptionsId = this.openSupplierOptionsId === supplierId ? null : supplierId;
  }

  editSupplier(supplier: SupplierRecord, event?: Event): void {
    event?.stopPropagation();
    this.openSupplierOptionsId = null;
    this.selectedSupplierId = supplier.id;
    this.loadSupplierIntoForm(supplier, 'edit');
    this.supplierMessage = `Editando el suplidor ${supplier.companyName}.`;
    this.isSupplierEditorOpen = true;
  }

  closeSupplierOptions(): void {
    this.openSupplierOptionsId = null;
  }

  startCreateSupplier(): void {
    this.openSupplierOptionsId = null;
    this.supplierEditorMode = 'create';
    this.supplierForm = {
      code: '',
      companyName: '',
      contactName: '',
      documentType: 'RNC',
      documentNumber: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      category: 'Local',
      paymentTerms: '',
      balance: 0,
      status: 'Activo'
    };
    this.supplierMessage = 'Completa los datos para registrar un nuevo suplidor.';
    this.isSupplierEditorOpen = true;
  }

  closeSupplierEditor(): void {
    this.isSupplierEditorOpen = false;
  }

  async saveSupplier(): Promise<void> {
    if (!this.supplierForm.code.trim() || !this.supplierForm.companyName.trim() || !this.supplierForm.documentNumber.trim()) {
      this.supplierMessage = 'Completa codigo, nombre comercial y documento antes de guardar.';
      return;
    }

    this.isSavingSupplier = true;
    try {
      if (this.supplierEditorMode === 'create') {
        const newSupplier = await this.suppliersService.createSupplier(this.supplierForm, this.formatDateOnly());
        this.suppliers = [newSupplier, ...this.suppliers.filter((supplier) => supplier.id !== newSupplier.id)];
        this.selectedSupplierId = newSupplier.id;
        this.loadSupplierIntoForm(newSupplier, 'edit');
        this.supplierMessage = `Suplidor ${newSupplier.companyName} registrado correctamente.`;
        this.isSupplierEditorOpen = false;
        return;
      }

      const supplierId = this.selectedSupplierId ?? this.selectedSupplier?.id;
      if (!supplierId) {
        this.supplierMessage = 'Selecciona un suplidor antes de actualizar.';
        return;
      }

      const updated = await this.suppliersService.updateSupplier(supplierId, this.supplierForm);
      this.suppliers = this.suppliers.map((supplier) => supplier.id === updated.id ? updated : supplier);
      this.selectedSupplierId = updated.id;
      this.loadSupplierIntoForm(updated, 'edit');
      this.supplierMessage = `Suplidor ${updated.companyName} actualizado correctamente.`;
      this.isSupplierEditorOpen = false;
    } catch (error) {
      this.supplierMessage = this.formatSupabaseError(error, 'No se pudo guardar el suplidor.');
    } finally {
      this.isSavingSupplier = false;
    }
  }

  async deleteSupplier(supplier: SupplierRecord): Promise<void> {
    try {
      await this.suppliersService.deleteSupplier(supplier.id);
      this.suppliers = this.suppliers.filter((item) => item.id !== supplier.id);
      this.openSupplierOptionsId = null;
      const remaining = this.suppliers[0];
      if (remaining) {
        this.selectedSupplierId = remaining.id;
        this.loadSupplierIntoForm(remaining, 'edit');
      } else {
        this.selectedSupplierId = null;
        this.startCreateSupplier();
      }
      this.supplierMessage = `Suplidor ${supplier.companyName} eliminado correctamente.`;
    } catch (error) {
      this.supplierMessage = this.formatSupabaseError(error, 'No se pudo eliminar el suplidor.');
    }
  }

  private loadSupplierIntoForm(supplier: SupplierRecord, mode: 'create' | 'edit'): void {
    this.supplierEditorMode = mode;
    this.selectedSupplierId = supplier.id;
    this.supplierForm = {
      code: supplier.code,
      companyName: supplier.companyName,
      contactName: supplier.contactName,
      documentType: supplier.documentType,
      documentNumber: supplier.documentNumber,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      city: supplier.city,
      category: supplier.category,
      paymentTerms: supplier.paymentTerms,
      balance: supplier.balance,
      status: supplier.status
    };
  }

  private formatDateOnly(): string {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }

  private async loadSuppliers(): Promise<void> {
    this.isLoadingSuppliers = true;
    try {
      this.suppliers = await this.suppliersService.getSuppliers();
      const firstSupplier = this.suppliers[0];
      if (firstSupplier) {
        this.selectedSupplierId = firstSupplier.id;
        this.loadSupplierIntoForm(firstSupplier, 'edit');
        this.supplierMessage = 'Suplidores cargados desde Supabase.';
      } else {
        this.selectedSupplierId = null;
        this.startCreateSupplier();
        this.supplierMessage = 'No hay suplidores registrados. Puedes crear el primero.';
      }
    } catch (error) {
      this.supplierMessage = this.formatSupabaseError(error, 'No se pudieron cargar los suplidores desde Supabase.');
    } finally {
      this.isLoadingSuppliers = false;
    }
  }

  private formatSupabaseError(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return `${fallback} ${(error as { message?: string }).message ?? ''}`.trim();
    }
    return fallback;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeSupplierOptions();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeSupplierOptions();
    this.isSupplierEditorOpen = false;
  }
}
