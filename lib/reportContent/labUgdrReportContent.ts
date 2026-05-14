type ReportLanguage = "tr" | "en";

type ReportCopyOverride = {
  [lang in ReportLanguage]?: Record<string, string>;
};

// Laboratuvar > Rapor Takip > UGDR rapor metin override alanı.
// Mevcut varsayılan metinlerin üzerine sadece değiştirmek istediğiniz anahtarları ekleyin.
export const LAB_UGDR_REPORT_CONTENT_OVERRIDES: ReportCopyOverride = {
  tr: {},
  en: {},
};

