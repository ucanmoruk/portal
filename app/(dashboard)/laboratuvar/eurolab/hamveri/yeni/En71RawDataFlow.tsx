"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ClipboardCheck, FileText, ListChecks, PackageSearch, Ruler, Shapes, Users } from "lucide-react";

type StepKey = "identity" | "age" | "type" | "tests" | "records";
type AgeGroup = "under36" | "over36" | "";
type TestDecision = "Bekliyor" | "Geçti" | "Kaldı" | "N/A";

interface TestRow {
  id: string;
  source: "Zorunlu" | "Koşullu" | "Harici";
  group: string;
  title: string;
  clause: string;
  method: string;
  reason: string;
}

interface RecordRow {
  measuredValue: string;
  decision: TestDecision;
  observation: string;
}

const steps: Array<{ key: StepKey; label: string; icon: React.ReactNode }> = [
  { key: "identity", label: "Kimliklendirme", icon: <PackageSearch className="h-4 w-4" /> },
  { key: "age", label: "Yaş Seçimi", icon: <Users className="h-4 w-4" /> },
  { key: "type", label: "Tip / Fonksiyon", icon: <Shapes className="h-4 w-4" /> },
  { key: "tests", label: "Test Listesi", icon: <ListChecks className="h-4 w-4" /> },
  { key: "records", label: "Karar Defteri", icon: <ClipboardCheck className="h-4 w-4" /> },
];

const materialOptions = [
  "Sert plastik",
  "Yumuşak plastik",
  "Tekstil",
  "Metal",
  "Ahşap",
  "Cam/Porselen",
  "Kağıt/Karton",
  "Sıvı içerik",
  "Mıknatıs",
];

const purposeOptions = [
  "Ev tipi oyuncak",
  "Su oyuncağı",
  "Binit araç",
  "Ağıza alınan oyuncak",
  "Sesli oyuncak",
  "Projektil / fırlatıcı",
  "Kostüm / giyilebilir",
  "Gıda ile birlikte sunulan",
];

const toyTypeOptions = [
  { key: "soft", label: "Yumuşak / Peluş", hint: "Dikiş dayanımı, dolgu erişilebilirliği ve küçük parça kontrollerini açar." },
  { key: "rideOn", label: "Binit Araç", hint: "Statik/dinamik dayanım, stabilite ve fren performansını açar." },
  { key: "acoustic", label: "Sesli Oyuncak", hint: "Akustik testler ve dB ölçümlerini açar." },
  { key: "projectile", label: "Projektil", hint: "Kinetik enerji, menzil ve darbe kontrollerini açar." },
  { key: "magnet", label: "Mıknatıslı Oyuncak", hint: "Flux indeksi ve mıknatıs ayrılma testlerini açar." },
  { key: "corded", label: "İpli / Kordonlu", hint: "İp uzunluğu, kopma ve dolaşma testlerini açar." },
  { key: "mouth", label: "Ağıza Alınan", hint: "Ağızla çalıştırılan oyuncak dayanım ve küçük parça testlerini açar." },
  { key: "aquatic", label: "Su / Şişme Oyuncak", hint: "Su oyuncağı ve şişirilebilir ürün değerlendirmelerini açar." },
  { key: "plasticFilm", label: "Plastik Film / Torba", hint: "Film kalınlığı ve ambalaj boğulma riskini açar." },
  { key: "moving", label: "Hareketli Mekanizma", hint: "Katlanır, kayan, menteşeli ve yaylı mekanizma risklerini açar." },
];

const baseTests: TestRow[] = [
  {
    id: "general-cleanliness",
    source: "Zorunlu",
    group: "Genel",
    title: "Temizlik ve malzeme uygunluğu",
    clause: "Madde 4.1",
    method: "Görsel kontrol",
    reason: "Her üründe temel malzeme temizliği ve yabancı madde kontrolü yapılır.",
  },
  {
    id: "edges",
    source: "Zorunlu",
    group: "Genel",
    title: "Kenar keskinliği",
    clause: "Madde 4.7",
    method: "8.10 / 8.11",
    reason: "Erişilebilir kenarlarda kesilme riski değerlendirilir.",
  },
  {
    id: "points",
    source: "Zorunlu",
    group: "Genel",
    title: "Uç keskinliği ve metal tel kontrolü",
    clause: "Madde 4.8",
    method: "8.10 / 8.12 / 8.13",
    reason: "Erişilebilir uç, tel ve delinme riski değerlendirilir.",
  },
];

const testCatalog: Array<TestRow & { when: (state: FormState) => boolean }> = [
  {
    id: "small-parts-under36",
    source: "Zorunlu",
    group: "Yaş",
    title: "Küçük parça silindiri",
    clause: "Madde 5.1",
    method: "8.2",
    reason: "0-36 ay grubunda boğulma/yutma riski için en katı küçük parça kriteri uygulanır.",
    when: state => state.ageGroup === "under36",
  },
  {
    id: "under36-torque-tension",
    source: "Zorunlu",
    group: "Yaş",
    title: "Tork, çekme, düşme, darbe ve basınç sonrası küçük parça",
    clause: "Madde 5.1",
    method: "8.3 / 8.4 / 8.5 / 8.7 / 8.8",
    reason: "36 ay altı oyuncaklarda kullanım sonrası ayrılabilir küçük parça oluşumu kontrol edilir.",
    when: state => state.ageGroup === "under36",
  },
  {
    id: "long-fibres",
    source: "Koşullu",
    group: "Kritik Yaş",
    title: "Uzun lifli oyuncak değerlendirmesi",
    clause: "Madde 5.9",
    method: "Görsel / boyutsal değerlendirme",
    reason: "10 ay altı kullanımda monofilament/lif yapısı özel boğulma ve dolaşma riski doğurabilir.",
    when: state => state.criticalAges.under10 && state.toyTypes.soft,
  },
  {
    id: "cords-under18",
    source: "Koşullu",
    group: "Kritik Yaş",
    title: "18 ay altı ip/kordon uzunluğu",
    clause: "Madde 5.4",
    method: "8.20 / 8.32 / 8.36",
    reason: "18 ay altı oyuncaklarda kordon uzunluğu ve dolaşma riski özel olarak değerlendirilir.",
    when: state => state.criticalAges.under18 && state.toyTypes.corded,
  },
  {
    id: "cords",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "İp, zincir, kayış ve kablo kontrolleri",
    clause: "Madde 5.4 / 4.13",
    method: "8.19 / 8.20 / 8.32 / 8.34 / 8.35 / 8.36 / 8.37",
    reason: "İpli oyuncaklarda uzunluk, kopma, elektriksel direnç ve dolaşma potansiyeli değerlendirilir.",
    when: state => state.toyTypes.corded,
  },
  {
    id: "soft-filled",
    source: "Koşullu",
    group: "Oyuncak Tipi",
    title: "Yumuşak/peluş dikiş ve dolgu değerlendirmesi",
    clause: "Madde 5.2",
    method: "8.4 / 8.7 / 8.8",
    reason: "Dikiş dayanımı, dolguya erişim ve küçük parça oluşumu kontrol edilir.",
    when: state => state.toyTypes.soft,
  },
  {
    id: "ride-on-strength",
    source: "Koşullu",
    group: "Oyuncak Tipi",
    title: "Binit araç dayanım, stabilite ve fren performansı",
    clause: "Madde 4.15",
    method: "8.21",
    reason: "Çocuğun ağırlığını taşıyan oyuncaklarda statik/dinamik dayanım, stabilite ve fren performansı gerekir.",
    when: state => state.toyTypes.rideOn || state.purpose === "Binit araç",
  },
  {
    id: "acoustic",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Akustik testler",
    clause: "Madde 4.20",
    method: "8.25",
    reason: "Sesli oyuncaklarda ses basınç seviyesi ölçülür.",
    when: state => state.toyTypes.acoustic || state.purpose === "Sesli oyuncak",
  },
  {
    id: "projectile",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Projektil kinetik enerji ve darbe",
    clause: "Madde 4.17",
    method: "8.23 / 8.38 / 8.39 / 8.40 / 8.41",
    reason: "Ok, dart ve fırlatıcı oyuncaklarda kinetik enerji, menzil ve uç parça güvenliği değerlendirilir.",
    when: state => state.toyTypes.projectile || state.purpose === "Projektil / fırlatıcı",
  },
  {
    id: "magnet",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Mıknatıs flux indeksi ve ayrılma",
    clause: "Madde 4.23",
    method: "8.30 / 8.31",
    reason: "Mıknatıslı oyuncaklarda manyetik akı indeksi ve dayanım sonrası ayrılma kontrol edilir.",
    when: state => state.toyTypes.magnet || state.materials.includes("Mıknatıs"),
  },
  {
    id: "magnetic-set-age",
    source: "Koşullu",
    group: "Kritik Yaş",
    title: "Mıknatıslı deney seti yaş uyarısı",
    clause: "Madde 7.16",
    method: "Etiket / talimat kontrolü",
    reason: "8 yaş kırılımı mıknatıslı deney setleri için özel uyarı değerlendirmesi gerektirebilir.",
    when: state => state.criticalAges.under8 && state.toyTypes.magnet,
  },
  {
    id: "mouth",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Ağıza alınan / ağızla çalıştırılan oyuncak",
    clause: "Madde 4.11",
    method: "8.2 / 8.3 / 8.4 / 8.9 / 8.17",
    reason: "Ağıza alınan oyuncaklarda ayrılabilir parça, ıslanma ve dayanım testleri gerekir.",
    when: state => state.toyTypes.mouth || state.purpose === "Ağıza alınan oyuncak",
  },
  {
    id: "aquatic",
    source: "Koşullu",
    group: "Oyuncak Tipi",
    title: "Su oyuncağı / şişirilebilir oyuncak",
    clause: "Madde 4.18",
    method: "8.2 / 8.3 / 8.4 / 8.5 / 8.7 / 8.8",
    reason: "Suda kullanılan veya şişirilebilir oyuncaklarda dayanım ve uyarı kontrolleri gerekir.",
    when: state => state.toyTypes.aquatic || state.purpose === "Su oyuncağı",
  },
  {
    id: "plastic-film",
    source: "Koşullu",
    group: "Materyal",
    title: "Plastik film / oyuncak torbası",
    clause: "Madde 4.3 / 4.4 / 6",
    method: "8.24",
    reason: "Esnek plastik film ve torbalarda film kalınlığı ve boğulma riski değerlendirilir.",
    when: state => state.toyTypes.plasticFilm || state.materials.includes("Yumuşak plastik"),
  },
  {
    id: "glass",
    source: "Koşullu",
    group: "Materyal",
    title: "Cam / porselen kırılma sonrası keskinlik",
    clause: "Madde 4.5 / 5.7",
    method: "8.7 / 8.10 / 8.11 / 8.12",
    reason: "Cam veya porselen parçalar kırılma ve erişilebilir keskinlik açısından değerlendirilir.",
    when: state => state.materials.includes("Cam/Porselen"),
  },
  {
    id: "liquid",
    source: "Koşullu",
    group: "Materyal",
    title: "Sıvı dolu oyuncak sızdırmazlık",
    clause: "Madde 5.5",
    method: "8.15",
    reason: "Sıvı içeren oyuncaklarda sızdırmazlık ve kullanım sonrası bütünlük kontrol edilir.",
    when: state => state.materials.includes("Sıvı içerik"),
  },
  {
    id: "moving-mechanism",
    source: "Koşullu",
    group: "Fonksiyon",
    title: "Hareketli mekanizma, katlanma ve sıkışma",
    clause: "Madde 4.10",
    method: "8.5 / 8.6 / 8.7 / 8.18",
    reason: "Katlanır, kayan veya yaylı mekanizmalarda sıkışma ve ani kapanma riski değerlendirilir.",
    when: state => state.toyTypes.moving,
  },
];

const standardTestOptions: TestRow[] = [
  ...baseTests,
  ...testCatalog.map(({ when: _when, ...test }) => test),
].sort((a, b) => {
  const getParts = (clause: string) => (clause.match(/\d+(?:\.\d+)*/)?.[0] || "999")
    .split(".")
    .map(part => Number(part));
  const partsA = getParts(a.clause);
  const partsB = getParts(b.clause);
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (partsA[index] || 0) - (partsB[index] || 0);
    if (diff !== 0) return diff;
  }
  return a.title.localeCompare(b.title, "tr");
});

interface FormState {
  reportNo: string;
  productName: string;
  brand: string;
  materials: string[];
  purpose: string;
  notes: string;
  ageGroup: AgeGroup;
  criticalAges: {
    under10: boolean;
    under18: boolean;
    under8: boolean;
  };
  toyTypes: Record<string, boolean>;
}

const emptyState: FormState = {
  reportNo: "",
  productName: "",
  brand: "",
  materials: [],
  purpose: "Ev tipi oyuncak",
  notes: "",
  ageGroup: "",
  criticalAges: {
    under10: false,
    under18: false,
    under8: false,
  },
  toyTypes: Object.fromEntries(toyTypeOptions.map(option => [option.key, false])),
};

const decisionClass = (decision: TestDecision) => {
  if (decision === "Geçti") return "border-green-200 bg-green-50 text-green-700";
  if (decision === "Kaldı") return "border-red-200 bg-red-50 text-red-700";
  if (decision === "N/A") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
};

export default function En71RawDataFlow() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<StepKey>("identity");
  const [form, setForm] = useState<FormState>(emptyState);
  const [records, setRecords] = useState<Record<string, RecordRow>>({});
  const [manualTests, setManualTests] = useState<TestRow[]>([]);
  const [manualTestForm, setManualTestForm] = useState({
    selectedId: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const activeIndex = steps.findIndex(step => step.key === activeStep);
  const selectedTests = useMemo(() => {
    const conditional = testCatalog.filter(test => test.when(form));
    const deduped = new Map<string, TestRow>();
    [...baseTests, ...conditional].forEach(test => deduped.set(test.id, test));
    manualTests.forEach(test => deduped.set(test.id, test));
    return Array.from(deduped.values());
  }, [form, manualTests]);

  const recordRows = useMemo(() => (
    selectedTests.map(test => ({
      ...test,
      record: records[test.id] || { measuredValue: "", decision: "Bekliyor" as TestDecision, observation: "" },
    }))
  ), [selectedTests, records]);

  const stats = useMemo(() => {
    const total = recordRows.length;
    const passed = recordRows.filter(row => row.record.decision === "Geçti").length;
    const failed = recordRows.filter(row => row.record.decision === "Kaldı").length;
    const na = recordRows.filter(row => row.record.decision === "N/A").length;
    return { total, passed, failed, na, waiting: total - passed - failed - na };
  }, [recordRows]);

  const testStatus = useMemo(() => {
    if (stats.failed > 0) return "Kaldı";
    if (stats.waiting > 0) return "Devam Ediyor";
    return "Tamamlandı";
  }, [stats]);

  const toggleMaterial = (material: string) => {
    setForm(current => ({
      ...current,
      materials: current.materials.includes(material)
        ? current.materials.filter(item => item !== material)
        : [...current.materials, material],
    }));
  };

  const toggleToyType = (key: string) => {
    setForm(current => ({
      ...current,
      toyTypes: { ...current.toyTypes, [key]: !current.toyTypes[key] },
    }));
  };

  const updateRecord = (testId: string, patch: Partial<RecordRow>) => {
    const emptyRecord: RecordRow = {
      measuredValue: "",
      decision: "Bekliyor",
      observation: "",
    };
    setRecords(current => ({
      ...current,
      [testId]: {
        ...emptyRecord,
        ...(current[testId] || {}),
        ...patch,
      },
    }));
  };

  const addManualTest = () => {
    const selected = standardTestOptions.find(test => test.id === manualTestForm.selectedId);
    if (!selected) return;

    const test: TestRow = {
      id: `manual-${selected.id}-${Date.now()}`,
      source: "Harici",
      group: selected.group,
      title: selected.title,
      clause: selected.clause,
      method: selected.method,
      reason: manualTestForm.reason.trim() || selected.reason,
    };

    setManualTests(current => [...current, test]);
    setManualTestForm({ selectedId: "", reason: "" });
  };

  const removeManualTest = (testId: string) => {
    setManualTests(current => current.filter(test => test.id !== testId));
    setRecords(current => {
      const next = { ...current };
      delete next[testId];
      return next;
    });
  };

  const goNext = () => {
    const next = steps[Math.min(activeIndex + 1, steps.length - 1)];
    setActiveStep(next.key);
  };

  const goBack = () => {
    const prev = steps[Math.max(activeIndex - 1, 0)];
    setActiveStep(prev.key);
  };

  const handleSave = async () => {
    if (!form.reportNo.trim() || !form.productName.trim()) {
      setSaveError("Rapor no ve ürün adı zorunludur.");
      setActiveStep("identity");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const toyCategory = Object.entries(form.toyTypes)
        .filter(([, checked]) => checked)
        .map(([key]) => key)
        .join(", ");

      const response = await fetch("/api/eurolab/rawdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          code: form.reportNo,
          sample_name: form.productName,
          standard: "EN 71-1:2026",
          toy_category: toyCategory || form.purpose,
          age_group: form.ageGroup === "under36" ? "0-36 Ay" : form.ageGroup === "over36" ? "36 Ay ve Üzeri" : "",
          status: testStatus,
          product_data: form,
          test_data: { stats, selectedTests, records },
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Hamveri kaydedilemedi.");
      window.alert("Kaydedildi.");
      router.push("/laboratuvar/eurolab/hamveri");
    } catch (error: any) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/laboratuvar/eurolab/hamveri" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" style={{padding: "10px", marginBottom: "8px"}}>
          <ArrowLeft className="h-4 w-4" />
          Hamveri listesine dön
        </Link>
        
      </div>

      <section className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50" style={{ padding: "clamp(16px, 4vw, 20px) clamp(16px, 4vw, 24px)" }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-[1rem] font-extrabold leading-6 text-slate-900">BS EN 71-1:2026 Test Karar Aracı</h2>
              <p className="mt-2 text-xs leading-6 text-slate-500">Kimliklendirme, yaş filtresi, oyuncak tipi, dinamik test listesi ve karar defteri sırasıyla ilerler.</p>
            </div>
            <div className="min-w-0 w-full sm:min-w-[220px] lg:w-auto">
              <div className="mb-1 flex justify-between text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">
                <span>İlerleme</span>
                <span>{activeIndex + 1}/{steps.length}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-[640px]">
          <aside className="border-b border-slate-200 bg-white" style={{ padding: "16px 20px" }}>
            <div className="flex gap-3 overflow-x-auto">
              {steps.map((step, index) => {
                const isActive = step.key === activeStep;
                const isDone = index < activeIndex;
                return (
                  <button
                    key={step.key}
                    className={`flex min-w-[150px] items-center gap-3 rounded-lg border text-left text-sm transition sm:min-w-[178px] ${
                      isActive
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : isDone
                          ? "border-green-100 bg-green-50 text-green-700"
                          : "border-transparent text-slate-600 hover:bg-slate-50"
                    }`}
                    style={{ padding: "12px 14px" }}
                    onClick={() => setActiveStep(step.key)}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isActive ? "bg-blue-600 text-white" : isDone ? "bg-green-600 text-white" : "bg-slate-200 text-slate-600"
                    }`}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold">{step.icon}{step.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main style={{ padding: "clamp(16px, 4vw, 28px)" }}>
            {activeStep === "identity" && (
              <div className="space-y-8">
                <PanelTitle title="1. Kademe: Temel Ürün Bilgisi" subtitle="Raporlama ve test motoru için ürün kimliği, malzeme bileşimi ve kullanım amacı belirlenir." />
                <div className="grid gap-5 md:grid-cols-3" style={{margin: "10px 0 10px 0"}}>
                  <Field label="Rapor No">
                    <input className="field-input" value={form.reportNo} onChange={event => setForm({ ...form, reportNo: event.target.value })} placeholder="Örn. EL-2026-001" />
                  </Field>
                  <Field label="Ürün Adı">
                    <input className="field-input" value={form.productName} onChange={event => setForm({ ...form, productName: event.target.value })} placeholder="Örn. Sesli peluş oyuncak" />
                  </Field>
                  <Field label="Marka">
                    <input className="field-input" value={form.brand} onChange={event => setForm({ ...form, brand: event.target.value })} placeholder="Marka / model" />
                  </Field>
                </div>
                <Field label="Malzeme Bileşimi">
                  <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50" style={{ padding: "10px" }}>
                    {materialOptions.map(material => (
                      <button key={material} className={`chip ${form.materials.includes(material) ? "chip-on" : ""}`} onClick={() => toggleMaterial(material)} type="button">
                        {material}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid gap-5 md:grid-cols-2" style={{marginTop: "15px"}}>
                  <Field label="Kullanım Amacı">
                    <select className="field-input" value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })}>
                      {purposeOptions.map(option => <option key={option}>{option}</option>)}
                    </select>
                  </Field>
                  <Field label="Not">
                    <textarea className="field-input min-h-[76px] resize-y" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Numune notu, ürün varyantı, özel kullanım bilgisi..." />
                  </Field>
                </div>
              </div>
            )}

            {activeStep === "age" && (
              <div className="space-y-6">
                <PanelTitle title="2. Kademe: Kritik Filtre - Yaş Seçimi" subtitle="Yaş seçimi test motorunun en öncelikli kararıdır. 0-36 ay grubu Madde 5 gerekliliklerini tetikler." />
                <div className="grid gap-5 md:grid-cols-2" style={{marginTop: "10px"}}>
                  <AgeCard
                    active={form.ageGroup === "under36"}
                    title="0 - 36 Ay"
                    subtitle="Küçük parça, boğulma ve yutma riski için en katı kriterler uygulanır."
                    onClick={() => setForm({ ...form, ageGroup: "under36" })}
                  />
                  <AgeCard
                    active={form.ageGroup === "over36"}
                    title="36 Ay ve Üzeri"
                    subtitle="Madde 4 genel gereksinimleri uygulanır; oyuncak tipine göre özel testler eklenir."
                    onClick={() => setForm({ ...form, ageGroup: "over36" })}
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50" style={{ padding: "18px", margin: "15px 0 15px 0" }}>
                  <h3 className="mb-3 text-sm font-bold text-slate-900" style={{ marginBottom: "5px" }}>Kritik yaş kırılımları</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <ToggleBox label="10 ay altı" hint="Uzun lifli oyuncaklar için ek kontrol." checked={form.criticalAges.under10} onChange={checked => setForm({ ...form, criticalAges: { ...form.criticalAges, under10: checked } })} />
                    <ToggleBox label="18 ay altı" hint="İpli/kordonlu oyuncaklarda özel uzunluk riski." checked={form.criticalAges.under18} onChange={checked => setForm({ ...form, criticalAges: { ...form.criticalAges, under18: checked } })} />
                    <ToggleBox label="8 yaş altı" hint="Mıknatıslı deney setleri için uyarı kırılımı." checked={form.criticalAges.under8} onChange={checked => setForm({ ...form, criticalAges: { ...form.criticalAges, under8: checked } })} />
                  </div>
                </div>
              </div>
            )}

            {activeStep === "type" && (
              <div className="space-y-6">
                <PanelTitle title="3. Kademe: Oyuncak Tipi ve Fonksiyon" subtitle="Bu seçimler sadece ilgili oyuncak tipine özgü özel testleri listeye ekler." />
                <div className="grid gap-4 md:grid-cols-2">
                  {toyTypeOptions.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      className={`rounded-xl border text-left transition ${
                        form.toyTypes[option.key] ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30"
                      }`}
                      style={{ padding: "18px" }}
                      onClick={() => toggleToyType(option.key)}
                    >
                      <span className="block text-sm font-bold text-slate-900">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeStep === "tests" && (
              <div className="space-y-6">
                <PanelTitle title="4. Kademe: Dinamik Test Listesi" subtitle="Yaş, malzeme, kullanım amacı ve oyuncak tipine göre testler zorunlu veya koşullu olarak listelenir." />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50" style={{ padding: "14px 16px", margin: "10px 0 10px 0" }}>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900" >Gereklilik kontrol görseli</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">Seçilen oyuncak tipine göre ikinci kontrol görseli burada açılacak.</div>
                  </div>
                  <button type="button" className="rounded-full border border-blue-200 bg-white text-sm font-semibold text-blue-700 hover:bg-blue-50" style={{ padding: "9px 16px" }}>
                    Görseli Göster
                  </button>
                </div>
                <ManualTestCard form={manualTestForm} setForm={setManualTestForm} onAdd={addManualTest} tests={standardTestOptions} />
                <TestTable tests={selectedTests} onRemoveManual={removeManualTest} />
              </div>
            )}

            {activeStep === "records" && (
              <div className="space-y-6">
                <PanelTitle title="5. Kademe: Veri Girişi ve Karar Defteri" subtitle="Analist ölçülen değer, karar ve hata gözlemini her test satırı için girer." />
                {saveError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-700" style={{ padding: "12px 14px" }}>
                    {saveError}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-5" style={{ marginTop: "10px"}}>
                  <SummaryCard label="Toplam" value={stats.total} />
                  <SummaryCard label="Geçti" value={stats.passed} tone="green" />
                  <SummaryCard label="Kaldı" value={stats.failed} tone="red" />
                  <SummaryCard label="N/A" value={stats.na} />
                  <SummaryCard label="Bekliyor" value={stats.waiting} tone="amber" />
                </div>
                <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white" style={{ padding: "8px", marginTop: "10px" }}>
                  <table className="w-full min-w-[760px] border-collapse text-sm sm:min-w-[980px] lg:min-w-[1100px]">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-[0.7rem] uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3">Test</th>
                        <th className="px-4 py-3">Madde</th>
                        <th className="px-4 py-3">Yöntem</th>
                        <th className="px-4 py-3">Ölçülen Değer</th>
                        <th className="px-4 py-3">Karar</th>
                        <th className="px-4 py-3">Hata Gözlemi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordRows.map(row => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-4 py-4 align-top">
                            <div className="font-semibold text-slate-900">{row.title}</div>
                            <div className="mt-1 text-xs text-slate-500">{row.source} - {row.group}</div>
                          </td>
                          <td className="px-4 py-4 align-top text-slate-700">{row.clause}</td>
                          <td className="px-4 py-4 align-top text-slate-700">{row.method}</td>
                          <td className="px-4 py-4 align-top">
                            <input className="field-input h-9 min-w-[140px]" value={row.record.measuredValue} onChange={event => updateRecord(row.id, { measuredValue: event.target.value })} placeholder="82 dB / 0,32 Nm" />
                          </td>
                          <td className="px-4 py-4 align-top">
                            <select className={`field-input h-9 min-w-[110px] font-semibold ${decisionClass(row.record.decision)}`} value={row.record.decision} onChange={event => updateRecord(row.id, { decision: event.target.value as TestDecision })}>
                              <option>Bekliyor</option>
                              <option>Geçti</option>
                              <option>Kaldı</option>
                              <option>N/A</option>
                            </select>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <input className="field-input h-9 min-w-[220px]" value={row.record.observation} onChange={event => updateRecord(row.id, { observation: event.target.value })} placeholder="Kırılma, keskin uç oluşumu..." />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 sm:flex-row sm:justify-between" style={{ paddingTop: "18px" }}>
              <button className="rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40" style={{ padding: "9px 18px" }} onClick={goBack} disabled={activeIndex === 0}>
                Geri
              </button>
              {activeStep === "records" ? (
                <div className="flex flex-wrap gap-3 sm:justify-end">
                  <button type="button" className="rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50" style={{ padding: "9px 18px" }} onClick={handlePrint}>
                    Yazdır
                  </button>
                  <button type="button" className="rounded-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" style={{ padding: "9px 22px" }} onClick={handleSave} disabled={saving}>
                    {saving ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </div>
              ) : (
                <button className="rounded-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40" style={{ padding: "9px 22px" }} onClick={goNext} disabled={activeIndex === steps.length - 1}>
                  İleri
                </button>
              )}
            </div>
          </main>
        </div>
      </section>

      <style jsx>{`
        .field-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #f8fafc;
          color: #0f172a;
          font-size: 0.86rem;
          padding: 10px 12px;
          outline: none;
        }
        .field-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
          background: #ffffff;
        }
        .chip {
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #ffffff;
          color: #475569;
          font-size: 0.82rem;
          font-weight: 600;
          padding: 8px 14px;
        }
        .chip-on {
          border-color: #93c5fd;
          background: #eff6ff;
          color: #1d4ed8;
        }
      `}</style>
    </div>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-slate-200" style={{ paddingBottom: "18px", marginBottom: "2px" }}>
      <h3 className="text-lg font-extrabold leading-7 text-slate-900">{title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[0.72rem] font-bold uppercase leading-4 tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function AgeCard({ active, title, subtitle, onClick }: { active: boolean; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`rounded-lg border text-left transition ${active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30"}`}
      style={{ padding: "20px" }}
      onClick={onClick}
    >
      <Ruler className={`mb-3 h-5 w-5 ${active ? "text-blue-600" : "text-slate-400"}`} />
      <span className="block text-base font-extrabold leading-6 text-slate-900">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-slate-500">{subtitle}</span>
    </button>
  );
}

function ToggleBox({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white transition hover:border-blue-200 hover:bg-blue-50/30" style={{ padding: "16px" }}>
      <input type="checkbox" className="mt-1 h-4 w-4 accent-blue-600" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>
        <span className="block text-sm font-bold leading-5 text-slate-900">{label}</span>
        <span className="mt-2 block text-xs leading-5 text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

function ManualTestCard({
  form,
  setForm,
  onAdd,
  tests,
}: {
  form: { selectedId: string; reason: string };
  setForm: React.Dispatch<React.SetStateAction<{ selectedId: string; reason: string }>>;
  onAdd: () => void;
  tests: TestRow[];
}) {
  const selected = tests.find(test => test.id === form.selectedId);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm" style={{ padding: "18px", marginBottom: "10px" }}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-[0.95rem] font-extrabold leading-6 text-slate-900">Harici Test Ekle</h3>
          <p className="text-[0.82rem] leading-5 text-slate-500">Risk görülen durumlarda EN 71-1 kataloğundan ek kontrol seçin.</p>
        </div>
        <button type="button" className="rounded-full bg-blue-600 text-sm font-semibold leading-5 text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" style={{ padding: "10px 20px" }} onClick={onAdd} disabled={!form.selectedId}>
          Test Ekle
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50" style={{ padding: "14px" }}>
        <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm" style={{ padding: "10px" }}>
            <div className="flex items-center justify-between gap-3" style={{ marginBottom: "2px" }}>
              <span className="text-[0.74rem] font-extrabold uppercase tracking-wide text-slate-500">Test seçimi</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-bold text-slate-500">EN 71-1</span>
            </div>
            <div className="relative rounded-lg border border-slate-300 bg-white transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
              <select
                aria-label="EN 71-1 test seçimi"
                className="h-11 w-full cursor-pointer appearance-none rounded-lg border-0 bg-transparent py-0 pl-3 pr-12 text-sm font-semibold text-slate-900 outline-none"
                value={form.selectedId}
                onChange={event => setForm(current => ({ ...current, selectedId: event.target.value }))}
              >
                <option value="">EN 71-1 test kataloğundan seçin</option>
                {tests.map(test => (
                  <option key={test.id} value={test.id}>{test.clause} - {test.title}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute bottom-0 right-0 top-0 flex w-11 items-center justify-center rounded-r-lg border-l border-slate-200 bg-slate-50 text-sm font-bold text-slate-600">⌄</span>
            </div>
          </div>

          <label className="block rounded-lg border border-slate-200 bg-white shadow-sm" style={{ padding: "10px" }}>
            <span className="block text-[0.74rem] font-extrabold uppercase tracking-wide text-slate-500" style={{ marginBottom: "2px" }}>Ekleme nedeni</span>
            <input
              aria-label="Harici ekleme nedeni"
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={form.reason}
              onChange={event => setForm(current => ({ ...current, reason: event.target.value }))}
              placeholder="Risk notu veya ürün özelliği"
            />
          </label>
        </div>

        {!selected && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white text-[0.82rem] leading-5 text-slate-500" style={{ marginTop: "5px", padding: "11px 12px" }}>
            Seçim yapıldığında madde, yöntem ve test grubu burada özetlenecek.
          </div>
        )}
      </div>

      {selected && (
        <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50 text-[0.84rem] leading-5 text-slate-700 md:grid-cols-3" style={{ marginTop: "5px", padding: "12px 14px" }}>
          <div>
            <div className="text-[0.72rem] font-bold uppercase tracking-wide text-blue-700">Madde</div>
            <div className="mt-1 font-semibold text-slate-900">{selected.clause}</div>
          </div>
          <div>
            <div className="text-[0.72rem] font-bold uppercase tracking-wide text-blue-700">Yöntem</div>
            <div className="mt-1 font-semibold text-slate-900">{selected.method}</div>
          </div>
          <div>
            <div className="text-[0.72rem] font-bold uppercase tracking-wide text-blue-700">Grup</div>
            <div className="mt-1 font-semibold text-slate-900">{selected.group}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function TestTable({ tests, onRemoveManual }: { tests: TestRow[]; onRemoveManual: (testId: string) => void }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white" style={{ padding: "10px" }}>
      <table className="w-full min-w-[760px] border-collapse text-sm sm:min-w-[920px] lg:min-w-[1050px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[0.76rem] font-bold uppercase leading-5 tracking-wide text-slate-500">
            <th className="px-4 py-4" style={{ width: 120 }}>Öncelik</th>
            <th className="px-4 py-4" style={{ width: 280 }}>Test</th>
            <th className="px-4 py-4" style={{ width: 130 }}>Madde</th>
            <th className="px-4 py-4" style={{ width: 150 }}>Yöntem</th>
            <th className="px-4 py-4">Tetiklenme Nedeni</th>
            <th className="px-4 py-4 text-right" style={{ width: 90 }}>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {tests.map(test => (
            <tr key={test.id} className="border-b border-slate-100 text-sm leading-6 last:border-b-0">
              <td className="px-4 py-4 align-top">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  test.source === "Zorunlu"
                    ? "bg-blue-50 text-blue-700"
                    : test.source === "Harici"
                      ? "bg-purple-50 text-purple-700"
                      : "bg-amber-50 text-amber-700"
                }`}>
                  {test.source}
                </span>
              </td>
              <td className="px-4 py-4 align-top">
                <div className="font-semibold leading-6 text-slate-900">{test.title}</div>
                <div className="mt-1 text-[0.78rem] leading-5 text-slate-500">{test.group}</div>
              </td>
              <td className="px-4 py-4 align-top text-slate-700">{test.clause}</td>
              <td className="px-4 py-4 align-top text-slate-700">{test.method}</td>
              <td className="px-4 py-4 align-top text-[0.82rem] leading-6 text-slate-500">{test.reason}</td>
              <td className="px-4 py-4 align-top text-right">
                {test.source === "Harici" && (
                  <button type="button" className="rounded-full border border-red-200 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100" style={{ padding: "6px 11px" }} onClick={() => onRemoveManual(test.id)}>
                    Sil
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "red" | "amber" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    green: "border-green-200 bg-green-50 text-green-700",
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`rounded-xl border p-4 text-center ${tones[tone]}`}>
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="mt-1 text-[0.7rem] font-bold uppercase tracking-wide">{label}</div>
    </div>
  );
}
