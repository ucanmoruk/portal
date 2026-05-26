// Customer row'un cell yapısını incele
import { readFileSync } from "node:fs";
import JSZip from "jszip";

const buf = readFileSync("R:/3_Şirketler/3.Laboratuvar/Şablon Çalışma/Teklif Şablon v4.docx");
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml").async("string");

const trRegex = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
for (const m of xml.matchAll(trRegex)) {
    if (m[0].includes("EVLY PHARMA")) {
        console.log("=== ROW XML uzunluğu:", m[0].length);
        const tcs = m[0].match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || [];
        console.log(`Cell sayısı (tcRegex ile): ${tcs.length}`);
        tcs.forEach((tc, i) => {
            const txt = (tc.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join("|");
            console.log(`  Cell ${i+1} text: "${txt.slice(0, 120)}"`);
            const ps = tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
            console.log(`    paragraf sayısı: ${ps.length}`);
        });

        // Tabloda <w:tbl> ya da iç içe table var mı?
        const tblCount = (m[0].match(/<w:tbl[ >]/g) || []).length;
        console.log(`Bu satır içinde <w:tbl> count: ${tblCount}`);
        break;
    }
}
