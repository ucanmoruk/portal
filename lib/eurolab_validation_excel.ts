import * as XLSX from "xlsx";

/**
 * Eurolab Validasyon — Excel Şablonu (Build & Parse)
 *
 * Tek XLSX dosyası, çok sayfa (sheet):
 *  - Bilgi: protokol özeti + kullanım talimatı (read-only / referans)
 *  - LOD-LOQ
 *  - Lineerlik
 *  - Tekrarlanabilirlik
 *  - Tekrar-Uretilebilirlik
 *  - Gerceklik
 *
 * Sadece protokolde aktif olan parametrelerin sayfası eklenir.
 *
 * Her sayfanın A1 hücresi `__META__` ve B1 type değerini içerir; parser bu
 * marker'a göre sayfanın hangi modüle ait olduğunu anlar.
 *
 * Import davranışı: SADECE DOLU hücreler yazılır; boş hücreler mevcut
 * `config.moduleData[type][component]` üzerine yazmaz (merge).
 */

export type ModuleType =
    | "LOD_LOQ"
    | "LINEARITY"
    | "PRECISION_REPEATABILITY"
    | "PRECISION_REPRODUCIBILITY"
    | "TRUENESS";

// Sheet name (TR) <-> module type
export const SHEET_NAME_BY_TYPE: Record<ModuleType, string> = {
    LOD_LOQ: "LOD-LOQ",
    LINEARITY: "Lineerlik",
    PRECISION_REPEATABILITY: "Tekrarlanabilirlik",
    PRECISION_REPRODUCIBILITY: "Tekrar-Uretilebilirlik",
    TRUENESS: "Gerceklik",
};

const TYPE_BY_SHEET_NAME: Record<string, ModuleType> = Object.fromEntries(
    Object.entries(SHEET_NAME_BY_TYPE).map(([type, name]) => [name, type as ModuleType])
);

// Parametre id (protokoldeki) -> modül type
const PARAM_TO_MODULE: Record<string, ModuleType> = {
    lod: "LOD_LOQ",
    loq: "LOD_LOQ",
    linearity: "LINEARITY",
    precision_repeatability: "PRECISION_REPEATABILITY",
    precision_reproducibility: "PRECISION_REPRODUCIBILITY",
    trueness: "TRUENESS",
};

const META_MARKER = "__META__";
const COMPONENT_PREFIX = "::Komponent";
const UNIT_PREFIX = "::Birim";
const NOTES_PREFIX = "::Notlar";
const REPLICATES_PREFIX = "::Replicate";
const PARALLEL_PREFIX = "::Paralel";
const LEVEL_COUNT_PREFIX = "::DuzeySayisi";
const LEVEL_PREFIX = "::Duzey";
const MATRIX_PREFIX = "::Matriks";
const TARGET_PREFIX = "::Hedef";

const getLevelLabel = (index: number, total: number) => {
    if (total === 1) return "1. Düzey";
    if (total === 2) return index === 0 ? "Düşük Seviye" : "Yüksek Seviye";
    return ["Düşük Seviye", "Orta Seviye", "Yüksek Seviye"][index] || `${index + 1}. Düzey`;
};

// =============================================================================
// Türler
// =============================================================================

interface ValidationLike {
    id: number;
    code?: string;
    title?: string;
    method_code?: string;
    method_name?: string;
    technique?: string;
    matrix?: string;
    personnel?: string[] | string;
    config?: {
        components?: Array<{ name?: string }>;
        personnel?: Array<{ name?: string }>;
        parameters?: Array<{ id: string; name: string; isEnabled: boolean }>;
        moduleData?: Record<string, Record<string, any>>;
    };
}

// =============================================================================
// Protokol bağlamı
// =============================================================================

function getProtocolContext(validation: ValidationLike) {
    const config = validation.config || {};
    const componentNames = (config.components || [])
        .map(c => String(c?.name || "").trim())
        .filter(Boolean);
    const components = componentNames.length > 0 ? componentNames : ["Genel"];

    const personnelFromConfig = (config.personnel || [])
        .map(p => String(p?.name || "").trim())
        .filter(Boolean);
    const personnelFromMethod = Array.isArray(validation.personnel)
        ? validation.personnel.map(p => String(p || "").trim()).filter(Boolean)
        : [];
    const dedup = (arr: string[]) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const v of arr) {
            const k = v.toLocaleLowerCase("tr-TR");
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(v);
        }
        return out;
    };
    const personnelRaw = personnelFromConfig.length > 0 ? personnelFromConfig : personnelFromMethod;
    const personnel = dedup(personnelRaw.length > 0 ? personnelRaw : ["Analist"]);

    const parameters = config.parameters || [];
    const activeModules = new Set<ModuleType>();
    for (const p of parameters) {
        if (!p.isEnabled) continue;
        const t = PARAM_TO_MODULE[p.id];
        if (t) activeModules.add(t);
    }

    const moduleData = config.moduleData || {};

    return { components, personnel, parameters, activeModules, moduleData };
}

// =============================================================================
// BUILD
// =============================================================================

export function buildValidationWorkbook(validation: ValidationLike): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();
    const ctx = getProtocolContext(validation);

    XLSX.utils.book_append_sheet(
        wb,
        buildInfoSheet(validation, ctx),
        "Bilgi"
    );

    if (ctx.activeModules.has("LOD_LOQ")) {
        XLSX.utils.book_append_sheet(
            wb,
            buildLodLoqSheet(ctx.components, ctx.personnel, ctx.moduleData.LOD_LOQ || {}),
            SHEET_NAME_BY_TYPE.LOD_LOQ
        );
    }
    if (ctx.activeModules.has("LINEARITY")) {
        XLSX.utils.book_append_sheet(
            wb,
            buildLinearitySheet(ctx.components, ctx.moduleData.LINEARITY || {}),
            SHEET_NAME_BY_TYPE.LINEARITY
        );
    }
    if (ctx.activeModules.has("PRECISION_REPEATABILITY")) {
        XLSX.utils.book_append_sheet(
            wb,
            buildRepeatabilitySheet(ctx.components, ctx.personnel, ctx.moduleData.PRECISION_REPEATABILITY || {}),
            SHEET_NAME_BY_TYPE.PRECISION_REPEATABILITY
        );
    }
    if (ctx.activeModules.has("PRECISION_REPRODUCIBILITY")) {
        XLSX.utils.book_append_sheet(
            wb,
            buildReproducibilitySheet(ctx.components, ctx.personnel, ctx.moduleData.PRECISION_REPRODUCIBILITY || {}),
            SHEET_NAME_BY_TYPE.PRECISION_REPRODUCIBILITY
        );
    }
    if (ctx.activeModules.has("TRUENESS")) {
        XLSX.utils.book_append_sheet(
            wb,
            buildTruenessSheet(ctx.components, ctx.personnel, ctx.moduleData.TRUENESS || {}),
            SHEET_NAME_BY_TYPE.TRUENESS
        );
    }

    return wb;
}

function buildInfoSheet(validation: ValidationLike, ctx: ReturnType<typeof getProtocolContext>) {
    const enabledParams = ctx.parameters.filter(p => p.isEnabled).map(p => p.name);
    const rows: any[][] = [
        ["Validasyon Şablonu"],
        [],
        ["Kod", validation.code || `VAL-${validation.id}`],
        ["Başlık", validation.title || ""],
        ["Metot Kodu", validation.method_code || ""],
        ["Metot", validation.method_name || ""],
        ["Teknik", validation.technique || ""],
        ["Matriks", validation.matrix || ""],
        ["Komponentler", ctx.components.join(", ")],
        ["Personel", ctx.personnel.join(", ")],
        ["Aktif Parametreler", enabledParams.join(", ") || "—"],
        [],
        ["Kullanım Talimatı"],
        ["1. Her parametrenin kendi sayfasında veri girişi yapın."],
        ["2. A1 hücresindeki __META__ satırını DEĞİŞTİRMEYİN — import için gereklidir."],
        ["3. Boş bıraktığınız hücreler sisteme yüklenmez (mevcut veri korunur)."],
        ["4. Komponent başlıklarını (::Komponent), birim (::Birim), notlar (::Notlar) gibi etiketleri silmeyin."],
        ["5. Birim değerleri: mg_L, ug_L, ng_L, mg_kg, ug_kg, percent, conc (veya abs - sadece Lineerlik)."],
        ["6. Sayısal değerlerde nokta veya virgül kullanabilirsiniz (örn. 12.5 veya 12,5)."],
    ];
    return XLSX.utils.aoa_to_sheet(rows);
}

// -----------------------------------------------------------------------------
// LOD-LOQ
// -----------------------------------------------------------------------------

function buildLodLoqSheet(components: string[], personnel: string[], existing: Record<string, any>) {
    const rows: any[][] = [];
    rows.push([META_MARKER, "type=LOD_LOQ"]);
    rows.push([]);

    for (const comp of components) {
        const data = existing[comp] || {};
        rows.push([COMPONENT_PREFIX, comp]);
        rows.push([UNIT_PREFIX, data.unit || "mg_L"]);
        rows.push([NOTES_PREFIX, data.notes || ""]);
        rows.push([]);

        // Header
        rows.push(["#", ...personnel]);

        // Data (10 rows minimum, expand if existing has more)
        const existingRows: string[][] = Array.isArray(data.rows) ? data.rows : [];
        const rowCount = Math.max(10, existingRows.length);
        for (let i = 0; i < rowCount; i++) {
            const dataRow = existingRows[i] || [];
            const cells: any[] = [i + 1];
            for (let j = 0; j < personnel.length; j++) {
                cells.push(dataRow[j] || "");
            }
            rows.push(cells);
        }

        rows.push([]);
        rows.push([]);
    }

    return XLSX.utils.aoa_to_sheet(rows);
}

// -----------------------------------------------------------------------------
// Lineerlik
// -----------------------------------------------------------------------------

function buildLinearitySheet(components: string[], existing: Record<string, any>) {
    // Tüm komponentlerin replicate sayısı aynıdır (form böyle çalışıyor)
    const firstExisting = Object.values(existing)[0] as any;
    const replicates = Math.max(1, Number(firstExisting?.replicates) || 1);

    const rows: any[][] = [];
    rows.push([META_MARKER, "type=LINEARITY"]);
    rows.push([]);
    rows.push([REPLICATES_PREFIX, replicates]);
    rows.push([]);

    for (const comp of components) {
        const data = existing[comp] || {};
        rows.push([COMPONENT_PREFIX, comp]);
        rows.push([UNIT_PREFIX, data.unit || "mg_L"]);
        rows.push([NOTES_PREFIX, data.notes || ""]);
        rows.push([]);

        // Header
        const header: any[] = ["Seviye"];
        for (let r = 0; r < replicates; r++) header.push(`Konsantrasyon ${r + 1}`);
        for (let r = 0; r < replicates; r++) header.push(`Cevap ${r + 1}`);
        rows.push(header);

        const existingRows: any[] = Array.isArray(data.rows) ? data.rows : [];
        const rowCount = Math.max(5, existingRows.length);
        for (let i = 0; i < rowCount; i++) {
            const dataRow = existingRows[i] || {};
            const level: string = dataRow.level || `L${i + 1}`;
            const concs: string[] = Array.isArray(dataRow.concentrations) ? dataRow.concentrations : [];
            const resps: string[] = Array.isArray(dataRow.responses) ? dataRow.responses : [];

            const cells: any[] = [level];
            for (let r = 0; r < replicates; r++) cells.push(concs[r] || "");
            for (let r = 0; r < replicates; r++) cells.push(resps[r] || "");
            rows.push(cells);
        }

        rows.push([]);
        rows.push([]);
    }

    return XLSX.utils.aoa_to_sheet(rows);
}

// -----------------------------------------------------------------------------
// Tekrarlanabilirlik
// -----------------------------------------------------------------------------

function buildRepeatabilitySheet(components: string[], personnel: string[], existing: Record<string, any>) {
    const firstExisting = Object.values(existing)[0] as any;
    const parallelCount = Math.max(2, Number(firstExisting?.parallelCount) || 6);
    const levelCount = Math.max(1, Math.min(3, Number(firstExisting?.levelCount) || 2));

    const rows: any[][] = [];
    rows.push([META_MARKER, "type=PRECISION_REPEATABILITY"]);
    rows.push([]);
    rows.push([PARALLEL_PREFIX, parallelCount]);
    rows.push([LEVEL_COUNT_PREFIX, levelCount]);
    rows.push([]);

    for (const comp of components) {
        const data = existing[comp] || {};
        rows.push([COMPONENT_PREFIX, comp]);
        rows.push([UNIT_PREFIX, data.unit || "mg_L"]);
        rows.push([NOTES_PREFIX, data.notes || ""]);
        rows.push([]);

        const targets: Record<string, string> = data.targets || {};
        const matrices: Record<string, string> = data.matrices || {};
        const rawData: Record<string, Record<string, string[][]>> = data.rawData || {};

        for (let lvlIdx = 0; lvlIdx < levelCount; lvlIdx++) {
            const lvlKey = `level-${lvlIdx}`;
            const lvlLabel = getLevelLabel(lvlIdx, levelCount);

            rows.push([LEVEL_PREFIX, lvlLabel]);
            rows.push([MATRIX_PREFIX, matrices[lvlKey] || ""]);
            rows.push([TARGET_PREFIX, targets[lvlKey] || ""]);
            rows.push([]);

            // Header: # | Analist1-Par1 | Analist1-Par2 | Analist2-Par1 | Analist2-Par2 | ...
            const header: any[] = ["#"];
            for (const person of personnel) {
                header.push(`${person} - Paralel 1`);
                header.push(`${person} - Paralel 2`);
            }
            rows.push(header);

            for (let r = 0; r < parallelCount; r++) {
                const cells: any[] = [r + 1];
                for (const person of personnel) {
                    const grid = rawData[lvlKey]?.[person] || [];
                    cells.push(grid[r]?.[0] || "");
                    cells.push(grid[r]?.[1] || "");
                }
                rows.push(cells);
            }

            rows.push([]);
        }

        rows.push([]);
    }

    return XLSX.utils.aoa_to_sheet(rows);
}

// -----------------------------------------------------------------------------
// Tekrar Uretilebilirlik
// -----------------------------------------------------------------------------

function buildReproducibilitySheet(components: string[], personnel: string[], existing: Record<string, any>) {
    const firstExisting = Object.values(existing)[0] as any;
    const parallelCount = Math.max(2, Number(firstExisting?.parallelCount) || 6);
    const analystsForBuild = personnel.length >= 2 ? personnel : [...personnel, ...Array(2 - personnel.length).fill("").map((_, i) => `Analist ${personnel.length + i + 1}`)];

    const rows: any[][] = [];
    rows.push([META_MARKER, "type=PRECISION_REPRODUCIBILITY"]);
    rows.push([]);
    rows.push([PARALLEL_PREFIX, parallelCount]);
    rows.push([]);

    for (const comp of components) {
        const data = existing[comp] || {};
        rows.push([COMPONENT_PREFIX, comp]);
        rows.push([UNIT_PREFIX, data.unit || "mg_L"]);
        rows.push([NOTES_PREFIX, data.notes || ""]);
        rows.push([]);

        // Header: # | Tarih | Analist1 | Analist2 ...
        rows.push(["#", "Tarih (YYYY-MM-DD)", ...analystsForBuild]);

        const existingRows: Array<{ date?: string; values?: string[] }> = Array.isArray(data.rows) ? data.rows : [];
        for (let r = 0; r < parallelCount; r++) {
            const row = existingRows[r] || {};
            const values: string[] = Array.isArray(row.values) ? row.values : [];
            const cells: any[] = [r + 1, row.date || ""];
            for (let a = 0; a < analystsForBuild.length; a++) {
                cells.push(values[a] || "");
            }
            rows.push(cells);
        }

        rows.push([]);
        rows.push([]);
    }

    return XLSX.utils.aoa_to_sheet(rows);
}

// -----------------------------------------------------------------------------
// Gerceklik (Trueness)
// -----------------------------------------------------------------------------

function buildTruenessSheet(components: string[], personnel: string[], existing: Record<string, any>) {
    const rows: any[][] = [];
    rows.push([META_MARKER, "type=TRUENESS"]);
    rows.push([]);

    for (const comp of components) {
        const data = existing[comp] || {};
        rows.push([COMPONENT_PREFIX, comp]);
        rows.push([UNIT_PREFIX, data.unit || "mg_L"]);
        rows.push([MATRIX_PREFIX, data.matrix || ""]);
        rows.push([TARGET_PREFIX, data.target || ""]);
        rows.push([NOTES_PREFIX, data.notes || ""]);
        rows.push([]);

        // Header
        rows.push(["#", ...personnel]);

        const existingRows: string[][] = Array.isArray(data.rows) ? data.rows : [];
        const rowCount = Math.max(12, existingRows.length);
        for (let r = 0; r < rowCount; r++) {
            const dataRow = existingRows[r] || [];
            const cells: any[] = [r + 1];
            for (let p = 0; p < personnel.length; p++) {
                cells.push(dataRow[p] || "");
            }
            rows.push(cells);
        }

        rows.push([]);
        rows.push([]);
    }

    return XLSX.utils.aoa_to_sheet(rows);
}

// =============================================================================
// PARSE
// =============================================================================

/**
 * Excel'i parse eder ve sadece dolu hücreleri içeren bir partial moduleData
 * objesi döndürür. Mevcut config.moduleData ile merge'lenmek üzere kullanılır.
 */
export function parseValidationWorkbook(
    buffer: ArrayBuffer | Buffer,
    existing: Record<string, Record<string, any>> = {}
): { moduleData: Record<string, Record<string, any>>; touched: Array<{ type: ModuleType; component: string }> } {
    const wb = XLSX.read(buffer, { type: buffer instanceof ArrayBuffer ? "array" : "buffer" });
    const result: Record<string, Record<string, any>> = {};
    const touched: Array<{ type: ModuleType; component: string }> = [];

    for (const sheetName of wb.SheetNames) {
        const type = TYPE_BY_SHEET_NAME[sheetName];
        if (!type) continue; // Bilgi sayfası ve diğerleri atlanır

        const sheet = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
        if (!aoa.length) continue;

        // META marker kontrolü
        const firstCell = String(aoa[0]?.[0] || "").trim();
        if (firstCell !== META_MARKER) continue;

        const existingForType = existing[type] || {};

        if (type === "LOD_LOQ") {
            const parsed = parseLodLoqSheet(aoa, existingForType);
            if (Object.keys(parsed).length > 0) {
                result[type] = parsed;
                Object.keys(parsed).forEach(c => touched.push({ type, component: c }));
            }
        } else if (type === "LINEARITY") {
            const parsed = parseLinearitySheet(aoa, existingForType);
            if (Object.keys(parsed.components).length > 0) {
                result[type] = parsed.components;
                Object.keys(parsed.components).forEach(c => touched.push({ type, component: c }));
            }
        } else if (type === "PRECISION_REPEATABILITY") {
            const parsed = parseRepeatabilitySheet(aoa, existingForType);
            if (Object.keys(parsed).length > 0) {
                result[type] = parsed;
                Object.keys(parsed).forEach(c => touched.push({ type, component: c }));
            }
        } else if (type === "PRECISION_REPRODUCIBILITY") {
            const parsed = parseReproducibilitySheet(aoa, existingForType);
            if (Object.keys(parsed).length > 0) {
                result[type] = parsed;
                Object.keys(parsed).forEach(c => touched.push({ type, component: c }));
            }
        } else if (type === "TRUENESS") {
            const parsed = parseTruenessSheet(aoa, existingForType);
            if (Object.keys(parsed).length > 0) {
                result[type] = parsed;
                Object.keys(parsed).forEach(c => touched.push({ type, component: c }));
            }
        }
    }

    return { moduleData: result, touched };
}

// Yardımcı: bir hücre dolu mu?
const isFilled = (v: any) =>
    v !== null && v !== undefined && String(v).trim() !== "";

// Yardımcı: hücre değerini string'e dönüştür
const cellStr = (v: any) => isFilled(v) ? String(v).trim() : "";

// İlk hücresi belirli bir prefix ile başlayan ve B sütununda değer içeren satırın değerini al
const matchPrefix = (row: any[], prefix: string): string | null => {
    if (!row || !row.length) return null;
    const first = String(row[0] || "").trim();
    if (first !== prefix) return null;
    return cellStr(row[1]);
};

// -----------------------------------------------------------------------------
// LOD-LOQ parse
// -----------------------------------------------------------------------------

function parseLodLoqSheet(aoa: any[][], existing: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    let i = 0;
    while (i < aoa.length) {
        const row = aoa[i] || [];
        const compName = matchPrefix(row, COMPONENT_PREFIX);
        if (!compName) { i++; continue; }

        // Sonraki satırlarda birim, notlar (sıra esnek)
        let unit = "";
        let notes = "";
        let j = i + 1;
        while (j < aoa.length) {
            const r = aoa[j] || [];
            const first = String(r[0] || "").trim();
            if (first === UNIT_PREFIX) { unit = cellStr(r[1]); j++; continue; }
            if (first === NOTES_PREFIX) { notes = cellStr(r[1]); j++; continue; }
            // Header satırı: "#" ile başlar
            if (first === "#") break;
            // Yeni komponent başlamış olabilir
            if (first === COMPONENT_PREFIX) break;
            j++;
        }

        // Header bulundu mu?
        if (j >= aoa.length || String(aoa[j]?.[0] || "").trim() !== "#") {
            i = j;
            continue;
        }

        const headerRow = aoa[j];
        const personnelCount = Math.max(0, headerRow.length - 1);
        // (personel adlarını verinin sütun sayısı için kullanıyoruz)

        // Data satırlarını oku
        const rows: string[][] = [];
        let k = j + 1;
        while (k < aoa.length) {
            const r = aoa[k] || [];
            const first = String(r[0] || "").trim();
            // Yeni komponent veya yeni meta satırı geldi -> bitir
            if (first === COMPONENT_PREFIX) break;
            // # ile başlayan rakam satırı
            const idx = Number(first);
            if (!Number.isFinite(idx) || idx <= 0) {
                // boş satır veya başka şey
                if (first === "" && r.slice(1).every(v => !isFilled(v))) {
                    k++;
                    continue;
                }
                k++;
                continue;
            }
            const dataRow: string[] = [];
            for (let c = 0; c < personnelCount; c++) {
                dataRow.push(cellStr(r[c + 1]));
            }
            rows.push(dataRow);
            k++;
        }

        // Var olan veriyi al, sadece dolu hücreleri üzerine yaz
        const prev = existing[compName] || {};
        const prevRows: string[][] = Array.isArray(prev.rows) ? prev.rows : [];
        const mergedRows = mergeGrid(prevRows, rows);

        const hasAnyData = mergedRows.some(row => row.some(isFilled));
        const next: any = { ...prev };
        if (unit) next.unit = unit;
        if (notes) next.notes = notes;
        if (mergedRows.length > 0) next.rows = mergedRows;

        // Sadece bir şey dolduğunda yaz
        if (unit || notes || hasAnyData) {
            out[compName] = next;
        } else if (existing[compName]) {
            // var olan verileri koru
            out[compName] = prev;
        }

        i = k;
    }
    return out;
}

// -----------------------------------------------------------------------------
// Lineerlik parse
// -----------------------------------------------------------------------------

function parseLinearitySheet(aoa: any[][], existing: Record<string, any>): { components: Record<string, any> } {
    const out: Record<string, any> = {};

    // Global replicate sayısı
    let replicates = 1;
    for (let i = 0; i < aoa.length; i++) {
        const v = matchPrefix(aoa[i] || [], REPLICATES_PREFIX);
        if (v != null) {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n > 0) replicates = n;
            break;
        }
    }

    let i = 0;
    while (i < aoa.length) {
        const row = aoa[i] || [];
        const compName = matchPrefix(row, COMPONENT_PREFIX);
        if (!compName) { i++; continue; }

        let unit = "";
        let notes = "";
        let j = i + 1;
        while (j < aoa.length) {
            const r = aoa[j] || [];
            const first = String(r[0] || "").trim();
            if (first === UNIT_PREFIX) { unit = cellStr(r[1]); j++; continue; }
            if (first === NOTES_PREFIX) { notes = cellStr(r[1]); j++; continue; }
            if (first === "Seviye") break;
            if (first === COMPONENT_PREFIX) break;
            j++;
        }

        if (j >= aoa.length || String(aoa[j]?.[0] || "").trim() !== "Seviye") {
            i = j;
            continue;
        }

        // Data satırlarını oku
        const rows: Array<{ id: string; level: string; concentrations: string[]; responses: string[] }> = [];
        let k = j + 1;
        while (k < aoa.length) {
            const r = aoa[k] || [];
            const first = String(r[0] || "").trim();
            if (first === COMPONENT_PREFIX) break;
            if (!first) { k++; continue; }
            // Level satırı
            const concentrations: string[] = [];
            const responses: string[] = [];
            for (let c = 0; c < replicates; c++) concentrations.push(cellStr(r[1 + c]));
            for (let c = 0; c < replicates; c++) responses.push(cellStr(r[1 + replicates + c]));
            rows.push({
                id: String(rows.length + 1),
                level: first,
                concentrations,
                responses,
            });
            k++;
        }

        const prev = existing[compName] || {};
        const prevRows: any[] = Array.isArray(prev.rows) ? prev.rows : [];
        const merged = mergeLinearityRows(prevRows, rows);
        const hasAnyData = merged.some(r => r.concentrations.some(isFilled) || r.responses.some(isFilled));

        const next: any = { ...prev };
        next.replicates = replicates;
        if (unit) next.unit = unit;
        if (notes) next.notes = notes;
        if (merged.length > 0) next.rows = merged;

        if (unit || notes || hasAnyData) {
            out[compName] = next;
        } else if (existing[compName]) {
            out[compName] = prev;
        }

        i = k;
    }

    return { components: out };
}

// -----------------------------------------------------------------------------
// Tekrarlanabilirlik parse
// -----------------------------------------------------------------------------

function parseRepeatabilitySheet(aoa: any[][], existing: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};

    // Global parallelCount + levelCount
    let parallelCount = 6;
    let levelCount = 2;
    for (let i = 0; i < aoa.length; i++) {
        const r = aoa[i] || [];
        const first = String(r[0] || "").trim();
        if (first === PARALLEL_PREFIX) {
            const n = parseInt(cellStr(r[1]), 10);
            if (Number.isFinite(n) && n > 0) parallelCount = n;
        }
        if (first === LEVEL_COUNT_PREFIX) {
            const n = parseInt(cellStr(r[1]), 10);
            if (Number.isFinite(n) && n > 0) levelCount = Math.min(3, n);
        }
    }

    let i = 0;
    while (i < aoa.length) {
        const row = aoa[i] || [];
        const compName = matchPrefix(row, COMPONENT_PREFIX);
        if (!compName) { i++; continue; }

        let unit = "";
        let notes = "";
        let j = i + 1;
        while (j < aoa.length) {
            const r = aoa[j] || [];
            const first = String(r[0] || "").trim();
            if (first === UNIT_PREFIX) { unit = cellStr(r[1]); j++; continue; }
            if (first === NOTES_PREFIX) { notes = cellStr(r[1]); j++; continue; }
            if (first === LEVEL_PREFIX) break;
            if (first === COMPONENT_PREFIX) break;
            j++;
        }

        // Düzey blokları
        const targets: Record<string, string> = {};
        const matrices: Record<string, string> = {};
        const rawData: Record<string, Record<string, string[][]>> = {};

        let lvlIdx = 0;
        let k = j;
        while (k < aoa.length && lvlIdx < levelCount) {
            const r = aoa[k] || [];
            const first = String(r[0] || "").trim();

            if (first === COMPONENT_PREFIX) break;
            if (first !== LEVEL_PREFIX) { k++; continue; }

            const lvlKey = `level-${lvlIdx}`;
            // Sonraki satırlar: matriks, hedef, sonra header
            let m = k + 1;
            let matrix = "";
            let target = "";
            while (m < aoa.length) {
                const rr = aoa[m] || [];
                const f = String(rr[0] || "").trim();
                if (f === MATRIX_PREFIX) { matrix = cellStr(rr[1]); m++; continue; }
                if (f === TARGET_PREFIX) { target = cellStr(rr[1]); m++; continue; }
                if (f === "#") break;
                if (f === LEVEL_PREFIX || f === COMPONENT_PREFIX) break;
                m++;
            }

            if (m >= aoa.length || String(aoa[m]?.[0] || "").trim() !== "#") {
                k = m;
                lvlIdx++;
                continue;
            }

            const headerRow = aoa[m];
            // Header: # | Analist1-Par1 | Analist1-Par2 | Analist2-Par1 | Analist2-Par2 | ...
            // Personel sırası: her 2 sütun bir analist
            const analystsInSheet: string[] = [];
            for (let c = 1; c < headerRow.length; c += 2) {
                const label = String(headerRow[c] || "").trim();
                // "Ahmet - Paralel 1" -> "Ahmet"
                const name = label.replace(/\s*-\s*Paralel.*$/i, "").trim();
                if (name) analystsInSheet.push(name);
            }

            // Data satırları
            const levelData: Record<string, string[][]> = {};
            for (const a of analystsInSheet) levelData[a] = [];

            let n = m + 1;
            while (n < aoa.length) {
                const dr = aoa[n] || [];
                const f = String(dr[0] || "").trim();
                if (f === LEVEL_PREFIX || f === COMPONENT_PREFIX) break;
                const idx = Number(f);
                if (!Number.isFinite(idx) || idx <= 0) {
                    if (f === "" && dr.slice(1).every(v => !isFilled(v))) { n++; continue; }
                    n++;
                    continue;
                }

                for (let ai = 0; ai < analystsInSheet.length; ai++) {
                    const a = analystsInSheet[ai];
                    const c1 = cellStr(dr[1 + ai * 2]);
                    const c2 = cellStr(dr[1 + ai * 2 + 1]);
                    levelData[a].push([c1, c2]);
                }
                n++;
            }

            // Merge: var olan veriyi al, sadece dolu hücreleri üzerine yaz
            const prevForComp = existing[compName] || {};
            const prevRaw: Record<string, Record<string, string[][]>> = prevForComp.rawData || {};
            const prevLevel = prevRaw[lvlKey] || {};
            const mergedLevel: Record<string, string[][]> = { ...prevLevel };
            for (const a of analystsInSheet) {
                const prevGrid = prevLevel[a] || [];
                mergedLevel[a] = mergeGrid(prevGrid, levelData[a]);
            }
            rawData[lvlKey] = mergedLevel;

            if (matrix) matrices[lvlKey] = matrix;
            if (target) targets[lvlKey] = target;

            k = n;
            lvlIdx++;
        }

        const prev = existing[compName] || {};
        const next: any = { ...prev };
        next.parallelCount = parallelCount;
        next.levelCount = levelCount;
        if (unit) next.unit = unit;
        if (notes) next.notes = notes;

        // Target & matrix merge: yeni dolu olanlar üstüne yaz
        const mergedTargets = { ...(prev.targets || {}) };
        for (const [key, val] of Object.entries(targets)) if (val) mergedTargets[key] = val;
        const mergedMatrices = { ...(prev.matrices || {}) };
        for (const [key, val] of Object.entries(matrices)) if (val) mergedMatrices[key] = val;
        next.targets = mergedTargets;
        next.matrices = mergedMatrices;

        // rawData merge: yukarıda bloklar bazında merge edildi, prev'in dokunulmamış bloklarını koru
        next.rawData = { ...(prev.rawData || {}), ...rawData };

        // Eğer hiçbir şey dolmadıysa ve önceden de yoksa, ekleme
        const hasAnyData =
            !!unit || !!notes ||
            Object.values(targets).some(Boolean) ||
            Object.values(matrices).some(Boolean) ||
            Object.values(rawData).some(level => Object.values(level).some(grid => grid.some(row => row.some(isFilled))));

        if (hasAnyData) {
            out[compName] = next;
        } else if (existing[compName]) {
            out[compName] = prev;
        }

        i = k;
    }

    return out;
}

// -----------------------------------------------------------------------------
// Tekrar Uretilebilirlik parse
// -----------------------------------------------------------------------------

function parseReproducibilitySheet(aoa: any[][], existing: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};

    let parallelCount = 6;
    for (let i = 0; i < aoa.length; i++) {
        const v = matchPrefix(aoa[i] || [], PARALLEL_PREFIX);
        if (v != null) {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n > 0) parallelCount = n;
            break;
        }
    }

    let i = 0;
    while (i < aoa.length) {
        const row = aoa[i] || [];
        const compName = matchPrefix(row, COMPONENT_PREFIX);
        if (!compName) { i++; continue; }

        let unit = "";
        let notes = "";
        let j = i + 1;
        while (j < aoa.length) {
            const r = aoa[j] || [];
            const first = String(r[0] || "").trim();
            if (first === UNIT_PREFIX) { unit = cellStr(r[1]); j++; continue; }
            if (first === NOTES_PREFIX) { notes = cellStr(r[1]); j++; continue; }
            if (first === "#") break;
            if (first === COMPONENT_PREFIX) break;
            j++;
        }

        if (j >= aoa.length || String(aoa[j]?.[0] || "").trim() !== "#") {
            i = j;
            continue;
        }

        const headerRow = aoa[j];
        // Header: # | Tarih | Analist1 | Analist2 | ...
        const analystsInSheet: string[] = [];
        for (let c = 2; c < headerRow.length; c++) {
            const label = String(headerRow[c] || "").trim();
            if (label) analystsInSheet.push(label);
        }

        // Data satırları
        const rows: Array<{ date: string; values: string[] }> = [];
        let k = j + 1;
        while (k < aoa.length) {
            const r = aoa[k] || [];
            const first = String(r[0] || "").trim();
            if (first === COMPONENT_PREFIX) break;
            const idx = Number(first);
            if (!Number.isFinite(idx) || idx <= 0) {
                if (first === "" && r.slice(1).every(v => !isFilled(v))) { k++; continue; }
                k++;
                continue;
            }
            const date = cellStr(r[1]);
            const values: string[] = [];
            for (let a = 0; a < analystsInSheet.length; a++) {
                values.push(cellStr(r[2 + a]));
            }
            rows.push({ date, values });
            k++;
        }

        const prev = existing[compName] || {};
        const prevRows: Array<{ date?: string; values?: string[] }> = Array.isArray(prev.rows) ? prev.rows : [];
        const merged = mergeReproRows(prevRows, rows, analystsInSheet.length);

        const hasAnyData =
            !!unit || !!notes ||
            merged.some(r => r.date || (r.values || []).some(isFilled));

        const next: any = { ...prev };
        next.parallelCount = parallelCount;
        next.analysts = analystsInSheet;
        if (unit) next.unit = unit;
        if (notes) next.notes = notes;
        if (merged.length > 0) next.rows = merged;

        if (hasAnyData) {
            out[compName] = next;
        } else if (existing[compName]) {
            out[compName] = prev;
        }

        i = k;
    }

    return out;
}

// -----------------------------------------------------------------------------
// Trueness parse
// -----------------------------------------------------------------------------

function parseTruenessSheet(aoa: any[][], existing: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};

    let i = 0;
    while (i < aoa.length) {
        const row = aoa[i] || [];
        const compName = matchPrefix(row, COMPONENT_PREFIX);
        if (!compName) { i++; continue; }

        let unit = "";
        let matrix = "";
        let target = "";
        let notes = "";
        let j = i + 1;
        while (j < aoa.length) {
            const r = aoa[j] || [];
            const first = String(r[0] || "").trim();
            if (first === UNIT_PREFIX) { unit = cellStr(r[1]); j++; continue; }
            if (first === MATRIX_PREFIX) { matrix = cellStr(r[1]); j++; continue; }
            if (first === TARGET_PREFIX) { target = cellStr(r[1]); j++; continue; }
            if (first === NOTES_PREFIX) { notes = cellStr(r[1]); j++; continue; }
            if (first === "#") break;
            if (first === COMPONENT_PREFIX) break;
            j++;
        }

        if (j >= aoa.length || String(aoa[j]?.[0] || "").trim() !== "#") {
            i = j;
            continue;
        }

        const headerRow = aoa[j];
        const personnelCount = Math.max(0, headerRow.length - 1);

        const rows: string[][] = [];
        let k = j + 1;
        while (k < aoa.length) {
            const r = aoa[k] || [];
            const first = String(r[0] || "").trim();
            if (first === COMPONENT_PREFIX) break;
            const idx = Number(first);
            if (!Number.isFinite(idx) || idx <= 0) {
                if (first === "" && r.slice(1).every(v => !isFilled(v))) { k++; continue; }
                k++;
                continue;
            }
            const dataRow: string[] = [];
            for (let c = 0; c < personnelCount; c++) {
                dataRow.push(cellStr(r[c + 1]));
            }
            rows.push(dataRow);
            k++;
        }

        const prev = existing[compName] || {};
        const prevRows: string[][] = Array.isArray(prev.rows) ? prev.rows : [];
        const merged = mergeGrid(prevRows, rows);

        const hasAnyData =
            !!unit || !!matrix || !!target || !!notes ||
            merged.some(row => row.some(isFilled));

        const next: any = { ...prev };
        if (unit) next.unit = unit;
        if (matrix) next.matrix = matrix;
        if (target) next.target = target;
        if (notes) next.notes = notes;
        if (merged.length > 0) next.rows = merged;

        if (hasAnyData) {
            out[compName] = next;
        } else if (existing[compName]) {
            out[compName] = prev;
        }

        i = k;
    }

    return out;
}

// =============================================================================
// MERGE YARDIMCILARI
// =============================================================================

/**
 * Grid (string[][]) merge: yeni grid'in dolu hücreleri eski grid'in üstüne yazar,
 * yeni grid'in boş hücreleri eski değeri korur.
 */
function mergeGrid(prev: string[][], next: string[][]): string[][] {
    const rowCount = Math.max(prev.length, next.length);
    const out: string[][] = [];
    for (let r = 0; r < rowCount; r++) {
        const prevRow = prev[r] || [];
        const nextRow = next[r] || [];
        const colCount = Math.max(prevRow.length, nextRow.length);
        const merged: string[] = [];
        for (let c = 0; c < colCount; c++) {
            const nv = nextRow[c];
            if (isFilled(nv)) merged.push(String(nv));
            else merged.push(String(prevRow[c] || ""));
        }
        out.push(merged);
    }
    return out;
}

/** Lineerlik satırları için merge (level/concentrations/responses). */
function mergeLinearityRows(
    prev: Array<{ id?: string; level?: string; concentrations?: string[]; responses?: string[] }>,
    next: Array<{ id: string; level: string; concentrations: string[]; responses: string[] }>
) {
    const out: Array<{ id: string; level: string; concentrations: string[]; responses: string[] }> = [];
    const rowCount = Math.max(prev.length, next.length);
    for (let r = 0; r < rowCount; r++) {
        const p = prev[r] || {};
        const n = next[r];
        const id = n?.id || p.id || String(r + 1);
        const level = (n && n.level) || p.level || `L${r + 1}`;
        const concPrev = p.concentrations || [];
        const concNext = n?.concentrations || [];
        const respPrev = p.responses || [];
        const respNext = n?.responses || [];
        const repCount = Math.max(concPrev.length, concNext.length, respPrev.length, respNext.length);
        const concs: string[] = [];
        const resps: string[] = [];
        for (let c = 0; c < repCount; c++) {
            concs.push(isFilled(concNext[c]) ? String(concNext[c]) : String(concPrev[c] || ""));
            resps.push(isFilled(respNext[c]) ? String(respNext[c]) : String(respPrev[c] || ""));
        }
        out.push({ id, level, concentrations: concs, responses: resps });
    }
    return out;
}

/** Reproducibility satırları merge: date + values dizisi. */
function mergeReproRows(
    prev: Array<{ date?: string; values?: string[] }>,
    next: Array<{ date: string; values: string[] }>,
    analystCount: number
) {
    const out: Array<{ date: string; values: string[] }> = [];
    const rowCount = Math.max(prev.length, next.length);
    for (let r = 0; r < rowCount; r++) {
        const p = prev[r] || {};
        const n = next[r];
        const date = isFilled(n?.date) ? String(n!.date) : String(p.date || "");
        const pValues = p.values || [];
        const nValues = n?.values || [];
        const colCount = Math.max(pValues.length, nValues.length, analystCount);
        const values: string[] = [];
        for (let c = 0; c < colCount; c++) {
            values.push(isFilled(nValues[c]) ? String(nValues[c]) : String(pValues[c] || ""));
        }
        out.push({ date, values });
    }
    return out;
}

// =============================================================================
// EXPORTS — Yardımcı
// =============================================================================

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
