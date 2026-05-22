"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, FileText, Plus, Save, Trash2 } from "lucide-react";
import type { ReportData, ReportRevision } from "@/components/validation/report/ValidationReport";
import { ValidationReportV2 as ValidationReport } from "@/components/validation/report/ValidationReportV2";
// Geri dönmek için yukarıdaki iki satırı yorum yapıp aşağıdakini açın:
// import { ValidationReport, type ReportData } from "@/components/validation/report/ValidationReport";
import styles from "@/app/styles/table.module.css";

type ValidationDetail = {
    id: number;
    code: string;
    title: string;
    method_code?: string;
    method_name?: string;
    technique?: string;
    matrix?: string;
    personnel?: string[] | string;
    study_type?: string;
    status?: string;
    planned_start_date: string | null;
    planned_end_date: string | null;
    study_date: string | null;
    config?: {
        description?: string;
        methodSource?: string;
        documentNo?: string;
        publishDate?: string;
        revisionNo?: string;
        revisionDate?: string;
        reportingUnit?: string;
        conclusion?: string;
        devices?: Array<{ code?: string; name: string; serialNo?: string; intendedUse?: string }>;
        personnel?: Array<{ id?: string; userId?: number; name: string; role?: string }>;
        components?: Array<{ code?: string; name: string; casNo?: string; limit?: string; unit?: string; uncertaintyValue?: string | number | null; uncertainty_value?: string | number | null }>;
        parameters?: Array<{ id: string; name: string; isEnabled: boolean; note?: string }>;
        moduleData?: Record<string, Record<string, unknown>>;
        revisions?: ReportRevision[];
    };
};

type PersonnelDirectoryRow = {
    id: number;
    username?: string;
    name: string;
    role: string;
};

type InventoryRow = {
    id: number;
    code: string;
    name: string;
    cas_no: string | null;
    limit_info: string | null;
    unit: string | null;
    uncertainty_value?: string | number | null;
    intended_use: string;
};

type ReportPerson = {
    id?: string;
    userId?: number;
    name: string;
    role?: string;
};

const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

const stripValidationSuffix = (value: string) => value.replace(/\s+Validasyonu\s*$/i, "").trim();

const normalizeName = (value: string) =>
    value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");

const isPlaceholderRole = (value?: string) => normalizeName(value || "").includes("yetkili");

function enrichPersonnelRoles(personnel: ReportPerson[], directory: PersonnelDirectoryRow[]) {
    return personnel.map(person => {
        const numericId = Number(person.userId ?? person.id);
        const byId = Number.isFinite(numericId) ? directory.find(row => row.id === numericId) : undefined;
        const personName = normalizeName(person.name);
        const byName = directory.find(row => {
            const directoryName = normalizeName(row.name);
            const username = normalizeName(row.username || "");
            return directoryName === personName
                || username === personName
                || directoryName.includes(personName)
                || personName.includes(directoryName);
        });
        const match = byId || byName;
        return {
            ...person,
            role: match?.role || (isPlaceholderRole(person.role) ? "" : person.role) || "-",
        };
    });
}

function enrichComponentsFromInventory(
    components: Array<{ code?: string; name: string; casNo?: string; limit?: string; unit?: string; uncertaintyValue?: string | number | null; uncertainty_value?: string | number | null }>,
    inventoryRows: InventoryRow[],
) {
    return components.map(component => {
        const configuredCasNo = component.casNo && component.casNo !== "-" ? component.casNo : "";
        const configuredLimit = component.limit && component.limit !== "-" ? component.limit : "";
        const configuredUnit = component.unit && component.unit !== "-" ? component.unit : "";
        const normalizedCode = component.code ? normalizeName(component.code) : "";
        const normalizedComponentName = normalizeName(component.name);
        const match = inventoryRows.find(row => {
            if (row.intended_use !== "Standart") return false;
            const rowCode = normalizeName(row.code || "");
            const rowName = normalizeName(row.name || "");
            return Boolean(normalizedCode && rowCode === normalizedCode)
                || rowName === normalizedComponentName
                || Boolean(rowName && (rowName.includes(normalizedComponentName) || normalizedComponentName.includes(rowName)));
        });

        return {
            ...component,
            casNo: configuredCasNo || match?.cas_no || "",
            limit: configuredLimit || match?.limit_info || "",
            unit: configuredUnit || match?.unit || "",
            uncertaintyValue: component.uncertaintyValue ?? component.uncertainty_value ?? match?.uncertainty_value ?? null,
        };
    });
}

function getReproducibilityDateRange(moduleData: Record<string, Record<string, unknown>>) {
    const reproducibility = moduleData.PRECISION_REPRODUCIBILITY;
    const dates: string[] = [];

    if (reproducibility && typeof reproducibility === "object") {
        Object.values(reproducibility).forEach(value => {
            if (!value || typeof value !== "object") return;
            const rows = (value as { rows?: unknown }).rows;
            if (!Array.isArray(rows)) return;
            rows.forEach(row => {
                if (!row || typeof row !== "object") return;
                const date = (row as { date?: unknown }).date;
                if (typeof date === "string" && date.trim()) dates.push(date.trim());
            });
        });
    }

    const sorted = Array.from(new Set(dates)).sort();
    return {
        start: sorted[0] || null,
        end: sorted[sorted.length - 1] || null,
    };
}

export default function ValidationReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const searchParams = useSearchParams();
    // pdfMode=1 → bu sayfa PDF üretimi için chromium tarafından yükleniyor;
    // butonları gizle, sadece raporu göster.
    const pdfMode = searchParams.get("pdfMode") === "1";
    const [validation, setValidation] = useState<ValidationDetail | null>(null);
    const [personnelDirectory, setPersonnelDirectory] = useState<PersonnelDirectoryRow[]>([]);
    const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    // Rapor başlık bilgileri (Yayın Tarihi / Revizyon No / Revizyon Tarihi)
    // ve Revizyon kayıtları — config'ten yüklenir, kullanıcı düzenler, "Kaydet" ile yazılır.
    const [docPublishDate, setDocPublishDate] = useState("");
    const [docRevisionNo, setDocRevisionNo] = useState("");
    const [docRevisionDate, setDocRevisionDate] = useState("");
    const [revisions, setRevisions] = useState<ReportRevision[]>([]);
    const [savingRevisions, setSavingRevisions] = useState(false);
    const [revisionsStatus, setRevisionsStatus] = useState<{ kind: "idle" | "ok" | "error"; text: string }>({ kind: "idle", text: "" });

    useEffect(() => {
        let alive = true;

        async function loadValidation() {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/eurolab/validations/${id}`, { credentials: "same-origin" });
                const json: ValidationDetail & { error?: string } = await response.json();
                if (!response.ok) throw new Error(json.error || "Validasyon raporu alınamadı.");
                if (alive) {
                    setValidation(json);
                    setRevisions(Array.isArray(json.config?.revisions) ? json.config!.revisions! : []);
                    setDocPublishDate(json.config?.publishDate || "");
                    setDocRevisionNo(json.config?.revisionNo || "");
                    setDocRevisionDate(json.config?.revisionDate || "");
                }
            } catch (err: unknown) {
                if (alive) setError(getErrorMessage(err, "Validasyon raporu alınamadı."));
            } finally {
                if (alive) setLoading(false);
            }
        }

        loadValidation();
        return () => {
            alive = false;
        };
    }, [id]);

    useEffect(() => {
        let alive = true;

        async function loadPersonnelDirectory() {
            try {
                const response = await fetch("/api/eurolab/personnel", { credentials: "same-origin" });
                const json: PersonnelDirectoryRow[] = await response.json();
                if (response.ok && alive && Array.isArray(json)) setPersonnelDirectory(json);
            } catch {
                if (alive) setPersonnelDirectory([]);
            }
        }

        loadPersonnelDirectory();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        let alive = true;

        async function loadInventoryRows() {
            try {
                const components = validation?.config?.components || [];
                const searches = ["", ...components.flatMap(component => [component.name, component.code || ""]).filter(Boolean)];
                const responses = await Promise.all(searches.map(async search => {
                    const params = new URLSearchParams({ search, page: "1", pageSize: "100" });
                    const response = await fetch(`/api/eurolab/inventory?${params.toString()}`, { credentials: "same-origin" });
                    const json: { rows?: InventoryRow[] } = await response.json();
                    return response.ok && Array.isArray(json.rows) ? json.rows : [];
                }));
                const merged = new Map<number, InventoryRow>();
                responses.flat().forEach(row => merged.set(row.id, row));
                if (alive) setInventoryRows(Array.from(merged.values()));
            } catch {
                if (alive) setInventoryRows([]);
            }
        }

        loadInventoryRows();
        return () => {
            alive = false;
        };
    }, [validation]);

    const reportData = useMemo<ReportData | null>(() => {
        if (!validation) return null;
        const config = validation.config || {};
        const configuredPersonnel = config.personnel || [];
        const fallbackPersonnel = Array.isArray(validation.personnel)
            ? validation.personnel.map(name => ({ name, role: "Validasyona katılan personel" }))
            : [];
        const components = enrichComponentsFromInventory(config.components || [], inventoryRows);
        const moduleData = config.moduleData || {};
        const reproducibilityDates = getReproducibilityDateRange(moduleData);
        const personnel = enrichPersonnelRoles(
            configuredPersonnel.length > 0 ? configuredPersonnel : fallbackPersonnel,
            personnelDirectory,
        );

        return {
            description: config.description,
            devices: config.devices || [],
            personnel,
            components,
            parameters: config.parameters || [],
            moduleData,
            revisions,
            meta: {
                title: stripValidationSuffix(validation.title || validation.method_name || "Validasyon Raporu"),
                id: validation.code || String(validation.id),
                method: validation.technique || validation.method_code || "",
                methodCode: validation.method_code || "",
                methodSource: config.methodSource || validation.method_code || "",
                matrix: validation.matrix || "",
                studyType: validation.study_type || "",
                plannedStartDate: reproducibilityDates.start || validation.planned_start_date,
                plannedEndDate: reproducibilityDates.end || validation.planned_end_date,
                documentNo: validation.code || config.documentNo || "K.SOP.16 / Ek-1",
                // Lokal state, config'ten yüklenip kullanıcı düzenleyebilir.
                publishDate: docPublishDate,
                revisionNo: docRevisionNo || "-",
                revisionDate: docRevisionDate || "-",
                reportingUnit: config.reportingUnit || components.find(component => component.unit)?.unit || "",
                conclusion: config.conclusion,
                date: new Date().toLocaleDateString("tr-TR"),
                analyst: personnel[0]?.name || "Analist",
            },
        };
    }, [validation, personnelDirectory, inventoryRows, revisions, docPublishDate, docRevisionNo, docRevisionDate]);

    // ─── Revisions handlers ─────────────────────────────────────────────────
    const addRevision = () => {
        const today = new Date().toISOString().slice(0, 10).split("-").reverse().join("-"); // dd-MM-YYYY
        const nextNo = String(revisions.length + 1).padStart(2, "0");
        setRevisions(prev => [...prev, { revNo: nextNo, date: today, clause: "", reason: "", by: "" }]);
        setRevisionsStatus({ kind: "idle", text: "" });
    };
    const removeRevision = (index: number) => {
        setRevisions(prev => prev.filter((_, i) => i !== index));
        setRevisionsStatus({ kind: "idle", text: "" });
    };
    const updateRevision = (index: number, field: keyof ReportRevision, value: string) => {
        setRevisions(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
        setRevisionsStatus({ kind: "idle", text: "" });
    };
    // Rapor başlık bilgileri + revizyon kayıtlarını birlikte kaydeder.
    const saveRevisions = async () => {
        if (!validation) return;
        setSavingRevisions(true);
        setRevisionsStatus({ kind: "idle", text: "" });
        try {
            const currentConfig = validation.config || {};
            const nextConfig = {
                ...currentConfig,
                publishDate: docPublishDate,
                revisionNo: docRevisionNo,
                revisionDate: docRevisionDate,
                revisions,
            };
            const res = await fetch(`/api/eurolab/validations/${validation.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ config: nextConfig }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((typeof json === "object" && json && "error" in json ? String(json.error) : "") || "Rapor bilgileri kaydedilemedi.");
            setValidation(current => current ? { ...current, config: nextConfig } : current);
            setRevisionsStatus({ kind: "ok", text: "Rapor bilgileri ve revizyonlar kaydedildi." });
        } catch (err: unknown) {
            setRevisionsStatus({ kind: "error", text: err instanceof Error ? err.message : "Rapor bilgileri kaydedilemedi." });
        } finally {
            setSavingRevisions(false);
        }
    };
    const markDirty = () => setRevisionsStatus({ kind: "idle", text: "" });

    const pdfUrl = `/api/eurolab/validations/${id}/pdf`;

    return (
        <div className="space-y-5">
            {/* PDF üretimi sırasında (chromium ?pdfMode=1 ile yüklediğinde) sadece
                dashboard chrome'unu (header / sidebar / nav) gizler.
                Body / layout wrapper'larına dokunmaz — rapor kendi düzeniyle akıyor. */}
            {pdfMode && (
                <style dangerouslySetInnerHTML={{ __html: `
                    header, aside, nav, [role="banner"] { display: none !important; }
                ` }} />
            )}

            {!pdfMode && (
                <div className="flex flex-nowrap items-center justify-between gap-3 print:hidden" style={{marginBottom: "10px"}}>
                    <Link
                        href="/laboratuvar/eurolab/validasyon"
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                        style={{ padding: "8px 16px" }}
                    >
                        <ArrowLeft size={15} /> Listeye dön
                    </Link>
                    <div className="inline-flex flex-nowrap items-stretch overflow-hidden rounded-full border border-blue-200 bg-white shadow-sm">
                        <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 whitespace-nowrap border-r border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                            aria-disabled={!reportData}
                            style={{
                                padding: "9px 18px",
                                ...(!reportData ? { pointerEvents: "none", opacity: 0.5 } : {}),
                            }}
                        >
                            <FileText size={15} /> PDF Önizleme
                        </a>
                        <a
                            href={`${pdfUrl}?download=1`}
                            className="inline-flex items-center gap-2 whitespace-nowrap bg-blue-600 text-sm font-bold text-white transition hover:bg-blue-700"
                            aria-disabled={!reportData}
                            style={{
                                padding: "9px 20px",
                                ...(!reportData ? { pointerEvents: "none", opacity: 0.5 } : {}),
                            }}
                        >
                            <Download size={15} /> PDF İndir
                        </a>
                    </div>
                </div>
            )}

            {error && <div className={styles.errorBar}>{error}</div>}
            {loading && <div className={styles.tableCard} style={{ padding: 20 }}>Validasyon raporu yükleniyor...</div>}

            {/* Rapor başlık bilgileri kartı — yayın tarihi, revizyon no, revizyon tarihi */}
            {!pdfMode && reportData && (
                <div
                    className="print:hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    style={{ padding: "18px 20px" }}
                >
                    <div style={{ marginBottom: "10px" }}>
                        <h3 className="text-base font-extrabold text-slate-900">Rapor Başlık Bilgileri</h3>
                        <p className="text-xs text-slate-500" style={{ marginTop: "2px" }}>
                            Rapor üst başlığında ve PDF&apos;te görünen doküman bilgileri. Aşağıdaki Revizyon Kayıtları kartındaki &quot;Kaydet&quot; butonu hepsini birlikte kaydeder.
                        </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block">
                            <span className="block text-[0.72rem] font-bold uppercase tracking-wide text-slate-500" style={{ marginBottom: "4px" }}>
                                Validasyon Raporu Yayın Tarihi
                            </span>
                            <input
                                type="date"
                                value={docPublishDate}
                                onChange={e => { setDocPublishDate(e.target.value); markDirty(); }}
                                className="w-full rounded border border-slate-300 bg-white text-sm outline-none focus:border-blue-500"
                                style={{ padding: "7px 10px" }}
                            />
                        </label>
                        <label className="block">
                            <span className="block text-[0.72rem] font-bold uppercase tracking-wide text-slate-500" style={{ marginBottom: "4px" }}>
                                Revizyon No
                            </span>
                            <input
                                type="text"
                                value={docRevisionNo}
                                onChange={e => { setDocRevisionNo(e.target.value); markDirty(); }}
                                placeholder="Örn. 00"
                                className="w-full rounded border border-slate-300 bg-white text-sm outline-none focus:border-blue-500"
                                style={{ padding: "7px 10px" }}
                            />
                        </label>
                        <label className="block">
                            <span className="block text-[0.72rem] font-bold uppercase tracking-wide text-slate-500" style={{ marginBottom: "4px" }}>
                                Revizyon Tarihi
                            </span>
                            <input
                                type="date"
                                value={docRevisionDate}
                                onChange={e => { setDocRevisionDate(e.target.value); markDirty(); }}
                                className="w-full rounded border border-slate-300 bg-white text-sm outline-none focus:border-blue-500"
                                style={{ padding: "7px 10px" }}
                            />
                        </label>
                    </div>
                </div>
            )}

            {!pdfMode && reportData && (
                <div
                    className="print:hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    style={{ padding: "18px 20px" }}
                >
                    <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: "12px" }}>
                        <div>
                            <h3 className="text-base font-extrabold text-slate-900">Revizyon Kayıtları</h3>
                            <p className="text-xs text-slate-500" style={{ marginTop: "2px" }}>
                                Rapor üzerinde yapılan revizyonları buradan ekleyebilirsin. Kaydet butonuna bastıktan sonra rapor başlık bilgileri (yayın/revizyon tarihleri) ile birlikte rapor ve PDF güncellenir.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {revisionsStatus.kind === "ok" && (
                                <span className="text-xs font-semibold text-green-700">✓ {revisionsStatus.text}</span>
                            )}
                            {revisionsStatus.kind === "error" && (
                                <span className="text-xs font-semibold text-red-700">✗ {revisionsStatus.text}</span>
                            )}
                            <button
                                type="button"
                                onClick={addRevision}
                                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                style={{ padding: "8px 14px" }}
                            >
                                <Plus size={14} /> Yeni Revizyon
                            </button>
                            <button
                                type="button"
                                onClick={saveRevisions}
                                disabled={savingRevisions}
                                className="inline-flex items-center gap-2 rounded-md bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                                style={{ padding: "8px 16px" }}
                            >
                                <Save size={14} /> {savingRevisions ? "Kaydediliyor..." : "Kaydet"}
                            </button>
                        </div>
                    </div>

                    {revisions.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-sm italic text-slate-500" style={{ padding: "16px" }}>
                            Henüz revizyon kaydı yok. &quot;Yeni Revizyon&quot; ile satır ekleyebilirsin.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-slate-100 text-left text-[0.72rem] font-bold uppercase tracking-wide text-slate-600">
                                        <th className="border border-slate-200" style={{ padding: "8px 10px", width: "10%" }}>Rev. No</th>
                                        <th className="border border-slate-200" style={{ padding: "8px 10px", width: "15%" }}>Tarih</th>
                                        <th className="border border-slate-200" style={{ padding: "8px 10px", width: "20%" }}>Madde</th>
                                        <th className="border border-slate-200" style={{ padding: "8px 10px" }}>Sebep</th>
                                        <th className="border border-slate-200" style={{ padding: "8px 10px", width: "18%" }}>Yapan</th>
                                        <th className="border border-slate-200" style={{ padding: "8px 10px", width: "60px" }}>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {revisions.map((rev, i) => (
                                        <tr key={i}>
                                            <td className="border border-slate-200" style={{ padding: "4px" }}>
                                                <input
                                                    value={rev.revNo}
                                                    onChange={e => updateRevision(i, "revNo", e.target.value)}
                                                    placeholder="01"
                                                    className="w-full rounded border border-slate-200 bg-white text-sm outline-none focus:border-blue-500"
                                                    style={{ padding: "6px 8px" }}
                                                />
                                            </td>
                                            <td className="border border-slate-200" style={{ padding: "4px" }}>
                                                <input
                                                    value={rev.date}
                                                    onChange={e => updateRevision(i, "date", e.target.value)}
                                                    placeholder="dd-MM-yyyy"
                                                    className="w-full rounded border border-slate-200 bg-white text-sm outline-none focus:border-blue-500"
                                                    style={{ padding: "6px 8px" }}
                                                />
                                            </td>
                                            <td className="border border-slate-200" style={{ padding: "4px" }}>
                                                <input
                                                    value={rev.clause}
                                                    onChange={e => updateRevision(i, "clause", e.target.value)}
                                                    placeholder="Revize edilen madde/bölüm"
                                                    className="w-full rounded border border-slate-200 bg-white text-sm outline-none focus:border-blue-500"
                                                    style={{ padding: "6px 8px" }}
                                                />
                                            </td>
                                            <td className="border border-slate-200" style={{ padding: "4px" }}>
                                                <input
                                                    value={rev.reason}
                                                    onChange={e => updateRevision(i, "reason", e.target.value)}
                                                    placeholder="Revizyon açıklaması"
                                                    className="w-full rounded border border-slate-200 bg-white text-sm outline-none focus:border-blue-500"
                                                    style={{ padding: "6px 8px" }}
                                                />
                                            </td>
                                            <td className="border border-slate-200" style={{ padding: "4px" }}>
                                                <input
                                                    value={rev.by}
                                                    onChange={e => updateRevision(i, "by", e.target.value)}
                                                    placeholder="Adı Soyadı"
                                                    className="w-full rounded border border-slate-200 bg-white text-sm outline-none focus:border-blue-500"
                                                    style={{ padding: "6px 8px" }}
                                                />
                                            </td>
                                            <td className="border border-slate-200 text-center" style={{ padding: "4px" }}>
                                                <button
                                                    type="button"
                                                    onClick={() => removeRevision(i)}
                                                    aria-label="Satırı sil"
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded text-red-600 hover:bg-red-50"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {reportData && <ValidationReport data={reportData} printable={pdfMode} />}
        </div>
    );
}
