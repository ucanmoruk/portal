"use client";

import { useState } from "react";
import styles from "@/app/styles/table.module.css";

export type CariMailTarget = {
  mode: "firma" | "fatura";
  firmaId?: number | null;
  faturaId?: number | null;
  firmaAd: string;
  email?: string | null;
  faturaNo?: string | null;
};

export default function CariMailModal({ target, onClose }: { target: CariMailTarget; onClose: () => void }) {
  const isInvoice = target.mode === "fatura";
  const [to, setTo] = useState(target.email || "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(isInvoice ? `Fatura Bilgilendirmesi - ${target.faturaNo || ""}` : `Cari Hesap Ekstresi - ${target.firmaAd}`);
  const [message, setMessage] = useState(isInvoice
    ? "Sayın Yetkili,\n\nFaturanıza ait güncel ödeme bilgileri aşağıda bilgilerinize sunulmuştur."
    : "Sayın Yetkili,\n\nGüncel cari hesap ekstreniz aşağıda bilgilerinize sunulmuştur.");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!to.trim()) { setError("Alıcı e-posta adresi zorunludur."); return; }
    setSending(true); setError("");
    try {
      const response = await fetch("/api/musteriler/cari-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, to, cc, subject, message }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "E-posta gönderilemedi.");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "E-posta gönderilemedi.");
    } finally { setSending(false); }
  }

  return <div className={styles.modalOverlay} onMouseDown={event => { if (event.target === event.currentTarget && !sending) onClose(); }}>
    <div className={styles.modal} style={{ maxWidth: 620 }} role="dialog" aria-modal="true" aria-label="Cari e-posta gönderimi">
      <div className={styles.modalHeader}>
        <div><h2>{isInvoice ? "Faturayı Mail Gönder" : "Cari Ekstreyi Mail Gönder"}</h2><div style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-tertiary)" }}>{target.firmaAd}{target.faturaNo ? ` · ${target.faturaNo}` : ""}</div></div>
        <button type="button" className={styles.modalClose} onClick={onClose} disabled={sending}>×</button>
      </div>
      <div className={styles.modalBody} style={{ display: "grid", gap: 13 }}>
        <label className={styles.formGroup}><span>Alıcı</span><input type="text" value={to} onChange={event => setTo(event.target.value)} placeholder="musteri@firma.com" /></label>
        <label className={styles.formGroup}><span>CC</span><input type="text" value={cc} onChange={event => setCc(event.target.value)} placeholder="Birden fazla adresi virgülle ayırabilirsiniz" /></label>
        <label className={styles.formGroup}><span>Konu</span><input type="text" value={subject} onChange={event => setSubject(event.target.value)} /></label>
        <label className={styles.formGroup}><span>Mesaj</span><textarea rows={6} value={message} onChange={event => setMessage(event.target.value)} style={{ resize: "vertical" }} /></label>
        <div style={{ padding: "9px 11px", borderRadius: 8, background: "var(--color-surface-2)", color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.45 }}>
          {isInvoice ? "Fatura tutarı, ödeme durumu, ödenen tutar ve açık bakiye e-posta şablonuna otomatik eklenir." : "Tüm resmi faturalar, ödemeler ve güncel açık bakiye e-posta şablonuna otomatik eklenir."}
        </div>
        {error && <div className={styles.errorBar}>{error}</div>}
      </div>
      <div className={styles.modalFooter}>
        <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={sending}>Vazgeç</button>
        <button type="button" className={styles.saveBtn} onClick={() => void send()} disabled={sending || !to.trim()}>{sending ? "Gönderiliyor…" : "Mail Gönder"}</button>
      </div>
    </div>
  </div>;
}
