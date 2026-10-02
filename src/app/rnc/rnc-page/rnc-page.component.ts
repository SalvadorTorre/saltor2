import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { RncRecord, RncFormModel } from '../../app.models';
import { RncService } from '../../core/services/rnc/rnc.service';

@Component({
  selector: 'app-rnc-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rnc-page.component.html',
  styleUrls: ['./rnc-page.component.scss']
})
export class RncPageComponent implements OnInit {
  activeView = 'rnc';
  rncSearch = '';
  rncMessage = 'Consulta, registra y da seguimiento a RNC sincronizados con tu base local.';
  rncEditorMode: 'create' | 'edit' = 'create';
  isLoadingRnc = false;
  isSavingRnc = false;
  selectedRncRecordId: number | null = null;

  constructor(public data: AppDataService, private readonly rncService: RncService) {}

  ngOnInit(): void {
    void this.loadRncRecords();
  }

  get rncRecords(): RncRecord[] {
    return this.data.rncRecords;
  }

  get selectedRncRecord(): RncRecord | null {
    return this.data.rncRecords.find((record) => record.id === this.selectedRncRecordId) ?? this.data.rncRecords[0] ?? null;
  }

  rncForm: RncFormModel = {
    rnc: '',
    legalName: '',
    tradeName: '',
    category: 'Contribuyente Normal',
    address: '',
    phone: '',
    email: '',
    dgiiStatus: 'Activo'
  };

  get filteredRncRecords(): RncRecord[] {
    const term = this.rncSearch.trim().toLowerCase();
    if (!term) {
      return this.rncRecords;
    }

    return this.rncRecords.filter((record) =>
      [record.rnc, record.legalName, record.tradeName].some((value) => value.toLowerCase().includes(term))
    );
  }

  get activeRncCount(): number {
    return this.rncRecords.filter((record) => record.dgiiStatus === 'Activo').length;
  }

  get pendingSyncRncCount(): number {
    return this.rncRecords.filter((record) => record.syncStatus === 'Pendiente').length;
  }

  get syncErrorRncCount(): number {
    return this.rncRecords.filter((record) => record.syncStatus === 'Error').length;
  }

  isSelectedRncRecord(record: RncRecord): boolean {
    return this.selectedRncRecord?.id === record.id && this.rncEditorMode === 'edit';
  }

  startCreateRncRecord(): void {
    this.rncEditorMode = 'create';
    this.rncForm = {
      rnc: '',
      legalName: '',
      tradeName: '',
      category: 'Contribuyente Normal',
      address: '',
      phone: '',
      email: '',
      dgiiStatus: 'Activo'
    };
    this.rncMessage = 'Completa los datos para registrar un nuevo RNC en tu base local.';
  }

  selectRncRecord(record: RncRecord): void {
    this.selectedRncRecordId = record.id;
    this.loadRncIntoForm(record, 'edit');
    this.rncMessage = `Editando el RNC ${record.rnc} de ${record.tradeName}.`;
  }

  async saveRncRecord(): Promise<void> {
    if (!this.rncForm.rnc.trim() || !this.rncForm.legalName.trim() || !this.rncForm.tradeName.trim()) {
      this.rncMessage = 'Completa RNC, razon social y nombre comercial antes de guardar.';
      return;
    }

    this.isSavingRnc = true;
    try {
      if (this.rncEditorMode === 'create') {
        const newRecord = await this.rncService.createRecord(this.rncForm, 'Pendiente', this.formatTimestamp());
        this.data.rncRecords = [newRecord, ...this.data.rncRecords.filter((record) => record.id !== newRecord.id)];
        this.selectedRncRecordId = newRecord.id;
        this.loadRncIntoForm(newRecord, 'edit');
        this.rncMessage = `RNC ${newRecord.rnc} registrado correctamente y marcado para sincronizacion.`;
        return;
      }

      const recordId = this.selectedRncRecordId ?? this.selectedRncRecord?.id;
      const currentSyncStatus = this.selectedRncRecord?.syncStatus ?? 'Pendiente';
      if (!recordId) {
        this.rncMessage = 'Selecciona un RNC antes de actualizar.';
        return;
      }

      const updated = await this.rncService.updateRecord(recordId, this.rncForm, currentSyncStatus, this.formatTimestamp());
      this.data.rncRecords = this.data.rncRecords.map((record) => record.id === updated.id ? updated : record);
      this.selectedRncRecordId = updated.id;
      this.loadRncIntoForm(updated, 'edit');
      this.rncMessage = `RNC ${updated.rnc} actualizado correctamente.`;
    } catch (error) {
      this.rncMessage = this.formatSupabaseError(error, 'No se pudo guardar el RNC.');
    } finally {
      this.isSavingRnc = false;
    }
  }

  async checkRnc(record: RncRecord | null): Promise<void> {
    const rnc = record?.rnc || this.rncForm.rnc;
    if (!rnc.trim()) {
      this.rncMessage = 'Indica un RNC antes de consultar.';
      return;
    }

    if (record) this.selectRncRecord(record);
    this.rncMessage = `Consultando RNC ${rnc} en Megaplus...`;
    try {
      const result = await this.rncService.lookup(rnc);
      this.rncForm = {
        rnc: result.rnc,
        legalName: result.legalName,
        tradeName: result.tradeName,
        category: result.category,
        address: result.address,
        phone: result.phone,
        email: result.email,
        dgiiStatus: result.dgiiStatus
      };
      this.rncMessage = `RNC ${result.rnc} consultado correctamente en Megaplus. Revisa los datos y guarda para actualizar tu catálogo.`;
    } catch (error) {
      this.rncMessage = this.formatSupabaseError(error, 'No se pudo consultar el RNC en Megaplus.');
    }
  }

  async syncRnc(record: RncRecord | null): Promise<void> {
    if (!record) {
      this.rncMessage = 'No hay un RNC seleccionado para sincronizar.';
      return;
    }

    try {
      const updated = await this.rncService.markSync(record.id, 'Pendiente', this.formatTimestamp());
      this.data.rncRecords = this.data.rncRecords.map((item) => item.id === updated.id ? updated : item);
      this.selectedRncRecordId = updated.id;
      this.loadRncIntoForm(updated, 'edit');
      this.rncMessage = `RNC ${updated.rnc} marcado para actualizacion desde DGII.`;
    } catch (error) {
      this.rncMessage = this.formatSupabaseError(error, 'No se pudo marcar el RNC para sincronizacion.');
    }
  }

  private loadRncIntoForm(record: RncRecord, mode: 'create' | 'edit'): void {
    this.rncEditorMode = mode;
    this.selectedRncRecordId = record.id;
    this.rncForm = {
      rnc: record.rnc,
      legalName: record.legalName,
      tradeName: record.tradeName,
      category: record.category,
      address: record.address,
      phone: record.phone,
      email: record.email,
      dgiiStatus: record.dgiiStatus
    };
  }

  private async loadRncRecords(): Promise<void> {
    this.isLoadingRnc = true;
    try {
      this.data.rncRecords = await this.rncService.getRecords();
      const firstRecord = this.data.rncRecords[0];
      if (firstRecord) {
        this.selectedRncRecordId = firstRecord.id;
        this.loadRncIntoForm(firstRecord, 'edit');
        this.rncMessage = 'RNC cargados desde Supabase.';
      } else {
        this.selectedRncRecordId = null;
        this.startCreateRncRecord();
        this.rncMessage = 'No hay RNC registrados. Puedes crear el primero.';
      }
    } catch (error) {
      this.rncMessage = this.formatSupabaseError(error, 'No se pudieron cargar los RNC desde Supabase.');
    } finally {
      this.isLoadingRnc = false;
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
