/** Tipos de anulación del Formato 608 (Instructivo DGII). */
export const CANCELLATION_TYPES: { code: number; description: string }[] = [
  { code: 1, description: 'Deterioro de factura preimpresa' },
  { code: 2, description: 'Errores de impresión (factura preimpresa)' },
  { code: 3, description: 'Impresión defectuosa' },
  { code: 4, description: 'Corrección de la información' },
  { code: 5, description: 'Cambio de productos' },
  { code: 6, description: 'Devolución de productos' },
  { code: 7, description: 'Omisión de productos' },
  { code: 8, description: 'Errores en secuencia de NCF' },
  { code: 9, description: 'Por cese de operaciones' },
  { code: 10, description: 'Pérdida o hurto de talonarios' }
];
