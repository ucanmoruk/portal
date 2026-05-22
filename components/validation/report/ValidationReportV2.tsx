"use client";

// ─────────────────────────────────────────────────────────────────────────────
// VALİDASYON RAPORU — V2 (Denetim Dostu Format)
//
// Bu dosya rapor formatının yeni sürümüdür. Eski sürüm `ValidationReport.tsx`
// dosyasında **olduğu gibi** durmaktadır. Geri dönmek için sadece
// `app/(dashboard)/laboratuvar/eurolab/validasyon/[id]/rapor/page.tsx`
// dosyasındaki import satırını eski adına çevirmek yeterli.
//
// V2 farkları:
//   • Ek-1 her modül için 4 net blok: VERİLER / HESAPLAMA / KRİTER / SONUÇ
//   • Daha rahat satır yüksekliği ve okunabilir font
//   • Sütun genişlikleri dengelendi, gereksiz geniş kolonlar kısaltıldı
//   • Renkli karar etiketleri (Uygun / Uygun Değil / Değerlendirilemedi)
//
// Logo dosyası:    REPORT_LOGO_SRC (aşağıdaki sabit)
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import {
    asRecord,
    calculateExpandedUncertainty,
    formatDate,
    formatLinearityRange,
    getExpandedUncertaintyValue,
    getMatrixLevelRows,
    getReproducibilityDateRange,
    getValidationSummaryRows,
    methodTitle,
    numberValue,
    parseNumeric,
    type ReportData,
    textValue,
    unitLabel,
} from "./ValidationReport";
import { getDefaultModuleDescription } from "@/lib/validation/defaultDescriptions";

const REPORT_LOGO_SRC = "https://placehold.co/220x90/ffffff/111827?text=LOGO";

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

// Modül bazlı kabul kriterleri (laboratuvar genel kabulleri).
// Spesifik metot/dökümanda farklı kriter varsa o önceliklidir.
const moduleCriteria: Record<string, { criterion: string; rule: string }> = {
    LINEARITY: {
        criterion: "R² ≥ 0,995. Determinasyon katsayısı 0,995'in altındaysa kalibrasyon doğrusu reddedilir.",
        rule: "Determinasyon katsayısı 0,995'in altındaysa kalibrasyon doğrusu reddedilir.",
    },
    LOD_LOQ: {
        criterion: "LOD = x̄ + 3s, LOQ = x̄ + 10s; tekrar sayısı en az 7 olmalıdır.",
        rule: "LOD = x̄ + 3s, LOQ = x̄ + 10s; tekrar sayısı en az 7 olmalıdır.",
    },
    PRECISION_REPEATABILITY: {
        criterion: "Tekrarlanabilirlik standart sapması ve r = 2,83 × Sr değerlendirilir.",
        rule: "Tekrarlanabilirlik standart sapması ve r = 2,83 × Sr değerlendirilir.",
    },
    PRECISION_REPRODUCIBILITY: {
        criterion: "F hesap < F kritik (uygulanan güven düzeyinde).",
        rule: "Farklı gün/analist varyansları arası uyum F testi ile değerlendirilir.",
    },
    TRUENESS: {
        criterion: "Geri kazanım tablosu aralığına göre değerlendirilir.",
        rule: "Geri Kazanım (%) = (Bulunan / Hedef) × 100.",
    },
    SAMPLE_PREPARATION: {
        criterion: "Her belirsizlik bileşeni standart belirsizliğe çevrilmiş olmalıdır.",
        rule: "Dağılıma göre u = a/√3 (dikdörtgen), u = a/√6 (üçgen), u = U/k (normal).",
    },
    MEASUREMENT_UNCERTAINTY: {
        criterion: "Genişletilmiş belirsizlik k=2 ile yaklaşık %95 güven düzeyinde raporlanır.",
        rule: "uc = √(Σui²); U = k · uc.",
    },
};

interface ValidationReportV2Props {
    data: ReportData;
    /** PDF üretimi sırasında butonları ve interaktif elementleri gizler. */
    printable?: boolean;
}

export function ValidationReportV2({ data, printable = false }: ValidationReportV2Props) {
    const moduleData = data.moduleData || {};
    const reportingUnit = resolveReportingUnit(data, moduleData);
    const cleanTitle = methodTitle(data.meta.title || "METOT");
    const reportTitle = `${cleanTitle} METOT VALİDASYON ve ÖLÇÜM BELİRSİZLİĞİ RAPORU`;
    const conclusion = data.meta.conclusion
        || `${data.meta.methodCode || data.meta.method || cleanTitle} analiz metodu valide edilmiş ve ölçüm belirsizliği çalışması değerlendirilmiştir. Gerçekleştirilen ölçümler istatistiksel hesaplamalar ile değerlendirilmiştir ve sonuçlar uygundur.`;
    const matrixLevelRows = getMatrixLevelRows(data, moduleData);
    const validationSummaryRows = getValidationSummaryRows(data, moduleData);
    const reproducibilityDates = getReproducibilityDateRange(moduleData);
    const reportingExample = getReportingExample(data, moduleData, reportingUnit);

    return (
        <div className="vr2-shell">
            {!printable && (
                <button onClick={() => window.print()} className="vr2-print-button no-print">Yazdır</button>
            )}

            <ReportPage pageNumber={1}>
                <ReportHeader title={reportTitle} meta={data.meta} />

                <Section title="1. AMAÇ ve KAPSAM">
                    <p className="vr2-copy" style={{fontSize:"13px" , color:"#000000"}}>
                        Bu raporun amacı aşağıda bilgileri verilen analizin geçerli kılınması (validasyonu) ve
                        ölçüm belirsizliğinin hesaplanmasıdır.
                    </p>
                    <KeyValueTable
                        rows={[
                            ["Analiz Adı", cleanTitle],
                            ["Metot Kodu", data.meta.methodSource || data.meta.methodCode || data.meta.method],
                            ["Metot Kaynağı", data.meta.method],
                            ["Validasyon Tarihleri", `Başlangıç: ${formatDate(reproducibilityDates.start || data.meta.plannedStartDate)}    Bitiş: ${formatDate(reproducibilityDates.end || data.meta.plannedEndDate)}`],
                        ]}
                    />
                </Section>

                <Subsection title="Validasyona Katılan Personeller">
                    <DataTable 
                        headers={["Adı Soyadı", "Görevi"]}
                        columnWidths={["55%", "45%"]}
                        rows={(data.personnel || []).map(p => [p.name, p.role])}
                        empty="Personel kaydı bulunamadı."
                    />
                </Subsection>

                <Subsection title="Kullanılan Cihaz / Ekipman ve Kimyasallar">
                    <DataTable
                        headers={["Kod", "Cihaz / Ekipman / Kimyasal", "Seri No"]}
                        columnWidths={["18%", "60%", "50%"]}
                        rows={(data.devices || []).map(d => [d.code, d.name, d.serialNo])}
                        empty="Cihaz / ekipman / kimyasal kaydı bulunamadı."
                    />
                </Subsection>

                <Section title="2. VALİDASYON ÇALIŞMASI YAPILAN MATRİKSLER, ETKENLER ve DÜZEYLERİ">
                    <Subsection title="Etken Madde Listesi">
                        <DataTable
                            headers={["No", "Standart / Etken Adı", "CAS No"]}
                            columnWidths={["8%", "60%", "40%"]}
                            rows={(data.components || []).map((c, i) => [i + 1, c.name, c.casNo])}
                            empty="Komponent kaydı bulunamadı."
                        />
                    </Subsection>
                    <Subsection title="Matriks ve Çalışma Düzeyleri">
                        <DataTable
                            headers={["Matriks", "Çalışma Düzeyi", "Birim"]}
                            columnWidths={["45%", "35%", "30%"]}
                            rows={matrixLevelRows}
                            empty="Düzey kaydı bulunamadı."
                        />
                    </Subsection>
                </Section>

                <Section title="3. VALİDASYON PARAMETRELERİ ve SONUÇ ÖZETİ">
                    <p className="vr2-copy" style={{fontSize:"13px", color:"#000000"}}>
                        Analiz metodunun validasyon (geçerli kılma) çalışması için aşağıdaki parametreler
                        seçilmiştir. Hesaplama detayları Ek-1&apos;de, kullanılan istatistiksel temel Ek-2&apos;de
                        verilmiştir.
                    </p>
                    <DataTable
                        headers={["Etken Madde", "Lineerite Aralığı", "LOD", "LOQ", "Geri Kazanım", "Gen. Bel. (U)"]}
                        columnWidths={["40%", "25%", "12%", "12%", "14%", "18%"]}
                        rows={validationSummaryRows}
                        empty="Validasyon sonuç özeti bulunamadı."
                    />
                </Section>

                <Section title="4. RAPORLAMA">
                    <p className="vr2-copy" style={{fontSize:"13px", color:"#000000"}}>
                        Analiz sonucu, genişletilmiş belirsizlik ile birlikte sonuç birimi kullanılarak
                        raporlanır. Sonuç formatı: <strong>sonuç ± U {reportingUnit}</strong>.
                    </p>
                    <p className="vr2-copy" style={{fontSize:"13px", color:"#000000"}}>
                        <strong>Örnek:</strong> Analiz sonucu 10 {reportingExample.unit} {reportingExample.component}
                        {" "}bulunan bir numunede hesap; 10 × {reportingExample.uncertainty}
                        {" "}= {reportingExample.result}; rapora 10,0 ± {reportingExample.result} {reportingExample.unit} şeklinde yazılır.
                    </p>
                </Section>

                <Section title="5. DEĞERLENDİRME ve SONUÇ">
                    <p className="vr2-copy" style={{fontSize:"13px", color:"#000000"}}>{conclusion}</p>
                    {data.personnel && data.personnel.length > 0 && (
                        <p className="vr2-copy" style={{fontSize:"13px", color:"#000000"}}>
                            Çalışmaya katılan personeller <strong>{data.personnel.map(p => p.name).join(" ve ")}</strong> 
                            {" "}bu validasyon çalışması ile yetkilendirilmiştir.
                        </p>
                    )}
                </Section>

                <Section title="6. REVİZYONLAR">
                    <DataTable
                        headers={["Rev. No", "Tarih", "Madde", "Sebep", "Yapan"]}
                        columnWidths={["10%", "15%", "20%", "35%", "20%"]}
                        rows={(data.revisions || []).map(rev => [
                            rev.revNo || "-",
                            rev.date || "-",
                            rev.clause || "-",
                            rev.reason || "-",
                            rev.by || "-",
                        ])}
                        empty="Revizyon kaydı bulunamadı."
                    />
                </Section>

                <SignatureBlock analyst={data.meta.analyst} />
                <div className="vr2-end">* Rapor Sonu *</div>
                <div className="vr2-copy" style={{fontSize:"12px", color:"#848484" , textAlign: "center"}} >Elektronik ortamda alınan çıktılar kontrolsüz kopya olarak işlem görür.</div>
            </ReportPage>

            <ReportPage pageNumber={2} appendix>
                <ReportHeader title={reportTitle} meta={data.meta} />
                <Section title="Ek-1   VALİDASYON DATA ÇIKTISI (Veri / Hesaplama / Kriter / Sonuç)">
                    <p className="vr2-copy" style={{fontSize:"13px", color:"#000000"}}>
                        Bu ekte validasyon çalışmalarında kullanılan veriler, uygulanan hesaplamalar,
                        kabul kriterleri ve elde edilen sonuçlar sunulmuştur.
                    </p>
                    {renderAuditAppendix(moduleData, data)}
                </Section>
            </ReportPage>

            <ReportPage pageNumber={3} appendix>
                <ReportHeader title={reportTitle} meta={data.meta} />
                <Section title="Ek-2   HESAPLAMA YÖNTEMLERİ ve İSTATİSTİKSEL TEMEL">
                    <p className="vr2-copy" style={{fontSize:"13px", color:"#000000"}}>
                        Validasyon raporunda kullanılan temel istatistiksel yaklaşımlar, hesaplama mantığı
                        ve formül özetleri bu bölümde yer almaktadır. Hesaplamalar; metot validasyonu ve
                        ölçüm belirsizliği için kabul gören uluslararası rehberlere (Eurachem, JCGM-GUM,
                        ISO/IEC 17025) göre düzenlenmiştir.
                    </p>
                    <DataTable
                        headers={["Başlık", "Yöntem / Amaç", "Temel Formül", "Teknik Not"]}
                        columnWidths={["18%", "30%", "26%", "26%"]}
                        rows={statisticalBasisRows}
                    />
                    <Subsection title="Kaynaklar">
                        <ol className="vr2-source-list">
                            {statisticalSources.map(source => (
                                <li key={source.url}>
                                    {source.label}<br />
                                    <span className="vr2-source-url">{source.url}</span>
                                </li>
                            ))}
                        </ol>
                    </Subsection>
                </Section>
            </ReportPage>

            <ReportStyles />
        </div>
    );
}

// ─── Ek-1 audit-friendly renderer ────────────────────────────────────────────

function renderAuditAppendix(
    moduleData: Record<string, Record<string, unknown>>,
    data: ReportData,
) {
    const components = data.components || [];
    const orderedEntries = [
        ...appendixModuleOrder.map(key => [key, moduleData[key]] as const),
        ...Object.entries(moduleData).filter(([key]) => !appendixModuleOrder.includes(key)),
    ];

    const blocks: React.ReactNode[] = [];
    let counter = 0;

    orderedEntries.forEach(([moduleKey, moduleComponents]) => {
        if (!moduleComponents || typeof moduleComponents !== "object") return;
        Object.entries(moduleComponents).forEach(([component, value]) => {
            counter += 1;
            blocks.push(
                <AuditBlock
                    key={`${moduleKey}-${component}-${counter}`}
                    index={counter}
                    moduleLabel={moduleLabels[moduleKey] || moduleKey}
                    componentName={component}
                    moduleKey={moduleKey}
                    value={value}
                    data={data}
                    moduleData={moduleData}
                />,
            );
        });
    });

    // Eğer hiç measurement uncertainty kaydı yoksa hesaplanmış belirsizlik özeti ekle
    const measurementSummary = asRecord(moduleData.MEASUREMENT_UNCERTAINTY?.summary).rows;
    if ((!Array.isArray(measurementSummary) || measurementSummary.length === 0) && components.length > 0) {
        counter += 1;
        blocks.push(
            <AuditBlock
                key="MEASUREMENT_UNCERTAINTY-calculated"
                index={counter}
                moduleLabel="Ölçüm Belirsizliği"
                componentName="—"
                moduleKey="MEASUREMENT_UNCERTAINTY_FALLBACK"
                value={{
                    rows: components.map(c => ({
                        component: c.name,
                        expandedUncertainty: calculateExpandedUncertainty(c.name, moduleData),
                    })),
                }}
                data={data}
                moduleData={moduleData}
            />,
        );
    }

    if (blocks.length === 0) {
        return <p className="vr2-copy">Ek data kaydı bulunamadı.</p>;
    }

    return <div>{blocks}</div>;
}

function AuditBlock({
    index,
    moduleLabel,
    componentName,
    moduleKey,
    value,
    data,
    moduleData,
}: {
    index: number;
    moduleLabel: string;
    componentName: string;
    moduleKey: string;
    value: unknown;
    data: ReportData;
    moduleData: Record<string, Record<string, unknown>>;
}) {
    const criteria = moduleCriteria[moduleKey] || {
        criterion: "Modül için spesifik kriter tanımlanmamış.",
        rule: "Hesaplama yöntemi modüle göre uygulanır.",
    };
    const evaluation = evaluateModule(moduleKey, value, data, moduleData, componentName);

    // Ölçüm Belirsizliği bloğunda sadece VERİLER kartı gösterilir.
    // (Bu modülde hesaplama/kabul kriteri/sonuç ayrı kartlar olarak gerekmiyor;
    // veriler zaten bütçe tablosu olarak yeterli.)
    const showExtraCards = moduleKey !== "MEASUREMENT_UNCERTAINTY"
        && moduleKey !== "MEASUREMENT_UNCERTAINTY_FALLBACK";

    // Modül açıklaması: önce kullanıcının ilgili modül formundaki notes/notlar alanını
    // dener; boşsa varsayılan tanımlı metni kullanır. Bu blok her audit kartının
    // hemen üstünde, başlığın altında küçük italik italik bir paragraf olarak çıkar.
    const moduleNotes = (() => {
        const rec = asRecord(value);
        const noteFromValue = typeof rec.notes === "string" ? rec.notes.trim() : "";
        if (noteFromValue) return noteFromValue;
        return getDefaultModuleDescription(moduleKey);
    })();

    return (
        <div className="vr2-audit-block">
            <div className="vr2-audit-header">
                <span className="vr2-audit-index">Ek-1.{index}</span>
                <span className="vr2-audit-title">{moduleLabel}</span>
                <span className="vr2-audit-component">{componentName}</span>
            </div>

            {moduleNotes && (
                <div className="vr2-audit-description">
                    {moduleNotes.split(/\n+/).filter(Boolean).map((line, i) => (
                        <p key={i} className="vr2-copy" style={{ margin: "0 0 2mm" }}>{line}</p>
                    ))}
                </div>
            )}

            <div className="vr2-audit-card">
                <div className="vr2-audit-card-title">VERİLER</div>
                {renderAuditData(moduleKey, value, data)}
            </div>

            {showExtraCards && (
                <>
                    <div className="vr2-audit-card">
                        <div className="vr2-audit-card-title">HESAPLAMA</div>
                        {renderAuditCalculation(moduleKey, value, criteria.rule, data)}
                    </div>

                    <div className="vr2-audit-card">
                        <div className="vr2-audit-card-title">KABUL KRİTERİ</div>
                        <p className="vr2-copy"><strong>Kriter:</strong> {criteria.criterion}</p>
                    </div>

                    <div className="vr2-audit-card">
                        <div className="vr2-audit-card-title">SONUÇ</div>
                        {renderAuditResult(moduleKey, value, evaluation)}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Audit renderers per module ──────────────────────────────────────────────

function renderAuditData(moduleKey: string, value: unknown, data: ReportData): React.ReactNode {
    const record = asRecord(value);

    if (moduleKey === "LOD_LOQ") {
        const rows = Array.isArray(record.rows) ? record.rows : [];
        if (rows.length === 0) return <p className="vr2-empty">Veri kaydedilmemiş.</p>;

        // rows[i] is string[] aligned with personnel order (each column = analyst)
        const analystNames = (data.personnel || []).map(p => p.name);
        const maxCols = Math.max(analystNames.length, ...rows.map(r => Array.isArray(r) ? r.length : 1));
        const headers = ["Tekrar", ...Array.from({ length: maxCols }, (_, i) => analystNames[i] || `Analist ${i + 1}`)];

        const flatRows: Array<Array<React.ReactNode>> = rows.map((row, i) => {
            const cells = Array.isArray(row) ? row : [row];
            const padded = Array.from({ length: maxCols }, (_, ci) => {
                const v = cells[ci];
                return v === "" || v === undefined || v === null ? "-" : textValue(v);
            });
            return [i + 1, ...padded];
        }).filter(row => row.slice(1).some(c => c !== "-"));

        if (flatRows.length === 0) return <p className="vr2-empty">Tüm hücreler boş.</p>;

        const unitText = unitLabel(record.unitLabel || record.unit);
        return (
            <>
                <DataTable headers={headers} rows={flatRows} />
                {unitText && unitText !== "-" && (
                    <p className="vr2-copy" style={{ marginTop: "1.5mm" }}>
                        <strong>Birim:</strong> {unitText}
                    </p>
                )}
            </>
        );
    }

    if (moduleKey === "LINEARITY") {
        // ÖNEMLİ: Önce HAM rows (LinearityPoint formatı — level/concentrations/responses)
        // okunur. Bu, kullanıcının formda girdiği orijinal değerlerdir.
        //
        // statistics.rows fallback olarak kullanılır AMA bazı eski kayıtlarda
        // statistics.rows[].x ve .y alanları regresyondan türetilmiş değerler
        // (xi ve yPredicted) ile karıştırılmıştı (form bug fix öncesi). Bu yüzden
        // önce ham rows tercih ediliyor — orijinal kullanıcı verisi her zaman doğru.

        const rawRows = Array.isArray(record.rows) ? record.rows : [];
        const flat: Array<Array<React.ReactNode>> = [];
        rawRows.forEach(point => {
            const p = asRecord(point);
            const level = typeof p.level === "string" ? p.level : "-";
            const concs = Array.isArray(p.concentrations) ? p.concentrations : [];
            const resps = Array.isArray(p.responses) ? p.responses : [];
            const len = Math.max(concs.length, resps.length);
            for (let i = 0; i < len; i++) {
                const c = concs[i];
                const r = resps[i];
                if ((c === "" || c === undefined) && (r === "" || r === undefined)) continue;
                flat.push([level, i + 1, textValue(c ?? "-"), textValue(r ?? "-"), unitLabel(record.unit)]);
            }
        });

        if (flat.length > 0) {
            return (
                <DataTable
                    headers={["Düzey", "Tekrar", "Konsantrasyon (x)", "Cihaz Yanıtı (y)", "Birim"]}
                    columnWidths={["14%", "12%", "26%", "26%", "22%"]}
                    rows={flat}
                />
            );
        }

        // Ham veri yoksa statistics.rows'a düş — yeni form bug fix sonrası
        // statistics.rows[].x ve .y orijinal değerleri tutar.
        const statRows = Array.isArray(asRecord(record.statistics).rows) ? asRecord(record.statistics).rows as unknown[] : [];
        if (statRows.length > 0) {
            return (
                <DataTable
                    headers={["Sıra", "Konsantrasyon (x)", "Cihaz Yanıtı (y)", "Birim"]}
                    columnWidths={["12%", "32%", "32%", "24%"]}
                    rows={statRows.map((row, i) => {
                        const r = asRecord(row);
                        return [i + 1, numberValue(r.x, 5), numberValue(r.y, 5), unitLabel(record.unit)];
                    })}
                />
            );
        }

        return <p className="vr2-empty">Doğrusallık ölçüm verisi kaydedilmemiş.</p>;
    }

    if (moduleKey === "PRECISION_REPEATABILITY") {
        const rawData = asRecord(record.rawData);
        const rows: Array<Array<React.ReactNode>> = [];
        Object.entries(rawData).forEach(([levelKey, analystMap]) => {
            const analysts = asRecord(analystMap);
            Object.entries(analysts).forEach(([analyst, gridValue]) => {
                const grid = Array.isArray(gridValue) ? gridValue : [];
                grid.forEach((row, rowIndex) => {
                    const cells = Array.isArray(row) ? row.map(textValue) : [textValue(row)];
                    rows.push([fieldLabel(levelKey), analyst, rowIndex + 1, ...cells]);
                });
            });
        });

        if (rows.length === 0) return <p className="vr2-empty">Paralel ölçüm verisi kaydedilmemiş.</p>;
        const maxCols = Math.max(...rows.map(r => r.length));
        const parallelCount = Math.max(0, maxCols - 3);
        // ════════════════════════════════════════════════════════════════════
        // TEKRARLANABİLİRLİK — VERİLER TABLOSU SÜTUN GENİŞLİKLERİ
        // (Düzey / Analist / Tekrar / P1, P2, P3 …)
        // Aşağıdaki üç sayıyı değiştirerek sütunları ayarlayabilirsin.
        // TOPLAM 100'ü AŞMASIN. Paralel sütunlar kalan alana eşit dağıtılır.
        // Birim sadece sayı (% otomatik eklenir).
        // ════════════════════════════════════════════════════════════════════
        const REP_DATA_DUZEY_W = 18;     // "Düzey" sütunu  — örn. 14-22
        const REP_DATA_ANALIST_W = 22;   // "Analist" sütunu — örn. 16-30
        const REP_DATA_TEKRAR_W = 14;    // "Tekrar" sütunu  — örn. 10-18  ← bu değeri arttırırsan genişler
        // ────────────────────────────────────────────────────────────────────
        const remainingForParallels = Math.max(
            5,
            100 - REP_DATA_DUZEY_W - REP_DATA_ANALIST_W - REP_DATA_TEKRAR_W,
        );
        const parallelColWidth = parallelCount > 0
            ? `${(remainingForParallels / parallelCount).toFixed(1)}%`
            : "10%";
        const repeatabilityDataWidths = [
            `${REP_DATA_DUZEY_W}%`,
            `${REP_DATA_ANALIST_W}%`,
            `${REP_DATA_TEKRAR_W}%`,
            ...Array.from({ length: parallelCount }, () => parallelColWidth),
        ];
        // ════════════════════════════════════════════════════════════════════
        return (
            <DataTable
                headers={["Düzey", "Analist", "Tekrar", ...Array.from({ length: parallelCount }, (_, i) => `P${i + 1}`)]}
                columnWidths={repeatabilityDataWidths}
                rows={rows.map(r => [...r, ...Array.from({ length: maxCols - r.length }, () => "-")])}
            />
        );
    }

    if (moduleKey === "PRECISION_REPRODUCIBILITY") {
        const rows = Array.isArray(record.rows) ? record.rows : [];
        const analysts = Array.isArray(record.analysts) ? record.analysts.map(a => String(a)) : [];
        if (rows.length === 0) return <p className="vr2-empty">Gün bazlı veri kaydedilmemiş.</p>;
        const maxValueCount = Math.max(
            ...rows.map(row => Array.isArray(asRecord(row).values) ? (asRecord(row).values as unknown[]).length : 0),
            analysts.length,
        );
        return (
            <DataTable
                headers={["Gün / Tarih", ...Array.from({ length: maxValueCount }, (_, i) => analysts[i] || `Analist ${i + 1}`)]}
                rows={rows.map(row => {
                    const r = asRecord(row);
                    const values = Array.isArray(r.values) ? r.values : [];
                    return [
                        textValue(r.date),
                        ...Array.from({ length: maxValueCount }, (_, i) => textValue(values[i])),
                    ];
                })}
            />
        );
    }

    if (moduleKey === "TRUENESS") {
        const rows = Array.isArray(record.rows) ? record.rows : [];
        const analysts = Array.isArray(record.analysts) ? record.analysts.map(a => String(a)) : [];
        const target = textValue(record.target);
        const matrix = textValue(record.matrix);
        const unitTxt = unitLabel(record.unitLabel || record.unit);
        const results = asRecord(record.results);

        if (rows.length === 0) return <p className="vr2-empty">Geri kazanım verisi kaydedilmemiş.</p>;

        const maxColumns = Math.max(...rows.map(row => Array.isArray(row) ? row.length : 0), analysts.length);

        // Ölçülen değerler tablosu
        const measuredRows: Array<Array<React.ReactNode>> = rows.map((row, i) => [
            i + 1,
            ...Array.from({ length: maxColumns }, (_, ci) => Array.isArray(row) ? textValue(row[ci]) : "-"),
        ]).filter(row => row.slice(1).some(c => c !== "-" && c !== ""));

        // Geri kazanım % tablosu — results[analyst].recoveries[i].recovery
        const recoveryRows: Array<Array<React.ReactNode>> = [];
        const maxRecoveryCount = Math.max(
            0,
            ...analysts.map(a => {
                const rec = asRecord(results[a]).recoveries;
                return Array.isArray(rec) ? rec.length : 0;
            }),
        );

        for (let i = 0; i < maxRecoveryCount; i++) {
            const cells: React.ReactNode[] = [i + 1];
            for (let ai = 0; ai < analysts.length; ai++) {
                const rec = asRecord(results[analysts[ai]]).recoveries;
                const item = Array.isArray(rec) ? asRecord(rec[i]) : {};
                const rv = parseNumeric(item.recovery);
                cells.push(Number.isFinite(rv) ? `${numberValue(rv, 2)}%` : "-");
            }
            recoveryRows.push(cells);
        }

        return (
            <>
                {(target !== "-" || matrix !== "-") && (
                    <KeyValueTable
                        rows={[
                            ["Matriks", matrix],
                            ["Hedef Değer", target],
                            ["Birim", unitTxt || "-"],
                        ]}
                    />
                )}
                <Subsection title="Ölçülen Değerler">
                    <DataTable
                        headers={["Tekrar", ...Array.from({ length: maxColumns }, (_, i) => analysts[i] || `Analist ${i + 1}`)]}
                        rows={measuredRows}
                        empty="Ölçüm verisi yok."
                    />
                </Subsection>
                {recoveryRows.length > 0 && (
                    <Subsection title="Geri Kazanım Sonuçları (%)">
                        <DataTable
                            headers={["Tekrar", ...analysts]}
                            rows={recoveryRows}
                        />
                    </Subsection>
                )}
            </>
        );
    }

    if (moduleKey === "SAMPLE_PREPARATION") {
        const volumetric = Array.isArray(record.volumetric) ? record.volumetric : [];
        const chemicals = Array.isArray(record.chemicals) ? record.chemicals : [];
        return (
            <>
                <Subsection title="Hacimsel Malzeme / Cihaz">
                    <DataTable
                        headers={["Kod", "Ekipman", "Birim", "Kullanılan", "Dağılım", "Std. Belirsizlik"]}
                        columnWidths={["10%", "35%", "10%", "15%", "15%", "18%"]}
                        rows={volumetric.map(item => {
                            const r = asRecord(item);
                            return [
                                textValue(r.code),
                                textValue(r.name),
                                textValue(r.unit),
                                textValue(r.value),
                                textValue(r.distribution),
                                numberValue(r.standardUncertainty, 5),
                            ];
                        })}
                        empty="Hacimsel malzeme belirsizliği yok."
                    />
                </Subsection>
                <Subsection title="Standart / Kimyasal Belirsizlikleri">
                    <DataTable
                        headers={["Kod", "Standart", "Saflık", "Dağılım", "Std. Belirsizlik"]}
                        columnWidths={["10%", "35%", "13%", "17%", "25%"]}
                        rows={chemicals.map(item => {
                            const r = asRecord(item);
                            return [
                                textValue(r.code),
                                textValue(r.name),
                                textValue(r.purity),
                                textValue(r.distribution),
                                numberValue(r.standardUncertainty, 5),
                            ];
                        })}
                        empty="Standart belirsizliği yok."
                    />
                </Subsection>
            </>
        );
    }

    if (moduleKey === "MEASUREMENT_UNCERTAINTY") {
        const rows = Array.isArray(record.rows) ? record.rows : [];
        if (rows.length === 0) return <p className="vr2-empty">Bileşen verisi kaydedilmemiş.</p>;
        // Ölçüm Belirsizliği bütçesi — MU formundaki tablonun aynı 8 sütunu.
        // "Toplam Numune Hazırlama" = RSS(samplePreparation + standardUncertainty)
        // MU formundaki totalSamplePreparation alanından doğrudan okunur; eski
        // kayıtlar için fallback olarak iki bileşenden RSS hesaplanır.
        //
        // Tüm sayı sütunları "vr2-num" class'ı ile tabular-nums + nowrap görüntülenir
        // (alt satıra kaymaz, tablo responsive kalır — print sırasında da sığar).
        const fmt = (value: unknown) => (
            <span className="vr2-num">{numberValue(value, 4)}</span>
        );
        const rssTwo = (a: unknown, b: unknown) => {
            const av = Number(a), bv = Number(b);
            const finite = [av, bv].filter(Number.isFinite);
            if (finite.length === 0) return Number.NaN;
            return Math.sqrt(finite.reduce((sum, n) => sum + n * n, 0));
        };
        return (
            <DataTable
                headers={["Etken", "Lineerite", "Tekr.", "Tekr.Ürt.", "Geri Kz.", "Toplam Num. Hzr.", "uc (Toplam)", "U (Geniş.)"]}
                columnWidths={["18%", "10%", "10%", "11%", "10%", "15%", "12%", "14%"]}
                rows={rows.map(row => {
                    const r = asRecord(row);
                    // Önce kayıtlı totalSamplePreparation kullan, yoksa hesapla
                    const savedTotal = Number(r.totalSamplePreparation);
                    const total = Number.isFinite(savedTotal) ? savedTotal : rssTwo(r.samplePreparation, r.standardUncertainty);
                    return [
                        textValue(r.component),
                        fmt(r.linearity),
                        fmt(r.repeatability),
                        fmt(r.reproducibility),
                        fmt(r.trueness),
                        fmt(total),
                        fmt(r.combinedStandardUncertainty),
                        fmt(r.expandedUncertainty),
                    ];
                })}
            />
        );
    }

    if (moduleKey === "MEASUREMENT_UNCERTAINTY_FALLBACK") {
        const rows = Array.isArray(record.rows) ? record.rows : [];
        if (rows.length === 0) return <p className="vr2-empty">Hesaplanabilecek belirsizlik bileşeni yok.</p>;
        return (
            <DataTable
                headers={["Etken Madde", "Hesaplanan Genişletilmiş Belirsizlik (U)"]}
                columnWidths={["55%", "45%"]}
                rows={rows.map(row => {
                    const r = asRecord(row);
                    return [textValue(r.component), numberValue(r.expandedUncertainty, 5)];
                })}
            />
        );
    }

    // Fallback
    return renderGenericObject(value);
}

function renderAuditCalculation(moduleKey: string, value: unknown, formulaHint: string, _data: ReportData): React.ReactNode {
    void _data;
    const record = asRecord(value);

    if (moduleKey === "LOD_LOQ") {
        return (
            <>
                <FormulaLine label="Formül">LOD = x̄ + 3 · s ; LOQ = x̄ + 10 · s</FormulaLine>
                <KeyValueTable
                    rows={[
                        ["Ortalama (x̄)", numberValue(record.mean, 5)],
                        ["Standart Sapma (s)", numberValue(record.stdDev, 5)],
                        ["LOD", numberValue(record.lod, 5)],
                        ["LOQ", numberValue(record.loq, 5)],
                        ["Birim", unitLabel(record.unitLabel || record.unit)],
                    ]}
                />
            </>
        );
    }

    if (moduleKey === "LINEARITY") {
        const stats = asRecord(record.statistics);
        const slope = parseNumeric(stats.slope ?? record.slope);
        const rSquared = parseNumeric(stats.rSquared ?? record.rSquared);
        // Korelasyon katsayısı R: kaydedilmemişse rSquared'tan türet
        // R = sign(slope) × √R²  (lineer regresyonda sign eğimle aynıdır)
        let correlation = parseNumeric(stats.r);
        if (!Number.isFinite(correlation) && Number.isFinite(rSquared) && rSquared >= 0) {
            const sign = Number.isFinite(slope) && slope < 0 ? -1 : 1;
            correlation = sign * Math.sqrt(rSquared);
        }
        return (
            <>
                <FormulaLine label="Regresyon">y = a·x + b   (en küçük kareler)</FormulaLine>
                <KeyValueTable
                    rows={[
                        ["Eğim (a)", numberValue(slope, 5)],
                        ["Kesişim (b)", numberValue(stats.intercept ?? record.intercept, 5)],
                        ["Korelasyon (R)", numberValue(correlation, 5)],
                        ["Determinasyon (R²)", numberValue(rSquared, 5)],
                        ["Aralık", formatLinearityRange(record.range, record.unit)],
                        ["Birim", unitLabel(record.unit)],
                    ]}
                />
                <LinearityChart record={record} />
            </>
        );
    }

    if (moduleKey === "PRECISION_REPEATABILITY") {
        const levels = Array.isArray(record.levels) ? record.levels : [];
        // ────────────────────────────────────────────────────────────────────
        // Tekrarlanabilirlik HESAPLAMA — düzey bazlı analist istatistikleri.
        // "Düşük Seviye / Orta Seviye / Yüksek Seviye" alt başlıklarının
        // altında çıkan tablonun sütun genişlikleri burada ayarlanır.
        const repeatabilityCalcWidths = ["28%", "8%", "18%", "18%", "14%", "14%"];
        // ────────────────────────────────────────────────────────────────────
        return (
            <>
                <FormulaLine label="Formül">RSDr (%) = (s / x̄) · 100 ; r = 2,83 · Sr</FormulaLine>
                {levels.map((level, idx) => {
                    const lr = asRecord(level);
                    const analystStats = asRecord(lr.analysts);
                    const label = typeof lr.label === "string" && lr.label.trim() ? lr.label : `Düzey ${idx + 1}`;
                    return (
                        <Subsection key={`rep-lvl-${idx}`} title={label}>
                            <DataTable
                                headers={["Analist", "n", "Ortalama", "Std. Sapma", "RSDr", "r"]}
                                columnWidths={repeatabilityCalcWidths}
                                rows={Object.entries(analystStats).map(([analyst, stats]) => {
                                    const s = asRecord(stats);
                                    return [
                                        analyst,
                                        textValue(s.n),
                                        numberValue(s.mean, 5),
                                        numberValue(s.stdDev, 5),
                                        numberValue(s.rsdr, 5),
                                        numberValue(s.repeatabilityLimit, 5),
                                    ];
                                })}
                                empty="Analist hesap kaydı yok."
                            />
                        </Subsection>
                    );
                })}
            </>
        );
    }

    if (moduleKey === "PRECISION_REPRODUCIBILITY") {
        const result = asRecord(record.result);
        const analystStats = asRecord(result.analystStats);
        return (
            <>
                <FormulaLine label="F Testi">F = s₁² / s₂²   (büyük varyans paya alınır)</FormulaLine>
                <Subsection title="Analist Bazlı Özet">
                    <DataTable
                        headers={["Analist", "n", "Ortalama", "Std. Sapma", "RSDr"]}
                        rows={Object.entries(analystStats).map(([analyst, stats]) => {
                            const s = asRecord(stats);
                            return [
                                analyst,
                                textValue(s.count),
                                numberValue(s.mean, 5),
                                numberValue(s.stdDev, 5),
                                numberValue(s.rsdr, 5),
                            ];
                        })}
                        empty="Hesap kaydı yok."
                    />
                </Subsection>
                <KeyValueTable
                    rows={[
                        ["Havuzlanmış RSD", numberValue(result.pooledRsd, 5)],
                        ["F (Hesap)", numberValue(result.fTest, 5)],
                        ["F (Kritik)", numberValue(result.fCritical, 5)],
                    ]}
                />
            </>
        );
    }

    if (moduleKey === "TRUENESS") {
        const results = asRecord(record.results);
        const recoveryAverages: Array<[string, number]> = [];
        Object.entries(results).forEach(([analyst, value]) => {
            const recs = asRecord(value).recoveries;
            if (!Array.isArray(recs)) return;
            const nums = recs.map(r => parseNumeric(asRecord(r).recovery)).filter(Number.isFinite);
            if (nums.length === 0) return;
            const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
            recoveryAverages.push([analyst, avg]);
        });

        // ════════════════════════════════════════════════════════════════════
        // GERÇEKLİK / GERİ KAZANIM — HESAPLAMA TABLOSU SÜTUN GENİŞLİKLERİ
        // (Analist / n / Ortalama / Std. Sapma / RSD / Ort. Geri Kazanım)
        // Toplam %100. Analist sütununu genişletmek için ilk değeri arttır.
        // ════════════════════════════════════════════════════════════════════
        const truenessCalcWidths = ["26%", "8%", "16%", "16%", "14%", "20%"];
        // ────────────────────────────────────────────────────────────────────
        return (
            <>
                <FormulaLine label="Formül">Geri Kazanım (%) = (Bulunan / Hedef) · 100</FormulaLine>
                <DataTable
                    headers={["Analist", "n", "Ortalama", "Std. Sapma", "RSD", "Ort. Geri Kazanım"]}
                    columnWidths={truenessCalcWidths}
                    rows={Object.entries(results).map(([analyst, value]) => {
                        const r = asRecord(value);
                        const avg = recoveryAverages.find(([a]) => a === analyst)?.[1];
                        return [
                            analyst,
                            textValue(r.n),
                            numberValue(r.mean, 5),
                            numberValue(r.stdDev, 5),
                            numberValue(r.rsd, 5),
                            Number.isFinite(avg) ? `${numberValue(avg, 2)}%` : "-",
                        ];
                    })}
                    empty="Hesap kaydı yok."
                />
            </>
        );
    }

    if (moduleKey === "SAMPLE_PREPARATION") {
        return (
            <>
                <FormulaLine label="Açıklama">{formulaHint}</FormulaLine>
                <p className="vr2-copy" style={{fontSize:"12px"}}>
                    Numune hazırlamada hacimsel ekipman ve standartlardan kaynaklanan belirsizlikler,
                    dağılım türüne göre standart belirsizliğe çevrilir ve raporun ana özetinde
                    bileşen olarak yer alır.
                </p>
            </>
        );
    }

    if (moduleKey === "MEASUREMENT_UNCERTAINTY") {
        const rows = Array.isArray(record.rows) ? record.rows : [];
        return (
            <>
                <FormulaLine label="Birleşik">uc = √(u₁² + u₂² + ... + uₙ²)</FormulaLine>
                <FormulaLine label="Genişletilmiş">U = k · uc   (k = {textValue(record.coverageFactor) || 2})</FormulaLine>
                <DataTable
                    headers={["Etken", "uc (Birleşik)", "U (Genişletilmiş)"]}
                    columnWidths={["40%", "30%", "30%"]}
                    rows={rows.map(row => {
                        const r = asRecord(row);
                        return [
                            textValue(r.component),
                            numberValue(r.combinedStandardUncertainty, 5),
                            numberValue(r.expandedUncertainty, 5),
                        ];
                    })}
                    empty="Hesap kaydı yok."
                />
            </>
        );
    }

    if (moduleKey === "MEASUREMENT_UNCERTAINTY_FALLBACK") {
        const rows = Array.isArray(record.rows) ? record.rows : [];
        return (
            <>
                <FormulaLine label="Not">Bu özet validasyon modüllerinden hesaplanmıştır.</FormulaLine>
                <DataTable
                    headers={["Etken Madde", "Hesaplanan Genişletilmiş Belirsizlik"]}
                    columnWidths={["50%", "50%"]}
                    rows={rows.map(row => {
                        const r = asRecord(row);
                        return [textValue(r.component), numberValue(r.expandedUncertainty, 5)];
                    })}
                />
            </>
        );
    }

    return <p className="vr2-copy">{formulaHint}</p>;
}

function renderAuditResult(moduleKey: string, value: unknown, evaluation: { value: string; verdict: "ok" | "fail" | "na"; note?: string }) {
    const record = asRecord(value);

    let summaryRows: Array<[React.ReactNode, React.ReactNode]> = [];

    if (moduleKey === "LOD_LOQ") {
        summaryRows = [
            ["LOD", numberValue(record.lod, 5)],
            ["LOQ", numberValue(record.loq, 5)],
        ];
    } else if (moduleKey === "LINEARITY") {
        const stats = asRecord(record.statistics);
        summaryRows = [
            ["R²", numberValue(stats.rSquared ?? record.rSquared, 5)],
            ["Aralık", formatLinearityRange(record.range, record.unit)],
        ];
    } else if (moduleKey === "PRECISION_REPRODUCIBILITY") {
        const result = asRecord(record.result);
        summaryRows = [
            ["F (Hesap)", numberValue(result.fTest, 5)],
            ["F (Kritik)", numberValue(result.fCritical, 5)],
            ["Karar", textValue(result.result)],
        ];
    } else if (moduleKey === "PRECISION_REPEATABILITY") {
        const levels = Array.isArray(record.levels) ? record.levels : [];
        summaryRows = levels.map((level, i) => {
            const lr = asRecord(level);
            return [
                `${textValue(lr.label) || `Düzey ${i + 1}`} — Pooled RSD`,
                numberValue(lr.pooledRsd, 5),
            ] as [React.ReactNode, React.ReactNode];
        });
    } else if (moduleKey === "TRUENESS") {
        const results = asRecord(record.results);
        const recoveries = Object.values(results).flatMap(v => {
            const rec = asRecord(v).recoveries;
            return Array.isArray(rec) ? rec.map(r => parseNumeric(asRecord(r).recovery)) : [];
        }).filter(Number.isFinite);
        const avg = recoveries.length > 0 ? recoveries.reduce((a, b) => a + b, 0) / recoveries.length : NaN;
        summaryRows = [
            ["Ortalama Geri Kazanım", Number.isFinite(avg) ? `${numberValue(avg, 2)}%` : "-"],
        ];
    } else if (moduleKey === "MEASUREMENT_UNCERTAINTY") {
        const rows = Array.isArray(record.rows) ? record.rows : [];
        summaryRows = rows.map(row => {
            const r = asRecord(row);
            return [textValue(r.component), numberValue(r.expandedUncertainty, 5)] as [React.ReactNode, React.ReactNode];
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SONUÇ KARTI — ÖZET TABLOSU SÜTUN GENİŞLİĞİ
    // Sol etiket sütununun genişliği. Sağ değer sütunu kalanı alır.
    // Örn: "30%" (etiketler dar) → değer geniş. "55%" (etiketler geniş).
    // ═══════════════════════════════════════════════════════════════════════
    const RESULT_SUMMARY_LABEL_WIDTH = "50%";
    // ───────────────────────────────────────────────────────────────────────
    return (
        <div className="vr2-result-row">
            {summaryRows.length > 0 && (
                <div className="vr2-result-summary">
                    <KeyValueTable rows={summaryRows} labelWidth={RESULT_SUMMARY_LABEL_WIDTH} />
                </div>
            )}
        </div>
    );
}

// ─── Evaluation logic ────────────────────────────────────────────────────────

function evaluateModule(
    moduleKey: string,
    value: unknown,
    data: ReportData,
    moduleData: Record<string, Record<string, unknown>>,
    componentName: string,
): { value: string; verdict: "ok" | "fail" | "na"; note?: string } {
    const record = asRecord(value);

    if (moduleKey === "LINEARITY") {
        const stats = asRecord(record.statistics);
        const r2 = parseNumeric(stats.rSquared ?? record.rSquared);
        if (!Number.isFinite(r2)) return { value: "Değerlendirilemedi", verdict: "na" };
        const ok = r2 >= 0.995;
        return {
            value: ok ? "Uygun" : "Uygun Değil",
            verdict: ok ? "ok" : "fail",
            note: `R² = ${numberValue(r2, 5)} (≥ 0,995)`,
        };
    }

    if (moduleKey === "LOD_LOQ") {
        const loq = parseNumeric(record.loq);
        if (!Number.isFinite(loq)) return { value: "Değerlendirilemedi", verdict: "na" };
        return { value: "Uygun", verdict: "ok", note: `LOQ = ${numberValue(loq, 5)}` };
    }

    if (moduleKey === "PRECISION_REPRODUCIBILITY") {
        const result = asRecord(record.result);
        const f = parseNumeric(result.fTest);
        const fc = parseNumeric(result.fCritical);
        const stated = typeof result.result === "string" ? String(result.result) : "";
        if (!Number.isFinite(f) || !Number.isFinite(fc)) {
            return { value: stated || "Değerlendirilemedi", verdict: stated ? "ok" : "na" };
        }
        const ok = f < fc;
        return {
            value: ok ? "Uygun" : "Uygun Değil",
            verdict: ok ? "ok" : "fail",
            note: `F = ${numberValue(f, 3)} ${ok ? "<" : "≥"} F kritik (${numberValue(fc, 3)})`,
        };
    }

    if (moduleKey === "PRECISION_REPEATABILITY") {
        const levels = Array.isArray(record.levels) ? record.levels : [];
        const allHaveStats = levels.every(level => Number.isFinite(parseNumeric(asRecord(level).pooledRsd)));
        if (levels.length === 0) return { value: "Değerlendirilemedi", verdict: "na" };
        return {
            value: allHaveStats ? "Uygun" : "Eksik veri",
            verdict: allHaveStats ? "ok" : "na",
        };
    }

    if (moduleKey === "TRUENESS") {
        const results = asRecord(record.results);
        const recoveries = Object.values(results).flatMap(v => {
            const rec = asRecord(v).recoveries;
            return Array.isArray(rec) ? rec.map(r => parseNumeric(asRecord(r).recovery)) : [];
        }).filter(Number.isFinite);
        if (recoveries.length === 0) return { value: "Değerlendirilemedi", verdict: "na" };
        const avg = recoveries.reduce((a, b) => a + b, 0) / recoveries.length;
        const ok = avg >= 70 && avg <= 130;
        return {
            value: ok ? "Uygun" : "Uygun Değil",
            verdict: ok ? "ok" : "fail",
            note: `Ort. = ${numberValue(avg, 2)}% (Hedef: 70-130%)`,
        };
    }

    if (moduleKey === "MEASUREMENT_UNCERTAINTY" || moduleKey === "MEASUREMENT_UNCERTAINTY_FALLBACK") {
        const target = data.components?.find(c => c.name === componentName) || data.components?.[0];
        if (!target) return { value: "Değerlendirilemedi", verdict: "na" };
        const u = parseNumeric(getExpandedUncertaintyValue(target, moduleData, true));
        if (!Number.isFinite(u) || u <= 0) return { value: "Değerlendirilemedi", verdict: "na" };
        return {
            value: "Hesaplandı",
            verdict: "ok",
            note: `U = ${numberValue(u, 5)} (k=2 yaklaşımı)`,
        };
    }

    if (moduleKey === "SAMPLE_PREPARATION") {
        const hasData = Array.isArray(record.volumetric) || Array.isArray(record.chemicals);
        return {
            value: hasData ? "Tanımlandı" : "Veri yok",
            verdict: hasData ? "ok" : "na",
        };
    }

    return { value: "Değerlendirilemedi", verdict: "na" };
}

// ─── Reporting unit resolver ─────────────────────────────────────────────────
//
// Birim önceliği:
//   1. meta.reportingUnit (raporda kullanıcının açıkça belirttiği)
//   2. components[i].unit
//   3. LINEARITY modülünden ilk geçen unit (raw code; unitLabel ile çevrilir)
//   4. LOD_LOQ modülünden ilk geçen unit
//   5. Diğer modüllerde unitLabel/unit
//   6. "-"
function resolveReportingUnit(
    data: ReportData,
    moduleData: Record<string, Record<string, unknown>>,
): string {
    const direct = (data.meta.reportingUnit || "").trim();
    if (direct) return unitLabel(direct);

    const componentUnit = data.components?.find(c => (c.unit || "").trim())?.unit;
    if (componentUnit) return unitLabel(componentUnit);

    const modulesToScan = ["LINEARITY", "LOD_LOQ", "PRECISION_REPEATABILITY", "PRECISION_REPRODUCIBILITY", "TRUENESS"];
    for (const key of modulesToScan) {
        const moduleRecord = asRecord(moduleData[key]);
        for (const entry of Object.values(moduleRecord)) {
            const record = asRecord(entry);
            const candidate = record.unit ?? record.unitLabel;
            if (typeof candidate === "string" && candidate.trim()) return unitLabel(candidate);
        }
    }

    return "-";
}

// ─── Reporting example helper ────────────────────────────────────────────────

function getReportingExample(
    data: ReportData,
    moduleData: Record<string, Record<string, unknown>>,
    fallbackUnit: string,
) {
    const component = data.components?.[0]?.name || "etken madde";
    // Birim: kullanıcı isteği — LOD/LOQ çalışmasındaki birim (rapor sayfası bunu
    // meta.reportingUnit üzerinden zaten priority sırası ile veriyor). Bu yüzden
    // fallbackUnit ÖNCELİKLİ, component.unit sonra.
    const componentUnit = unitLabel(fallbackUnit) || unitLabel(data.components?.[0]?.unit) || "birim";
    const uncertainty = data.components?.[0]
        ? getExpandedUncertaintyValue(data.components[0], moduleData, data.components.length === 1)
        : "-";
    const uNum = parseNumeric(uncertainty);
    const result = Number.isFinite(uNum) ? numberValue(10 * uNum, 3) : "-";
    return { component, unit: componentUnit, uncertainty, result };
}

// ─── Generic object fallback ─────────────────────────────────────────────────

function renderGenericObject(value: unknown): React.ReactNode {
    if (Array.isArray(value)) {
        return (
            <DataTable
                headers={["#", "Değer"]}
                columnWidths={["10%", "90%"]}
                rows={value.map((item, i) => [i + 1, renderInlineValue(item)])}
            />
        );
    }
    if (!value || typeof value !== "object") {
        return <p className="vr2-copy">{textValue(value)}</p>;
    }
    return (
        <DataTable
            headers={["Alan", "Değer"]}
            columnWidths={["30%", "70%"]}
            rows={Object.entries(value).map(([key, item]) => [fieldLabel(key), renderInlineValue(item)])}
        />
    );
}

function renderInlineValue(value: unknown): React.ReactNode {
    if (value === null || value === undefined || value === "") return "-";
    if (Array.isArray(value)) {
        if (value.every(item => typeof item !== "object")) return value.join(", ");
        return <pre className="vr2-pre">{JSON.stringify(value, null, 2)}</pre>;
    }
    if (typeof value === "object") return <pre className="vr2-pre">{JSON.stringify(value, null, 2)}</pre>;
    return String(value);
}

function fieldLabel(value: string) {
    return value
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, c => c.toUpperCase());
}

// ─── Layout primitives ───────────────────────────────────────────────────────

function ReportPage({
    pageNumber,
    appendix = false,
    children,
}: {
    pageNumber: number;
    appendix?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className={`vr2-page${appendix ? " vr2-page-appendix" : ""}`} data-page-number={pageNumber}>
            {children}
        </div>
    );
}

function ReportHeader({ title, meta }: { title: string; meta: ReportData["meta"] }) {
    return (
        <div className="vr2-header">
            <div className="vr2-header-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://i.ibb.co/qF5h96GX/Resim1.png" alt="Laboratuvar logosu" />
            </div>
            <div className="vr2-header-title">
                <h1>{title}</h1>
            </div>
            <div className="vr2-header-meta">
                <table>
                    <tbody>
                        <tr><td className="vr2-header-label">Doküman No</td><td>{meta.documentNo || meta.id || "-"}</td></tr>
                        <tr><td className="vr2-header-label">Yayın Tarihi</td><td>{formatDate(meta.publishDate)}</td></tr>
                        <tr><td className="vr2-header-label">Revizyon No</td><td>{meta.revisionNo || "-"}</td></tr>
                        <tr><td className="vr2-header-label">Revizyon Tarihi</td><td>{formatDate(meta.revisionDate)}</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="vr2-section">
            <h2 className="vr2-section-title">{title}</h2>
            {children}
        </section>
    );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="vr2-subsection">
            <h3 className="vr2-subsection-title">{title}</h3>
            {children}
        </div>
    );
}

function DataTable({
    headers,
    rows,
    columnWidths,
    empty = "Kayıtlı veri bulunamadı.",
}: {
    headers: string[];
    rows: Array<Array<React.ReactNode>>;
    columnWidths?: string[];
    empty?: string;
}) {
    const columnCount = headers.length;
    return (
        <table className="vr2-table">
            {columnWidths && (
                <colgroup>
                    {columnWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
            )}
            <thead>
                {/* key={i} kullanıyoruz çünkü başlık metinleri aynı olabilir
                    (ör. aynı analist iki sütunda — duplicate key uyarısına yol açar). */}
                <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
                {rows.length > 0 ? rows.map((row, i) => (
                    <tr key={i}>
                        {row.map((cell, ci) => <td key={ci}>{textValue(cell)}</td>)}
                    </tr>
                )) : (
                    <tr><td colSpan={columnCount} className="vr2-empty-cell">{empty}</td></tr>
                )}
            </tbody>
        </table>
    );
}

function KeyValueTable({
    rows,
    labelWidth = "36%",
}: {
    rows: Array<[React.ReactNode, React.ReactNode]>;
    /**
     * Sol etiket sütununun genişliği. Sağ değer sütunu kalanı alır.
     * Varsayılan: "36%". Örn: "50%", "45%", "30%".
     */
    labelWidth?: string;
}) {
    return (
        <table className="vr2-table vr2-table-kv">
            <colgroup>
                <col style={{ width: labelWidth }} />
                <col />
            </colgroup>
            <tbody>
                {rows.map((row, i) => (
                    <tr key={i}>
                        <td className="vr2-kv-label">{textValue(row[0])}</td>
                        <td>{textValue(row[1])}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function FormulaLine({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="vr2-formula">
            <span className="vr2-formula-label">{label}:</span>
            <span className="vr2-formula-value">{children}</span>
        </div>
    );
}

// ─── Doğrusallık grafiği (Ek-1.1) ────────────────────────────────────────────
//
// Lineerite modülünde kaydedilmiş `points` veya `statistics.rows` üzerinden
// inline SVG saçılım grafiği + regresyon doğrusu çizer. Recharts'a bağımlı
// değildir; print sırasında bozulmaz.
function LinearityChart({ record }: { record: Record<string, unknown> }) {
    const stats = asRecord(record.statistics);

    // Veri noktalarını topla — önce explicit points, yoksa statistics.rows
    type Pt = { x: number; y: number };
    const measurePoints: Pt[] = [];
    if (Array.isArray(record.points)) {
        record.points.forEach(item => {
            const r = asRecord(item);
            if (r.type !== "measure") return;
            const x = parseNumeric(r.x);
            const y = parseNumeric(r.y);
            if (Number.isFinite(x) && Number.isFinite(y)) measurePoints.push({ x, y });
        });
    }
    if (measurePoints.length === 0 && Array.isArray(stats.rows)) {
        stats.rows.forEach(row => {
            const r = asRecord(row);
            const x = parseNumeric(r.x);
            const y = parseNumeric(r.y);
            if (Number.isFinite(x) && Number.isFinite(y)) measurePoints.push({ x, y });
        });
    }
    // Ham LinearityPoint'ten de düzleştir
    if (measurePoints.length === 0 && Array.isArray(record.rows)) {
        record.rows.forEach(item => {
            const p = asRecord(item);
            const concs = Array.isArray(p.concentrations) ? p.concentrations : [];
            const resps = Array.isArray(p.responses) ? p.responses : [];
            const len = Math.min(concs.length, resps.length);
            for (let i = 0; i < len; i++) {
                const x = parseNumeric(concs[i]);
                const y = parseNumeric(resps[i]);
                if (Number.isFinite(x) && Number.isFinite(y)) measurePoints.push({ x, y });
            }
        });
    }

    if (measurePoints.length < 2) {
        return <p className="vr2-empty" style={{ marginTop: "2mm" }}>Grafik çizmek için yeterli veri yok.</p>;
    }

    const slope = parseNumeric(stats.slope ?? record.slope);
    const intercept = parseNumeric(stats.intercept ?? record.intercept);
    const rSquared = parseNumeric(stats.rSquared ?? record.rSquared);
    const equation = typeof record.equation === "string" ? record.equation : "";

    // Eksenler
    const xs = measurePoints.map(p => p.x);
    const ys = measurePoints.map(p => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xPadding = (xMax - xMin) * 0.05 || 1;
    const yPadding = (yMax - yMin) * 0.05 || 1;
    const xLow = xMin - xPadding;
    const xHigh = xMax + xPadding;
    const yLow = yMin - yPadding;
    const yHigh = yMax + yPadding;

    // SVG koordinatları (viewBox)
    const W = 600;
    const H = 320;
    const PAD = { top: 30, right: 30, bottom: 50, left: 70 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const sx = (x: number) => PAD.left + ((x - xLow) / (xHigh - xLow)) * plotW;
    const sy = (y: number) => PAD.top + (1 - (y - yLow) / (yHigh - yLow)) * plotH;

    // Regresyon doğrusu — slope+intercept varsa onu kullan, yoksa veri uç noktaları
    const lineX1 = xLow;
    const lineX2 = xHigh;
    const useLine = Number.isFinite(slope) && Number.isFinite(intercept);
    const lineY1 = useLine ? slope * lineX1 + intercept : ys[0];
    const lineY2 = useLine ? slope * lineX2 + intercept : ys[ys.length - 1];

    // Tick'ler
    const xTicks = 5;
    const yTicks = 5;
    const formatTick = (n: number) => {
        if (Math.abs(n) >= 1000 || (n !== 0 && Math.abs(n) < 0.001)) return n.toExponential(2);
        const decimals = Math.abs(n) < 1 ? 3 : Math.abs(n) < 10 ? 2 : 1;
        return n.toFixed(decimals);
    };

    return (
        <div className="vr2-chart" style={{ marginTop: "3mm" }}>
            <div className="vr2-chart-title">Kalibrasyon Eğrisi</div>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="Doğrusallık kalibrasyon grafiği"
            >
                {/* Plot arka plan */}
                <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="#fafbfc" stroke="#94a3b8" strokeWidth="1" />

                {/* Yatay grid */}
                {Array.from({ length: yTicks + 1 }, (_, i) => {
                    const y = yLow + (i / yTicks) * (yHigh - yLow);
                    const py = sy(y);
                    return (
                        <g key={`gy-${i}`}>
                            <line x1={PAD.left} y1={py} x2={PAD.left + plotW} y2={py} stroke="#e2e8f0" strokeWidth="0.7" />
                            <text x={PAD.left - 6} y={py + 4} fontSize="11" textAnchor="end" fill="#475569" fontFamily="Tahoma, Arial, sans-serif">{formatTick(y)}</text>
                        </g>
                    );
                })}

                {/* Dikey grid */}
                {Array.from({ length: xTicks + 1 }, (_, i) => {
                    const x = xLow + (i / xTicks) * (xHigh - xLow);
                    const px = sx(x);
                    return (
                        <g key={`gx-${i}`}>
                            <line x1={px} y1={PAD.top} x2={px} y2={PAD.top + plotH} stroke="#e2e8f0" strokeWidth="0.7" />
                            <text x={px} y={PAD.top + plotH + 16} fontSize="11" textAnchor="middle" fill="#475569" fontFamily="Tahoma, Arial, sans-serif">{formatTick(x)}</text>
                        </g>
                    );
                })}

                {/* Eksen başlıkları */}
                <text x={PAD.left + plotW / 2} y={H - 8} fontSize="12" textAnchor="middle" fill="#0f172a" fontFamily="Tahoma, Arial, sans-serif" fontWeight="700">
                    Konsantrasyon (x){unitLabel(record.unit) ? ` — ${unitLabel(record.unit)}` : ""}
                </text>
                <text x={18} y={PAD.top + plotH / 2} fontSize="12" textAnchor="middle" fill="#0f172a" fontFamily="Tahoma, Arial, sans-serif" fontWeight="700" transform={`rotate(-90 18 ${PAD.top + plotH / 2})`}>
                    Cihaz Yanıtı (y)
                </text>

                {/* Regresyon doğrusu */}
                <line
                    x1={sx(lineX1)}
                    y1={sy(lineY1)}
                    x2={sx(lineX2)}
                    y2={sy(lineY2)}
                    stroke="#16a34a"
                    strokeWidth="2"
                />

                {/* Veri noktaları */}
                {measurePoints.map((p, i) => (
                    <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="4" fill="#1d4ed8" stroke="#ffffff" strokeWidth="1" />
                ))}

                {/* Regresyon denklemi + R² */}
                <g>
                    <rect x={PAD.left + 6} y={PAD.top + 6} width="180" height="34" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.7" rx="2" />
                    <text x={PAD.left + 12} y={PAD.top + 20} fontSize="11" fill="#0f172a" fontFamily="Tahoma, Arial, sans-serif">
                        {equation || (useLine ? `y = ${numberValue(slope, 4)} x + ${numberValue(intercept, 4)}` : "")}
                    </text>
                    <text x={PAD.left + 12} y={PAD.top + 34} fontSize="11" fill="#0f172a" fontFamily="Tahoma, Arial, sans-serif">
                        R² = {numberValue(rSquared, 5)}
                    </text>
                </g>
            </svg>
        </div>
    );
}

function SignatureBlock({ analyst }: { analyst?: string }) {
    return (
        <div className="vr2-signatures">
            <Signature title="HAZIRLAYAN" name={analyst || "Analist"} role="Kimyasal Analiz Lab. Personeli" />
            <Signature title="KONTROL EDEN" name="Laboratuvar Sorumlusu" role="Kimyasal Analiz Lab. Sorumlusu" />
            <Signature title="ONAYLAYAN" name="Laboratuvar Müdürü" role="Laboratuvar Müdürü" />
        </div>
    );
}

function Signature({ title, name, role }: { title: string; name: string; role: string }) {
    return (
        <div className="vr2-signature">
            <div className="vr2-signature-title">{title}</div>
            <div className="vr2-signature-name">{name}</div>
            <div className="vr2-signature-role">{role}</div>
        </div>
    );
}

// ─── Static reference data ───────────────────────────────────────────────────

const statisticalBasisRows: Array<[string, string, string, string]> = [
    [
        "Doğrusallık / Kalibrasyon",
        "En küçük kareler doğrusal regresyonu ile y = ax + b modeli kurulur. Korelasyon ve determinasyon katsayısı çalışma aralığında kabul edilebilirliği destekler.",
        "a = Σ((xi - x̄)(yi - ȳ)) / Σ((xi - x̄)²); b = ȳ - a x̄; R² = 1 - SSres / SStot",
        "Kalibrasyon noktaları çalışma aralığını temsil etmeli; artıklar ve R² birlikte yorumlanır.",
    ],
    [
        "LOD / LOQ",
        "Kör, düşük seviye veya tekrarlı çalışma verilerinden standart sapma hesaplanır. Tespit ve tayin sınırları ortalama sinyale eklenen standart sapma katsayılarıyla belirlenir.",
        "LOD = x̄ + 3s; LOQ = x̄ + 10s",
        "x̄ tekrarların ortalaması, s standart sapmadır.",
    ],
    [
        "Tekrarlanabilirlik",
        "Aynı koşullarda elde edilen paralel sonuçların dağılımı ile ortalama, standart sapma, RSDr ve tekrarlanabilirlik limiti hesaplanır.",
        "RSD% = (s / x̄) x 100; r = 2,83 x Sr",
        "Sr tekrarlanabilirlik standart sapmasıdır. r limiti aynı laboratuvar ve kısa zaman aralığı için kullanılır.",
    ],
    [
        "Tekrarüretilebilirlik",
        "Farklı gün veya analist gruplarından gelen varyanslar karşılaştırılır; uyum F testi ile değerlendirilir.",
        "F = s1² / s2²; F < Fkritik ise varyanslar uyumlu",
        "Büyük varyans paya alınır. Fkritik serbestlik derecesi ve güven düzeyine göre alınır.",
    ],
    [
        "Gerçeklik / Geri Kazanım",
        "Bilinen hedef değere göre ölçülen değerin yüzde geri kazanımı hesaplanır ve metot kabul aralığına göre değerlendirilir.",
        "Geri Kazanım (%) = (Bulunan / Hedef) x 100",
        "Sertifikalı referans malzeme, spike numune veya bilinen konsantrasyonlu çalışma ile uygulanır.",
    ],
    [
        "Standart Belirsizlik",
        "Her belirsizlik bileşeni olasılık dağılımına göre standart belirsizliğe çevrilir.",
        "Dikdörtgen: u = a / √3; üçgen: u = a / √6; normal: u = U / k",
        "a yarı aralık, U sertifikadaki genişletilmiş belirsizlik, k kapsama faktörüdür.",
    ],
    [
        "Birleşik / Genişletilmiş Belirsizlik",
        "Bağımsız standart belirsizlik bileşenleri kareleri toplamının karekökü ile birleştirilir; kapsama faktörü ile genişletilir.",
        "uc = √(u1² + u2² + ... + un²); U = k x uc",
        "Genellikle ~%95 güven için k = 2 kullanılır.",
    ],
    [
        "Sonuçların Raporlanması",
        "Analiz sonucu, ölçüm belirsizliği ve birim birlikte verilir.",
        "Sonuç = x ± U birim",
        "Yuvarlama ve anlamlı basamaklar metoda göre uygulanır.",
    ],
];

const statisticalSources = [
    { label: "Eurachem Guide: The Fitness for Purpose of Analytical Methods, 2nd ed., 2014", url: "https://www.eurachem.org/index.php/publications/pubarch/541-arch-gdmv2014" },
    { label: "Eurachem/CITAC Guide: Quantifying Uncertainty in Analytical Measurement, 3rd ed., 2012", url: "https://eurachem.org/index.php/publications/guides/quam" },
    { label: "JCGM 100:2008, Evaluation of measurement data — Guide to the expression of uncertainty in measurement (GUM)", url: "https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf" },
    { label: "ISO/IEC 17025:2017, General requirements for the competence of testing and calibration laboratories", url: "https://www.iso.org/standard/66912.html" },
];

// ─── Styles ──────────────────────────────────────────────────────────────────

function ReportStyles() {
    // dangerouslySetInnerHTML kullanıyoruz (styled-jsx yerine) — bu sayede
    // renderToString ile server-side render edildiğinde CSS düzgün olarak embed edilir.
    return (
        <style dangerouslySetInnerHTML={{ __html: `
            .vr2-shell {
                width: 100%;
                color: #000000;
                font-family: Tahoma, sans-serif;
            }
            .vr2-print-button {
                position: sticky;
                top: 12px;
                z-index: 5;
                margin: 0 0 14px auto;
                display: block;
                border: 1px solid #0f172a;
                background: #0f172a;
                color: white;
                padding: 9px 18px;
                font-size: 12px;
                font-weight: 700;
                border-radius: 4px;
                cursor: pointer;
            }
            .vr2-page {
                position: relative;
                box-sizing: border-box;
                width: 210mm;
                min-height: 297mm;
                margin: 0 auto 20px;
                background: white;
                padding: 14mm 14mm 16mm;
                box-shadow: 0 8px 28px rgba(15, 23, 42, 0.12);
                font-size: 11px;
                line-height: 1.4;
            }
            .vr2-page::after {
                content: "Bölüm " attr(data-page-number);
                position: absolute;
                right: 14mm;
                bottom: 6mm;
                font-size: 9.5px;
                color: #94a3b8;
                font-style: italic;
            }
            .vr2-header {
                display: grid;
                grid-template-columns: 52mm 1fr 50mm;
                border: 1.5px solid #2a0f0f;
                min-height: 28mm;
                margin-bottom: 8mm;
            }
            .vr2-header-logo,
            .vr2-header-title,
            .vr2-header-meta {
                border-left: 1px solid #0f172a;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 4mm;
            }
            .vr2-header-logo {
                border-left: 0;
            }
            .vr2-header-logo img {
                max-width: 110%;
                max-height: 40mm;
                object-fit: contain;
            }
            .vr2-header-title {
                text-align: center;
                padding: 4mm 6mm;
            }
            .vr2-header-title h1 {
                margin: 0;
                font-size: 15px;
                font-weight: 800;
                line-height: 1.3;
                text-transform: uppercase;
            }
            .vr2-header-meta {
                padding: 0;
                align-items: stretch;
            }
            .vr2-header-meta table {
                width: 100%;
                border-collapse: collapse;
                font-size: 10px;
            }
            .vr2-header-meta td {
                border-bottom: 1px solid #0f172a;
                padding: 3px 8px;
                vertical-align: middle;
            }
            .vr2-header-meta tr:last-child td {
                border-bottom: 0;
            }
            .vr2-header-label {
                width: 26mm;
                font-weight: 700;
                background: #ffffff;
            }
            .vr2-section {
                margin-top: 7mm;
                break-inside: avoid;
            }
            .vr2-section-title {
                margin: 0 0 4mm;
                padding: 2mm 4mm;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                background: #003a85;
                color: white;
                letter-spacing: 0.4px;
                border-radius: 2px;
            }
            .vr2-subsection {
                margin-top: 4mm;
                break-inside: avoid;
            }
            .vr2-subsection-title {
                margin: 0 0 2mm;
                font-size: 13px;
                font-weight: 700;
                color: #003a85;
                letter-spacing: 0.2px;
                text-transform: uppercase;
            }
            .vr2-copy {
                margin: 0 0 3mm;
                font-size: 12px;
                line-height: 1.45;
                color: #000000;
            }
            .vr2-table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
                font-size: 12px;
                margin-bottom: 2mm;
            }
            .vr2-table th,
            .vr2-table td {
                border: 0.6px solid #0c1828;
                padding: 1mm 3mm;
                vertical-align: top;
                overflow-wrap: anywhere;
                word-break: break-word;
            }
            .vr2-table th {
                background: #e2e8f0;
                font-weight: 800;
                text-align: center;
                font-size: 12px;
                letter-spacing: 0.2px;
                color: #071024;
            }
            .vr2-table tbody tr:nth-child(even) td {
                background: #f8fafc;
            }
            /* Sayısal hücreler — alt satıra kaymasınlar (responsive tablo) */
            .vr2-num {
                white-space: nowrap;
                font-variant-numeric: tabular-nums;
                font-feature-settings: "tnum";
                font-size: 0.96em;
            }
            .vr2-table-kv td {
                font-size: 12px;
            }
            .vr2-kv-label {
                font-weight: 700;
                color: #000000;
                background: #ebebeb !important;
            }
            .vr2-empty-cell {
                text-align: center;
                font-style: italic;
                color: #94a3b8;
                padding: 5mm !important;
            }
            .vr2-audit-block {
                margin-top: 6mm;
                padding: 4mm;
                border: 1px solid #cbd5e1;
                border-radius: 3px;
                background: #fcfcfc;
                break-inside: avoid;
                page-break-inside: avoid;
            }
            .vr2-audit-header {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 3mm;
                padding-bottom: 2mm;
                margin-bottom: 3mm;
                border-bottom: 1.5px solid #5f1e1e;
            }
            .vr2-audit-description {
                margin-bottom: 4mm;
                padding: 3mm 4mm;
                background: #f8fafc;
                border-left: 3px solid #1e3a5f;
                border-radius: 2px;
            }
            .vr2-audit-description .vr2-copy {
                font-size: 11.5px;
                line-height: 1.5;
                color: #1f2937;
                text-align: justify;
            }
            .vr2-audit-description .vr2-copy:last-child {
                margin-bottom: 0 !important;
            }
            .vr2-audit-index {
                font-size: 12px;
                font-weight: 800;
                color: white;
                background: #1e3a5f;
                padding: 1.5mm 3mm;
                border-radius: 2px;
            }
            .vr2-audit-title {
                font-size: 12.5px;
                font-weight: 800;
                color: #0f172a;
            }
            .vr2-audit-component {
                font-size: 11px;
                font-weight: 600;
                color: #475569;
                font-style: italic;
            }
            .vr2-audit-card {
                margin-top: 3mm;
            }
            .vr2-audit-card-title {
                display: inline-block;
                font-size: 9.5px;
                font-weight: 800;
                letter-spacing: 0.6px;
                background: #475569;
                color: white;
                padding: 1mm 3mm;
                border-radius: 2px;
                margin-bottom: 2mm;
            }
            .vr2-formula {
                margin: 1mm 0 2.5mm;
                padding: 2mm 3mm;
                background: #f1f5f9;
                border-left: 3px solid #1e3a5f;
                font-size: 12px;
            }
            .vr2-chart {
                margin-top: 3mm;
                padding: 2mm 0;
            }
            .vr2-chart-title {
                font-size: 12px;
                font-weight: 700;
                color: #1e3a5f;
                margin-bottom: 2mm;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
            .vr2-chart svg {
                width: 100%;
                height: auto;
                max-height: 90mm;
                display: block;
                background: #ffffff;
            }
            .vr2-formula-label {
                font-weight: 800;
                color: #1e3a5f;
                margin-right: 2mm;
            }
            .vr2-formula-value {
                color: #0f172a;
            }
            .vr2-result-row {
                display: grid;
                grid-template-columns: 1fr 60mm;
                gap: 3mm;
                align-items: start;
            }
            .vr2-verdict {
                padding: 3mm 2mm;
                border-radius: 3px;
                text-align: center;
                font-weight: 700;
                color: white;
            }
            .vr2-verdict-label {
                display: block;
                font-size: 10px;
                letter-spacing: 0.8px;
                opacity: 0.85;
            }
            .vr2-verdict-value {
                display: block;
                font-size: 14px;
                font-weight: 800;
                margin-top: 1mm;
                letter-spacing: 0.3px;
            }
            .vr2-verdict-note {
                display: block;
                font-size: 12px;
                font-weight: 500;
                margin-top: 1.5mm;
                opacity: 0.9;
                line-height: 1.3;
            }
            .vr2-verdict-ok { background: #15803d; }
            .vr2-verdict-fail { background: #b91c1c; }
            .vr2-verdict-na { background: #64748b; }
            .vr2-empty {
                margin: 1mm 0;
                font-size: 10.5px;
                font-style: italic;
                color: #94a3b8;
            }
            .vr2-source-list {
                margin: 3mm 0 0;
                padding-left: 16px;
                font-size: 10px;
                line-height: 1.4;
            }
            .vr2-source-list li {
                margin-bottom: 2mm;
            }
            .vr2-source-url {
                color: #1e3a5f;
                font-size: 9.5px;
                overflow-wrap: anywhere;
            }
            .vr2-signatures {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 6mm;
                margin-top: 10mm;
                break-inside: avoid;
            }
            .vr2-signature {
                min-height: 30mm;
                text-align: center;
                border-top: 1.5px solid #0f172a;
                padding-top: 2mm;
            }
            .vr2-signature-title {
                font-weight: 800;
                margin-bottom: 18mm;
                font-size: 11px;
                letter-spacing: 0.4px;
            }
            .vr2-signature-name {
                font-weight: 700;
                font-size: 11px;
            }
            .vr2-signature-role {
                font-size: 9.5px;
                color: #475569;
                margin-top: 1mm;
            }
            .vr2-end {
                margin-top: 10mm;
                text-align: center;
                font-weight: 700;
                font-size: 11px;
                letter-spacing: 0.4px;
            }
            .vr2-page-appendix {
                min-height: auto;
            }
            .vr2-pre {
                margin: 0;
                white-space: pre-wrap;
                font-size: 12px;
                line-height: 1.3;
            }

            @media print {
                /* ── A4 + tarayıcı otomatik sayfa numarası ──────────────────── */
                @page {
                    size: A4;
                    margin: 12mm 12mm 14mm 12mm;
                    @bottom-right {
                        content: "Sayfa " counter(page) " / " counter(pages);
                        font-family: Tahoma, Arial, Helvetica, sans-serif;
                        font-size: 10px;
                        color: #475569;
                    }
                }

                /* ── Renkleri ve gri zemini kaldır, tüm ataları beyaza zorla ── */
                * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                html, body {
                    width: auto !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    overflow: visible !important;
                    font-family: Tahoma, Arial, Helvetica, sans-serif !important;
                }
                /* Ana içerik dışında her şeyi gizle (dashboard layout gri kalkar) */
                body > * { background: #ffffff !important; }
                /* Dashboard chrome: navigasyon + sidebar + üst header (Çıkış butonu burada) */
                nav, aside, header, .no-print { display: none !important; }
                /* Sadece "ValidationReport sayfası" altındakileri görünür yap */
                body :where(:not(.vr2-shell):not(.vr2-shell *)) {
                    background: transparent !important;
                }

                .vr2-shell {
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    font-family: Tahoma, Arial, Helvetica, sans-serif !important;
                    color: #000000 !important;
                }

                .vr2-page {
                    width: 100% !important;
                    max-width: 100% !important;
                    min-height: auto !important;
                    margin: 0 !important;
                    padding: 0 0 6mm 0 !important;
                    background: #ffffff !important;
                    box-shadow: none !important;
                    page-break-after: always;
                    break-after: page;
                    overflow: visible !important;
                    /* Ana gövde fontu — kullanıcı isteği: Tahoma + 12px */
                    font-family: Tahoma, Arial, Helvetica, sans-serif !important;
                    font-size: 12px !important;
                    line-height: 1.4 !important;
                    color: #000000 !important;
                }
                .vr2-page::after { display: none !important; }
                .vr2-page:last-of-type {
                    page-break-after: auto;
                    break-after: auto;
                }

                /* ── Üst başlık ──────────────────────────────────────────────── */
                .vr2-header {
                    grid-template-columns: 42mm 1fr 50mm;
                    min-height: 24mm;
                    margin-bottom: 6mm;
                }
                .vr2-header-title h1 {
                    font-size: 13px;
                    line-height: 1.25;
                }
                .vr2-header-meta table {
                    font-size: 11px;
                }
                .vr2-header-meta td {
                    padding: 2.5px 7px;
                }
                .vr2-header-label {
                    width: 24mm;
                }

                /* ── Bölümler ────────────────────────────────────────────────── */
                .vr2-section {
                    margin-top: 5mm;
                    break-inside: auto;
                    page-break-inside: auto;
                }
                .vr2-section-title {
                    margin-bottom: 3mm;
                    padding: 1.8mm 3mm;
                    font-size: 13px;
                    line-height: 1.25;
                }
                .vr2-subsection {
                    margin-top: 3.5mm;
                    break-inside: avoid;
                    page-break-inside: avoid;
                }
                .vr2-subsection-title {
                    font-size: 12px;
                    margin-bottom: 2mm;
                }

                /* ── Body metni: kullanıcı isteği 12px ───────────────────────── */
                .vr2-copy {
                    margin-bottom: 2.5mm;
                    font-size: 12px !important;
                    line-height: 1.4 !important;
                }

                /* ── Tablolar ────────────────────────────────────────────────── */
                .vr2-table {
                    font-size: 11px !important;
                    line-height: 1.3 !important;
                    page-break-inside: auto;
                }
                .vr2-table thead { display: table-header-group; }
                .vr2-table tr {
                    page-break-inside: avoid;
                    break-inside: avoid;
                }
                .vr2-table th,
                .vr2-table td {
                    padding: 1.5mm 2.2mm !important;
                }
                .vr2-table th { font-size: 11px; }
                .vr2-table-kv td { font-size: 11px; }
                /* Print modunda sayısal hücreler sıkışık ama tek satır */
                .vr2-num {
                    white-space: nowrap;
                    font-variant-numeric: tabular-nums;
                    font-size: 10px;
                }

                /* ── Audit blokları (Ek-1) ───────────────────────────────────── */
                .vr2-audit-block {
                    margin-top: 4mm;
                    padding: 3mm;
                    background: #fafbfc !important;
                    break-inside: auto !important;
                    page-break-inside: auto !important;
                }
                .vr2-audit-header {
                    margin-bottom: 2.5mm;
                    padding-bottom: 1.5mm;
                    break-after: avoid;
                    page-break-after: avoid;
                }
                .vr2-audit-description {
                    margin-bottom: 3mm;
                    padding: 2mm 3mm;
                    background: #f1f5f9 !important;
                    border-left: 2.5px solid #1e3a5f;
                    break-inside: avoid;
                    page-break-inside: avoid;
                }
                .vr2-audit-description .vr2-copy {
                    font-size: 10.5px !important;
                    line-height: 1.4 !important;
                }
                /* Kartlar büyük olunca (ör. Doğrusallık VERİLER — çok satırlı tablo)
                   tek parça kalmaya zorlanırsa Chrome alta itip büyük beyaz boşluk
                   bırakıyor. break-inside: auto ile karta izin veriyoruz; iç tablo
                   satırları zaten .vr2-table tr { break-inside: avoid } ile korunuyor. */
                .vr2-audit-card {
                    margin-top: 2.5mm;
                    break-inside: auto;
                    page-break-inside: auto;
                }
                .vr2-audit-card-title {
                    break-after: avoid;
                    page-break-after: avoid;
                    font-size: 10px;
                    padding: 1mm 2.5mm;
                }
                .vr2-audit-index { font-size: 12px; padding: 1mm 2.5mm; }
                .vr2-audit-title { font-size: 12px; }
                .vr2-audit-component { font-size: 11px; }

                /* ── Formül kutusu ───────────────────────────────────────────── */
                .vr2-formula {
                    margin: 1mm 0 2mm;
                    padding: 1.8mm 2.6mm;
                    font-size: 11px;
                }

                /* ── Sonuç rozeti ────────────────────────────────────────────── */
                .vr2-verdict { padding: 2.4mm 3mm; }
                .vr2-verdict-label { font-size: 9px; }
                .vr2-verdict-value { font-size: 13px; }
                .vr2-verdict-note { font-size: 10.5px; }

                /* ── İmza alanları ───────────────────────────────────────────── */
                .vr2-signatures { gap: 6mm; margin-top: 10mm; }
                .vr2-signature { min-height: 24mm; }
                .vr2-signature-title { font-size: 11px; margin-bottom: 12mm; }
                .vr2-signature-name { font-size: 11px; }
                .vr2-signature-role { font-size: 10px; }
                .vr2-end { margin-top: 7mm; font-size: 12px; }

                /* ── Ek-2 kaynak listesi ─────────────────────────────────────── */
                .vr2-source-list { font-size: 11px; margin-top: 2mm; }
                .vr2-source-url { font-size: 10px; }
                .vr2-pre { font-size: 11px; line-height: 1.3; }

                /* ── Doğrusallık grafiği print uyumu ─────────────────────────── */
                .vr2-chart {
                    page-break-inside: avoid;
                    break-inside: avoid;
                }
                .vr2-chart svg { display: block; }
            }
        ` }} />
    );
}
