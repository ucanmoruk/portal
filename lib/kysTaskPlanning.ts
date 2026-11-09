export const TASK_CATEGORIES = ["Rutin", "Satış", "Rutin Dışı"];

export function dailyTaskDates(start: string, count: unknown): string[] {
  return recurringTaskDates(start, count, "gunluk");
}

export function recurringTaskDates(start: string, count: unknown, frequency: string): string[] {
  const days = Number(count);
  if (!["gunluk", "haftalik", "aylik"].includes(frequency)) throw new Error("Geçersiz tekrar seçeneği.");
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error("Tekrar süresi 1–366 arasında olmalıdır.");
  const first = new Date(`${start}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(first.getTime()) || first.toISOString().slice(0, 10) !== start) throw new Error("Geçerli bir başlama tarihi seçin.");
  return Array.from({ length: days }, (_, index) => {
    if (frequency !== "aylik") return new Date(first.getTime() + index * (frequency === "haftalik" ? 7 : 1) * 86400000).toISOString().slice(0, 10);
    const month = first.getUTCMonth() + index;
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(first.getUTCFullYear(), month, Math.min(first.getUTCDate(), lastDay))).toISOString().slice(0, 10);
  });
}

export function isOverdue(task: { durum: string; terminTarihi: string | null; bitisTarihi?: string | null }, today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })) {
  const end = (task.bitisTarihi || task.terminTarihi || "").slice(0, 10);
  return Boolean(end && end < today && task.durum !== "Tamamlandı");
}

