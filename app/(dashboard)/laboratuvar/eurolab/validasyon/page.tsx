"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import styles from "@/app/styles/table.module.css";

interface ValidationRow {
  id: number;
  code: string;
  method_code: string;
  method_name: string;
  technique: string;
  study_type: string;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  study_date: string | null;
}

type QcCardGroupRow = {
  id: number;
  card_type: string;
};

const statusLabel = (status: string) => {
  if (status === "NEW") return "Yeni";
  if (status === "COMPLETED") return "Tamamlandı";
  if (status === "APPROVED") return "Onaylandı";
  if (status === "CANCELLED") return "İptal";
  if (status === "PASSIVE") return "Pasif";
  return "Devam Ediyor";
};

const statusTone = (status: string) => {
  if (status === "NEW") return "bg-slate-100 text-slate-700 hover:bg-slate-100";
  if (status === "COMPLETED") return "bg-green-100 text-green-700 hover:bg-green-100";
  if (status === "CANCELLED") return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  if (status === "PASSIVE") return "bg-zinc-100 text-zinc-500 hover:bg-zinc-100";
  return "bg-blue-100 text-blue-700 hover:bg-blue-100";
};

const statusFlow = ["NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

const nextStatus = (status: string) => {
  const index = statusFlow.indexOf(status);
  return statusFlow[(index + 1) % statusFlow.length] || "NEW";
};

const typeLabel = (type: string) => {
  if (type === "VERIFICATION") return "Verifikasyon";
  if (type === "REVISION") return "Revizyon";
  return "Tam Validasyon";
};

const formatDate = (date: string | null) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("tr-TR");
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const displayValidationCode = (row: ValidationRow) => `${row.method_code || row.code || `VAL-${row.id}`}-Ek.1`;

const sortByValidationCode = (items: ValidationRow[]) =>
  [...items].sort((left, right) => displayValidationCode(left).localeCompare(displayValidationCode(right), "tr-TR", {
    numeric: true,
    sensitivity: "base",
  }));

export default function ValidationDashboard() {
  const router = useRouter();
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [qcDialogRow, setQcDialogRow] = useState<ValidationRow | null>(null);
  const [creatingQcId, setCreatingQcId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadValidations() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/eurolab/validations", { credentials: "same-origin" });
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("Validasyon servisi oturum veya bağlantı yanıtı döndürmedi.");
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Validasyon kayıtları alınamadı.");
        if (alive) setRows(Array.isArray(json) ? sortByValidationCode(json.filter(row => row.status !== "PASSIVE")) : []);
      } catch (err: unknown) {
        if (alive) setError(getErrorMessage(err, "Validasyon kayıtları alınamadı."));
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadValidations();
    return () => {
      alive = false;
    };
  }, []);

  const updateStatus = async (row: ValidationRow, status: string) => {
    const previousRows = rows;
    setUpdatingId(row.id);
    setRows(current => current.map(item => item.id === row.id ? { ...item, status } : item));
    setError("");

    try {
      const res = await fetch(`/api/eurolab/validations/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Durum güncellenemedi.");
    } catch (err: unknown) {
      setRows(previousRows);
      setError(getErrorMessage(err, "Durum güncellenemedi."));
    } finally {
      setUpdatingId(null);
    }
  };

  const markPassive = async (row: ValidationRow) => {
    const previousRows = rows;
    setUpdatingId(row.id);
    setRows(current => current.filter(item => item.id !== row.id));
    setError("");

    try {
      const res = await fetch(`/api/eurolab/validations/${row.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Validasyon pasife alınamadı.");
    } catch (err: unknown) {
      setRows(previousRows);
      setError(getErrorMessage(err, "Validasyon pasife alınamadı."));
    } finally {
      setUpdatingId(null);
    }
  };

  const createRangeCard = async (row: ValidationRow) => {
    setCreatingQcId(row.id);
    setError("");

    try {
      const res = await fetch("/api/eurolab/qc-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ validation_id: row.id, card_type: "RANGE" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Range kart oluşturulamadı.");
      setQcDialogRow(null);
      router.push(`/laboratuvar/eurolab/qc-kartlar/${json.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Range kart oluşturulamadı."));
    } finally {
      setCreatingQcId(null);
    }
  };

  const openQcCardDialogOrExisting = async (row: ValidationRow) => {
    setCreatingQcId(row.id);
    setError("");
    try {
      const res = await fetch(`/api/eurolab/qc-cards?validation_id=${row.id}`, { credentials: "same-origin" });
      const json: QcCardGroupRow[] & { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error || "QC kart kontrol edilemedi.");
      const existing = Array.isArray(json) ? json.find(card => card.card_type === "RANGE") || json[0] : null;
      if (existing) {
        router.push(`/laboratuvar/eurolab/qc-kartlar/${existing.id}`);
        return;
      }
      setQcDialogRow(row);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "QC kart kontrol edilemedi."));
    } finally {
      setCreatingQcId(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Validasyon</h1>
          <p className={styles.pageSubtitle}>Eurolab metot validasyon ve verifikasyon kayıtları.</p>
        </div>
        <div className={styles.toolbarRight}>
          <Link href="/laboratuvar/eurolab/validasyon/yeni">
            <button className={styles.addBtn}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              Yeni Validasyon
            </button>
          </Link>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.totalCount}>{rows.length} validasyon</span>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>Kod</th>
                <th>Analiz adı</th>
                <th style={{ width: 150 }}>Metot</th>
                <th style={{ width: 150 }}>Tür</th>
                <th style={{ width: 150 }}>Durum</th>
                <th style={{ width: 190 }}>Tarih</th>
                <th style={{ width: 154 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><div className={styles.skeleton} /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.empty}>
                      <p>Validasyon kaydı bulunamadı.</p>
                    </div>
                  </td>
                </tr>
              ) : rows.map(row => (
                <tr key={row.id}>
                  <td className={styles.tdMono}>
                    <Link className="text-blue-600 hover:underline font-semibold" href={`/laboratuvar/eurolab/validasyon/${row.id}`}>
                      {displayValidationCode(row)}
                    </Link>
                  </td>
                  <td className={styles.tdName}>{row.method_name || "—"}</td>
                  <td>{row.technique || row.method_code || "—"}</td>
                  <td>{typeLabel(row.study_type)}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => row.status !== "PASSIVE" && updateStatus(row, nextStatus(row.status))}
                      disabled={updatingId === row.id || row.status === "PASSIVE"}
                      title={row.status === "PASSIVE" ? "Pasif kayıt" : "Durumu değiştir"}
                      style={{ border: 0, background: "transparent", padding: 0, cursor: row.status === "PASSIVE" ? "default" : "pointer" }}
                    >
                      <Badge className={statusTone(row.status)}>
                        {statusLabel(row.status)}
                      </Badge>
                    </button>
                  </td>
                  <td className={styles.tdMono}>
                    {row.planned_start_date || row.planned_end_date
                      ? `${formatDate(row.planned_start_date)} - ${formatDate(row.planned_end_date)}`
                      : formatDate(row.study_date)}
                  </td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className={styles.editBtn} onClick={() => openQcCardDialogOrExisting(row)} disabled={creatingQcId === row.id} title="QC kartı">
                        {creatingQcId === row.id ? <span className={styles.loader} style={{ width: 13, height: 13 }} /> : <BarChart3 size={14} />}
                      </button>
                      <Link href={`/laboratuvar/eurolab/validasyon/${row.id}`}>
                        <button className={styles.editBtn} title="Düzenle">
                          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                            <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                          </svg>
                        </button>
                      </Link>
                      <Link href={`/laboratuvar/eurolab/validasyon/${row.id}/rapor`}>
                        <button className={styles.editBtn} title="Rapor yazdır">
                          <Printer size={14} />
                        </button>
                      </Link>
                      <button className={styles.deleteBtn} onClick={() => markPassive(row)} disabled={updatingId === row.id || row.status === "PASSIVE"} title="Pasife al">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {qcDialogRow && (
        <div className={styles.modalOverlay} onClick={() => setQcDialogRow(null)}>
          <div className={`${styles.modal} ${styles.modalSm}`} onClick={event => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>QC Kartı Oluştur</h2>
              <button className={styles.modalClose} onClick={() => setQcDialogRow(null)} aria-label="Kapat">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ margin: "0 0 14px", color: "var(--color-text-secondary)", fontSize: "0.86rem", lineHeight: 1.5 }}>
                {qcDialogRow.code || `VAL-${qcDialogRow.id}`} validasyonu için kart tipini seçin.
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                <button className={styles.saveBtn} style={{ width: "100%", height: 42 }} onClick={() => createRangeCard(qcDialogRow)} disabled={creatingQcId === qcDialogRow.id}>
                  {creatingQcId === qcDialogRow.id ? <span className={styles.loader} /> : "Range Kart"}
                </button>
                <button className={styles.cancelBtn} style={{ width: "100%", height: 42 }} disabled title="Sonraki aşamada eklenecek">
                  X Kart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
