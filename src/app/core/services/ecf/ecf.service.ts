import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { InvoiceRow } from '../invoices/invoices.service';

@Injectable({ providedIn: 'root' })
export class EcfService {
  constructor(private readonly supabase: SupabaseService) {}

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
    const { data, error } = await this.supabase.client.functions.invoke('enviar-ecf', { body: { invoiceId } });
    if (error) await this.throwFunctionError(error);
    if (data?.error) throw new Error(data.error);
    return data as InvoiceRow;
  }

  async sendCreditNote(creditNoteId: number): Promise<{ id: number; encf: string; dgii_estado: string; dgii_track_id?: string | null; dgii_codigo_seguridad?: string | null; dgii_mensaje_respuesta?: string }> {
    const { data, error } = await this.supabase.client.functions.invoke('enviar-nota-credito-ecf', { body: { creditNoteId } });
    if (error) await this.throwFunctionError(error);
    if (data?.error) throw new Error(data.error);
    return data as { id: number; encf: string; dgii_estado: string; dgii_track_id?: string | null; dgii_codigo_seguridad?: string | null; dgii_mensaje_respuesta?: string };
  }

  async sendMinorExpense(minorExpenseId: number): Promise<{ id: number; encf: string; dgii_estado: string; dgii_track_id?: string | null; dgii_codigo_seguridad?: string | null; dgii_mensaje_respuesta?: string }> {
    const { data, error } = await this.supabase.client.functions.invoke('enviar-gasto-menor-ecf', { body: { minorExpenseId } });
    if (error) await this.throwFunctionError(error);
    if (data?.error) throw new Error(data.error);
    return data as { id: number; encf: string; dgii_estado: string; dgii_track_id?: string | null; dgii_codigo_seguridad?: string | null; dgii_mensaje_respuesta?: string };
  }
}
