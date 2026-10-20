"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { getPaymentAutomationOverview } from "@/lib/paymentReminders";
import styles from "./otomasyonlar.module.css";

type Overview = Awaited<ReturnType<typeof getPaymentAutomationOverview>>;
const stateLabel = (value: string) => ({ sent: "Gönderildi", completed: "Tamamlandı", sending: "İşlem kaydı var", uncertain: "Kontrol gerekiyor", failed: "Başarısız", missing: "Henüz gönderim kaydı yok" }[value] || value);
const kindLabel = (value: string) => ({ report: "Günlük rapor", reminder: "Müşteri hatırlatması", run: "Otomasyon çalışması" }[value] || value);
const time = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }) : "Kayıt yok";

export default function AutomationMonitor() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const load = useCallback(async (signal?: AbortSignal) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/otomasyonlar", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kayıtlar alınamadı.");
      setOverview(data);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Kayıtlar alınamadı.");
    } finally { if (!signal?.aborted) setBusy(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const records = overview?.deliveries.filter(item => filter === "all" || item.type === filter) || [];
  const ready = overview && Object.values(overview.configuration).every(Boolean);
  return <>
    <div className={styles.toolbar}><span role="status">{busy ? "Kayıtlar yükleniyor…" : "Gönderim kayıtları güncel listeye göre gösteriliyor."}</span><button type="button" onClick={() => void load()} disabled={busy}>Yenile</button></div>
    {error && <p role="alert" className={styles.warning}>{error} {overview && "Önceki kayıtlar gösteriliyor."}</p>}
    {overview && <>
      <section className={styles.panel} aria-labelledby="payment-title">
        <div className={styles.sectionHeader}><h2 id="payment-title">Ödeme vadesi raporu</h2><span className={styles.badge}>{ready ? "Yapılandırma hazır" : "Kurulum eksik"}</span></div>
        <p>Bugün vadesi gelen ve geciken Unique faturaları; kısmi ödemeler ve cari mahsuplar düşülerek raporlanır.</p>
        <div className={styles.facts}>
          <div><span>Planlanan gönderim</span><strong>{overview.schedule}</strong><small>Türkiye saati · {overview.timeZone}</small></div>
          <div><span>Rapor alıcıları</span>{overview.recipients.map(recipient => <strong key={recipient}>{recipient}</strong>)}</div>
          <div><span>Son çalışma</span><strong>{time(overview.lastRun?.at || null)}</strong><small>{overview.lastRun ? stateLabel(overview.lastRun.state) : "Henüz zamanlayıcı çalışma kaydı yok"}</small></div>
        </div>
        <p className={styles.notice}>Günlük cron'a ek olarak uygulama çalışırken Türkiye saatiyle 09.00'dan sonra eksik raporlar 5 dakikada bir yeniden denenir. Uygulama kapalıyken sunucu cron'u gerekir. Sonucu belirsiz iç raporlar tekrar gönderilebilir.</p>
        <ul className={styles.checks}>
          <li><span>E-posta ayarları</span><strong>{overview.configuration.smtpReady ? "Tanımlı" : "Eksik"}</strong></li>
          <li><span>Portal bağlantısı</span><strong>{overview.configuration.portalReady ? "Tanımlı" : "Eksik"}</strong></li>
          <li><span>Zamanlayıcı erişim anahtarı</span><strong>{overview.configuration.cronSecretReady ? "Tanımlı" : "Eksik"}</strong></li>
        </ul>
        {!ready && <p><Link href="/admin/ayarlar">E-posta ayarlarını aç</Link> · Portal bağlantısı ve zamanlayıcı anahtarı sunucu yapılandırmasından tamamlanır.</p>}
      </section>
      <section className={styles.panel} aria-labelledby="today-title">
        <h2 id="today-title">Bugünkü rapor gönderimleri</h2>
        <div className={styles.recipients}>{overview.todayReports.map(report => <div key={report.recipient}><strong>{report.recipient}</strong><span className={styles.badge} data-state={report.state}>{stateLabel(report.state)}</span></div>)}</div>
        <p className={styles.muted}>Müşteri hatırlatmaları yalnızca sizin seçiminiz ve gönderim onayınızla iletilir. Gönderildi durumu e-posta sunucusunun kabulünü gösterir.</p>
      </section>
      <section className={styles.panel} aria-labelledby="history-title">
        <div className={styles.sectionHeader}><h2 id="history-title">Çalışma ve gönderim geçmişi</h2><label>Göster <select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Tüm kayıtlar</option><option value="run">Otomasyon çalışmaları</option><option value="report">Günlük raporlar</option><option value="reminder">Müşteri hatırlatmaları</option></select></label></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Zaman (Türkiye)</th><th>İşlem</th><th>Alıcı / Fatura</th><th>Durum</th><th>Onay</th></tr></thead><tbody>
          {records.length ? records.map(item => <tr key={item.key}>
            <td>{time(item.at)}</td><td>{kindLabel(item.type)}</td><td>{item.recipient || "Günlük rapor görevi"}{item.invoiceNo && <small>{item.company} · {item.invoiceNo}{item.balance !== null && ` · ${item.balance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL`}</small>}</td>
            <td><span className={styles.badge} data-state={item.state}>{stateLabel(item.state)}</span>{item.note && <small>{item.note}</small>}</td><td>{item.approvedBy === "2" ? "Oğuzhan · onaylı" : item.approvedBy ? `Kullanıcı #${item.approvedBy}` : "Otomatik rapor"}</td>
          </tr>) : <tr><td colSpan={5}>Henüz kayıt bulunmuyor.</td></tr>}
        </tbody></table></div>
        <p className={styles.muted}>Son 100 rapor, 100 müşteri hatırlatması ve 30 çalışma kaydı listelenir. Başarısız veya sonucu belirsiz iç raporlar yeniden denenir. Müşteri hatırlatmaları otomatik tekrarlanmaz.</p>
      </section>
    </>}
  </>;
}
