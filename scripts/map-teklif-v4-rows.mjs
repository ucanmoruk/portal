// Hedef: V4 şablonunun document.xml içindeki <w:tr> satırlarının text içeriğini
// listele — hizmet satırlarının tekrarlayan deseni tespit edebilelim.

import { readFileSync } from "node:fs";
import JSZip from "jszip";

const buf = readFileSync("R:/3_Şirketler/3.Laboratuvar/Şablon Çalışma/Teklif Şablon v4.docx");
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml").async("string");

const trRegex = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
let m;
let i = 0;
while ((m = trRegex.exec(xml)) !== null) {
    i++;
    const text = (m[0].match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, ""))
        .join("|");
    console.log(`Row ${i}: "${text.slice(0, 200)}"`);
}
console.log(`\nToplam ${i} <w:tr>`);

// Paragraph dökümü (hardcoded müşteri bilgisi yerleri için)
console.log("\n=== <w:p> paragrafları (text içerikli) ===");
const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
let j = 0;
while ((m = pRegex.exec(xml)) !== null) {
    j++;
    const text = (m[0].match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, ""))
        .join("");
    if (text.trim()) {
        console.log(`P${j}: "${text.slice(0, 160)}"`);
    }
}
