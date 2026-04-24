"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

export function LodCalculationForm({ components = ["Genel"], personnel = ["Analist"], onReportDataChange }: LodCalculationFormProps) {
    const [activeComponent, setActiveComponent] = useState(components[0]);

    // Store data as a Map or Object: { [componentName]: string[][] }
    const [allData, setAllData] = useState<Record<string, string[][]>>({});

    // Store results: { [componentName]: LodResult }
    const [results, setResults] = useState<Record<string, LodResult>>({});

    // Settings (Unit, Notes) per component
    const [settings, setSettings] = useState<Record<string, { unit: string; notes: string }>>({});

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
                notes: getSettings(comp).notes
            }
        };
        onReportDataChange(reportPayload);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-blue-600" />
                        LOD & LOQ Hesaplama
                    </CardTitle>
                    <CardDescription>
                        Her bileşen için veri girişi yaparak LOD ve LOQ değerlerini hesaplayın.
                    </CardDescription>
                </CardHeader>
                <CardContent>

                    <Tabs value={activeComponent} onValueChange={setActiveComponent} className="w-full">
                        <TabsList className="mb-4 flex flex-wrap h-auto justify-start bg-slate-100 p-1">
                            {components.map(comp => (
                                <TabsTrigger key={comp} value={comp} className="min-w-[100px]">
                                    {comp}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        {components.map(comp => {
                            const setting = getSettings(comp);

                            return (
                                <TabsContent key={comp} value={comp} className="space-y-6">

                                    {/* Unit Selection for Component */}
                                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded border">
                                        <Label className="text-sm font-medium">Birim:</Label>
                                        <Select value={setting.unit} onValueChange={(v) => updateSettings(comp, 'unit', v)}>
                                            <SelectTrigger className="w-[180px] h-8 bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {UNITS.map(u => (
                                                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-8">

                                        {/* Data Entry Side */}
                                        <div className="space-y-4">
                                            <DataEntryTable
                                                personnel={personnel}
                                                component={comp}
                                                initialData={allData[comp]}
                                                onDataChange={(data) => handleDataChange(comp, data)}
                                            />

                                            <div className="space-y-2">
                                                <Label htmlFor={`notes-${comp}`}>Notlar / Açıklamalar</Label>
                                                <Textarea
                                                    id={`notes-${comp}`}
                                                    placeholder="Bu çalışma ile ilgili notlar..."
                                                    className="h-20"
                                                    value={setting.notes}
                                                    onChange={(e) => updateSettings(comp, 'notes', e.target.value)}
                                                />
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                                                    onClick={() => calculateStats(comp)}
                                                >
                                                    <Calculator className="h-4 w-4 mr-2" /> Hesapla ({comp})
                                                </Button>
                                                <Button
                                                    className="flex-1 bg-green-600 hover:bg-green-700"
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
                                        <div>
                                            {results[comp] ? (
                                                <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                                                    <div className="bg-slate-50 border rounded-lg p-4">
                                                        <h3 className="font-semibold text-slate-800 mb-3 border-b pb-2">{comp} - Sonuçlar</h3>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <p className="text-xs text-slate-500 uppercase tracking-wide">Ortalama</p>
                                                                <p className="text-xl font-mono font-medium text-slate-900">{results[comp].mean.toFixed(4)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs text-slate-500 uppercase tracking-wide">Std. Sapma</p>
                                                                <p className="text-xl font-mono font-medium text-slate-900">{results[comp].stdDev.toFixed(4)}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <Card className="bg-blue-50 border-blue-200 shadow-sm">
                                                            <CardContent className="p-4">
                                                                <p className="text-xs font-semibold text-blue-600 uppercase">LOD</p>
                                                                <p className="text-2xl font-bold text-blue-900 mt-1">{results[comp].lod.toFixed(4)}</p>
                                                                <p className="text-[10px] text-blue-400 mt-1">Tespit Limiti</p>
                                                            </CardContent>
                                                        </Card>
                                                        <Card className="bg-emerald-50 border-emerald-200 shadow-sm">
                                                            <CardContent className="p-4">
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
                </CardContent>
            </Card>
        </div>
    );
}
