"use client";

import { useCallback, useEffect, useState } from "react";
import type { DueInvoice } from "@/lib/paymentReminderRules";
import styles from "@/app/styles/table.module.css";

const money = (value: number) => `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL`;
const status = (state?: string) => ({ sent: "Gönderildi", sending: "Gönderim kaydı var", uncertain: "Sonuç belirsiz; kayıt kontrol edilmeli" }[state || ""] || "Onay bekliyor");

export default function PaymentReminderClient() {
  const [invoices, setInvoices] = useState<DueInvoice[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError(""); setSelected([]); setReview(false);
    try {
      const response = await fetch("/api/payment-reminders", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setInvoices(data.invoices);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Liste yüklenemedi."); setInvoices([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const chosen = invoices.filter(invoice => selected.includes(invoice.id));

  async function send() {
    setSending(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/payment-reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: true, invoices: chosen.map(({ id, fingerprint }) => ({ id, fingerprint })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.results.map((result: { id: number; message: string }) => `Fatura #${result.id}: ${result.message}`).join("\n"));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı; listeyi yenileyin."); }
    finally { setSending(false); }
  }

  return <>
    <div style={{ display: "flex", gap: 12, margin: "20px 0" }}>
      <button type="button" className={styles.cancelBtn} disabled={loading || sending} onClick={() => { setMessage(""); void load(); }}>Listeyi yenile</button>
      <button type="button" className={styles.saveBtn} disabled={loading || sending || !chosen.length || chosen.length > 10} onClick={() => setReview(true)}>Seçilenleri incele ({chosen.length}/10)</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status" style={{ whiteSpace: "pre-wrap" }}>{message}</p>}
    {review && <section aria-label="Gönderim onayı" style={{ border: "1px solid #d1d5db", padding: 20, borderRadius: 8, marginBottom: 20 }}>
      <h2>Gönderilecek ödeme hatırlatmaları</h2>
      <p>Her seçilen fatura için aşağıdaki adrese ayrı e-posta gönderilir. Göndermeden önce güncel bakiye ve alıcı tekrar kontrol edilir.</p>
      <ul>{chosen.map(invoice => <li key={invoice.id}>{invoice.company} · {invoice.invoiceNo} · {money(invoice.balance)} → {invoice.email}</li>)}</ul>
      <p><strong>Konu:</strong> Ödeme Hatırlatması — Fatura numarası</p>
      <p>Sayın Yetkili,<br />Kayıtlarımızda aşağıdaki faturanızın ödeme vadesine ulaştığı ve açık bakiyesi bulunduğu görülmektedir. Ödeme planınız hakkında bilgi paylaşmanızı rica ederiz. Ödemenizi gerçekleştirdiyseniz dekontunuzu iletebilirsiniz.</p>
      <p>E-postaya firma, fatura, vade, gecikme günü, açık bakiye ve mevcut fatura e-postalarındaki banka bilgileri eklenir.</p>
      <button type="button" className={styles.saveBtn} disabled={sending} onClick={() => void send()}>{sending ? "Gönderiliyor…" : "Onaylıyorum, seçilenlere gönder"}</button>{" "}
      <button type="button" className={styles.cancelBtn} disabled={sending} onClick={() => setReview(false)}>Vazgeç</button>
    </section>}
    {loading ? <p role="status">Yükleniyor…</p> : <div style={{ overflowX: "auto" }}><table className={styles.table}>
      <thead><tr><th>Seç</th><th>Firma</th><th>Fatura</th><th>Vade</th><th>Gecikme (gün)</th><th>Açık bakiye</th><th>Alıcı</th><th>Bugünkü gönderim</th></tr></thead>
      <tbody>{!invoices.length ? <tr><td colSpan={8}>Vadesi gelen açık fatura bulunmuyor.</td></tr> : invoices.map(invoice => <tr key={invoice.id}>
        <td><input type="checkbox" aria-label={`${invoice.invoiceNo} için hatırlatma seç`} checked={selected.includes(invoice.id)} disabled={sending || review || !invoice.email || !!invoice.deliveryState || (!selected.includes(invoice.id) && selected.length >= 10)} onChange={event => setSelected(current => event.target.checked ? [...current, invoice.id] : current.filter(id => id !== invoice.id))} /></td>
        <td>{invoice.company}</td><td>{invoice.invoiceNo}</td><td>{invoice.dueDate.split("-").reverse().join(".")}</td><td>{invoice.daysLate}</td><td>{money(invoice.balance)}</td><td>{invoice.email || "Geçerli e-posta yok"}</td><td>{status(invoice.deliveryState)}</td>
      </tr>)}</tbody>
    </table></div>}
  </>;
}
