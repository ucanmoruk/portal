"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type RequestRow = {
  id: number;
  talepNo: string;
  talepTuru: string;
  durum: string;
  olusturanAd: string;
  olusturmaTarihi: string | null;
  onaylayanAd: string;
  onayTarihi: string | null;
  islemeAlanAd: string;
  islemeAlmaTarihi: string | null;
  kalemSayisi: number;
};
type Stock = { id: number; kod: string; ad: string; birim: string; ozellik: string };
const errorMessage = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

const emptyItem = { stokId: "", kod: "", malzemeAdi: "", miktar: "1", birim: "Adet", ozellik: "", marka: "", kullaniciNotu: "" };

function dateFmt(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value).slice(0, 10);
}

function statusClass(status: string) {
  if (status === "Tamamlandı") return kys.pillOk;
  if (status === "Kısmi Kabul" || status === "İşleme Alındı") return kys.pillWarn;
  return kys.pill;
}

const pageNums = (page: number, totalPages: number) => {
  const nums: Array<number | "..."> = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return nums;
};

export default function TalepListesiClient() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [search, setSearch] = useState("");
  const [durum, setDurum] = useState("");
  const [tur, setTur] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [stockSearch, setStockSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ talepTuru: "Sarf", notlar: "", teknikSartname: "", kalemler: [{ ...emptyItem }] });
  const pages = useMemo(() => pageNums(page, totalPages), [page, totalPages]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ search, durum, tur, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/kys/talepler?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Talep listesi alınamadı.");
      setRows(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e: unknown) {
      setError(errorMessage(e, "Talep listesi alınamadı."));
    } finally {
      setLoading(false);
    }
  }, [durum, limit, page, search, tur]);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => {
    const qs = new URLSearchParams({ search: stockSearch, limit: "25" });
    fetch(`/api/kys/stoklar?${qs.toString()}`).then(r => r.json()).then(j => setStocks(j.data || [])).catch(() => {});
  }, [stockSearch]);

  function pickStock(index: number, stockId: string) {
    const stock = stocks.find(s => String(s.id) === stockId);
    setForm(f => {
      const items = [...f.kalemler];
      items[index] = {
        ...items[index],
        stokId: stockId,
        kod: stock?.kod || items[index].kod,
        malzemeAdi: stock?.ad || items[index].malzemeAdi,
        birim: stock?.birim || items[index].birim,
        ozellik: stock?.ozellik || items[index].ozellik,
      };
      return { ...f, kalemler: items };
    });
  }

  async function save() {
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        ...form,
        kalemler: form.kalemler.map(k => ({ ...k, stokId: k.stokId ? Number(k.stokId) : null })),
      };
      const res = await fetch("/api/kys/talepler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Talep oluşturulamadı.");
      setModalOpen(false);
      setForm({ talepTuru: "Sarf", notlar: "", teknikSartname: "", kalemler: [{ ...emptyItem }] });
      fetchRows();
    } catch (e: unknown) {
      setFormError(errorMessage(e, "Talep oluşturulamadı."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}><input className={styles.searchInput} placeholder="Talep no, oluşturan veya not ara..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
          <span className={styles.totalCount}>{total} talep</span>
        </div>
        <div className={styles.toolbarRight}><button className={styles.addBtn} onClick={() => setModalOpen(true)}>+ Talep oluştur</button></div>
      </div>
      <div className={kys.filterRow}>
        <select className={kys.select} value={tur} onChange={e => { setTur(e.target.value); setPage(1); }}><option value="">Tüm türler</option><option>Sarf</option><option>Cihaz</option></select>
        <select className={kys.select} value={durum} onChange={e => { setDurum(e.target.value); setPage(1); }}><option value="">Tüm durumlar</option><option>Onay Bekliyor</option><option>Onaylandı</option><option>İşleme Alındı</option><option>Kısmi Kabul</option><option>Tamamlandı</option><option>İptal</option></select>
        <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / sayfa</option>)}</select>
      </div>
      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead><tr><th>Talep no</th><th>Tür</th><th>Durum</th><th>Kalem</th><th>Oluşturan</th><th>Onaylayan</th><th>İşleme alan</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8}><div className={styles.skeleton} /></td></tr> : rows.length === 0 ? <tr><td colSpan={8}><div className={styles.empty}>Talep bulunamadı.</div></td></tr> : rows.map(row => (
                <tr key={row.id}>
                  <td className={styles.tdMono}>{row.talepNo}</td>
                  <td>{row.talepTuru}</td>
                  <td><span className={`${kys.pill} ${statusClass(row.durum)}`}>{row.durum}</span></td>
                  <td>{row.kalemSayisi}</td>
                  <td>{row.olusturanAd || "-"}<div className={kys.muted}>{dateFmt(row.olusturmaTarihi)}</div></td>
                  <td>{row.onaylayanAd || "-"}<div className={kys.muted}>{dateFmt(row.onayTarihi)}</div></td>
                  <td>{row.islemeAlanAd || "-"}<div className={kys.muted}>{dateFmt(row.islemeAlmaTarihi)}</div></td>
                  <td><Link className={styles.editBtn} href={`/laboratuvar/kys/talep-listesi/${row.id}`}>i</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          {pages.map((p, i) => p === "..." ? <span className={styles.pageDots} key={i}>...</span> : <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`} onClick={() => setPage(p)}>{p}</button>)}
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 980 }}>
            <div className={styles.modalHeader}><h2>Satın alma talebi</h2><button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button></div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid}>
                <div className={styles.formGroup}><label>Talep türü</label><select value={form.talepTuru} onChange={e => setForm(f => ({ ...f, talepTuru: e.target.value }))}><option>Sarf</option><option>Cihaz</option></select></div>
                <div className={styles.formGroup}><label>Stok ara</label><input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="Stoktan seçmek için ara..." /></div>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Not</label><textarea rows={2} value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} /></div>
                {form.talepTuru === "Cihaz" && <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Teknik şartname</label><textarea rows={5} value={form.teknikSartname} onChange={e => setForm(f => ({ ...f, teknikSartname: e.target.value }))} /></div>}
              </div>
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {form.kalemler.map((item, index) => (
                  <div key={index} className={styles.formGrid3} style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 10 }}>
                    <div className={styles.formGroup}><label>Stok</label><select value={item.stokId} onChange={e => pickStock(index, e.target.value)}><option value="">Manuel</option>{stocks.map(s => <option key={s.id} value={s.id}>{s.kod} - {s.ad}</option>)}</select></div>
                    <div className={styles.formGroup}><label>Kod</label><input value={item.kod} onChange={e => setForm(f => { const a = [...f.kalemler]; a[index] = { ...a[index], kod: e.target.value }; return { ...f, kalemler: a }; })} /></div>
                    <div className={styles.formGroup}><label>Malzeme adı</label><input value={item.malzemeAdi} onChange={e => setForm(f => { const a = [...f.kalemler]; a[index] = { ...a[index], malzemeAdi: e.target.value }; return { ...f, kalemler: a }; })} /></div>
                    <div className={styles.formGroup}><label>Miktar</label><input value={item.miktar} onChange={e => setForm(f => { const a = [...f.kalemler]; a[index] = { ...a[index], miktar: e.target.value }; return { ...f, kalemler: a }; })} /></div>
                    <div className={styles.formGroup}><label>Birim</label><input value={item.birim} onChange={e => setForm(f => { const a = [...f.kalemler]; a[index] = { ...a[index], birim: e.target.value }; return { ...f, kalemler: a }; })} /></div>
                    <div className={styles.formGroup}><label>Marka</label><input value={item.marka} onChange={e => setForm(f => { const a = [...f.kalemler]; a[index] = { ...a[index], marka: e.target.value }; return { ...f, kalemler: a }; })} /></div>
                    <div className={`${styles.formGroup} ${styles.colSpan3}`}><label>Kullanıcı notu / özellik</label><textarea rows={2} value={item.kullaniciNotu || item.ozellik} onChange={e => setForm(f => { const a = [...f.kalemler]; a[index] = { ...a[index], kullaniciNotu: e.target.value }; return { ...f, kalemler: a }; })} /></div>
                  </div>
                ))}
                <button className={styles.cancelBtn} type="button" onClick={() => setForm(f => ({ ...f, kalemler: [...f.kalemler, { ...emptyItem }] }))}>+ Kalem ekle</button>
              </div>
            </div>
            <div className={styles.modalFooter}><button className={styles.cancelBtn} onClick={() => setModalOpen(false)}>Vazgeç</button><button className={styles.saveBtn} disabled={saving} onClick={save}>{saving ? "Oluşturuluyor..." : "Talep oluştur"}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
