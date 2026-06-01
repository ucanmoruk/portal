"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "@/app/styles/table.module.css";

type QcPoint = {
  id: number;
  sequence_no: number;
  label: string;
  analyst: string | null;
  value: number | null;
  target_value: number | null;
  unit: string | null;
  recovery: number;
  source: string;
  locked: boolean;
  measured_at: string | null;
  created_at: string;
};

type QcCardComponent = {
  id: number;
  code: string;
  card_type: string;
  validation_code: string;
  validation_id: number;
  method_name: string;
  component_name: string;
  lower_limit: number;
  center_line: number;
  upper_limit: number;
  lower_warning_limit: number;
  upper_warning_limit: number;
  lower_control_limit: number;
  upper_control_limit: number;
  lower_legal_limit: number | null;
  upper_legal_limit: number | null;
  standard_deviation: number | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
  points: QcPoint[];
  audit_logs: QcAuditLog[];
};

type QcCard = {
  id: number;
  code: string;
  card_type: string;
  validation_id: number;
  validation_code: string;
  method_name: string;
  component_count: number;
  component_names: string[];
  created_at: string;
  updated_at: string;
  components: QcCardComponent[];
};

type QcAuditLog = {
  id: number;
  action: string;
  point_id: number | null;
  actor_name: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};

const formatNumber = (value: number | null | undefined, digits = 2) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("tr-TR", { maximumFractionDigits: digits })
    : "-";

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleDateString("tr-TR") : "-";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const cardTypeLabel = (type: string) => {
  if (type === "RECOVERY") return "Geri Kazanım Kart";
  if (type === "AVERAGE") return "Ortalama Kart";
  if (type === "RANGE") return "Range Kart";
  return type;
};

const pointSourceLabel = (point: QcPoint) => {
  if (point.source === "VALIDATION_BASELINE") return "Sınır";
  if (point.source === "VALIDATION_FLOW") return "Validasyon Takip";
  if (point.locked) return "Validasyon";
  return "Manuel";
};

const splitRangeAnalysts = (raw: string | null) => {
  if (!raw) return { a: "", b: "" };
  if (raw.includes("||")) {
    const [a, b] = raw.split("||");
    return { a: (a || "").trim(), b: (b || "").trim() };
  }
  return { a: raw.trim(), b: raw.trim() };
};

const parseDecimal = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const axisValueText = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? String(Number(value.toFixed(3))) : "";

const UNIT_OPTIONS = ["mg/kg", "mg/L", "ug/kg", "ug/L", "ng/L", "g/kg", "%"];

const recoveryLimits = [
  { concentration: 1000000, low: 98, high: 102 },
  { concentration: 100000, low: 98, high: 102 },
  { concentration: 10000, low: 97, high: 103 },
  { concentration: 1000, low: 95, high: 105 },
  { concentration: 100, low: 90, high: 107 },
  { concentration: 10, low: 80, high: 110 },
  { concentration: 1, low: 80, high: 110 },
  { concentration: 0.1, low: 80, high: 110 },
  { concentration: 0.01, low: 60, high: 115 },
  { concentration: 0.001, low: 40, high: 120 },
];

const getPpmFactor = (unit?: string | null) => {
  const normalized = (unit || "").toLowerCase().replace("µ", "u");
  if (normalized === "ug/l" || normalized === "ug/kg") return 0.001;
  if (normalized === "ng/l") return 0.000001;
  if (normalized === "%") return 10000;
  return 1;
};

const findRecoveryLimit = (targetValue: number | null | undefined, unit?: string | null) => {
  if (typeof targetValue !== "number" || !Number.isFinite(targetValue) || targetValue <= 0) return null;
  const targetPpm = targetValue * getPpmFactor(unit);
  return recoveryLimits.find(limit => targetPpm >= limit.concentration) || recoveryLimits[recoveryLimits.length - 1];
};

export default function QcCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: cardId } = use(params);
  const [card, setCard] = useState<QcCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeComponentId, setActiveComponentId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [workingPointId, setWorkingPointId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [personnelOptions, setPersonnelOptions] = useState<string[]>([]);
  const [form, setForm] = useState({ analyst: "", value: "", target_value: "", unit: "mg/kg", measured_at: "" });
  const [xAxisMin, setXAxisMin] = useState("");
  const [xAxisMax, setXAxisMax] = useState("");
  const [yAxisMin, setYAxisMin] = useState("");
  const [yAxisMax, setYAxisMax] = useState("");
  const [axisReadyKey, setAxisReadyKey] = useState("");
  const formRef = useRef<HTMLDivElement | null>(null);

  const loadCard = async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/eurolab/qc-cards/${id}`, { credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "QC kart alınamadı.");
      setCard(json);
      setActiveComponentId((current) => current && json.components?.some((component: QcCardComponent) => component.id === current)
        ? current
        : json.components?.[0]?.id || null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "QC kart alınamadı."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cardId) loadCard(cardId);
  }, [cardId]);

  useEffect(() => {
    let alive = true;
    fetch("/api/eurolab/personnel", { credentials: "same-origin" })
      .then(res => res.ok ? res.json() : [])
      .then((rows: Array<{ name?: string }>) => {
        if (!alive) return;
        setPersonnelOptions(rows.map(row => row.name || "").filter(Boolean));
      })
      .catch(() => {
        if (alive) setPersonnelOptions([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const activeComponent = useMemo(() => {
    if (!card) return null;
    return card.components.find(component => component.id === activeComponentId) || card.components[0] || null;
  }, [activeComponentId, card]);

  useEffect(() => {
    if (!activeComponent || editingId) return;
    setForm(current => ({ ...current, unit: activeComponent.unit || current.unit || "mg/kg" }));
  }, [activeComponent, editingId]);

  const axisStorageKey = activeComponent ? `eurolab-qc-axis:${activeComponent.id}` : "";

  useEffect(() => {
    if (!activeComponent || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(`eurolab-qc-axis:${activeComponent.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<Record<"xAxisMin" | "xAxisMax" | "yAxisMin" | "yAxisMax", string>>;
        setXAxisMin(parsed.xAxisMin ?? "14");
        setXAxisMax(parsed.xAxisMax ?? "30");
        setYAxisMin(parsed.yAxisMin ?? axisValueText(activeComponent.lower_control_limit - 3));
        setYAxisMax(parsed.yAxisMax ?? axisValueText(activeComponent.upper_control_limit + 3));
        setAxisReadyKey(`eurolab-qc-axis:${activeComponent.id}`);
        return;
      } catch {
        window.localStorage.removeItem(`eurolab-qc-axis:${activeComponent.id}`);
      }
    }
    setXAxisMin("14");
    setXAxisMax("30");
    setYAxisMin(axisValueText(activeComponent.lower_control_limit - 3));
    setYAxisMax(axisValueText(activeComponent.upper_control_limit + 3));
    setAxisReadyKey(`eurolab-qc-axis:${activeComponent.id}`);
  }, [activeComponent]);

  useEffect(() => {
    if (!axisStorageKey || axisReadyKey !== axisStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(axisStorageKey, JSON.stringify({ xAxisMin, xAxisMax, yAxisMin, yAxisMax }));
  }, [axisReadyKey, axisStorageKey, xAxisMax, xAxisMin, yAxisMax, yAxisMin]);

  const chartData = useMemo(() => {
    return (activeComponent?.points || []).filter(point => point.source !== "VALIDATION_BASELINE").map(point => ({
      no: point.sequence_no,
      label: point.label || String(point.sequence_no),
      recovery: point.recovery,
      source: point.source,
      analyst: point.analyst || "-",
    }));
  }, [activeComponent]);

  const formRecovery = useMemo(() => {
    const value = parseDecimal(form.value);
    const target = parseDecimal(form.target_value);
    return Number.isFinite(value) && Number.isFinite(target) && target > 0 ? (value / target) * 100 : Number.NaN;
  }, [form.target_value, form.value]);

  const formLegalLimit = useMemo(() => {
    const target = parseDecimal(form.target_value);
    return findRecoveryLimit(Number.isFinite(target) ? target : null, form.unit);
  }, [form.target_value, form.unit]);

  const selectablePersonnel = useMemo(() => {
    const fromPoints = (activeComponent?.points || []).map(point => point.analyst || "").filter(Boolean);
    return Array.from(new Set([...personnelOptions, ...fromPoints])).sort((left, right) => left.localeCompare(right, "tr-TR"));
  }, [activeComponent, personnelOptions]);

  const selectableUnits = useMemo(() => {
    const units = [
      activeComponent?.unit || "",
      ...UNIT_OPTIONS,
      ...(activeComponent?.points || []).map(point => point.unit || ""),
    ].filter(Boolean);
    return Array.from(new Set(units));
  }, [activeComponent]);

  const dataRows = useMemo(() => {
    return [...(activeComponent?.points || [])].sort((left, right) => {
      if (left.sequence_no !== right.sequence_no) return right.sequence_no - left.sequence_no;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  }, [activeComponent]);

  const pointById = useMemo(() => {
    return new Map((activeComponent?.points || []).map(point => [point.id, point]));
  }, [activeComponent]);

  const resetForm = () => {
    setForm({ analyst: "", value: "", target_value: "", unit: activeComponent?.unit || "mg/kg", measured_at: "" });
  };

  const auditRows = useMemo(() => {
    const logs = activeComponent?.audit_logs || [];
    return [...logs].sort((left, right) => {
      const leftNo = auditDataNo(left);
      const rightNo = auditDataNo(right);
      if (leftNo !== rightNo) return leftNo - rightNo;
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    });
  }, [activeComponent]);

  const latestEditableLogIdByPoint = useMemo(() => {
    const map = new Map<number, number>();
    const newestFirst = [...auditRows].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    for (const log of newestFirst) {
      if (!log.point_id || map.has(log.point_id)) continue;
      const point = pointById.get(log.point_id);
      if (point && !point.locked) map.set(log.point_id, log.id);
    }
    return map;
  }, [auditRows, pointById]);

  const xDomain = useMemo<[number | "dataMin", number | "dataMax"]>(() => [
    Number.isFinite(parseDecimal(xAxisMin)) ? parseDecimal(xAxisMin) : "dataMin",
    Number.isFinite(parseDecimal(xAxisMax)) ? parseDecimal(xAxisMax) : "dataMax",
  ], [xAxisMax, xAxisMin]);

  const yDomain = useMemo<[number | "auto", number | "auto"]>(() => [
    Number.isFinite(parseDecimal(yAxisMin)) ? parseDecimal(yAxisMin) : "auto",
    Number.isFinite(parseDecimal(yAxisMax)) ? parseDecimal(yAxisMax) : "auto",
  ], [yAxisMax, yAxisMin]);

  const savePoint = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cardId || !activeComponent) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/eurolab/qc-cards/${cardId}`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...form, point_id: editingId, component_card_id: activeComponent.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || (editingId ? "Veri güncellenemedi." : "Veri eklenemedi."));
      setCard(json);
      setEditingId(null);
      resetForm();
    } catch (err: unknown) {
      setError(getErrorMessage(err, editingId ? "Veri güncellenemedi." : "Veri eklenemedi."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (point: QcPoint) => {
    setEditingId(point.id);
    setForm({
      analyst: point.analyst || "",
      value: point.value == null ? "" : String(point.value),
      target_value: point.target_value == null ? "" : String(point.target_value),
      unit: point.unit || activeComponent?.unit || "mg/kg",
      measured_at: point.measured_at ? point.measured_at.slice(0, 10) : "",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm();
  };

  const deletePoint = async (pointId: number) => {
    if (!cardId || !activeComponent) return;
    const confirmed = window.confirm("Manuel QC verisi silinsin mi?");
    if (!confirmed) return;
    setWorkingPointId(pointId);
    setError("");
    try {
      const res = await fetch(`/api/eurolab/qc-cards/${cardId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ point_id: pointId, component_card_id: activeComponent.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Veri silinemedi.");
      setCard(json);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Veri silinemedi."));
    } finally {
      setWorkingPointId(null);
    }
  };

  return (
    <div className={styles.page} style={{ width: "100%", maxWidth: 1300, minWidth: 0, overflowX: "hidden", gap: 12 }}>
      <div className={styles.pageHeader}>
        <div>
          <Link href="/laboratuvar/eurolab/qc-kartlar" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline mb-2">
            <ArrowLeft size={15} /> QC Kartlar
          </Link>
          <h1 className={styles.pageTitle}>{card?.code || "QC Kart"}</h1>
          <p className={styles.pageSubtitle}>
            {card ? `${cardTypeLabel(card.card_type)} · ${card.method_name || "-"} · ${card.component_count} alt bileşen · ${card.validation_code}` : "Kart yükleniyor..."}
          </p>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.tableCard} style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}>
        <div style={{ padding: 14, borderBottom: "1px solid var(--color-border-light)" }}>
          {loading ? (
            <div className={styles.skeleton} style={{ height: 280, width: "100%" }} />
          ) : card && activeComponent ? (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                {card.components.map(component => (
                  <button
                    key={component.id}
                    type="button"
                    className={component.id === activeComponent.id ? styles.saveBtn : styles.cancelBtn}
                    style={{ height: 34, borderRadius: 999 }}
                    onClick={() => {
                      setActiveComponentId(component.id);
                      setEditingId(null);
                      setError("");
                    }}
                  >
                    {component.component_name}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 10 }}>
                <Metric label="Xort" value={`${formatNumber(activeComponent.center_line)}%`} />
                <Metric label="SS" value={`${formatNumber(activeComponent.standard_deviation, 4)}%`} />
                <Metric label="AUL / ÜUL" value={`${formatNumber(activeComponent.lower_warning_limit)} / ${formatNumber(activeComponent.upper_warning_limit)}%`} />
                <Metric label="AKL / ÜKL" value={`${formatNumber(activeComponent.lower_control_limit)} / ${formatNumber(activeComponent.upper_control_limit)}%`} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: 8, alignItems: "end", marginBottom: 8 }}>
                <AxisInput label="X Min" value={xAxisMin} onChange={setXAxisMin} placeholder="Oto" />
                <AxisInput label="X Max" value={xAxisMax} onChange={setXAxisMax} placeholder="Oto" />
                <AxisInput label="Y Min" value={yAxisMin} onChange={setYAxisMin} placeholder="Örn. 60" />
                <AxisInput label="Y Max" value={yAxisMax} onChange={setYAxisMax} placeholder="Örn. 140" />
              </div>
              <div style={{ width: "100%", height: 285, maxWidth: "100%", margin: "0 auto" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                    <XAxis dataKey="no" type="number" domain={xDomain} allowDataOverflow tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={yDomain} allowDataOverflow />
                    <Tooltip
                      formatter={(value: unknown) => [`${formatNumber(Number(value))}%`, "Geri kazanım"]}
                      labelFormatter={(_label: unknown, payload: ReadonlyArray<{ payload?: { label?: string } }>) => payload?.[0]?.payload?.label || ""}
                    />
                    <ReferenceLine y={activeComponent.lower_legal_limit ?? undefined} stroke="#9333ea" strokeDasharray="2 4" label="Alt Yasal" />
                    <ReferenceLine y={activeComponent.upper_legal_limit ?? undefined} stroke="#9333ea" strokeDasharray="2 4" label="Üst Yasal" />
                    <ReferenceLine y={activeComponent.lower_control_limit} stroke="#ef4444" strokeDasharray="4 4" label="AKL" />
                    <ReferenceLine y={activeComponent.upper_control_limit} stroke="#ef4444" strokeDasharray="4 4" label="ÜKL" />
                    <ReferenceLine y={activeComponent.lower_warning_limit} stroke="#f59e0b" strokeDasharray="4 4" label="AUL" />
                    <ReferenceLine y={activeComponent.center_line} stroke="#2563eb" strokeDasharray="4 4" label="Orta" />
                    <ReferenceLine y={activeComponent.upper_warning_limit} stroke="#f59e0b" strokeDasharray="4 4" label="ÜUL" />
                    <Line type="monotone" dataKey="recovery" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className={styles.empty}>QC kart bulunamadı.</div>
          )}
        </div>
      </div>

      {card && activeComponent && (
        <div ref={formRef} className={styles.tableCard} style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border-light)" }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{editingId ? "Veri Güncelle" : "Yeni Veri"}</h2>
          </div>
          <form onSubmit={savePoint} className={styles.modalBody} style={{ padding: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, alignItems: "end" }}>
              <div className={styles.formGroup}>
                <label>Personel</label>
                <select value={form.analyst} onChange={event => setForm(current => ({ ...current, analyst: event.target.value }))}>
                  <option value="">Seçiniz</option>
                  {selectablePersonnel.map(person => <option key={person} value={person}>{person}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Tarih</label>
                <input type="date" value={form.measured_at} onChange={event => setForm(current => ({ ...current, measured_at: event.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label>Ölçüm Değeri</label>
                <input value={form.value} onChange={event => setForm(current => ({ ...current, value: event.target.value }))} inputMode="decimal" required />
              </div>
              <div className={styles.formGroup}>
                <label>Hedef Değer <span className={styles.required}>*</span></label>
                <input value={form.target_value} onChange={event => setForm(current => ({ ...current, target_value: event.target.value }))} inputMode="decimal" required />
              </div>
              <div className={styles.formGroup}>
                <label>Birim</label>
                <select value={form.unit} onChange={event => setForm(current => ({ ...current, unit: event.target.value }))}>
                  {selectableUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Geri Kazanım (%)</label>
                <input value={Number.isFinite(formRecovery) ? formatNumber(formRecovery, 3) : ""} readOnly placeholder="Otomatik hesaplanır" />
              </div>
              <div className={styles.formGroup}>
                <label>Yasal Aralık (%)</label>
                <input value={formLegalLimit ? `${formatNumber(formLegalLimit.low)} - ${formatNumber(formLegalLimit.high)}` : ""} readOnly placeholder="Otomatik" />
              </div>
              <div className={styles.formGroup} style={{ justifyContent: "flex-end" }}>
                <button className={styles.saveBtn} type="submit" disabled={saving}>
                  {saving ? <span className={styles.loader} /> : <><Plus size={15} /> {editingId ? "Güncelle" : "Ekle"}</>}
                </button>
                {editingId && (
                  <button className={styles.cancelBtn} type="button" onClick={cancelEdit} disabled={saving}>
                    <X size={15} /> Vazgeç
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {card && activeComponent && card.card_type === "RANGE" && (
        <div className={styles.tableCard} style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}>
          <div className={styles.tableWrapper} style={{ width: "100%", maxWidth: "100%", maxHeight: "52vh", overflow: "auto" }}>
            <table className={styles.table} style={{ minWidth: 980, fontSize: "0.72rem", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: 56, padding: "12px 8px" }}>Sıra No</th>
                  <th style={{ width: 88, padding: "6px 8px" }}>A</th>
                  <th style={{ width: 88, padding: "6px 8px" }}>B</th>
                  <th style={{ width: 92, padding: "6px 8px" }}>Ortalama</th>
                  <th style={{ width: 84, padding: "6px 8px" }}>%r</th>
                  <th style={{ width: 80, padding: "6px 8px" }}>Birim</th>
                  <th style={{ width: 92, padding: "6px 8px" }}>Tarih</th>
                  <th style={{ width: 130, padding: "6px 8px" }}>Analist A</th>
                  <th style={{ width: 130, padding: "6px 8px" }}>Analist B</th>
                  <th style={{ width: 104, padding: "6px 8px" }}>Kaynak</th>
                </tr>
              </thead>
              <tbody>
                {dataRows.length === 0 ? (
                  <tr><td colSpan={10}><div className={styles.empty}>Veri bulunamadı.</div></td></tr>
                ) : dataRows.map(point => {
                  const pointUnit = point.unit || activeComponent.unit || null;
                  const A = point.value;
                  const B = point.target_value;
                  const avg = (typeof A === "number" && typeof B === "number" && Number.isFinite(A) && Number.isFinite(B))
                    ? (A + B) / 2 : null;
                  const { a: analystA, b: analystB } = splitRangeAnalysts(point.analyst);
                  return (
                    <tr key={point.id}>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{point.sequence_no}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{formatNumber(A, 4)}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{formatNumber(B, 4)}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{formatNumber(avg, 4)}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{`${formatNumber(point.recovery, 3)}%`}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{pointUnit || "-"}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{formatDate(point.measured_at || point.created_at)}</td>
                      <td style={{ padding: "5px 8px" }}>{analystA || "-"}</td>
                      <td style={{ padding: "5px 8px" }}>{analystB || "-"}</td>
                      <td>
                        <span className={`${styles.badge} ${point.locked ? styles.badgeGray : styles.badgeGreen}`}>
                          {pointSourceLabel(point)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {card && activeComponent && card.card_type !== "RANGE" && (
        <div className={styles.tableCard} style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}>
          <div className={styles.tableWrapper} style={{ width: "100%", maxWidth: "100%", maxHeight: "52vh", overflow: "auto" }}>
            <table className={styles.table} style={{ minWidth: 980, fontSize: "0.72rem", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: 56, padding: "12px 8px" }}>Sıra No</th>
                  <th style={{ width: 92, padding: "6px 8px" }}>Geri Kazanım</th>
                  <th style={{ width: 92, padding: "6px 8px" }}>Ölçülen Değer</th>
                  <th style={{ width: 92, padding: "6px 8px" }}>Hedef Değer</th>
                  <th style={{ width: 70, padding: "6px 8px" }}>Birim</th>
                  <th style={{ width: 88, padding: "6px 8px" }}>Alt Yasal</th>
                  <th style={{ width: 88, padding: "6px 8px" }}>Üst Yasal</th>
                  <th style={{ width: 88, padding: "6px 8px" }}>Tarih</th>
                  <th style={{ width: 120, padding: "6px 8px" }}>Personel</th>
                  <th style={{ width: 104, padding: "6px 8px" }}>Kaynak</th>
                </tr>
              </thead>
              <tbody>
                {dataRows.length === 0 ? (
                  <tr><td colSpan={10}><div className={styles.empty}>Veri bulunamadı.</div></td></tr>
                ) : dataRows.map(point => {
                  const pointUnit = point.unit || activeComponent.unit || null;
                  const pointLegalLimit = findRecoveryLimit(point.target_value, pointUnit);
                  const lowerLegalLimit = pointLegalLimit?.low ?? activeComponent.lower_legal_limit;
                  const upperLegalLimit = pointLegalLimit?.high ?? activeComponent.upper_legal_limit;
                  return (
                    <tr key={point.id}>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{point.sequence_no}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{`${formatNumber(point.recovery)}%`}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{formatNumber(point.value, 4)}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{formatNumber(point.target_value, 4)}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{pointUnit || "-"}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{formatNumber(lowerLegalLimit)}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{formatNumber(upperLegalLimit)}</td>
                      <td className={styles.tdMono} style={{ padding: "5px 8px" }}>{formatDate(point.measured_at || point.created_at)}</td>
                      <td style={{ padding: "5px 8px" }}>{point.analyst || "-"}</td>
                      <td>
                        <span className={`${styles.badge} ${point.locked ? styles.badgeGray : styles.badgeGreen}`}>
                          {pointSourceLabel(point)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {card && activeComponent && (
        <div className={styles.tableCard} style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border-light)" }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>İşlem İzi</h2>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
                            <thead>
                <tr>
                  <th style={{ width: 160 }}>Tarih</th>
                  <th style={{ width: 150 }}>İşlem</th>
                  <th style={{ width: 150 }}>Kullanıcı</th>
                  <th style={{ width: 110 }}>Data No</th>
                  <th style={{ width: 130 }}>Hedef Değer</th>
                  <th style={{ width: 120 }}>Birim</th>
                  <th style={{ width: 130 }}>Ölçülen Değer</th>
                  <th style={{ width: 150 }}>Geri Kazanım</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {auditRows.length === 0 ? (
                  <tr><td colSpan={9}><div className={styles.empty}>İşlem izi bulunamadı.</div></td></tr>
                ) : auditRows.map(log => {
                  const data = getAuditData(log);
                  const editablePoint = log.point_id ? pointById.get(log.point_id) : null;
                  const showActions = Boolean(editablePoint && !editablePoint.locked && latestEditableLogIdByPoint.get(editablePoint.id) === log.id);
                  return (
                    <tr key={log.id}>
                      <td className={styles.tdMono}>{formatDate(log.created_at)}</td>
                      <td>{auditLabel(log.action)}</td>
                      <td>{log.actor_name || "-"}</td>
                      <td className={styles.tdMono}>{data.dataNo}</td>
                      <td className={styles.tdMono}>{formatNumber(data.targetValue)}</td>
                      <td className={styles.tdMono}>{data.unit || activeComponent.unit || "-"}</td>
                      <td className={styles.tdMono}>{formatNumber(data.measuredValue)}</td>
                      <td className={styles.tdMono}>{data.recovery == null ? "-" : `${formatNumber(data.recovery)}%`}</td>
                      <td>
                        {showActions && editablePoint && (
                          <div className={styles.actionBtns}>
                            <button className={styles.editBtn} title="Düzenle" onClick={() => startEdit(editablePoint)} disabled={workingPointId === editablePoint.id}>
                              <Pencil size={14} />
                            </button>
                            <button className={styles.deleteBtn} title="Sil" onClick={() => deletePoint(editablePoint.id)} disabled={workingPointId === editablePoint.id}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--color-border-light)", borderRadius: 8, padding: "12px 14px", background: "var(--color-surface-2)" }}>
      <div style={{ fontSize: "0.74rem", color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1rem", fontWeight: 650, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function AxisInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
      {label}
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        style={{
          height: 30,
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: "0.78rem",
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}

const auditLabel = (action: string) => {
  if (action === "CREATE_POINT") return "Satır eklendi";
  if (action === "UPDATE_POINT") return "Satır düzenlendi";
  if (action === "DELETE_POINT") return "Satır silindi";
  return action;
};

function getAuditData(log: QcAuditLog) {
  const data = log.after_data || log.before_data || {};
  const dataNo = typeof data.sequence_no === "number" ? data.sequence_no : log.point_id || 0;
  const targetValue = typeof data.target_value === "number" ? data.target_value : null;
  const unit = typeof data.unit === "string" ? data.unit : null;
  const measuredValue = typeof data.value === "number" ? data.value : null;
  const recovery = typeof data.recovery === "number" ? data.recovery : null;
  return { dataNo, targetValue, unit, measuredValue, recovery };
}

function auditDataNo(log: QcAuditLog) {
  return getAuditData(log).dataNo || Number.MAX_SAFE_INTEGER;
}

