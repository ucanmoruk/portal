"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/app/styles/table.module.css";

interface InventoryRow {
  id: number;
  code: string;
  name: string;
  serial_lot_no: string | null;
  intended_use: string;
  uncertainty_component: string | null;
  value_text: string | null;
  uncertainty_value: string | number | null;
  unit: string | null;
  cas_no: string | null;
  limit_info: string | null;
  distribution_type: string;
}

interface InventoryResponse {
  rows: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface InventoryUsageRow {
  id: number;
  code: string;
  title: string;
  method_code: string | null;
  method_name: string | null;
  study_type: string | null;
  status: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  study_date: string | null;
}

const intendedUseOptions = ["Numune Hazırlama", "Standart", "Ana Cihaz"];
const distributionOptions = ["Dikdörtgen", "Normal"];

const emptyForm = {
  code: "",
  name: "",
  serial_lot_no: "",
  intended_use: "Numune Hazırlama",
  uncertainty_component: "",
  value_text: "",
  uncertainty_value: "",
  unit: "",
  cas_no: "",
  limit_info: "",
  distribution_type: "Dikdörtgen",
};

const formatNumber = (value: string | number | null) => {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("tr-TR", { maximumFractionDigits: 6 });
};

const buildPages = (page: number, pageCount: number) => {
  const pages: Array<number | "..."> = [];
  for (let i = 1; i <= pageCount; i += 1) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }
  return pages;
};

export default function InventoryTable() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InventoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [usageTarget, setUsageTarget] = useState<InventoryRow | null>(null);
  const [usageRows, setUsageRows] = useState<InventoryUsageRow[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pages = useMemo(() => buildPages(page, pageCount), [page, pageCount]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/eurolab/inventory?${params.toString()}`, { credentials: "same-origin" });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Eurolab envanter servisi oturum veya bağlantı yanıtı döndürmedi.");
      }
      const json: InventoryResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error || "Envanter kayıtları alınamadı.");
      setRows(json.rows || []);
      setTotal(json.total || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Envanter kayıtları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const openAdd = () => {
    setForm(emptyForm);
    setEditId(null);
    setFormError("");
    setModalMode("add");
    setModalOpen(true);
  };

  const openEdit = (row: InventoryRow) => {
    setForm({
      code: row.code || "",
      name: row.name || "",
      serial_lot_no: row.serial_lot_no || "",
      intended_use: row.intended_use || "Numune Hazırlama",
      uncertainty_component: row.uncertainty_component || "",
      value_text: row.value_text || "",
      uncertainty_value: row.uncertainty_value === null || row.uncertainty_value === undefined ? "" : String(row.uncertainty_value).replace(".", ","),
      unit: row.unit || "",
      cas_no: row.cas_no || "",
      limit_info: row.limit_info || "",
      distribution_type: row.distribution_type || "Dikdörtgen",
    });
    setEditId(row.id);
    setFormError("");
    setModalMode("edit");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setFormError("Kod ve Ad zorunludur.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const url = modalMode === "edit" ? `/api/eurolab/inventory/${editId}` : "/api/eurolab/inventory";
      const method = modalMode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "İşlem tamamlanamadı.");
      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "İşlem tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/eurolab/inventory/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kayıt pasife alınamadı.");
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kayıt pasife alınamadı.");
    } finally {
      setDeleting(false);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportMessage("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/eurolab/inventory/import", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const json: { imported?: number; errors?: string[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error || "Excel içeri aktarılamadı.");
      const warning = json.errors?.length ? ` ${json.errors.length} satır atlandı.` : "";
      setImportMessage(`${json.imported || 0} envanter kaydı içeri aktarıldı.${warning}`);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Excel içeri aktarılamadı.");
    } finally {
      setImporting(false);
    }
  };

  const openUsage = async (row: InventoryRow) => {
    setUsageTarget(row);
    setUsageRows([]);
    setUsageError("");
    setUsageLoading(true);

    try {
      const res = await fetch(`/api/eurolab/inventory/${row.id}/validations`, { credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Validasyon kullanımları alınamadı.");
      setUsageRows(json.rows || []);
    } catch (err: unknown) {
      setUsageError(err instanceof Error ? err.message : "Validasyon kullanımları alınamadı.");
    } finally {
      setUsageLoading(false);
    }
  };

  const typeLabel = (type: string | null) => {
    if (type === "VERIFICATION") return "Verifikasyon";
    if (type === "REVISION") return "Revizyon";
    return "Tam Validasyon";
  };

  const statusLabel = (status: string | null) => {
    if (status === "NEW") return "Yeni";
    if (status === "COMPLETED") return "Tamamlandı";
    if (status === "CANCELLED") return "İptal";
    if (status === "PASSIVE") return "Pasif";
    return "Devam Ediyor";
  };

  const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString("tr-TR") : "—";

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Kod, ad, belirsizlik bileşeni, seri/lot no, değer, CAS no..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => setSearch("")} title="Aramayı temizle">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className={styles.toolbarRight}>
          <span className={styles.totalCount}>{total} kayıt</span>
          <button className={styles.cancelBtn} onClick={() => window.location.assign("/api/eurolab/inventory/import")}>
            Şablon
          </button>
          <label className={styles.cancelBtn} style={{ cursor: importing ? "not-allowed" : "pointer" }}>
            {importing ? "Yükleniyor..." : "Excelden Aktar"}
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={importing} style={{ display: "none" }} />
          </label>
          <select className={styles.pageSizeSelect} value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
            <option value={10}>10 / sayfa</option>
            <option value={20}>20 / sayfa</option>
            <option value={50}>50 / sayfa</option>
            <option value={100}>100 / sayfa</option>
          </select>
          <button className={styles.addBtn} onClick={openAdd}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Yeni Kayıt
          </button>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        {importMessage && <div className={styles.formError} style={{ background: "#ecfdf5", color: "#047857", margin: "12px" }}>{importMessage}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table} style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ width: "6.5%" }}>Kod</th>
                <th style={{ width: "22%" }}>Ad</th>
                <th style={{ width: "12%" }}>Belirsizlik Bileşeni</th>
                <th style={{ width: "8%" }}>Seri/Lot No</th>
                <th style={{ width: "8.5%" }}>Kullanım Amacı</th>
                <th style={{ width: "6.5%" }}>Değer</th>
                <th style={{ width: "6.5%" }}>CAS No</th>
                <th style={{ width: "7.5%" }}>Limit</th>
                <th style={{ width: "7%" }}>Sert. Bel.</th>
                <th style={{ width: "4%" }}>Birim</th>
                <th style={{ width: "6%" }}>Dağılım</th>
                <th style={{ width: 104 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 12 }).map((__, j) => (
                      <td key={j}><div className={styles.skeleton} /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={12}>
                    <div className={styles.empty}>
                      <p>Envanter kaydı bulunamadı.</p>
                    </div>
                  </td>
                </tr>
              ) : rows.map(row => (
                <tr key={row.id}>
                  <td className={styles.tdMono} style={{ color: "var(--color-accent)", fontWeight: 700, overflowWrap: "anywhere" }}>{row.code}</td>
                  <td className={styles.tdName} style={{ whiteSpace: "normal", lineHeight: 1.35 }}>{row.name}</td>
                  <td style={{ whiteSpace: "normal", lineHeight: 1.35 }}>{row.uncertainty_component || "—"}</td>
                  <td className={styles.tdMono} style={{ overflowWrap: "anywhere" }}>{row.serial_lot_no || "—"}</td>
                  <td style={{ whiteSpace: "normal", lineHeight: 1.35 }}>{row.intended_use}</td>
                  <td className={styles.tdMono} style={{ overflowWrap: "anywhere" }}>{row.value_text || "—"}</td>
                  <td className={styles.tdMono} style={{ overflowWrap: "anywhere" }}>{row.cas_no || "—"}</td>
                  <td style={{ whiteSpace: "normal", lineHeight: 1.35 }}>{row.limit_info || "—"}</td>
                  <td className={styles.tdMono}>{formatNumber(row.uncertainty_value)}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{row.unit || "—"}</td>
                  <td style={{ whiteSpace: "normal", lineHeight: 1.35 }}>{row.distribution_type}</td>
                  <td>
                    <div className={styles.actionBtns}>
                      <button className={styles.editBtn} onClick={() => openEdit(row)} title="Düzenle">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                        </svg>
                      </button>
                      <button className={styles.editBtn} onClick={() => openUsage(row)} title="Kullanıldığı validasyonlar">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                          <path fillRule="evenodd" d="M5.5 4a1.5 1.5 0 1 0 0 3h9a1.5 1.5 0 0 0 0-3h-9ZM2.75 5.5A2.75 2.75 0 0 1 5.5 2.75h9a2.75 2.75 0 1 1 0 5.5h-9A2.75 2.75 0 0 1 2.75 5.5Zm2.75 7a1.5 1.5 0 1 0 0 3h9a1.5 1.5 0 0 0 0-3h-9Zm-2.75 1.5a2.75 2.75 0 0 1 2.75-2.75h9a2.75 2.75 0 1 1 0 5.5h-9A2.75 2.75 0 0 1 2.75 14Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button className={styles.deleteBtn} onClick={() => setDeleteTarget(row)} title="Pasife al">
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

        <div className={styles.pagination}>
          <button className={styles.pageBtn} onClick={() => setPage(1)} disabled={page <= 1}>İlk</button>
          <button className={styles.pageBtn} onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1}>‹</button>
          {pages.map((item, index) => item === "..." ? (
            <span key={`dots-${index}`} className={styles.pageDots}>...</span>
          ) : (
            <button
              key={item}
              className={`${styles.pageBtn} ${item === page ? styles.pageBtnActive : ""}`}
              onClick={() => setPage(item)}
            >
              {item}
            </button>
          ))}
          <button className={styles.pageBtn} onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>›</button>
          <button className={styles.pageBtn} onClick={() => setPage(pageCount)} disabled={page >= pageCount}>Son</button>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal} style={{ maxWidth: 700 }}>
            <div className={styles.modalHeader}>
              <h2>{modalMode === "add" ? "Yeni Envanter Kaydı" : "Envanter Kaydını Düzenle"}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)} title="Kapat">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid3}>
                <div className={styles.formGroup}>
                  <label>Kullanım Amacı</label>
                  <select value={form.intended_use} onChange={e => setForm({ ...form, intended_use: e.target.value })}>
                    {intendedUseOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Kod <span className={styles.required}>*</span></label>
                  <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Örn: STD-001" />
                </div>
                <div className={styles.formGroup}>
                  <label>Ad <span className={styles.required}>*</span></label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Örn: DBP Standart Çözeltisi" />
                </div>
                <div className={styles.formGroup}>
                  <label>Seri/Lot No</label>
                  <input value={form.serial_lot_no} onChange={e => setForm({ ...form, serial_lot_no: e.target.value })} placeholder="Seri veya lot numarası" />
                </div>
                <div className={styles.formGroup}>
                  <label>CAS No</label>
                  <input value={form.cas_no} onChange={e => setForm({ ...form, cas_no: e.target.value })} placeholder={form.intended_use === "Standart" ? "Örn: 84-74-2" : "Standart seçildiğinde kullanılır"} disabled={form.intended_use !== "Standart"} />
                </div>
                <div className={styles.formGroup}>
                  <label>Limit</label>
                  <input value={form.limit_info} onChange={e => setForm({ ...form, limit_info: e.target.value })} placeholder={form.intended_use === "Standart" ? "Örn: ≤ 1000 ppm" : "Standart seçildiğinde kullanılır"} disabled={form.intended_use !== "Standart"} />
                </div>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}>
                  <label>Belirsizlik Bileşeni</label>
                  <input value={form.uncertainty_component} onChange={e => setForm({ ...form, uncertainty_component: e.target.value })} placeholder="Örn: Standart sertifika belirsizliği" />
                </div>
                <div className={styles.formGroup}>
                  <label>Dağılım Türü</label>
                  <select value={form.distribution_type} onChange={e => setForm({ ...form, distribution_type: e.target.value })}>
                    {distributionOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Değer</label>
                  <input value={form.value_text} onChange={e => setForm({ ...form, value_text: e.target.value })} placeholder="Örn: 1000 ppm" />
                </div>
                <div className={styles.formGroup}>
                  <label>Birim</label>
                  <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Örn: mg/L" />
                </div>
                <div className={styles.formGroup}>
                  <label>Sertifika Belirsizlik Değeri</label>
                  <input value={form.uncertainty_value} onChange={e => setForm({ ...form, uncertainty_value: e.target.value })} placeholder="Örn: 0,025" inputMode="decimal" />
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setModalOpen(false)}>İptal</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? "..." : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className={`${styles.modal} ${styles.modalSm}`}>
            <div className={styles.modalHeader}>
              <h2>Pasife Al</h2>
              <button className={styles.modalClose} onClick={() => setDeleteTarget(null)} title="Kapat">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.deleteWarning}>
                <b>{deleteTarget.code} - {deleteTarget.name}</b> kaydı pasife alınsın mı?
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>Hayır</button>
              <button className={styles.deleteBtnPrimary} onClick={handleDelete} disabled={deleting}>{deleting ? "..." : "Evet"}</button>
            </div>
          </div>
        </div>
      )}

      {usageTarget && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setUsageTarget(null)}>
          <div className={styles.modal} style={{ maxWidth: 920 }}>
            <div className={styles.modalHeader}>
              <div>
                <h2>Kullanıldığı Validasyonlar</h2>
                <p style={{ margin: "5px 0 0", color: "var(--color-text-secondary)", fontSize: "0.82rem" }}>
                  {usageTarget.code} - {usageTarget.name}
                </p>
              </div>
              <button className={styles.modalClose} onClick={() => setUsageTarget(null)} title="Kapat">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              {usageError && <div className={styles.formError}>{usageError}</div>}
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Kod</th>
                      <th>Validasyon</th>
                      <th style={{ width: 150 }}>Metot</th>
                      <th style={{ width: 130 }}>Tür</th>
                      <th style={{ width: 120 }}>Durum</th>
                      <th style={{ width: 150 }}>Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 6 }).map((__, j) => <td key={j}><div className={styles.skeleton} /></td>)}
                        </tr>
                      ))
                    ) : usageRows.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <div className={styles.empty} style={{ padding: "36px 24px" }}>
                            <p>Bu envanter kaydının kullanıldığı validasyon bulunamadı.</p>
                          </div>
                        </td>
                      </tr>
                    ) : usageRows.map(row => (
                      <tr key={row.id}>
                        <td className={styles.tdMono}>{row.code}</td>
                        <td className={styles.tdName}>{row.title}</td>
                        <td>{row.method_code || row.method_name || "—"}</td>
                        <td>{typeLabel(row.study_type)}</td>
                        <td>{statusLabel(row.status)}</td>
                        <td className={styles.tdMono}>
                          {row.planned_start_date || row.planned_end_date
                            ? `${formatDate(row.planned_start_date)} - ${formatDate(row.planned_end_date)}`
                            : formatDate(row.study_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setUsageTarget(null)}>Kapat</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
