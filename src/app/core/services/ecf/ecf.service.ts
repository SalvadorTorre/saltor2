import { Subject } from 'rxjs';
import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { InvoiceRow } from '../invoices/invoices.service';

export type EcfDocumentKind = 'FACTURA' | 'NOTA_CREDITO' | 'GASTO_MENOR';
export interface EcfResult extends InvoiceRow {
  encf: string;
  dgii_codigo_seguridad?: string | null;
}
export interface EcfUpdate { kind: EcfDocumentKind; documentId: number; result: EcfResult; }
const QUEUED = ['PREPARANDO', 'ENVIANDO_SERVICIO', 'EN_COLA', 'ENVIANDO_DGII', 'EN_PROCESO_DGII'];

@Injectable({ providedIn: 'root' })
export class EcfService {
  private readonly updates = new Subject<EcfUpdate>();
  readonly updates$ = this.updates.asObservable();
  private readonly jobs = new Map<string, ReturnType<typeof setTimeout> | null>();
  private generation = 0;
  constructor(private readonly supabase: SupabaseService) {}

  stopTracking(): void {
    this.generation++;
    this.jobs.forEach(timer => { if (timer) clearTimeout(timer); });
    this.jobs.clear();
  }

  async resumePending(companyId: number, branchId: number): Promise<void> {
    const generation = this.generation;
    const { data, error } = await this.supabase.client.from('ecf_operaciones')
      .select('tipo,documento_id').eq('empresa_id', companyId).eq('sucursal_id', branchId)
      .eq('activa', true).in('status', QUEUED);
    if (error || generation !== this.generation) return;
    (data ?? []).forEach((row: { tipo: string; documento_id: number }) => this.track(row.tipo as EcfDocumentKind, Number(row.documento_id)));
  }

  private track(kind: EcfDocumentKind, documentId: number): void {
    const key = `${kind}:${documentId}`;
    if (this.jobs.has(key)) return;
    const generation = this.generation;
    const poll = async () => {
      if (generation !== this.generation) return;
      let pending = true;
      try {
        const { data, error } = await this.supabase.client.functions.invoke('consultar-operacion-ecf', { body: { kind, documentId } });
        if (generation !== this.generation) return;
        if (error) {
          const status = (error as { context?: { status?: number } }).context?.status;
          if (status === 401 || status === 403 || status === 404) pending = false;
        } else if (data && !data.error) {
          const result = data as EcfResult;
          pending = QUEUED.includes(result.ecf_queue_status ?? '');
          this.updates.next({ kind, documentId, result });
        }
      } catch { /* Una consulta fallida no cancela ni duplica la operación remota. */ }
      if (generation !== this.generation) return;
      if (pending) this.jobs.set(key, setTimeout(() => void poll(), 4000));
      else this.jobs.delete(key);
    };
    this.jobs.set(key, setTimeout(() => void poll(), 4000));
  }

  private receive(kind: EcfDocumentKind, documentId: number, result: EcfResult): EcfResult {
    if (QUEUED.includes(result.ecf_queue_status ?? '')) this.track(kind, documentId);
    this.updates.next({ kind, documentId, result });
    return result;
  }

  private async throwFunctionError(error: unknown): Promise<never> {
    const context = (error as { context?: unknown }).context as { json?: () => Promise<{ error?: string; message?: string }>; text?: () => Promise<string> } | undefined;
    let responseMessage = '';
    if (context?.json) {
      try {
        const body = await context.json();
        responseMessage = body.error || body.message || '';
      } catch { /* The Edge Function response may not contain JSON. */ }
    }
    if (responseMessage) throw new Error(responseMessage);
    if (context?.text) {
      try {
        const body = await context.text();
        if (body) throw new Error(body);
      } catch (responseError) {
        if (responseError instanceof Error && responseError.message !== 'Body is unusable') throw responseError;
      }
    }
    throw error instanceof Error ? error : new Error('No se pudo comunicar con el servicio e-CF.');
  }

  async sendInvoice(invoiceId: number): Promise<InvoiceRow> {
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) {
      throw new Error('No se recibió una factura válida para enviar a DGII.');
    }

    const generation = this.generation;
    const { data, error } = await this.supabase.client.functions.invoke('enviar-ecf', { body: { invoiceId } });
    if (error) await this.throwFunctionError(error);
    if (data?.error) throw new Error(data.error);
    if (!data || typeof data !== 'object') {
      throw new Error('El servicio e-CF no devolvió el resultado del envío.');
    }

    if (generation !== this.generation) throw new Error('La sesión cambió durante el envío.');
    const response = data as InvoiceRow;
    if (response.dgii_estado) return this.receive('FACTURA', invoiceId, response as EcfResult);

    // Algunos despliegues devuelven solo el mensaje. Recuperar el estado
    // persistido evita que la pantalla quede mostrando “No enviado”.
    const { data: persisted, error: persistedError } = await this.supabase.client
      .from('facturas')
      .select('id, numero_factura, ncf, dgii_estado, dgii_track_id, dgii_codigo_respuesta, dgii_mensaje_respuesta, dgii_enviado_en, impreso_en')
      .eq('id', invoiceId)
      .maybeSingle();
    if (persistedError) throw persistedError;
    if (!persisted?.dgii_estado) {
      throw new Error('El envío terminó sin devolver un estado DGII. Revisa los registros de la función enviar-ecf.');
    }
    return this.receive('FACTURA', invoiceId, persisted as EcfResult);
  }

  async sendCreditNote(creditNoteId: number): Promise<EcfResult> {
    return this.sendDocument('NOTA_CREDITO', creditNoteId, 'enviar-nota-credito-ecf', { creditNoteId });
  }

  async sendMinorExpense(minorExpenseId: number): Promise<EcfResult> {
    return this.sendDocument('GASTO_MENOR', minorExpenseId, 'enviar-gasto-menor-ecf', { minorExpenseId });
  }

  private async sendDocument(kind: EcfDocumentKind, id: number, name: string, body: object): Promise<EcfResult> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Documento inválido para transmitir.');
    const generation = this.generation;
    const { data, error } = await this.supabase.client.functions.invoke(name, { body });
    if (generation !== this.generation) throw new Error('La sesión cambió durante el envío.');
    if (error) await this.throwFunctionError(error);
    if (!data || data.error || !data.dgii_estado) throw new Error(data?.error || 'El servicio no devolvió un estado de la operación.');
    return this.receive(kind, id, data as EcfResult);
  }
}
