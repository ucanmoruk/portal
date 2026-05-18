"use client";

import React from "react";

type ReportPerson = { name: string; role?: string };
type ReportDevice = { code?: string; name: string; serialNo?: string; intendedUse?: string };
type ReportComponent = {
    code?: string;
    name: string;
    casNo?: string;
    limit?: string;
    unit?: string;
    uncertaintyValue?: string | number | null;
    uncertainty_value?: string | number | null;
};
type ReportParameter = { id: string; name: string; isEnabled: boolean; note?: string };
const REPORT_LOGO_SRC = "https://placehold.co/220x90/ffffff/111827?text=LOGO";

export interface ReportData {
    meta: {
        title: string;
        id: string;
        method: string;
        date: string;
        analyst: string;
        methodCode?: string;
        methodSource?: string;
        matrix?: string;
        studyType?: string;
        plannedStartDate?: string | null;
        plannedEndDate?: string | null;
        documentNo?: string;
        publishDate?: string;
        revisionNo?: string;
        revisionDate?: string;
        reportingUnit?: string;
        conclusion?: string;
    };
    description?: string;
    devices?: ReportDevice[];
    personnel?: ReportPerson[];
    components?: ReportComponent[];
    parameters?: ReportParameter[];
    lodData?: {
        components: Array<{ name: string; lod: number; loq: number; unit: string; mean: number; stdDev: number }>;
        notes?: string;
    };
    linearityData?: {
        components: Array<{ name: string; slope: number; intercept: number; rSquared: number; equation: string; range: string }>;
        notes?: string;
    };
    moduleData?: Record<string, Record<string, unknown>>;
}

interface ValidationReportProps {
    data: ReportData;
}

const moduleLabels: Record<string, string> = {
    LOD_LOQ: "LOD / LOQ",
    LINEARITY: "Doğrusallık",
    PRECISION_REPEATABILITY: "Kesinlik (Tekrarlanabilirlik)",
    PRECISION_REPRODUCIBILITY: "Kesinlik (Tekrarüretilebilirlik)",
    TRUENESS: "Gerçeklik / Geri Kazanım",
    SAMPLE_PREPARATION: "Numune Hazırlama",
    MEASUREMENT_UNCERTAINTY: "Ölçüm Belirsizliği",
};

const appendixModuleOrder = [
    "LINEARITY",
    "LOD_LOQ",
    "PRECISION_REPEATABILITY",
    "PRECISION_REPRODUCIBILITY",
    "TRUENESS",
    "SAMPLE_PREPARATION",
    "MEASUREMENT_UNCERTAINTY",
];

const formatDate = (value?: string | null) => {
    if (!value || value === "-") return "-";
    const [datePart] = String(value).split("T");
    const parts = datePart.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return new Date(value).toLocaleDateString("tr-TR").replace(/\./g, "-");
};
const parseNumeric = (value: unknown) => {
    if (value === null || value === undefined || value === "") return Number.NaN;
    const text = String(value).trim();
    const numericMatch = text.match(/-?\d+(?:[.,]\d+)?/);
    const normalized = (numericMatch?.[0] || text).replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};
const numberValue = (value: unknown, digits = 4) => Number.isFinite(parseNumeric(value)) ? parseNumeric(value).toFixed(digits) : "-";
const methodTitle = (value: string) => value.replace(/\s+Validasyonu\s*$/i, "").trim();
const unitLabel = (unit?: unknown) => {
    const value = String(unit || "").trim();
    const labels: Record<string, string> = {
        mg_L: "mg/L",
        ug_L: "µg/L",
        ng_L: "ng/L",
        mg_kg: "mg/kg",
        ug_kg: "µg/kg",
        percent: "%",
        conc: "Konsantrasyon",
    };
    return labels[value] || value.replace("_", "/");
};

const textValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined || value === "") return "-";
    if (React.isValidElement(value)) return value;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
};

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const normalizeReportName = (value: string) =>
    value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");

const namesMatch = (left: string, right: string) => {
    const a = normalizeReportName(left);
    const b = normalizeReportName(right);
    return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
};

const getComponentRecord = (moduleData: Record<string, Record<string, unknown>>, moduleKey: string, componentName: string) => {
    const moduleRecord = moduleData[moduleKey] || {};
    const exact = moduleRecord[componentName];
    if (exact) return asRecord(exact);
    const matched = Object.entries(moduleRecord).find(([key]) => namesMatch(key, componentName));
    return asRecord(matched?.[1]);
};

const formatLinearityRange = (range: unknown, unit: unknown) => {
    const rangeText = String(range || "").trim();
    const label = unitLabel(unit);
    if (!rangeText) return "-";
    if (!label) return rangeText;
    const withoutTrailingUnit = rangeText.replace(/\s+(mg|ug|µg|ng|ppm|ppb|ppt|%)\s*$/i, "");
    return `${withoutTrailingUnit} ${label}`;
};

const getLinearityRange = (componentName: string, data: ReportData, moduleData: Record<string, Record<string, unknown>>) => {
    const linearity = getComponentRecord(moduleData, "LINEARITY", componentName);
    const fromReport = data.linearityData?.components.find(component => component.name === componentName)?.range;
    return formatLinearityRange(linearity.range || fromReport, linearity.unit);
};

const getLodLoqValue = (componentName: string, field: "lod" | "loq", data: ReportData, moduleData: Record<string, Record<string, unknown>>) => {
    const fromReport = data.lodData?.components.find(component => component.name === componentName)?.[field];
    if (Number.isFinite(Number(fromReport))) return numberValue(fromReport, 3);
    return numberValue(getComponentRecord(moduleData, "LOD_LOQ", componentName)[field], 3);
};

const getRecoveryValue = (componentName: string, moduleData: Record<string, Record<string, unknown>>) => {
    const trueness = getComponentRecord(moduleData, "TRUENESS", componentName);
    const resultRecords = asRecord(trueness.results);
    const recoveries = Object.values(resultRecords).flatMap(result => {
        const rows = asRecord(result).recoveries;
        return Array.isArray(rows) ? rows : [];
    }).map(row => Number(asRecord(row).recovery)).filter(Number.isFinite);

    if (recoveries.length === 0) return "-";
    const average = recoveries.reduce((sum, value) => sum + value, 0) / recoveries.length;
    return `${numberValue(average, 2)}%`;
};

const isExpandedUncertaintyKey = (key: string) => {
    const normalized = normalizeReportName(key)
        .replace(/[\s_\-.():]/g, "")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ş/g, "s")
        .replace(/ü/g, "u")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c");
    return normalized === "expandeduncertainty"
        || normalized.includes("genisletilmisbelirsizlik")
        || (normalized.includes("expanded") && normalized.includes("uncertainty"));
};

const normalizeUncertaintyKey = (key: string) =>
    normalizeReportName(key)
        .replace(/[ıİ]/g, "i")
        .replace(/[ğĞ]/g, "g")
        .replace(/[şŞ]/g, "s")
        .replace(/[üÜ]/g, "u")
        .replace(/[öÖ]/g, "o")
        .replace(/[çÇ]/g, "c")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s_\-.():]/g, "");

const isExpandedUncertaintyField = (key: string) => {
    const normalized = normalizeUncertaintyKey(key);
    return isExpandedUncertaintyKey(key)
        || normalized === "expandedmeasurementuncertainty"
        || normalized.includes("genisletilmisbelirsizlik")
        || (normalized.includes("genisletilmis") && normalized.includes("belirsizlik"))
        || (normalized.includes("olcum") && normalized.includes("belirsizlik"))
        || (normalized.includes("expanded") && normalized.includes("uncertainty"));
};

const readExpandedUncertainty = (record: Record<string, unknown>) => {
    const direct = Object.entries(record).find(([key]) => isExpandedUncertaintyField(key));
    if (direct) return parseNumeric(direct[1]);

    const label = [record.label, record.title, record.field, record.name]
        .find(item => typeof item === "string" && item.trim().length > 0);
    if (typeof label === "string" && isExpandedUncertaintyField(label)) {
        return parseNumeric(record.value ?? record.result ?? record.amount ?? record.text);
    }

    return Number.NaN;
};

const collectExpandedUncertainties = (value: unknown, componentName: string, matchedOnly: boolean, result: number[] = []) => {
    if (!value || typeof value !== "object") return result;

    if (Array.isArray(value)) {
        value.forEach(item => collectExpandedUncertainties(item, componentName, matchedOnly, result));
        return result;
    }

    const record = asRecord(value);
    const componentLabel = [record.component, record.name, record.code, record.componentName]
        .find(item => typeof item === "string" && item.trim().length > 0);
    const isMatched = typeof componentLabel === "string" && namesMatch(componentLabel, componentName);
    const expanded = readExpandedUncertainty(record);
    if (Number.isFinite(expanded) && expanded > 0 && (!matchedOnly || isMatched)) result.push(expanded);

    Object.values(record).forEach(child => {
        if (child && typeof child === "object") collectExpandedUncertainties(child, componentName, matchedOnly, result);
    });

    return result;
};

const finiteNumbers = (values: unknown[]) =>
    values
        .map(parseNumeric)
        .filter(Number.isFinite);

const rss = (values: unknown[]) => {
    const numbers = finiteNumbers(values);
    if (numbers.length === 0) return Number.NaN;
    return Math.sqrt(numbers.reduce((sum, value) => sum + Math.pow(value, 2), 0));
};

const firstFinite = (...values: unknown[]) => {
    const found = finiteNumbers(values)[0];
    return Number.isFinite(found) ? found : Number.NaN;
};

const collectRecursiveNumbersByKey = (value: unknown, keys: string[], result: number[] = []) => {
    if (!value || typeof value !== "object") return result;
    const normalizedKeys = keys.map(normalizeUncertaintyKey);

    Object.entries(value).forEach(([key, child]) => {
        if (normalizedKeys.includes(normalizeUncertaintyKey(key))) {
            const numeric = parseNumeric(child);
            if (Number.isFinite(numeric)) result.push(numeric);
        }
        if (child && typeof child === "object") collectRecursiveNumbersByKey(child, keys, result);
    });

    return result;
};

const getLinearityUncertainty = (data: Record<string, unknown>) => {
    const statistics = asRecord(data.statistics);
    const rsdPercent = firstFinite(statistics.rsdUCo, data.rsdUCo);
    if (Number.isFinite(rsdPercent)) return rsdPercent / 100;
    return firstFinite(statistics.uCo, data.uCo);
};

const getRepeatabilityUncertainty = (data: Record<string, unknown>) => {
    const levels = Array.isArray(data.levels) ? data.levels : [];
    const byLevel = rss(levels.map(level => {
        const levelRecord = asRecord(level);
        return firstFinite(levelRecord.pooledRsd, asRecord(levelRecord.result).pooledRsd);
    }));
    if (Number.isFinite(byLevel)) return byLevel;
    return rss(collectRecursiveNumbersByKey(data, ["pooledRsd", "rsdPool", "rsdr"]));
};

const getReproducibilityUncertainty = (data: Record<string, unknown>) => {
    const result = asRecord(data.result);
    const summary = asRecord(data.summary);
    const direct = firstFinite(result.pooledRsd, result.rsdPool, summary.pooledRsd, summary.rsdPool, data.pooledRsd, data.rsdPool);
    if (Number.isFinite(direct)) return direct;
    return rss(collectRecursiveNumbersByKey(data, ["pooledRsd", "rsdPool", "rsdr"]));
};

const getTruenessUncertainty = (data: Record<string, unknown>) => {
    const results = asRecord(data.results);
    return firstFinite(results.standardUncertainty, results.uBias, data.standardUncertainty, data.uBias);
};

const getSamplePreparationCommonUncertainty = (sample: Record<string, unknown>) => {
    const volumetric = Array.isArray(sample.volumetric) ? sample.volumetric : [];
    return rss(volumetric.map(item => {
        const record = asRecord(item);
        return firstFinite(record.relativeStandardUncertainty, record.standardUncertainty);
    }));
};

const getStandardUncertainty = (componentName: string, sample: Record<string, unknown>) => {
    const chemicals = Array.isArray(sample.chemicals) ? sample.chemicals : [];
    return rss(chemicals
        .filter(item => {
            const record = asRecord(item);
            return [record.name, record.code].some(value => typeof value === "string" && namesMatch(value, componentName));
        })
        .map(item => {
            const record = asRecord(item);
            return firstFinite(record.relativeStandardUncertainty, record.standardUncertainty);
        }));
};

const calculateExpandedUncertainty = (componentName: string, moduleData: Record<string, Record<string, unknown>>) => {
    const sample = asRecord(moduleData.SAMPLE_PREPARATION?.summary);
    const combined = rss([
        getLinearityUncertainty(getComponentRecord(moduleData, "LINEARITY", componentName)),
        getRepeatabilityUncertainty(getComponentRecord(moduleData, "PRECISION_REPEATABILITY", componentName)),
        getReproducibilityUncertainty(getComponentRecord(moduleData, "PRECISION_REPRODUCIBILITY", componentName)),
        getTruenessUncertainty(getComponentRecord(moduleData, "TRUENESS", componentName)),
        getSamplePreparationCommonUncertainty(sample),
        getStandardUncertainty(componentName, sample),
    ]);
    return Number.isFinite(combined) ? combined * 2 : Number.NaN;
};

const getExpandedUncertaintyValue = (
    component: ReportComponent,
    moduleData: Record<string, Record<string, unknown>>,
    allowSingleFallback = false,
) => {
    const componentUncertainty = parseNumeric(component.uncertaintyValue ?? component.uncertainty_value);
    if (Number.isFinite(componentUncertainty) && componentUncertainty > 0) return numberValue(componentUncertainty, 5);

    const uncertaintyData = moduleData.MEASUREMENT_UNCERTAINTY;
    const matched = collectExpandedUncertainties(uncertaintyData, component.name, true);
    if (matched.length > 0) return numberValue(matched[0], 5);

    const allPositive = Array.from(new Set(collectExpandedUncertainties(uncertaintyData, component.name, false)));
    if (allPositive.length === 1 || (allowSingleFallback && allPositive.length > 0)) return numberValue(allPositive[0], 5);

    const calculated = calculateExpandedUncertainty(component.name, moduleData);
    if (Number.isFinite(calculated) && calculated > 0) return numberValue(calculated, 5);

    return "-";
};

const getMatrixLevelRows = (data: ReportData, moduleData: Record<string, Record<string, unknown>>) => {
    const repeatability = moduleData.PRECISION_REPEATABILITY || {};
    const rows = Object.entries(repeatability).flatMap(([, value]) => {
        const record = asRecord(value);
        const unit = textValue(record.unitLabel || record.unit);
        const levels = record.levels;
        if (!Array.isArray(levels)) return [];
        return levels.map(level => {
            const levelRecord = asRecord(level);
            return [
                textValue(levelRecord.matrix || data.meta.matrix),
                textValue(levelRecord.target),
                unit,
            ];
        });
    });

    if (rows.length > 0) return rows;
    return (data.components || []).map(component => [data.meta.matrix, component.limit, component.unit]);
};

const getReproducibilityDateRange = (moduleData: Record<string, Record<string, unknown>>) => {
    const dates = Object.values(moduleData.PRECISION_REPRODUCIBILITY || {}).flatMap(value => {
        const rows = asRecord(value).rows;
        if (!Array.isArray(rows)) return [];
        return rows.map(row => asRecord(row).date).filter((date): date is string => typeof date === "string" && date.trim().length > 0);
    });
    const sorted = Array.from(new Set(dates)).sort();
    return {
        start: sorted[0] || null,
        end: sorted[sorted.length - 1] || null,
    };
};

const getValidationSummaryRows = (data: ReportData, moduleData: Record<string, Record<string, unknown>>) =>
    (data.components || []).map(component => [
        component.name,
        getLinearityRange(component.name, data, moduleData),
        getLodLoqValue(component.name, "lod", data, moduleData),
        getLodLoqValue(component.name, "loq", data, moduleData),
        getRecoveryValue(component.name, moduleData),
        getExpandedUncertaintyValue(component, moduleData, (data.components || []).length === 1),
    ]);

const getReportingExample = (data: ReportData, moduleData: Record<string, Record<string, unknown>>, fallbackUnit: string) => {
    const component = data.components?.[0]?.name || "etken madde";
    const componentUnit = data.components?.[0]?.unit || fallbackUnit || "birim";
    const uncertainty = data.components?.[0] ? getExpandedUncertaintyValue(data.components[0], moduleData, data.components.length === 1) : "-";
    const uncertaintyNumber = parseNumeric(uncertainty);
    const result = Number.isFinite(uncertaintyNumber) ? numberValue(10 * uncertaintyNumber, 3) : "-";
    return { component, unit: componentUnit, uncertainty, result };
};

export function ValidationReport({ data }: ValidationReportProps) {
    const moduleData = data.moduleData || {};
    const reportingUnit = data.meta.reportingUnit || data.components?.find(component => component.unit)?.unit || "-";
    const cleanTitle = methodTitle(data.meta.title || "METOT");
    const reportTitle = `${cleanTitle} METOT VALİDASYON VE ÖLÇÜM BELİRSİZLİĞİ RAPORU`;
    const conclusion = data.meta.conclusion || `${data.meta.methodCode || data.meta.method || cleanTitle} analiz metodu valide edilmiş ve ölçüm belirsizliği çalışması değerlendirilmiştir. Gerçekleştirilen ölçümler istatistiksel hesaplamalar ile değerlendirilmiştir ve sonuçlar uygundur.`;
    const matrixLevelRows = getMatrixLevelRows(data, moduleData);
    const validationSummaryRows = getValidationSummaryRows(data, moduleData);
    const reportingExample = getReportingExample(data, moduleData, reportingUnit);
    const reproducibilityDates = getReproducibilityDateRange(moduleData);

    return (
        <div className="validation-report-shell">
            <button onClick={() => window.print()} className="validation-print-button no-print">Yazdır</button>

            <div className="report-page" data-page-number="1">
                <ReportHeader
                    title={reportTitle}
                    documentNo={data.meta.documentNo || "K.SOP.16 / Ek-1"}
                    publishDate={formatDate(data.meta.publishDate)}
                    revisionNo={data.meta.revisionNo || "-"}
                    revisionDate={formatDate(data.meta.revisionDate)}
                />

                

                <Section title="1.0   AMAÇ ve KAPSAM">
                    <p>Bu raporun amacı aşağıda bilgileri verilen analizin geçerli kılınması ve ölçüm belirsizliğinin hesaplanmasıdır.</p>
                    <br></br>
                    <Table
                        compact
                        rows={[
                            ["Analiz Adı", cleanTitle],
                            ["Metot Kodu:", data.meta.methodSource || data.meta.methodCode || data.meta.method],
                            ["Metot Kaynağı", data.meta.method],
                            ["Validasyon çalışma tarihleri", `Başlangıç: ${formatDate(reproducibilityDates.start || data.meta.plannedStartDate)}    Bitiş: ${formatDate(reproducibilityDates.end || data.meta.plannedEndDate)}`],
                        ]}
                    />
                </Section>

                <Section title="Validasyona Katılan Personeller">
                    <div >
                        <Table
                            headers={["Adı Soyadı", "Görevi"]}
                            rows={(data.personnel || []).map(person => [person.name, person.role])}
                            empty="Personel kaydı bulunamadı."
                        />
                    </div>
                </Section>

                  <Section title="Çalışmada Kullanılan Cihaz / Ekipman ve Kimyasallar">
                    <div>
                        <Table
                            headers={["Kod", "Cihaz / Ekipman / Kimyasal Adı", "Seri No"]}
                            rows={(data.devices || []).map(device => [device.code, device.name, device.serialNo])}
                            empty="Cihaz / ekipman / kimyasal kaydı bulunamadı."
                        />              
                    </div>
                </Section>

                <Section title="2.0   VALİDASYON ÇALIŞMASI YAPILAN MATRİKSLER, ETKENLER ve DÜZEYLERİ">
                    <Table
                        headers={["No", "Standart Adı", "CAS No"]}
                        rows={(data.components || []).map((component, index) => [
                            index + 1,
                            component.name,
                            component.casNo,
                        ])}
                        empty="Komponent kaydı bulunamadı."
                    />

            <div className="report-two-column"></div>
                    <br></br>      
                    <Table
                        headers={["Matriksler", "Çalışma Düzeyleri", "Birim"]}
                        rows={matrixLevelRows}
                        empty="Komponent kaydı bulunamadı."
                    />


                </Section>

                <Section title="3.0   VALİDASYON PARAMETRELERİ ve DEĞERLENDİRMELERİ">
                    <p className="report-copy">
                        Analiz metodunun validasyon (geçerli kılma) çalışmaları için aşağıdaki parametreler seçilmiştir ve sonuçları paylaşılmıştır. Validasyon çalışmalarında kullanılan numuneler ilgili analiz talimatında anlatıldığı şekilde analize tabi tutulmuştur.
                    </p>
                    <Table
                        headers={["Etken Madde", "Lineerite Aralığı", "LOD", "LOQ", "Geri Kazanım", "Genişletilmiş Belirsizlik"]}
                        rows={validationSummaryRows}
                        empty="Validasyon sonuç özeti bulunamadı."
                    />
                </Section>

                <Section title="4.0   RAPORLAMA">
                    <p className="report-copy">
                        Analiz sonucu, genişletilmiş belirsizlik ile birlikte sonuç birimi kullanılarak raporlanır. Uygun olduğunda sonuç “sonuç ± genişletilmiş belirsizlik {reportingUnit}” formatında verilir.
                    </p>
                    <p className="report-copy">
                        <strong>Örnek:</strong> Analiz sonucu 10 {reportingExample.unit} {reportingExample.component} bulunan bir numunede hesap; 10 x {reportingExample.uncertainty} = {reportingExample.result}; şeklinde yapılır. Raporda 10,0 ± {reportingExample.result} {reportingExample.unit} şeklinde yazılır.
                    </p>
                </Section>

                <Section title="5.0   DEĞERLENDİRME ve SONUÇ">
                    <p className="report-copy">{conclusion}</p>
                    {data.personnel && data.personnel.length > 0 && (
                        <p className="report-copy">
                            Çalışmaya katılan personeller {data.personnel.map(person => person.name).join(" ve ")} bu validasyon çalışması ile yetkilendirilmiştir.
                        </p>
                    )}
                </Section>

                <Section title="6.0   REVİZYONLAR">
                    <Table
                        headers={["Revizyon Sayısı", "Tarih", "Revizyon Yapılan Madde", "Revizyon Nedeni", "Revizyon Yapan Kişi"]}
                        rows={[]}
                        empty="Revizyon kaydı bulunamadı."
                    />
                </Section>

                <div className="report-signatures">
                    <Signature title="HAZIRLAYAN" name={data.meta.analyst || "Analist"} role="Kimyasal Analiz Lab. Personeli" />
                    <Signature title="KONTROL EDEN" name="Laboratuvar Sorumlusu" role="Kimyasal Analiz Lab. Sorumlusu" />
                    <Signature title="ONAYLAYAN" name="Laboratuvar Müdürü" role="Laboratuvar Müdürü" />
                </div>

                <div className="report-end">* Rapor Sonu *</div>
            </div>

            <div className="report-page report-appendix" data-page-number="2">
                <ReportHeader
                    title={reportTitle}
                    documentNo={data.meta.documentNo || "K.SOP.16 / Ek-1"}
                    publishDate={formatDate(data.meta.publishDate)}
                    revisionNo={data.meta.revisionNo || "-"}
                    revisionDate={formatDate(data.meta.revisionDate)}
                />
                <Section title="EK-1   VALİDASYON DATA ÇIKTISI">
                    {renderDataAppendix(moduleData, data.components || [])}
                </Section>
            </div>

            <style jsx global>{`
                .validation-report-shell {
                    width: 100%;
                    color: #111827;
                    font-family: Arial, Helvetica, sans-serif;
                }
                .validation-print-button {
                    position: sticky;
                    top: 12px;
                    z-index: 5;
                    margin: 0 0 12px auto;
                    display: block;
                    border: 1px solid #111827;
                    background: #111827;
                    color: white;
                    padding: 7px 14px;
                    font-size: 12px;
                    font-weight: 700;
                }
                .report-page {
                    position: relative;
                    box-sizing: border-box;
                    width: 210mm;
                    min-height: 297mm;
                    margin: 0 auto 18px;
                    background: white;
                    padding: 10mm 10mm 14mm;
                    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.12);
                    font-size: 10.5px;
                    line-height: 1.28;
                }
                .report-page::after {
                    content: "Sayfa: " attr(data-page-number);
                    position: absolute;
                    right: 10mm;
                    bottom: 5mm;
                    font-size: 9px;
                    color: #111827;
                }
                .report-header {
                    display: grid;
                    grid-template-columns: 43mm 1fr 54mm;
                    border: 1.5px solid #111827;
                    min-height: 28mm;
                }
                .report-header-cell {
                    border-left: 1px solid #111827;
                }
                .report-header-cell:first-child {
                    border-left: 0;
                }
                .report-logo-slot {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    padding: 5mm;
                }
                .report-logo-slot img {
                    max-width: 100%;
                    max-height: 24mm;
                    object-fit: contain;
                }
                .report-doc-table,
                .report-meta-table {
                    width: 100%;
                    height: 100%;
                    border-collapse: collapse;
                }
                .report-doc-table td,
                .report-meta-table td {
                    border-bottom: 1px solid #111827;
                    padding: 4px 5px;
                    vertical-align: middle;
                }
                .report-doc-table tr:last-child td,
                .report-meta-table tr:last-child td {
                    border-bottom: 0;
                }
                .report-doc-label,
                .report-meta-label {
                    width: 26mm;
                    font-weight: 700;
                    white-space: nowrap;
                }
                .report-title-box {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px 14px;
                    text-align: center;
                }
                .report-title-box h1 {
                    margin: 0;
                    font-size: 17px;
                    font-weight: 800;
                    line-height: 1.35;
                    text-transform: uppercase;
                }
                .report-purpose {
                    margin: 10px 0 14px;
                    font-size: 11px;
                }
                .report-section {
                    margin-top: 12px;
                    break-inside: avoid;
                }
                .report-section-title {
                    margin: 0 0 6px;
                    font-size: 12px;
                    font-weight: 800;
                    text-transform: uppercase;
                }
                .report-copy {
                    margin: 0 0 8px;
                    font-size: 11px;
                }
                .report-two-column {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    align-items: start;
                }
                .report-table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                    font-size: 10.5px;
                }
                .report-table th,
                .report-table td {
                    border: 1px solid #111827;
                    padding: 4px 5px;
                    vertical-align: top;
                    overflow-wrap: anywhere;
                }
                .report-table th {
                    background: #f1f5f9;
                    font-weight: 800;
                    text-align: center;
                }
                .report-table.compact td:first-child {
                    width: 36%;
                    background: #f8fafc;
                    font-weight: 800;
                }
                .report-block {
                    margin-top: 8px;
                    break-inside: avoid;
                }
                .report-block-title {
                    margin: 0 0 4px;
                    font-size: 11px;
                    font-weight: 800;
                }
                .report-subblock {
                    margin-top: 6px;
                    break-inside: avoid;
                }
                .report-subblock h4 {
                    margin: 0 0 4px;
                    font-size: 10.5px;
                    font-weight: 800;
                }
                .report-note {
                    margin: 4px 0 0;
                    font-size: 10px;
                    font-style: italic;
                }
                .report-signatures {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 12px;
                    margin-top: 22mm;
                    break-inside: avoid;
                }
                .report-signature {
                    min-height: 28mm;
                    text-align: center;
                    border-top: 1px solid #111827;
                    padding-top: 5px;
                }
                .report-signature-title {
                    font-weight: 800;
                    margin-bottom: 18mm;
                }
                .report-signature-name {
                    font-weight: 700;
                }
                .report-signature-role {
                    font-size: 10px;
                }
                .report-end {
                    margin-top: 12mm;
                    text-align: center;
                    font-weight: 700;
                }
                .report-appendix {
                    min-height: auto;
                }
                .report-pre {
                    margin: 0;
                    white-space: pre-wrap;
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 9px;
                    line-height: 1.25;
                }
                @media print {
                    @page { size: A4; margin: 7mm; }
                    html,
                    body {
                        width: 210mm;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                    }
                    nav, aside, header, .no-print { display: none !important; }
                    .validation-report-shell {
                        width: 196mm;
                        margin: 0 auto !important;
                        padding: 0 !important;
                    }
                    .report-page {
                        width: 196mm;
                        min-height: 283mm;
                        margin: 0 auto !important;
                        padding: 0 0 9mm;
                        box-shadow: none;
                        page-break-after: always;
                    }
                    .report-page::after {
                        right: 0;
                        bottom: 0;
                    }
                    .report-page:last-of-type {
                        page-break-after: auto;
                    }
                }
            `}</style>
        </div>
    );
}

function ReportHeader({
    title,
    documentNo,
    publishDate,
    revisionNo,
    revisionDate,
}: {
    title: string;
    documentNo: string;
    publishDate: string;
    revisionNo: string;
    revisionDate: string;
}) {
    return (
        <div className="report-header">
            <div className="report-header-cell">
                <div className="report-logo-slot">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={REPORT_LOGO_SRC} alt="Laboratuvar logosu" />
                </div>
            </div>
            <div className="report-header-cell report-title-box">
                <h1>{title}</h1>
            </div>
            <div className="report-header-cell">
                <table className="report-meta-table">
                    <tbody>
                        <tr><td className="report-doc-label">Doküman No:</td><td>{documentNo}</td></tr>
                        <tr><td className="report-doc-label">Yayın Tarihi:</td><td>{publishDate}</td></tr>
                        <tr><td className="report-doc-label">Revizyon No:</td><td>{revisionNo}</td></tr>
                        <tr><td className="report-doc-label">Revizyon Tarihi:</td><td>{revisionDate}</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="report-section">
            <h2 className="report-section-title">{title}</h2>
            {children}
        </section>
    );
}

function Table({
    headers,
    rows,
    empty = "Kayıtlı veri bulunamadı.",
    compact = false,
}: {
    headers?: string[];
    rows: Array<Array<React.ReactNode>>;
    empty?: string;
    compact?: boolean;
}) {
    const columnCount = headers?.length || rows[0]?.length || 2;

    return (
        <table className={`report-table${compact ? " compact" : ""}`}>
            {headers && (
                <thead>
                    <tr>{headers.map(header => <th key={header}>{header}</th>)}</tr>
                </thead>
            )}
            <tbody>
                {rows.length > 0 ? rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => <td key={cellIndex}>{textValue(cell)}</td>)}
                    </tr>
                )) : (
                    <tr><td colSpan={columnCount}>{empty}</td></tr>
                )}
            </tbody>
        </table>
    );
}

function ReportBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="report-block">
            <h3 className="report-block-title">{title}</h3>
            {children}
        </div>
    );
}

function Signature({ title, name, role }: { title: string; name: string; role: string }) {
    return (
        <div className="report-signature">
            <div className="report-signature-title">{title}</div>
            <div className="report-signature-name">{name}</div>
            <div className="report-signature-role">{role}</div>
        </div>
    );
}

function renderDataAppendix(moduleData: Record<string, Record<string, unknown>>, components: ReportComponent[]) {
    const orderedEntries = [
        ...appendixModuleOrder.map(moduleKey => [moduleKey, moduleData[moduleKey]] as const),
        ...Object.entries(moduleData).filter(([moduleKey]) => !appendixModuleOrder.includes(moduleKey)),
    ];

    const sections = orderedEntries.flatMap(([moduleKey, moduleComponents], moduleIndex) => {
        if (!moduleComponents || typeof moduleComponents !== "object") return [];
        return Object.entries(moduleComponents).map(([component, value]) => (
            <ReportBlock key={`${moduleKey}-${component}`} title={`Ek-1.${moduleIndex + 1} ${moduleLabels[moduleKey] || moduleKey} - ${component}`}>
                {renderAppendixContent(moduleKey, value)}
            </ReportBlock>
        ));
    });

    const savedMeasurementRows = asRecord(moduleData.MEASUREMENT_UNCERTAINTY?.summary).rows;
    if ((!Array.isArray(savedMeasurementRows) || savedMeasurementRows.length === 0) && components.length > 0) {
        sections.push(
            <ReportBlock key="MEASUREMENT_UNCERTAINTY-calculated" title="Ölçüm Belirsizliği - Hesap Özeti">
                <p className="report-note">Ölçüm belirsizliği sekmesi rapor özeti kaydedilmemişse bu tablo validasyon modül verilerinden hesaplanır.</p>
                <Table
                    headers={["Etken Madde", "Genişletilmiş Belirsizlik"]}
                    rows={components.map(component => [
                        component.name,
                        numberValue(calculateExpandedUncertainty(component.name, moduleData), 5),
                    ])}
                />
            </ReportBlock>,
        );
    }

    return sections.length > 0 ? <div>{sections}</div> : <p className="report-copy">Ek data kaydı bulunamadı.</p>;
}

function renderAppendixContent(moduleKey: string, value: unknown): React.ReactNode {
    const record = asRecord(value);

    if (moduleKey === "LOD_LOQ") {
        return (
            <>
                <p className="report-note">Formül: Ortalama ve standart sapma üzerinden LOD / LOQ değerleri hesaplanır.</p>
                <div className="report-subblock">
                    <h4>Hesaplanan Sonuçlar</h4>
                <Table
                    headers={["Alan", "Değer"]}
                    rows={[
                        ["Ortalama", numberValue(record.mean, 5)],
                        ["Std. Sapma", numberValue(record.stdDev, 5)],
                        ["LOD", numberValue(record.lod, 5)],
                        ["LOQ", numberValue(record.loq, 5)],
                        ["Birim", unitLabel(record.unitLabel || record.unit)],
                        ["Açıklama", textValue(record.notes)],
                    ]}
                />
                </div>
                {renderLodRows(record.rows)}
            </>
        );
    }

    if (moduleKey === "LINEARITY") {
        return (
            <>
                <p className="report-note">Formül: En küçük kareler yöntemi ile y = ax + b regresyonu ve R² hesaplanır.</p>
                <div className="report-subblock">
                    <h4>Hesaplanan Sonuçlar</h4>
                <Table
                    headers={["Alan", "Değer"]}
                    rows={[
                        ["Lineerite aralığı", formatLinearityRange(record.range, record.unit)],
                        ["Regresyon denklemi", textValue(record.equation)],
                        ["Eğim", numberValue(record.slope, 5)],
                        ["Kesişim", numberValue(record.intercept, 5)],
                        ["R²", numberValue(record.rSquared, 5)],
                        ["Birim", unitLabel(record.unit)],
                        ["Açıklama", textValue(record.notes)],
                    ]}
                />
                </div>
                {renderLinearityRows(record.rows)}
                {renderLinearityStatistics(record.statistics)}
            </>
        );
    }

    if (moduleKey === "SAMPLE_PREPARATION") {
        return (
            <>
                <p className="report-note">Numune hazırlamada kullanılan standart, hacimsel malzeme ve cihaz belirsizlikleri standart belirsizliğe çevrilerek değerlendirilir.</p>
                <div className="report-subblock">
                    <h4>Açıklamalar</h4>
                <Table
                    headers={["Açıklama"]}
                    rows={[[textValue(record.notes)]]}
                />
                </div>
                {renderSamplePreparationRows(record)}
            </>
        );
    }

    if (moduleKey === "PRECISION_REPEATABILITY") {
        const levels = Array.isArray(record.levels) ? record.levels : [];
        return (
            <>
                <p className="report-note">Formül: Her düzeyde ortalama, standart sapma, RSDr ve tekrarlanabilirlik limiti r = 2,83 x Sr hesaplanır.</p>
                <div className="report-subblock">
                    <h4>Çalışma Bilgileri</h4>
                <Table
                    headers={["Birim", "Paralel Sayısı", "Düzey Sayısı", "Açıklama"]}
                    rows={[[unitLabel(record.unitLabel || record.unit), textValue(record.parallelCount), textValue(record.levelCount), textValue(record.notes)]]}
                />
                </div>
                {renderRepeatabilityRawData(record.rawData)}
                {levels.map((level, index) => {
                    const levelRecord = asRecord(level);
                    const analysts = asRecord(levelRecord.analysts);
                    return (
                        <div className="report-subblock" key={`repeatability-${index}`}>
                            <h4>{textValue(levelRecord.label)}</h4>
                            <Table
                                headers={["Matriks", "Hedef / Düzey", "RSDpool"]}
                                rows={[[textValue(levelRecord.matrix), textValue(levelRecord.target), numberValue(levelRecord.pooledRsd, 5)]]}
                            />
                            <Table
                                headers={["Analist", "n", "Ortalama", "Std. Sapma", "RSDr", "r"]}
                                rows={Object.entries(analysts).map(([analyst, stats]) => {
                                    const statRecord = asRecord(stats);
                                    return [
                                        analyst,
                                        textValue(statRecord.n),
                                        numberValue(statRecord.mean, 5),
                                        numberValue(statRecord.stdDev, 5),
                                        numberValue(statRecord.rsdr, 5),
                                        numberValue(statRecord.repeatabilityLimit, 5),
                                    ];
                                })}
                            />
                        </div>
                    );
                })}
            </>
        );
    }

    if (moduleKey === "PRECISION_REPRODUCIBILITY") {
        return (
            <>
                <p className="report-note">Formül: Günler ve analistler arası varyanslar F testi ile değerlendirilir; F &lt; Fkritik ise sonuç uygundur.</p>
                <div className="report-subblock">
                    <h4>Çalışma Bilgileri</h4>
                <Table
                    headers={["Birim", "Çalışma Günü", "Açıklama"]}
                    rows={[[unitLabel(record.unitLabel || record.unit), textValue(record.parallelCount), textValue(record.notes)]]}
                />
                </div>
                {renderReproducibilityRows(record.rows, record.analysts)}
                {renderReproducibilityResult(record.result)}
            </>
        );
    }

    if (moduleKey === "TRUENESS") {
        return (
            <>
                <p className="report-note">Formül: Geri kazanım (%) = ölçülen değer / hedef değer x 100.</p>
                <div className="report-subblock">
                    <h4>Çalışma Bilgileri</h4>
                <Table
                    headers={["Matriks", "Hedef", "Birim", "Açıklama"]}
                    rows={[[textValue(record.matrix), textValue(record.target), unitLabel(record.unitLabel || record.unit), textValue(record.notes)]]}
                />
                </div>
                {renderTruenessRawRows(record.rows, record.analysts)}
                {renderTruenessResults(record.results)}
            </>
        );
    }

    if (moduleKey === "MEASUREMENT_UNCERTAINTY") {
        const rows = Array.isArray(record.rows) ? record.rows : [];
        return (
            <>
                <p className="report-note">Formül: Birleşik standart belirsizlik bileşen kareleri toplamının karekökü ile, genişletilmiş belirsizlik ise k faktörü ile hesaplanır.</p>
                <div className="report-subblock">
                    <h4>Çalışma Bilgileri</h4>
                <Table
                    headers={["Kapsama Faktörü", "Açıklama"]}
                    rows={[[textValue(record.coverageFactor), textValue(record.notes)]]}
                />
                </div>
                <div className="report-subblock">
                    <h4>Hesaplanan Belirsizlik Bütçesi</h4>
                <Table
                    headers={["Etken Madde", "Lineerite", "Tekrarlanabilirlik", "Tekrarüretilebilirlik", "Geri Kazanım", "Numune Hazırlama", "Standart", "Birleşik", "Genişletilmiş"]}
                    rows={rows.map(row => {
                        const rowRecord = asRecord(row);
                        return [
                            textValue(rowRecord.component),
                            numberValue(rowRecord.linearity, 5),
                            numberValue(rowRecord.repeatability, 5),
                            numberValue(rowRecord.reproducibility, 5),
                            numberValue(rowRecord.trueness, 5),
                            numberValue(rowRecord.samplePreparation, 5),
                            numberValue(rowRecord.standardUncertainty, 5),
                            numberValue(rowRecord.combinedStandardUncertainty, 5),
                            numberValue(rowRecord.expandedUncertainty, 5),
                        ];
                    })}
                />
                </div>
            </>
        );
    }

    return renderObjectData(value);
}

function suitabilityText(value: unknown) {
    if (value === true) return "Uygun";
    if (value === false) return "Uygun değil";
    return "Değerlendirilemedi";
}

function renderLodRows(rowsValue: unknown) {
    const rows = Array.isArray(rowsValue) ? rowsValue : [];
    if (rows.length === 0) return null;

    return (
        <div className="report-subblock">
            <h4>Girilen Ölçüm Verileri</h4>
            <Table
                headers={["Sıra", "Ölçüm Değeri"]}
                rows={rows.map((row, index) => [index + 1, textValue(row)])}
            />
        </div>
    );
}

function renderLinearityRows(rowsValue: unknown) {
    const rows = Array.isArray(rowsValue) ? rowsValue : [];
    if (rows.length === 0) return null;

    return (
        <div className="report-subblock">
            <h4>Girilen Data ve Grafik Veri Serisi</h4>
            <Table
                headers={["Sıra", "Konsantrasyon (x)", "Cihaz Yanıtı (y)", "x - Ortalama", "Artık (y - yhesap)", "Artık Kareleri"]}
                rows={rows.map((row, index) => {
                    const record = asRecord(row);
                    return [
                        index + 1,
                        numberValue(record.x, 5),
                        numberValue(record.y, 5),
                        numberValue(record.xDelta, 5),
                        numberValue(record.yResidual, 5),
                        numberValue(record.yResidualSquared, 8),
                    ];
                })}
            />
        </div>
    );
}

function renderLinearityStatistics(statisticsValue: unknown) {
    const statistics = asRecord(statisticsValue);
    const rows = [
        ["Eğim", numberValue(statistics.slope, 5)],
        ["Kesişim", numberValue(statistics.intercept, 5)],
        ["Korelasyon Katsayısı (R)", numberValue(statistics.r, 5)],
        ["Determinasyon Katsayısı (R²)", numberValue(statistics.rSquared, 5)],
        ["Standart Sapma", numberValue(statistics.standardDeviation, 5)],
        ["Ortalama Konsantrasyon", numberValue(statistics.cort, 5)],
        ["Bağıl Standart Belirsizlik", numberValue(statistics.rsdUCo, 5)],
    ].filter(row => row[1] !== "-");

    if (rows.length === 0) return null;

    return (
        <div className="report-subblock">
            <h4>Regresyon ve Belirsizlik Özeti</h4>
            <Table headers={["Hesap", "Sonuç"]} rows={rows} />
        </div>
    );
}

function renderRepeatabilityRawData(rawDataValue: unknown) {
    const rawData = asRecord(rawDataValue);
    const rows = Object.entries(rawData).flatMap(([levelKey, analystMap]) => {
        const analysts = asRecord(analystMap);
        return Object.entries(analysts).flatMap(([analyst, gridValue]) => {
            const grid = Array.isArray(gridValue) ? gridValue : [];
            return grid.map((row, rowIndex) => [
                fieldLabel(levelKey),
                analyst,
                rowIndex + 1,
                ...(Array.isArray(row) ? row.map(textValue) : [textValue(row)]),
            ]);
        });
    });

    if (rows.length === 0) return null;
    const maxColumns = Math.max(...rows.map(row => row.length));
    return (
        <div className="report-subblock">
            <h4>Girilen Paralel Ölçüm Verileri</h4>
            <Table
                headers={["Düzey", "Analist", "Tekrar", ...Array.from({ length: Math.max(0, maxColumns - 3) }, (_, index) => `Paralel ${index + 1}`)]}
                rows={rows.map(row => [...row, ...Array.from({ length: maxColumns - row.length }, () => "-")])}
            />
        </div>
    );
}

function renderSamplePreparationRows(record: Record<string, unknown>) {
    const volumetric = Array.isArray(record.volumetric) ? record.volumetric : [];
    const chemicals = Array.isArray(record.chemicals) ? record.chemicals : [];

    return (
        <>
            <div className="report-subblock">
                <h4>Hacimsel Malzeme / Cihaz Belirsizlikleri</h4>
                <Table
                    headers={["Kod", "Ekipman / Malzeme", "Birim", "Kullanılan Değer", "Belirsizlik Bileşeni", "Dağılım", "Standart Belirsizlik", "Bağıl Standart Belirsizlik"]}
                    rows={volumetric.map(item => {
                        const row = asRecord(item);
                        return [
                            textValue(row.code),
                            textValue(row.name),
                            textValue(row.unit),
                            textValue(row.value),
                            textValue(row.uncertaintyComponent),
                            textValue(row.distribution),
                            numberValue(row.standardUncertainty, 5),
                            numberValue(row.relativeStandardUncertainty, 5),
                        ];
                    })}
                    empty="Hacimsel malzeme veya cihaz belirsizliği bulunamadı."
                />
            </div>
            <div className="report-subblock">
                <h4>Standart / Kimyasal Belirsizlikleri</h4>
                <Table
                    headers={["Kod", "Standart / Kimyasal", "Belirsizlik Bileşeni", "Dağılım", "Saflık", "Safsızlık", "Standart Belirsizlik", "Bağıl Standart Belirsizlik"]}
                    rows={chemicals.map(item => {
                        const row = asRecord(item);
                        return [
                            textValue(row.code),
                            textValue(row.name),
                            textValue(row.uncertaintyComponent),
                            textValue(row.distribution),
                            textValue(row.purity),
                            textValue(row.impurity),
                            numberValue(row.standardUncertainty, 5),
                            numberValue(row.relativeStandardUncertainty, 5),
                        ];
                    })}
                    empty="Standart veya kimyasal belirsizliği bulunamadı."
                />
            </div>
        </>
    );
}

function renderReproducibilityRows(rowsValue: unknown, analystsValue: unknown) {
    const rows = Array.isArray(rowsValue) ? rowsValue : [];
    const analysts = Array.isArray(analystsValue) ? analystsValue.map(item => String(item)) : [];
    if (rows.length === 0) return null;

    const maxValueCount = Math.max(...rows.map(row => Array.isArray(asRecord(row).values) ? (asRecord(row).values as unknown[]).length : 0), analysts.length);
    const headers = ["Gün / Tarih", ...Array.from({ length: maxValueCount }, (_, index) => analysts[index] || `Analist ${index + 1}`)];

    return (
        <div className="report-subblock">
            <h4>Gün Bazlı Ölçüm Sonuçları</h4>
            <Table
                headers={headers}
                rows={rows.map(row => {
                    const record = asRecord(row);
                    const values = Array.isArray(record.values) ? record.values : [];
                    return [
                        textValue(record.date),
                        ...Array.from({ length: maxValueCount }, (_, index) => textValue(values[index])),
                    ];
                })}
            />
        </div>
    );
}

function renderReproducibilityResult(resultValue: unknown) {
    const result = asRecord(resultValue);
    const analystStats = asRecord(result.analystStats);
    const analystRows = Object.entries(analystStats).map(([analyst, stats]) => {
        const record = asRecord(stats);
        return [
            analyst,
            textValue(record.count),
            numberValue(record.mean, 5),
            numberValue(record.stdDev, 5),
            numberValue(record.rsdr, 5),
            numberValue(record.repeatabilityLimit, 5),
        ];
    });

    return (
        <>
            <div className="report-subblock">
                <h4>Analist Bazlı Tekrarüretilebilirlik Özeti</h4>
                <Table
                    headers={["Analist", "n", "Ortalama", "Std. Sapma", "RSDr", "r Limiti"]}
                    rows={analystRows}
                    empty="Analist bazlı hesap bulunamadı."
                />
            </div>
            <div className="report-subblock">
                <h4>F Testi ve Karar</h4>
                <Table
                    headers={["Hesap", "Sonuç"]}
                    rows={[
                        ["Havuzlanmış RSD", numberValue(result.pooledRsd, 5)],
                        ["F Testi", numberValue(result.fTest, 5)],
                        ["F Kritik", numberValue(result.fCritical, 5)],
                        ["Kriter", textValue(result.criterion)],
                        ["Değerlendirme", textValue(result.result)],
                    ]}
                />
            </div>
        </>
    );
}

function renderTruenessResults(resultsValue: unknown) {
    const results = asRecord(resultsValue);
    const recoveryRows = Object.entries(results).flatMap(([analyst, value]) => {
        const record = asRecord(value);
        const recoveries = Array.isArray(record.recoveries) ? record.recoveries : [];
        return recoveries.map((recovery, index) => {
            const recoveryRecord = asRecord(recovery);
            return [
                analyst,
                index + 1,
                numberValue(recoveryRecord.value, 5),
                numberValue(recoveryRecord.recovery, 2),
                suitabilityText(recoveryRecord.isSuitable),
            ];
        });
    });

    const summaryRows = Object.entries(results).map(([analyst, value]) => {
        const record = asRecord(value);
        return [
            analyst,
            textValue(record.n),
            numberValue(record.mean, 5),
            numberValue(record.stdDev, 5),
            numberValue(record.rsd, 5),
        ];
    });

    if (recoveryRows.length === 0 && summaryRows.length === 0) {
        return <p className="report-copy">Geri kazanım sonucu bulunamadı.</p>;
    }

    return (
        <>
            <div className="report-subblock">
                <h4>Geri Kazanım Sonuçları</h4>
                <Table
                    headers={["Analist", "Tekrar", "Ölçülen Değer", "Geri Kazanım (%)", "Uygunluk"]}
                    rows={recoveryRows}
                    empty="Geri kazanım sonucu bulunamadı."
                />
            </div>
            <div className="report-subblock">
                <h4>Analist Bazlı Özet</h4>
                <Table
                    headers={["Analist", "n", "Ortalama", "Std. Sapma", "RSD"]}
                    rows={summaryRows}
                    empty="Özet hesap bulunamadı."
                />
            </div>
        </>
    );
}

function renderTruenessRawRows(rowsValue: unknown, analystsValue: unknown) {
    const rows = Array.isArray(rowsValue) ? rowsValue : [];
    if (rows.length === 0) return null;
    const analysts = Array.isArray(analystsValue) ? analystsValue.map(item => String(item)) : [];
    const maxColumns = Math.max(...rows.map(row => Array.isArray(row) ? row.length : 0), analysts.length);

    return (
        <div className="report-subblock">
            <h4>Girilen Ölçüm Verileri</h4>
            <Table
                headers={["Tekrar", ...Array.from({ length: maxColumns }, (_, index) => analysts[index] || `Analist ${index + 1}`)]}
                rows={rows.map((row, index) => [
                    index + 1,
                    ...Array.from({ length: maxColumns }, (_, columnIndex) => Array.isArray(row) ? textValue(row[columnIndex]) : "-"),
                ])}
            />
        </div>
    );
}

function renderObjectData(value: unknown): React.ReactNode {
    if (Array.isArray(value)) {
        return <Table headers={["#", "Değer"]} rows={value.map((item, index) => [index + 1, renderInlineValue(item)])} />;
    }
    if (!value || typeof value !== "object") {
        return <Table headers={["Alan", "Değer"]} rows={[["Değer", renderInlineValue(value)]]} />;
    }
    return (
        <Table
            headers={["Alan", "Değer"]}
            rows={Object.entries(value).map(([key, item]) => [fieldLabel(key), renderInlineValue(item)])}
        />
    );
}

function renderInlineValue(value: unknown): React.ReactNode {
    if (value === null || value === undefined || value === "") return "-";
    if (Array.isArray(value)) {
        if (value.every(item => typeof item !== "object")) return value.join(", ");
        return <pre className="report-pre">{JSON.stringify(value, null, 2)}</pre>;
    }
    if (typeof value === "object") return <pre className="report-pre">{JSON.stringify(value, null, 2)}</pre>;
    return String(value);
}

function fieldLabel(value: string) {
    return value
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, char => char.toUpperCase());
}
