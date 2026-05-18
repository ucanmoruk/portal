"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { ValidationReport, ReportData } from "@/components/validation/report/ValidationReport";
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
    const [validation, setValidation] = useState<ValidationDetail | null>(null);
    const [personnelDirectory, setPersonnelDirectory] = useState<PersonnelDirectoryRow[]>([]);
    const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let alive = true;

        async function loadValidation() {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/eurolab/validations/${id}`, { credentials: "same-origin" });
                const json: ValidationDetail & { error?: string } = await response.json();
                if (!response.ok) throw new Error(json.error || "Validasyon raporu alınamadı.");
                if (alive) setValidation(json);
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
                documentNo: config.documentNo || "K.SOP.16 / Ek-1",
                publishDate: config.publishDate || "",
                revisionNo: config.revisionNo || "-",
                revisionDate: config.revisionDate || "-",
                reportingUnit: config.reportingUnit || components.find(component => component.unit)?.unit || "",
                conclusion: config.conclusion,
                date: new Date().toLocaleDateString("tr-TR"),
                analyst: personnel[0]?.name || "Analist",
            },
        };
    }, [validation, personnelDirectory, inventoryRows]);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <Link href="/laboratuvar/eurolab/validasyon" className={styles.cancelBtn}>
                    <ArrowLeft size={15} /> Listeye dön
                </Link>
                <button className={styles.addBtn} onClick={() => window.print()} disabled={!reportData}>
                    <Printer size={15} /> Yazdır
                </button>
            </div>

            {error && <div className={styles.errorBar}>{error}</div>}
            {loading && <div className={styles.tableCard} style={{ padding: 20 }}>Validasyon raporu yükleniyor...</div>}
            {reportData && <ValidationReport data={reportData} />}
        </div>
    );
}
