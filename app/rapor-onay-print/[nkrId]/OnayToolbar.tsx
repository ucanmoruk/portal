"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface OnayInfo {
  token: string;
  durum: string;
  onayTarihi: string;
  yayinTarihi: string | null;
  yayinUrl: string | null;
  onaylayanAd: string | null;
}

interface Props {
  nkrId: number;
  format: string;
  initialOnay: OnayInfo | null;
  raporNo: string;
}

export default function OnayToolbar({ nkrId, format, initialOnay, raporNo }: Props) {
  const [onay, setOnay] = useState<OnayInfo | null>(initialOnay);
  const [canApprove, setCanApprove] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"onayla" | "geri" | "yayinla" | "imzali" | null>(null);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showGeriModal, setShowGeriModal] = useState(false);
  const [geriNotlar, setGeriNotlar] = useState("");
  const [yayinUrl, setYayinUrl] = useState("");

  // Yetki kontrolü
  useEffect(() => {
    fetch("/api/me/yetki", { cache: "no-store" })
      .then(r => r.json())
      .then((j: { isAdmin?: boolean; keys?: string[] }) => {
        const ok = j.isAdmin || (j.keys || []).includes("laboratuvar.rapor-onayla");
        setCanApprove(Boolean(ok));
      })
      .catch(() => setCanApprove(false));
  }, []);

  // QR kod
  useEffect(() => {
    if (!onay?.token || typeof window === "undefined") { setQrDataUrl(""); return; }
    const url = `${window.location.origin}/rapor-dogrula/${onay.token}`;
    QRCode.toDataURL(url, { width: 200, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [onay?.token]);

  const handleOnayla = async () => {
    if (busy) return;
    setBusy("onayla"); setError("");
    try {
      const r = await fetch(`/api/rapor-takip/${nkrId}/onayla`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Onaylanamadı");
      // Refresh
      const dRes = await fetch(`/api/rapor-takip/${nkrId}/onay-durum?format=${encodeURIComponent(format)}`, { cache: "no-store" });
      const dJson = await dRes.json();
      if (dJson.onay) setOnay(dJson.onay);
      // Sayfayı yeniden yükle → yeni onay durumu ile rapor altı imza alanı dolu görünür
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally { setBusy(null); }
  };

  const handleGeriGonder = async () => {
    if (busy) return;
    setBusy("geri"); setError("");
    try {
      const r = await fetch(`/api/rapor-takip/${nkrId}/geri-gonder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, notlar: geriNotlar || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Geri gönderilemedi");
      // Geri Gelenler tabına yönlendir
      window.location.href = "/laboratuvar/numune-takip-lab?tab=geri";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Hata");
      setBusy(null);
    }
  };

  const handleYayinla = async () => {
    if (busy) return;
    setBusy("yayinla"); setError("");
    try {
      const r = await fetch(`/api/rapor-takip/${nkrId}/yayinla`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, yayinUrl: yayinUrl || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Yayınlanamadı");
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally { setBusy(null); }
  };

  const handleDownloadPdf = () => {
    // Bu sayfayı print dialog'una aç (toolbar print'te @media print ile gizli)
    window.print();
  };

  // Sunucuda üretilip dijital imzalı (PAdES) PDF'i indirir.
  // İçeriği bu önizleme ile birebir aynıdır (ortak loadRaporViewData).
  const handleDownloadSignedPdf = async () => {
    if (busy) return;
    setBusy("imzali"); setError("");
    try {
      const r = await fetch(
        `/api/rapor-takip/${nkrId}/imzali-pdf?format=${encodeURIComponent(format)}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "İmzalı PDF oluşturulamadı");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rapor-${raporNo || nkrId}-imzali.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally { setBusy(null); }
  };

  const handleClose = () => window.close();

  const yayinlandi = onay?.durum === "Yayınlandı";
  const onaylandi = onay?.durum === "Onaylandı" || yayinlandi;

  return (
    <>
      <div className="onay-toolbar" style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#1d1d1f", padding: "10px 24px",
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}>
        {/* Sol — başlık */}
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginRight: 8 }}>
          Rapor: <span style={{ color: "#0071e3" }}>{raporNo}</span>
          <span style={{ marginLeft: 10, padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: yayinlandi ? "#bf5af220" : onaylandi ? "#34c75920" : "#ff950020",
            color:      yayinlandi ? "#d68bff" : onaylandi ? "#7be39a" : "#ffbe66",
          }}>
            {yayinlandi ? "✓ Yayınlandı" : onaylandi ? "✓ Onaylandı" : "Onay Bekleniyor"}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Eylem butonları */}
        {!onaylandi && canApprove && (
          <>
            <button
              type="button"
              onClick={handleOnayla}
              disabled={busy !== null}
              style={{
                padding: "8px 18px", borderRadius: 8, border: "none",
                background: "#34c759", color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy === "onayla" ? "Onaylanıyor…" : "✓ Onayla"}
            </button>
            <button
              type="button"
              onClick={() => setShowGeriModal(true)}
              disabled={busy !== null}
              style={{
                padding: "8px 18px", borderRadius: 8,
                background: "transparent", color: "#ff453a",
                border: "1px solid #ff453a55",
                fontSize: 13, fontWeight: 600, cursor: busy ? "wait" : "pointer",
              }}
            >
              ↩ Geri Gönder
            </button>
          </>
        )}

        {!onaylandi && canApprove === false && (
          <span style={{ color: "#ffbe66", fontSize: 12 }}>
            Onaylama yetkiniz yok — sadece görüntüleme
          </span>
        )}

        {onaylandi && (
          <>
            <button
              type="button"
              onClick={handleDownloadPdf}
              style={{
                padding: "8px 18px", borderRadius: 8, border: "none",
                background: "#0071e3", color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              ⬇ PDF İndir
            </button>
            <button
              type="button"
              onClick={handleDownloadSignedPdf}
              disabled={busy !== null}
              title="Sunucuda üretilen, dijital imzalı (kurcalamaya karşı korumalı) PDF"
              style={{
                padding: "8px 18px", borderRadius: 8, border: "none",
                background: "#34c759", color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy === "imzali" ? "Hazırlanıyor…" : "🔒 İmzalı PDF İndir"}
            </button>
            {!yayinlandi && canApprove && (
              <>
                <input
                  type="text"
                  value={yayinUrl}
                  onChange={e => setYayinUrl(e.target.value)}
                  placeholder="Yayın URL (opsiyonel)"
                  style={{
                    padding: "7px 10px", borderRadius: 8,
                    border: "1px solid #ffffff33", background: "#ffffff10", color: "#fff",
                    fontSize: 12, minWidth: 180,
                  }}
                />
                <button
                  type="button"
                  onClick={handleYayinla}
                  disabled={busy !== null}
                  style={{
                    padding: "8px 18px", borderRadius: 8,
                    background: "transparent", color: "#bf5af2",
                    border: "1px solid #bf5af255",
                    fontSize: 13, fontWeight: 600, cursor: busy ? "wait" : "pointer",
                  }}
                >
                  {busy === "yayinla" ? "Yayınlanıyor…" : "↗ Portalda Yayınla"}
                </button>
              </>
            )}
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR" title={`Doğrulama: ${onay?.token}`}
                style={{ height: 36, width: 36, background: "#fff", padding: 2, borderRadius: 4 }} />
            )}
          </>
        )}

        <button
          type="button"
          onClick={handleClose}
          style={{
            padding: "8px 12px", borderRadius: 8,
            background: "transparent", color: "#fff",
            border: "1px solid #ffffff33",
            fontSize: 12, cursor: "pointer",
          }}
          title="Sekmeyi kapat"
        >
          ✕
        </button>
      </div>

      {error && (
        <div className="onay-toolbar" style={{
          background: "#ff453a", color: "#fff", padding: "8px 24px", fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Geri Gönder modal */}
      {showGeriModal && (
        <div
          className="onay-toolbar"
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.6)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={() => setShowGeriModal(false)}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 14, padding: 24,
            maxWidth: 480, width: "100%",
          }}>
            <h3 style={{ margin: 0, marginBottom: 8, fontSize: 16 }}>Raporu Geri Gönder</h3>
            <p style={{ fontSize: 13, color: "#6e6e73", marginBottom: 14 }}>
              Rapor &quot;Geri Gelenler&quot; sekmesine düşer. Notunuz lab&apos;a iletilir.
            </p>
            <textarea
              value={geriNotlar}
              onChange={e => setGeriNotlar(e.target.value)}
              placeholder="Düzeltilmesi gereken konular…"
              rows={4}
              style={{
                width: "100%", padding: 10, borderRadius: 8,
                border: "1px solid #d2d2d7", fontSize: 13,
                fontFamily: "inherit", resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowGeriModal(false)}
                disabled={busy !== null}
                style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: "1px solid #d2d2d7", background: "#fff",
                  fontSize: 13, cursor: "pointer",
                }}
              >Vazgeç</button>
              <button
                type="button"
                onClick={handleGeriGonder}
                disabled={busy !== null}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: "#ff453a", color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                }}
              >
                {busy === "geri" ? "Gönderiliyor…" : "Geri Gönder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
