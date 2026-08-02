"use client";

import { useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type Birim = { id: number; kod: string; ad: string; aciklama: string; durum: string };

const empty = { kod: "", ad: "", aciklama: "", durum: "Aktif" };
const errorMessage = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

export default function LaboratuvarBirimleriClient() {
  const [rows, setRows] = useState<Birim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function fetchRows() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/kys/birimler");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Birim listesi alınamadı.");
      setRows(json.data || []);
    } catch (e: unknown) {
      setError(errorMessage(e, "Birim listesi alınamadı."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRows(); }, []);

  function openAdd() {
    setMode("add");
    setEditId(null);
    setForm(empty);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(row: Birim) {
    setMode("edit");
    setEditId(row.id);
    setForm({ kod: row.kod || "", ad: row.ad || "", aciklama: row.aciklama || "", durum: row.durum || "Aktif" });
    setFormError("");
    setModalOpen(true);
  }

  async function save() {
    if (!form.ad.trim()) {
      setFormError("Birim adı zorunludur.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(mode === "edit" ? `/api/kys/birimler/${editId}` : "/api/kys/birimler", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Birim kaydedilemedi.");
      setModalOpen(false);
      fetchRows();
    } catch (e: unknown) {
      setFormError(errorMessage(e, "Birim kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}><span className={styles.totalCount}>{rows.length} birim</span></div>
        <div className={styles.toolbarRight}><button className={styles.addBtn} onClick={openAdd}>+ Birim ekle</button></div>
      </div>
      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead><tr><th>Kod</th><th>Birim adı</th><th>Açıklama</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5}><div className={styles.skeleton} /></td></tr> : rows.map(row => (
                <tr key={row.id}>
                  <td className={styles.tdMono}>{row.kod || "-"}</td>
                  <td className={styles.tdName}>{row.ad}</td>
                  <td className={styles.tdSecondary}>{row.aciklama || "-"}</td>
                  <td><span className={`${kys.pill} ${row.durum === "Aktif" ? kys.pillOk : kys.pillWarn}`}>{row.durum}</span></td>
                  <td><button className={styles.editBtn} onClick={() => openEdit(row)}>✎</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{mode === "add" ? "Birim ekle" : "Birim düzenle"}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid}>
                <div className={styles.formGroup}><label>Kod</label><input value={form.kod} onChange={e => setForm(f => ({ ...f, kod: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Birim adı <span className={styles.required}>*</span></label><input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Durum</label><select value={form.durum} onChange={e => setForm(f => ({ ...f, durum: e.target.value }))}><option>Aktif</option><option>Pasif</option></select></div>
                <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Açıklama</label><textarea rows={3} value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setModalOpen(false)}>Vazgeç</button>
              <button className={styles.saveBtn} disabled={saving} onClick={save}>{saving ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
