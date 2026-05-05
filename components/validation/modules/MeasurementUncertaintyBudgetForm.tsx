"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Save } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface MeasurementUncertaintyBudgetFormProps {
    moduleData?: Record<string, any>;
    initialData?: Record<string, any>;
    onReportDataChange?: (data: any) => void;
}

interface ComponentBudgetRow {
    component: string;
    linearity: number;
    repeatability: number;
    reproducibility: number;
    trueness: number;
    samplePreparation: number;
    standardUncertainty: number;
    combinedStandardUncertainty: number;
    expandedUncertainty: number;
}

const COVERAGE_FACTOR = 2;
const COMPONENT_IGNORE_KEYS = new Set(["summary", "notes", "settings", "metadata"]);
const compactHeadClass = "whitespace-normal break-words px-2 py-2 text-right text-[0.68rem] leading-4";
const compactCellClass = "px-2 py-2 text-right text-[0.72rem] leading-4";
const chartColors = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0891b2"];

const numberValue = (value: unknown) => {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const finiteValues = (values: unknown[]) => values
    .map(numberValue)
    .filter(Number.isFinite);

const rss = (values: unknown[]) => {
    const numbers = finiteValues(values);
    if (numbers.length === 0) return Number.NaN;
    return Math.sqrt(numbers.reduce((sum, value) => sum + Math.pow(value, 2), 0));
};

const firstFinite = (...values: unknown[]) => {
    const found = finiteValues(values)[0];
    return Number.isFinite(found) ? found : Number.NaN;
};

const formatNumber = (value: number) =>
    Number.isFinite(value)
        ? Number(value.toFixed(5)).toLocaleString("tr-TR", { maximumFractionDigits: 5 })
        : "-";

const normalizeText = (value: unknown) => String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");

const isComponentKey = (key: string) => {
    const normalized = normalizeText(key);
    return Boolean(normalized) && !COMPONENT_IGNORE_KEYS.has(normalized);
};

const addModuleComponents = (components: Set<string>, moduleSection: any) => {
    Object.keys(moduleSection || {}).forEach(key => {
        if (isComponentKey(key)) components.add(key);
    });
};

const collectComponentNames = (moduleData: Record<string, any>) => {
    const components = new Set<string>();
    addModuleComponents(components, moduleData.LINEARITY);
    addModuleComponents(components, moduleData.PRECISION_REPEATABILITY);
    addModuleComponents(components, moduleData.PRECISION_REPRODUCIBILITY);
    addModuleComponents(components, moduleData.TRUENESS);
    addModuleComponents(components, moduleData.LOD_LOQ);

    const chemicals = moduleData.SAMPLE_PREPARATION?.summary?.chemicals || [];
    chemicals.forEach((item: any) => {
        const name = String(item.name || item.code || "").trim();
        if (name) components.add(name);
    });

    return Array.from(components);
};

const collectRecursiveNumbersByKey = (value: any, keys: string[], result: number[] = []) => {
    if (!value || typeof value !== "object") return result;

    Object.entries(value).forEach(([key, child]) => {
        if (keys.includes(key)) {
            const numeric = numberValue(child);
            if (Number.isFinite(numeric)) result.push(numeric);
        }
        if (child && typeof child === "object") {
            collectRecursiveNumbersByKey(child, keys, result);
        }
    });

    return result;
};

const getLinearityUncertainty = (data: any) => {
    const rsdPercent = firstFinite(data?.statistics?.rsdUCo, data?.rsdUCo);
    if (Number.isFinite(rsdPercent)) return rsdPercent / 100;
    return firstFinite(data?.statistics?.uCo, data?.uCo);
};

const getRepeatabilityUncertainty = (data: any) => {
    const levelValues = Array.isArray(data?.levels)
        ? data.levels.map((level: any) => firstFinite(level?.pooledRsd, level?.result?.pooledRsd))
        : [];
    const byLevel = rss(levelValues);
    if (Number.isFinite(byLevel)) return byLevel;

    return rss(collectRecursiveNumbersByKey(data, ["pooledRsd", "rsdPool", "rsdr"]));
};

const getReproducibilityUncertainty = (data: any) => {
    const direct = firstFinite(
        data?.result?.pooledRsd,
        data?.result?.rsdPool,
        data?.summary?.pooledRsd,
        data?.summary?.rsdPool,
        data?.pooledRsd,
        data?.rsdPool
    );
    if (Number.isFinite(direct)) return direct;

    return rss(collectRecursiveNumbersByKey(data, ["pooledRsd", "rsdPool", "rsdr"]));
};

const getTruenessUncertainty = (data: any) => firstFinite(
    data?.results?.standardUncertainty,
    data?.results?.uBias,
    data?.standardUncertainty,
    data?.uBias
);

const matchesComponent = (component: string, item: any) => {
    const target = normalizeText(component);
    const name = normalizeText(item?.name);
    const code = normalizeText(item?.code);
    return name === target || code === target || Boolean(target && (name.includes(target) || code.includes(target)));
};

const getSamplePreparationCommonUncertainty = (sample: any) => rss(
    (sample?.volumetric || []).map((item: any) => firstFinite(item.relativeStandardUncertainty, item.standardUncertainty))
);

const getStandardUncertainty = (component: string, sample: any) => rss(
    (sample?.chemicals || [])
        .filter((item: any) => matchesComponent(component, item))
        .map((item: any) => firstFinite(item.relativeStandardUncertainty, item.standardUncertainty))
);

const buildBudgetRows = (moduleData: Record<string, any>) => {
    const components = collectComponentNames(moduleData);
    const sample = moduleData.SAMPLE_PREPARATION?.summary;
    const samplePreparation = getSamplePreparationCommonUncertainty(sample);

    return components.map(component => {
        const linearity = getLinearityUncertainty(moduleData.LINEARITY?.[component]);
        const repeatability = getRepeatabilityUncertainty(moduleData.PRECISION_REPEATABILITY?.[component]);
        const reproducibility = getReproducibilityUncertainty(moduleData.PRECISION_REPRODUCIBILITY?.[component]);
        const trueness = getTruenessUncertainty(moduleData.TRUENESS?.[component]);
        const standardUncertainty = getStandardUncertainty(component, sample);
        const combinedStandardUncertainty = rss([
            linearity,
            repeatability,
            reproducibility,
            trueness,
            samplePreparation,
            standardUncertainty,
        ]);

        return {
            component,
            linearity,
            repeatability,
            reproducibility,
            trueness,
            samplePreparation,
            standardUncertainty,
            combinedStandardUncertainty,
            expandedUncertainty: Number.isFinite(combinedStandardUncertainty)
                ? combinedStandardUncertainty * COVERAGE_FACTOR
                : Number.NaN,
        } satisfies ComponentBudgetRow;
    });
};

const getContributionRows = (row: ComponentBudgetRow) => {
    const sources = [
        { label: "Lineerite", value: row.linearity, color: chartColors[0] },
        { label: "Tekrarlanabilirlik", value: row.repeatability, color: chartColors[1] },
        { label: "Tekrarüretilebilirlik", value: row.reproducibility, color: chartColors[2] },
        { label: "Geri Kazanım", value: row.trueness, color: chartColors[3] },
        { label: "Numune Hazırlama", value: row.samplePreparation, color: chartColors[4] },
        { label: "Standart Belirsizliği", value: row.standardUncertainty, color: chartColors[5] },
    ];
    const totalSquare = sources.reduce((sum, source) => (
        Number.isFinite(source.value) ? sum + Math.pow(source.value, 2) : sum
    ), 0);

    return sources
        .filter(source => Number.isFinite(source.value) && totalSquare > 0)
        .map(source => ({
            ...source,
            square: Math.pow(source.value, 2),
            percent: (Math.pow(source.value, 2) / totalSquare) * 100,
        }));
};

export function MeasurementUncertaintyBudgetForm({
    moduleData = {},
    initialData = {},
    onReportDataChange,
}: MeasurementUncertaintyBudgetFormProps) {
    const [notes, setNotes] = useState(() => initialData.notes || "");

    const budgetRows = useMemo(() => buildBudgetRows(moduleData), [moduleData]);

    const saveModule = () => {
        onReportDataChange?.({
            type: "MEASUREMENT_UNCERTAINTY",
            component: "summary",
            data: {
                notes,
                rows: budgetRows,
                coverageFactor: COVERAGE_FACTOR,
            },
        });
        alert("Ölçüm belirsizliği bütçesi kaydedildi.");
    };

    return (
        <div className="overflow-hidden rounded-[14px] border [border-color:var(--color-border-light)] bg-[var(--color-surface)]">
            <div
                className="flex flex-col gap-2 border-b [border-color:var(--color-border-light)] bg-[var(--color-surface-2)] sm:flex-row sm:items-center sm:justify-between"
                style={{ display: "flex", padding: "14px 16px" }}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <ClipboardList className="h-5 w-5 shrink-0 text-blue-600" />
                    <div className="truncate text-[var(--color-text-primary)]" style={{ fontSize: ".95rem", fontWeight: 800 }}>
                        Ölçüm Belirsizliği Bütçesi
                    </div>
                </div>
                <p className="text-left text-[0.78rem] leading-5 text-[var(--color-text-tertiary)] sm:max-w-[48%] sm:text-right">
                    Her alt bileşen için modüllerden gelen belirsizlikleri birleştirerek genişletilmiş belirsizliği hesaplayın.
                </p>
            </div>

            <div className="space-y-5" style={{ padding: "16px" }}>
                <section className="rounded-xl border border-slate-300 bg-[var(--color-bg)]" style={{ padding: "16px" }}>
                    <Label className="text-sm font-bold text-[var(--color-text-primary)]">Notlar / Açıklamalar</Label>
                    <Textarea
                        className="mt-2 min-h-20 resize-y border-slate-300 bg-slate-100"
                        style={{ padding: "8px" }}
                        placeholder="Ölçüm belirsizliği bütçesi ile ilgili notlar..."
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                    />
                </section>

                <section className="rounded-xl border border-slate-300 bg-[var(--color-bg)]" style={{ padding: "16px" }}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Alt Bileşen Bazlı Belirsizlik Matrisi</h3>
                        <span className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">
                            k = <strong>{COVERAGE_FACTOR}</strong>
                        </span>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white [&_td]:border-slate-300 [&_th]:border-slate-300 [&_tr]:border-slate-300">
                        <Table className="w-full table-fixed">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="whitespace-normal break-words px-2 py-2 text-left text-[0.68rem] leading-4" style={{ width: "11%" }}>Alt Bileşen</TableHead>
                                    <TableHead className={compactHeadClass} style={{ width: "9%" }}>Lineerite</TableHead>
                                    <TableHead className={compactHeadClass} style={{ width: "14%" }}>Tekrarlanabilirlik<br />Düzey Belirsizlikleri</TableHead>
                                    <TableHead className={compactHeadClass} style={{ width: "12%" }}>Tekrarüretilebilirlik</TableHead>
                                    <TableHead className={compactHeadClass} style={{ width: "10%" }}>Geri<br />Kazanım</TableHead>
                                    <TableHead className={compactHeadClass} style={{ width: "11%" }}>Numune<br />Hazırlama</TableHead>
                                    <TableHead className={compactHeadClass} style={{ width: "11%" }}>Standart<br />Belirsizliği</TableHead>
                                    <TableHead className={compactHeadClass} style={{ width: "10%" }}>Toplam<br />Belirsizlik</TableHead>
                                    <TableHead className={compactHeadClass} style={{ width: "12%" }}>Genişletilmiş<br />Belirsizlik</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {budgetRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="py-8 text-center text-sm text-slate-500">
                                            Henüz bütçeye aktarılacak alt bileşen verisi yok. Önce ilgili validasyon modüllerinde hesaplayıp kaydedin.
                                        </TableCell>
                                    </TableRow>
                                ) : budgetRows.map(row => (
                                    <TableRow key={row.component}>
                                        <TableCell className="break-words px-2 py-2 text-[0.72rem] font-semibold leading-4 text-slate-900">{row.component}</TableCell>
                                        <TableCell className={compactCellClass}>{formatNumber(row.linearity)}</TableCell>
                                        <TableCell className={compactCellClass}>{formatNumber(row.repeatability)}</TableCell>
                                        <TableCell className={compactCellClass}>{formatNumber(row.reproducibility)}</TableCell>
                                        <TableCell className={compactCellClass}>{formatNumber(row.trueness)}</TableCell>
                                        <TableCell className={compactCellClass}>{formatNumber(row.samplePreparation)}</TableCell>
                                        <TableCell className={compactCellClass}>{formatNumber(row.standardUncertainty)}</TableCell>
                                        <TableCell className={`${compactCellClass} font-bold text-slate-900`}>{formatNumber(row.combinedStandardUncertainty)}</TableCell>
                                        <TableCell className={`${compactCellClass} font-bold text-blue-700`}>{formatNumber(row.expandedUncertainty)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </section>

                {budgetRows.length > 0 && (
                    <section className="rounded-xl border border-slate-300 bg-[var(--color-bg)]" style={{ padding: "16px" }}>
                        <div className="mb-3 space-y-1">
                            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Belirsizlik Katkı Grafikleri</h3>
                            <p className="text-xs text-slate-500">
                                Her alt bileşende bütçeyi en çok etkileyen belirsizlik kaynağını katkı yüzdesiyle gösterir.
                            </p>
                        </div>

                        <Tabs defaultValue={budgetRows[0]?.component} className="w-full">
                            <TabsList className="mb-4 flex h-auto max-w-full flex-wrap justify-start gap-1 bg-slate-100 p-1" style={{ marginBottom: "16px" }}>
                                {budgetRows.map(row => (
                                    <TabsTrigger key={row.component} value={row.component} className="min-h-9 min-w-[86px] px-3 text-sm">
                                        {row.component}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {budgetRows.map(row => {
                                const contributionRows = getContributionRows(row);
                                return (
                                    <TabsContent key={row.component} value={row.component} className="pt-1">
                                        {contributionRows.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                                                {row.component} için grafik oluşturacak belirsizlik verisi yok.
                                            </div>
                                        ) : (
                                            <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(320px,1.1fr)]">
                                                <div className="h-[280px] rounded-lg border border-slate-300 bg-white" style={{ padding: "12px" }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie
                                                                data={contributionRows}
                                                                dataKey="square"
                                                                nameKey="label"
                                                                cx="50%"
                                                                cy="50%"
                                                                innerRadius={54}
                                                                outerRadius={96}
                                                                paddingAngle={2}
                                                            >
                                                                {contributionRows.map(entry => (
                                                                    <Cell key={entry.label} fill={entry.color} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                formatter={(_, __, item: any) => [
                                                                    `%${formatNumber(item.payload.percent)}`,
                                                                    item.payload.label,
                                                                ]}
                                                            />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>

                                                <div className="overflow-hidden rounded-lg border border-slate-300 bg-white [&_td]:border-slate-300 [&_th]:border-slate-300 [&_tr]:border-slate-300">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Kaynak</TableHead>
                                                                <TableHead className="text-right">Belirsizlik</TableHead>
                                                                <TableHead className="text-right">Katkı</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {contributionRows.map(source => (
                                                                <TableRow key={source.label}>
                                                                    <TableCell className="font-medium">
                                                                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: source.color }} />
                                                                        {source.label}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">{formatNumber(source.value)}</TableCell>
                                                                    <TableCell className="text-right font-semibold">%{formatNumber(source.percent)}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        )}
                                    </TabsContent>
                                );
                            })}
                        </Tabs>
                    </section>
                )}

                <div className="flex justify-end">
                    <Button className="bg-green-600 hover:bg-green-700" style={{ padding: "10px 16px" }} onClick={saveModule}>
                        <Save className="mr-2 h-4 w-4" /> Kaydet
                    </Button>
                </div>
            </div>
        </div>
    );
}
