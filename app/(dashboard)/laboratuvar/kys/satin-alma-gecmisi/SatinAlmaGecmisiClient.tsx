"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type PurchaseRow = {
  id: number;
  stokId: number | null;
  stokKod: string;
  malzemeAdi: string;
  talepId: number;
  talepNo: string;
  miktar: number;
  birim: string;
  tedarikci: string;
  tedarikciId: number | null;
  satinAlmaTarihi: string | null;
  birimFiyat: number | null;
  paraBirimi: string;
  toplamTutar: number | null;
  faturaNo: string;
  satinAlanAd: string;
};

type Supplier = { ID: number; Ad: string; Durum?: string };

function dateFmt(value: string | null) {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function money(value: number | null, currency: string) {
  if (value == null) return "-";
  return `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency || "TRY"}`;
}

export default function SatinAlmaGecmisiClient() {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<PurchaseRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ tedarikciId: "", satinAlmaTarihi: "", faturaNo: "", birimFiyat: "", paraBirimi: "TRY", toplamTutar: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search, page: String(page), limit: "25" });
      const response = await fetch(`/api/kys/satin-almalar?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Satın alma geçmişi alınamadı.");
      setRows(json.data || []);
      setTotal(Number(json.total || 0));
      setTotalPages(Number(json.totalPages || 1));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Satın alma geçmişi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/kys/tedarikciler").then(response => response.json()).then(json => setSuppliers(json.data || [])).catch(() => {});
  }, []);

  function openEdit(row: PurchaseRow) {
    setEditing(row);
    setFormError("");
    setForm({
      tedarikciId: row.tedarikciId ? String(row.tedarikciId) : "",
      satinAlmaTarihi: row.satinAlmaTarihi || "",
      faturaNo: row.faturaNo || "",
      birimFiyat: row.birimFiyat == null ? "" : String(row.birimFiyat),
      paraBirimi: row.paraBirimi || "TRY",
      toplamTutar: row.toplamTutar == null ? "" : String(row.toplamTutar),
    });
  }

  async function savePurchase() {
    if (!editing || saving) return;
    setSaving(true); setFormError("");
    try {
      const response = await fetch("/api/kys/satin-almalar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...form }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Satın alma kaydı güncellenemedi.");
      setEditing(null); await load();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Satın alma kaydı güncellenemedi.");
    } finally { setSaving(false); }
  }

  function onSearch(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPage(1), 250);
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>⌕</span>
            <input className={styles.searchInput} value={search} onChange={event => onSearch(event.target.value)} placeholder="Stok kodu, malzeme, tedarikçi, talep veya fatura ara..." />
          </div>
          <span className={styles.totalCount}>{total} satın alma kaydı</span>
        </div>
      </div>
      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table} style={{ fontSize: 11, tableLayout: "fixed", width: "100%" }}>
            <thead><tr><th>Tarih</th><th style={{ width: "20%" }}>Stok / Malzeme</th><th>Tedarikçi</th><th>Miktar</th><th>Fatura no</th><th>Birim fiyat</th><th>Para</th><th>Toplam</th><th>Talep</th><th aria-label="İşlemler"></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={10}><div className={styles.skeleton} /></td></tr> : rows.length === 0 ? (
                <tr><td colSpan={10}><div className={styles.empty}>Satın alma kaydı bulunamadı.</div></td></tr>
              ) : rows.map(row => (
                <tr key={row.id}>
                  <td>{dateFmt(row.satinAlmaTarihi)}</td>
                  <td><div className={styles.tdName}>{row.malzemeAdi}</div>{row.stokId ? <Link href={`/laboratuvar/kys/stok-listesi/${row.stokId}`} className={styles.tdMono}>{row.stokKod || `#${row.stokId}`}</Link> : <span className={styles.tdMono}>{row.stokKod || "-"}</span>}</td>
                  <td>{row.tedarikci || "-"}</td>
                  <td>{row.miktar.toLocaleString("tr-TR")} {row.birim}</td>
                  <td className={styles.tdMono}>{row.faturaNo || "-"}</td>
                  <td>{money(row.birimFiyat, row.paraBirimi)}</td>
                  <td>{row.paraBirimi || "TRY"}</td>
                  <td><strong>{money(row.toplamTutar, row.paraBirimi)}</strong></td>
                  <td><Link className={kys.purchaseLink} href={`/laboratuvar/kys/talep-listesi/${row.talepId}`}>{row.talepNo}</Link></td>
                  <td><button type="button" className={`${styles.editBtn} ${kys.iconButton}`} title="Satın alma bilgilerini düzenle" aria-label={`${row.malzemeAdi} satın alma bilgilerini düzenle`} onClick={() => openEdit(row)}><Pencil size={15} aria-hidden="true" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(current => current - 1)}>‹</button>
          <span className={styles.pageInfo}>Sayfa {page} / {totalPages}</span>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>›</button>
        </div>
      </div>
      {editing && <div className={styles.modalOverlay}><div className={styles.modal} style={{ maxWidth: 760 }} role="dialog" aria-modal="true" aria-labelledby="purchase-edit-title">
        <div className={styles.modalHeader}><h2 id="purchase-edit-title">Satın alma bilgilerini düzenle</h2><button className={styles.modalClose} disabled={saving} onClick={() => setEditing(null)} aria-label="Kapat">×</button></div>
        <div className={styles.modalBody}>
          {formError && <div className={styles.formError} role="alert">{formError}</div>}
          <div className={styles.formGrid3}>
            <div className={styles.formGroup}><label>Tedarikçi</label><select value={form.tedarikciId} onChange={event => setForm(current => ({ ...current, tedarikciId: event.target.value }))}><option value="">Seçilmedi</option>{editing.tedarikciId && !suppliers.some(item => item.ID === editing.tedarikciId) && <option value={editing.tedarikciId}>{editing.tedarikci} (pasif)</option>}{suppliers.map(item => <option key={item.ID} value={item.ID}>{item.Ad}</option>)}</select></div>
            <div className={styles.formGroup}><label>Satın alma tarihi</label><input type="date" value={form.satinAlmaTarihi} onChange={event => setForm(current => ({ ...current, satinAlmaTarihi: event.target.value }))} /></div>
            <div className={styles.formGroup}><label>Fatura no</label><input value={form.faturaNo} onChange={event => setForm(current => ({ ...current, faturaNo: event.target.value }))} /></div>
            <div className={styles.formGroup}><label>Birim fiyat</label><input inputMode="decimal" value={form.birimFiyat} onChange={event => setForm(current => ({ ...current, birimFiyat: event.target.value }))} /></div>
            <div className={styles.formGroup}><label>Para birimi</label><select value={form.paraBirimi} onChange={event => setForm(current => ({ ...current, paraBirimi: event.target.value }))}><option>TRY</option><option>EUR</option><option>USD</option><option>GBP</option></select></div>
            <div className={styles.formGroup}><label>Toplam tutar</label><input inputMode="decimal" value={form.toplamTutar} placeholder="Boşsa otomatik hesaplanır" onChange={event => setForm(current => ({ ...current, toplamTutar: event.target.value }))} /></div>
          </div>
        </div>
        <div className={styles.modalFooter}><button className={styles.cancelBtn} disabled={saving} onClick={() => setEditing(null)}>Vazgeç</button><button className={styles.saveBtn} disabled={saving} onClick={savePurchase}>{saving ? "Kaydediliyor…" : "Kaydet"}</button></div>
      </div></div>}
    </>
  );
}
