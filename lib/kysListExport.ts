import { readFile } from "node:fs/promises";
import path from "node:path";
import { cosmoPool } from "@/lib/db";
import type { DisKaynakliDokumanRow } from "@/lib/kysDisKaynakliDokumanStore";

export const escapeExport = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function exportDate(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || "-";
}
export type ListTemplate = { kod: string; revizyon: string; yururluk: string; logo: string };
export async function getListTemplate(kod: string): Promise<ListTemplate> {
  const pool = await cosmoPool;
  const row = (await pool.request().input("Kod",kod).query("SELECT Revizyon,YururlukTarihi FROM KysDokuman WHERE Kod=@Kod")).recordset[0];
  if (!row) throw new Error(`${kod} şablon kaydı bulunamadı.`);
  const raw = row.YururlukTarihi;
  const date = raw instanceof Date ? raw.toLocaleDateString("sv-SE",{timeZone:"Europe/Istanbul"}) : String(raw || "");
  const logo = await readFile(path.join(process.cwd(),"public/kys-document-logo.png"));
  return {kod,revizyon:String(row.Revizyon).padStart(2,"0"),yururluk:exportDate(date),logo:`data:image/png;base64,${logo.toString("base64")}`};
}
export function listHeader(template: ListTemplate, title: string) {
  return `<div style="width:100%;padding:0 9mm;font-family:Arial,sans-serif;color:black;box-sizing:border-box"><div style="display:flex;align-items:center;border:1px solid black;height:22mm"><img src="${template.logo}" style="width:53mm;margin:0 4mm;flex-shrink:0"/><strong style="flex:1;min-width:0;text-align:center;font-size:15pt;line-height:1.2">${escapeExport(title)}</strong><table style="border-collapse:collapse;width:59mm;flex-shrink:0;font-size:8pt;height:100%">${[["Doküman No",template.kod],["Revizyon",template.revizyon],["Yürürlük Tarihi",template.yururluk],["Sayfa",'<span class="pageNumber"></span> / <span class="totalPages"></span>']].map(([k,v])=>`<tr><td style="border:1px solid black;padding:2px 5px">${k}</td><td style="border:1px solid black;padding:2px 5px">${v}</td></tr>`).join("")}</table></div></div>`;
}
export const listPdfOptions = {displayHeaderFooter:true,footerTemplate:"<div></div>",paperWidth:11,paperHeight:8.5,marginTop:1.14,marginBottom:.35,marginLeft:.35,marginRight:.35,printBackground:true};
export function externalTrackingHtml(documents: DisKaynakliDokumanRow[], birim: string) {
  const e = escapeExport;
  const dates = [...new Set(documents.map(d=>d.kontrolTarihi?.slice(0,10)).filter((v):v is string=>Boolean(v)))].sort();
  return `<!doctype html><html lang="tr"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font:8pt Arial;color:#000}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:1px solid #000;padding:5px;vertical-align:middle;overflow-wrap:anywhere;line-height:1.4}th{background:#5038ed;color:white;text-align:center}thead{display:table-header-group}tr{break-inside:avoid}.date{white-space:nowrap;overflow-wrap:normal}.footer{margin-top:5mm;break-inside:avoid}.footer td{vertical-align:top;height:23mm;font-size:8pt}</style><body><p><b>Laboratuvar Birimi:</b> ${e(birim)}</p><table><colgroup>${[4,25,16,14,10,10,12,9].map(w=>`<col style="width:${w}%">`).join("")}</colgroup><thead><tr>${["Sıra No","Dış Kaynaklı Doküman Adı","Dokümanın Kodu ve Yayın Tarihi","Dokümanın Kaynağı","Geliş Şekli (Elektronik / Kağıt)","Son Kontrol Tarihi","Sorumlu","Dokümanın Güncellik Takibi (y/-)"].map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${documents.map((d,i)=>`<tr><td>${i+1}</td><td>${e(d.dokumanAdi)}</td><td>${e(d.dokumanKodu)}<br>${e(exportDate(d.yayinTarihi))}</td><td>${e(d.yayincisi||"-")}</td><td>${d.pdfPath||d.yayinLinki?"Elektronik":"-"}</td><td class="date">${e(exportDate(d.kontrolTarihi))}</td><td>${e(d.kontrolEdenAd||"-")}</td><td style="text-align:center">${d.kontrolEdildi?"y":"-"}</td></tr>`).join("")||'<tr><td colspan="8">Kayıt bulunamadı.</td></tr>'}</tbody></table><table class="footer"><tr><td>Önceki Güncelleme Tarihi: ${e(exportDate(dates.at(-2)||null))}<br><br>Son Güncelleme Tarihi: ${e(exportDate(dates.at(-1)||null))}</td><td><b>Hazırlayan</b><br>Ad / Soyad:<br>Tarih:<br>İmza:</td><td><b>Kontrol Eden ve Onaylayan</b><br>Ad / Soyad:<br>Tarih:<br>İmza:</td></tr></table></body></html>`;
}
