/** Accepts a numeric range or a full e-NCF, removing the series before parsing. */
export function sequenceNumber(value: string, series: string): number {
  const text = value.trim().toUpperCase();
  const prefix = series.trim().toUpperCase();
  const digits = text.startsWith(prefix) && prefix ? text.slice(prefix.length) : text;
  return /^\d{1,10}$/.test(digits) ? Number(digits) : NaN;
}

export function sequenceDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
