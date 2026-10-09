/**
 * Arma un filtro `or` de PostgREST que busca `term` (contiene, sin distinguir
 * mayúsculas) en varias columnas.
 *
 * El texto del usuario se pone entre comillas dobles porque PostgREST usa la
 * coma, los paréntesis y los dos puntos como separadores: sin comillas una
 * búsqueda como "EMPRESA LIDER, SRL" rompe la consulta (error 400).  Los
 * comodines `%` y `_` que escriba el usuario se toman literalmente.
 */
export function ilikeAnyColumn(columns: string[], term: string): string {
  const literal = term
    .replace(/[\\%_]/g, (char) => `\\${char}`)
    .replace(/"/g, '\\"');
  return columns.map((column) => `${column}.ilike."%${literal}%"`).join(',');
}
