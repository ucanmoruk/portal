import * as fs from "fs";
import * as path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { ReportData } from "./getReportData";

// ─────────────────────────────────────────────────────────────────────────────
// fillTemplate
//
// Verilen format için sablon/{format}.docx şablonunu docxtemplater ile doldurur.
//
// Şablon sözdizimi (Word belgesi içinde):
//   Tek değer : {{RaporNo}}  {{FirmaAd}}  {{MM-YY}}  vb.
//   Döngü başı: {{#hizmetler}}   — tablodaki tekrarlanan satırın ilk hücresi
//   Döngü sonu: {{/hizmetler}}   — aynı satırın son hücresi
//   Döngü içi : {{Analiz}}  {{Sonuc}}  {{Degerlendirme}}  vb.
//
// Kısıtlama: {{MM-YY}}, {{NumuneAdi-Eng}} gibi kısa çizgi içeren etiketler
// JavaScript'te geçerli tanımlayıcı değildir; bu yüzden özel parser kullanılır.
// ─────────────────────────────────────────────────────────────────────────────

/** docxtemplater için özel parser: etiketi doğrudan nesne anahtarı olarak arar. */
function makeParser() {
  return (tag: string) => ({
    get(scope: Record<string, unknown>, context: { num: number }) {
      // Döngü içindeyken önce iç scope'a bak, sonra dış scope'a
      if (context.num > 0 && typeof scope === "object" && scope !== null) {
        if (Object.prototype.hasOwnProperty.call(scope, tag)) {
          return scope[tag];
        }
      }
      return (scope as Record<string, unknown>)[tag] ?? "";
    },
  });
}

export async function fillTemplate(
  data: ReportData,
  format: string,
): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "sablon", `${format}.docx`);

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Şablon bulunamadı: sablon/${format}.docx\n` +
      `Mevcut şablonlar: ${fs.readdirSync(path.join(process.cwd(), "sablon")).join(", ")}`,
    );
  }

  const content = fs.readFileSync(templatePath);
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks:    true,
    delimiters:    { start: "{{", end: "}}" },
    parser:        makeParser(),
  });

  doc.render(data as unknown as Record<string, unknown>);

  return doc.getZip().generate({
    type:        "nodebuffer",
    compression: "DEFLATE",
  }) as Buffer;
}
