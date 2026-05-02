"use client";

import { ClipboardEvent, useState } from "react";
import { Activity, Calculator, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Row = {
    date: string;
    values: string[];
};

type ComponentData = Record<string, Row[]>;
type UnitMap = Record<string, string>;
type NotesMap = Record<string, string>;
type CountMap = Record<string, number>;
type SummaryResult = {
    count: number;
    mean: number;
    variance: number;
    stdDev: number;
    rsdr: number;
    rsdrPoolPart: number;
    repeatabilityLimit: number;
    nMinusOne: number;
};
type CalculationResult = {
    analystStats: Record<string, SummaryResult>;
    pooledRsd: number;
    fCritical: number;
    fTest: number;
    criterion: string;
    result: string;
};

interface PrecisionReproducibilityFormProps {
    components: string[];
    personnel: string[];
    initialData?: Record<string, any>;
    onReportDataChange?: (data: any) => void;
}

const DEFAULT_ROWS = 6;
const PARALLEL_COUNTS = Array.from({ length: 10 }, (_, index) => index + 6);

const UNITS = [
    { value: "mg_L", label: "mg/L (ppm)" },
    { value: "ug_L", label: "µg/L (ppb)" },
    { value: "ng_L", label: "ng/L (ppt)" },
    { value: "mg_kg", label: "mg/kg (ppm)" },
    { value: "ug_kg", label: "µg/kg (ppb)" },
    { value: "percent", label: "% (w/w)" },
    { value: "conc", label: "Konsantrasyon" },
];

const createRows = (rowCount = DEFAULT_ROWS, analystCount = 2): Row[] =>
    Array(rowCount).fill(null).map(() => ({
        date: "",
        values: Array(analystCount).fill("")
    }));

const normalizeRows = (rows: Row[], rowCount: number, analystCount: number): Row[] => {
    const nextRows = rows.slice(0, rowCount).map(row => {
        const values = (row.values || []).slice(0, analystCount);
        while (values.length < analystCount) values.push("");
        return { date: row.date || "", values };
    });

    while (nextRows.length < rowCount) {
        nextRows.push({ date: "", values: Array(analystCount).fill("") });
    }

    return nextRows;
};

const parseNumber = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const formatValue = (value: number) => Number.isFinite(value) ? value.toFixed(3) : "-";

const sampleStdDev = (values: number[]) => {
    if (values.length < 2) return Number.NaN;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
};

const logGamma = (z: number): number => {
    const coefficients = [
        676.5203681218851,
        -1259.1392167224028,
        771.3234287776531,
        -176.6150291621406,
        12.507343278686905,
        -0.13857109526572012,
        9.984369578019572e-6,
        1.5056327351493116e-7,
    ];

    if (z < 0.5) {
        return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    }

    let x = 0.9999999999998099;
    const adjusted = z - 1;
    for (let index = 0; index < coefficients.length; index += 1) {
        x += coefficients[index] / (adjusted + index + 1);
    }
    const t = adjusted + coefficients.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (adjusted + 0.5) * Math.log(t) - t + Math.log(x);
};

const betaContinuedFraction = (a: number, b: number, x: number): number => {
    const maxIterations = 100;
    const epsilon = 1e-10;
    const fpMin = 1e-30;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < fpMin) d = fpMin;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= maxIterations; m += 1) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < fpMin) d = fpMin;
        c = 1 + aa / c;
        if (Math.abs(c) < fpMin) c = fpMin;
        d = 1 / d;
        h *= d * c;

        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < fpMin) d = fpMin;
        c = 1 + aa / c;
        if (Math.abs(c) < fpMin) c = fpMin;
        d = 1 / d;
        const delta = d * c;
        h *= delta;
        if (Math.abs(delta - 1) < epsilon) break;
    }

    return h;
};

const regularizedBeta = (x: number, a: number, b: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) {
        return bt * betaContinuedFraction(a, b, x) / a;
    }
    return 1 - bt * betaContinuedFraction(b, a, 1 - x) / b;
};

const fCdf = (x: number, df1: number, df2: number): number => {
    if (!Number.isFinite(x) || x <= 0 || df1 <= 0 || df2 <= 0) return 0;
    const betaX = (df1 * x) / (df1 * x + df2);
    return regularizedBeta(betaX, df1 / 2, df2 / 2);
};

const fCritical = (df1: number, df2: number, alpha = 0.05): number => {
    if (df1 <= 0 || df2 <= 0) return Number.NaN;
    const target = 1 - alpha;
    let low = 0;
    let high = 1;
    while (fCdf(high, df1, df2) < target && high < 1e6) high *= 2;
    for (let index = 0; index < 80; index += 1) {
        const mid = (low + high) / 2;
        if (fCdf(mid, df1, df2) < target) low = mid;
        else high = mid;
    }
    return high;
};

const addDays = (dateValue: string, days: number) => {
    const [year, month, day] = dateValue.split("-").map(Number);
    if (!year || !month || !day) return "";
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    const nextYear = date.getFullYear();
    const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
    const nextDay = String(date.getDate()).padStart(2, "0");
    return `${nextYear}-${nextMonth}-${nextDay}`;
};

export function PrecisionReproducibilityForm({ components = ["Genel"], personnel = ["Analist 1", "Analist 2"], initialData = {}, onReportDataChange }: PrecisionReproducibilityFormProps) {
    const analysts = (personnel.length > 0 ? personnel : ["Analist 1", "Analist 2"]).slice(0, 2);
    while (analysts.length < 2) analysts.push(`Analist ${analysts.length + 1}`);

    const [activeComponent, setActiveComponent] = useState(components[0] || "Genel");
    const [units, setUnits] = useState<UnitMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.unit || "mg_kg"]))
    );
    const [notes, setNotes] = useState<NotesMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.notes || ""]))
    );
    const [parallelCounts, setParallelCounts] = useState<CountMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, Number(data?.parallelCount) || DEFAULT_ROWS]))
    );
    const [allData, setAllData] = useState<ComponentData>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, Array.isArray(data?.rows) ? data.rows : []]))
    );
    const [calculatedResults, setCalculatedResults] = useState<Record<string, CalculationResult | undefined>>({});

    const getUnit = (component: string) => units[component] || "mg_kg";
    const getUnitLabel = (component: string) => UNITS.find(unit => unit.value === getUnit(component))?.label || "mg/kg (ppm)";
    const getParallelCount = (component: string) => parallelCounts[component] || DEFAULT_ROWS;
    const getRows = (component: string) => normalizeRows(allData[component] || createRows(getParallelCount(component), analysts.length), getParallelCount(component), analysts.length);

    const setRows = (component: string, rows: Row[]) => {
        setAllData(current => ({ ...current, [component]: normalizeRows(rows, rows.length, analysts.length) }));
    };

    const updateDate = (component: string, rowIndex: number, value: string) => {
        const rows = getRows(component);
        rows[rowIndex] = { ...rows[rowIndex], date: value };

        if (rowIndex === 0 && value) {
            for (let index = 1; index < rows.length; index += 1) {
                if (!rows[index].date) {
                    rows[index] = { ...rows[index], date: addDays(value, index) };
                }
            }
        }

        setCalculatedResults(current => ({ ...current, [component]: undefined as any }));
        setRows(component, rows);
    };

    const updateValue = (component: string, rowIndex: number, analystIndex: number, value: string) => {
        const rows = getRows(component);
        const values = [...rows[rowIndex].values];
        values[analystIndex] = value;
        rows[rowIndex] = { ...rows[rowIndex], values };
        setCalculatedResults(current => ({ ...current, [component]: undefined as any }));
        setRows(component, rows);
    };

    const addRow = (component: string) => {
        setCalculatedResults(current => ({ ...current, [component]: undefined as any }));
        setParallelCounts(current => ({
            ...current,
            [component]: Math.min((current[component] || DEFAULT_ROWS) + 1, 15)
        }));
    };

    const clearRows = (component: string) => {
        setCalculatedResults(current => ({ ...current, [component]: undefined as any }));
        setRows(component, createRows(getParallelCount(component), analysts.length));
    };

    const removeRow = (component: string, rowIndex: number) => {
        const rowCount = getParallelCount(component);
        if (rowCount <= 3) return;
        setCalculatedResults(current => ({ ...current, [component]: undefined as any }));
        setRows(component, getRows(component).filter((_, index) => index !== rowIndex));
        setParallelCounts(current => ({
            ...current,
            [component]: Math.max((current[component] || DEFAULT_ROWS) - 1, 3)
        }));
    };

    const handlePaste = (event: ClipboardEvent<HTMLInputElement>, component: string, rowIndex: number, analystIndex: number) => {
        event.preventDefault();
        const clipboardData = event.clipboardData.getData("text");
        if (!clipboardData) return;

        const rows = getRows(component);
        setCalculatedResults(current => ({ ...current, [component]: undefined as any }));
        clipboardData.split(/\r\n|\n|\r/).filter(row => row.trim() !== "").forEach((rowText, pastedRowIndex) => {
            const targetRowIndex = rowIndex + pastedRowIndex;
            while (targetRowIndex >= rows.length) rows.push({ date: "", values: Array(analysts.length).fill("") });

            rowText.split("\t").forEach((cellValue, pastedColIndex) => {
                const targetAnalystIndex = analystIndex + pastedColIndex;
                if (targetAnalystIndex < analysts.length) {
                    rows[targetRowIndex].values[targetAnalystIndex] = cellValue.trim();
                }
            });
        });

        setParallelCounts(current => ({
            ...current,
            [component]: Math.min(Math.max(current[component] || DEFAULT_ROWS, rows.length), 15)
        }));
        setRows(component, rows.slice(0, 15));
    };

    const calculateSummary = (component: string) => {
        const rows = getRows(component);
        const analystStats = Object.fromEntries(analysts.map((analyst, analystIndex) => {
            const values = rows.map(row => parseNumber(row.values[analystIndex] || "")).filter(Number.isFinite);
            const count = values.length;
            const mean = count > 0 ? values.reduce((sum, value) => sum + value, 0) / count : Number.NaN;
            const stdDev = sampleStdDev(values);
            const variance = Number.isFinite(stdDev) ? Math.pow(stdDev, 2) : Number.NaN;
            const rsdr = Number.isFinite(stdDev) && mean !== 0 ? stdDev / mean : Number.NaN;
            const nMinusOne = count > 1 ? count - 1 : Number.NaN;
            const rsdrPoolPart = Number.isFinite(rsdr) && Number.isFinite(nMinusOne) ? Math.pow(rsdr, 2) * nMinusOne : Number.NaN;
            const repeatabilityLimit = Number.isFinite(stdDev) ? 2.83 * stdDev : Number.NaN;
            return [analyst, { count, mean, variance, stdDev, rsdr, rsdrPoolPart, repeatabilityLimit, nMinusOne }];
        }));

        const stats = Object.values(analystStats);
        const validPoolStats = stats.filter(stat => Number.isFinite(stat.rsdrPoolPart) && Number.isFinite(stat.nMinusOne));
        const pooledNumerator = validPoolStats.reduce((sum, stat) => sum + stat.rsdrPoolPart, 0);
        const pooledDenominator = validPoolStats.reduce((sum, stat) => sum + stat.nMinusOne, 0);
        const pooledRsd = pooledDenominator > 0 ? Math.sqrt(pooledNumerator / pooledDenominator) : Number.NaN;
        const first = stats[0];
        const second = stats[1];
        const firstVariance = first?.variance ?? Number.NaN;
        const secondVariance = second?.variance ?? Number.NaN;
        const firstDf = first?.nMinusOne ?? Number.NaN;
        const secondDf = second?.nMinusOne ?? Number.NaN;
        const firstIsNumerator = firstVariance >= secondVariance;
        const numeratorVariance = firstIsNumerator ? firstVariance : secondVariance;
        const denominatorVariance = firstIsNumerator ? secondVariance : firstVariance;
        const numeratorDf = firstIsNumerator ? firstDf : secondDf;
        const denominatorDf = firstIsNumerator ? secondDf : firstDf;
        const fTest = Number.isFinite(numeratorVariance) && Number.isFinite(denominatorVariance) && denominatorVariance > 0
            ? numeratorVariance / denominatorVariance
            : Number.NaN;
        const critical = fCritical(numeratorDf, denominatorDf);
        const isSuitable = Number.isFinite(fTest) && Number.isFinite(critical) && fTest < critical;

        return {
            analystStats,
            pooledRsd,
            fCritical: critical,
            fTest,
            criterion: "F < Fkritik ise sonuçlar uygundur",
            result: Number.isFinite(fTest) && Number.isFinite(critical) ? (isSuitable ? "Uygun" : "Uygun Değil") : "-"
        };
    };

    const handleCalculate = (component: string) => {
        const filledCount = getRows(component).reduce((total, row) => total + row.values.filter(Boolean).length, 0);
        if (filledCount === 0) {
            alert("Hesaplama için önce veri giriniz.");
            return;
        }
        setCalculatedResults(current => ({ ...current, [component]: calculateSummary(component) }));
    };

    const saveToReport = (component: string) => {
        if (!onReportDataChange) return;
        onReportDataChange({
            type: "PRECISION_REPRODUCIBILITY",
            component,
            data: {
                unit: getUnit(component),
                unitLabel: getUnitLabel(component),
                notes: notes[component] || "",
                parallelCount: getParallelCount(component),
                analysts,
                rows: getRows(component)
            }
        });
        alert(`${component} tekrar üretilebilirlik verileri rapora eklendi!`);
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
                        Tekrar Üretilebilirlik Çalışması
                    </div>
                </div>
                <p className="text-left text-[0.78rem] leading-5 text-[var(--color-text-tertiary)] sm:max-w-[48%] sm:text-right">
                    Tarih bazlı kişi sonuçlarını girerek tekrar üretilebilirlik çalışmasını takip edin.
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
                        const rows = getRows(component);
                        const result = calculatedResults[component];
                        return (
                            <TabsContent key={component} value={component} className="space-y-4 pt-1">
                                <div
                                    className="rounded-xl border [border-color:var(--color-border-light)] bg-[var(--color-bg)]"
                                    style={{ padding: "16px", marginBottom: "16px" }}
                                >
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Label className="whitespace-nowrap text-sm font-medium" style={{ fontWeight: 700 }}>Birim:</Label>
                                            <Select value={getUnit(component)} onValueChange={(value) => setUnits(current => ({ ...current, [component]: value }))}>
                                                <SelectTrigger className="h-9 w-[132px] bg-white" style={{ padding: "8px" }}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent style={{ padding: "16px" }}>
                                                    {UNITS.map(unit => (
                                                        <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            <Label className="ml-0 whitespace-nowrap text-sm font-medium sm:ml-3" style={{ fontWeight: 700 }}>
                                                Çalışma Gün Sayısı:
                                            </Label>
                                            <Select
                                                value={getParallelCount(component).toString()}
                                                onValueChange={(value) => setParallelCounts(current => ({ ...current, [component]: Number(value) }))}
                                            >
                                                <SelectTrigger className="h-9 w-[74px] bg-white" style={{ padding: "8px" }}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent style={{ padding: "8px" }}>
                                                    {PARALLEL_COUNTS.map(count => (
                                                        <SelectItem key={count} value={count.toString()}>{count}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="min-w-0 flex-1 xl:max-w-[660px]">
                                        <Label htmlFor={`reproducibility-notes-${component}`} className="text-sm font-medium" style={{ paddingBottom: "8px", paddingTop: "8px", fontWeight: 700 }}>
                                            Notlar / Açıklamalar
                                        </Label>
                                        <Textarea
                                            id={`reproducibility-notes-${component}`}
                                            placeholder="Bu çalışma ile ilgili notlar..."
                                            className="mt-2 min-h-16 resize-y bg-white"
                                            value={notes[component] || ""}
                                            onChange={(event) => setNotes(current => ({ ...current, [component]: event.target.value }))}
                                            style={{ padding: "6px" }}
                                        />
                                    </div>
                                </div>

                                <div className="grid min-w-0 gap-5 xl:grid-cols-[500px_minmax(0,1fr)]">
                                    <div className="min-w-0">
                                        <div className="max-h-[500px] overflow-auto rounded-lg border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200">
                                            <Table>
                                                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                                                    <TableRow>
                                                        <TableHead className="min-w-[140px] text-center">Tarih</TableHead>
                                                        {analysts.map(analyst => (
                                                            <TableHead key={analyst} className="min-w-[120px] border-l border-slate-200 text-center">
                                                                {analyst}
                                                            </TableHead>
                                                        ))}
                                                        <TableHead className="w-[42px]"></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {rows.map((row, rowIndex) => (
                                                        <TableRow key={`${component}-${rowIndex}`}>
                                                            <TableCell className="p-2">
                                                                <Input
                                                                    type="date"
                                                                    value={row.date}
                                                                    onChange={(event) => updateDate(component, rowIndex, event.target.value)}
                                                                    className="h-9 bg-white text-center"
                                                                    style={{ padding: "10px" }}
                                                                />
                                                            </TableCell>
                                                            {analysts.map((analyst, analystIndex) => (
                                                                <TableCell key={`${component}-${rowIndex}-${analyst}`} className="border-l border-slate-200 p-2">
                                                                    <Input
                                                                        value={row.values[analystIndex] || ""}
                                                                        onChange={(event) => updateValue(component, rowIndex, analystIndex, event.target.value)}
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
                                    </div>

                                    {result ? (
                                        <div className="max-h-[500px] overflow-auto rounded-lg border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200" style={{ padding: "12px" }}>
                                            <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-2" style={{marginBottom: "10px"}}>
                                                <div>
                                                    <div className="text-sm font-bold text-slate-900">Hesaplama Sonuçları</div>
                                                    <div className="text-xs text-slate-500">F testi ve kişi bazlı istatistikler</div>
                                                </div>
                                                <div className="rounded-md bg-orange-100 px-3 py-2 text-right" style={{padding:"8px", marginBottom: "10px"}}>
                                                    <div className="flex items-center justify-end gap-2">
                                                    <div className="text-[13px] font-semibold uppercase text-orange-700">RSDpool</div>
                                                    <div className="text-sm font-bold text-orange-900">{formatValue(result.pooledRsd)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="h-8 text-xs">İstatistik</TableHead>
                                                        {analysts.map(analyst => (
                                                            <TableHead key={`${component}-${analyst}-result`} className="h-8 text-center text-xs">{analyst}</TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {[
                                                        ["s²", "variance"],
                                                        ["Xort", "mean"],
                                                        ["Std Sapma (Sr)", "stdDev"],
                                                        ["r:2,83*Sr", "repeatabilityLimit"],
                                                        ["n-1", "nMinusOne"],
                                                        ["RSDr", "rsdr"],
                                                        ["(RSDr2)*(n-1)", "rsdrPoolPart"],
                                                    ].map(([label, key]) => (
                                                        <TableRow key={`${component}-result-${key}`}>
                                                            <TableCell className="py-1 text-xs font-semibold text-slate-600" style={{padding:"3px"}}>{label}</TableCell>
                                                            {analysts.map(analyst => (
                                                                <TableCell key={`${component}-${analyst}-${key}`} className="py-1 text-center text-xs font-bold text-slate-900" >
                                                                    {formatValue(result.analystStats[analyst]?.[key as keyof SummaryResult] as number)}
                                                                </TableCell>
                                                            ))}
                                                        </TableRow>
                                                    ))}
                                                    {[
                                                        ["RSDpool", formatValue(result.pooledRsd)],
                                                        ["Fkritik Değeri", formatValue(result.fCritical)],                                        
                                                        ["Ftest", formatValue(result.fTest)],
                                                        ["Kriter", result.criterion],
                                                        ["Sonuç", result.result],
                                                    ].map(([label, value]) => (
                                                        <TableRow key={`${component}-global-${label}`}>
                                                            <TableCell className="py-1 text-xs font-semibold text-slate-600" style={{padding:"3px"}}>{label}</TableCell>
                                                            <TableCell colSpan={analysts.length} className={`py-1 text-center text-xs font-bold ${label === "Sonuç" ? (value === "Uygun" ? "text-green-700" : "text-red-700") : "text-slate-900"}`}>
                                                                {value}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    ) : (
                                        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50">
                                            <Calculator className="mb-3 h-12 w-12 text-slate-300" />
                                            <p className="text-center text-sm text-slate-400">
                                                Bu bileşen için henüz hesaplama yapılmadı.<br />
                                                Verileri girip "Hesapla" butonuna basın.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: "14px", marginTop: "10px" }}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addRow(component)}
                                        disabled={getParallelCount(component) >= 15}
                                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                        style={{ padding: "10px" }}
                                    >
                                        <Plus className="mr-2 h-4 w-4" /> Satır Ekle
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => clearRows(component)}
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

                            

                            </TabsContent>
                        );
                    })}
                </Tabs>
            </div>
        </div>
    );
}
