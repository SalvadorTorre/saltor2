import { operationResult, saveResult, type Operation } from './ecf-operation.ts';
import { STATES } from './ecf-queue.ts';

/** Ambiente SIMULACION: empresa de prueba que no envía a la DGII. */
export const isSimulation = (config: { ambiente?: unknown } | null | undefined): boolean =>
  String(config?.ambiente ?? '').toUpperCase() === 'SIMULACION';

/**
 * Hace todo el proceso (reserva el e-NCF de la secuencia, guarda la operación y los estados) pero
 * NO firma ni envía a la DGII. El documento queda Aceptado (o Firmado en modo FIRMA) con código de
 * seguridad, fecha de firma y QR simulados.
 */
export async function simulateOperation(db: unknown, op: Operation, scenario: Record<string, string>): Promise<unknown> {
  if (!op.claimed) return operationResult(op);
  const status = op.modo === 'FIRMA' ? 'FIRMADA' : 'ACEPTADO';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const securityCode = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  const signedAt = new Date();
  const signedText = signedAt.toLocaleString('en-GB', { timeZone: 'America/Santo_Domingo', hour12: false }).replace(',', '').replaceAll('/', '-');
  const qr = 'https://ecf.dgii.gov.do/testecf/consultatimbre?SIMULACION=1'
    + `&RncEmisor=${encodeURIComponent(scenario.RNCEmisor ?? '')}&RncComprador=${encodeURIComponent(scenario.RNCComprador ?? '')}`
    + `&ENCF=${encodeURIComponent(op.encf)}&FechaEmision=${encodeURIComponent(scenario.FechaEmision ?? '')}`
    + `&MontoTotal=${encodeURIComponent(scenario.MontoTotal ?? '')}&FechaFirma=${encodeURIComponent(signedText)}&CodigoSeguridad=${securityCode}`;
  await saveResult(db, op, 'ENVIANDO_SERVICIO', { dgii_estado: 'Preparando envío' }, { simulacion: true, scenario });
  const result = {
    ecf_queue_status: status, ecf_operation_id: null, dgii_estado: STATES[status], estado_dgii: STATES[status],
    dgii_track_id: `SIM-${op.encf}`, dgii_codigo_respuesta: '1',
    dgii_mensaje_respuesta: 'SIMULACIÓN: no se envió a la DGII (empresa de prueba).',
    codSeguridad: securityCode, qr_link: qr, fec_firma: signedAt.toISOString(),
    ecf_xml_firmado: op.modo === 'FIRMA' ? `<!-- SIMULACION ${op.encf} -->` : null,
    dgii_mensajes: null, dgii_response_json: { simulacion: true }, dgii_response_raw: 'SIMULACION', dgii_error_message: null
  };
  return operationResult(await saveResult(db, op, status, result));
}
