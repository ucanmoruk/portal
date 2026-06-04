"use client";

import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TeklifOnayDocument — TAŞINABİLİR teklif onay/red kartı (müşteri portalı için).
//
// Saf sunum + iki callback. DB/session bağımlılığı YOK → müşteri portalına AYNEN
// kopyalanır. Müşteri (Firma oturumlu) bu kartla teklifi onaylar veya red/revizyon
// talebi iletir. Yazma işlemini (TeklifBaslik.TeklifDurum + TeklifOnayLog) consumer
// kendi server action'ında yapar (bkz. docs/musteri-portali-teklif-sozlesmesi.md §11).
//
// İç portaldaki e-posta/token akışı ayrıdır; müşteri portalında GÜVENLİK = Firma
// oturumu + (MusteriID = firmaId) kontrolü → ayrı token gerekmez.
// ─────────────────────────────────────────────────────────────────────────────

export interface OnayTeklif {
  no: string;            // ÜGAM-26-XXXXX/00 (DisTeklifKodu + RevNo)
  musteriAd: string;
  musteriYetkili?: string;
  tarih: string;         // dd.MM.yyyy
  durum?: string;        // 'Onay Bekleniyor' vb.
}

export interface OnayKarar {
  aksiyon: "Onaylandı" | "Reddedildi";
  tarih?: string;
  firmaAd?: string;
  yetkili?: string;
  ip?: string;
}

export default function TeklifOnayDocument({
  teklif,
  karar = null,
  onApprove,
  onReject,
  sirketEmail = "info@uniqueanalyse.com",
}: {
  teklif: OnayTeklif;
  /** Doluysa karar zaten verilmiş → "tek kullanım" durumu gösterilir. */
  karar?: OnayKarar | null;
  onApprove?: () => Promise<void> | void;
  onReject?: (aciklama: string) => Promise<void> | void;
  sirketEmail?: string;
}) {
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [aciklama, setAciklama] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<OnayKarar | null>(karar);

  const handleApprove = async () => {
    if (busy) return;
    setBusy("approve"); setErr("");
    try {
      await onApprove?.();
      setDone({ aksiyon: "Onaylandı", tarih: new Date().toLocaleDateString("tr-TR") });
    } catch (e: any) { setErr(e?.message || "İşlem başarısız."); }
    finally { setBusy(null); }
  };

  const handleReject = async () => {
    if (busy) return;
    if (!aciklama.trim()) { setErr("Red / revizyon açıklaması zorunludur."); return; }
    setBusy("reject"); setErr("");
    try {
      await onReject?.(aciklama.trim());
      setDone({ aksiyon: "Reddedildi", tarih: new Date().toLocaleDateString("tr-TR") });
    } catch (e: any) { setErr(e?.message || "İşlem başarısız."); }
    finally { setBusy(null); }
  };

  const isReject = done?.aksiyon === "Reddedildi";

  return (
    <>
      <style>{`
        .onay-root { margin: 0; background: #f5f5f7; color: #1d1d1f;
          font-family: 'JetBrains Mono','Cascadia Mono',Consolas,'Courier New',monospace;
          font-size: 12px; line-height: 1.55; min-height: 100vh;
          display: flex; align-items: center; justify-content: center; padding: 28px 14px; }
        .onay-page { width: 760px; max-width: 100%; background: #fff; padding: 46px 42px 34px; box-shadow: 0 14px 42px rgba(0,0,0,.10); }
        .onay-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-bottom: 28px; border-bottom: 1px solid #d6dee8; }
        .onay-logo { height: 45px; width: auto; display: block; }
        .onay-title { font-size: 21px; font-weight: 900; letter-spacing: .8px; padding-top: 13px; text-align: right; }
        .onay-meta { width: 100%; border-collapse: collapse; margin: 22px 0 26px; }
        .onay-meta td { padding: 4px 0; vertical-align: top; }
        .onay-label { font-weight: 800; width: 130px; }
        .onay-box { border: 2px solid #4A46E5; padding: 16px 18px; margin: 20px 0 22px; }
        .onay-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; margin-top: 22px; }
        .onay-btn { width: 100%; border: 0; border-radius: 6px; padding: 12px 16px; font: inherit; font-weight: 800; cursor: pointer; }
        .onay-btn:disabled { opacity: .55; cursor: default; }
        .onay-approve { background: #4A46E5; color: #fff; }
        .onay-reject { background: #fff; color: #b42318; border: 1.5px solid #d92d20; }
        .onay-ta { width: 100%; min-height: 96px; resize: vertical; border: 1px solid #cfd6e4; border-radius: 6px; padding: 10px; font: inherit; margin-bottom: 10px; }
        .onay-hint { color: #6e6e73; font-size: 10.5px; margin: 8px 0 0; }
        .onay-err { color: #b42318; font-size: 11px; margin: 10px 0 0; font-weight: 700; }
        .onay-footer { display: flex; justify-content: space-between; gap: 14px; margin-top: 34px; padding-top: 16px; border-top: 1px solid #d6dee8; color: #6e6e73; font-size: 9px; }
        @media (max-width: 640px) {
          .onay-page { padding: 30px 22px; }
          .onay-header, .onay-footer { display: block; }
          .onay-title { text-align: left; padding-top: 22px; }
          .onay-actions { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="onay-root">
        <section className="onay-page">
          <div className="onay-header">
            <img className="onay-logo" src="/unique-logo.png" alt="Unique" />
            <div className="onay-title">TEKLİF ONAYI</div>
          </div>

          <table className="onay-meta">
            <tbody>
              <tr>
                <td className="onay-label">Referans No:</td>
                <td style={{ whiteSpace: "nowrap", fontWeight: 700 }}>{teklif.no}</td>
                <td style={{ textAlign: "right" }}>{teklif.tarih || "-"}</td>
              </tr>
            </tbody>
          </table>

          {done ? (
            // ── Karar verilmiş / başarı durumu ──
            <div className="onay-box">
              <h1 style={{ margin: "0 0 8px", fontSize: 18, color: isReject ? "#b42318" : "#15803d" }}>
                {isReject ? "Teklif reddedildi / revizyon talep edildi" : "Teklif onaylandı"}
              </h1>
              <p style={{ margin: 0 }}>
                <strong>{teklif.no}</strong> referanslı teklif için işleminiz tamamlandı ve kayıt altına alındı.
              </p>
              <div style={{ marginTop: 14, fontSize: 11, lineHeight: 1.7 }}>
                <div><strong>Karar:</strong> {done.aksiyon}</div>
                {done.tarih && <div><strong>Tarih:</strong> {done.tarih}</div>}
                {done.firmaAd && <div><strong>Firma:</strong> {done.firmaAd}</div>}
                {done.yetkili && <div><strong>Yetkili:</strong> {done.yetkili}</div>}
              </div>
            </div>
          ) : (
            // ── Onay formu ──
            <>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Sayın,</div>
              <div style={{ fontWeight: 900 }}>{teklif.musteriAd || "-"}</div>
              {teklif.musteriYetkili && <div>{teklif.musteriYetkili}</div>}
              <div className="onay-box">
                <div><strong>Firma:</strong> {teklif.musteriAd || "-"}</div>
                <div><strong>Yetkili:</strong> {teklif.musteriYetkili || "-"}</div>
                <div><strong>Durum:</strong> {teklif.durum || "-"}</div>
              </div>
              <p>Bu teklif için onay verebilir veya revizyon/red talebinizi açıklama ile iletebilirsiniz.</p>

              <div className="onay-actions">
                <div>
                  <button className="onay-btn onay-approve" disabled={!!busy} onClick={handleApprove}>
                    {busy === "approve" ? "Gönderiliyor…" : "ONAYLIYORUM"}
                  </button>
                </div>
                <div>
                  <textarea className="onay-ta" placeholder="Red / revizyon açıklaması"
                    value={aciklama} onChange={e => setAciklama(e.target.value)} required />
                  <button className="onay-btn onay-reject" disabled={!!busy} onClick={handleReject}>
                    {busy === "reject" ? "Gönderiliyor…" : "RED / REVİZYON TALEBİ"}
                  </button>
                </div>
              </div>
              {err && <p className="onay-err">{err}</p>}
              <p className="onay-hint">Bu işlem IP, tarih ve firma bilgisi ile kayıt altına alınır.</p>
            </>
          )}

          <div className="onay-footer">
            <span>{sirketEmail}</span>
            <span>F.01.PR.03 – Yayın Tarihi: 27.09.2023</span>
          </div>
        </section>
      </div>
    </>
  );
}
