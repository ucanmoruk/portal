"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Plus, Trash2, Save, Activity, Weight } from "lucide-react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, Legend } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface LinearityPoint {
    id: string;
    level: string; // e.g., "L1", "L2"
    concentrations: string[]; // Array of concentrations (size depends on replicates)
    responses: string[];   // Array of responses (size depends on replicates)
}

interface RegressionResult {
    slope: number;
    intercept: number;
    rSquared: number;
    equation: string;
    points: { x: number; y: number; type: 'measure' | 'predicted' }[];
    statistics: {
        rows: {
            x: number;
            xDelta: number;
            xDeltaSquared: number;
            y: number;
            yResidual: number;
            yResidualSquared: number;
        }[];
        intercept: number;
        slope: number;
        standardDeviation: number;
        co: number;
        cort: number;
        p: number;
        n: number;
        inverseP: number;
        inverseN: number;
        sOverB1: number;
        sxx: number;
        coDeltaOverSxx: number;
        uncertaintyFactor: number;
        uCo: number;
        rsdUCo: number;
    };
}

interface LinearityFormProps {
    components: string[];
    initialData?: Record<string, any>;
    onReportDataChange?: (data: any) => void;
}

const UNITS = [
    { value: "mg_L", label: "mg/L (ppm)" },
    { value: "ug_L", label: "µg/L (ppb)" },
    { value: "ng_L", label: "ng/L (ppt)" },
    { value: "mg_kg", label: "mg/kg (ppm)" },
    { value: "ug_kg", label: "µg/kg (ppb)" },
    { value: "percent", label: "% (w/w)" },
    { value: "abs", label: "Absorbans" },
];

const formatStat = (value: number, digits = 4) => {
    if (!Number.isFinite(value)) return "-";
    return value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
};

export function LinearityCalculationForm({ components = ["Genel"], initialData = {}, onReportDataChange }: LinearityFormProps) {
    const [activeComponent, setActiveComponent] = useState(components[0]);
    const [replicates, setReplicates] = useState(() => Number(Object.values(initialData)[0]?.replicates) || 1); // Default n=1

    const [settings, setSettings] = useState<{ unit: string; notes: string }>(() => ({
        unit: Object.values(initialData)[0]?.unit || "mg_L",
        notes: Object.values(initialData)[0]?.notes || "",
    }));

    // Data state: { [component]: LinearityPoint[] }
    const [allData, setAllData] = useState<Record<string, LinearityPoint[]>>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, Array.isArray(data?.rows) ? data.rows : []]))
    );

    // Results state: { [component]: RegressionResult }
    const [results, setResults] = useState<Record<string, RegressionResult>>(() =>
        Object.fromEntries(Object.entries(initialData)
            .filter(([, data]) => Number.isFinite(data?.slope) && Number.isFinite(data?.intercept))
            .map(([component, data]) => [component, data as RegressionResult]))
    );

    const getComponentData = (comp: string) => {
        const data = allData[comp];
        // Validate schema: Check if concentrations is array. If not (old HMR state), return default.
        if (data && data.length > 0 && (!data[0].concentrations || !Array.isArray(data[0].concentrations))) {
            return [
                { id: '1', level: 'L1', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
                { id: '2', level: 'L2', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
                { id: '3', level: 'L3', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
                { id: '4', level: 'L4', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
                { id: '5', level: 'L5', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
            ];
        }

        return data || [
            { id: '1', level: 'L1', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
            { id: '2', level: 'L2', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
            { id: '3', level: 'L3', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
            { id: '4', level: 'L4', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
            { id: '5', level: 'L5', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
        ];
    };

    const updateSettings = (field: 'unit' | 'notes', value: string) => {
        setSettings(current => ({
            ...current,
            [field]: value
        }));
    };

    // Update replicate count and adjust existing data
    const handleReplicateChange = (val: string) => {
        const n = parseInt(val);
        setReplicates(n);

        // Adjust existing data for all components to match new n
        const newAllData = { ...allData };
        Object.keys(newAllData).forEach(comp => {
            newAllData[comp] = newAllData[comp].map(row => {
                const newConc = [...row.concentrations];
                const newResp = [...row.responses];

                if (n > row.responses.length) {
                    // Extend
                    for (let i = row.responses.length; i < n; i++) {
                        newConc.push(newConc[0] || ''); // Copy first conc if avail, else empty
                        newResp.push('');
                    }
                } else {
                    // Truncate
                    newConc.length = n;
                    newResp.length = n;
                }
                return { ...row, concentrations: newConc, responses: newResp };
            });
        });
        setAllData(newAllData);
    };

    const handleDataChange = (comp: string, index: number, field: 'concentration' | 'response', value: string, subIndex: number) => {
        const currentData = getComponentData(comp);
        const newData = [...currentData];

        if (field === 'concentration') {
            const newConcs = [...newData[index].concentrations];
            newConcs[subIndex] = value;
            // Optional: If user types in first conc, auto-fill others? No, let's keep flexible.
            // But usually for Linearity, C1=C2=C3.
            newData[index] = { ...newData[index], concentrations: newConcs };
        } else {
            const newResps = [...newData[index].responses];
            newResps[subIndex] = value;
            newData[index] = { ...newData[index], responses: newResps };
        }

        setAllData({
            ...allData,
            [comp]: newData
        });
    };

    const addRow = (comp: string) => {
        const currentData = getComponentData(comp);
        const nextLevel = `L${currentData.length + 1}`;
        setAllData({
            ...allData,
            [comp]: [...currentData, {
                id: Math.random().toString(),
                level: nextLevel,
                concentrations: Array(replicates).fill(''),
                responses: Array(replicates).fill('')
            }]
        });
    };

    const clearComponentData = (comp: string) => {
        setAllData({
            ...allData,
            [comp]: [
                { id: '1', level: 'L1', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
                { id: '2', level: 'L2', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
                { id: '3', level: 'L3', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
                { id: '4', level: 'L4', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
                { id: '5', level: 'L5', concentrations: Array(replicates).fill(''), responses: Array(replicates).fill('') },
            ]
        });
        const newResults = { ...results };
        delete newResults[comp];
        setResults(newResults);
    };

    const removeRow = (comp: string, index: number) => {
        const currentData = getComponentData(comp);
        setAllData({
            ...allData,
            [comp]: currentData.filter((_, i) => i !== index)
        });
    };

    // Enhanced Paste: Wraps around replicates and moves to next level
    const handlePaste = (e: React.ClipboardEvent, comp: string, startLevelIdx: number, startRepIdx: number, type: 'concentration' | 'response') => {
        e.preventDefault();
        const clipboardData = e.clipboardData.getData('text');
        if (!clipboardData) return;

        const rows = clipboardData.split(/\r\n|\n|\r/).filter(r => r.trim() !== '');
        const currentData = getComponentData(comp);
        let newData = [...currentData];

        let currentLevelIdx = startLevelIdx;
        let currentRepIdx = startRepIdx;

        rows.forEach((rowStr) => {
            // Expand levels if needed
            if (currentLevelIdx >= newData.length) {
                const nextLevel = `L${newData.length + 1}`;
                newData.push({
                    id: Math.random().toString(),
                    level: nextLevel,
                    concentrations: Array(replicates).fill(''),
                    responses: Array(replicates).fill('')
                });
            }

            const cells = rowStr.split('\t');
            // Logic: Assume 2 columns usually (Conc | Response) OR 1 column
            // If pasting into Conc: Cell 0 -> Conc, Cell 1 -> Response available?

            if (cells.length > 0) {
                if (type === 'concentration') {
                    // Set Concentration
                    const newConcs = [...newData[currentLevelIdx].concentrations];
                    newConcs[currentRepIdx] = cells[0].trim();
                    newData[currentLevelIdx] = { ...newData[currentLevelIdx], concentrations: newConcs };

                    // If there's a second cell, it goes to response
                    if (cells.length > 1) {
                        const newResps = [...newData[currentLevelIdx].responses];
                        newResps[currentRepIdx] = cells[1].trim();
                        newData[currentLevelIdx] = { ...newData[currentLevelIdx], responses: newResps };
                    }
                } else {
                    // Pasting into Response
                    const newResps = [...newData[currentLevelIdx].responses];
                    newResps[currentRepIdx] = cells[0].trim();
                    newData[currentLevelIdx] = { ...newData[currentLevelIdx], responses: newResps };
                }
            }

            // Move to next replicate
            currentRepIdx++;
            if (currentRepIdx >= replicates) {
                currentRepIdx = 0;
                currentLevelIdx++;
            }
        });

        setAllData({ ...allData, [comp]: newData });
    };

    const calculateRegression = (comp: string) => {
        const data = getComponentData(comp);
        const points: { x: number, y: number }[] = [];

        data.forEach(d => {
            for (let i = 0; i < replicates; i++) {
                const xVal = d.concentrations[i] || "";
                const yVal = d.responses[i] || "";

                const x = parseFloat(xVal.replace(',', '.'));
                const y = parseFloat(yVal.replace(',', '.'));

                if (!isNaN(x) && !isNaN(y)) {
                    points.push({ x, y });
                }
            }
        });

        if (points.length < 3) {
            alert("En az 3 geçerli veri noktası gereklidir.");
            return;
        }

        const n = points.length;
        const sumX = points.reduce((acc, p) => acc + p.x, 0);
        const sumY = points.reduce((acc, p) => acc + p.y, 0);
        const sumXY = points.reduce((acc, p) => acc + (p.x * p.y), 0);
        const sumXX = points.reduce((acc, p) => acc + (p.x * p.x), 0);
        const sumYY = points.reduce((acc, p) => acc + (p.y * p.y), 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const numerator = (n * sumXY - sumX * sumY);
        const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
        const r = numerator / denominator;
        const rSquared = r * r;
        const calculatedXiValues = points.map(p => slope === 0 ? Number.NaN : (p.y - intercept) / slope);
        const xMean = calculatedXiValues.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0) / n;
        const sxx = calculatedXiValues.reduce((acc, value) => acc + Math.pow(value - xMean, 2), 0);
        const residualSumSquares = points.reduce((acc, p) => {
            const predicted = slope * p.x + intercept;
            return acc + Math.pow(p.y - predicted, 2);
        }, 0);
        const standardDeviation = Math.sqrt(residualSumSquares / Math.max(n - 2, 1));
        const pCount = Math.max(1, replicates);
        const co = Math.max(...points.map(p => p.x));
        const cort = xMean;
        const coDeltaOverSxx = sxx === 0 ? Number.NaN : Math.pow(co - cort, 2) / sxx;
        const uncertaintyFactor = Math.sqrt((1 / pCount) + (1 / n) + (Number.isFinite(coDeltaOverSxx) ? coDeltaOverSxx : 0));
        const sOverB1 = slope === 0 ? Number.NaN : standardDeviation / slope;
        const uCo = sOverB1 * uncertaintyFactor;
        const rsdUCo = co === 0 ? Number.NaN : Math.abs((uCo / co) * 100);
        const statistics = {
            rows: points.map((p, index) => {
                const predicted = slope * p.x + intercept;
                const xi = calculatedXiValues[index];
                return {
                    x: xi,
                    xDelta: xi - xMean,
                    xDeltaSquared: Math.pow(xi - xMean, 2),
                    y: predicted,
                    yResidual: predicted - p.y,
                    yResidualSquared: Math.pow(predicted - p.y, 2)
                };
            }),
            intercept,
            slope,
            standardDeviation,
            co,
            cort,
            p: pCount,
            n,
            inverseP: 1 / pCount,
            inverseN: 1 / n,
            sOverB1,
            sxx,
            coDeltaOverSxx,
            uncertaintyFactor,
            uCo,
            rsdUCo
        };

        const minX = Math.min(...points.map(p => p.x));
        const maxX = Math.max(...points.map(p => p.x));

        const chartData = [
            ...points.map(p => ({ x: p.x, y: p.y, type: 'measure' as const })),
            { x: minX, y: slope * minX + intercept, type: 'predicted' as const },
            { x: maxX, y: slope * maxX + intercept, type: 'predicted' as const }
        ];

        setResults({
            ...results,
            [comp]: {
                slope,
                intercept,
                rSquared,
                equation: `y = ${slope.toFixed(4)}x ${intercept >= 0 ? '+' : '-'} ${Math.abs(intercept).toFixed(4)}`,
                points: chartData,
                statistics
            }
        });
    };

    const broadcastToReport = (comp: string) => {
        if (!onReportDataChange || !results[comp]) return;

        // Construct standardized report object for Linearity
        const minX = Math.min(...results[comp].points.filter(p => p.type === 'measure').map(p => p.x));
        const maxX = Math.max(...results[comp].points.filter(p => p.type === 'measure').map(p => p.x));

        const reportPayload = {
            type: 'LINEARITY',
            component: comp,
            data: {
                ...results[comp],
                range: `${minX} - ${maxX} ${settings.unit.split('_')[0]}`,
                unit: settings.unit,
                notes: settings.notes,
                replicates,
                rows: getComponentData(comp)
            }
        };
        onReportDataChange(reportPayload);
    };

    const renderStatistics = (result: RegressionResult) => {
        const summary = [
            ["Kesim", result.statistics.intercept],
            ["E?im (B1)", result.statistics.slope],
            ["Std Sapma", result.statistics.standardDeviation],
            ["Co", result.statistics.co],
            ["Cort", result.statistics.cort],
            ["p", result.statistics.p],
            ["n", result.statistics.n],
            ["1/p", result.statistics.inverseP],
            ["1/n", result.statistics.inverseN],
            ["S/B1", result.statistics.sOverB1],
            ["Sxx", result.statistics.sxx],
            ["(Co-Cort)^2/Sxx", result.statistics.coDeltaOverSxx],
            ["(1/p+1/n+(Co-Cort)^2/Sxx)^0,5", result.statistics.uncertaintyFactor],
            ["U(Co)", result.statistics.uCo],
            ["RSD U(Co) (%)", result.statistics.rsdUCo],
        ] as const;

        return (
            <div className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" style={{marginTop: "16px" , padding:"16px"}}>
                <div className="space-y-1">
                    <h3 className="text-s font-semibold text-slate-900">İstatistiksel Veriler</h3>
                    <p className="mt-1 text-sm text-slate-500">Regresyon hesabından üretilen ara de?erler ve belirsizlik özeti.</p>
                </div>

                <div className="overflow-x-auto rounded-md border border-slate-200 [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200" style={{margin: "16px 0 16px 0"}}>
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="min-w-[90px]" style={{paddingLeft: "16px"}}>Xi</TableHead>
                                <TableHead className="min-w-[110px]">(Xi-Xort)</TableHead>
                                <TableHead className="min-w-[130px]">(Xi-Xort)²</TableHead>
                                <TableHead className="min-w-[90px]">Yi</TableHead>
                                <TableHead className="min-w-[110px]">Yi-ŷ</TableHead>
                                <TableHead className="min-w-[130px]">(Yi-ŷ)²</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {result.statistics.rows.map((row, index) => (
                                <TableRow key={`${row.x}-${row.y}-${index}`}>
                                    <TableCell className="py-3 text-xs" style={{padding: "6px 0 6px 16px" }}>{formatStat(row.x)}</TableCell>
                                    <TableCell className="py-3 text-xs">{formatStat(row.xDelta)}</TableCell>
                                    <TableCell className="py-3 text-xs">{formatStat(row.xDeltaSquared)}</TableCell>
                                    <TableCell className="py-3 text-xs">{formatStat(row.y)}</TableCell>
                                    <TableCell className="py-3 text-xs">{formatStat(row.yResidual)}</TableCell>
                                    <TableCell className="py-3 text-xs">{formatStat(row.yResidualSquared)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {summary.map(([label, value]) => (
                        <div key={label} className="min-h-[50px] rounded-lg border border-slate-200 bg-slate-50 px-4 py-3" style={{padding: "6px 0 6px 16px" }}>
                            <div className="text-[12px] font-medium text-slate-500">{label}</div>
                            <div className="mt-2 break-words font-mono text-sm font-semibold leading-5 text-slate-900">{formatStat(value)}</div>
                        </div>
                    ))}
                </div>
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
                    <div
                        className="truncate text-[var(--color-text-primary)]"
                        style={{ fontSize: ".95rem", fontWeight: 800 }}
                    >
                        Doğrusallık (Kalibrasyon) Çalışması
                    </div>
                </div>
                <p className="text-left text-[0.78rem] leading-5 text-[var(--color-text-tertiary)] sm:max-w-[48%] sm:text-right">
                    Konsantrasyon ve cihaz yanıtlarını girerek kalibrasyon eğrisini oluşturun.
                </p>
            </div>

            <div className="space-y-4 px-4 pb-4 pt-5" style={{ padding: "16px"}}>
                <div
                    className="rounded-xl border [border-color:var(--color-border-light)] bg-[var(--color-bg)]"
                    style={{ padding: "16px" , marginBottom:"16px"  }}
                >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
                            <Label htmlFor="replicates" className="whitespace-nowrap text-sm font-medium" style={{fontWeight: 700}}>Tekrar Sayısı (n):</Label>
                            <Select value={replicates.toString()} onValueChange={handleReplicateChange}>
                                <SelectTrigger id="replicates" className="h-9 w-[60px] bg-white" style={{ padding: "8px" }}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent style={{ padding: "5px" }}>
                                    <SelectItem value="1">1</SelectItem>
                                    <SelectItem value="2">2</SelectItem>
                                    <SelectItem value="3">3</SelectItem>
                                    <SelectItem value="5">5</SelectItem>
                                </SelectContent>
                            </Select>
                            <Label className="ml-0 text-sm font-medium whitespace-nowrap sm:ml-3" style={{fontWeight: 700}}>Birim:</Label>
                            <Select value={settings.unit} onValueChange={(v: string) => updateSettings('unit', v)}>
                                <SelectTrigger className="h-9 w-[120px] bg-white" style={{ padding: "8px" }}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent style={{ padding: "16px" }}>
                                    {UNITS.map(u => (
                                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                    </div>

                    <div className="min-w-0 flex-1 xl:max-w-[660px]">
                            <Label htmlFor="linearity-notes" className="text-sm font-medium" style={{ paddingBottom: "8px", paddingTop: "8px"  , fontWeight: 700}}>Notlar / Açıklamalar</Label>
                            <Textarea
                                id="linearity-notes"
                                placeholder="Bu çalışma ile ilgili genel notlar..."
                                className="mt-2 min-h-16 resize-y bg-white"
                                value={settings.notes}
                                onChange={(e) => updateSettings('notes', e.target.value)}
                                style={{ padding: "6px" }}
                            />
                        </div>
                </div>

                <Tabs value={activeComponent} onValueChange={setActiveComponent} >
                    <TabsList className="mb-4 flex h-auto max-w-full flex-wrap justify-start gap-1 bg-slate-100 p-1" style={{ marginBottom: "16px" }}>
                        {components.map(comp => (
                            <TabsTrigger key={comp} value={comp} className="min-h-9 min-w-[104px] flex-1 px-3 text-sm sm:flex-none sm:min-w-[120px]">
                                {comp}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {components.map(comp => {
                        const currentData = getComponentData(comp);
                        const result = results[comp];

                        return (
                            <TabsContent key={comp} value={comp} className="space-y-4 pt-1">
                                <div className="grid min-w-0 gap-4 xl:grid-cols-5">

                                    {/* Input Section (3 cols wide) */}
                                    <div className="min-w-0 space-y-4 xl:col-span-2">
                                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200">
                                            <Table>
                                                <TableHeader className="bg-slate-50">
                                                    <TableRow >
                                                        <TableHead className="w-[72px] text-center">Seviye</TableHead>
                                                        <TableHead className="min-w-[60px]">Konsantrasyon</TableHead>
                                                        <TableHead className="min-w-[120px]">Area</TableHead>
                                                        <TableHead className="w-[50px]"></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {currentData.map((row, idx) => (
                                                        // Render multiple rows per Level based on replicates
                                                        Array.from({ length: replicates }).map((_, rIdx) => (
                                                            <TableRow key={`${row.id}-${rIdx}`}>
                                                                {/* Level Cell: Render only on first replicate, simple centered text */}
                                                                {rIdx === 0 ? (
                                                                    <TableCell rowSpan={replicates} className="align-middle border-r border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-600">
                                                                        {row.level}
                                                                    </TableCell>
                                                                ) : null}

                                                                <TableCell className="p-2">
                                                                    <Input
                                                                        className="h-9 bg-white"
                                                                        style={{padding: "10px"}}
                                                                        placeholder="Conc."
                                                                        value={row.concentrations[rIdx] || ''}
                                                                        onChange={(e) => handleDataChange(comp, idx, 'concentration', e.target.value, rIdx)}
                                                                        onPaste={(e) => handlePaste(e, comp, idx, rIdx, 'concentration')}
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="p-2">
                                                                    <Input
                                                                        className="h-9 bg-white"
                                                                        style={{padding: "10px"}}
                                                                        placeholder={`R${rIdx + 1}`}
                                                                        value={row.responses[rIdx] || ''}
                                                                        onChange={(e) => handleDataChange(comp, idx, 'response', e.target.value, rIdx)}
                                                                        onPaste={(e) => handlePaste(e, comp, idx, rIdx, 'response')}
                                                                    />
                                                                </TableCell>

                                                                {/* Remove Button: Only on first replicate */}
                                                                {rIdx === 0 ? (
                                                                    <TableCell rowSpan={replicates} className="align-middle text-center p-1">
                                                                        <Button variant="ghost" size="icon" onClick={() => removeRow(comp, idx)} className="h-9 w-9 text-slate-400 hover:text-red-500">
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </TableCell>
                                                                ) : null}
                                                            </TableRow>
                                                        ))
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: "10px", marginTop: "10px" }}>
                                            <Button variant="outline" size="sm" onClick={() => addRow(comp)} className="text-blue-600 border-blue-200 hover:bg-blue-50" style={{padding: "10px"}}>
                                                <Plus className="h-4 w-4 mr-1" /> Seviye Ekle
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => clearComponentData(comp)} className="border-slate-200 text-slate-600 hover:bg-slate-50" style={{ padding: "10px" }}>
                                                Temizle
                                            </Button>
                                        </div>

                                        <div className="flex flex-col gap-2 pt-4 sm:flex-row">
                                            <Button className="min-h-10 flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => calculateRegression(comp)}>
                                                <Calculator className="h-4 w-4 mr-2" /> Hesapla
                                            </Button>
                                            <Button
                                                className="min-h-10 flex-1 bg-green-600 hover:bg-green-700"
                                                disabled={!result}
                                                onClick={() => {
                                                    const dataToSave = {
                                                        component: comp,
                                                        unit: settings.unit,
                                                        notes: settings.notes,
                                                        rawData: allData[comp],
                                                        results: results[comp]
                                                    };
                                                    broadcastToReport(comp);
                                                    alert("Veriler rapora eklendi!");
                                                }}
                                            >
                                                <Save className="h-4 w-4 mr-2" /> Kaydet
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="min-w-0 flex h-fit flex-col bg-slate-50 p-4 xl:col-span-3" >
                                        {result ? (
                                            <>
                                                <div className="mb-6 space-y-3">
                                                    <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm" style={{padding: "6px", marginBottom: "5px"}}>
                                                        <p className="text-xs font-semibold uppercase text-slate-500">R² (Determinasyon): </p>
                                                        <p className={`text-xl font-bold ${result.rSquared > 0.99 ? 'text-green-600' : 'text-amber-600'}`}>
                                                           {result.rSquared.toFixed(4)}
                                                        </p>
                                                    </div>

                                                    <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm" style={{padding: "6px", marginBottom: "5px"}}>
                                                        <p className="text-xs font-semibold uppercase text-slate-500">Denklem: </p>
                                                        <p className={`text-xl font-bold ${result.rSquared > 0.99 ? 'text-green-600' : 'text-amber-600'}`}>
                                                           {result.equation}
                                                        </p>
                                                    </div>


                                                </div>

                                                <div className="min-h-[300px] w-full rounded-lg border border-slate-200 bg-white p-2">
                                                    <ResponsiveContainer width="100%" height={300}>
                                                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis
                                                                type="number"
                                                                dataKey="x"
                                                                name="Kons."
                                                                tick={{ fontSize: 12 }}
                                                            />
                                                            <YAxis type="number" dataKey="y" name="Yanıt" tick={{ fontSize: 12 }} />
                                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                                            <Legend verticalAlign="top" height={36} />
                                                            <Scatter name="Area" data={result.points.filter(p => p.type === 'measure')} fill="#2563eb" />
                                                            <Scatter name="Kalibrasyon Eğrisi" data={result.points.filter(p => p.type === 'predicted')} line={{ stroke: '#16a34a', strokeWidth: 2 }} shape={() => <></>} legendType="line" />
                                                        </ScatterChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-slate-400">
                                                <Activity className="h-16 w-16 mb-4 opacity-20" />
                                                <p className="text-center">Kalibrasyon eğrisini <br /> görmek için hesaplayın.</p>
                                            </div>
                                        )}
                                    </div>

                                </div>

                                {result ? renderStatistics(result) : null}
                            </TabsContent>
                        );
                    })}
                </Tabs>
            </div>
        </div>
    );
}
