"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Save } from "lucide-react";
import { DataEntryTable } from "../shared/DataEntryTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface LodResult {
    mean: number;
    stdDev: number;
    lod: number;
    loq: number;
}

interface LodCalculationFormProps {
    components: string[];
    personnel: string[];
    initialData?: Record<string, any>;
    // Callback to parent for reporting
    onReportDataChange?: (data: any) => void;
}

const UNITS = [
    { value: "mg_L", label: "mg/L (ppm)" },
    { value: "ug_L", label: "µg/L (ppb)" },
    { value: "ng_L", label: "ng/L (ppt)" },
    { value: "mg_kg", label: "mg/kg (ppm)" },
    { value: "ug_kg", label: "µg/kg (ppb)" },
    { value: "percent", label: "% (w/w)" },
    { value: "conc", label: "Konsantrasyon" },
];

export function LodCalculationForm({ components = ["Genel"], personnel = ["Analist"], initialData = {}, onReportDataChange }: LodCalculationFormProps) {
    const [activeComponent, setActiveComponent] = useState(components[0]);

    // Store data as a Map or Object: { [componentName]: string[][] }
    const [allData, setAllData] = useState<Record<string, string[][]>>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, Array.isArray(data?.rows) ? data.rows : []]))
    );

    // Store results: { [componentName]: LodResult }
    const [results, setResults] = useState<Record<string, LodResult>>(() =>
        Object.fromEntries(Object.entries(initialData)
            .filter(([, data]) => Number.isFinite(data?.lod) && Number.isFinite(data?.loq))
            .map(([component, data]) => [component, {
                mean: Number(data.mean),
                stdDev: Number(data.stdDev),
                lod: Number(data.lod),
                loq: Number(data.loq),
            }]))
    );

    // Settings (Unit, Notes) per component
    const [settings, setSettings] = useState<Record<string, { unit: string; notes: string }>>(() =>
        Object.fromEntries(Object.entries(initialData).map(([component, data]) => [component, {
            unit: data?.unit || "mg_L",
            notes: data?.notes || "",
        }]))
    );

    const getSettings = (comp: string) => {
        return settings[comp] || { unit: "mg_L", notes: "" };
    };

    const updateSettings = (comp: string, field: 'unit' | 'notes', value: string) => {
        setSettings({
            ...settings,
            [comp]: { ...getSettings(comp), [field]: value }
        });
    };

    const handleDataChange = (component: string, data: string[][]) => {
        setAllData(prev => ({
            ...prev,
            [component]: data
        }));
    };

    const calculateStats = (component: string) => {
        const data = allData[component] || [];

        // Flatten grid to single array
        const flatData = data.flat()
            .map(val => parseFloat(val.replace(',', '.')))
            .filter(n => !isNaN(n) && n !== 0);

        if (flatData.length < 3) {
            alert(`${component} için en az 3 geçerli değer giriniz.`);
            return;
        }

        // Calculate Mean
        const sum = flatData.reduce((a, b) => a + b, 0);
        const mean = sum / flatData.length;

        // Calculate StdDev (Sample)
        const variance = flatData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (flatData.length - 1);
        const stdDev = Math.sqrt(variance);

        // LOD = Mean + 3s, LOQ = Mean + 10s
        const lod = mean + (3 * stdDev);
        const loq = mean + (10 * stdDev);

        setResults(prev => ({
            ...prev,
            [component]: { mean, stdDev, lod, loq }
        }));
    };

    const broadcastToReport = (comp: string) => {
        if (!onReportDataChange || !results[comp]) return;

        // Construct standardized report object for LOD
        const reportPayload = {
            type: 'LOD_LOQ',
            component: comp,
            data: {
                ...results[comp],
                unit: getSettings(comp).unit,
                notes: getSettings(comp).notes,
                rows: allData[comp] || []
            }
        };
        onReportDataChange(reportPayload);
    };

    return (
        <div className="overflow-hidden rounded-[14px] border [border-color:var(--color-border-light)] bg-[var(--color-surface)]">
            <div
                className="flex flex-col gap-2 border-b [border-color:var(--color-border-light)] bg-[var(--color-surface-2)] sm:flex-row sm:items-center sm:justify-between"
                style={{ display: "flex", padding: "14px 16px" }}
            >
                <div className="flex min-w-0 items-center gap-2">
                    <Calculator className="h-5 w-5 shrink-0 text-blue-600" />
                    <div
                        className="truncate text-[var(--color-text-primary)]"
                        style={{ fontSize: ".95rem", fontWeight: 800 }}
                    >
                        LOD & LOQ Hesaplama
                    </div>
                </div>
                <p className="text-left text-[0.78rem] leading-5 text-[var(--color-text-tertiary)] sm:max-w-[48%] sm:text-right">
                    Her bileşen için veri girişi yaparak LOD ve LOQ değerlerini hesaplayın.
                </p>
            </div>

            <div className="space-y-4 px-4 pb-4 pt-5" style={{ padding: "16px" }}>

                    <Tabs value={activeComponent} onValueChange={setActiveComponent} className="w-full">


                        {components.map(comp => {
                            const setting = getSettings(comp);

                            return (
                                <TabsContent key={comp} value={comp} className="space-y-4">

                                    <div
                                        className="rounded-xl border [border-color:var(--color-border-light)] bg-[var(--color-bg)]"
                                        style={{ padding: "16px", marginBottom: "16px" }}
                                    >
                                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <Label className="whitespace-nowrap text-sm font-medium" style={{ fontWeight: 700 }}>Birim:</Label>
                                                <Select value={setting.unit} onValueChange={(v) => updateSettings(comp, 'unit', v)}>
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
                                            <Label htmlFor={`notes-${comp}`} className="text-sm font-medium" style={{ paddingBottom: "8px", paddingTop: "8px", fontWeight: 700 }}>Notlar / Açıklamalar</Label>
                                            <Textarea
                                                id={`notes-${comp}`}
                                                placeholder="Bu çalışma ile ilgili notlar..."
                                                className="mt-2 min-h-16 resize-y bg-white"
                                                value={setting.notes}
                                                onChange={(e) => updateSettings(comp, 'notes', e.target.value)}
                                                style={{ padding: "6px" }}
                                            />
                                        </div>
                                    </div>

                                     <TabsList className="mb-4 flex h-auto max-w-full flex-wrap justify-start gap-1 bg-slate-100 p-1" style={{ marginBottom: "16px" }}>
                            {components.map(comp => (
                                <TabsTrigger key={comp} value={comp} className="min-h-9 min-w-[104px] flex-1 px-3 text-sm sm:flex-none sm:min-w-[120px]">
                                    {comp}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                                    <div className="grid min-w-0 gap-4 xl:grid-cols-5">

                                        {/* Data Entry Side */}
                                        <div className="min-w-0 space-y-4 xl:col-span-2" >
                                            <DataEntryTable
                                                personnel={personnel}
                                                component={comp}
                                                initialData={allData[comp]}
                                                onDataChange={(data) => handleDataChange(comp, data)}
                                            />

                                            <div className="flex flex-col gap-2 sm:flex-row">
                                                <Button
                                                    className="min-h-10 flex-1 bg-blue-600 hover:bg-blue-700"
                                                    style={{ padding: "10px" }}
                                                    onClick={() => calculateStats(comp)}
                                                >

                                                    <Calculator className="h-4 w-4 mr-2" /> Hesapla
                                                </Button>
                                                <Button
                                                    className="min-h-10 flex-1 bg-green-600 hover:bg-green-700"
                                                    style={{ padding: "10px" }}
                                                    onClick={() => {
                                                        const dataToSave = {
                                                            component: comp,
                                                            unit: setting.unit,
                                                            notes: setting.notes,
                                                            rawData: allData[comp],
                                                            results: results[comp]
                                                        };
                                                        console.log("Saving data:", dataToSave);
                                                        broadcastToReport(comp); // Send to parent
                                                        alert(`${comp} verileri rapora eklendi!`);
                                                    }}
                                                    disabled={!results[comp]}
                                                >
                                                    <Save className="h-4 w-4 mr-2" /> Kaydet
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Results Side */}
                                        <div className="min-w-0 bg-slate-50 p-4 xl:col-span-3">
                                            {results[comp] ? (
                                                <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                                                    <div className="grid gap-3 sm:grid-cols-2" >
                                                        <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border border-slate-200 bg-white p-3 text-right shadow-sm" style={{ padding: "6px", marginBottom: "5px" }}>
                                                            <p className="text-xs font-semibold uppercase text-slate-500" style={{margin: "8px", padding: "2px" }}>Ortalama:</p>
                                                            <p className="text-xl font-bold text-slate-900" style={{paddingRight: "10px"}}>{results[comp].mean.toFixed(4)}</p>
                                                        </div>
                                                        <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border border-slate-200 bg-white p-3 text-right shadow-sm" style={{ padding: "6px", marginBottom: "5px" }}>
                                                            <p className="text-xs font-semibold uppercase text-slate-500">Std. Sapma: </p>
                                                            <p className="text-xl font-bold text-slate-900">{results[comp].stdDev.toFixed(4)}</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4" style={{marginTop: "10px"}}>
                                                        <Card className="bg-blue-50 border-blue-200 shadow-sm ">
                                                            <CardContent className="flex min-h-[112px] flex-col items-center justify-center p-4 text-center" style={{ padding: "10px" }}>
                                                                <p className="text-xs font-semibold text-blue-600 uppercase">LOD</p>
                                                                <p className="text-2xl font-bold text-blue-900 mt-1">{results[comp].lod.toFixed(4)}</p>
                                                                <p className="text-[10px] text-blue-400 mt-1">Tespit Limiti</p>
                                                            </CardContent>
                                                        </Card>
                                                        <Card className="bg-emerald-50 border-emerald-200 shadow-sm">
                                                            <CardContent className="flex min-h-[112px] flex-col items-center justify-center p-4 text-center" style={{ padding: "10px" }}>
                                                                <p className="text-xs font-semibold text-emerald-600 uppercase">LOQ</p>
                                                                <p className="text-2xl font-bold text-emerald-900 mt-1">{results[comp].loq.toFixed(4)}</p>
                                                                <p className="text-[10px] text-emerald-400 mt-1">Tayin Limiti</p>
                                                            </CardContent>
                                                        </Card>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-slate-50 min-h-[300px]">
                                                    <Calculator className="h-12 w-12 text-slate-300 mb-3" />
                                                    <p className="text-slate-400 text-center text-sm">
                                                        Bu bileşen için henüz hesaplama yapılmadı.<br />
                                                        Verileri girip "Hesapla" butonuna basın.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                </TabsContent>
                            );
                        })}
                    </Tabs>
            </div>
        </div>
    );
}
