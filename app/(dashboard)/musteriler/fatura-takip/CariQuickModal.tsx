"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import styles from "@/app/styles/table.module.css";

interface CariRow {
  Kaynak: string;
  KaynakID: number;
  BelgeNo: string;
  Tarih: string | null;
  Durum: string | null;
  Tutar: number | string;
  AcikTutar?: number | string;
  MahsupTutar?: number | string;
  MahsupEdilmemis?: number | string;
  ParaBirimi: string;
}

interface CariSummary {
  paraBirimi: string;
  acikFatura: number;
  gelenOdeme: number;
  mahsupEdilen: number;
  mahsupEdilmemis: number;
  net: number;
}

interface Props {
  firma: { ID: number; Ad: string };
  onClose: () => void;
  onChanged: () => void;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function parseMoney(value: string | number | null | undefined) {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}
function money(value: string | number | null | undefined, currency = "TRY") {
  const normalizedCurrency = currency === "TL" ? "TRY" : currency;
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: normalizedCurrency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
}
function date(value?: string | null) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "-";
}

export default function CariQuickModal({ firma, onClose, onChanged }: Props) {
  const [rows, setRows] = useState<CariRow[]>([]);
  const [summary, setSummary] = useState<CariSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [form, setForm] = useState({ tutar: "", tarih: todayIso(), paraBirimi: "TRY", odemeYeri: "", aciklama: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/firmalar/${firma.ID}/cari?tip=T%C3%BCm%C3%BC&tarihBas=&tarihBit=&grup=resmi`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Cari hesap alınamadı.");
      setRows(Array.isArray(json.data) ? json.data : []);
      setSummary(Array.isArray(json.summary) ? json.summary : []);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Cari hesap alınamadı.");
    } finally { setLoading(false); }
  }, [firma.ID]);

  useEffect(() => { void load(); }, [load]);

  const openInvoices = useMemo(() => rows.filter(row => row.Kaynak === "Fatura" && Number(row.AcikTutar || 0) > 0).sort((a, b) => String(a.Tarih || "").localeCompare(String(b.Tarih || ""))), [rows]);
  const allocationTotal = Object.values(allocations).reduce((sum, value) => sum + parseMoney(value), 0);
  const unallocated = Math.max(0, parseMoney(form.tutar) - allocationTotal);

  function autoAllocate() {
    let remaining = parseMoney(form.tutar);
    const next: Record<number, string> = {};
    for (const invoice of openInvoices) {
      const amount = Math.min(remaining, Number(invoice.AcikTutar || 0));
      if (amount > 0) next[invoice.KaynakID] = amount.toFixed(2);
      remaining -= amount;
      if (remaining <= 0) break;
    }
    setAllocations(next);
  }

  async function submit() {
    const tutar = parseMoney(form.tutar);
    if (tutar <= 0) { setError("Ödeme tutarı sıfırdan büyük olmalı."); return; }
    const dagitimlar = Object.entries(allocations).map(([faturaId, value]) => ({ faturaId: Number(faturaId), tutar: parseMoney(value) })).filter(item => item.tutar > 0);
    if (allocationTotal > tutar + 0.005) { setError("Dağıtılan tutar ödeme tutarını aşamaz."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/firmalar/${firma.ID}/cari`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, tip: "Gelen Ödeme", dagitimlar }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Ödeme kaydedilemedi.");
      setForm({ tutar: "", tarih: todayIso(), paraBirimi: "TRY", odemeYeri: "", aciklama: "" });
      setAllocations({});
      await load();
      onChanged();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Ödeme kaydedilemedi.");
    } finally { setSaving(false); }
  }

  return <div className={styles.modalOverlay}>
    <div className={styles.modal} style={{ maxWidth: 980 }}>
      <div className={styles.modalHeader}>
        <div><h2>Cari Hesap</h2><div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 3 }}>{firma.Ad.toLocaleUpperCase("tr-TR")}</div></div>
        <button className={styles.modalClose} type="button" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
      </div>
      <div className={styles.modalBody}>
        {error && <div className={styles.errorBar} style={{ marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginBottom: 14 }}>
          {summary.map(item => <div key={item.paraBirimi} style={{ border: "1px solid var(--color-border-light)", borderRadius: 9, padding: 10, background: "var(--color-surface-2)", fontSize: 12 }}>
            <strong>{item.paraBirimi}</strong><div style={{ marginTop: 5 }}>Açık fatura: <b>{money(item.acikFatura, item.paraBirimi)}</b></div><div>Mahsup edilmemiş: <b>{money(item.mahsupEdilmemis, item.paraBirimi)}</b></div><div style={{ marginTop: 4 }}>Net açık: <b>{money(item.net, item.paraBirimi)}</b></div>
          </div>)}
        </div>
        <div style={{ border: "1px solid var(--color-border-light)", borderRadius: 10, padding: 12, background: "var(--color-surface-2)", marginBottom: 14 }}>
          <strong style={{ fontSize: 13 }}>Ödeme Ekle</strong>
          <div className={styles.formGrid3} style={{ marginTop: 9 }}>
            <div className={styles.formGroup}><label>Tutar</label><input inputMode="decimal" value={form.tutar} onChange={event => setForm(current => ({ ...current, tutar: event.target.value }))} placeholder="0,00" /></div>
            <div className={styles.formGroup}><label>Tarih</label><input type="date" value={form.tarih} onChange={event => setForm(current => ({ ...current, tarih: event.target.value }))} /></div>
            <div className={styles.formGroup}><label>Para Birimi</label><select value={form.paraBirimi} onChange={event => { setForm(current => ({ ...current, paraBirimi: event.target.value })); setAllocations({}); }}><option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></div>
            <div className={styles.formGroup}><label>Ödeme Yeri</label><input value={form.odemeYeri} onChange={event => setForm(current => ({ ...current, odemeYeri: event.target.value }))} placeholder="Banka, kasa..." /></div>
            <div className={`${styles.formGroup} ${styles.colSpan2}`}><label>Açıklama</label><input value={form.aciklama} onChange={event => setForm(current => ({ ...current, aciklama: event.target.value }))} /></div>
          </div>
          {form.paraBirimi === "TRY" && <div style={{ marginTop: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 7 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Açık faturalara dağıt</span><button type="button" className={styles.cancelBtn} onClick={autoAllocate} disabled={!parseMoney(form.tutar) || !openInvoices.length}>Otomatik dağıt</button></div>
            {!openInvoices.length ? <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Mahsup edilebilecek açık fatura bulunmuyor.</div> : <div style={{ display: "grid", gap: 5, maxHeight: 150, overflowY: "auto" }}>{openInvoices.map(invoice => <div key={invoice.KaynakID} style={{ display: "grid", gridTemplateColumns: "minmax(140px,1fr) 130px 120px", gap: 7, alignItems: "center", background: "var(--color-surface)", border: "1px solid var(--color-border-light)", borderRadius: 7, padding: "6px 8px", fontSize: 11 }}><span><b>{invoice.BelgeNo}</b><br /><small>{date(invoice.Tarih)}</small></span><span style={{ textAlign: "right" }}>Açık: <b>{money(invoice.AcikTutar)}</b></span><input inputMode="decimal" value={allocations[invoice.KaynakID] || ""} onChange={event => setAllocations(current => ({ ...current, [invoice.KaynakID]: event.target.value }))} placeholder="0,00" style={{ textAlign: "right" }} /></div>)}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 7, fontSize: 11 }}><span>Mahsup: <b>{money(allocationTotal, form.paraBirimi)}</b></span><span>Kalan bakiye: <b>{money(unallocated, form.paraBirimi)}</b></span></div>
          </div>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}><button className={styles.saveBtn} type="button" disabled={saving} onClick={() => void submit()}>{saving ? "Kaydediliyor..." : "Ödemeyi Kaydet"}</button></div>
        </div>
        <div className={styles.tableWrapper} style={{ border: "1px solid var(--color-border-light)", borderRadius: 9, maxHeight: 280 }}><table className={styles.table}><thead><tr><th>Tip</th><th>Belge</th><th>Tarih</th><th>Durum</th><th style={{ textAlign: "right" }}>Tutar</th><th style={{ textAlign: "right" }}>Kalan</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className={styles.empty}>Yükleniyor...</td></tr> : rows.map((row, index) => <tr key={`${row.Kaynak}-${row.KaynakID}-${index}`}><td>{row.Kaynak}</td><td>{row.BelgeNo || "-"}</td><td>{date(row.Tarih)}</td><td>{row.Durum || "-"}</td><td style={{ textAlign: "right" }}>{money(row.Tutar, row.ParaBirimi)}</td><td style={{ textAlign: "right" }}>{row.Kaynak === "Fatura" ? money(row.AcikTutar, row.ParaBirimi) : row.Durum === "Gelen Ödeme" ? money(row.MahsupEdilmemis, row.ParaBirimi) : "-"}</td></tr>)}</tbody></table></div>
      </div>
      <div className={styles.modalFooter}><button className={styles.cancelBtn} type="button" onClick={onClose}>Kapat</button></div>
    </div>
  </div>;
}
