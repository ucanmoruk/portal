export const TASK_CATEGORIES = ["Rutin", "Satış", "Rutin Dışı"];

export function isOverdue(task: { durum: string; terminTarihi: string | null; bitisTarihi?: string | null }, today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })) {
  const end = (task.bitisTarihi || task.terminTarihi || "").slice(0, 10);
  return Boolean(end && end < today && task.durum !== "Tamamlandı");
}

