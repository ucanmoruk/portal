export const REQUEST_TRANSITIONS: Record<string, string[]> = {
  "Onay Bekliyor": ["Onaylandı", "İptal"],
  Onaylandı: ["İşleme Alındı", "İptal"],
  "İşleme Alındı": ["İptal"],
  "Kısmi Kabul": [],
  Tamamlandı: [],
  İptal: [],
  Silindi: [],
};
export function requireRequestTransition(current: string, next: string) {
  if (!REQUEST_TRANSITIONS[current]?.includes(next))
    throw new Error(
      `Talep ${current} durumundan ${next} durumuna geçirilemez.`,
    );
}
export function requireRequestAcceptance(
  status: string,
  itemStatus: string,
  received: number,
  requested: number,
  next: number,
) {
  if (!["İşleme Alındı", "Kısmi Kabul"].includes(status))
    throw new Error("Kabul için talep işleme alınmış olmalıdır.");
  if (itemStatus === "Tamamlandı" || received >= requested)
    throw new Error(
      "Tamamlanan kalem tekrar kabul edilemez; mevcut kabulü düzeltin.",
    );
  if (
    !Number.isFinite(next) ||
    next <= 0 ||
    next > requested - received + 0.00001
  )
    throw new Error(
      "Gelen miktar pozitif olmalı ve kalan talep miktarını aşmamalıdır.",
    );
}
