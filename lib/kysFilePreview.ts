export function hasKysPdfPreview(document: { hasDosya: boolean; tur: string; dosyaMimeType?: string | null; dosyaAdi?: string | null }) {
  return document.hasDosya && (document.dosyaMimeType === "application/pdf"
    || (document.tur === "Form" && /(?:word|\.docx?$)/i.test(`${document.dosyaMimeType} ${document.dosyaAdi}`)));
}
