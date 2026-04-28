const VND = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export function formatAmount(n: number): string {
  return VND.format(Math.round(n));
}

// Parse "DD/MM/YYYY" → epoch ms for sorting and range filters.
export function parseDDMMYYYY(s: string): number {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

export function isoToMs(iso: string): number {
  if (!iso) return 0;
  return new Date(iso).getTime();
}
