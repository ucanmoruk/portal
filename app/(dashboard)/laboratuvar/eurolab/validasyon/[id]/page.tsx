"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LodCalculationForm } from "@/components/validation/modules/LodCalculationForm";
import { LinearityCalculationForm } from "@/components/validation/modules/LinearityCalculationForm";
import { ValidationReport, ReportData } from "@/components/validation/report/ValidationReport";
import { FileText, Printer } from "lucide-react";
import styles from "@/app/styles/table.module.css";
import detailStyles from "./page.module.css";

interface ValidationDetail {
    id: number;
    code: string;
    title: string;
    method_code: string;
    method_name: string;
    technique: string;
    matrix?: string;
    personnel?: string[] | string;
    study_type: string;
    status: string;
    planned_start_date: string | null;
    planned_end_date: string | null;
    study_date: string | null;
    config?: {
        description?: string;
        parameters?: Array<{ id: string; name: string; isEnabled: boolean }>;
        devices?: Array<{ id: string; name: string; serialNo: string }>;
        personnel?: Array<{ id: string; name: string; role: string }>;
        components?: Array<{ id: string; name: string; casNo: string }>;
    };
}

const typeLabel = (type: string) => {
    if (type === "VERIFICATION") return "Verifikasyon";
    if (type === "REVISION") return "Revizyon";
    return "Tam Validasyon";
};

const statusLabel = (status: string) => {
    if (status === "COMPLETED") return "Tamamlandı";
    if (status === "APPROVED") return "Onaylandı";
    if (status === "CANCELLED") return "İptal";
    return "Devam Ediyor";
};

const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("tr-TR");
};

export default function ValidationDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [validation, setValidation] = useState<ValidationDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const components = useMemo(() => {
        const configured = validation?.config?.components?.map(component => component.name).filter(Boolean) || [];
        return configured.length > 0 ? configured : ["Kafein"];
    }, [validation]);

    const personnel = useMemo(() => {
        const configured = validation?.config?.personnel?.map(person => person.name).filter(Boolean) || [];
        if (configured.length > 0) return configured;
        if (Array.isArray(validation?.personnel)) return validation.personnel;
        return ["Analist"];
    }, [validation]);

    const [reportData, setReportData] = useState<ReportData>({
        meta: {
            title: "",
            id: "",
            method: "",
            date: new Date().toLocaleDateString("tr-TR"),
            analyst: "Analist",
        },
        lodData: { components: [] },
        linearityData: { components: [] },
    });

    useEffect(() => {
        let alive = true;

        async function loadValidation() {
            setLoading(true);
            setError("");
            try {
                const res = await fetch(`/api/eurolab/validations/${id}`, { credentials: "same-origin" });
                const contentType = res.headers.get("content-type") || "";
                if (!contentType.includes("application/json")) {
                    throw new Error("Validasyon detayı için oturum veya bağlantı yanıtı alınamadı.");
                }
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Validasyon detayı alınamadı.");
                if (!alive) return;
                setValidation(json);
                setReportData(prev => ({
                    ...prev,
                    meta: {
                        title: json.title || json.method_name,
                        id: json.code || String(json.id),
                        method: json.technique || json.method_code || "",
                        date: new Date().toLocaleDateString("tr-TR"),
                        analyst: "Analist",
                    },
                }));
            } catch (err: any) {
                if (alive) setError(err.message);
            } finally {
                if (alive) setLoading(false);
            }
        }

        loadValidation();
        return () => {
            alive = false;
        };
    }, [id]);

    const handleReportDataUpdate = (payload: any) => {
        setReportData(prev => {
            const newData = { ...prev };

            if (payload.type === "LOD_LOQ") {
                const compIndex = newData.lodData?.components.findIndex(c => c.name === payload.component);
                const newCompData = {
                    name: payload.component,
                    lod: payload.data.lod,
                    loq: payload.data.loq,
                    unit: payload.data.unit,
                    mean: payload.data.mean,
                    stdDev: payload.data.stdDev,
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
            } else if (payload.type === "LINEARITY") {
                const compIndex = newData.linearityData?.components.findIndex(c => c.name === payload.component);
                const newCompData = {
                    name: payload.component,
                    slope: payload.data.slope,
                    intercept: payload.data.intercept,
                    rSquared: payload.data.rSquared,
                    equation: payload.data.equation,
                    range: payload.data.range,
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

    if (loading) {
        return (
            <div className={detailStyles.detailPage}>
                <div className={styles.tableCard}>
                    <div style={{ padding: 24 }}><div className={styles.skeleton} /></div>
                </div>
            </div>
        );
    }

    if (error || !validation) {
        return (
            <div className={detailStyles.detailPage}>
                <div className={styles.errorBar}>{error || "Validasyon bulunamadı."}</div>
            </div>
        );
    }

    const enabledParameters = (validation.config?.parameters || []).filter(parameter => parameter.isEnabled);

    return (
        <div className={detailStyles.detailPage}>
            <div className={`${detailStyles.hero} no-print`}>
                <div className={detailStyles.heroMain}>
                    <div className={detailStyles.crumb}>Eurolab Validasyon</div>
                    <div className={detailStyles.badgeRow}>
                        <Badge variant="outline">{validation.code || `VAL-${validation.id}`}</Badge>
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{statusLabel(validation.status)}</Badge>
                    </div>
                    <h1 className={detailStyles.title}>{validation.method_name || validation.title}</h1>
                    <p className={detailStyles.subtitle}>
                        {typeLabel(validation.study_type)} · {validation.technique || validation.method_code || "Metot bilgisi yok"} · {formatDate(validation.planned_start_date)} - {formatDate(validation.planned_end_date)}
                    </p>
                </div>
                <div className={detailStyles.actions}>
                    <Button variant="outline" className={detailStyles.printButton} onClick={() => window.print()}>
                        <Printer size={16} /> Yazdır
                    </Button>
                </div>
            </div>

            <div className={`${detailStyles.infoGrid} no-print`}>
                <div className={detailStyles.infoCard}>
                    <span className={detailStyles.infoLabel}>Kod</span>
                    <span className={detailStyles.infoValue}>{validation.code || `VAL-${validation.id}`}</span>
                </div>
                <div className={detailStyles.infoCard}>
                    <span className={detailStyles.infoLabel}>Metot</span>
                    <span className={detailStyles.infoValue}>{validation.technique || validation.method_code || "—"}</span>
                </div>
                <div className={detailStyles.infoCard}>
                    <span className={detailStyles.infoLabel}>Matriks</span>
                    <span className={detailStyles.infoValue}>{validation.matrix || "—"}</span>
                </div>
                <div className={detailStyles.infoCard}>
                    <span className={detailStyles.infoLabel}>Plan</span>
                    <span className={detailStyles.infoValue}>{formatDate(validation.planned_start_date)} - {formatDate(validation.planned_end_date)}</span>
                </div>
            </div>

            <Tabs defaultValue="protocol" className={`${detailStyles.workspace} print:space-y-0`}>
                <TabsList className={`${detailStyles.tabsBar} no-print`}>
                    <TabsTrigger value="protocol" className={detailStyles.tabTrigger}>Protokol</TabsTrigger>
                    <TabsTrigger value="lod" className={detailStyles.tabTrigger}>LOD / LOQ</TabsTrigger>
                    <TabsTrigger value="linearity" className={detailStyles.tabTrigger}>Doğrusallık</TabsTrigger>
                    <TabsTrigger value="report" className={detailStyles.tabTrigger}>
                        <FileText className="h-4 w-4 mr-2" /> Rapor Önizleme
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="protocol" className={detailStyles.tabContent}>
                    <div className={detailStyles.protocolGrid}>
                        <div className={detailStyles.sectionCard}>
                            <div className={detailStyles.sectionHeader}>
                                <span className={detailStyles.sectionTitle}>Validasyon Parametreleri</span>
                                <Badge variant="outline">{enabledParameters.length} kalem</Badge>
                            </div>
                            <div className={detailStyles.sectionBody}>
                                <div className={detailStyles.miniList}>
                                    {enabledParameters.length > 0 ? enabledParameters.map(parameter => (
                                        <div key={parameter.id} className={detailStyles.miniItem}>
                                            <strong>{parameter.name}</strong>
                                            <Badge variant="outline">Planlandı</Badge>
                                        </div>
                                    )) : (
                                        <div className={detailStyles.muted}>Planlanmış parametre bulunamadı.</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={detailStyles.sectionCard}>
                            <div className={detailStyles.sectionHeader}>
                                <span className={detailStyles.sectionTitle}>Protokol Özeti</span>
                                <Link href={`/laboratuvar/eurolab/validasyon/yeni?edit=${validation.id}`}>
                                    <Button variant="outline" size="sm" className={detailStyles.updateButton}>
                                        Protokolü Güncelle
                                    </Button>
                                </Link>
                            </div>
                            <div className={detailStyles.sectionBody}>
                                <div className={detailStyles.miniList}>
                                    <div className={detailStyles.miniItem}><span>Analiz</span><strong>{validation.method_name}</strong></div>
                                    <div className={detailStyles.miniItem}><span>Tür</span><strong>{typeLabel(validation.study_type)}</strong></div>
                                    <div className={detailStyles.miniItem}><span>Durum</span><strong>{statusLabel(validation.status)}</strong></div>
                                    <div className={detailStyles.miniItem}><span>Oluşturma</span><strong>{formatDate(validation.study_date)}</strong></div>
                                </div>
                                {validation.config?.description && (
                                    <p className={detailStyles.description} style={{ marginTop: 14 }}>
                                        {validation.config.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="lod" className={detailStyles.tabContent}>
                    <div className={detailStyles.modulePanel}>
                        <LodCalculationForm
                            components={components}
                            personnel={personnel}
                            onReportDataChange={handleReportDataUpdate}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="linearity" className={detailStyles.tabContent}>
                    <div className={detailStyles.modulePanel}>
                        <LinearityCalculationForm
                            components={components}
                            onReportDataChange={handleReportDataUpdate}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="report" className={`${detailStyles.tabContent} print:block`}>
                    <ValidationReport data={reportData} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
