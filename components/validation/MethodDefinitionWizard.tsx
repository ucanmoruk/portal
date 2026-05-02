"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Beaker,
    CheckCircle2,
    Layers,
    Monitor,
    Plus,
    Printer,
    Save,
    Trash2,
    UserPlus,
    Users,
} from "lucide-react";
import { DEFAULT_PARAMETERS, MethodType, sortValidationParameters, ValidationParameter } from "@/types/validation";
import styles from "./MethodDefinitionWizard.module.css";

interface Method {
    id: number;
    method_code: string;
    name: string;
    technique: string;
    matrix: string;
    personnel: string[];
}

interface Device {
    id: string;
    code: string;
    name: string;
    serialNo: string;
}

interface Person {
    id: string;
    name: string;
    role: string;
}

interface PersonnelOption {
    id: number;
    name: string;
    role: string;
}

interface Component {
    id: string;
    name: string;
    casNo: string;
    limit: string;
}

const normalizeWizardParameters = (parameters: ValidationParameter[]) => {
    const merged = parameters.reduce<ValidationParameter[]>((acc, parameter) => {
        if (parameter.id === "loq") {
            const lod = acc.find(item => item.id === "lod");
            if (lod) {
                lod.name = "LOD (Tespit Limiti) ve LOQ (Tayini Limiti)";
                lod.isEnabled = lod.isEnabled || parameter.isEnabled;
                lod.requiredFor = Array.from(new Set([...lod.requiredFor, ...parameter.requiredFor]));
                return acc;
            }
            acc.push({ ...parameter, id: "lod", name: "LOD (Tespit Limiti) ve LOQ (Tayini Limiti)" });
            return acc;
        }
        acc.push(parameter.id === "lod" ? { ...parameter, name: "LOD (Tespit Limiti) ve LOQ (Tayini Limiti)" } : parameter);
        return acc;
    }, []);
    return sortValidationParameters(merged);
};

const parametersForType = (type: MethodType) => normalizeWizardParameters(DEFAULT_PARAMETERS.map(param => ({
    ...param,
    isEnabled: type === "FULL_VALIDATION" ? true : param.requiredFor.includes(type),
    note: "",
})));

const escapeHtml = (value: string | number | null | undefined) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const STEPS = [
    { id: 1, title: "Tip", hint: "Metot ve kapsam" },
    { id: 2, title: "Parametre", hint: "Çalışma modülleri" },
    { id: 3, title: "Cihaz", hint: "Ekipman listesi" },
    { id: 4, title: "Yetkili", hint: "Personel bilgisi" },
    { id: 5, title: "Komponent", hint: "Analit listesi" },
    { id: 6, title: "Onay", hint: "Son kontrol" },
];

export function MethodDefinitionWizard({ editId }: { editId?: string }) {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [methods, setMethods] = useState<Method[]>([]);
    const [methodsLoading, setMethodsLoading] = useState(true);
    const [methodsError, setMethodsError] = useState("");
    const [selectedMethodId, setSelectedMethodId] = useState("");
    const [methodType, setMethodType] = useState<MethodType>("FULL_VALIDATION");
    const [parameters, setParameters] = useState<ValidationParameter[]>(() => parametersForType("FULL_VALIDATION"));
    const [description, setDescription] = useState("");
    const [plannedStartDate, setPlannedStartDate] = useState("");
    const [plannedEndDate, setPlannedEndDate] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [loadingValidation, setLoadingValidation] = useState(false);

    const [devices, setDevices] = useState<Device[]>([]);
    const [newDevice, setNewDevice] = useState({ code: "", name: "", serialNo: "" });

    const [personnel, setPersonnel] = useState<Person[]>([]);
    const [newPerson, setNewPerson] = useState({ userId: "", name: "", role: "" });
    const [personnelOptions, setPersonnelOptions] = useState<PersonnelOption[]>([]);
    const [personnelLoading, setPersonnelLoading] = useState(false);
    const [personnelError, setPersonnelError] = useState("");

    const [components, setComponents] = useState<Component[]>([]);
    const [newComponent, setNewComponent] = useState({ name: "", casNo: "", limit: "" });

    const selectedMethod = useMemo(
        () => methods.find(method => String(method.id) === selectedMethodId),
        [methods, selectedMethodId],
    );

    useEffect(() => {
        let alive = true;

        async function loadMethods() {
            setMethodsLoading(true);
            setMethodsError("");
            try {
                const res = await fetch("/api/eurolab/methods", { credentials: "same-origin" });
                const contentType = res.headers.get("content-type") || "";
                if (!contentType.includes("application/json")) {
                    throw new Error("Metot listesi için oturum veya bağlantı yanıtı alınamadı.");
                }
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Metot listesi alınamadı.");
                if (!alive) return;
                setMethods(json);
                if (!selectedMethodId && json.length > 0) {
                    setSelectedMethodId(String(json[0].id));
                }
            } catch (error: any) {
                if (alive) setMethodsError(error.message);
            } finally {
                if (alive) setMethodsLoading(false);
            }
        }

        loadMethods();
        return () => {
            alive = false;
        };
    }, [selectedMethodId]);

    useEffect(() => {
        let alive = true;

        async function loadPersonnel() {
            setPersonnelLoading(true);
            setPersonnelError("");
            try {
                const res = await fetch("/api/eurolab/personnel", { credentials: "same-origin" });
                const contentType = res.headers.get("content-type") || "";
                if (!contentType.includes("application/json")) {
                    throw new Error("Personel listesi için oturum veya bağlantı yanıtı alınamadı.");
                }
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Personel listesi alınamadı.");
                if (alive) setPersonnelOptions(json);
            } catch (error: any) {
                if (alive) setPersonnelError(error.message);
            } finally {
                if (alive) setPersonnelLoading(false);
            }
        }

        loadPersonnel();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!selectedMethod) return;
        if (editId) return;
        setPersonnel(
            (selectedMethod.personnel || []).map((name, index) => ({
                id: `method-person-${index}`,
                name,
                role: "Yetkili",
            })),
        );
    }, [selectedMethod, editId]);

    useEffect(() => {
        if (!editId) return;
        let alive = true;

        async function loadValidation() {
            setLoadingValidation(true);
            setSaveError("");
            try {
                const res = await fetch(`/api/eurolab/validations/${editId}`, { credentials: "same-origin" });
                const contentType = res.headers.get("content-type") || "";
                if (!contentType.includes("application/json")) {
                    throw new Error("Validasyon bilgisi alınamadı.");
                }
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Validasyon bilgisi alınamadı.");
                if (!alive) return;

                setSelectedMethodId(String(json.method_id || ""));
                setMethodType((json.study_type || "FULL_VALIDATION") as MethodType);
                setPlannedStartDate(json.planned_start_date ? String(json.planned_start_date).slice(0, 10) : "");
                setPlannedEndDate(json.planned_end_date ? String(json.planned_end_date).slice(0, 10) : "");
                setDescription(json.config?.description || "");
                setParameters(Array.isArray(json.config?.parameters) ? normalizeWizardParameters(json.config.parameters) : parametersForType((json.study_type || "FULL_VALIDATION") as MethodType));
                setDevices(Array.isArray(json.config?.devices) ? json.config.devices.map((device: any) => ({
                    id: device.id || crypto.randomUUID(),
                    code: device.code || "",
                    name: device.name || "",
                    serialNo: device.serialNo || "",
                })) : []);
                setPersonnel(Array.isArray(json.config?.personnel) ? json.config.personnel.map((person: any) => ({
                    id: person.id || crypto.randomUUID(),
                    name: person.name || "",
                    role: person.role || "",
                })) : []);
                setComponents(Array.isArray(json.config?.components) ? json.config.components.map((component: any) => ({
                    id: component.id || crypto.randomUUID(),
                    name: component.name || "",
                    casNo: component.casNo || "",
                    limit: component.limit || "",
                })) : []);
            } catch (error: any) {
                if (alive) setSaveError(error.message);
            } finally {
                if (alive) setLoadingValidation(false);
            }
        }

        loadValidation();
        return () => {
            alive = false;
        };
    }, [editId]);

    const handleTypeChange = (value: MethodType) => {
        setMethodType(value);
        setParameters(parametersForType(value));
    };

    const toggleParameter = (id: string) => {
        setParameters(parameters.map(p =>
            p.id === id ? { ...p, isEnabled: !p.isEnabled } : p
        ));
    };

    const updateParameterNote = (id: string, note: string) => {
        setParameters(parameters.map(p =>
            p.id === id ? { ...p, note } : p
        ));
    };

    const addDevice = () => {
        if (newDevice.code && newDevice.name && newDevice.serialNo) {
            setDevices([...devices, { ...newDevice, id: crypto.randomUUID() }]);
            setNewDevice({ code: "", name: "", serialNo: "" });
        }
    };

    const removeDevice = (id: string) => setDevices(devices.filter(d => d.id !== id));

    const addPerson = () => {
        if (newPerson.name && newPerson.role) {
            setPersonnel([...personnel, {
                id: crypto.randomUUID(),
                name: newPerson.name,
                role: newPerson.role,
            }]);
            setNewPerson({ userId: "", name: "", role: "" });
        }
    };

    const selectPerson = (userId: string) => {
        const selected = personnelOptions.find(option => String(option.id) === userId);
        setNewPerson({
            userId,
            name: selected?.name || "",
            role: selected?.role || "",
        });
    };

    const removePerson = (id: string) => setPersonnel(personnel.filter(p => p.id !== id));

    const addComponent = () => {
        if (newComponent.name && newComponent.casNo) {
            setComponents([...components, { ...newComponent, id: crypto.randomUUID() }]);
            setNewComponent({ name: "", casNo: "", limit: "" });
        }
    };

    const removeComponent = (id: string) => setComponents(components.filter(c => c.id !== id));

    const nextStep = () => setStep(step + 1);
    const prevStep = () => setStep(step - 1);

    const handlePrint = () => {
        const enabledParameters = parameters.filter(parameter => parameter.isEnabled);
        const printWindow = window.open("", "_blank", "width=980,height=720");
        if (!printWindow) {
            window.print();
            return;
        }

        const row = (cells: Array<string | number | null | undefined>) =>
            `<tr>${cells.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;

        printWindow.document.write(`
            <!doctype html>
            <html lang="tr">
            <head>
                <meta charset="utf-8" />
                <title>${escapeHtml(selectedMethod?.name || "Validasyon Protokolü")}</title>
                <style>
                    body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
                    h1 { font-size: 22px; margin: 0 0 6px; }
                    h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 6px; }
                    .muted { color: #6b7280; font-size: 12px; }
                    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; margin-top: 18px; }
                    .meta div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; }
                    .label { display: block; color: #6b7280; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
                    th, td { border: 1px solid #d1d5db; padding: 7px 8px; text-align: left; vertical-align: top; }
                    th { background: #f3f4f6; }
                    ul { margin: 8px 0 0 18px; padding: 0; }
                    li { margin-bottom: 4px; }
                    @media print { button { display: none; } body { margin: 18mm; } }
                </style>
            </head>
            <body>
                <button onclick="window.print()" style="float:right;padding:8px 14px;">Yazdır</button>
                <h1>Validasyon Protokolü</h1>
                <div class="muted">${escapeHtml(new Date().toLocaleDateString("tr-TR"))}</div>
                <div class="meta">
                    <div><span class="label">Validasyon tipi</span>${escapeHtml(methodTypeLabel)}</div>
                    <div><span class="label">Metot</span>${escapeHtml(selectedMethod?.method_code)} - ${escapeHtml(selectedMethod?.name)}</div>
                    <div><span class="label">Teknik</span>${escapeHtml(selectedMethod?.technique || "-")}</div>
                    <div><span class="label">Matriks</span>${escapeHtml(selectedMethod?.matrix || "-")}</div>
                    <div><span class="label">Planlanan başlangıç</span>${escapeHtml(plannedStartDate || "-")}</div>
                    <div><span class="label">Planlanan bitiş</span>${escapeHtml(plannedEndDate || "-")}</div>
                </div>

                <h2>Açıklama</h2>
                <p>${escapeHtml(description || "Açıklama girilmedi.")}</p>

                <h2>Parametreler</h2>
                ${enabledParameters.length > 0
                    ? `<ul>${enabledParameters.map(parameter => {
                        const note = (parameter as ValidationParameter & { note?: string }).note;
                        return `<li>${escapeHtml(parameter.name)}${note ? `<br><span class="muted">${escapeHtml(note)}</span>` : ""}</li>`;
                    }).join("")}</ul>`
                    : "<p>Parametre seçilmedi.</p>"}

                <h2>Cihazlar</h2>
                <table>
                    <thead><tr><th>Kod</th><th>Cihaz Adı</th><th>Seri No</th></tr></thead>
                    <tbody>${devices.length > 0 ? devices.map(device => row([device.code, device.name, device.serialNo])).join("") : row(["-", "Cihaz eklenmedi", "-"])}</tbody>
                </table>

                <h2>Yetkili Personel</h2>
                <table>
                    <thead><tr><th>Ad Soyad</th><th>Görev / Unvan</th></tr></thead>
                    <tbody>${personnel.length > 0 ? personnel.map(person => row([person.name, person.role])).join("") : row(["Personel seçilmedi", "-"])}</tbody>
                </table>

                <h2>Komponentler</h2>
                <table>
                    <thead><tr><th>Komponent</th><th>CAS No</th><th>Limit</th></tr></thead>
                    <tbody>${components.length > 0 ? components.map(component => row([component.name, component.casNo, component.limit || "-"])).join("") : row(["Bileşen eklenmedi", "-", "-"])}</tbody>
                </table>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
    };

    const handleSave = async () => {
        if (!selectedMethod) {
            setSaveError("Validasyon oluşturmak için metot seçimi zorunludur.");
            return;
        }

        setSaving(true);
        setSaveError("");
        try {
            const res = await fetch(editId ? `/api/eurolab/validations/${editId}` : "/api/eurolab/validations", {
                method: editId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    method_id: selectedMethod.id,
                    study_type: methodType,
                    planned_start_date: plannedStartDate || null,
                    planned_end_date: plannedEndDate || null,
                    config: {
                        description,
                        parameters,
                        devices,
                        personnel,
                        components,
                    },
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || (editId ? "Validasyon güncellenemedi." : "Validasyon oluşturulamadı."));
            router.push(`/laboratuvar/eurolab/validasyon/${json.id ?? editId ?? json.code}`);
        } catch (error: any) {
            setSaveError(error.message);
        } finally {
            setSaving(false);
        }
    };

    const methodTypeLabel =
        methodType === "FULL_VALIDATION" ? "Tam Validasyon"
        : methodType === "VERIFICATION" ? "Verifikasyon"
        : "Revizyon";

    if (loadingValidation) {
        return (
            <div className={styles.panel}>
                <div className={styles.panelBody}>
                    <div className={styles.notice}>Validasyon protokolü yükleniyor...</div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.wizard}>
            <aside className={styles.steps} aria-label="Validasyon adımları">
                {STEPS.map(s => (
                    <div
                        key={s.id}
                        className={`${styles.stepItem} ${step >= s.id ? styles.stepItemActive : ""}`}
                    >
                        <span className={styles.stepNumber}>
                            {step > s.id ? <CheckCircle2 size={16} /> : s.id}
                        </span>
                        <span className={styles.stepText}>
                            <span className={styles.stepTitle}>{s.title}</span>
                            <span className={styles.stepHint}>{s.hint}</span>
                        </span>
                    </div>
                ))}
            </aside>

            <section className={styles.panel}>
                <div className={styles.panelHeader}>
                    <div className={styles.panelTitle}>
                        {step === 1 && "Adım 1: Metot ve validasyon tipini belirleyin"}
                        {step === 2 && "Adım 2: Parametreleri yapılandırın"}
                        {step === 3 && "Adım 3: Cihazları tanımlayın"}
                        {step === 4 && "Adım 4: Yetkili kişileri ekleyin"}
                        {step === 5 && "Adım 5: Bileşenleri ekleyin"}
                        {step === 6 && "Adım 6: İncele ve kaydet"}
                    </div>
                    <div className={styles.panelDescription}>
                        {step === 1 && "Metotlar listesinden bir metot seçin ve planlanan validasyon tarih aralığını belirleyin."}
                        {step === 2 && "Seçilen çalışma için gerekli validasyon parametrelerini açıp kapatın."}
                        {step === 3 && "Kullanılacak cihaz ve ekipmanları listeye ekleyin."}
                        {step === 4 && "Bu çalışmada görev alacak personeli tanımlayın."}
                        {step === 5 && "Analiz edilecek bileşenleri ve CAS numaralarını ekleyin."}
                        {step === 6 && "Çalışmayı başlatmadan önce konfigürasyonu gözden geçirin."}
                    </div>
                </div>

                <div className={styles.panelBody}>
                    {step === 1 && (
                        <div className={styles.section}>
                            <div className={styles.field}>
                                <Label htmlFor="method-select" className={styles.label}>Metot seçimi</Label>
                                <select
                                    id="method-select"
                                    className={styles.input}
                                    value={selectedMethodId}
                                    onChange={event => setSelectedMethodId(event.target.value)}
                                    disabled={methodsLoading}
                                >
                                    {methodsLoading && <option>Metotlar yükleniyor...</option>}
                                    {!methodsLoading && methods.length === 0 && <option value="">Metot bulunamadı</option>}
                                    {methods.map(method => (
                                        <option key={method.id} value={method.id}>
                                            {method.method_code} - {method.name}
                                        </option>
                                    ))}
                                </select>
                                {methodsError && <div className={styles.errorText}>{methodsError}</div>}
                            </div>

                            {selectedMethod && (
                                <div className={styles.methodPreview}>
                                    <div>
                                        <span className={styles.previewLabel}>Kod</span>
                                        <strong>{selectedMethod.method_code}</strong>
                                    </div>
                                    <div>
                                        <span className={styles.previewLabel}>Analiz adı</span>
                                        <strong>{selectedMethod.name}</strong>
                                    </div>
                                    <div>
                                        <span className={styles.previewLabel}>Metot</span>
                                        <strong>{selectedMethod.technique || "—"}</strong>
                                    </div>
                                    <div>
                                        <span className={styles.previewLabel}>Matriks</span>
                                        <strong>{selectedMethod.matrix || "—"}</strong>
                                    </div>
                                </div>
                            )}

                            <div className={styles.dateGrid}>
                                <div className={styles.field}>
                                    <Label htmlFor="planned-start" className={styles.label}>Planlanan başlangıç</Label>
                                    <input id="planned-start" type="date" className={styles.input} value={plannedStartDate} onChange={event => setPlannedStartDate(event.target.value)} />
                                </div>
                                <div className={styles.field}>
                                    <Label htmlFor="planned-end" className={styles.label}>Planlanan bitiş</Label>
                                    <input id="planned-end" type="date" className={styles.input} value={plannedEndDate} onChange={event => setPlannedEndDate(event.target.value)} />
                                </div>
                            </div>

                            <div className={styles.field}>
                                <Label htmlFor="method-desc" className={styles.label}>Açıklama</Label>
                                <textarea
                                    id="method-desc"
                                    className={styles.textarea}
                                    placeholder="Kapsam ve matriks hakkında kısa bilgi..."
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                />
                            </div>

                            <RadioGroup value={methodType} onValueChange={(value) => handleTypeChange(value as MethodType)} className={styles.typeGrid}>
                                <Label htmlFor="full" className={`${styles.typeCard} ${methodType === "FULL_VALIDATION" ? styles.typeCardSelected : ""}`}>
                                    <RadioGroupItem value="FULL_VALIDATION" id="full" className="sr-only" />
                                    <span className={styles.typeIcon}><Beaker size={22} /></span>
                                    <span className={styles.typeCopy}>
                                        <span className={styles.typeName}>Tam Validasyon</span>
                                        <span className={styles.typeDescription}>Yeni veya standart olmayan metotlar için</span>
                                    </span>
                                </Label>

                                <Label htmlFor="ver" className={`${styles.typeCard} ${methodType === "VERIFICATION" ? styles.typeCardSelected : ""}`}>
                                    <RadioGroupItem value="VERIFICATION" id="ver" className="sr-only" />
                                    <span className={styles.typeIcon}><CheckCircle2 size={22} /></span>
                                    <span className={styles.typeCopy}>
                                        <span className={styles.typeName}>Verifikasyon</span>
                                        <span className={styles.typeDescription}>Standart metotların doğrulanması için</span>
                                    </span>
                                </Label>

                                <Label htmlFor="rev" className={`${styles.typeCard} ${methodType === "REVISION" ? styles.typeCardSelected : ""}`}>
                                    <RadioGroupItem value="REVISION" id="rev" className="sr-only" />
                                    <span className={styles.typeIcon}><AlertCircle size={22} /></span>
                                    <span className={styles.typeCopy}>
                                        <span className={styles.typeName}>Revizyon / Değişiklik</span>
                                        <span className={styles.typeDescription}>Değişen koşullar için fark analizi</span>
                                    </span>
                                </Label>
                            </RadioGroup>
                        </div>
                    )}

                    {step === 2 && (
                        <div className={styles.section}>
                            <div className={styles.notice}>
                                Seçiminize göre <strong>{methodTypeLabel}</strong> için önerilen parametreler otomatik işaretlendi.
                            </div>
                            <div className={styles.parameterList}>
                                {parameters.map((param) => (
                                    <div key={param.id} className={styles.parameterItem}>
                                        <div className={styles.parameterContent}>
                                            <div className={styles.parameterName}>{param.name}</div>
                                            <div className={styles.parameterMeta}>
                                                {param.requiredFor.includes(methodType) ? "Önerilen" : "İsteğe bağlı"}
                                            </div>
                                            <textarea
                                                className={styles.parameterNote}
                                                placeholder="Düzey, paralel çalışma sayısı, ürün/matriks, kabul kriteri gibi kısa not..."
                                                value={(param as ValidationParameter & { note?: string }).note || ""}
                                                onChange={(event) => updateParameterNote(param.id, event.target.value)}
                                            />
                                        </div>
                                        <Switch checked={param.isEnabled} onCheckedChange={() => toggleParameter(param.id)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className={styles.section}>
                            <div className={styles.entryBox}>
                                <div className={styles.field}>
                                    <Label className={styles.label}>Kod</Label>
                                    <input className={styles.input} placeholder="Örn: CIH-001" value={newDevice.code} onChange={(event) => setNewDevice({ ...newDevice, code: event.target.value })} />
                                </div>
                                <div className={styles.field}>
                                    <Label className={styles.label}>Cihaz adı</Label>
                                    <input className={styles.input} placeholder="Örn: Agilent 1200 HPLC" value={newDevice.name} onChange={(event) => setNewDevice({ ...newDevice, name: event.target.value })} />
                                </div>
                                <div className={styles.field}>
                                    <Label className={styles.label}>Seri No</Label>
                                    <input className={styles.input} placeholder="Örn: TR-123456" value={newDevice.serialNo} onChange={(event) => setNewDevice({ ...newDevice, serialNo: event.target.value })} />
                                </div>
                                <Button onClick={addDevice} className={styles.primaryButton}><Plus size={16} /> Ekle</Button>
                            </div>

                            <div className={styles.tableShell}>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Kod</TableHead>
                                            <TableHead>Cihaz adı</TableHead>
                                            <TableHead>Seri No</TableHead>
                                            <TableHead className="w-[90px]">İşlem</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {devices.length > 0 ? devices.map(device => (
                                            <TableRow key={device.id}>
                                                <TableCell>{device.code}</TableCell>
                                                <TableCell className="font-medium">{device.name}</TableCell>
                                                <TableCell>{device.serialNo}</TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className={styles.iconButton} onClick={() => removeDevice(device.id)}>
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow><TableCell colSpan={4} className={styles.emptyCell}>Henüz cihaz eklenmedi.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className={styles.section}>
                            <div className={styles.entryBox}>
                                <div className={styles.field}>
                                    <Label className={styles.label}>Yetkili personel</Label>
                                    <select
                                        className={styles.input}
                                        value={newPerson.userId}
                                        onChange={(event) => selectPerson(event.target.value)}
                                        disabled={personnelLoading}
                                    >
                                        <option value="">{personnelLoading ? "Personel listesi yükleniyor..." : "Kullanıcı seçin"}</option>
                                        {personnelOptions.map(person => (
                                            <option key={person.id} value={person.id}>
                                                {person.name}{person.role ? ` (${person.role})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.field}>
                                    <Label className={styles.label}>Görevi / Unvanı</Label>
                                    <input className={styles.input} placeholder="Örn: Analist" value={newPerson.role} onChange={(event) => setNewPerson({ ...newPerson, role: event.target.value })} />
                                </div>
                                <Button onClick={addPerson} className={styles.primaryButton}><UserPlus size={16} /> Ekle</Button>
                            </div>
                            {personnelError && <div className={styles.errorText}>{personnelError}</div>}

                            <div className={styles.tableShell}>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Ad Soyad</TableHead>
                                            <TableHead>Görevi</TableHead>
                                            <TableHead className="w-[90px]">İşlem</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {personnel.length > 0 ? personnel.map(person => (
                                            <TableRow key={person.id}>
                                                <TableCell className="font-medium">{person.name}</TableCell>
                                                <TableCell>{person.role}</TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className={styles.iconButton} onClick={() => removePerson(person.id)}>
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow><TableCell colSpan={3} className={styles.emptyCell}>Henüz personel eklenmedi.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className={styles.section}>
                            <div className={styles.entryBox}>
                                <div className={styles.field}>
                                    <Label className={styles.label}>Komponent adı</Label>
                                    <input className={styles.input} placeholder="Örn: Kafein" value={newComponent.name} onChange={(event) => setNewComponent({ ...newComponent, name: event.target.value })} />
                                </div>
                                <div className={styles.field}>
                                    <Label className={styles.label}>CAS No</Label>
                                    <input className={styles.input} placeholder="Örn: 58-08-2" value={newComponent.casNo} onChange={(event) => setNewComponent({ ...newComponent, casNo: event.target.value })} />
                                </div>
                                <div className={styles.field}>
                                    <Label className={styles.label}>Limit</Label>
                                    <input className={styles.input} placeholder="Örn: 10 mg/kg" value={newComponent.limit} onChange={(event) => setNewComponent({ ...newComponent, limit: event.target.value })} />
                                </div>
                                <Button onClick={addComponent} className={styles.primaryButton}><Plus size={16} /> Ekle</Button>
                            </div>

                            <div className={styles.tableShell}>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Komponent adı</TableHead>
                                            <TableHead>CAS No</TableHead>
                                            <TableHead>Limit</TableHead>
                                            <TableHead className="w-[90px]">İşlem</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {components.length > 0 ? components.map(comp => (
                                            <TableRow key={comp.id}>
                                                <TableCell className="font-medium">{comp.name}</TableCell>
                                                <TableCell>{comp.casNo}</TableCell>
                                                <TableCell>{comp.limit || "—"}</TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className={styles.iconButton} onClick={() => removeComponent(comp.id)}>
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow><TableCell colSpan={4} className={styles.emptyCell}>Henüz bileşen eklenmedi.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {step === 6 && (
                        <div className={styles.section}>
                            <div className={styles.summary}>
                                <div className={styles.summaryTitle}>{selectedMethod?.name || "Metot seçilmedi"}</div>
                                <div className={styles.summaryText}>{description || "Açıklama girilmedi."}</div>
                                <div className={styles.summaryBadges}>
                                    <Badge variant="outline">{methodTypeLabel}</Badge>
                                    <Badge className="bg-blue-600">{parameters.filter(p => p.isEnabled).length} Parametre</Badge>
                                    <Badge className="bg-purple-600">{devices.length} Cihaz</Badge>
                                    <Badge className="bg-amber-600">{personnel.length} Yetkili</Badge>
                                    <Badge className="bg-cyan-600">{components.length} Bileşen</Badge>
                                </div>
                            </div>

                            <div className={styles.summaryGrid}>
                                <div>
                                    <div className={styles.summaryHeading}><CheckCircle2 size={16} /> Seçilen parametreler</div>
                                    <div className={styles.summaryList}>
                                        {parameters.filter(p => p.isEnabled).map(p => (
                                            <div key={p.id} className={styles.summaryLine}>
                                                <strong>{p.name}</strong>
                                                {(p as ValidationParameter & { note?: string }).note && (
                                                    <span className={styles.summaryNote}>{(p as ValidationParameter & { note?: string }).note}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className={styles.section}>
                                    <div>
                                        <div className={styles.summaryHeading}><Monitor size={16} /> Plan ve metot</div>
                                        <div className={styles.summaryList}>
                                            <div className={styles.summaryLine}><strong>{selectedMethod?.method_code}</strong> - {selectedMethod?.technique || "Metot bilgisi yok"}</div>
                                            <div className={styles.summaryLine}>{plannedStartDate || "Başlangıç yok"} / {plannedEndDate || "Bitiş yok"}</div>
                                            {devices.length > 0 ? devices.map(device => (
                                                <div key={device.id} className={styles.summaryLine}><strong>{device.code}</strong> - {device.name} ({device.serialNo})</div>
                                            )) : <div className={styles.summaryLine}>Cihaz seçilmedi.</div>}
                                        </div>
                                    </div>
                                    <div>
                                        <div className={styles.summaryHeading}><Users size={16} /> Yetkili kişiler</div>
                                        <div className={styles.summaryList}>
                                            {personnel.length > 0 ? personnel.map(p => (
                                                <div key={p.id} className={styles.summaryLine}><strong>{p.name}</strong> ({p.role})</div>
                                            )) : <div className={styles.summaryLine}>Personel seçilmedi.</div>}
                                        </div>
                                    </div>
                                    <div>
                                        <div className={styles.summaryHeading}><Layers size={16} /> Bileşenler</div>
                                        <div className={styles.summaryList}>
                                            {components.length > 0 ? components.map(c => (
                                                <div key={c.id} className={styles.summaryLine}><strong>{c.name}</strong> (CAS: {c.casNo}{c.limit ? `, Limit: ${c.limit}` : ""})</div>
                                            )) : <div className={styles.summaryLine}>Bileşen seçilmedi.</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {saveError && <div className={styles.errorText}>{saveError}</div>}
                        </div>
                    )}
                </div>

                <div className={styles.panelFooter}>
                    <Button variant="outline" onClick={prevStep} disabled={step === 1} className={styles.secondaryButton}>
                        <ArrowLeft size={16} /> Geri
                    </Button>

                    {step < 6 ? (
                        <Button onClick={nextStep} disabled={(step === 1 && !selectedMethodId) || methodsLoading} className={styles.primaryButton}>
                            İleri <ArrowRight size={16} />
                        </Button>
                    ) : (
                        <div className={styles.finalActions}>
                            <Button variant="outline" className={styles.secondaryButton} onClick={handlePrint}>
                                <Printer size={16} /> Yazdır
                            </Button>
                            <Button className={styles.successButton} onClick={handleSave} disabled={saving || !selectedMethodId}>
                                <Save size={16} /> {saving ? (editId ? "Güncelleniyor..." : "Oluşturuluyor...") : (editId ? "Validasyon Protokolünü Güncelle" : "Validasyon Protokolünü Oluştur")}
                            </Button>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
