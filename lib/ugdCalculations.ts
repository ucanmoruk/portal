/** Percentages are entered as 0–100; A is mg/kg body weight/day. */
export function parseUgdNumber(value: unknown, fallback = 0): number {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return fallback;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

export function calcSED(a: number, concentration: number, absorption: number): number {
  return a * (concentration / 100) * (absorption / 100);
}

export function fmtSED(value: number): string {
  if (!Number.isFinite(value)) return "—";
  // Keep small non-zero results visible without scientific notation or binary noise.
  return new Intl.NumberFormat("tr-TR", {
    useGrouping: false,
    maximumSignificantDigits: 12,
  }).format(value);
}
