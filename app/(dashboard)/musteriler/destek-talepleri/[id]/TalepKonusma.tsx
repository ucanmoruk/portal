"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TalepKonusma — Müşteri ↔ Personel mesajlaşma akışı.
// /api/talepler/[id]/mesajlar  GET (liste) + POST (personel mesajı)
// ─────────────────────────────────────────────────────────────────────────────

interface Mesaj {
  ID: string | number;       // Birleşik ID: "D-1005", "DD-3009", "TM-12" gibi
  kaynak?: string;            // DESTEK | DESTEK_DETAY | TalepMesaj
  GonderenTip: "Musteri" | "Personel" | string;
  GonderenID: number | null;
  GonderenAd: string;
  Mesaj: string;
  Tarih: string;
}

interface KonusmaHeader {
  destekNo: string | null;
  baslik: string | null;
  tur: string | null;
  dosya: string | null;
}

function formatTarih(t: string): string {
  try {
    const d = new Date(t);
    return d.toLocaleString("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return t; }
}

export default function TalepKonusma({ talepId }: { talepId: number }) {
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [header,   setHeader]   = useState<KonusmaHeader | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState("");
  const [yeni,     setYeni]     = useState("");
  const [gonderiyor, setGonderiyor] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/talepler/${talepId}/mesajlar`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json()).error || "Mesajlar alınamadı");
      const j = await r.json();
      setMesajlar(j.data || []);
      setHeader(j.header || null);
      setErr("");
    } catch (e: any) {
      setErr(e.message || "Mesajlar alınamadı");
    } finally {
      setLoading(false);
    }
  }, [talepId]);

  useEffect(() => { load(); }, [load]);

  // Yeni mesaj eklenince en alta kaydır
  useEffect(() => {
    if (!loading && scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [mesajlar.length, loading]);

  // 10 saniyede bir yenile (basit polling — gerçek-zaman istenirse SSE/WS eklenir)
  useEffect(() => {
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const gonder = async () => {
    const mesaj = yeni.trim();
    if (!mesaj || gonderiyor) return;
    setGonderiyor(true);
    try {
      const r = await fetch(`/api/talepler/${talepId}/mesajlar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesaj }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "Mesaj gönderilemedi");
      }
      setYeni("");
      await load();
    } catch (e: any) {
      alert(e.message || "Mesaj gönderilemedi");
    } finally {
      setGonderiyor(false);
    }
  };

  return (
    <section style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border-light)",
      borderRadius: 12,
      padding: "16px 20px",
      marginBottom: 16,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12, letterSpacing: 0.2 }}>
        KONUŞMA
      </h2>

      {/* Konu başlığı + destek no (cosmoroot.DESTEK kaydı) */}
      {header && (header.baslik || header.destekNo) && (
        <div style={{
          marginBottom: 12, padding: "10px 14px",
          background: "var(--color-bg-elevated, #fafafa)",
          border: "1px solid var(--color-border-light)", borderRadius: 8,
        }}>
          {header.baslik && (
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 2 }}>
              {header.baslik}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "flex", gap: 10, flexWrap: "wrap" }}>
            {header.destekNo && <span>Destek No: <strong>{header.destekNo}</strong></span>}
            {header.tur && <span>· {header.tur}</span>}
            {header.dosya && (
              <span>· <a href={header.dosya} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>Ek dosya</a></span>
            )}
          </div>
        </div>
      )}

      {/* Mesaj listesi */}
      <div style={{
        maxHeight: 480, overflowY: "auto",
        padding: "8px 4px", marginBottom: 12,
        display: "flex", flexDirection: "column", gap: 10,
        background: "var(--color-bg, #fafafa)",
        border: "1px solid var(--color-border-light)",
        borderRadius: 8,
      }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
            Yükleniyor…
          </div>
        ) : err ? (
          <div style={{ padding: 24, textAlign: "center", color: "#c62828", fontSize: 13 }}>
            {err}
          </div>
        ) : mesajlar.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
            Henüz mesaj yok. İlk mesajı gönderin.
          </div>
        ) : (
          mesajlar.map(m => {
            const isPersonel = m.GonderenTip === "Personel";
            return (
              <div key={m.ID} style={{
                display: "flex",
                justifyContent: isPersonel ? "flex-end" : "flex-start",
                padding: "0 8px",
              }}>
                <div style={{
                  maxWidth: "75%",
                  background: isPersonel ? "var(--color-accent, #0071e3)" : "var(--color-surface)",
                  color: isPersonel ? "#fff" : "var(--color-text-primary)",
                  border: isPersonel ? "none" : "1px solid var(--color-border-light)",
                  borderRadius: 14,
                  padding: "8px 12px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  wordBreak: "break-word",
                }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    opacity: 0.85,
                    marginBottom: 3,
                  }}>
                    {isPersonel ? (m.GonderenAd || "Personel") : "Müşteri"}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.Mesaj}</div>
                  <div style={{
                    fontSize: 10,
                    marginTop: 4,
                    textAlign: "right",
                    opacity: 0.7,
                  }}>
                    {formatTarih(m.Tarih)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Yeni mesaj formu */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={yeni}
          onChange={e => setYeni(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              gonder();
            }
          }}
          placeholder="Müşteriye mesajınızı yazın…   (Ctrl+Enter ile gönder)"
          rows={3}
          disabled={gonderiyor}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            minHeight: 60,
            background: "var(--color-surface)",
            color: "var(--color-text-primary)",
          }}
        />
        <button
          type="button"
          onClick={gonder}
          disabled={!yeni.trim() || gonderiyor}
          style={{
            padding: "10px 18px",
            background: "var(--color-accent, #0071e3)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: yeni.trim() && !gonderiyor ? "pointer" : "not-allowed",
            opacity: yeni.trim() && !gonderiyor ? 1 : 0.5,
            whiteSpace: "nowrap",
            height: "fit-content",
          }}
        >
          {gonderiyor ? "Gönderiliyor…" : "Gönder"}
        </button>
      </div>
    </section>
  );
}
