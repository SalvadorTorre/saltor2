import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { NcfSequence, NcfSequenceFormModel } from '../../app.models';
import { NcfService, NcfSequenceHistory } from '../../core/services/ncf/ncf.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { ProformaService, ProformaSettings, ProformaMovement, PROFORMA_MAX } from '../../core/services/proforma/proforma.service';
import { sequenceDate, sequenceNumber, validDate } from './sequence-utils';

export interface SequenceGridRow extends NcfSequence { isDefault?: boolean; isProforma?: boolean; }
export const DEFAULT_SEQUENCE_END = '99999999999';

@Component({
  selector: 'app-ncf-page', standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ncf-page.component.html', styleUrls: ['./ncf-page.component.scss']
})
export class NcfPageComponent implements OnInit {
  sequences: NcfSequence[] = [];
  search = '';
  typeFilter = 'all';
  isLoading = true;
  isSaving = false;
  loadError = '';
  message = '';
  messageIsError = false;
  editorVisible = false;
  editing: NcfSequence | null = null;
  form = this.emptyForm();
  historyFor: SequenceGridRow | null = null;
  history: NcfSequenceHistory[] = [];
  proforma: ProformaSettings | null = null;
  proformaError = '';
  editingProforma = false;
  proformaCurrent = 0;
  proformaHistory: ProformaMovement[] = [];
  readonly proformaMax = PROFORMA_MAX;
  isLoadingHistory = false;
  historyError = '';

  constructor(public data: AppDataService, private readonly ncf: NcfService,
    private readonly auth: AuthService, private readonly proformas: ProformaService) {}

  @ViewChild('editorTitle') set editorTitle(element: ElementRef<HTMLElement> | undefined) {
    this.focusSection(element);
  }

  @ViewChild('historyTitle') set historyTitle(element: ElementRef<HTMLElement> | undefined) {
    this.focusSection(element);
  }

  private focusSection(element: ElementRef<HTMLElement> | undefined): void {
    if (!element) return;
    element.nativeElement.focus({ preventScroll: true });
    element.nativeElement.scrollIntoView({ block: 'start' });
  }

  ngOnInit(): void { void this.load(); }

  get companyId(): number | null { return this.auth.currentUser?.companyId ?? null; }

  get tenantSequences(): NcfSequence[] { return this.sequences.filter(s => s.companyId === this.companyId && s.series.toUpperCase() !== 'E332' && !this.isProformaType(s.ncfType)); }

  get summary(): { configured: number; pending: number; available: number } {
    const rows = this.gridSequences;
    return { configured: rows.filter(s => !s.isDefault).length, pending: rows.filter(s => s.isDefault).length,
      available: rows.filter(s => !s.isDefault && this.status(s) === 'Activa').length };
  }

  displayDate(value: string): string {
    const date = sequenceDate(value);
    return date ? date.split('-').reverse().join('/') : value || 'Sin registrar';
  }

  typeName(type: string): string { return type.replace(/^\d+\s*-?\s*/, ''); }

  private isProformaType(type: string): boolean { return /^(?:E)?332(?:\D|$)/i.test(type.trim()); }

  get fiscalTypes(): string[] {
    return [...new Set([...this.data.ncfTypes, ...this.tenantSequences.map(s => s.ncfType)])]
      .filter(type => !this.isProformaType(type));
  }

  get types(): string[] {
    return this.proforma?.enabled && this.proforma.companyId === this.companyId
      ? ['332 - Factura proforma', ...this.fiscalTypes] : this.fiscalTypes;
  }

  get gridSequences(): SequenceGridRow[] {
    const catalog = new Map<string, string>();
    for (const type of this.data.ncfTypes.filter(type => !this.isProformaType(type))) {
      const code = /^(\d+)/.exec(type)?.[1];
      if (code && !catalog.has(`E${code}`)) catalog.set(`E${code}`, type);
    }
    for (const sequence of this.tenantSequences) {
      const series = sequence.series.toUpperCase();
      if (!catalog.has(series)) catalog.set(series, sequence.ncfType);
    }
    const defaults: SequenceGridRow[] = [];
    const companyId = this.companyId;
    if (!companyId) return [];
    for (const [series, type] of catalog) {
        if (this.tenantSequences.some((s) => s.series.toUpperCase() === series)) continue;
        defaults.push({ id: -(defaults.length + 1), isDefault: true, companyId,
          ncfType: type, series, authorization: '', requested: 0, accepted: 0,
          rangeStart: '0', rangeEnd: DEFAULT_SEQUENCE_END, authorizedAt: '', expiresAt: '',
          used: 0, total: 0, status: 'Activa', alert: false, alertPercent: 80 });
    }
    const proforma: SequenceGridRow[] = this.proforma?.enabled && this.proforma.companyId === companyId ? [{
      id: -332, isProforma: true, companyId, ncfType: '332 - Factura proforma', series: 'E332',
      rangeStart: '0', rangeEnd: DEFAULT_SEQUENCE_END, used: this.proforma.current, total: 0,
      authorizedAt: '', expiresAt: '', status: 'Activa', alert: false, alertPercent: 80
    }] : [];
    return [...proforma, ...this.tenantSequences, ...defaults];
  }

  get filteredSequences(): SequenceGridRow[] {
    const term = this.search.trim().toLowerCase();
    return this.gridSequences.filter((s) => (this.typeFilter === 'all' || s.ncfType === this.typeFilter)
      && (!term || [s.series, s.ncfType, s.authorization ?? '', s.rangeStart, s.rangeEnd]
        .some((value) => value.toLowerCase().includes(term))));
  }

  get rangeCount(): number {
    const first = sequenceNumber(this.form.rangeStart, this.form.series);
    const last = sequenceNumber(this.form.rangeEnd, this.form.series);
    return first > 0 && last >= first ? last - first + 1 : 0;
  }

  private emptyForm(): NcfSequenceFormModel {
    return { companyId: null, ncfType: this.data.ncfTypes[0] ?? '31 - Factura de Credito Fiscal Electronica',
      series: 'E31', authorization: '', requested: null, accepted: 0, rangeStart: '0', rangeEnd: DEFAULT_SEQUENCE_END,
      authorizedAt: '', expiresAt: '', status: 'Activa', used: 0, alertPercent: 80 };
  }

  async load(): Promise<void> {
    if (this.isSaving) return;
    this.isLoading = true;
    this.loadError = '';
    try {
      await this.auth.restoreSession();
      const companyId = this.companyId;
      if (!companyId) throw new Error('Tu sesión no tiene una empresa activa. Vuelve a iniciar sesión.');
      this.proformaError = '';
      const [sequences, proforma] = await Promise.all([this.ncf.getSequences(companyId),
        this.proformas.getSettings(companyId).catch(error => {
          if (this.companyId === companyId) this.proformaError = this.errorText(error, 'No se pudo consultar la configuración de proforma.');
          return null;
        })]);
      if (this.companyId === companyId) {
        this.sequences = sequences.filter(s => s.companyId === companyId);
        this.proforma = proforma;
      }
    } catch (error) { this.loadError = this.errorText(error, 'No se pudieron cargar las secuencias.'); }
    finally { this.isLoading = false; }
  }

  newRequest(defaultRow?: SequenceGridRow): void {
    this.editingProforma = false;
    this.editing = null;
    this.form = { ...this.emptyForm(), companyId: this.companyId,
      ncfType: defaultRow?.ncfType ?? this.emptyForm().ncfType, series: defaultRow?.series ?? 'E31' };
    this.editorVisible = true;
    this.message = '';
  }

  edit(sequence: SequenceGridRow): void {
    if (sequence.companyId !== this.companyId) return;
    if (sequence.isProforma) {
      if (!this.proforma?.enabled) return;
      this.proformaCurrent = this.proforma.current;
      this.editingProforma = true;
      this.editorVisible = true;
      this.message = '';
      return;
    }
    this.editingProforma = false;
    if (sequence.isDefault) { this.newRequest(sequence); return; }
    this.editing = sequence;
    this.form = { ...sequence, authorization: sequence.authorization ?? '', requested: sequence.requested ?? null,
      accepted: sequence.accepted ?? sequence.total,
      authorizedAt: sequenceDate(sequence.authorizedAt), expiresAt: sequenceDate(sequence.expiresAt) };
    this.editorVisible = true;
    this.message = '';
  }

  cancel(): void { if (!this.isSaving) this.editorVisible = false; }

  changeType(): void {
    const code = /^(\d+)/.exec(this.form.ncfType)?.[1];
    if (code) this.form.series = `E${code}`;
  }

  formattedNumber(sequence: NcfSequence, number: number): string {
    return `${sequence.series}${String(number).padStart(10, '0')}`;
  }

  currentNumber(sequence: SequenceGridRow): string {
    if (sequence.isProforma) return String(sequence.used);
    if (sequence.isDefault) return '0';
    const first = sequenceNumber(sequence.rangeStart, sequence.series);
    return sequence.used > 0 && Number.isFinite(first)
      ? this.formattedNumber(sequence, first + sequence.used - 1) : 'Sin utilizar';
  }

  nextNumber(sequence: SequenceGridRow): string {
    if (sequence.isProforma) return sequence.used < PROFORMA_MAX ? this.formattedNumber(sequence, sequence.used + 1) : 'No disponible';
    const first = sequenceNumber(sequence.rangeStart, sequence.series);
    return this.status(sequence) === 'Activa' && sequence.used < sequence.total && Number.isFinite(first)
      ? this.formattedNumber(sequence, first + sequence.used) : 'No disponible';
  }

  status(sequence: SequenceGridRow): string {
    if (sequence.isDefault) return 'Pendiente de configurar';
    const expiry = sequenceDate(sequence.expiresAt);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (expiry && expiry < today) return 'Vencida';
    return sequence.used >= sequence.total && sequence.total > 0 ? 'Agotada' : sequence.status;
  }

  async save(): Promise<void> {
    if (this.isSaving) return;
    const companyId = this.companyId;
    if (!companyId || (this.editing && this.editing.companyId !== companyId)) {
      this.message = 'No hay una sesión válida para guardar esta solicitud.';
      this.messageIsError = true;
      return;
    }
    const f = { ...this.form, companyId };
    const count = this.rangeCount;
    let invalid = '';
    if (!f.companyId || !f.authorization?.trim()) invalid = 'Completa la referencia de autorización.';
    else if (f.series === 'E332' || this.isProformaType(f.ncfType)) invalid = 'E332 se configura desde su contador interno de proforma.';
    else if (!/^E\d{2,3}$/.test(f.series)) invalid = 'Revisa la serie del comprobante.';
    else if (!Number.isInteger(f.requested) || Number(f.requested) <= 0 || Number(f.requested) > 2147483647)
      invalid = 'Solicitados debe ser una cantidad entera positiva.';
    else if (!Number.isInteger(f.accepted) || Number(f.accepted) <= 0 || Number(f.accepted) > Number(f.requested))
      invalid = 'Aceptados debe ser mayor que cero y no superar los solicitados.';
    else if (!count || count !== Number(f.accepted)) invalid = 'La cantidad aceptada debe coincidir con el rango desde/hasta.';
    else if (!Number.isInteger(f.used) || f.used < 0 || f.used > count) invalid = 'Los utilizados deben estar entre cero y la cantidad aceptada.';
    else if (!validDate(f.authorizedAt) || !validDate(f.expiresAt) || f.expiresAt < f.authorizedAt)
      invalid = 'Revisa las fechas: el vencimiento no puede ser anterior a la autorización.';
    if (invalid) { this.message = invalid; this.messageIsError = true; return; }

    const normalized = { ...f, rangeStart: this.editing?.used ? this.editing.rangeStart : String(sequenceNumber(f.rangeStart, f.series)),
      rangeEnd: this.editing?.used ? this.editing.rangeEnd : String(sequenceNumber(f.rangeEnd, f.series)) };
    this.isSaving = true;
    this.message = '';
    try {
      const alert = f.used >= Math.max(1, Math.floor(count * f.alertPercent / 100));
      const saved = this.editing
        ? await this.ncf.updateSequence(this.editing.id, normalized, count, alert, this.editing.updatedAt)
        : await this.ncf.createSequence(normalized, count, alert);
      this.sequences = [saved, ...this.sequences.filter((s) => s.id !== saved.id)].sort((a, b) => b.id - a.id);
      this.editorVisible = false;
      this.messageIsError = false;
      this.message = this.editing ? 'Cambios guardados. La versión anterior se conserva en el historial.' : 'Solicitud registrada como una nueva secuencia.';
      if (this.historyFor?.id === saved.id) void this.showHistory(saved);
    } catch (error) { this.messageIsError = true; this.message = this.errorText(error, 'No se pudo guardar la solicitud.'); }
    finally { this.isSaving = false; }
  }

  async saveProforma(): Promise<void> {
    if (this.isSaving || !this.proforma?.enabled || this.proforma.companyId !== this.companyId) return;
    this.isSaving = true;
    this.message = '';
    try {
      const saved = await this.proformas.setCurrent(this.proforma, this.proformaCurrent);
      if (saved.companyId !== this.companyId) return;
      this.proforma = saved;
      this.editorVisible = false;
      this.messageIsError = false;
      this.message = 'Contador E332 actualizado. El cambio quedó registrado en el historial.';
      if (this.historyFor?.isProforma) void this.showHistory(this.gridSequences[0]);
    } catch (error) { this.messageIsError = true; this.message = this.errorText(error, 'No se pudo ajustar el contador proforma.'); }
    finally { this.isSaving = false; }
  }

  async showHistory(sequence: SequenceGridRow): Promise<void> {
    if (sequence.companyId !== this.companyId) return;
    this.historyFor = sequence;
    this.history = [];
    this.proformaHistory = [];
    this.historyError = '';
    this.isLoadingHistory = true;
    try {
      if (sequence.isProforma) {
        const history = await this.proformas.getHistory(sequence.companyId);
        if (this.historyFor?.isProforma) this.proformaHistory = history;
      } else {
        const history = await this.ncf.getSequenceHistory(sequence.id, sequence.companyId);
        if (this.historyFor?.id === sequence.id) this.history = history;
      }
    } catch (error) {
      if (this.historyFor?.id === sequence.id) this.historyError = this.errorText(error, 'No se pudo cargar el historial.');
    } finally { if (this.historyFor?.id === sequence.id) this.isLoadingHistory = false; }
  }

  private errorText(error: unknown, fallback: string): string {
    const detail = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    if (/empresas_proforma|configurar_proforma|ajustar_contador_proforma/i.test(detail))
      return `${fallback} Falta aplicar la migración de factura proforma E332.`;
    if (/autorizacion|solicitados|aceptados|ncf_secuencias_historial|schema cache/i.test(detail))
      return `${fallback} Falta aplicar la migración de solicitudes e historial de secuencias.`;
    return detail ? `${fallback} ${detail}` : fallback;
  }
}
