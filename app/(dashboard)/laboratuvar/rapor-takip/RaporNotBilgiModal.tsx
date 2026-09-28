"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";

type FirmaRef = { id: number | null; ad: string | null };
type Note = { id: number; notMetni: string; olusturanAd: string; createdAt: string | null; updatedAt: string | null };
export type RaporNotTarget = { raporNo: string; numuneAdi: string; numuneNotu: string | null; firma: FirmaRef; projeFirma: FirmaRef };

const fmtDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "-";

export default function RaporNotBilgiModal({ target, onClose }: { target: RaporNotTarget; onClose: () => void }) {
  const [tab, setTab] = useState<"numune" | "firma" | "proje">("numune");
  const [cache, setCache] = useState<Record<string, Note[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const current = tab === "firma" ? target.firma : target.projeFirma;

  const load = useCallback(async (key: "firma" | "proje", firma: FirmaRef) => {
    if (!firma.id || cache[key]) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/firmalar/${firma.id}/genel-notlar`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Firma notları alınamadı.");
      setCache(previous => ({ ...previous, [key]: Array.isArray(body.data) ? body.data : [] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Firma notları alınamadı."); }
    finally { setLoading(false); }
  }, [cache]);

  useEffect(() => { if (tab !== "numune") void load(tab, current); }, [current, load, tab]);
  const notes = tab === "numune" ? [] : cache[tab] || [];

  return <div className={styles.modalOverlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.modal} style={{ maxWidth: 760, maxHeight: "82vh" }} role="dialog" aria-modal="true" aria-label="Rapor notları">
      <div className={styles.modalHeader}>
        <div><h2>Not Bilgileri</h2><div style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-tertiary)" }}>{target.raporNo} · {target.numuneAdi}</div></div>
        <button className={styles.modalClose} onClick={onClose} aria-label="Kapat">×</button>
      </div>
      <div className={styles.modalBody}>
        <div className={styles.cariTabs} role="tablist" aria-label="Not türü">
          <button type="button" role="tab" aria-selected={tab === "numune"} className={tab === "numune" ? styles.cariTabActive : ""} onClick={() => setTab("numune")}>Numune Notları</button>
          <button type="button" role="tab" aria-selected={tab === "firma"} className={tab === "firma" ? styles.cariTabActive : ""} onClick={() => setTab("firma")}>Firma Notları</button>
          <button type="button" role="tab" aria-selected={tab === "proje"} className={tab === "proje" ? styles.cariTabActive : ""} onClick={() => setTab("proje")}>Proje Firma Notları</button>
        </div>
        {tab === "numune" ? (
          target.numuneNotu?.trim()
            ? <article style={{ border: "1px solid var(--color-border-light)", borderRadius: 10, padding: 12, background: "var(--color-surface-2)", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55 }}>{target.numuneNotu.trim()}</article>
            : <div className={styles.empty}>Bu numune için not bulunmuyor.</div>
        ) : !current.id ? <div className={styles.empty}>Bu kayıt için {tab === "firma" ? "firma" : "proje firması"} bağlantısı bulunmuyor.</div>
          : loading ? <div className={styles.empty}>Notlar yükleniyor...</div>
          : error ? <div className={styles.errorBar}>{error}</div>
          : notes.length === 0 ? <div className={styles.empty}>Bu firma için not bulunmuyor.</div>
          : <div style={{ display: "grid", gap: 9 }}>{notes.map(note => <article key={note.id} style={{ border: "1px solid var(--color-border-light)", borderRadius: 10, padding: 12, background: "var(--color-surface-2)" }}><div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55 }}>{note.notMetni}</div><div style={{ marginTop: 8, fontSize: 10.5, color: "var(--color-text-tertiary)" }}>{note.olusturanAd || "Bilinmeyen kullanıcı"} · {fmtDate(note.createdAt)}{note.updatedAt ? ` · Düzenlendi: ${fmtDate(note.updatedAt)}` : ""}</div></article>)}</div>}
      </div>
      <div className={styles.modalFooter}><button type="button" className={styles.cancelBtn} onClick={onClose}>Kapat</button></div>
    </div>
  </div>;
}
