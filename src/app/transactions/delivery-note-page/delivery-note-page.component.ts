import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import {
  DeliveryNoteOrigin, DeliveryNoteRow, DeliveryNotesService, DeliverySourceDocument, DeliverySourceLine
} from '../../core/services/delivery-notes/delivery-notes.service';
import { DeliveryNotePrintService } from '../../core/services/printing/delivery-note-print.service';

import { PermissionsService } from '../../core/services/permissions/permissions.service';
interface DispatchLine extends DeliverySourceLine {
  aDespachar: number;
}

@Component({
  selector: 'app-delivery-note-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './delivery-note-page.component.html',
  styleUrls: ['./delivery-note-page.component.scss']
})
export class DeliveryNotePageComponent implements OnInit {
  /** Accesos del usuario (Configuración › Usuarios › Accesos). */
  private readonly perms = inject(PermissionsService);
  tab: 'create' | 'consult' = 'create';

  // Nuevo conduce
  origin: DeliveryNoteOrigin = 'Orden de venta';
  documentNumber = '';
  document: DeliverySourceDocument | null = null;
  lines: DispatchLine[] = [];
  date = this.today();
  address = '';
  driver = '';
  vehicle = '';
  notes = '';
  isSearching = false;
  isSaving = false;
  formError = '';

  // Consulta
  notesList: DeliveryNoteRow[] = [];
  search = '';
  statusFilter = '';
  from = this.firstOfMonth();
  to = this.today();
  isLoading = false;
  listError = '';

  constructor(
    private readonly deliveryNotes: DeliveryNotesService,
    private readonly printer: DeliveryNotePrintService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const orderId = Number(params.get('orden'));
      const invoiceId = Number(params.get('factura'));
      if (orderId) void this.loadDocument('Orden de venta', orderId);
      else if (invoiceId) void this.loadDocument('Factura', invoiceId);
    });
  }

  get filteredNotes(): DeliveryNoteRow[] {
    const query = this.search.trim().toLocaleLowerCase();
    return this.notesList.filter((note) =>
      (!this.statusFilter || note.estado === this.statusFilter)
      && (!query || [note.numero, note.numero_origen, note.cliente_nombre, note.cliente_rnc, note.chofer]
        .some((value) => String(value ?? '').toLocaleLowerCase().includes(query))));
  }

  get totalToDispatch(): number {
    return this.lines.reduce((sum, line) => sum + (Number(line.aDespachar) || 0), 0);
  }

  get hasPending(): boolean {
    return this.lines.some((line) => line.pendiente > 0);
  }

  showCreate(): void {
    this.tab = 'create';
  }

  showConsult(): void {
    this.tab = 'consult';
    void this.loadList();
  }

  async searchDocument(): Promise<void> {
    const number = this.documentNumber.trim();
    if (!number) { this.formError = `Escriba el número de la ${this.origin === 'Factura' ? 'factura' : 'orden de venta'}.`; return; }
    await this.loadDocument(this.origin, null, number);
  }

  private async loadDocument(origin: DeliveryNoteOrigin, id: number | null, number: string | null = null): Promise<void> {
    this.tab = 'create';
    this.origin = origin;
    this.formError = '';
    this.isSearching = true;
    try {
      const doc = await this.deliveryNotes.getSourceDocument(origin, id, number);
      this.document = doc;
      this.documentNumber = doc.numero;
      this.address = doc.direccion || '';
      this.lines = doc.lineas.map((line) => ({ ...line, aDespachar: line.pendiente }));
      if (!this.hasPending) this.formError = 'Este documento ya fue despachado completo.';
    } catch (error) {
      this.document = null;
      this.lines = [];
      this.formError = this.message(error);
    } finally {
      this.isSearching = false;
    }
  }

  dispatchAll(): void {
    this.lines.forEach((line) => { line.aDespachar = line.pendiente; });
  }

  dispatchNone(): void {
    this.lines.forEach((line) => { line.aDespachar = 0; });
  }

  fixQuantity(line: DispatchLine): void {
    const value = Math.round((Number(line.aDespachar) || 0) * 100) / 100;
    line.aDespachar = Math.min(Math.max(value, 0), line.pendiente);
  }

  clearForm(): void {
    this.document = null;
    this.lines = [];
    this.documentNumber = '';
    this.address = '';
    this.driver = '';
    this.vehicle = '';
    this.notes = '';
    this.date = this.today();
    this.formError = '';
    if (this.route.snapshot.queryParamMap.keys.length) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    }
  }

  async save(): Promise<void> {
    if (!this.perms.ensure('conduces.crear')) return;
    if (!this.document || this.isSaving) return;
    this.lines.forEach((line) => this.fixQuantity(line));
    if (this.totalToDispatch <= 0) { this.formError = 'Indique la cantidad a despachar de al menos un producto.'; return; }
    this.isSaving = true;
    this.formError = '';
    try {
      const saved = await this.deliveryNotes.create({
        origen: this.document.origen,
        documentoId: this.document.id,
        fecha: this.date,
        direccion: this.address,
        chofer: this.driver,
        vehiculo: this.vehicle,
        notas: this.notes,
        lineas: this.lines.filter((line) => line.aDespachar > 0).map((line) => ({ lineaId: line.lineaId, cantidad: line.aDespachar }))
      });
      const answer = await Swal.fire({
        icon: 'success',
        title: `Conduce ${saved.numero} creado`,
        text: '¿Desea imprimirlo ahora?',
        showCancelButton: true,
        confirmButtonText: 'Imprimir',
        cancelButtonText: 'Ahora no'
      });
      if (answer.isConfirmed) await this.printNote(saved.id);
      this.clearForm();
    } catch (error) {
      this.formError = this.message(error);
    } finally {
      this.isSaving = false;
    }
  }

  async loadList(): Promise<void> {
    this.isLoading = true;
    this.listError = '';
    try {
      this.notesList = await this.deliveryNotes.list(this.from || null, this.to || null);
    } catch (error) {
      this.listError = this.message(error);
    } finally {
      this.isLoading = false;
    }
  }

  async printNote(id: number): Promise<void> {
    try {
      await this.printer.print(id);
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo imprimir', text: this.message(error) });
    }
  }

  async markDelivered(note: DeliveryNoteRow): Promise<void> {
    if (!this.perms.ensure('conduces.entregar')) return;
    const result = await Swal.fire({
      title: `Entregar conduce ${note.numero}`,
      input: 'text',
      inputLabel: 'Recibido por (opcional)',
      showCancelButton: true,
      confirmButtonText: 'Marcar entregado',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;
    try {
      await this.deliveryNotes.markDelivered(note.id, String(result.value ?? ''));
      await this.loadList();
      void Swal.fire({ icon: 'success', title: 'Conduce entregado', timer: 1300, showConfirmButton: false, toast: true, position: 'top-end' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo actualizar', text: this.message(error) });
    }
  }

  async cancelNote(note: DeliveryNoteRow): Promise<void> {
    if (!this.perms.ensure('conduces.anular')) return;
    const result = await Swal.fire({
      title: `Anular conduce ${note.numero}`,
      text: 'Lo despachado vuelve a quedar pendiente en el documento de origen.',
      input: 'text',
      inputLabel: 'Motivo',
      inputValidator: (value) => (value?.trim() ? null : 'Indique el motivo.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Anular',
      confirmButtonColor: '#d92d20',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;
    try {
      await this.deliveryNotes.cancel(note.id, String(result.value));
      await this.loadList();
      void Swal.fire({ icon: 'success', title: 'Conduce anulado', timer: 1300, showConfirmButton: false, toast: true, position: 'top-end' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo anular', text: this.message(error) });
    }
  }

  formatDate(value: string | null): string {
    return value ? new Intl.DateTimeFormat('es-DO').format(new Date(`${value.slice(0, 10)}T12:00:00`)) : '—';
  }

  qty(value: number): string {
    return Number(value ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  statusClass(status: string): string {
    return status === 'Entregado' ? 'is-done' : status === 'Anulado' ? 'is-void' : 'is-open';
  }

  private message(error: unknown): string {
    return String((error as { message?: string })?.message ?? error);
  }

  private today(): string {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  private firstOfMonth(): string {
    return `${this.today().slice(0, 8)}01`;
  }
}
