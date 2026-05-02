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

type AnalystGrid = string[][];
type LevelData = Record<string, Record<string, AnalystGrid>>;
type ComponentData = Record<string, LevelData>;
type TargetMap = Record<string, Record<string, string>>;
type MatrixMap = Record<string, Record<string, string>>;
type UnitMap = Record<string, string>;
type NotesMap = Record<string, string>;
type CountMap = Record<string, number>;

interface PrecisionRepeatabilityFormProps {
    components: string[];
    personnel: string[];
    initialData?: Record<string, any>;
    onReportDataChange?: (data: any) => void;
}

const DEFAULT_ROWS = 6;
const DEFAULT_COLS = 2;
const PARALLEL_COUNTS = Array.from({ length: 10 }, (_, index) => index + 6);
const LEVEL_COUNTS = [1, 2, 3];

const UNITS = [
    { value: "mg_L", label: "mg/L (ppm)" },
    { value: "ug_L", label: "µg/L (ppb)" },
    { value: "ng_L", label: "ng/L (ppt)" },
    { value: "mg_kg", label: "mg/kg (ppm)" },
    { value: "ug_kg", label: "µg/kg (ppb)" },
    { value: "percent", label: "% (w/w)" },
    { value: "conc", label: "Konsantrasyon" },
];

const createEmptyGrid = (rowCount = DEFAULT_ROWS) =>
    Array(rowCount).fill(null).map(() => Array(DEFAULT_COLS).fill(""));

const normalizeGrid = (grid: AnalystGrid, rowCount: number) => {
    const nextGrid = grid.slice(0, rowCount).map(row => {
        const normalizedRow = row.slice(0, DEFAULT_COLS);
        while (normalizedRow.length < DEFAULT_COLS) normalizedRow.push("");
        return normalizedRow;
    });

    while (nextGrid.length < rowCount) {
        nextGrid.push(Array(DEFAULT_COLS).fill(""));
    }

    return nextGrid;
};

const parseNumber = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const formatValue = (value: number) => Number.isFinite(value) ? value.toFixed(3) : "-";

const sampleStdDev = (values: number[]) => {
    if (values.length < 2) return Number.NaN;
    const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
    const variance = values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
};

const getLevelLabel = (index: number, total: number) => {
    if (total === 1) return "1. Düzey";
    if (total === 2) return index === 0 ? "Düşük Seviye" : "Yüksek Seviye";
    return ["Düşük Seviye", "Orta Seviye", "Yüksek Seviye"][index] || `${index + 1}. Düzey`;
};

const levelKeys = (count: number) => Array.from({ length: count }, (_, index) => `level-${index}`);

export function PrecisionRepeatabilityForm({ components = ["Genel"], personnel = ["Ali", "Duygu"], initialData = {}, onReportDataChange }: PrecisionRepeatabilityFormProps) {
    const analysts = personnel.length > 0 ? personnel : ["Ali", "Duygu"];
    const [activeComponent, setActiveComponent] = useState(components[0] || "Genel");
    const [targets, setTargets] = useState<TargetMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.targets || Object.fromEntries((data?.levels || []).map((level: any) => [level.key, level.target || ""]))]))
    );
    const [matrices, setMatrices] = useState<MatrixMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.matrices || Object.fromEntries((data?.levels || []).map((level: any) => [level.key, level.matrix || ""]))]))
    );
    const [units, setUnits] = useState<UnitMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.unit || "mg_kg"]))
    );
    const [notes, setNotes] = useState<NotesMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.notes || ""]))
    );
    const [parallelCounts, setParallelCounts] = useState<CountMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, Number(data?.parallelCount) || DEFAULT_ROWS]))
    );
    const [levelCounts, setLevelCounts] = useState<CountMap>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, Number(data?.levelCount) || 2]))
    );
    const [allData, setAllData] = useState<ComponentData>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, data?.rawData || {}]))
    );
    const [calculatedResults, setCalculatedResults] = useState<Record<string, Record<string, any>>>({});

    const getUnit = (component: string) => units[component] || "mg_kg";
    const getUnitLabel = (component: string) => UNITS.find(unit => unit.value === getUnit(component))?.label || "mg/kg (ppm)";
    const getParallelCount = (component: string) => parallelCounts[component] || DEFAULT_ROWS;
    const getLevelCount = (component: string) => levelCounts[component] || 2;

    const getGrid = (component: string, levelKey: string, analyst: string) => {
        const rowCount = getParallelCount(component);
        return normalizeGrid(allData[component]?.[levelKey]?.[analyst] || createEmptyGrid(rowCount), rowCount);
    };

    const updateTarget = (component: string, levelKey: string, value: string) => {
        setTargets(current => ({
            ...current,
            [component]: {
                ...(current[component] || {}),
                [levelKey]: value
            }
        }));
    };

    const updateMatrix = (component: string, levelKey: string, value: string) => {
        setMatrices(current => ({
            ...current,
            [component]: {
                ...(current[component] || {}),
                [levelKey]: value
            }
        }));
    };

    const updateCell = (component: string, levelKey: string, analyst: string, rowIndex: number, colIndex: number, value: string) => {
        const currentGrid = getGrid(component, levelKey, analyst);
        const nextGrid = currentGrid.map(row => [...row]);
        nextGrid[rowIndex][colIndex] = value;

        setCalculatedResults(current => ({
            ...current,
            [component]: {
                ...(current[component] || {}),
                [levelKey]: undefined
            }
        }));

        setAllData(current => ({
            ...current,
            [component]: {
                ...(current[component] || {}),
                [levelKey]: {
                    ...(current[component]?.[levelKey] || {}),
                    [analyst]: nextGrid
                }
            }
        }));
    };

    const clearLevel = (component: string, levelKey: string) => {
        const nextAnalysts = Object.fromEntries(analysts.map(analyst => [analyst, createEmptyGrid(getParallelCount(component))]));
        setCalculatedResults(current => ({
            ...current,
            [component]: {
                ...(current[component] || {}),
                [levelKey]: undefined
            }
        }));
        setAllData(current => ({
            ...current,
            [component]: {
                ...(current[component] || {}),
                [levelKey]: nextAnalysts
            }
        }));
    };

    const addRow = (component: string) => {
        setCalculatedResults(current => ({ ...current, [component]: {} }));
        setParallelCounts(current => ({
            ...current,
            [component]: Math.min((current[component] || DEFAULT_ROWS) + 1, 15)
        }));
    };

    const removeRow = (component: string, levelKey: string, rowIndex: number) => {
        const rowCount = getParallelCount(component);
        if (rowCount <= 3) return;

        setCalculatedResults(current => ({
            ...current,
            [component]: {
                ...(current[component] || {}),
                [levelKey]: undefined
            }
        }));

        setAllData(current => {
            const currentLevel = current[component]?.[levelKey] || {};
            const nextLevel = Object.fromEntries(
                analysts.map(analyst => {
                    const grid = normalizeGrid(currentLevel[analyst] || createEmptyGrid(rowCount), rowCount);
                    return [analyst, grid.filter((_, index) => index !== rowIndex)];
                })
            );

            return {
                ...current,
                [component]: {
                    ...(current[component] || {}),
                    [levelKey]: nextLevel
                }
            };
        });

        setParallelCounts(current => ({
            ...current,
            [component]: Math.max((current[component] || DEFAULT_ROWS) - 1, 3)
        }));
    };

    const handlePaste = (
        event: ClipboardEvent<HTMLInputElement>,
        component: string,
        levelKey: string,
        analyst: string,
        rowIndex: number,
        colIndex: number
    ) => {
        event.preventDefault();
        const clipboardData = event.clipboardData.getData("text");
        if (!clipboardData) return;

        const rows = clipboardData.split(/\r\n|\n|\r/).filter(row => row.trim() !== "");
        const currentGrid = getGrid(component, levelKey, analyst);
        const nextGrid = currentGrid.map(row => [...row]);

        setCalculatedResults(current => ({
            ...current,
            [component]: {
                ...(current[component] || {}),
                [levelKey]: undefined
            }
        }));

        rows.forEach((rowText, pastedRowIndex) => {
            const targetRowIndex = rowIndex + pastedRowIndex;
            while (targetRowIndex >= nextGrid.length) {
                nextGrid.push(Array(DEFAULT_COLS).fill(""));
            }

            rowText.split("\t").forEach((cellValue, pastedColIndex) => {
                const targetColIndex = colIndex + pastedColIndex;
                if (targetColIndex < DEFAULT_COLS) {
                    nextGrid[targetRowIndex][targetColIndex] = cellValue.trim();
                }
            });
        });

        setParallelCounts(current => ({
            ...current,
            [component]: Math.min(Math.max(current[component] || DEFAULT_ROWS, nextGrid.length), 15)
        }));

        setAllData(current => ({
            ...current,
            [component]: {
                ...(current[component] || {}),
                [levelKey]: {
                    ...(current[component]?.[levelKey] || {}),
                    [analyst]: normalizeGrid(nextGrid, Math.min(nextGrid.length, 15))
                }
            }
        }));
    };

    const calculateAnalyst = (grid: AnalystGrid) => {
        const values = grid.flat().map(parseNumber).filter(Number.isFinite);
        const n = values.length;
        const mean = n > 0 ? values.reduce((acc, value) => acc + value, 0) / n : Number.NaN;
        const stdDev = sampleStdDev(values);
        const rsdr = Number.isFinite(stdDev) && mean !== 0 ? stdDev / mean : Number.NaN;
        const rsdrPoolPart = Number.isFinite(rsdr) && n > 1 ? Math.pow(rsdr, 2) * (n - 1) : Number.NaN;
        const repeatabilityLimit = Number.isFinite(stdDev) ? 2.83 * stdDev : Number.NaN;

        return { values, n, mean, stdDev, rsdr, rsdrPoolPart, repeatabilityLimit };
    };

    const calculateLevelStats = (component: string, levelKey: string) => {
        const analystStats = Object.fromEntries(
            analysts.map(analyst => [analyst, calculateAnalyst(getGrid(component, levelKey, analyst))])
        );
        const validStats = Object.values(analystStats).filter(stat => Number.isFinite(stat.rsdrPoolPart) && stat.n > 1);
        const numerator = validStats.reduce((acc, stat) => acc + stat.rsdrPoolPart, 0);
        const denominator = validStats.reduce((acc, stat) => acc + (stat.n - 1), 0);
        const pooledRsd = denominator > 0 ? Math.sqrt(numerator / denominator) : Number.NaN;

        return { analystStats, pooledRsd };
    };

    const buildReportLevels = (component: string) => {
        return levelKeys(getLevelCount(component)).map((levelKey, index) => {
            const stats = calculateLevelStats(component, levelKey);
            return {
                key: levelKey,
                label: getLevelLabel(index, getLevelCount(component)),
                target: targets[component]?.[levelKey] || "",
                matrix: matrices[component]?.[levelKey] || "",
                analysts: stats.analystStats,
                pooledRsd: stats.pooledRsd
            };
        });
    };

    const handleCalculate = (component: string) => {
        const levels = buildReportLevels(component);
        const filledCount = levels.reduce((total, level) => {
            return total + Object.values(level.analysts).reduce((sum, stat) => sum + stat.values.length, 0);
        }, 0);

        if (filledCount === 0) {
            alert("Hesaplama için önce veri giriniz.");
            return;
        }

        setCalculatedResults(current => ({
            ...current,
            [component]: Object.fromEntries(levels.map(level => [
                level.key,
                {
                    analystStats: level.analysts,
                    pooledRsd: level.pooledRsd
                }
            ]))
        }));
    };

    const saveToReport = (component: string) => {
        if (!onReportDataChange) return;
        const levels = buildReportLevels(component);

        onReportDataChange({
            type: "PRECISION_REPEATABILITY",
            component,
            data: {
                unit: getUnit(component),
                unitLabel: getUnitLabel(component),
                notes: notes[component] || "",
                parallelCount: getParallelCount(component),
                levelCount: getLevelCount(component),
                levels,
                targets: targets[component] || {},
                matrices: matrices[component] || {},
                rawData: allData[component] || {}
            }
        });
        alert(`${component} kesinlik verileri rapora eklendi!`);
    };

    const renderLevelTable = (component: string, levelKey: string, levelIndex: number) => {
        const levelCount = getLevelCount(component);
        const levelLabel = getLevelLabel(levelIndex, levelCount);
        const rowCount = getParallelCount(component);
        const calculated = calculatedResults[component]?.[levelKey];

        const renderResultPanel = () => {
            if (!calculated) {
                return (
                    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 xl:col-span-2" style={{ marginBottom: "10px" }}>
                        <Calculator className="mb-3 h-12 w-12 text-slate-300" />
                        <p className="text-center text-sm text-slate-400">
                            Bu bileşen için henüz hesaplama yapılmadı.<br />
                            Verileri girip "Hesapla" butonuna basın.
                        </p>
                    </div>
                );
            }

            const resultAnalysts = analysts.slice(0, 2);
            const [firstAnalyst, secondAnalyst] = resultAnalysts;
            const statRows = [
                ["Std Sapma", "stdDev"],
                ["n", "n"],
                ["(RSDr2)*(n-1)", "rsdrPoolPart"],
                ["Xort", "mean"],
                ["RSDr", "rsdr"],
                ["r:2,83*Sr", "repeatabilityLimit"],
            ] as const;
            const getDiffResult = (analyst: string | undefined, rowIndex: number) => {
                if (!analyst) return { diff: Number.NaN, hasStatus: false, isSuitable: false };
                const stat = calculated.analystStats[analyst];
                const grid = getGrid(component, levelKey, analyst);
                const firstValue = parseNumber(grid[rowIndex]?.[0] || "");
                const secondValue = parseNumber(grid[rowIndex]?.[1] || "");
                const diff = Number.isFinite(firstValue) && Number.isFinite(secondValue)
                    ? Math.abs(firstValue - secondValue)
                    : Number.NaN;
                const hasStatus = Number.isFinite(diff) && Number.isFinite(stat?.repeatabilityLimit);
                const isSuitable = hasStatus && diff < stat.repeatabilityLimit;
                return { diff, hasStatus, isSuitable };
            };

            return (
                <div className="max-h-[500px] overflow-auto rounded-lg border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200 xl:col-span-2" style={{ marginBottom: "20px", padding: "12px" }}>
                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-2" style={{marginBottom: "10px"}}>
                        <div>
                            <div className="text-sm font-bold text-slate-900">{levelLabel} Sonuçları</div>
                            <div className="text-xs text-slate-500" style={{marginBottom: "10px"}}>Kişi bazlı fark kontrolü ve istatistikler</div>
                        </div>
                        <div className="rounded-md bg-orange-100 px-3 py-2 text-right" style={{padding:"8px", marginBottom: "10px"}}>
                            <div className="flex items-center justify-end gap-2">
                            <div className="text-[13px] font-semibold uppercase text-orange-700">RSDpool</div> 
                            <div className="text-m font-bold text-orange-900" >{formatValue(calculated.pooledRsd)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4" style={{marginTop:"10px"}}>
                        <div className="overflow-hidden rounded-md border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead colSpan={3} className="h-8 text-center text-xs font-bold">{firstAnalyst || "1. Kişi"}</TableHead>
                                        <TableHead colSpan={2} className="h-8 border-l border-slate-200 text-center text-xs font-bold">{secondAnalyst || "2. Kişi"}</TableHead>
                                    </TableRow>
                                    <TableRow >
                                        <TableHead className="h-8 text-xs"   style={{paddingLeft:"10px"}}>#</TableHead>
                                        <TableHead className="h-8 text-xs" style={{paddingLeft:"10px"}}>|1.A-2.A|</TableHead>
                                        <TableHead className="h-8 text-xs" >|1.A-2.A| &lt; r</TableHead>
                                        <TableHead className="h-8 border-l border-slate-200 text-xs" style={{paddingLeft:"10px"}}>|1.A-2.A|</TableHead>
                                        <TableHead className="h-8 text-xs">|1.A-2.A| &lt; r</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Array.from({ length: rowCount }).map((_, rowIndex) => {
                                        const first = getDiffResult(firstAnalyst, rowIndex);
                                        const second = getDiffResult(secondAnalyst, rowIndex);

                                        return (
                                            <TableRow key={`${levelKey}-diff-row-${rowIndex}`}>
                                                <TableCell className="py-1 text-xs" style={{padding:"3px"}}>{rowIndex + 1}</TableCell>
                                                <TableCell className="py-1 text-xs font-semibold" style={{paddingLeft:"10px"}}>{formatValue(first.diff)}</TableCell>
                                                <TableCell className={`py-1 text-xs font-bold ${first.hasStatus ? (first.isSuitable ? "text-green-700" : "text-red-700") : "text-slate-400"}`} style={{paddingLeft:"10px"}}>
                                                    {first.hasStatus ? (first.isSuitable ? "Uygun" : "Uygun Değil") : "-"}
                                                </TableCell>
                                                <TableCell className="border-l border-slate-200 py-1 text-xs font-semibold" style={{paddingLeft:"10px"}}>{formatValue(second.diff)}</TableCell>
                                                <TableCell className={`py-1 text-xs font-bold ${second.hasStatus ? (second.isSuitable ? "text-green-700" : "text-red-700") : "text-slate-400"}`}>
                                                    {second.hasStatus ? (second.isSuitable ? "Uygun" : "Uygun Değil") : "-"}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="overflow-hidden rounded-md border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200" style={{marginTop:"10px"}}>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="h-8 text-center text-xs font-bold">İstatistik</TableHead>
                                        <TableHead className="h-8 text-center text-xs font-bold">{firstAnalyst || "1. Kişi"}</TableHead>
                                        <TableHead className="h-8 text-center text-xs font-bold">{secondAnalyst || "2. Kişi"}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {statRows.map(([label, key]) => (
                                        <TableRow key={`${levelKey}-stat-${label}`}>
                                            <TableCell className="py-1 text-xs font-semibold text-slate-600" style={{padding:"3px"}}>{label}</TableCell>
                                            <TableCell className="py-1 text-center text-xs text-slate-900">
                                                {formatValue(calculated.analystStats[firstAnalyst]?.[key])}
                                            </TableCell>
                                            <TableCell className="py-1 text-center text-xs text-slate-900">
                                                {formatValue(calculated.analystStats[secondAnalyst]?.[key])}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            );
        };

        return (
            <div key={levelKey} className="space-y-3">
                <div className="grid min-w-0 gap-4 xl:grid-cols-5">
                    <div className="min-w-0 xl:col-span-3">
                        <div className="max-h-[500px] overflow-auto rounded-lg border border-slate-200 bg-white [&_td]:border-slate-200 [&_th]:border-slate-200 [&_tr]:border-slate-200">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                                    <TableRow>
                                        <TableHead className="w-[72px] text-center">#</TableHead>
                                        <TableHead colSpan={analysts.length * 2 + 1} className="text-center">
                                            {levelLabel}
                                        </TableHead>
                                        <TableHead className="w-[42px]"></TableHead>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="w-[72px] text-center"></TableHead>
                                        <TableHead colSpan={analysts.length * 2 + 1} className="border-l border-slate-200 p-2">
                                            <div className="grid gap-2 sm:grid-cols-3">
                                                <Input
                                                    value={matrices[component]?.[levelKey] || ""}
                                                    onChange={(event) => updateMatrix(component, levelKey, event.target.value)}
                                                    placeholder="Matriks"
                                                    className="h-9 bg-white text-center"
                                                    style={{ padding: "10px" }}
                                                />
                                                <Input
                                                    value={targets[component]?.[levelKey] || ""}
                                                    onChange={(event) => updateTarget(component, levelKey, event.target.value)}
                                                    placeholder="Hedef Değer"
                                                    className="h-9 bg-white text-center"
                                                    style={{ padding: "10px" }}
                                                />
                                                <div className="flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600">
                                                    {getUnitLabel(component)}
                                                </div>
                                            </div>
                                        </TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="w-[72px] text-center"></TableHead>
                                        {analysts.map(analyst => (
                                            <TableHead key={analyst} colSpan={2} className="min-w-[220px] border-l border-slate-200 text-center">
                                                {analyst}
                                            </TableHead>
                                        ))}
                                        <TableHead className="border-l border-slate-200 text-center"></TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="w-[72px] text-center"></TableHead>
                                        {analysts.flatMap(analyst => [
                                            <TableHead key={`${analyst}-first`} className="min-w-[110px] border-l border-slate-200 text-center">Paralel 1</TableHead>,
                                            <TableHead key={`${analyst}-second`} className="min-w-[110px] border-l border-slate-200 text-center">Paralel 2</TableHead>
                                        ])}
                                        <TableHead className="border-l border-slate-200 text-center"></TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Array.from({ length: rowCount }).map((_, rowIndex) => (
                                        <TableRow key={`${levelKey}-${rowIndex}`}>
                                            <TableCell className="border-r border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-600">
                                                {rowIndex + 1}
                                            </TableCell>
                                            {analysts.flatMap(analyst => {
                                                const grid = getGrid(component, levelKey, analyst);

                                                return [0, 1].map(colIndex => (
                                                    <TableCell key={`${levelKey}-${analyst}-${rowIndex}-${colIndex}`} className="border-l border-slate-200 p-2">
                                                        <Input
                                                            value={grid[rowIndex]?.[colIndex] || ""}
                                                            onChange={(event) => updateCell(component, levelKey, analyst, rowIndex, colIndex, event.target.value)}
                                                            onPaste={(event) => handlePaste(event, component, levelKey, analyst, rowIndex, colIndex)}
                                                            className="h-9 bg-white text-center"
                                                            style={{ padding: "10px" }}
                                                            placeholder="-"
                                                        />
                                                    </TableCell>
                                                ));
                                            })}
                                            <TableCell className="border-l border-slate-200 p-0"></TableCell>
                                            <TableCell className="w-[42px] p-1 text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                                                    onClick={() => removeRow(component, levelKey, rowIndex)}
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
                                disabled={rowCount >= 15}
                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                style={{ padding: "10px" }}
                            >
                                <Plus className="mr-2 h-4 w-4" /> Satır Ekle
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => clearLevel(component, levelKey)}
                                className="border-slate-200 text-slate-600 hover:bg-slate-50"
                                style={{ padding: "10px" }}
                            >
                                Temizle
                            </Button>
                        </div>
                    </div>

                    {renderResultPanel()}
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
                    <div className="truncate text-[var(--color-text-primary)]" style={{ fontSize: ".95rem", fontWeight: 800 }}>
                        Tekrarlanabilirlik Çalışması
                    </div>
                </div>
                <p className="text-left text-[0.78rem] leading-5 text-[var(--color-text-tertiary)] sm:max-w-[48%] sm:text-right">
                    Analist bazlı RSDr, tekrarlanabilirlik sınırı ve havuzlanmış RSD hesapları.
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

                    {components.map(component => (
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
                                            Paralel Çalışma Sayısı:
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

                                        <Label className="ml-0 whitespace-nowrap text-sm font-medium sm:ml-3" style={{ fontWeight: 700 }}>
                                            Düzey Çalışma Sayısı:
                                        </Label>
                                        <Select
                                            value={getLevelCount(component).toString()}
                                            onValueChange={(value) => setLevelCounts(current => ({ ...current, [component]: Number(value) }))}
                                        >
                                            <SelectTrigger className="h-9 w-[74px] bg-white" style={{ padding: "8px" }}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent style={{ padding: "8px" }}>
                                                {LEVEL_COUNTS.map(count => (
                                                    <SelectItem key={count} value={count.toString()}>{count}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1 xl:max-w-[660px]">
                                    <Label htmlFor={`precision-notes-${component}`} className="text-sm font-medium" style={{ paddingBottom: "8px", paddingTop: "8px", fontWeight: 700 }}>
                                        Notlar / Açıklamalar
                                    </Label>
                                    <Textarea
                                        id={`precision-notes-${component}`}
                                        placeholder="Bu çalışma ile ilgili notlar..."
                                        className="mt-2 min-h-16 resize-y bg-white"
                                        value={notes[component] || ""}
                                        onChange={(event) => setNotes(current => ({ ...current, [component]: event.target.value }))}
                                        style={{ padding: "6px" }}
                                    />
                                </div>
                            </div>

                            <div className="space-y-6">
                                {levelKeys(getLevelCount(component)).map((levelKey, levelIndex) => renderLevelTable(component, levelKey, levelIndex))}
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
                    ))}
                </Tabs>
            </div>
        </div>
    );
}
