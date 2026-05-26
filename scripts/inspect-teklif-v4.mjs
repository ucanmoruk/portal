// Yeni teklif şablonundaki tüm değişkenleri (Word run birleşimi sonrası) listele.
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

const buf = readFileSync("R:/3_Şirketler/3.Laboratuvar/Şablon Çalışma/Teklif Şablon v4.docx");
const zip = await JSZip.loadAsync(buf);

function mergeVariables(xml) {
    for (let i = 0; i < 30; i++) {
        const prev = xml;
        xml = xml.replace(
            /(<w:t(?:\s[^>]*)?>(?:[^<]*)\{[^}<]*)<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([^<]*)<\/w:t><\/w:r>/g,
            (_, p1, p2) => `${p1}${p2}</w:t></w:r>`
        );
        if (xml === prev) break;
    }
    return xml;
}

const targets = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"];

for (const t of targets) {
    const f = zip.file(t);
    if (!f) { console.log(`--- ${t}: YOK ---`); continue; }
    let xml = await f.async("string");
    xml = mergeVariables(xml);
    const matches = [...xml.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map(m => m[0]);
    const unique = [...new Set(matches)].sort();
    console.log(`--- ${t} (${matches.length} occurrence, ${unique.length} unique) ---`);
    unique.forEach(v => console.log(`  ${v}`));
    // dump pasif
}

// Hizmet satırı template'ini bul
console.log("\n--- Tablodaki tekrarlayan satır (template row) arama ---");
const docXml = await zip.file("word/document.xml").async("string");
const merged = mergeVariables(docXml);
const rowRegex = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
let m;
let i = 0;
while ((m = rowRegex.exec(merged)) !== null) {
    i++;
    // Sadece içinde {hizmet_adi} veya {no} olan satırları bildir
    const text = m[0].replace(/<[^>]+>/g, "").trim();
    if (m[0].includes("{")) {
        const vars = [...m[0].matchAll(/\{[a-zA-Z0-9_]+\}/g)].map(x => x[0]);
        console.log(`  Row ${i}: vars=${vars.join(", ")} | text="${text.slice(0, 80)}"`);
    }
}
