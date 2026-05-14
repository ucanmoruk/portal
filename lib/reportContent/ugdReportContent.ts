type ReportLanguage = "tr" | "en";

type ReportCopyOverride = {
  [lang in ReportLanguage]?: Record<string, string>;
};

// UGD Detayları rapor metin override alanı.
// Mevcut varsayılan metinlerin üzerine sadece değiştirmek istediğiniz anahtarları ekleyin.
export const UGD_REPORT_CONTENT_OVERRIDES: ReportCopyOverride = {
  tr: {},
  en: {},
};

