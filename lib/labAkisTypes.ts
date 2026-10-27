export type LabAnalysis = {
  id: number;
  nkrId: number;
  analizId: number;
  birimId: number | null;
  birimAd: string;
  ad: string;
  raporNo: string;
  grup: string;
  numune: string;
  baslangic: string;
  termin: string | null;
  tamamlandi: boolean;
  araGunler: Array<{ id: number; gun: number; tarih: string; tamamlandi: boolean }>;
};
export type QualityWork = { id: number; baslik: string; aciklama: string; tarih: string; tamamlandi: boolean };
export type LabFlowData = { analizler: LabAnalysis[]; kalite: QualityWork[] };

export function validFlowDate(value: unknown): string {
  const text = String(value || "");
  const date = new Date(`${text}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error("Geçerli bir tarih seçin.");
  return text;
}

// 1. gün, numunenin kayıt günüdür.
export function intermediateDates(start: string, end: string | null, value: unknown) {
  validFlowDate(start);
  if (!end) throw new Error("Önce analiz için termin tarihi belirleyin.");
  validFlowDate(end);
  const days = Array.isArray(value) ? value.map(Number) : [];
  if (!days.length || days.length > 36 || days.some(day => !Number.isSafeInteger(day) || day < 1 || day > 3650)) throw new Error("1–3650 arasında en fazla 36 ara gün seçin.");
  return [...new Set(days)].sort((a, b) => a - b).map(gun => {
    const date = new Date(`${start}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + gun - 1);
    const tarih = date.toISOString().slice(0, 10);
    if (tarih > end) throw new Error(`${gun}. gün termin tarihinden sonra. Önce analiz bitiş tarihini uzatın.`);
    return { gun, tarih };
  });
}
