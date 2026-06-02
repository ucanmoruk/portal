// ─────────────────────────────────────────────────────────────────────────────
// Hamveri (EN 71-1) Yazdırma — Ç.01.PR.19 Tanımlama ve Ham Veri Çizelgesi
//
// public/templates/Hamveri-Template.docx üst (logo + doküman bilgileri) ve alt
// (imza kutuları) bölümlerini hazır içeriyor. Aradaki {@content} placeholder'ı
// burada üretilen dinamik OOXML ile değiştirilir:
//   • Numune Bilgileri tablosu (rapor no, ürün, marka, standart, yaş grubu, …)
//   • Atanan Testler tablosu (#, Madde, Yöntem, Ölçülen Değer, Karar)
//   • İsteğe bağlı notlar paragrafı
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export interface HamveriRecord {
    code: string;
    sample_name: string;
    standard?: string | null;
    toy_category?: string | null;
    age_group?: string | null;
    status?: string | null;
    product_data?: {
        reportNo?: string;
        productName?: string;
        brand?: string;
        materials?: string[];
        purpose?: string;
        notes?: string;
        ageGroup?: "under36" | "over36" | "";
        criticalAges?: { under10?: boolean; under18?: boolean; under8?: boolean };
        selectedRequirements?: string[];
    } | null;
    test_data?: {
        selectedTests?: Array<{
            id: string;
            source?: string;
            group?: string;
            title?: string;
            clause?: string;
            method?: string;
            reason?: string;
        }>;
        records?: Record<string, { measuredValue?: string; decision?: string; observation?: string }>;
        stats?: { total?: number; passed?: number; failed?: number; na?: number; waiting?: number };
    } | null;
    created_at?: string | Date | null;
    updated_at?: string | Date | null;
}

// XML 1.0 yasak karakterler — bunlar bir <w:t> içine girerse Word dosyayı
// "bozuk içerik" diye reddeder. Veritabanından gelen alanlarda bazen null byte
// veya kontrol karakteri olabiliyor; burada temizliyoruz.
// İzin verilen: \t (\x09), \n (\x0A), \r (\x0D) + yazdırılabilir karakterler.
const stripInvalidXmlChars = (s: string) =>
    s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

const esc = (value: unknown) =>
    stripInvalidXmlChars(String(value ?? ""))
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

const istanbulDateFormatter = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});

const fmtDate = (value?: string | Date | null) => {
    if (!value) return "";
    if (value instanceof Date) return isNaN(value.getTime()) ? "" : istanbulDateFormatter.format(value);
    const s = String(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : istanbulDateFormatter.format(d);
};

const ageLabel = (group?: string | null) => {
    if (group === "under36") return "0 - 36 Ay";
    if (group === "over36") return "36 Ay ve Üzeri";
    return group || "-";
};

const criticalAgesLabel = (ca?: { under10?: boolean; under18?: boolean; under8?: boolean }) =>
    [ca?.under10 && "10 ay altı", ca?.under18 && "18 ay altı", ca?.under8 && "8 yaş altı"].filter(Boolean).join(", ") || "-";

// ── OOXML yardımcıları ──────────────────────────────────────────────────────
// Stil hedef: A4 sayfa içeriği ~9000 dxa = 159 mm
const PAGE_DXA = 9000;

const para = (text: string, opts: { bold?: boolean; align?: "left" | "center"; size?: number } = {}) => {
    const sz = opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : "";
    const bold = opts.bold ? `<w:b/><w:bCs/>` : "";
    const align = opts.align === "center" ? `<w:jc w:val="center"/>` : "";
    return (
        `<w:p>` +
        `<w:pPr>${align}<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0"/><w:rPr>${bold}${sz}</w:rPr></w:pPr>` +
        `<w:r><w:rPr>${bold}${sz}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` +
        `</w:p>`
    );
};

const tcBorders =
    `<w:tcBorders>` +
    `<w:top w:val="single" w:sz="4" w:color="BCC6D1"/>` +
    `<w:left w:val="single" w:sz="4" w:color="BCC6D1"/>` +
    `<w:bottom w:val="single" w:sz="4" w:color="BCC6D1"/>` +
    `<w:right w:val="single" w:sz="4" w:color="BCC6D1"/>` +
    `</w:tcBorders>`;

const cell = (
    text: string | string[],
    opts: { width: number; bold?: boolean; bg?: string; align?: "left" | "center"; size?: number } = { width: 1000 },
) => {
    const shd = opts.bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.bg}"/>` : "";
    const lines = Array.isArray(text) ? text : [text];
    const paras = lines.map(line => para(line, { bold: opts.bold, align: opts.align, size: opts.size })).join("");
    return (
        `<w:tc>` +
        `<w:tcPr><w:tcW w:w="${opts.width}" w:type="dxa"/>${tcBorders}${shd}<w:vAlign w:val="center"/></w:tcPr>` +
        paras +
        `</w:tc>`
    );
};

const sectionTitle = (text: string) =>
    `<w:p>` +
    `<w:pPr><w:spacing w:before="240" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:left="0"/><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="0F172A"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` +
    `</w:p>`;

const spacer = () => `<w:p><w:pPr><w:spacing w:after="0" w:line="120" w:lineRule="auto"/><w:ind w:left="0"/></w:pPr></w:p>`;

// 2 sütunlu "etiket — değer" satırı
const labelValueRow = (label: string, value: string) =>
    `<w:tr>` +
    cell(label, { width: 2800, bold: true, bg: "F1F5F9", size: 18 }) +
    cell(value || "-", { width: PAGE_DXA - 2800, size: 18 }) +
    `</w:tr>`;

const labelValueTable = (rows: Array<[string, string]>) =>
    `<w:tbl>` +
    `<w:tblPr><w:tblW w:w="${PAGE_DXA}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="${PAGE_DXA - 2800}"/></w:tblGrid>` +
    rows.map(([l, v]) => labelValueRow(l, v)).join("") +
    `</w:tbl>`;

// Atanan testler tablosu
const TESTS_COLS = [600, 1100, 2700, 2900, 1700]; // toplam = 9000
const testsHeader = () =>
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    cell("#", { width: TESTS_COLS[0], bold: true, bg: "0F172A", align: "center", size: 18 }).replace("</w:tcPr>", `<w:rPr><w:color w:val="FFFFFF"/></w:rPr></w:tcPr>`) +
    cell("Madde", { width: TESTS_COLS[1], bold: true, bg: "0F172A", align: "center", size: 18 }) +
    cell("Yöntem", { width: TESTS_COLS[2], bold: true, bg: "0F172A", align: "center", size: 18 }) +
    cell("Ölçülen / Açıklama", { width: TESTS_COLS[3], bold: true, bg: "0F172A", align: "center", size: 18 }) +
    cell("Karar", { width: TESTS_COLS[4], bold: true, bg: "0F172A", align: "center", size: 18 }) +
    `</w:tr>`;

// Beyaz başlık metni için cell helper'ını override edelim — bgda 0F172A iken metin
// beyaz olmalı. Üstteki replace yamasını basit tutmak için ayrı bir helper:
const headerCell = (text: string, width: number) =>
    `<w:tc>` +
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${tcBorders}<w:shd w:val="clear" w:color="auto" w:fill="0F172A"/><w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:rPr><w:b/><w:bCs/><w:color w:val="FFFFFF"/><w:sz w:val="18"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="FFFFFF"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` +
    `</w:p>` +
    `</w:tc>`;

const testsHeaderRow = () =>
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    headerCell("#", TESTS_COLS[0]) +
    headerCell("Madde", TESTS_COLS[1]) +
    headerCell("Yöntem", TESTS_COLS[2]) +
    headerCell("Ölçülen / Açıklama", TESTS_COLS[3]) +
    headerCell("Karar", TESTS_COLS[4]) +
    `</w:tr>`;

const decisionFill = (decision: string) => {
    if (decision === "Geçti") return "DCFCE7";
    if (decision === "Kaldı") return "FEE2E2";
    if (decision === "N/A") return "F1F5F9";
    return "FEF3C7";
};

const testRow = (index: number, row: {
    clause?: string;
    method?: string;
    title?: string;
    measuredValue?: string;
    decision?: string;
}) =>
    `<w:tr>` +
    cell(String(index + 1), { width: TESTS_COLS[0], align: "center", size: 18 }) +
    cell(row.clause || "-", { width: TESTS_COLS[1], size: 18 }) +
    cell([row.title || "-", row.method ? `(${row.method})` : ""].filter(Boolean), { width: TESTS_COLS[2], size: 18 }) +
    cell(row.measuredValue || "-", { width: TESTS_COLS[3], size: 18 }) +
    cell(row.decision || "Bekliyor", {
        width: TESTS_COLS[4],
        align: "center",
        bold: true,
        bg: decisionFill(row.decision || "Bekliyor"),
        size: 18,
    }) +
    `</w:tr>`;

const testsTable = (rows: Array<{ clause?: string; method?: string; title?: string; measuredValue?: string; decision?: string }>) => {
    if (rows.length === 0) {
        return (
            `<w:tbl>` +
            `<w:tblPr><w:tblW w:w="${PAGE_DXA}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0"/></w:tblPr>` +
            `<w:tblGrid>${TESTS_COLS.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
            testsHeaderRow() +
            `<w:tr>` +
            cell("Atanmış test bulunmuyor.", { width: PAGE_DXA, align: "center", size: 18 }) +
            `</w:tr>` +
            `</w:tbl>`
        );
    }
    return (
        `<w:tbl>` +
        `<w:tblPr><w:tblW w:w="${PAGE_DXA}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0"/></w:tblPr>` +
        `<w:tblGrid>${TESTS_COLS.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
        testsHeaderRow() +
        rows.map((r, i) => testRow(i, r)).join("") +
        `</w:tbl>`
    );
};

const notesBlock = (notes: string) =>
    sectionTitle("Notlar") +
    `<w:p>` +
    `<w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/><w:ind w:left="0"/><w:pBdr><w:top w:val="single" w:sz="4" w:color="E2E8F0"/><w:left w:val="single" w:sz="4" w:color="E2E8F0"/><w:bottom w:val="single" w:sz="4" w:color="E2E8F0"/><w:right w:val="single" w:sz="4" w:color="E2E8F0"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/><w:rPr><w:sz w:val="18"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(notes)}</w:t></w:r>` +
    `</w:p>`;

// ── Public builder ──────────────────────────────────────────────────────────
export function buildHamveriDocx(record: HamveriRecord): Buffer {
    const templatePath = path.join(process.cwd(), "public", "templates", "Hamveri-Template.docx");
    if (!fs.existsSync(templatePath)) {
        throw new Error("Hamveri şablonu bulunamadı: " + templatePath);
    }
    const buffer = fs.readFileSync(templatePath);
    const zip = new PizZip(buffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: "{", end: "}" } });

    const pd = record.product_data || {};
    const td = record.test_data || {};
    const tests = (td.selectedTests || []).map(t => ({
        clause: t.clause,
        method: t.method,
        title: t.title,
        measuredValue: td.records?.[t.id]?.measuredValue || "",
        decision: td.records?.[t.id]?.decision || "Bekliyor",
    }));
    const stats = td.stats || {
        total: tests.length,
        passed: tests.filter(t => t.decision === "Geçti").length,
        failed: tests.filter(t => t.decision === "Kaldı").length,
        na: tests.filter(t => t.decision === "N/A").length,
        waiting: tests.filter(t => t.decision === "Bekliyor").length,
    };

    const requirements = Array.isArray(pd.selectedRequirements) && pd.selectedRequirements.length > 0
        ? pd.selectedRequirements.join(", ")
        : (record.toy_category || "-");

    const numuneRows: Array<[string, string]> = [
        ["Rapor No", record.code || pd.reportNo || "-"],
        ["Ürün Adı", record.sample_name || pd.productName || "-"],
        ["Marka / Model", pd.brand || "-"],
        ["Standart", record.standard || "EN 71-1:2026"],
        ["Yaş Grubu", record.age_group || ageLabel(pd.ageGroup)],
        ["Kritik Yaş Kırılımları", criticalAgesLabel(pd.criticalAges)],
        ["Malzeme Bileşimi", (pd.materials || []).join(", ") || "-"],
        ["Kullanım Amacı", pd.purpose || "-"],
        ["Tip / Fonksiyon (Gereklilik)", requirements],
        ["Durum", record.status || "-"],
        ["Hazırlanma Tarihi", fmtDate(record.created_at)],
    ];

    const statsRows: Array<[string, string]> = [
        ["Toplam", String(stats.total ?? 0)],
        ["Geçti", String(stats.passed ?? 0)],
        ["Kaldı", String(stats.failed ?? 0)],
        ["N/A", String(stats.na ?? 0)],
        ["Bekliyor", String(stats.waiting ?? 0)],
    ];

    const middle =
        sectionTitle("Numune Bilgileri") +
        labelValueTable(numuneRows) +
        sectionTitle("Test Özeti") +
        labelValueTable(statsRows) +
        sectionTitle("Atanan Testler") +
        testsTable(tests) +
        (pd.notes && pd.notes.trim() ? notesBlock(pd.notes.trim()) : "") +
        spacer();

    doc.render({ content: middle });

    // Serverless ortamda Buffer ↔ Uint8Array dönüşümleri sırasında body
    // bozulabiliyor; doğrudan Uint8Array üret ve onu Buffer.from ile sarıp dön.
    const u8 = doc.getZip().generate({ type: "uint8array", compression: "DEFLATE" }) as Uint8Array;
    return Buffer.from(u8);
}
