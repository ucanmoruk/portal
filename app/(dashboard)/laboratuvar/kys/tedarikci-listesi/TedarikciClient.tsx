"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type Supplier = { ID: number; Ad: string; Yetkili: string; Telefon: string; Email: string; Adres: string; VergiDairesi: string; VergiNo: string; Durum: string };
const blank: Supplier = { ID: 0, Ad: "", Yetkili: "", Telefon: "", Email: "", Adres: "", VergiDairesi: "", VergiNo: "", Durum: "Aktif" };
const fields = [
  { key: "Yetkili", label: "Yetkili", placeholder: "İsim soyisim", type: "text", autoComplete: "name" },
  { key: "Telefon", label: "Telefon", placeholder: "Telefon numarası", type: "tel", autoComplete: "tel" },
  { key: "Email", label: "E-posta", placeholder: "ornek@firma.com", type: "email", autoComplete: "email" },
  { key: "VergiDairesi", label: "Vergi dairesi", placeholder: "Vergi dairesi adı", type: "text", autoComplete: "off" },
  { key: "VergiNo", label: "Vergi no", placeholder: "Vergi numarası", type: "text", autoComplete: "off" },
] as const;

export default function TedarikciClient() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Supplier | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/kys/tedarikciler?all=1&search=${encodeURIComponent(search)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRows(j.data || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Liste alınamadı."); }
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  function openForm(value: Supplier) { setError(""); setForm({ ...value }); }
  function changeField(key: keyof Supplier, value: string) { setForm(f => f ? { ...f, [key]: value } : f); }
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/kys/tedarikciler", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setForm(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Kaydedilemedi."); }
    finally { setBusy(false); }
  }
  async function remove(row: Supplier) {
    if (!confirm(`${row.Ad} tedarikçisini listeden çıkarmak istiyor musunuz? Geçmiş satın alma kayıtları korunur.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/kys/tedarikciler?id=${row.ID}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Silinemedi."); }
    finally { setBusy(false); }
  }

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <h1 className={styles.pageTitle}>Tedarikçi Listesi</h1>
      <p>Satın alma yapılan firmalar ve iletişim bilgileri. Listeden çıkarılan firmaların geçmiş kayıtları korunur.</p>
      {error && !form && <p role="alert" className={styles.errorBar}>{error}</p>}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}><input className={styles.searchInput} aria-label="Tedarikçi ara" placeholder="Firma, yetkili veya vergi no ara…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className={styles.toolbarRight}><Link className={styles.cancelBtn} href="/laboratuvar/kys/talep-listesi">Talep listesi</Link><button className={styles.addBtn} onClick={() => openForm(blank)}>+ Tedarikçi ekle</button></div>
      </div>
      <div className={styles.tableCard}><div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead><tr><th>Firma</th><th>Yetkili</th><th>Telefon</th><th>E-posta</th><th>Vergi No</th><th>Durum</th><th>İşlem</th></tr></thead>
          <tbody>{rows.length ? rows.map(r => (
            <tr key={r.ID}><td>{r.Ad}</td><td>{r.Yetkili || "—"}</td><td>{r.Telefon || "—"}</td><td>{r.Email || "—"}</td><td>{r.VergiNo || "—"}</td><td>{r.Durum}</td>
              <td><div className={kys.inlineActions}><button className={styles.cancelBtn} onClick={() => openForm(r)}>Düzenle</button>{r.Durum === "Aktif" && <button disabled={busy} className={styles.cancelBtn} onClick={() => remove(r)}>Listeden çıkar</button>}</div></td>
            </tr>
          )) : <tr><td colSpan={7}>Tedarikçi bulunamadı.</td></tr>}</tbody>
        </table>
      </div></div>
      {form && (
        <div className={styles.modalOverlay}>
          <form className={`${styles.modal} ${kys.supplierModal}`} role="dialog" aria-modal="true" aria-labelledby="supplier-title" aria-describedby="supplier-intro" aria-busy={busy}
            onSubmit={e => { e.preventDefault(); if (form.Ad.trim()) void save(); }}
            onKeyDown={e => {
              if (e.key === "Escape" && !busy) { e.stopPropagation(); setForm(null); }
              if (e.key === "Tab") {
                const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'));
                const first = controls[0], last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
              }
            }}>
            <div className={styles.modalHeader}><h2 id="supplier-title">{form.ID ? "Tedarikçiyi Düzenle" : "Yeni Tedarikçi Ekle"}</h2><button type="button" className={styles.modalClose} disabled={busy} onClick={() => setForm(null)} aria-label="Kapat">×</button></div>
            <div className={styles.modalBody}>
              <p id="supplier-intro" className={kys.supplierIntro}>Firma, iletişim ve vergi bilgilerini girin. Firma adı zorunludur.</p>
              {error && <div role="alert" className={styles.formError}>{error}</div>}
              <div className={`${styles.formGrid} ${kys.supplierGrid}`}>
                <div className={`${styles.formGroup} ${kys.supplierFullWidth}`}><label htmlFor="supplier-Ad">Firma adı <span className={styles.required}>*</span></label><input id="supplier-Ad" autoFocus required disabled={busy} value={form.Ad} onChange={e => changeField("Ad", e.target.value)} placeholder="Firma adını girin" autoComplete="organization" /></div>
                <div className={styles.formGroup}><label htmlFor="supplier-Durum">Durum</label><select id="supplier-Durum" disabled={busy} value={form.Durum} onChange={e => changeField("Durum", e.target.value)}><option>Aktif</option><option>Pasif</option></select></div>
                {fields.map(field => <div className={styles.formGroup} key={field.key}><label htmlFor={`supplier-${field.key}`}>{field.label}</label><input id={`supplier-${field.key}`} type={field.type} disabled={busy} value={form[field.key] || ""} onChange={e => changeField(field.key, e.target.value)} placeholder={field.placeholder} autoComplete={field.autoComplete} /></div>)}
                <div className={`${styles.formGroup} ${kys.supplierFullWidth}`}><label htmlFor="supplier-Adres">Adres</label><textarea id="supplier-Adres" rows={3} disabled={busy} value={form.Adres || ""} onChange={e => changeField("Adres", e.target.value)} placeholder="Açık adresi girin" autoComplete="street-address" /></div>
              </div>
            </div>
            <div className={styles.modalFooter}><button type="button" className={styles.cancelBtn} disabled={busy} onClick={() => setForm(null)}>Vazgeç</button><button type="submit" className={styles.saveBtn} disabled={busy || !form.Ad.trim()}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}