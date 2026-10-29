import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Schedule = {
  empresa_id: number;
  activo: boolean;
  hora_desde: string;
  hora_hasta: string;
  intervalo_minutos: number;
  lote_por_ciclo: number;
  maximo_diario: number;
  contador_fecha: string | null;
  enviadas_hoy: number;
  ultimo_proceso_en: string | null;
};

type Invoice = { id: number; numero_factura: string | null };
type CompanyResult = { empresaId: number; checked: number; processed: number; failed: number; skipped?: string; errors: string[] };

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

function sameSecret(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received || expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
}

function nowInDominicanRepublic(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).reduce<Record<string, string>>((value, part) => ({ ...value, [part.type]: part.value }), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function asHHMM(value: string): string { return String(value ?? '').slice(0, 5); }

function isWithinWindow(time: string, from: string, until: string): boolean {
  const start = asHHMM(from);
  const end = asHHMM(until);
  if (start === end) return true;
  return start < end ? time >= start && time <= end : time >= start || time <= end;
}

function elapsedMinutes(iso: string | null, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const elapsed = now.getTime() - new Date(iso).getTime();
  return Number.isFinite(elapsed) ? elapsed / 60000 : Number.POSITIVE_INFINITY;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!sameSecret(Deno.env.get('ECF_RECONCILER_SECRET'), request.headers.get('x-ecf-reconciler-secret'))) {
    return json({ error: 'Solicitud interna no autorizada.' }, 401);
  }

  const now = new Date();
  const localNow = nowInDominicanRepublic(now);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'myappdb' } });
  const { data, error } = await db.from('proforma_envio_programaciones').select('*').eq('activo', true).order('empresa_id');
  if (error) return json({ error: error.message }, 500);

  const summary: CompanyResult[] = [];
  for (const rawSchedule of (data ?? []) as Schedule[]) {
    const item: CompanyResult = { empresaId: rawSchedule.empresa_id, checked: 0, processed: 0, failed: 0, errors: [] };
    const sentToday = rawSchedule.contador_fecha === localNow.date ? rawSchedule.enviadas_hoy : 0;
    if (!isWithinWindow(localNow.time, rawSchedule.hora_desde, rawSchedule.hora_hasta)) {
      item.skipped = 'Fuera del horario configurado.';
      summary.push(item);
      continue;
    }
    if (elapsedMinutes(rawSchedule.ultimo_proceso_en, now) < rawSchedule.intervalo_minutos) {
      item.skipped = 'Aún no cumple la pausa configurada.';
      summary.push(item);
      continue;
    }
    const available = Math.max(0, rawSchedule.maximo_diario - sentToday);
    if (!available) {
      item.skipped = 'Ya alcanzó el máximo diario.';
      summary.push(item);
      continue;
    }

    const limit = Math.min(rawSchedule.lote_por_ciclo, available);
    const { data: invoices, error: invoiceError } = await db.from('facturas')
      .select('id, numero_factura')
      .eq('idempres', rawSchedule.empresa_id)
      .eq('ecf_queue_status', 'PENDIENTE_ENVIO')
      .ilike('tipo_ncf', '%332%')
      .neq('estado', 'Anulada')
      .order('creado_en', { ascending: true })
      .limit(limit);
    if (invoiceError) {
      item.failed = 1;
      item.errors.push(invoiceError.message);
    } else {
      const rows = (invoices ?? []) as Invoice[];
      item.checked = rows.length;
      for (const invoice of rows) {
        try {
          const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-ecf`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              'x-ecf-reconciler-secret': Deno.env.get('ECF_RECONCILER_SECRET')!
            },
            body: JSON.stringify({ invoiceId: invoice.id, source: 'proforma-scheduler' })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(String(body?.error ?? `Respuesta ${response.status}`));
          item.processed += 1;
        } catch (failure) {
          item.failed += 1;
          item.errors.push(`Factura ${invoice.numero_factura ?? invoice.id}: ${failure instanceof Error ? failure.message : 'Error desconocido'}`);
        }
      }
    }

    const result = { ...item, fechaLocal: localNow.date, horaLocal: localNow.time, finishedAt: new Date().toISOString() };
    await db.from('proforma_envio_programaciones').update({
      contador_fecha: localNow.date,
      enviadas_hoy: sentToday + item.processed,
      ultimo_proceso_en: new Date().toISOString(),
      ultimo_resumen: result
    }).eq('empresa_id', rawSchedule.empresa_id);
    summary.push(item);
  }

  return json({ processedAt: new Date().toISOString(), localNow, companies: summary });
});
