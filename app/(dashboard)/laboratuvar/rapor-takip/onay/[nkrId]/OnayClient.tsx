"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import styles from "@/app/styles/table.module.css";

interface RaporInfo {
  NkrID: number;
  RaporNo: string;
  NumuneAd: string;
  Tarih: string | null;
  FirmaAd: string;
  RaporFormati: string;
}

interface OnayInfo {
  id: number;
  token: string;
  durum: string;          // "Onaylandı" | "Yayınlandı"
  onayTarihi: string;
  yayinTarihi: string | null;
  yayinUrl: string | null;
  onaylayanAd: string | null;
}

interface ApiData {
  rapor: RaporInfo;
  onay: OnayInfo | null;
}

const formatTarih = (s: string | null | undefined) => {
  if (!s) return "—";
  const v = String(s);
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return v.slice(0, 10);
};

const formatDateTime = (s: string | null | undefined) => {
  if (!s) return "—";
  try {
    // SQL Server DATETIME timezone'suz saklanır; mssql driver JSON'a Z eki
    // ekleyerek UTC sanıyor → new Date() +3 saat ekler. Z'yi soyup local parse.
    const cleaned = typeof s === "string" ? s.replace(/Z$/, "") : s;
    const d = new Date(cleaned);
    if (Number.isNaN(d.getTime())) return String(s);
    return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
  } catch { return String(s); }
};

export default function OnayClient({ nkrId, format }: { nkrId: string; format: string }) {
  const router = useRouter();
  const [data, setData]       = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState<"onayla" | "geri" | "yayinla" | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [yayinUrlInput, setYayinUrlInput] = useState("");
  const [geriNotlar, setGeriNotlar] = useState("");
  // Onaylama yetkisi var mı?
  const [canApprove, setCanApprove] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me/yetki")
      .then(r => r.json())
      .then((j: { isAdmin?: boolean; keys?: string[] }) => {
        const ok = j.isAdmin || (j.keys || []).includes("laboratuvar.rapor-onayla");
        setCanApprove(Boolean(ok));
      })
      .catch(() => setCanApprove(false));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/rapor-takip/${nkrId}/onay-durum?format=${encodeURIComponent(format)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Veri alınamadı");
      setData(j);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [nkrId, format]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Token alındığında QR oluştur
  useEffect(() => {
    const token = data?.onay?.token;
    if (!token || typeof window === "undefined") { setQrDataUrl(""); return; }
    const verifyUrl = `${window.location.origin}/rapor-dogrula/${token}`;
    QRCode.toDataURL(verifyUrl, { width: 240, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [data?.onay?.token]);

  const previewUrl = useMemo(() => {
    if (!format) return "";
    return `/api/rapor-takip/yazdir/${nkrId}?format=${encodeURIComponent(format)}&output=html`;
  }, [nkrId, format]);

  const verifyUrl = useMemo(() => {
    if (!data?.onay?.token || typeof window === "undefined") return "";
    return `${window.location.origin}/rapor-dogrula/${data.onay.token}`;
  }, [data?.onay?.token]);

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
      await fetchData();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const handleGeriGonder = async () => {
    if (busy) return;
    if (!confirm("Rapor 'Kabul Bekleyenler' sekmesine geri gönderilecek. Onay ve kabul kaydı silinecek. Emin misiniz?")) return;
    setBusy("geri"); setError("");
    try {
      const r = await fetch(`/api/rapor-takip/${nkrId}/geri-gonder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, notlar: geriNotlar || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Geri gönderilemedi");
      router.push("/laboratuvar/numune-takip-lab?tab=geri");
    } catch (e: any) {
      setError(e.message);
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
        body: JSON.stringify({ format, yayinUrl: yayinUrlInput || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Yayınlanamadı");
      await fetchData();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const handleDownloadPdf = () => {
    if (!format) return;
    // Şimdilik mevcut yazdır endpoint'i (HTML) — gelecekte karekod gömülü PDF endpoint'i
    window.open(
      `/api/rapor-takip/yazdir/${nkrId}?format=${encodeURIComponent(format)}&output=html&token=${data?.onay?.token || ""}`,
      "_blank", "noopener,noreferrer"
    );
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <p style={{ color: "var(--color-text-secondary)" }}>Yükleniyor…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBar}>{error || "Veri yok"}</div>
        <Link href="/laboratuvar/rapor-takip" className={styles.editBtn}>← Rapor Takip'e dön</Link>
      </div>
    );
  }

  const onay = data.onay;
  const yayinlandi = onay?.durum === "Yayınlandı";

  return (
    <div className={styles.page} style={{ maxWidth: "none", width: "100%" }}>
      {/* Başlık */}
      <div className={styles.pageHeader} style={{ alignItems: "flex-start" }}>
        <div>
          <h1 className={styles.pageTitle}>
            Rapor Önizleme · {data.rapor.RaporNo}
          </h1>
          <p className={styles.pageSubtitle}>
            {data.rapor.FirmaAd || "—"} · {data.rapor.NumuneAd} · <strong>{data.rapor.RaporFormati}</strong>
            {data.rapor.Tarih && <> · {formatTarih(String(data.rapor.Tarih))}</>}
          </p>
        </div>
        <Link href="/laboratuvar/rapor-takip" className={styles.editBtn}
          style={{ width: "auto", padding: "0 12px" }}>
          ← Rapor Takip
        </Link>
      </div>

      {error && <div className={styles.errorBar}>{error}</div>}

      {/* İki sütun: önizleme (sol) + panel (sağ) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 360px",
        gap: 16,
        alignItems: "stretch",
        minHeight: "70vh",
      }}>
        {/* Sol: PDF önizleme */}
        <div style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          overflow: "hidden",
          minHeight: 600,
        }}>
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title="Rapor önizleme"
              style={{ width: "100%", height: "100%", minHeight: 600, border: "none", display: "block" }}
            />
          ) : (
            <div style={{ padding: 24, color: "var(--color-text-tertiary)" }}>
              Önizleme için rapor formatı gerekli.
            </div>
          )}
        </div>

        {/* Sağ: Onay paneli */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Durum kartı */}
          <section style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 16,
          }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 10 }}>
              Onay Durumu
            </div>

            {!onay && (
              <div style={{
                padding: "9px 12px", borderRadius: 9,
                background: "#8e8e9318", color: "#636366",
                fontSize: "0.85rem", fontWeight: 600,
              }}>
                ⏳ Onay Bekliyor
              </div>
            )}
            {onay?.durum === "Onaylandı" && (
              <div style={{
                padding: "9px 12px", borderRadius: 9,
                background: "#34c75918", color: "#248a3d",
                fontSize: "0.85rem", fontWeight: 600,
              }}>
                ✓ Onaylandı
              </div>
            )}
            {yayinlandi && (
              <div style={{
                padding: "9px 12px", borderRadius: 9,
                background: "#0071e318", color: "#0055a8",
                fontSize: "0.85rem", fontWeight: 600,
              }}>
                ✓ Yayınlandı
              </div>
            )}

            {onay && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "100px 1fr", rowGap: 6, fontSize: "0.78rem" }}>
                <span style={{ color: "var(--color-text-tertiary)" }}>Onaylayan</span>
                <span>{onay.onaylayanAd || "—"}</span>
                <span style={{ color: "var(--color-text-tertiary)" }}>Onay Tarihi</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatDateTime(onay.onayTarihi)}</span>
                {yayinlandi && (
                  <>
                    <span style={{ color: "var(--color-text-tertiary)" }}>Yayın</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatDateTime(onay.yayinTarihi)}</span>
                    {onay.yayinUrl && (
                      <>
                        <span style={{ color: "var(--color-text-tertiary)" }}>URL</span>
                        <a href={onay.yayinUrl} target="_blank" rel="noreferrer"
                          style={{ color: "var(--color-accent)", wordBreak: "break-all" }}>
                          {onay.yayinUrl}
                        </a>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {/* Yetki yoksa ve onay yok → bilgilendirme */}
          {!onay && canApprove === false && (
            <section style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: 16,
              fontSize: "0.85rem", color: "var(--color-text-secondary)",
            }}>
              Bu raporu onaylamaya / geri göndermeye yetkiniz yok. Yetkili kullanıcı işlem yaptığında durum bu sayfada güncellenir.
            </section>
          )}

          {/* Aksiyon paneli — sadece yetkili */}
          {!onay && canApprove && (
            <section style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: 16,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              <button
                type="button"
                onClick={handleOnayla}
                disabled={busy !== null}
                style={{
                  padding: "11px 14px", borderRadius: 9, border: "none",
                  background: "var(--color-accent)", color: "#fff",
                  fontSize: "0.92rem", fontWeight: 700, cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy === "onayla" ? "Onaylanıyor…" : "✓ Onayla"}
              </button>
              <p style={{ fontSize: "0.74rem", color: "var(--color-text-tertiary)", margin: 0 }}>
                Onaylanan raporlara benzersiz karekod atanır. Karekod, raporun her kopyasında doğrulanabilir.
              </p>

              <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 10, marginTop: 4 }}>
                <label style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>
                  Geri gönderme notu (opsiyonel)
                </label>
                <textarea
                  value={geriNotlar}
                  onChange={e => setGeriNotlar(e.target.value)}
                  placeholder="Düzeltilmesi gerekenler…"
                  rows={2}
                  style={{
                    width: "100%", marginTop: 4, padding: "6px 8px",
                    border: "1px solid var(--color-border)", borderRadius: 7,
                    fontSize: "0.8rem", background: "var(--color-bg)", resize: "vertical",
                  }}
                />
                <button
                  type="button"
                  onClick={handleGeriGonder}
                  disabled={busy !== null}
                  style={{
                    width: "100%", marginTop: 6,
                    padding: "9px 12px", borderRadius: 8,
                    border: "1px solid #ff3b3040",
                    background: "#ff3b3010", color: "#c00",
                    fontSize: "0.82rem", fontWeight: 600, cursor: busy ? "wait" : "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy === "geri" ? "Gönderiliyor…" : "↩  Geri Gönder"}
                </button>
              </div>
            </section>
          )}

          {/* Onaylanmış — karekod + indir + yayın */}
          {onay && (
            <section style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: 16,
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>
                Karekod
              </div>
              {qrDataUrl ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="Karekod" style={{ width: 160, height: 160 }} />
                  <code style={{ fontSize: "0.68rem", color: "var(--color-text-tertiary)", wordBreak: "break-all", textAlign: "center" }}>
                    {onay.token}
                  </code>
                  {verifyUrl && (
                    <a href={verifyUrl} target="_blank" rel="noreferrer"
                      style={{ fontSize: "0.72rem", color: "var(--color-accent)" }}>
                      Doğrulama sayfasını aç
                    </a>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-tertiary)" }}>QR oluşturuluyor…</div>
              )}

              <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  style={{
                    padding: "10px 12px", borderRadius: 9, border: "none",
                    background: "var(--color-accent)", color: "#fff",
                    fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
                  }}
                >
                  ⬇  PDF İndir
                </button>

                {!yayinlandi ? (
                  <>
                    <input
                      type="text"
                      value={yayinUrlInput}
                      onChange={e => setYayinUrlInput(e.target.value)}
                      placeholder="Yayın URL'si (opsiyonel)"
                      style={{
                        width: "100%", padding: "8px 10px",
                        border: "1px solid var(--color-border)", borderRadius: 7,
                        fontSize: "0.82rem", background: "var(--color-bg)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleYayinla}
                      disabled={busy !== null}
                      style={{
                        padding: "10px 12px", borderRadius: 9, border: "1px solid var(--color-accent)",
                        background: "transparent", color: "var(--color-accent)",
                        fontSize: "0.85rem", fontWeight: 700, cursor: busy ? "wait" : "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy === "yayinla" ? "Yayınlanıyor…" : "↗  Portalda Yayınla"}
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)", textAlign: "center", padding: "6px 0" }}>
                    Bu rapor zaten yayınlandı.
                  </div>
                )}
              </div>

              {canApprove && (
                <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 10 }}>
                  <textarea
                    value={geriNotlar}
                    onChange={e => setGeriNotlar(e.target.value)}
                    placeholder="Geri gönderme notu (opsiyonel)"
                    rows={2}
                    style={{
                      width: "100%", padding: "6px 8px",
                      border: "1px solid var(--color-border)", borderRadius: 7,
                      fontSize: "0.8rem", background: "var(--color-bg)", resize: "vertical",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleGeriGonder}
                    disabled={busy !== null}
                    style={{
                      width: "100%", marginTop: 6,
                      padding: "9px 12px", borderRadius: 8,
                      border: "1px solid #ff3b3040",
                      background: "#ff3b3010", color: "#c00",
                      fontSize: "0.8rem", fontWeight: 600, cursor: busy ? "wait" : "pointer",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    {busy === "geri" ? "Gönderiliyor…" : "↩  Geri Gönder (laboratuvara)"}
                  </button>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
