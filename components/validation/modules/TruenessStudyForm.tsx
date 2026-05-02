"use client";

import { ClipboardEvent, Fragment, useState } from "react";
import { Activity, Calculator, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ComponentData = Record<string, string[][]>;
type MatrixMap = Record<string, string>;
type TargetMap = Record<string, string>;
type UnitMap = Record<string, string>;
type NotesMap = Record<string, string>;
type ResultMap = Record<string, Record<string, AnalystResult> | undefined>;

type RecoveryCheck = {
    value: number;
    recovery: number;
    isSuitable: boolean | null;
};

type AnalystResult = {
    values: number[];
    recoveries: RecoveryCheck[];
    n: number;
    mean: number;
    stdDev: number;
    rsd: number;
};

interface TruenessStudyFormProps {
    components: string[];
    personnel: string[];
    initialData?: Record<string, any>;
    onReportDataChange?: (data: any) => void;
}

const DEFAULT_ROWS = 12;

const UNITS = [
    { value: "mg_L", label: "mg/L (ppm)" },
    { value: "ug_L", label: "µg/L (ppb)" },
    { value: "ng_L", label: "ng/L (ppt)" },
    { value: "mg_kg", label: "mg/kg (ppm)" },
    { value: "ug_kg", label: "µg/kg (ppb)" },
    { value: "percent", label: "% (w/w)" },
    { value: "conc", label: "Konsantrasyon" },
];

const RECOVERY_LIMITS = [
    { concentration: "1.000.000", low: 98, high: 102 },
    { concentration: "100.000", low: 98, high: 102 },
    { concentration: "10.000", low: 97, high: 103 },
    { concentration: "1.000", low: 95, high: 105 },
    { concentration: "100", low: 90, high: 107 },
    { concentration: "10", low: 80, high: 110 },
    { concentration: "1", low: 80, high: 110 },
    { concentration: "0,1", low: 80, high: 110 },
    { concentration: "0,01", low: 60, high: 115 },
    { concentration: "0,001", low: 40, high: 120 },
];

const parseLimitConcentration = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

const getPpmFactor = (unit: string) => {
    if (unit === "ug_L" || unit === "ug_kg") return 0.001;
    if (unit === "ng_L") return 0.000001;
    if (unit === "percent") return 10000;
    return 1;
};

const findRecoveryLimit = (targetPpm: number) => {
    if (!Number.isFinite(targetPpm) || targetPpm <= 0) return null;
    const sortedLimits = [...RECOVERY_LIMITS].sort((a, b) => parseLimitConcentration(b.concentration) - parseLimitConcentration(a.concentration));
    return sortedLimits.find(limit => targetPpm >= parseLimitConcentration(limit.concentration)) || sortedLimits[sortedLimits.length - 1];
};

const createGrid = (rowCount = DEFAULT_ROWS, analystCount = 1) =>
    Array(rowCount).fill(null).map(() => Array(analystCount).fill(""));

const normalizeGrid = (grid: string[][], rowCount: number, analystCount: number) => {
    const nextGrid = grid.slice(0, rowCount).map(row => {
        const nextRow = row.slice(0, analystCount);
        while (nextRow.length < analystCount) nextRow.push("");
        return nextRow;
    });
    while (nextGrid.length < rowCount) {
        nextGrid.push(Array(analystCount).fill(""));
    }
    return nextGrid;
};

const parseNumber = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const formatValue = (value: number) => Number.isFinite(value) ? value.toFixed(3) : "-";

const formatCompactValue = (value: number) => {
    if (!Number.isFinite(value)) return "-";
    return value.toFixed(6).replace(/\.?0+$/, "");
};

const sampleStdDev = (values: number[]) => {
    if (values.length < 2) return Number.NaN;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
};

const tCritical95 = (degreesOfFreedom: number) => {
    const table: Record<number, number> = {
        1: 12.706,
        2: 4.303,
        3: 3.182,
        4: 2.776,
        5: 2.571,
        6: 2.447,
        7: 2.365,
        8: 2.306,
        9: 2.262,
        10: 2.228,
        11: 2.201,
        12: 2.179,
        13: 2.160,
        14: 2.145,
        15: 2.131,
        16: 2.120,
        17: 2.110,
        18: 2.101,
        19: 2.093,
        20: 2.086,
        21: 2.080,
        22: 2.074,
        23: 2.069,
        24: 2.064,
        25: 2.060,
        26: 2.056,
        27: 2.052,
        28: 2.048,
        29: 2.045,
        30: 2.042,
    };
    if (!Number.isFinite(degreesOfFreedom) || degreesOfFreedom < 1) return Number.NaN;
    if (degreesOfFreedom <= 30) return table[Math.floor(degreesOfFreedom)];
    if (degreesOfFreedom <= 40) return 2.021;
    if (degreesOfFreedom <= 60) return 2.000;
    if (degreesOfFreedom <= 120) return 1.980;
    return 1.960;
};

export function TruenessStudyForm({ components = ["Genel"], personnel = ["Analist"], initialData = {}, onReportDataChange }: TruenessStudyFormProps) {
    const analysts = personnel.length > 0 ? personnel : ["Analist"];
    const [activeComponent, setActiveComponent] = useState(components[0] || "Genel");
    const [matrices, setMatrices] = useState<MatrixMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.matrix || ""]))
    );
    const [targets, setTargets] = useState<TargetMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.target || ""]))
    );
    const [units, setUnits] = useState<UnitMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.unit || "mg_kg"]))
    );
    const [notes, setNotes] = useState<NotesMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.notes || ""]))
    );
    const [allData, setAllData] = useState<ComponentData>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, Array.isArray(data?.rows) ? data.rows : []]))
    );
    const [results, setResults] = useState<ResultMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.results]))
    );

    const getUnit = (component: string) => units[component] || "mg_kg";
    const getUnitLabel = (component: string) => UNITS.find(unit => unit.value === getUnit(component))?.label || "mg/kg (ppm)";
    const getGrid = (component: string) => normalizeGrid(allData[component] || createGrid(DEFAULT_ROWS, analysts.length), allData[component]?.length || DEFAULT_ROWS, analysts.length);
    const getTargetPpm = (component: string) => {
        const target = parseNumber(targets[component] || "");
        return Number.isFinite(target) ? target * getPpmFactor(getUnit(component)) : Number.NaN;
    };

    const clearResult = (component: string) => setResults(current => ({ ...current, [component]: undefined }));

    const setGrid = (component: string, grid: string[][]) => {
        setAllData(current => ({ ...current, [component]: normalizeGrid(grid, grid.length, analysts.length) }));
    };

    const updateCell = (component: string, rowIndex: number, analystIndex: number, value: string) => {
        const grid = getGrid(component).map(row => [...row]);
        grid[rowIndex][analystIndex] = value;
        clearResult(component);
        setGrid(component, grid);
    };

    const addRow = (component: string) => {
        const grid = getGrid(component);
        clearResult(component);
        setGrid(component, [...grid, Array(analysts.length).fill("")]);
    };

    const clearGrid = (component: string) => {
        clearResult(component);
        setGrid(component, createGrid(DEFAULT_ROWS, analysts.length));
    };

    const removeRow = (component: string, rowIndex: number) => {
        const grid = getGrid(component);
        if (grid.length <= 3) return;
        clearResult(component);
        setGrid(component, grid.filter((_, index) => index !== rowIndex));
    };

    const handlePaste = (event: ClipboardEvent<HTMLInputElement>, component: string, rowIndex: number, analystIndex: number) => {
        event.preventDefault();
        const clipboardData = event.clipboardData.getData("text");
        if (!clipboardData) return;

        const grid = getGrid(component).map(row => [...row]);
        clipboardData.split(/\r\n|\n|\r/).filter(row => row.trim() !== "").forEach((rowText, pastedRowIndex) => {
            const targetRowIndex = rowIndex + pastedRowIndex;
            while (targetRowIndex >= grid.length) grid.push(Array(analysts.length).fill(""));
            rowText.split("\t").forEach((cellValue, pastedColIndex) => {
                const targetColIndex = analystIndex + pastedColIndex;
                if (targetColIndex < analysts.length) grid[targetRowIndex][targetColIndex] = cellValue.trim();
            });
        });

        clearResult(component);
        setGrid(component, grid);
    };

    const calculateAnalyst = (component: string, analystIndex: number): AnalystResult => {
        const values = getGrid(component).map(row => parseNumber(row[analystIndex] || "")).filter(Number.isFinite);
        const targetPpm = getTargetPpm(component);
        const ppmFactor = getPpmFactor(getUnit(component));
        const recoveryLimit = findRecoveryLimit(targetPpm);
        const recoveries = values.map(value => {
            const valuePpm = value * ppmFactor;
            const recovery = Number.isFinite(targetPpm) && targetPpm > 0 ? (100 * valuePpm) / targetPpm : Number.NaN;
            const isSuitable = Number.isFinite(recovery) && recoveryLimit
                ? recovery >= recoveryLimit.low && recovery <= recoveryLimit.high
                : null;
            return { value, recovery, isSuitable };
        });
        const n = values.length;
        const mean = n > 0 ? values.reduce((sum, value) => sum + value, 0) / n : Number.NaN;
        const stdDev = sampleStdDev(values);
        const rsd = Number.isFinite(stdDev) && mean !== 0 ? stdDev / mean : Number.NaN;
        return { values, recoveries, n, mean, stdDev, rsd };
    };

    const buildResults = (component: string) => {
        return Object.fromEntries(analysts.map((analyst, index) => [analyst, calculateAnalyst(component, index)]));
    };

    const calculateTruenessStats = (result: Record<string, AnalystResult>) => {
        const recoveryRatios = analysts
            .flatMap(analyst => result[analyst]?.recoveries || [])
            .map(recovery => recovery.recovery / 100)
            .filter(Number.isFinite);
        const n = recoveryRatios.length;
        const recoveryMean = n > 0 ? recoveryRatios.reduce((sum, value) => sum + value, 0) / n : Number.NaN;
        const stdDev = sampleStdDev(recoveryRatios);
        const ux = Number.isFinite(stdDev) && n > 0 ? stdDev / Math.sqrt(n) : Number.NaN;
        const uBias = Number.isFinite(recoveryMean) && Number.isFinite(ux)
            ? Math.sqrt(Math.pow((1 - recoveryMean) / Math.sqrt(3), 2) + Math.pow(ux, 2))
            : Number.NaN;
        const tTest = Number.isFinite(recoveryMean) && Number.isFinite(ux) && ux !== 0
            ? Math.abs((1 - recoveryMean) / ux)
            : Number.NaN;
        const tTable = tCritical95(n - 1);
        const isSuitable = Number.isFinite(tTest) && Number.isFinite(tTable) ? tTest <= tTable : null;
        return {
            recoveryMean,
            recoveryMeanPercent: Number.isFinite(recoveryMean) ? recoveryMean * 100 : Number.NaN,
            stdDev,
            ux,
            uBias,
            standardUncertainty: uBias,
            tTest,
            tTable,
            isSuitable,
        };
    };

    const handleCalculate = (component: string) => {
        const filledCount = getGrid(component).flat().filter(Boolean).length;
        if (filledCount === 0) {
            alert("Hesaplama için önce veri giriniz.");
            return;
        }
        setResults(current => ({ ...current, [component]: buildResults(component) }));
    };

    const saveToReport = (component: string) => {
        if (!onReportDataChange) return;
        onReportDataChange({
            type: "TRUENESS",
            component,
            data: {
                unit: getUnit(component),
                unitLabel: getUnitLabel(component),
                matrix: matrices[component] || "",
                target: targets[component] || "",
                notes: notes[component] || "",
                analysts,
                rows: getGrid(component),
                results: buildResults(component)
            }
        });
        alert(`${component} gerçeklik verileri rapora eklendi!`);
    };

    const renderResultPanel = (component: string) => {
        const result = results[component];
        const targetPpm = getTargetPpm(component);
        const recoveryLimit = findRecoveryLimit(targetPpm);
        const maxRecoveryRows = result ? Math.max(...analysts.map(analyst => result[analyst]?.recoveries.length || 0), 0) : 0;
        const truenessStats = result ? calculateTruenessStats(result) : null;
        if (!result) {
            return (
                <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50">
                    <Calculator className="mb-3 h-12 w-12 text-slate-300" />
                    <p className="text-center text-sm text-slate-400">
                        Bu bileşen için henüz hesaplama yapılmadı.<br />
                        Verileri girip "Hesapla" butonuna basın.
                    </p>
                </div>
            );
        }

        const statRows = [
            ["GK.ort", truenessStats?.recoveryMean],
            ["GK.ort (%)", truenessStats?.recoveryMeanPercent],
            ["Std Sapma", truenessStats?.stdDev],
            ["U(x):S /√n", truenessStats?.ux],
            ["U(bias):√((1-Xort)/√3)²+(U(x))²", truenessStats?.uBias],
            ["Standart Belirsizlik", truenessStats?.standardUncertainty],
            ["Ttest: 1-(Xort)/(S /√n)", truenessStats?.tTest],
            ["Ttablo", truenessStats?.tTable],
            ["Değerlendirme", truenessStats?.isSuitable],
        ];
        const formatStatCell = (value: string | number | boolean | null | undefined) => {
            if (typeof value === "boolean") return value ? "Düzeltme Gerekli Değil" : "Düzeltme Gerekli";
            if (value == null) return "-";
            return formatValue(value as number);
        };

        return (
            <div className="max-h-[700px] overflow-auto rounded-lg border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200" style={{ padding: "12px" }}>
                
                
                 <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-2" style={{marginBottom: "10px"}}>
                                                <div>
                                                    <div className="text-sm font-bold text-slate-900">Hesaplama Sonuçları</div>
                                                    <div className="text-xs text-slate-500">Kişi bazlı gerçeklik özeti
                                                       {recoveryLimit && Number.isFinite(targetPpm) ? ` | Hedef: ${formatCompactValue(targetPpm)} ppm | Limit: ${recoveryLimit.low}-${recoveryLimit.high}%` : ""}
                                                    </div>
                                                </div>
                                                <div className="rounded-md bg-orange-100 px-3 py-2 text-right" style={{padding:"8px", marginBottom: "10px"}}>
                                                    <div className="flex items-center justify-end gap-2">
                                                    <div className="text-[13px] font-semibold uppercase text-orange-700">Standart Belirsizlik </div>
                                                    <div className="text-sm font-bold text-orange-900">{formatValue(truenessStats?.standardUncertainty ?? Number.NaN)}</div>
                                                    </div>
                                                </div>
                                            </div>
                
           
                <div className="mb-4 overflow-auto rounded-lg border border-slate-200">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50">
                                <TableHead className="h-8 w-[52px] text-center text-xs">#</TableHead>
                                {analysts.map(analyst => (
                                    <TableHead key={`${component}-${analyst}-recovery-head`} colSpan={2} className="h-8 border-l border-slate-200 text-center text-xs">
                                        {analyst}
                                    </TableHead>
                                ))}
                            </TableRow>
                            <TableRow className="bg-slate-50">
                                <TableHead className="h-8 text-center text-xs"></TableHead>
                                {analysts.map(analyst => (
                                    <Fragment key={`${component}-${analyst}-recovery-columns`}>
                                        <TableHead className="h-8 min-w-[92px] border-l border-slate-200 text-center text-xs">Geri Kazanım %</TableHead>
                                        <TableHead className="h-8 min-w-[96px] border-l border-slate-200 text-center text-xs">Sonuç</TableHead>
                                    </Fragment>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array.from({ length: maxRecoveryRows }).map((_, rowIndex) => (
                                <TableRow key={`${component}-recovery-row-${rowIndex}`}>
                                    <TableCell className="bg-slate-50 py-1 text-center text-xs font-medium text-slate-600" style={{padding:"3px"}}>{rowIndex + 1}</TableCell>
                                    {analysts.map(analyst => {
                                        const recovery = result[analyst]?.recoveries[rowIndex];
                                        const statusText = recovery?.isSuitable == null ? "-" : recovery.isSuitable ? "Uygun" : "Uygun Değil";
                                        const statusClass = recovery?.isSuitable == null
                                            ? "bg-slate-50 text-slate-500"
                                            : recovery.isSuitable
                                                ? "bg-emerald-50 text-emerald-700"
                                                : "bg-red-50 text-red-700";
                                        return (
                                            <Fragment key={`${component}-${analyst}-${rowIndex}-recovery`}>
                                                <TableCell className="border-l border-slate-200 py-1 text-center text-xs font-bold text-slate-900">
                                                    {formatValue(recovery?.recovery ?? Number.NaN)}
                                                </TableCell>
                                                <TableCell className={`border-l border-slate-200 py-1 text-center text-xs font-bold ${statusClass}`}>
                                                    {statusText}
                                                </TableCell>
                                            </Fragment>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="h-8 text-xs font-bold" style={{paddingLeft:"3px"}}>İstatistik</TableHead>
                            <TableHead className="h-8 text-center text-xs font-bold">Değer</TableHead>
                            <TableHead className="h-8 border-l border-slate-200 text-xs font-bold" style={{paddingLeft:"10px"}} >İstatistik</TableHead>
                            <TableHead className="h-8 text-center text-xs font-bold">Değer</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array.from({ length: Math.ceil(statRows.length / 2) }).map((_, rowIndex) => {
                            const left = statRows[rowIndex];
                            const right = statRows[rowIndex + Math.ceil(statRows.length / 2)];
                            return (
                            <TableRow key={`${component}-trueness-stat-${rowIndex}`}>
                                <TableCell className="py-1 text-xs font-semibold text-slate-600" style={{padding:"3px 0px 3px 3px"}}>{left?.[0] || ""}</TableCell>
                                <TableCell className="py-1 text-center text-xs font-bold text-slate-900">{formatStatCell(left?.[1])}</TableCell>
                                <TableCell className="border-l border-slate-200 py-1 text-xs font-semibold text-slate-600" style={{padding:"3px 0px 3px 10px"}}>{right?.[0] || ""}</TableCell>
                                <TableCell className="py-1 text-center text-xs font-bold text-slate-900">{formatStatCell(right?.[1])}</TableCell>
                            </TableRow>
                        )})}
                    </TableBody>
                </Table>
            </div>
        );
    };

    return (
        <div className="overflow-hidden rounded-[14px] border [border-color:var(--color-border-light)] bg-[var(--color-surface)]">
            <div
                className="flex flex-col gap-2 border-b [border-color:var(--color-border-light)] bg-[var(--color-surface-2)] sm:flex-row sm:items-center sm:justify-between"
                style={{ display: "flex", padding: "14px 16px" }}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <Activity className="h-5 w-5 shrink-0 text-blue-600" />
                    <div className="truncate text-[var(--color-text-primary)]" style={{ fontSize: ".95rem", fontWeight: 800 }}>
                        Gerçeklik Çalışması
                    </div>
                </div>
                <p className="text-left text-[0.78rem] leading-5 text-[var(--color-text-tertiary)] sm:max-w-[48%] sm:text-right">
                    Tek düzeyde kişi bazlı gerçeklik veri girişleri ve özet hesapları.
                </p>
            </div>

            <div className="space-y-4 px-4 pb-4 pt-5" style={{ padding: "16px" }}>
                <Tabs value={activeComponent} onValueChange={setActiveComponent}>
                    <TabsList className="mb-4 flex h-auto max-w-full flex-wrap justify-start gap-1 bg-slate-100 p-1" style={{ marginBottom: "16px" }}>
                        {components.map(component => (
                            <TabsTrigger key={component} value={component} className="min-h-9 min-w-[104px] flex-1 px-3 text-sm sm:flex-none sm:min-w-[120px]">
                                {component}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {components.map(component => {
                        const grid = getGrid(component);
                        return (
                            <TabsContent key={component} value={component} className="space-y-4 pt-1">
                                <div
                                    className="rounded-xl border [border-color:var(--color-border-light)] bg-[var(--color-bg)]"
                                    style={{ padding: "16px", marginBottom: "16px" }}
                                >
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Label className="whitespace-nowrap text-sm font-medium" style={{ fontWeight: 700 }}>Birim:</Label>
                                            <Select value={getUnit(component)} onValueChange={(value) => {
                                                clearResult(component);
                                                setUnits(current => ({ ...current, [component]: value }));
                                            }}>
                                                <SelectTrigger className="h-9 w-[132px] bg-white" style={{ padding: "8px" }}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent style={{ padding: "16px" }}>
                                                    {UNITS.map(unit => (
                                                        <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="min-w-0 flex-1 xl:max-w-[660px]">
                                        <Label htmlFor={`trueness-notes-${component}`} className="text-sm font-medium" style={{ paddingBottom: "8px", paddingTop: "8px", fontWeight: 700 }}>
                                            Notlar / Açıklamalar
                                        </Label>
                                        <Textarea
                                            id={`trueness-notes-${component}`}
                                            placeholder="Bu çalışma ile ilgili notlar..."
                                            className="mt-2 min-h-16 resize-y bg-white"
                                            value={notes[component] || ""}
                                            onChange={(event) => setNotes(current => ({ ...current, [component]: event.target.value }))}
                                            style={{ padding: "6px" }}
                                        />
                                    </div>
                                </div>

                                <div className="rounded-lg border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200" style={{marginBottom: "15px"}}>
                                    <div className="border-b border-slate-200 bg-slate-50" style={{ padding: "10px 12px" }}>
                                        <div className="text-sm font-bold text-slate-900">Eurochem Guide Geri Kazanım Limitleri</div>
                                        <div className="text-xs text-slate-500">Derişim aralığına göre kabul edilebilir geri kazanım yüzdesi</div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="h-auto">
                                                    <TableHead className="h-auto min-w-[120px] bg-slate-50 text-center text-xs font-semibold text-slate-600" style={{ padding: "5px 0px" }}>Derişim (ppm)</TableHead>
                                                    {RECOVERY_LIMITS.map(limit => (
                                                        <TableHead key={`conc-${limit.concentration}`} className="h-auto min-w-[86px] border-l border-slate-200 text-center text-xs" style={{ padding: "5px 0px" }}>
                                                            {limit.concentration}
                                                        </TableHead>
                                                    ))}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                <TableRow className="h-auto">
                                                    <TableCell className="bg-slate-50 text-center text-xs font-semibold text-slate-600" style={{ padding: "5px 0px 5px 0px" }}>Düşük %</TableCell>
                                                    {RECOVERY_LIMITS.map(limit => (
                                                        <TableCell key={`low-${limit.concentration}`} className="border-l border-slate-200 text-center text-xs font-bold text-slate-900" style={{ padding: "5px 0px" }}>
                                                            {limit.low}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                                <TableRow className="h-auto">
                                                    <TableCell className="bg-slate-50 text-center text-xs font-semibold text-slate-600" style={{ padding: "5px 0px 5px 0px" }}>Yüksek %</TableCell>
                                                    {RECOVERY_LIMITS.map(limit => (
                                                        <TableCell key={`high-${limit.concentration}`} className="border-l border-slate-200 text-center text-xs font-bold text-slate-900" style={{ padding: "5px 0px" }}>
                                                            {limit.high}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(420px,0.9fr)_minmax(0,1.1fr)]">
                                    <div className="min-w-0">
                                        <div className="max-h-[600px] overflow-auto rounded-lg border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200">
                                            <Table>
                                                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                                                     <TableRow>
                                                        <TableHead className="w-[72px] text-center"></TableHead>
                                                        {analysts.map(analyst => (
                                                            <TableHead key={analyst} className="min-w-[120px] border-l border-slate-200 text-center">
                                                                {analyst}
                                                            </TableHead>
                                                        ))}
                                                        <TableHead className="w-[42px]"></TableHead>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableHead className="w-[72px] text-center">#</TableHead>
                                                        <TableHead colSpan={analysts.length} className="border-l border-slate-200 p-2">
                                                            <div className="grid gap-2 sm:grid-cols-3">
                                                                <Input
                                                                    value={matrices[component] || ""}
                                                                    onChange={(event) => setMatrices(current => ({ ...current, [component]: event.target.value }))}
                                                                    placeholder="Matriks"
                                                                    className="h-9 bg-white text-center"
                                                                    style={{ padding: "10px" }}
                                                                />
                                                                <Input
                                                                    value={targets[component] || ""}
                                                                    onChange={(event) => {
                                                                        clearResult(component);
                                                                        setTargets(current => ({ ...current, [component]: event.target.value }));
                                                                    }}
                                                                    placeholder="Hedef Değer"
                                                                    className="h-9 bg-white text-center"
                                                                    style={{ padding: "10px" }}
                                                                />
                                                                <div className="flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600">
                                                                    {getUnitLabel(component)}
                                                                </div>
                                                            </div>
                                                        </TableHead>
                                                        <TableHead className="w-[42px]"></TableHead>
                                                    </TableRow>
                                                   
                                                </TableHeader>
                                                <TableBody>
                                                    {grid.map((row, rowIndex) => (
                                                        <TableRow key={`${component}-${rowIndex}`}>
                                                            <TableCell className="border-r border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-600">
                                                                {rowIndex + 1}
                                                            </TableCell>
                                                            {analysts.map((analyst, analystIndex) => (
                                                                <TableCell key={`${component}-${rowIndex}-${analyst}`} className="border-l border-slate-200 p-2">
                                                                    <Input
                                                                        value={row[analystIndex] || ""}
                                                                        onChange={(event) => updateCell(component, rowIndex, analystIndex, event.target.value)}
                                                                        onPaste={(event) => handlePaste(event, component, rowIndex, analystIndex)}
                                                                        className="h-9 bg-white text-center"
                                                                        style={{ padding: "10px" }}
                                                                        placeholder="-"
                                                                    />
                                                                </TableCell>
                                                            ))}
                                                            <TableCell className="w-[42px] p-1 text-center">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                                                                    onClick={() => removeRow(component, rowIndex)}
                                                                    tabIndex={-1}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: "14px", marginTop: "10px" }}>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => addRow(component)}
                                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                                style={{ padding: "10px" }}
                                            >
                                                <Plus className="mr-2 h-4 w-4" /> Satır Ekle
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => clearGrid(component)}
                                                className="border-slate-200 text-slate-600 hover:bg-slate-50"
                                                style={{ padding: "10px" }}
                                            >
                                                Temizle
                                            </Button>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: "10px", marginTop: "10px" }}>
                                            <Button className="min-h-10 flex-1 bg-blue-600 hover:bg-blue-700" style={{ padding: "10px" }} onClick={() => handleCalculate(component)}>
                                                <Calculator className="mr-2 h-4 w-4" /> Hesapla
                                            </Button>
                                            <Button className="min-h-10 flex-1 bg-green-600 hover:bg-green-700" style={{ padding: "10px" }} onClick={() => saveToReport(component)}>
                                                <Calculator className="mr-2 h-4 w-4" /> Kaydet
                                            </Button>
                                        </div>
                                    </div>

                                    {renderResultPanel(component)}
                                </div>
                            </TabsContent>
                        );
                    })}
                </Tabs>
            </div>
        </div>
    );
}
