"use client";

import { useState, use } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LodCalculationForm } from "@/components/validation/modules/LodCalculationForm";
import { LinearityCalculationForm } from "@/components/validation/modules/LinearityCalculationForm";
import { ValidationReport, ReportData } from "@/components/validation/report/ValidationReport";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Beaker, FileText, Activity } from "lucide-react";
import styles from '@/app/styles/table.module.css';

export default function ValidationDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);

    // Mock data for the validation study (normally fetched by ID)
    const validationStudy = {
        id: id,
        title: "HPLC ile Kahvede Kafein Tayini",
        method: "HPLC-UV",
        type: "FULL_VALIDATION",
        status: "IN_PROGRESS",
        modules: ["lod", "linearity", "precision", "trueness"]
    };

    // Central State for Report Data
    const [reportData, setReportData] = useState<ReportData>({
        meta: {
            title: validationStudy.title,
            id: validationStudy.id,
            method: validationStudy.method,
            date: new Date().toLocaleDateString('tr-TR'),
            analyst: "Analist"
        },
        lodData: { components: [] },
        linearityData: { components: [] }
    });

    const handleReportDataUpdate = (payload: any) => {
        setReportData(prev => {
            const newData = { ...prev };

            if (payload.type === 'LOD_LOQ') {
                const compIndex = newData.lodData?.components.findIndex(c => c.name === payload.component);
                const newCompData = {
                    name: payload.component,
                    lod: payload.data.lod,
                    loq: payload.data.loq,
                    unit: payload.data.unit,
                    mean: payload.data.mean,
                    stdDev: payload.data.stdDev
                };

                if (compIndex !== undefined && compIndex >= 0) {
                    if (newData.lodData) newData.lodData.components[compIndex] = newCompData;
                } else {
                    if (!newData.lodData) newData.lodData = { components: [] };
                    newData.lodData.components.push(newCompData);
                }
                if (payload.data.notes) {
                    if (!newData.lodData) newData.lodData = { components: [], notes: "" };
                    newData.lodData.notes = payload.data.notes;
                }
            } else if (payload.type === 'LINEARITY') {
                const compIndex = newData.linearityData?.components.findIndex(c => c.name === payload.component);
                const newCompData = {
                    name: payload.component,
                    slope: payload.data.slope,
                    intercept: payload.data.intercept,
                    rSquared: payload.data.rSquared,
                    equation: payload.data.equation,
                    range: payload.data.range
                };

                if (compIndex !== undefined && compIndex >= 0) {
                    if (newData.linearityData) newData.linearityData.components[compIndex] = newCompData;
                } else {
                    if (!newData.linearityData) newData.linearityData = { components: [] };
                    newData.linearityData.components.push(newCompData);
                }
                if (payload.data.notes) {
                    if (!newData.linearityData) newData.linearityData = { components: [], notes: "" };
                    newData.linearityData.notes = payload.data.notes;
                }
            }

            return newData;
        });
    };

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={`${styles.pageHeader} no-print`}>
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-slate-500 border-slate-300">
                            {validationStudy.id}
                        </Badge>
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                            Devam Ediyor
                        </Badge>
                    </div>
                    <h1 className={styles.pageTitle}>{validationStudy.title}</h1>
                    <p className={styles.pageSubtitle}>Tam Validasyon çalışması veri girişi ve analizi</p>
                </div>
            </div>

            {/* Main Content - Tabs for Modules */}
            <Tabs defaultValue="lod" className="space-y-6 print:space-y-0">
                <TabsList className="bg-white border p-1 h-auto flex flex-wrap justify-start gap-2 w-full no-print">
                    <TabsTrigger value="lod" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-blue-200 border border-transparent">
                        LOD / LOQ
                    </TabsTrigger>
                    <TabsTrigger value="linearity" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 border border-transparent">
                        Doğrusallık
                    </TabsTrigger>
                    <TabsTrigger value="report" className="ml-auto data-[state=active]:bg-slate-100">
                        <FileText className="h-4 w-4 mr-2" /> Rapor Önizleme
                    </TabsTrigger>
                </TabsList>

                {/* Modules Content */}
                <TabsContent value="lod" className="space-y-6">
                    <LodCalculationForm
                        components={["Kafein", "Teobromin", "Teofilin", "Paraksantin"]}
                        personnel={["Ahmet Yılmaz", "Ayşe Demir"]}
                        onReportDataChange={handleReportDataUpdate}
                    />
                </TabsContent>

                <TabsContent value="linearity">
                    <LinearityCalculationForm
                        components={["Kafein", "Teobromin", "Teofilin", "Paraksantin"]}
                        onReportDataChange={handleReportDataUpdate}
                    />
                </TabsContent>

                <TabsContent value="report" className="print:block">
                    <ValidationReport data={reportData} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
