// ─────────────────────────────────────────────────────────────────────────────
// Validasyon Protokolü DOCX Üretimi
//
// public/templates/Validasyon-Plani-Template.docx içine yerleştirilen
// docxtemplater placeholder'larını validasyon config'inden doldurur.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { sortValidationParameters } from "@/types/validation";

interface ValidationLike {
    code?: string;
    title?: string;
    method_code?: string;
    method_name?: string;
    technique?: string;
    matrix?: string;
    study_type?: string;
    planned_start_date?: string | Date | null;
    planned_end_date?: string | Date | null;
    personnel?: string[] | string;
    config?: {
        description?: string;
        methodSource?: string;
        devices?: Array<{ code?: string; name: string }>;
        personnel?: Array<{ name: string; role?: string }>;
        parameters?: Array<{ id: string; name: string; isEnabled: boolean; note?: string }>;
        moduleData?: Record<string, Record<string, unknown>>;
    } | null;
}

const PARAMETER_LABEL: Record<string, string> = {
    selectivity: "Seçicilik / Spesifiklik",
    linearity: "Doğrusallık (Linearity)",
    lod: "LOD (Tespit Limiti)",
    loq: "LOQ (Tayin Limiti)",
    precision_repeatability: "Kesinlik (Tekrarlanabilirlik)",
    trueness: "Gerçeklik (Bias / Geri Kazanım)",
    precision_reproducibility: "Kesinlik (Tekrarüretilebilirlik)",
    robustness: "Sağlamlık (Robustness)",
};

const PARAMETER_DESIGN: Record<string, string> = {
    selectivity: "Matriks etkisi araştırılır; matriks içerisinde analit varlığında ve yokluğunda elde edilen sinyaller karşılaştırılır.",
    linearity: "En az 5 farklı konsantrasyon seviyesinde, her seviyede en az 3 paralel okuma ile kalibrasyon eğrisi oluşturulur.",
    lod: "Sinyal/gürültü (S/N) yaklaşımı veya kalibrasyon eğrisi standart sapması üzerinden 3,3·σ/S formülü ile hesaplanır.",
    loq: "Sinyal/gürültü (S/N) yaklaşımı veya kalibrasyon eğrisi standart sapması üzerinden 10·σ/S formülü ile hesaplanır.",
    precision_repeatability: "2 analist tarafından 6'şar adet spike edilmiş test örneği ve paralel örnek ile, aynı gün, aynı cihaz ve aynı koşullarda çalışılır.",
    trueness: "Bilinen konsantrasyonda spike edilmiş örnekler ile geri kazanım (% recovery) çalışması yapılır.",
    precision_reproducibility: "Farklı analist, farklı gün, aynı cihaz koşulu altında 6 ardışık günde her gün 2 paralel okuma alınır.",
    robustness: "Metot parametrelerinde küçük değişiklikler (sıcaklık, akış hızı, pH vb.) yapılarak sonuçlar karşılaştırılır.",
};

const PARAMETER_CRITERIA: Record<string, string> = {
    selectivity: "Matriks bileşenlerinden kaynaklı girişim < %10",
    linearity: "Korelasyon katsayısı R² ≥ 0,995",
    lod: "S/N ≥ 3",
    loq: "S/N ≥ 10",
    precision_repeatability: "(x1 - x2) ≤ r ve %RSDr Horwitz limitinin altında",
    trueness: "Geri kazanım %80 - %120 aralığında",
    precision_reproducibility: "Ftest > 1 ve Ftest < Fkritik",
    robustness: "Tüm değişiklik koşullarında %RSD ≤ kabul edilen sınır",
};

const STUDY_TYPE_LABEL: Record<string, string> = {
    FULL_VALIDATION: "Tam Validasyon (Standart olmayan metot)",
    VERIFICATION: "Verifikasyon / Doğrulama (Standart metot)",
    REVISION: "Kısmi Validasyon (Metot modifikasyonu)",
};

// Postgres DATE alanı driver'dan JS Date olarak geliyor; SELECT sonucu da ISO string olabilir.
// İkisini de güvenli şekilde GG.AA.YYYY'ye (Europe/Istanbul) çeviriyoruz.
const istanbulDateFormatter = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});

const fmtDate = (value?: string | Date | null) => {
    if (!value) return "";
    if (value instanceof Date) {
        if (isNaN(value.getTime())) return "";
        return istanbulDateFormatter.format(value);
    }
    const s = String(value);
    // "YYYY-MM-DD…" ile başlayan stringleri TZ kaymasını bypass etmek için doğrudan çevir.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return istanbulDateFormatter.format(d);
};

const dateRange = (start?: string | Date | null, end?: string | Date | null) => {
    const s = fmtDate(start);
    const e = fmtDate(end);
    if (s && e) return `${s} - ${e}`;
    return s || e || "";
};

// Validasyon listesinde gösterilen kod ile birebir aynı türetme — kayıtlı kod
// {method_code}-Ek.X formatına uyuyorsa onu kullan, uymuyorsa method_code'dan üret.
// (Legacy VAL-2026-XXX kodlu satırlar otomatik olarak "K.SOP.XX-Ek.1" gibi gösterilir.)
const deriveDisplayCode = (validation: ValidationLike): string => {
    const methodCode = String(validation.method_code || "").trim();
    const savedCode = String(validation.code || "").trim();
    if (methodCode) {
        const escapedMethod = methodCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const ekPattern = new RegExp(`^${escapedMethod}-Ek\\.\\d+$`, "i");
        if (ekPattern.test(savedCode)) return savedCode;
        return `${methodCode}-Ek.1`;
    }
    return savedCode;
};

const joinList = (items: string[]) => Array.from(new Set(items.map(s => s.trim()).filter(Boolean))).join(", ");

const personnelList = (validation: ValidationLike) => {
    const fromConfig = (validation.config?.personnel || []).map(p => p.name);
    if (fromConfig.length > 0) return joinList(fromConfig);
    if (Array.isArray(validation.personnel)) return joinList(validation.personnel);
    return "";
};

const devicesList = (validation: ValidationLike) =>
    joinList((validation.config?.devices || []).map(d => (d.code ? `${d.code} - ${d.name}` : d.name)));

export interface BuildValidationProtocolOptions {
    studyType?: string;
}

export function buildValidationProtocolDocx(validation: ValidationLike, options: BuildValidationProtocolOptions = {}): Buffer {
    const templatePath = path.join(process.cwd(), "public", "templates", "Validasyon-Plani-Template.docx");
    if (!fs.existsSync(templatePath)) {
        throw new Error("Validasyon planı şablonu bulunamadı: " + templatePath);
    }
    const content = fs.readFileSync(templatePath);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{", end: "}" },
    });

    const studyType = options.studyType || validation.study_type || "FULL_VALIDATION";
    const studyTypeNorm = String(studyType).toUpperCase();

    const analizKodAdi = [
        deriveDisplayCode(validation),
        (validation.method_name || validation.title || "").replace(/\s+Validasyonu\s*$/i, "").trim(),
    ].filter(Boolean).join(" / ");

    const methodSource = validation.config?.methodSource || validation.method_code || "";

    const parameters = sortValidationParameters(
        (validation.config?.parameters || []).filter(p => p.isEnabled && p.id !== "accuracy"),
    );

    const paramRows = parameters.map(p => ({
        parametreAdi: PARAMETER_LABEL[p.id] || p.name,
        deneySeti: p.note?.trim() || PARAMETER_DESIGN[p.id] || "",
        hedefKabul: PARAMETER_CRITERIA[p.id] || "",
    }));

    doc.render({
        analizKodAdi,
        metotKaynagi: methodSource,
        validasyonSebebi: STUDY_TYPE_LABEL[studyTypeNorm] || studyType,
        planlananTarih: dateRange(validation.planned_start_date, validation.planned_end_date),
        personel: personnelList(validation),
        matriks: validation.matrix || "",
        cihazlar: devicesList(validation),
        cbTam: studyTypeNorm === "FULL_VALIDATION" ? "x" : " ",
        cbVerifikasyon: studyTypeNorm === "VERIFICATION" ? "x" : " ",
        cbKismi: studyTypeNorm === "REVISION" ? "x" : " ",
        parameters: paramRows,
    });

    const out = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
    return out;
}
