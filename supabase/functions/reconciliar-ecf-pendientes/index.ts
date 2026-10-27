import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { queryOperation, type Operation } from '../_shared/ecf-operation.ts';
import { PENDING } from '../_shared/ecf-queue.ts';

const RECONCILIABLE_STATUSES = ['PREPARANDO', 'ENVIANDO_SERVICIO', ...PENDING];
const MAX_OPERATIONS = 20;
const MAX_CONCURRENCY = 4;

type Summary = {
  skipped: boolean;
  checked: number;
  updated: number;
  failed: number;
  statuses: Record<string, number>;
  startedAt: string;
  finishedAt?: string;
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

function isAuthorized(request: Request): boolean {
  const expected = Deno.env.get('ECF_RECONCILER_SECRET');
  const received = request.headers.get('x-ecf-reconciler-secret');
  if (!expected || !received || expected.length !== received.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  callback: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Metodo no permitido.' }, 405);
  if (!isAuthorized(request)) return json({ error: 'Solicitud interna no autorizada.' }, 401);

  const startedAt = new Date().toISOString();
  const summary: Summary = { skipped: false, checked: 0, updated: 0, failed: 0, statuses: {}, startedAt };
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'myappdb' } }
  );

  const { data: locked, error: lockError } = await db.rpc('iniciar_reconciliacion_ecf', { p_duracion: '4 minutes' });
  if (lockError) return json({ error: `No se pudo iniciar la reconciliacion: ${lockError.message}` }, 500);
  if (!locked) return json({ ...summary, skipped: true, reason: 'Otra reconciliacion aun esta en curso.' }, 202);

  try {
    const { data, error } = await db.from('ecf_operaciones')
      .select('*')
      .eq('activa', true)
      .in('status', RECONCILIABLE_STATUSES)
      .order('actualizado_en', { ascending: true })
      .limit(MAX_OPERATIONS);
    if (error) throw error;

    const operations = (data ?? []) as Operation[];
    summary.checked = operations.length;

    await mapWithConcurrency(operations, MAX_CONCURRENCY, async (operation) => {
      try {
        const result = await queryOperation(db, operation);
        const status = String(result.ecf_queue_status ?? operation.status);
        summary.statuses[status] = (summary.statuses[status] ?? 0) + 1;
        if (status !== operation.status) summary.updated += 1;
      } catch (error) {
        summary.failed += 1;
        console.error('reconciliar-ecf-pendientes operacion fallida', {
          operationId: operation.operation_id,
          operationRecordId: operation.id,
          kind: operation.tipo,
          documentId: operation.documento_id,
          message: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    summary.finishedAt = new Date().toISOString();
    const { error: finishError } = await db.rpc('terminar_reconciliacion_ecf', { p_resumen: summary });
    if (finishError) throw finishError;
    return json(summary);
  } catch (error) {
    summary.failed += 1;
    summary.finishedAt = new Date().toISOString();
    await db.rpc('terminar_reconciliacion_ecf', { p_resumen: summary });
    console.error('reconciliar-ecf-pendientes fallo general', error);
    return json({ error: error instanceof Error ? error.message : 'No se pudo reconciliar la cola e-CF.', summary }, 500);
  }
});
