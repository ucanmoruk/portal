"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";
import KysStockPicker from "./KysStockPicker";
import { KYS_REQUEST_TYPES } from "@/lib/kysRequestRules";

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

const emptyItem = { stokId: "", kod: "", malzemeAdi: "", miktar: "1", birim: "Adet", ozellik: "" };

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
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ talepTuru: "Stok Malzeme", notlar: "", teknikSartname: "", kalemler: [{ ...emptyItem }] });
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

  function updateItem(index: number, key: keyof typeof emptyItem, value: string) {
    setForm(f => ({ ...f, kalemler: f.kalemler.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  }

  function pickStock(index: number, stock: Stock|null) {
    const stockId=stock?String(stock.id):"";
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
    if(saving)return;
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
      setForm({ talepTuru: "Stok Malzeme", notlar: "", teknikSartname: "", kalemler: [{ ...emptyItem }] });
      fetchRows();
    } catch (e: unknown) {
      setFormError(errorMessage(e, "Talep oluşturulamadı."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(row:RequestRow){
    if(!confirm(`${row.talepNo} listeden kaldırılacak. Bağlı kabul ve satın alma kayıtları silinecek, kabul edilen miktarlar stoktan düşülecek. Devam edilsin mi?`))return;
    try{const r=await fetch(`/api/kys/talepler/${row.id}`,{method:"DELETE"});const j=await r.json();if(!r.ok)throw new Error(j.error);await fetchRows();}catch(e){setError(errorMessage(e,"Talep silinemedi."));}
  }
  async function restoreRow(row:RequestRow){try{const r=await fetch(`/api/kys/talepler/${row.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({islem:"geri-al"})});const j=await r.json();if(!r.ok)throw new Error(j.error);await fetchRows();}catch(e){setError(errorMessage(e,"Geri alınamadı."));}}

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}><input className={styles.searchInput} placeholder="Talep no, oluşturan veya not ara..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
          <span className={styles.totalCount}>{total} talep</span>
        </div>
        <div className={styles.toolbarRight}><Link className={styles.cancelBtn} href="/laboratuvar/kys/tedarikci-listesi">Tedarikçi listesi</Link><button className={styles.addBtn} onClick={() => setModalOpen(true)}>+ Talep oluştur</button></div>
      </div>
      <div className={kys.filterRow}>
        <select className={kys.select} value={tur} onChange={e => { setTur(e.target.value); setPage(1); }}><option value="">Tüm türler</option>{KYS_REQUEST_TYPES.map(type => <option key={type}>{type}</option>)}<option value="Sarf">Sarf (eski kayıtlar)</option></select>
        <select className={kys.select} value={durum} onChange={e => { setDurum(e.target.value); setPage(1); }}><option value="">Tüm durumlar</option><option>Onay Bekliyor</option><option>Onaylandı</option><option>İşleme Alındı</option><option>Kısmi Kabul</option><option>Tamamlandı</option><option>İptal</option><option value="Silindi">Silinen talepler</option></select>
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
                  <td className={styles.tdMono}><Link className={kys.requestLink} href={`/laboratuvar/kys/talep-listesi/${row.id}`}>{row.talepNo}</Link></td>
                  <td>{row.talepTuru}</td>
                  <td><span className={`${kys.pill} ${statusClass(row.durum)}`}>{row.durum}</span></td>
                  <td>{row.kalemSayisi}</td>
                  <td>{row.olusturanAd || "-"}<div className={kys.muted}>{dateFmt(row.olusturmaTarihi)}</div></td>
                  <td>{row.onaylayanAd || "-"}<div className={kys.muted}>{dateFmt(row.onayTarihi)}</div></td>
                  <td>{row.islemeAlanAd || "-"}<div className={kys.muted}>{dateFmt(row.islemeAlmaTarihi)}</div></td>
                  <td>{row.durum==="Silindi"?<button className={styles.cancelBtn} onClick={()=>restoreRow(row)}>Geri al</button>:<button className={`${styles.deleteBtn} ${kys.iconButton}`} title="Talebi sil" aria-label={`${row.talepNo} talebini sil`} onClick={()=>deleteRow(row)}><Trash2 size={16} aria-hidden="true" /></button>}</td>
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
          <div className={styles.modal} style={{ maxWidth: 940 }} role="dialog" aria-modal="true" aria-labelledby="request-title">
            <div className={styles.modalHeader}><h2 id="request-title">Yeni talep oluştur</h2><button className={styles.modalClose} aria-label="Kapat" disabled={saving} onClick={() => setModalOpen(false)}>×</button></div>
            <div className={styles.modalBody}>
              {formError && <div role="alert" className={styles.formError}>{formError}</div>}
              <div className={styles.formGroup} style={{ maxWidth: 280, marginBottom: 18 }}><label htmlFor="request-type">Talep türü</label><select id="request-type" value={form.talepTuru} onChange={e => setForm(f => ({ ...f, talepTuru: e.target.value }))}>{KYS_REQUEST_TYPES.map(type => <option key={type}>{type}</option>)}</select></div>
              <div className={kys.requestItems}>
                {form.kalemler.map((item, index) => (
                  <details key={index} open={index === form.kalemler.length - 1} className={kys.requestItem}>
                    <summary>Kalem {index + 1} · {item.malzemeAdi || "Yeni kalem"} · {item.miktar} {item.birim}</summary>
                    <div className={kys.requestItemGrid}>
                      <div className={`${styles.formGroup} ${kys.itemStock}`}><label>Stok kodu / adı ara</label><KysStockPicker value={item.stokId ? `${item.kod} — ${item.malzemeAdi}` : ""} onPick={stock => pickStock(index, stock)} /></div>
                      <div className={`${styles.formGroup} ${kys.itemCode}`}><label htmlFor={`item-code-${index}`}>Kod</label><input id={`item-code-${index}`} value={item.kod} onChange={e => updateItem(index, "kod", e.target.value)} /></div>
                      <div className={`${styles.formGroup} ${kys.itemName}`}><label htmlFor={`item-name-${index}`}>Malzeme / hizmet adı</label><input id={`item-name-${index}`} value={item.malzemeAdi} onChange={e => updateItem(index, "malzemeAdi", e.target.value)} /></div>
                      <div className={`${styles.formGroup} ${kys.itemQuantity}`}><label htmlFor={`item-quantity-${index}`}>Miktar</label><input id={`item-quantity-${index}`} inputMode="decimal" value={item.miktar} onChange={e => updateItem(index, "miktar", e.target.value)} /></div>
                      <div className={`${styles.formGroup} ${kys.itemUnit}`}><label htmlFor={`item-unit-${index}`}>Birim</label><input id={`item-unit-${index}`} readOnly={!!item.stokId} title={item.stokId ? "Stok kartı birimi" : undefined} value={item.birim} onChange={e => updateItem(index, "birim", e.target.value)} /></div>
                      <div className={`${styles.formGroup} ${kys.itemFeature}`}><label htmlFor={`item-feature-${index}`}>Özellik</label><textarea id={`item-feature-${index}`} rows={2} value={item.ozellik} onChange={e => updateItem(index, "ozellik", e.target.value)} /></div>
                    </div>
                    {form.kalemler.length > 1 && <button className={styles.cancelBtn} type="button" onClick={() => setForm(f => ({ ...f, kalemler: f.kalemler.filter((_, i) => i !== index) }))}>Kalemi kaldır</button>}
                  </details>
                ))}
                <button className={styles.cancelBtn} type="button" onClick={() => setForm(f => ({ ...f, kalemler: [...f.kalemler, { ...emptyItem }] }))}>+ Kalem ekle</button>
              </div>
              {form.talepTuru === "Cihaz" && <div className={styles.formGroup} style={{ marginTop: 18 }}><label htmlFor="request-spec">Teknik şartname</label><textarea id="request-spec" rows={4} value={form.teknikSartname} onChange={e => setForm(f => ({ ...f, teknikSartname: e.target.value }))} /></div>}
              <div className={styles.formGroup} style={{ marginTop: 18 }}><label htmlFor="request-notes">Not</label><textarea id="request-notes" rows={3} value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} placeholder="Talebin tamamı için açıklama veya teslimat notu…" /></div>
            </div>
            <div className={styles.modalFooter}><button className={styles.cancelBtn} disabled={saving} onClick={() => setModalOpen(false)}>Vazgeç</button><button className={styles.saveBtn} disabled={saving} onClick={save}>{saving ? "Oluşturuluyor…" : "Talep oluştur"}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
