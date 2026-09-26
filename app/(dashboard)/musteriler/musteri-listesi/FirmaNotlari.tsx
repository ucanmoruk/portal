"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/styles/table.module.css";

type Attachment = { id: number; dosyaAdi: string; mimeType: string; boyut: number };
type Note = { id: number; notMetni: string; olusturanAd: string; createdAt: string | null; updatedAt: string | null; ekler: Attachment[] };

const fmtDate = (value: string | null) => value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
const fmtSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

export default function FirmaNotlari({ firmaId }: { firmaId: number }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/firmalar/${firmaId}/genel-notlar`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Notlar alınamadı.");
      setNotes(Array.isArray(body.data) ? body.data : []);
    } catch (err) { setError(err instanceof Error ? err.message : "Notlar alınamadı."); }
    finally { setLoading(false); }
  }, [firmaId]);

  useEffect(() => { void load(); }, [load]);

  const reset = () => { setText(""); setFiles([]); setEditing(null); if (inputRef.current) inputRef.current.value = ""; };
  const save = async () => {
    if (!text.trim()) { setError("Not metni zorunludur."); return; }
    setSaving(true); setError("");
    try {
      const form = new FormData(); form.set("notMetni", text.trim()); files.forEach(file => form.append("files", file));
      const response = await fetch(editing ? `/api/firmalar/${firmaId}/genel-notlar/${editing.id}` : `/api/firmalar/${firmaId}/genel-notlar`, { method: editing ? "PATCH" : "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Not kaydedilemedi.");
      reset(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Not kaydedilemedi."); }
    finally { setSaving(false); }
  };

  const removeAttachment = async (noteId: number, attachmentId: number) => {
    if (!window.confirm("Bu dosya nottan kaldırılsın mı?")) return;
    const response = await fetch(`/api/firmalar/${firmaId}/genel-notlar/${noteId}/ekler/${attachmentId}`, { method: "DELETE" });
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.error || "Dosya silinemedi."); return; }
    await load();
  };

  return <div style={{ display: "grid", gap: 14 }}>
    <section style={{ border: "1px solid var(--color-border-light)", borderRadius: 10, padding: 14, background: "var(--color-surface-2)" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 9 }}>{editing ? "Notu Düzenle" : "Yeni Firma Notu"}</div>
      {error && <div className={styles.formError}>{error}</div>}
      <div className={styles.formGroup}>
        <label>Serbest metin</label>
        <textarea rows={4} maxLength={8000} value={text} onChange={event => setText(event.target.value)} placeholder="Görüşme özeti, müşteri talebi, takip edilmesi gereken konu..." />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
        <div>
          <input ref={inputRef} type="file" multiple accept="image/*,application/pdf,audio/*" onChange={event => setFiles(Array.from(event.target.files || []))} />
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 3 }}>PDF, görsel veya ses · en fazla 6 dosya · dosya başına 10 MB</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {editing && <button type="button" className={styles.cancelBtn} onClick={reset}>Vazgeç</button>}
          <button type="button" className={styles.saveBtn} disabled={saving} onClick={() => void save()}>{saving ? "Kaydediliyor..." : editing ? "Güncelle" : "Not Ekle"}</button>
        </div>
      </div>
    </section>
    {loading ? <div className={styles.empty}>Notlar yükleniyor...</div> : notes.length === 0 ? <div className={styles.empty}>Bu firma için henüz not eklenmemiş.</div> : notes.map(note => <article key={note.id} style={{ border: "1px solid var(--color-border-light)", borderRadius: 10, padding: 14, background: "var(--color-surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: 13 }}>{note.notMetni}</div>
          <div style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 8 }}>{note.olusturanAd || "Bilinmeyen kullanıcı"} · {fmtDate(note.createdAt)}{note.updatedAt && note.updatedAt !== note.createdAt ? ` · Düzenlendi: ${fmtDate(note.updatedAt)}` : ""}</div>
        </div>
        <button type="button" className={styles.iconBtn} title="Notu düzenle" onClick={() => { setEditing(note); setText(note.notMetni); setFiles([]); }} aria-label="Notu düzenle">✎</button>
      </div>
      {note.ekler.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>{note.ekler.map(file => <span key={file.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--color-border-light)", borderRadius: 999, padding: "5px 8px", fontSize: 11 }}>
        <a href={`/api/firmalar/${firmaId}/genel-notlar/${note.id}/ekler/${file.id}`} target="_blank" rel="noreferrer">{file.dosyaAdi} <small>({fmtSize(file.boyut)})</small></a>
        <button type="button" onClick={() => void removeAttachment(note.id, file.id)} title="Dosyayı kaldır" style={{ border: 0, background: "none", color: "var(--color-danger)", cursor: "pointer", padding: 0 }}>×</button>
      </span>)}</div>}
    </article>)}
  </div>;
}
