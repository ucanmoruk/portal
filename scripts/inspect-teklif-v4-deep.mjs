// Yeni şablonu satır-satır TEXT-only olarak çıkar; tüm {değişken}'leri bul.
import { readFileSync } from "node:fs";
import JSZip from "jszip";

const buf = readFileSync("R:/3_Şirketler/3.Laboratuvar/Şablon Çalışma/Teklif Şablon v4.docx");
const zip = await JSZip.loadAsync(buf);

const targets = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"];

for (const t of targets) {
    const f = zip.file(t);
    if (!f) { console.log(`--- ${t}: YOK ---\n`); continue; }
    const xml = await f.async("string");

    // Tüm <w:t>...</w:t> içeriklerini ardışık olarak birleştir (TÜM run'ları
    // toplam tek bir text akışı yap), sonra {değişken}'leri bul
    const allText = (xml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || [])
        .map(m => m.replace(/<[^>]+>/g, ""))
        .join("");

    // Paragraf bazında parçala (<w:p> sınırlarında)
    const paragraphs = xml.split(/<w:p[ >]/).slice(1).map(p => "<w:p" + (p.startsWith(">") ? "" : " ") + p.split("</w:p>")[0] + "</w:p>");
    const allParaText = paragraphs.map(p => (p.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || []).map(m => m.replace(/<[^>]+>/g, "")).join(""));

    const vars = [...new Set([...allText.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map(m => m[0]))].sort();
    console.log(`--- ${t} ---`);
    console.log(`Bulunan değişkenler: ${vars.length > 0 ? vars.join(", ") : "(yok)"}`);

    // Değişken içeren paragrafları yazdır
    let pn = 0;
    for (const ptext of allParaText) {
        pn++;
        if (/\{[a-zA-Z0-9_]+\}/.test(ptext)) {
            console.log(`  P${pn}: "${ptext.slice(0, 140)}"`);
        }
    }
    console.log("");
}
