"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Save, Trash2, X } from "lucide-react";
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

const parseDecimal = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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
  const [form, setForm] = useState({ analyst: "", value: "", target_value: "", measured_at: "" });
  const [editForm, setEditForm] = useState({ label: "", analyst: "", value: "", recovery: "", target_value: "", measured_at: "" });

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

  const selectablePersonnel = useMemo(() => {
    const fromPoints = (activeComponent?.points || []).map(point => point.analyst || "").filter(Boolean);
    return Array.from(new Set([...personnelOptions, ...fromPoints])).sort((left, right) => left.localeCompare(right, "tr-TR"));
  }, [activeComponent, personnelOptions]);

  const addPoint = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cardId || !activeComponent) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/eurolab/qc-cards/${cardId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...form, component_card_id: activeComponent.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Veri eklenemedi.");
      setCard(json);
      setForm({ analyst: "", value: "", target_value: "", measured_at: "" });
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Veri eklenemedi."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (point: QcPoint) => {
    setEditingId(point.id);
    setEditForm({
      label: point.label || "",
      analyst: point.analyst || "",
      value: point.value == null ? "" : String(point.value),
      recovery: String(point.recovery),
      target_value: point.target_value == null ? "" : String(point.target_value),
      measured_at: point.measured_at ? point.measured_at.slice(0, 10) : "",
    });
  };

  const updatePoint = async (pointId: number) => {
    if (!cardId || !activeComponent) return;
    setWorkingPointId(pointId);
    setError("");
    try {
      const res = await fetch(`/api/eurolab/qc-cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...editForm, point_id: pointId, component_card_id: activeComponent.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Veri güncellenemedi.");
      setCard(json);
      setEditingId(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Veri güncellenemedi."));
    } finally {
      setWorkingPointId(null);
    }
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
    <div className={styles.page} style={{ maxWidth: "none", width: "100%", gap: 12 }}>
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

      <div className={styles.tableCard}>
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
              <div style={{ width: "100%", height: "clamp(220px, 32vh, 300px)" }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                    <XAxis dataKey="no" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
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
        <div className={styles.tableCard}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border-light)" }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Yeni Veri</h2>
          </div>
          <form onSubmit={addPoint} className={styles.modalBody} style={{ padding: 14 }}>
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
                <label>Geri Kazanım (%)</label>
                <input value={Number.isFinite(formRecovery) ? formatNumber(formRecovery, 3) : ""} readOnly placeholder="Otomatik hesaplanır" />
              </div>
              <div className={styles.formGroup} style={{ justifyContent: "flex-end" }}>
                <button className={styles.saveBtn} type="submit" disabled={saving}>
                  {saving ? <span className={styles.loader} /> : <><Plus size={15} /> Ekle</>}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {card && activeComponent && (
        <div className={styles.tableCard}>
          <div className={styles.tableWrapper} style={{ maxHeight: "34vh", overflow: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Sıra No</th>
                  <th style={{ width: 130 }}>Değerler</th>
                  <th style={{ width: 110 }}>Xort</th>
                  <th style={{ width: 110 }}>SS</th>
                  <th style={{ width: 130 }}>AUL (Ort-2*ss)</th>
                  <th style={{ width: 130 }}>ÜUL (Ort+2*ss)</th>
                  <th style={{ width: 130 }}>AKL (Ort-3*s)</th>
                  <th style={{ width: 130 }}>ÜKL (Ort+3*s)</th>
                  <th style={{ width: 120 }}>Alt Yasal Limit</th>
                  <th style={{ width: 120 }}>Üst Yasal Limit</th>
                  <th style={{ width: 130 }}>Tarih</th>
                  <th style={{ width: 160 }}>Personel</th>
                  <th style={{ width: 130 }}>Kaynak</th>
                  <th style={{ width: 96 }}></th>
                </tr>
              </thead>
              <tbody>
                {activeComponent.points.length === 0 ? (
                  <tr><td colSpan={14}><div className={styles.empty}>Veri bulunamadı.</div></td></tr>
                ) : activeComponent.points.map(point => (
                  <tr key={point.id}>
                    <td className={styles.tdMono}>{point.sequence_no}</td>
                    <td className={styles.tdMono}>{`${formatNumber(point.recovery)}%`}</td>
                    <td className={styles.tdMono}>{formatNumber(activeComponent.center_line)}</td>
                    <td className={styles.tdMono}>{formatNumber(activeComponent.standard_deviation, 4)}</td>
                    <td className={styles.tdMono}>{formatNumber(activeComponent.lower_warning_limit)}</td>
                    <td className={styles.tdMono}>{formatNumber(activeComponent.upper_warning_limit)}</td>
                    <td className={styles.tdMono}>{formatNumber(activeComponent.lower_control_limit)}</td>
                    <td className={styles.tdMono}>{formatNumber(activeComponent.upper_control_limit)}</td>
                    <td className={styles.tdMono}>{formatNumber(activeComponent.lower_legal_limit)}</td>
                    <td className={styles.tdMono}>{formatNumber(activeComponent.upper_legal_limit)}</td>
                    <td className={styles.tdMono}>
                      {formatDate(point.measured_at || point.created_at)}
                    </td>
                    <td>{point.analyst || "-"}</td>
                    <td>
                      <span className={`${styles.badge} ${point.locked ? styles.badgeGray : styles.badgeGreen}`}>
                        {pointSourceLabel(point)}
                      </span>
                    </td>
                    
                    <td>
                      {!point.locked && (
                        <div className={styles.actionBtns}>
                          {editingId === point.id ? (
                            <>
                              <button className={styles.editBtn} title="Kaydet" onClick={() => updatePoint(point.id)} disabled={workingPointId === point.id}>
                                <Save size={14} />
                              </button>
                              <button className={styles.deleteBtn} title="Vazgeç" onClick={() => setEditingId(null)} disabled={workingPointId === point.id}>
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button className={styles.editBtn} title="Düzenle" onClick={() => startEdit(point)} disabled={workingPointId === point.id}>
                                <Pencil size={14} />
                              </button>
                              <button className={styles.deleteBtn} title="Sil" onClick={() => deletePoint(point.id)} disabled={workingPointId === point.id}>
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {card && activeComponent && (
        <div className={styles.tableCard}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border-light)" }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>İşlem İzi</h2>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Tarih</th>
                  <th style={{ width: 150 }}>İşlem</th>
                  <th style={{ width: 120 }}>Satır</th>
                  <th>Özet</th>
                </tr>
              </thead>
              <tbody>
                {activeComponent.audit_logs.length === 0 ? (
                  <tr><td colSpan={4}><div className={styles.empty}>İşlem izi bulunamadı.</div></td></tr>
                ) : activeComponent.audit_logs.map(log => (
                  <tr key={log.id}>
                    <td className={styles.tdMono}>{formatDate(log.created_at)}</td>
                    <td>{auditLabel(log.action)}</td>
                    <td className={styles.tdMono}>{log.point_id || "-"}</td>
                    <td className={styles.tdSecondary}>{auditSummary(log)}</td>
                  </tr>
                ))}
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

const auditLabel = (action: string) => {
  if (action === "CREATE_POINT") return "Satır eklendi";
  if (action === "UPDATE_POINT") return "Satır düzenlendi";
  if (action === "DELETE_POINT") return "Satır silindi";
  return action;
};

const auditSummary = (log: QcAuditLog) => {
  const after = log.after_data || log.before_data || {};
  const label = typeof after.label === "string" && after.label ? after.label : "Etiketsiz veri";
  const target = typeof after.target_value === "number" ? formatNumber(after.target_value) : "-";
  const measured = typeof after.value === "number" ? formatNumber(after.value) : "-";
  const recovery = typeof after.recovery === "number" ? `${formatNumber(after.recovery)}%` : "-";
  return `${label} · Hedef: ${target} · Ölçülen: ${measured} · Geri kazanım: ${recovery}`;
};
