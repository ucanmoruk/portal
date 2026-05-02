"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LodCalculationForm } from "@/components/validation/modules/LodCalculationForm";
import { LinearityCalculationForm } from "@/components/validation/modules/LinearityCalculationForm";
import { PrecisionRepeatabilityForm } from "@/components/validation/modules/PrecisionRepeatabilityForm";
import { PrecisionReproducibilityForm } from "@/components/validation/modules/PrecisionReproducibilityForm";
import { TruenessStudyForm } from "@/components/validation/modules/TruenessStudyForm";
import { ValidationReport, ReportData } from "@/components/validation/report/ValidationReport";
import { sortValidationParameters } from "@/types/validation";
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
        parameters?: Array<{ id: string; name: string; isEnabled: boolean; note?: string }>;
        devices?: Array<{ id: string; name: string; serialNo: string }>;
        personnel?: Array<{ id: string; name: string; role: string }>;
        components?: Array<{ id: string; name: string; casNo: string }>;
    };
}

type ParameterTab = {
    value: string;
    label: string;
    parameterIds: string[];
};

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

const normalizeParamId = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_");

const parameterTabLabel = (parameter: { id: string; name: string }) => {
    if (parameter.id === "accuracy") return "Doğruluk";
    if (parameter.id === "precision_repeatability") return "Tekrarlanabilirlik";
    if (parameter.id === "precision_reproducibility") return "Tekrarüretilebilirlik";
    if (parameter.id === "selectivity") return "Seçicilik";
    if (parameter.id === "trueness") return "Gerçeklik";
    if (parameter.id === "robustness") return "Sağlamlık";
    return parameter.name;
};

const buildParameterTabs = (parameters: Array<{ id: string; name: string; isEnabled: boolean }>): ParameterTab[] => {
    const enabled = sortValidationParameters(parameters.filter(parameter => parameter.isEnabled));
    const tabs: ParameterTab[] = [];
    const used = new Set<string>();

    const selectivity = enabled.find(parameter => parameter.id === "selectivity");
    if (selectivity) {
        tabs.push({ value: "selectivity", label: "Seçicilik", parameterIds: ["selectivity"] });
        used.add("selectivity");
    }

    const linearity = enabled.find(parameter => parameter.id === "linearity");
    if (linearity) {
        tabs.push({ value: "linearity", label: "Doğrusallık", parameterIds: ["linearity"] });
        used.add("linearity");
    }

    const lodLoqIds = enabled
        .filter(parameter => parameter.id === "lod" || parameter.id === "loq")
        .map(parameter => parameter.id);
    if (lodLoqIds.length > 0) {
        tabs.push({ value: "lod_loq", label: "LOD / LOQ", parameterIds: lodLoqIds });
        lodLoqIds.forEach(parameterId => used.add(parameterId));
    }

    for (const parameter of enabled) {
        if (used.has(parameter.id)) continue;
        tabs.push({
            value: normalizeParamId(parameter.id || parameter.name),
            label: parameterTabLabel(parameter),
            parameterIds: [parameter.id],
        });
    }

    return tabs;
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

    const persistModuleData = async (payload: any) => {
        if (!validation) return;

        const currentConfig = validation.config || {};
        const moduleData = {
            ...((currentConfig as any).moduleData || {}),
            [payload.type]: {
                ...(((currentConfig as any).moduleData || {})[payload.type] || {}),
                [payload.component]: payload.data,
            },
        };
        const nextConfig = { ...currentConfig, moduleData };

        setValidation(current => current ? { ...current, config: nextConfig } : current);

        const res = await fetch(`/api/eurolab/validations/${validation.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ config: nextConfig }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(json.error || "Validasyon verileri kaydedilemedi.");
        }
    };

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

        persistModuleData(payload).catch((error: any) => {
            alert(error.message || "Validasyon verileri kaydedilemedi.");
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

    const enabledParameters = sortValidationParameters((validation.config?.parameters || []).filter(parameter => parameter.isEnabled));
    const parameterTabs = buildParameterTabs(validation.config?.parameters || []);
    const defaultTab = "protocol";
    const parameterById = new Map((validation.config?.parameters || []).map(parameter => [parameter.id, parameter]));
    const moduleData = (validation.config as any)?.moduleData || {};

    const renderParameterPanel = (tab: ParameterTab) => {
        if (tab.value === "linearity") {
            return (
                <div className={detailStyles.modulePanel}>
                    <LinearityCalculationForm
                        components={components}
                        initialData={moduleData.LINEARITY || {}}
                        onReportDataChange={handleReportDataUpdate}
                    />
                </div>
            );
        }

        if (tab.value === "lod_loq") {
            return (
                <div className={detailStyles.modulePanel}>
                    <LodCalculationForm
                        components={components}
                        personnel={personnel}
                        initialData={moduleData.LOD_LOQ || {}}
                        onReportDataChange={handleReportDataUpdate}
                    />
                </div>
            );
        }

        if (tab.value === "precision_repeatability") {
            return (
                <div className={detailStyles.modulePanel}>
                    <PrecisionRepeatabilityForm
                        components={components}
                        personnel={personnel}
                        initialData={moduleData.PRECISION_REPEATABILITY || {}}
                        onReportDataChange={handleReportDataUpdate}
                    />
                </div>
            );
        }

        if (tab.value === "precision_reproducibility") {
            return (
                <div className={detailStyles.modulePanel}>
                    <PrecisionReproducibilityForm
                        components={components}
                        personnel={personnel}
                        initialData={moduleData.PRECISION_REPRODUCIBILITY || {}}
                        onReportDataChange={handleReportDataUpdate}
                    />
                </div>
            );
        }

        if (tab.value === "trueness") {
            return (
                <div className={detailStyles.modulePanel}>
                    <TruenessStudyForm
                        components={components}
                        personnel={personnel}
                        initialData={moduleData.TRUENESS || {}}
                        onReportDataChange={handleReportDataUpdate}
                    />
                </div>
            );
        }

        const tabParameters = tab.parameterIds
            .map(parameterId => parameterById.get(parameterId))
            .filter(Boolean) as Array<{ id: string; name: string; note?: string }>;

        return (
            <div className={detailStyles.parameterPanel}>
                <div className={detailStyles.parameterPanelHeader}>
                    <span className={detailStyles.parameterPanelTitle}>{tab.label}</span>
                    <span className={detailStyles.parameterPanelMeta}>Validasyon çalışma alanı</span>
                </div>
                <div className={detailStyles.parameterPanelBody}>
                    {tabParameters.map(parameter => (
                        <div key={parameter.id} className={detailStyles.parameterNoteCard}>
                            <strong>{parameter.name}</strong>
                            <p>{parameter.note || "Bu parametre için protokolde tanımlanan çalışma notları ve sonuç girişleri burada takip edilecek."}</p>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

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

            <Tabs defaultValue={defaultTab} className={`${detailStyles.workspace} print:space-y-0`}>
                <TabsList className={`${detailStyles.tabsBar} no-print`}>
                    <TabsTrigger value="protocol" className={detailStyles.tabTrigger}>Protokol</TabsTrigger>
                    {parameterTabs.map(tab => (
                        <TabsTrigger key={tab.value} value={tab.value} className={detailStyles.tabTrigger}>
                            {tab.label}
                        </TabsTrigger>
                    ))}
                    <TabsTrigger value="report" className={detailStyles.tabTrigger}>
                        <FileText className="h-4 w-4 mr-2" /> Rapor Önizleme
                    </TabsTrigger>
                </TabsList>

                {parameterTabs.map(tab => (
                    <TabsContent key={tab.value} value={tab.value} className={detailStyles.tabContent}>
                        {renderParameterPanel(tab)}
                    </TabsContent>
                ))}

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

                <TabsContent value="report" className={`${detailStyles.tabContent} print:block`}>
                    <ValidationReport data={reportData} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
