export interface ManualServiceOrderRow {
  RaporSira?: number | string | null;
}

function parseOrder(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function applyManualServiceOrder<T extends ManualServiceOrderRow>(rows: T[]): T[] {
  if (rows.length < 2) return rows;

  const manual = rows
    .map((row, index) => ({ row, index, order: parseOrder(row.RaporSira) }))
    .filter((x): x is { row: T; index: number; order: number } => x.order !== null)
    .sort((a, b) => a.order - b.order || a.index - b.index);

  if (manual.length === 0) return rows;

  const slots: Array<T | null> = Array(rows.length).fill(null);
  const placed = new Set<T>();

  for (const item of manual) {
    let target = Math.min(Math.max(item.order, 1), rows.length) - 1;
    while (target < slots.length && slots[target]) target += 1;
    if (target >= slots.length) {
      target = slots.length - 1;
      while (target >= 0 && slots[target]) target -= 1;
    }
    if (target >= 0) {
      slots[target] = item.row;
      placed.add(item.row);
    }
  }

  let cursor = 0;
  for (const row of rows) {
    if (placed.has(row)) continue;
    while (cursor < slots.length && slots[cursor]) cursor += 1;
    if (cursor < slots.length) slots[cursor] = row;
  }

  return slots.filter((row): row is T => row !== null);
}
