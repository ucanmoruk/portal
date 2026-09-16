"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildKabulMail, type KabulMailData } from "@/lib/numuneKabulMailTemplate";
import type { LaboratoryMailBrand } from "@/lib/laboratuvarMailTemplate";
import styles from "./kabulMail.module.css";

export default function KabulMailModal({ ids, onClose }: { ids: number[]; onClose: () => void }) {
  const [data, setData] = useState<(KabulMailData & { brand: LaboratoryMailBrand }) | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [konu, setKonu] = useState("");
  const [mesaj, setMesaj] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const sending = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/numune-kabul/bilgi-maili", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", ids }), signal: controller.signal })
      .then(async res => { const json = await res.json(); if (!res.ok) throw new Error(json.error); return json; })
      .then(json => { setData(json); setTo(json.email); setKonu(json.konu); setMesaj(json.mesaj); })
      .catch(e => { if (e.name !== "AbortError") setError(e.message || "Önizleme alınamadı"); });
    return () => controller.abort();
  }, [ids]);
  const send = async () => {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const res = await fetch("/api/numune-kabul/bilgi-maili", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", ids, to, cc, konu, mesaj }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gönderilemedi");
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Gönderilemedi"); }
    finally { sending.current = false; setBusy(false); }
  };
  const fieldStyle = { width: "100%", padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 7, fontSize: "0.85rem", background: "var(--color-surface)", color: "var(--color-text-primary)", fontFamily: "inherit", boxSizing: "border-box" as const };
  return createPortal(<div className={styles.overlay} onClick={e => { if(e.target === e.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="kabul-mail-title"
      onKeyDown={e => {
        if (e.key === "Escape" && !busy) { e.preventDefault(); onClose(); }
        if (e.key !== "Tab") return;
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)"));
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}
      className={styles.dialog}>
      <div className={styles.header}><h2 id="kabul-mail-title">Bilgi Maili Gönder · {ids.length} numune</h2><button className={styles.close} onClick={onClose} disabled={busy} aria-label="Kapat">×</button></div>
      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
      {sent ? <p role="status">Bilgi maili başarıyla gönderildi.</p> : data ? <>
        <p className={styles.notice}>{data.firmaAd} · Alıcıları ve numune bilgilerini kontrol ederek gönderin.</p>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, display: "grid", gap: 12 }}>
          <label>Alıcı (birden fazla adres için virgül veya noktalı virgül)<input autoFocus value={to} onChange={e => setTo(e.target.value)} style={fieldStyle} /></label>
          <label>Bilgi (CC)<input value={cc} onChange={e => setCc(e.target.value)} style={fieldStyle} /></label>
          <label>Konu<input maxLength={250} value={konu} onChange={e => setKonu(e.target.value)} style={fieldStyle} /></label>
          <label>Mesaj<textarea maxLength={5000} rows={3} value={mesaj} onChange={e => setMesaj(e.target.value)} style={fieldStyle} /></label>
        </fieldset>
        <details className={styles.preview}><summary>Mail içeriğini ve numune tablosunu önizle</summary>
<iframe title="Bilgi maili önizlemesi" sandbox="" srcDoc={buildKabulMail(data, mesaj, data.brand, "/unique-logo.png").html} style={{ width: "100%", height: 560, border: 0, background: "white" }} />
</details>
      </> : !error && <p role="status">Mail önizlemesi hazırlanıyor…</p>}
      <div className={styles.actions}><button onClick={onClose} disabled={busy}>{sent ? "Kapat" : "Vazgeç"}</button>{!sent && <button className={styles.send} disabled={!data || busy || !to.trim() || !konu.trim()} onClick={send}>{busy ? "Gönderiliyor…" : "Gönder"}</button>}</div>
    </section>
  </div>, document.body);
}
