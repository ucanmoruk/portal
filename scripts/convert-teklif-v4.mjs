// V4 teklif şablonunu (örnek veriyle dolu hali) çalışan teklif şablonuna çevir.
//   • Müşteri bilgi satırını cell-bazlı placeholder'a çevirir
//   • 6 hizmet satırını 1 template row'a indirir + placeholder ekler
//   • Header'daki "DENEY RAPORU"yu "Fiyat Teklifi"ne çevirir
//   • {{RaporNo}} → {teklif_no}, vb. düzeltir
//   • Sonucu sablon/teklifsablon.docx olarak kaydeder

import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

const SRC = "R:/3_Şirketler/3.Laboratuvar/Şablon Çalışma/Teklif Şablon v4.docx";
const DST = "R:/0_Yazılım/rootportal/sablon/teklifsablon.docx";

const buf = readFileSync(SRC);
const zip = await JSZip.loadAsync(buf);

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

// Bir <w:p> paragrafını TEK <w:r>+<w:t> formuna sıkıştır; ilk run'un formatlamasını korur.
function collapseParagraphTo(paragraphXml, newText) {
    const rRegex = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
    const runs = paragraphXml.match(rRegex) || [];
    if (runs.length === 0) {
        // Run yoksa basit bir paragraf yap — pPr varsa koru
        const pPrMatch = paragraphXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
        const pPr = pPrMatch ? pPrMatch[0] : "";
        const safeText = newText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return paragraphXml.replace(/<w:p([ >])([\s\S]*?)<\/w:p>/, `<w:p$1$2${pPr ? "" : ""}<w:r><w:t xml:space="preserve">${safeText}</w:t></w:r></w:p>`);
    }
    const firstRun = runs[0];
    const rPrMatch = firstRun.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    const safeText = newText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const newRun = `<w:r>${rPr}<w:t xml:space="preserve">${safeText}</w:t></w:r>`;
    let firstReplaced = false;
    return paragraphXml.replace(rRegex, () => {
        if (!firstReplaced) {
            firstReplaced = true;
            return newRun;
        }
        return "";
    });
}

function paragraphText(xml) {
    const matches = xml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || [];
    return matches.map(m => m.replace(/<[^>]+>/g, "")).join("");
}

function transformParagraphs(xml, replacer) {
    const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
    return xml.replace(pRegex, (p) => {
        const text = paragraphText(p);
        const result = replacer(p, text);
        return result === null ? p : result;
    });
}

// Bir <w:tr> içindeki sıralı <w:tc> cell'lerinin İLK paragrafını verilen placeholder ile değiştir.
function rewriteCellsInRow(rowXml, placeholders) {
    const tcRegex = /<w:tc[ >][\s\S]*?<\/w:tc>/g;
    const cells = rowXml.match(tcRegex) || [];
    let result = rowXml;
    cells.forEach((cell, cellIdx) => {
        if (cellIdx >= placeholders.length) return;
        const placeholder = placeholders[cellIdx];
        const pInCell = cell.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
        if (pInCell.length === 0) return;
        let newCell = cell;
        const collapsedFirst = collapseParagraphTo(pInCell[0], placeholder);
        newCell = newCell.replace(pInCell[0], collapsedFirst);
        // Cell içindeki diğer paragrafları sil
        for (let i = 1; i < pInCell.length; i++) {
            newCell = newCell.replace(pInCell[i], "");
        }
        result = result.replace(cell, newCell);
    });
    return result;
}

// ─── 1) document.xml ─────────────────────────────────────────────────────────
let doc = await zip.file("word/document.xml").async("string");
const trRegex = /<w:tr[ >][\s\S]*?<\/w:tr>/g;

// 1a) Müşteri bilgi satırı — Row 2 ("EVLY PHARMA" + "ŞERİFALİ" geçen)
const customerPlaceholders = ["{musteri_adi}", "{musteri_adresi}", "{musteri_yetkili}", "{musteri_email}"];

let customerRow = null;
for (const m of doc.matchAll(trRegex)) {
    const text = paragraphText(m[0]);
    if (/EVLY\s*PHARMA/i.test(text) && /ŞER[Iİ]FAL[Iİ]/i.test(text)) {
        customerRow = m[0];
        break;
    }
}

if (customerRow) {
    // Müşteri satırı TEK <w:tc> içinde 4 paragraf bulunduruyor — cell değil paragraph bazlı çevirmem lazım.
    const tcs = customerRow.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || [];
    if (tcs.length === 1) {
        const cell = tcs[0];
        const ps = cell.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
        let newCell = cell;
        ps.forEach((p, idx) => {
            if (idx >= customerPlaceholders.length) return;
            const collapsed = collapseParagraphTo(p, customerPlaceholders[idx]);
            newCell = newCell.replace(p, collapsed);
        });
        const newCustomerRow = customerRow.replace(cell, newCell);
        doc = doc.replace(customerRow, newCustomerRow);
        console.log(`✓ Müşteri satırı (tek hücre, ${ps.length} paragraf): ${Math.min(ps.length, customerPlaceholders.length)} paragraf placeholder'a çevrildi.`);
    } else {
        // Birden fazla cell varsa cell-bazlı çevirmeye geç (fallback)
        const newCustomerRow = rewriteCellsInRow(customerRow, customerPlaceholders);
        doc = doc.replace(customerRow, newCustomerRow);
        console.log(`✓ Müşteri satırı: ${tcs.length} hücre placeholder'a çevrildi.`);
    }
} else {
    console.log(`⚠️  Müşteri bilgi satırı bulunamadı.`);
}

// 1b) Hizmet satırlarını tespit et — ilk hücresi yalnız "N." olan satırlar
const allRows = [...doc.matchAll(trRegex)];
const serviceRows = [];
for (const m of allRows) {
    const tcMatch = m[0].match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || [];
    if (tcMatch.length < 5) continue;
    const firstCellText = paragraphText(tcMatch[0]).trim();
    if (/^\d+\.?$/.test(firstCellText)) {
        serviceRows.push({ row: m[0], no: firstCellText });
    }
}

console.log(`\n${serviceRows.length} hardcoded hizmet satırı bulundu.`);
serviceRows.forEach(s => {
    const tcs = s.row.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || [];
    const cellTexts = tcs.map(c => paragraphText(c).trim()).join(" | ");
    console.log(`  ${s.no} → "${cellTexts.slice(0, 100)}"`);
});

if (serviceRows.length > 0) {
    const rowPlaceholders = ["{no}", "{hizmet_adi}", "{adet}", "{birim_fiyat}", "{toplam_fiyat}"];
    const firstRow = serviceRows[0].row;
    const newFirstRow = rewriteCellsInRow(firstRow, rowPlaceholders);
    doc = doc.replace(firstRow, newFirstRow);
    // Diğer satırları sil
    for (let i = 1; i < serviceRows.length; i++) {
        doc = doc.replace(serviceRows[i].row, "");
    }
    console.log(`✓ ${serviceRows.length} hizmet satırı → 1 template satırına indirildi (placeholder'larla).`);
}

// 1c) {toplam_iskonto} placeholder'ı run split nedeniyle bozulmuş — düzelt
doc = transformParagraphs(doc, (p, text) => {
    const trimmed = text.trim();
    if (/^\{?\s*toplam\s*_?\s*iskonto\s*\}?$/.test(trimmed) && trimmed !== "{toplam_iskonto}") {
        console.log(`✓ Bozuk placeholder onarıldı: "${trimmed}" → "{toplam_iskonto}"`);
        return collapseParagraphTo(p, "{toplam_iskonto}");
    }
    return null;
});

zip.file("word/document.xml", doc);

// ─── 2) header1.xml ──────────────────────────────────────────────────────────
let hdr1 = await zip.file("word/header1.xml").async("string");

hdr1 = transformParagraphs(hdr1, (p, text) => {
    const trimmed = text.trim();
    if (trimmed === "DENEY RAPORU") {
        console.log(`\n✓ Header başlık: "DENEY RAPORU" → "Fiyat Teklifi"`);
        return collapseParagraphTo(p, "Fiyat Teklifi");
    }
    if (trimmed === "{{RaporNo}}" || trimmed === "{RaporNo}") {
        console.log(`✓ Header placeholder: "${trimmed}" → "{teklif_no}"`);
        return collapseParagraphTo(p, "{teklif_no}");
    }
    if (trimmed === "{{MM-YY}}" || trimmed === "{MM-YY}") {
        console.log(`✓ Header tarih placeholder: "${trimmed}" → "{teklif_tarihi}"`);
        return collapseParagraphTo(p, "{teklif_tarihi}");
    }
    if (/^Rapor\s*No\s*\/\s*Rev\s*[:：]\s*\d+\s*\/\s*\d+$/i.test(trimmed)) {
        console.log(`✓ Header sabit teklif no satırı dinamikleştirildi`);
        return collapseParagraphTo(p, "Teklif No / Rev: {teklif_no} / {revizyon_no}");
    }
    return null;
});

zip.file("word/header1.xml", hdr1);

// ─── 3) footer1/footer2 — "Oğuzhan EKER" → {teklifi_veren} ───────────────────
for (const fp of ["word/footer1.xml", "word/footer2.xml"]) {
    const f = zip.file(fp);
    if (!f) continue;
    let fxml = await f.async("string");
    fxml = transformParagraphs(fxml, (p, text) => {
        if (text.trim() === "Oğuzhan EKER") {
            console.log(`✓ ${fp}: "Oğuzhan EKER" → "{teklifi_veren}"`);
            return collapseParagraphTo(p, "{teklifi_veren}");
        }
        return null;
    });
    zip.file(fp, fxml);
}

// ─── 4) Kaydet ───────────────────────────────────────────────────────────────
const outBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(DST, outBuf);
console.log(`\n✅ Yeni şablon yazıldı: ${DST} (${outBuf.length} byte)`);
