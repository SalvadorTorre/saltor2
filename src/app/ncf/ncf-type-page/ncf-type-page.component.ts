import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { NcfType, NcfTypeFormModel } from '../../app.models';
import { NcfTypesService } from '../../core/services/ncf-types/ncf-types.service';

@Component({
  selector: 'app-ncf-type-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ncf-type-page.component.html',
  styleUrls: ['./ncf-type-page.component.scss']
})
export class NcfTypePageComponent implements OnInit {
  activeView = 'ncf_type';
  searchTerm = '';
  message = 'Consulta, crea y edita los tipos de comprobantes fiscales (e-NCF) del sistema.';
  editorMode: 'create' | 'edit' = 'create';
  selectedId: number | null = null;
  isLoading = false;
  isSaving = false;

  constructor(public data: AppDataService, private readonly ncfTypesService: NcfTypesService) {}

  ngOnInit(): void {
    void this.loadTypes();
  }

  get ncfTypes(): NcfType[] {
    return this.data.ncfTypeList;
  }

  form: NcfTypeFormModel = {
    code: '',
    type: 1,
    series: '',
    name: '',
    description: '',
    taxRate: 18,
    isElectronic: true,
    status: 'Activa'
  };

  get filteredTypes(): NcfType[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      return this.ncfTypes;
    }
    return this.ncfTypes.filter((t) =>
      [t.code, t.series, t.name, t.description ?? ''].some((v) => v.toLowerCase().includes(term))
    );
  }

  get activeCount(): number {
    return this.ncfTypes.filter((t) => t.status === 'Activa').length;
  }

  get avgTaxRate(): string {
    if (!this.ncfTypes.length) {
      return '0';
    }
    const total = this.ncfTypes.reduce((sum, t) => sum + t.taxRate, 0);
    return (total / this.ncfTypes.length).toFixed(1);
  }

  get selectedRecord(): NcfType | null {
    return this.ncfTypes.find((t) => t.id === this.selectedId) ?? null;
  }

  isSelected(record: NcfType): boolean {
    return this.selectedId === record.id && this.editorMode === 'edit';
  }

  startCreate(): void {
    this.editorMode = 'create';
    this.selectedId = null;
    this.form = {
      code: '',
      type: 1,
      series: '',
      name: '',
      description: '',
      taxRate: 18,
      isElectronic: true,
      status: 'Activa'
    };
    this.message = 'Completa los datos para registrar un nuevo tipo de e-CF en el catalogo.';
  }

  loadForEdit(record: NcfType): void {
    this.editorMode = 'edit';
    this.selectedId = record.id;
    this.form = {
      code: record.code,
      type: record.type ?? 1,
      series: record.series,
      name: record.name,
      description: record.description ?? '',
      taxRate: record.taxRate,
      isElectronic: record.isElectronic,
      status: record.status
    };
    this.message = `Editando el tipo e-CF ${record.code} - ${record.name}.`;
  }

  async save(): Promise<void> {
    if (!this.form.code.trim() || !this.form.series.trim() || !this.form.name.trim()) {
      this.message = 'Completa el codigo, la serie e-CF y el nombre antes de guardar.';
      return;
    }

    this.isSaving = true;
    if (this.editorMode === 'create') {
      const duplicate = this.ncfTypes.find(
        (t) => t.code.toLowerCase() === this.form.code.trim().toLowerCase()
      );
      if (duplicate) {
        this.message = `Ya existe un tipo de NCF con el codigo ${duplicate.code}.`;
        this.isSaving = false;
        return;
      }

      try {
        const newRecord = await this.ncfTypesService.createType(this.form, this.formatDate());
        this.data.ncfTypeList = [newRecord, ...this.data.ncfTypeList.filter((t) => t.id !== newRecord.id)];
        this.selectedId = newRecord.id;
        this.loadForEdit(newRecord);
        this.message = `Tipo e-CF ${newRecord.code} - ${newRecord.name} creado correctamente.`;
      } catch (error) {
        this.message = this.formatSupabaseError(error, 'No se pudo guardar el tipo e-CF.');
      } finally {
        this.isSaving = false;
      }
      return;
    }

    const recordId = this.selectedId;
    if (!recordId) {
      this.message = 'Selecciona un tipo de NCF antes de actualizar.';
      this.isSaving = false;
      return;
    }

    const duplicate = this.ncfTypes.find(
      (t) => t.id !== recordId && t.code.toLowerCase() === this.form.code.trim().toLowerCase()
    );
    if (duplicate) {
      this.message = `Ya existe otro tipo de NCF con el codigo ${duplicate.code}.`;
      this.isSaving = false;
      return;
    }

    try {
      const updatedRecord = await this.ncfTypesService.updateType(recordId, this.form, this.selectedRecord?.createdAt ?? this.formatDate());
      this.data.ncfTypeList = this.data.ncfTypeList.map((t) => t.id === updatedRecord.id ? updatedRecord : t);
      this.selectedId = updatedRecord.id;
      this.loadForEdit(updatedRecord);
      this.message = `Tipo e-CF ${this.form.code} actualizado correctamente.`;
    } catch (error) {
      this.message = this.formatSupabaseError(error, 'No se pudo actualizar el tipo e-CF.');
    } finally {
      this.isSaving = false;
    }
  }

  async deleteRecord(record: NcfType): Promise<void> {
    const confirmed = window.confirm(
      `Deseas eliminar el tipo de NCF "${record.code} - ${record.name}"?`
    );
    if (!confirmed) {
      return;
    }
    try {
      await this.ncfTypesService.deleteType(record.id);
      this.data.ncfTypeList = this.data.ncfTypeList.filter((t) => t.id !== record.id);
      if (this.selectedId === record.id) {
        this.startCreate();
      }
      this.message = `Tipo e-CF ${record.code} eliminado correctamente.`;
    } catch (error) {
      this.message = this.formatSupabaseError(error, 'No se pudo eliminar el tipo e-CF.');
    }
  }

  private async loadTypes(): Promise<void> {
    this.isLoading = true;
    try {
      this.data.ncfTypeList = await this.ncfTypesService.getTypes();
      const firstType = this.data.ncfTypeList[0];
      if (firstType) {
        this.selectedId = firstType.id;
        this.loadForEdit(firstType);
        this.message = 'Tipos e-CF cargados desde Supabase.';
      } else {
        this.startCreate();
        this.message = 'No hay tipos e-CF registrados. Puedes crear el primero.';
      }
    } catch (error) {
      this.message = this.formatSupabaseError(error, 'No se pudieron cargar los tipos e-CF desde Supabase.');
    } finally {
      this.isLoading = false;
    }
  }

  private formatDate(): string {
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
}
