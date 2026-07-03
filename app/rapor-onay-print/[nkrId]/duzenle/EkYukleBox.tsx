"use client";

import { useEffect, useRef, useState } from "react";

type Ek = { ekUrl: string; ekToken: string | null } | null;

// "Diğer" formatı raporlar için Ek-1 PDF yükleme kutusu.
// Yüklenen PDF, yayın/imza anında raporun ilk sayfasının arkasına eklenir.
export default function EkYukleBox({
  nkrId,
  format,
  locked,
}: {
  nkrId: number;
  format: string;
  locked: boolean;
}) {
  const [ek, setEk] = useState<Ek>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const base = `/api/rapor-takip/${nkrId}/ek-yukle?format=${encodeURIComponent(format)}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(base, { cache: "no-store" });
        const j = await r.json();
        if (alive) setEk(j.ek ?? null);
      } catch { /* yoksay */ }
    })();
    return () => { alive = false; };
  }, [base]);

  const upload = async (file: File) => {
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const r = await fetch(base, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Yüklenemedi");
      setEk(j.ek ?? null);
    } catch (e: any) {
      setError(e.message || "Yüklenemedi");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Ek-1 PDF kaldırılsın mı?")) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(base, { method: "DELETE" });
      if (!r.ok) throw new Error("Kaldırılamadı");
      setEk(null);
    } catch (e: any) {
      setError(e.message || "Kaldırılamadı");
    } finally {
      setBusy(false);
    }
  };

  const box: React.CSSProperties = {
    maxWidth: 1100, margin: "12px auto 0", padding: "14px 16px",
    background: "#fff", border: "1px solid #e5e5ea", borderRadius: 12,
    display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
  };
  const btn = (bg: string, fg: string): React.CSSProperties => ({
    padding: "7px 14px", borderRadius: 8, border: "none", background: bg, color: fg,
    fontWeight: 600, fontSize: 13, cursor: busy || locked ? "not-allowed" : "pointer",
    opacity: busy || locked ? 0.6 : 1,
  });

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>📎 Ek-1 PDF</div>
      <div style={{ fontSize: 12, color: "#6e6e73", flex: 1, minWidth: 200 }}>
        Bu &quot;Diğer&quot; raporun ilk sayfasının arkasına eklenecek PDF. Yayın/imza anında birleştirilir.
      </div>

      {ek?.ekUrl ? (
        <>
          <a href={ek.ekUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: "#0071e3", textDecoration: "none", fontWeight: 600 }}>
            ✓ Yüklü — Görüntüle
          </a>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || locked} style={btn("#f2f2f7", "#1d1d1f")}>
            Değiştir
          </button>
          <button type="button" onClick={remove} disabled={busy || locked} style={btn("transparent", "#c00")}>
            Kaldır
          </button>
        </>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || locked} style={btn("#0071e3", "#fff")}>
          {busy ? "Yükleniyor…" : "Ek-1 PDF Yükle"}
        </button>
      )}

      <input
        ref={inputRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
      />
      {locked && <span style={{ fontSize: 12, color: "#c06800" }}>Rapor kilitli — değişiklik için revize edin.</span>}
      {error && <span style={{ fontSize: 12, color: "#c00" }}>{error}</span>}
    </div>
  );
}
