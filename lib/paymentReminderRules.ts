import { createHash } from "node:crypto";

export const paymentReportRecipients = ["oguzhan@uniqueanalyse.com", "muhasebe@uniqueanalyse.com"];
export type DueInvoice = {
  id: number; company: string; invoiceNo: string; dueDate: string;
  email: string; balance: number; daysLate: number; fingerprint: string;
  deliveryState?: string;
};

export function istanbulDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function reminderAddresses(value: unknown) {
  const addresses = String(value || "").split(/[;,]/).map(address => address.trim()).filter(Boolean);
  return addresses.length && addresses.every(address => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address))
    ? [...new Set(addresses.map(address => address.toLowerCase()))] : [];
}

export function dueInvoice(row: Record<string, unknown>, today: string): DueInvoice | null {
  const dueDate = row.VadeTarihi instanceof Date ? row.VadeTarihi.toISOString().slice(0, 10) : String(row.VadeTarihi || "").slice(0, 10);
  const total = Number(row.Tutar), paid = Number(row.DirektOdenen || 0) + Number(row.Mahsup || 0);
  const balance = Math.round((total - paid) * 100) / 100;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate > today || !Number.isFinite(balance) || balance <= 0 || ["Ödendi", "İptal"].includes(String(row.OdemeDurumu))) return null;
  const invoice = {
    id: Number(row.ID), company: String(row.FirmaAd || ""), invoiceNo: String(row.FaturaNo || ""),
    dueDate, email: reminderAddresses(row.FirmaEmail).join(", "), balance,
    daysLate: Math.max(0, Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86400000)),
  };
  return { ...invoice, fingerprint: createHash("sha256").update(JSON.stringify(invoice)).digest("hex") };
}
