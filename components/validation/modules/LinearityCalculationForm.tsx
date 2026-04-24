"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Plus, Trash2, Save, Activity } from "lucide-react";
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
}

interface LinearityFormProps {
    components: string[];
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

export function LinearityCalculationForm({ components = ["Genel"], onReportDataChange }: LinearityFormProps) {
    const [activeComponent, setActiveComponent] = useState(components[0]);
    const [replicates, setReplicates] = useState(3); // Default n=3

    // Global options per component
    const [settings, setSettings] = useState<Record<string, { unit: string; notes: string }>>({});

    // Data state: { [component]: LinearityPoint[] }
    const [allData, setAllData] = useState<Record<string, LinearityPoint[]>>({});

    // Results state: { [component]: RegressionResult }
    const [results, setResults] = useState<Record<string, RegressionResult>>({});

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

    const getSettings = (comp: string) => {
        return settings[comp] || { unit: "mg_L", notes: "" };
    };

    const updateSettings = (comp: string, field: 'unit' | 'notes', value: string) => {
        setSettings({
            ...settings,
            [comp]: { ...getSettings(comp), [field]: value }
        });
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
                points: chartData
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
                range: `${minX} - ${maxX} ${getSettings(comp).unit.split('_')[0]}`,
                unit: getSettings(comp).unit,
                notes: getSettings(comp).notes
            }
        };
        onReportDataChange(reportPayload);
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-blue-600" />
                            Doğrusallık (Kalibrasyon) Çalışması
                        </CardTitle>
                        <CardDescription>
                            Konsantrasyon ve cihaz yanıtlarını girerek kalibrasyon eğrisini oluşturun.
                        </CardDescription>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
                    <div className="flex items-center gap-2">
                        <Label htmlFor="replicates" className="text-sm font-medium whitespace-nowrap">Tekrar Sayısı (n):</Label>
                        <Select value={replicates.toString()} onValueChange={handleReplicateChange}>
                            <SelectTrigger id="replicates" className="w-[80px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">1</SelectItem>
                                <SelectItem value="2">2</SelectItem>
                                <SelectItem value="3">3</SelectItem>
                                <SelectItem value="5">5</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Tabs value={activeComponent} onValueChange={setActiveComponent}>
                    <TabsList className="mb-4 flex flex-wrap h-auto justify-start bg-slate-100 p-1">
                        {components.map(comp => (
                            <TabsTrigger key={comp} value={comp} className="min-w-[100px]">
                                {comp}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {components.map(comp => {
                        const currentData = getComponentData(comp);
                        const result = results[comp];
                        const setting = getSettings(comp);

                        return (
                            <TabsContent key={comp} value={comp} className="space-y-6">

                                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded border">
                                    <Label className="text-sm font-medium">Birim:</Label>
                                    <Select value={setting.unit} onValueChange={(v: string) => updateSettings(comp, 'unit', v)}>
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

                                <div className="grid lg:grid-cols-5 gap-8">

                                    {/* Input Section (3 cols wide) */}
                                    <div className="lg:col-span-3 space-y-4">
                                        <div className="border rounded-md overflow-x-auto">
                                            <Table>
                                                <TableHeader className="bg-slate-50">
                                                    <TableRow>
                                                        <TableHead className="w-[60px] text-center">Seviye</TableHead>
                                                        <TableHead className="min-w-[120px]">Konsantrasyon</TableHead>
                                                        <TableHead className="min-w-[120px]">Yanıt</TableHead>
                                                        <TableHead className="w-[50px]"></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {currentData.map((row, idx) => (
                                                        // Render multiple rows per Level based on replicates
                                                        Array.from({ length: replicates }).map((_, rIdx) => (
                                                            <TableRow key={`${row.id}-${rIdx}`} className={rIdx % 2 === 0 ? "bg-white" : "bg-white"}>
                                                                {/* Level Cell: Render only on first replicate, simple centered text */}
                                                                {rIdx === 0 ? (
                                                                    <TableCell rowSpan={replicates} className="font-medium text-slate-500 text-xs text-center border-r bg-slate-50 align-middle">
                                                                        {row.level}
                                                                    </TableCell>
                                                                ) : null}

                                                                <TableCell className="p-2">
                                                                    <Input
                                                                        className="h-8"
                                                                        placeholder="Conc."
                                                                        value={row.concentrations[rIdx] || ''}
                                                                        onChange={(e) => handleDataChange(comp, idx, 'concentration', e.target.value, rIdx)}
                                                                        onPaste={(e) => handlePaste(e, comp, idx, rIdx, 'concentration')}
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="p-2">
                                                                    <Input
                                                                        className="h-8"
                                                                        placeholder={`R${rIdx + 1}`}
                                                                        value={row.responses[rIdx] || ''}
                                                                        onChange={(e) => handleDataChange(comp, idx, 'response', e.target.value, rIdx)}
                                                                        onPaste={(e) => handlePaste(e, comp, idx, rIdx, 'response')}
                                                                    />
                                                                </TableCell>

                                                                {/* Remove Button: Only on first replicate */}
                                                                {rIdx === 0 ? (
                                                                    <TableCell rowSpan={replicates} className="align-middle text-center p-1">
                                                                        <Button variant="ghost" size="icon" onClick={() => removeRow(comp, idx)} className="h-8 w-8 text-slate-400 hover:text-red-500">
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

                                        <div className="flex justify-between">
                                            <Button variant="outline" size="sm" onClick={() => addRow(comp)} className="text-blue-600 border-blue-200 hover:bg-blue-50">
                                                <Plus className="h-4 w-4 mr-1" /> Seviye Ekle
                                            </Button>
                                        </div>

                                        <div className="space-y-2 mt-4">
                                            <Label htmlFor="notes">Notlar / Açıklamalar</Label>
                                            <Textarea
                                                id="notes"
                                                placeholder="Bu çalışma ile ilgili notlar..."
                                                className="h-20"
                                                value={setting.notes}
                                                onChange={(e) => updateSettings(comp, 'notes', e.target.value)}
                                            />
                                        </div>

                                        <div className="flex gap-2 pt-4">
                                            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => calculateRegression(comp)}>
                                                <Calculator className="h-4 w-4 mr-2" /> Hesapla
                                            </Button>
                                            <Button
                                                className="flex-1 bg-green-600 hover:bg-green-700"
                                                disabled={!result}
                                                onClick={() => {
                                                    const dataToSave = {
                                                        component: comp,
                                                        unit: setting.unit,
                                                        notes: setting.notes,
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

                                    <div className="lg:col-span-2 bg-slate-50 border rounded-lg p-4 flex flex-col h-fit sticky top-4">
                                        {result ? (
                                            <>
                                                <div className="mb-6 space-y-3">
                                                    <div className="bg-white p-3 rounded border shadow-sm flex items-center justify-between">
                                                        <p className="text-xs text-slate-500 uppercase font-semibold">R² (Determinasyon)</p>
                                                        <p className={`text-xl font-bold ${result.rSquared > 0.99 ? 'text-green-600' : 'text-amber-600'}`}>
                                                            {result.rSquared.toFixed(4)}
                                                        </p>
                                                    </div>
                                                    <div className="bg-white p-3 rounded border shadow-sm">
                                                        <p className="text-xs text-slate-500 uppercase font-semibold text-center mb-1">Denklem</p>
                                                        <p className="text-sm font-mono text-center text-slate-800 break-all font-medium bg-slate-100 p-1 rounded">
                                                            {result.equation}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex-1 min-h-[300px] w-full bg-white rounded border p-2">
                                                    <ResponsiveContainer width="100%" height={300}>
                                                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis
                                                                type="number"
                                                                dataKey="x"
                                                                name="Kons."
                                                                unit={` ${(setting?.unit || "mg_L").split('_')[0]}`}
                                                                tick={{ fontSize: 12 }}
                                                            />
                                                            <YAxis type="number" dataKey="y" name="Yanıt" tick={{ fontSize: 12 }} />
                                                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                                            <Legend verticalAlign="top" height={36} />
                                                            <Scatter name="Ölçüm" data={result.points.filter(p => p.type === 'measure')} fill="#2563eb" />
                                                            <Scatter name="Eğri" data={result.points.filter(p => p.type === 'predicted')} line={{ stroke: '#16a34a', strokeWidth: 2 }} shape={() => <></>} legendType="line" />
                                                        </ScatterChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="h-[300px] flex flex-col items-center justify-center text-slate-400">
                                                <Activity className="h-16 w-16 mb-4 opacity-20" />
                                                <p className="text-center">Kalibrasyon eğrisini <br /> görmek için hesaplayın.</p>
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
    );
}
