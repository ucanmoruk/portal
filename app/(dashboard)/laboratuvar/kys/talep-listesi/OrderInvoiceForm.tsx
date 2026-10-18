"use client";

import { useState } from "react";
import styles from "@/app/styles/table.module.css";

export default function OrderInvoiceForm({ orderNo, company, series, onCreated, onCancel }: {
  orderNo: string; company: string; series: string;
  onCreated: (invoice: { ID: number; FaturaNo: string; FirmaAd: string; Toplam: string; VadeTarihi: string; OdemeDurumu: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ faturaNo: "", faturaTarihi: new Date().toLocaleDateString("en-CA"), vadeTarihi: "", toplam: "", kdvOran: "20", firmaAdManuel: company, aciklama: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const raw = form.toplam.trim();
      const total = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
      if (!Number.isFinite(total) || total < 0) throw new Error("Geçerli, negatif olmayan bir toplam girin.");
      const res = await fetch("/api/faturalar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, toplam: total, kaynak: series, evrakNo: orderNo }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fatura eklenemedi.");
      onCreated({ ID: json.id, FaturaNo: form.faturaNo, FirmaAd: form.firmaAdManuel, Toplam: String(total), VadeTarihi: form.vadeTarihi, OdemeDurumu: "Ödeme Bekliyor" });
    } catch (err) { setError(err instanceof Error ? err.message : "Fatura eklenemedi."); }
    finally { setSaving(false); }
  }
  return <form onSubmit={save}>
    {error && <div role="alert" className={styles.formError}>{error}</div>}
    <div className={styles.formGrid}>
      {([
        ["faturaNo", "Fatura no", "text"], ["firmaAdManuel", "Firma adı", "text"],
        ["faturaTarihi", "Fatura tarihi", "date"], ["vadeTarihi", "Vade tarihi", "date"],
        ["toplam", "KDV dahil toplam (TL)", "text"], ["kdvOran", "KDV oranı (%)", "number"],
      ] as const).map(([key, label, type]) => <div key={key} className={styles.formGroup}>
        <label htmlFor={`order-invoice-${key}`}>{label}</label>
        <input id={`order-invoice-${key}`} required type={type} min={type === "number" ? 0 : undefined} max={type === "number" ? 100 : undefined} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
      </div>)}
      <div className={styles.formGroup}><label htmlFor="order-invoice-document">Evrak no / Sipariş kodu</label><input id="order-invoice-document" readOnly value={orderNo} /></div>
      <div className={styles.formGroup}><label htmlFor="order-invoice-note">Açıklama</label><textarea id="order-invoice-note" value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
    </div>
    <p>Fatura, Fatura Takip listesine kaydedilir. Ardından siparişle eşleştirmeyi kaydedebilirsiniz.</p>
    <div className={styles.modalFooter}><button type="button" disabled={saving} className={styles.cancelBtn} onClick={onCancel}>Geri</button><button disabled={saving} className={styles.saveBtn}>{saving ? "Kaydediliyor…" : "Faturayı oluştur"}</button></div>
  </form>;
}
