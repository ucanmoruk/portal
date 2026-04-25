"use client";

import { useState, useEffect, use } from "react";
import styles from '@/app/styles/table.module.css';
import Link from "next/link";
import { Save, Download, ChevronLeft, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import RichTextEditor from "@/components/RichTextEditor";

interface InstructionData {
    "1.0": string; "2.0": string; "3.0": string; "3.1": string; "3.2": string; 
    "3.3": string; "3.4": string; "3.5": string; "4.0": string; "5.0": string; 
    "6.0": string; "7.0": string; "8.0": string; "9.0": string;
}

const defaultInstruction: InstructionData = {
    "1.0": "", "2.0": "", "3.0": "", "3.1": "", "3.2": "", "3.3": "", "3.4": "", "3.5": "",
    "4.0": "", "5.0": "", "6.0": "", "7.0": "", "8.0": "", "9.0": ""
};

const sections = [
    { id: "1.0", title: "1.0 Amaç ve Kapsam", level: 1 },
    { id: "2.0", title: "2.0 Prensip", level: 1 },
    { id: "3.0", title: "3.0 Uygulama Yöntemleri", level: 1 },
    { id: "3.1", title: "3.1 Cihaz ve Ekipmanlar", level: 2 },
    { id: "3.2", title: "3.2 Kimyasallar", level: 2 },
    { id: "3.3", title: "3.3 Çözelti Hazırlama", level: 2 },
    { id: "3.4", title: "3.4 Cihaz Parametreleri", level: 2 },
    { id: "3.5", title: "3.5 Numune Hazırlama", level: 2 },
    { id: "4.0", title: "4.0 Hesaplama", level: 1 },
    { id: "5.0", title: "5.0 Kalite Kontrol", level: 1 },
    { id: "6.0", title: "6.0 Verilerin Analizi", level: 1 },
    { id: "7.0", title: "7.0 Raporlandırma", level: 1 },
    { id: "8.0", title: "8.0 Dokümanlar ve Ekler", level: 1 },
    { id: "9.0", title: "9.0 Revizyon", level: 1 }
];

const instructionTabs = [
    { id: "general", label: "Genel Bilgiler", sectionIds: ["1.0", "2.0"] },
    { id: "application", label: "Uygulama", sectionIds: ["3.0", "3.1", "3.2", "3.3", "3.4", "3.5"] },
    { id: "calculation", label: "Hesaplama", sectionIds: ["4.0"] },
    { id: "quality", label: "Kalite Kontrol", sectionIds: ["5.0", "6.0", "7.0"] },
    { id: "source", label: "Kaynak ve Revizyon", sectionIds: ["8.0", "9.0"] },
];

export default function AnalysisInstructionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [method, setMethod] = useState<any>(null);
    const [instruction, setInstruction] = useState<InstructionData>(defaultInstruction);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(instructionTabs[0].id);
    const [expandedSections, setExpandedSections] = useState<string[]>(instructionTabs[0].sectionIds); 

    useEffect(() => {
        const loadData = async () => {
            try {
                const res = await fetch(`/api/eurolab/methods/${id}`);
                if (!res.ok) throw new Error("Veri alınamadı");
                const data = await res.json();
                setMethod(data);
                if (data.instruction) {
                    setInstruction({ ...defaultInstruction, ...data.instruction });
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/eurolab/methods/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instruction })
            });
            if (!res.ok) throw new Error("Kaydedilemedi");
            alert("Talimat başarıyla kaydedildi.");
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    const downloadWord = async () => {
        try {
            const res = await fetch(`/api/eurolab/methods/${id}/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction, method })
            });
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Word belgesi oluşturulamadı.");
            }
            
            const blob = await res.blob();
            // Dosya ismini temizle (Türkçe karakter ve özel karakter sorunu için)
            const safeFileName = (method?.method_code || 'Talimat').replace(/[^a-z0-9]/gi, '_');
            
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `${safeFileName}_Talimat.docx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            console.error(error);
            alert("İndirme sırasında bir hata oluştu: " + error.message);
        }
    };

    const toggleSection = (sectionId: string) => {
        setExpandedSections(prev => 
            prev.includes(sectionId) 
            ? prev.filter(s => s !== sectionId) 
            : [...prev, sectionId]
        );
    };

    const handleInstructionChange = (sectionId: string, content: string) => {
        setInstruction(prev => ({ ...prev, [sectionId]: content }));
    };

    const handleTabChange = (tabId: string) => {
        const tab = instructionTabs.find(item => item.id === tabId);
        if (!tab) return;
        setActiveTab(tabId);
        setExpandedSections(tab.sectionIds);
    };

    const hasContent = (sectionId: string) => {
        const val = (instruction as any)[sectionId];
        return val && val.replace(/<[^>]*>/g, '').trim().length > 0;
    };

    if (loading) return <div className={styles.empty}>Yükleniyor...</div>;

    const activeInstructionTab = instructionTabs.find(tab => tab.id === activeTab) || instructionTabs[0];
    const visibleSections = sections.filter(section => activeInstructionTab.sectionIds.includes(section.id));

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link href="/laboratuvar/eurolab/metotlar" className="text-slate-400 hover:text-blue-600 transition-colors">
                            <ChevronLeft className="h-5 w-5" />
                        </Link>
                        <span className="text-[10px] font-bold text-blue-600 px-2 py-0.5 bg-blue-50 rounded-full border border-blue-100 uppercase">
                            {method?.method_code}
                        </span>
                    </div>
                    <h1 className={styles.pageTitle}>{method?.name}</h1>
                    <p className={styles.pageSubtitle}>Analiz talimatı aşamalarını aşağıdan açıp düzenleyebilirsiniz.</p>
                </div>
                <div className={styles.toolbarRight}>
                    <button onClick={downloadWord} className={styles.cancelBtn} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Download className="h-4 w-4" /> Word İndir
                    </button>
                    <button onClick={handleSave} disabled={saving} className={styles.addBtn}>
                        <Save className="h-4 w-4" />
                        {saving ? "Kaydediliyor..." : "Tümünü Kaydet"}
                    </button>
                </div>
            </div>

            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    maxWidth: 980,
                    marginTop: 4,
                    padding: 6,
                    border: "1px solid var(--color-border-light)",
                    borderRadius: "var(--radius-full)",
                    background: "var(--color-surface)",
                    boxShadow: "var(--shadow-sm)",
                }}
            >
                {instructionTabs.map(tab => {
                    const selected = tab.id === activeTab;
                    const completedCount = tab.sectionIds.filter(sectionId => hasContent(sectionId)).length;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => handleTabChange(tab.id)}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 7,
                                minHeight: 34,
                                padding: "0 14px",
                                border: selected ? "1px solid var(--color-accent)" : "1px solid transparent",
                                borderRadius: "var(--radius-full)",
                                background: selected ? "var(--color-accent)" : "transparent",
                                color: selected ? "#fff" : "var(--color-text-secondary)",
                                fontSize: "0.82rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                transition: "var(--transition-fast)",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {tab.label}
                            {completedCount > 0 && (
                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        minWidth: 20,
                                        height: 20,
                                        padding: "0 6px",
                                        borderRadius: 999,
                                        background: selected ? "rgba(255,255,255,0.2)" : "var(--color-accent-light)",
                                        color: selected ? "#fff" : "var(--color-accent)",
                                        fontSize: "0.72rem",
                                    }}
                                >
                                    {completedCount}/{tab.sectionIds.length}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-col gap-4 mt-2 max-w-5xl">
                {visibleSections.map((s) => {
                    const isExpanded = expandedSections.includes(s.id);
                    const filled = hasContent(s.id);
                    const isSub = s.level === 2;

                    return (
                        <div key={s.id} className={styles.tableCard}>
                            <button 
                                onClick={() => toggleSection(s.id)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '16px 20px',
                                    background: isExpanded ? 'var(--color-surface-2)' : 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    paddingLeft: isSub ? '40px' : '20px'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {isExpanded ? (
                                        <ChevronDown className="h-5 w-5 text-slate-400" />
                                    ) : (
                                        <ChevronRight className="h-5 w-5 text-slate-400" />
                                    )}
                                    <span style={{ 
                                        fontSize: isSub ? '0.9rem' : '1rem', 
                                        fontWeight: isExpanded ? '600' : '500',
                                        color: 'var(--color-text-primary)'
                                    }}>
                                        {s.title}
                                    </span>
                                    {filled && !isExpanded && (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" style={{ marginLeft: '8px' }} />
                                    )}
                                </div>
                            </button>

                            {isExpanded && (
                                <div style={{ borderTop: '1px solid var(--color-border-light)' }}>
                                    <RichTextEditor 
                                        content={(instruction as any)[s.id]} 
                                        onChange={(content) => handleInstructionChange(s.id, content)} 
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
