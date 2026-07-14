"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Belge = {
  ID: number;
  Tarih: string | null;
  RaporNo: string | number | null;
  NumuneTur: string | null;
  NumuneAd: string | null;
  FirmaAd: string | null;
  Proje: string | null;
  Yol: string | null;
};

const fmtTarih = (t: string | null) => {
  if (!t) return "—";
  const [y, m, d] = t.split("-");
  return d ? `${d}.${m}.${y}` : t;
};

export default function YuklenmisBelgelerClient() {
  const [rows, setRows] = useState<Belge[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [silingId, setSilingId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/musteriler/yuklenmis-belgeler?search=${encodeURIComponent(q)}&limit=100`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Liste alınamadı");
      setRows(Array.isArray(j.data) ? j.data : []);
      setTotal(j.total ?? 0);
    } catch (e: any) {
      setError(e.message || "Liste alınamadı");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(""); }, [load]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(search), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search, load]);

  const sil = async (b: Belge) => {
    if (!window.confirm(`"${b.NumuneAd ?? b.RaporNo}" belgesini geri çekmek istiyor musunuz? Müşteri artık göremeyecek.`)) return;
    setSilingId(b.ID);
    try {
      const r = await fetch(`/api/musteriler/yuklenmis-belgeler/${b.ID}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Silinemedi");
      setRows((rs) => rs.filter((x) => x.ID !== b.ID));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e: any) {
      setError(e.message || "Silinemedi");
    } finally {
      setSilingId(null);
    }
  };

  const gridCols = "90px 100px 110px 1fr 1fr 130px 150px";
  const th = { fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-tertiary)" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rapor no, numune, tür, firma ara…"
          style={{ flex: 1, maxWidth: 360, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)", fontSize: "0.88rem" }}
        />
        <div style={{ fontSize: "0.8rem", color: "var(--color-text-tertiary)" }}>{total} belge</div>
      </div>

      {error && <div style={{ padding: "10px 14px", background: "#ff3b3010", color: "#c00", borderRadius: 8, fontSize: "0.85rem" }}>{error}</div>}

      <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden", overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10, padding: "10px 14px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border-light)", minWidth: 900, ...th }}>
          <div>Tarih</div><div>Rapor No</div><div>Tür</div><div>Numune Adı</div><div>Firma</div><div>Proje</div><div style={{ textAlign: "right" }}>İşlem</div>
        </div>

        {loading ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.9rem" }}>Yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.9rem" }}>Henüz yüklenmiş belge yok.</div>
        ) : (
          rows.map((b) => (
            <div key={b.ID} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10, padding: "10px 14px", alignItems: "center", borderBottom: "1px solid var(--color-border-light)", minWidth: 900, fontSize: "0.83rem" }}>
              <div style={{ color: "var(--color-text-secondary)" }}>{fmtTarih(b.Tarih)}</div>
              <div style={{ fontWeight: 600 }}>{b.RaporNo ?? "—"}</div>
              <div>{b.NumuneTur ?? "—"}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.NumuneAd ?? ""}>{b.NumuneAd ?? "—"}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.FirmaAd ?? ""}>{b.FirmaAd ?? "—"}</div>
              <div style={{ color: "var(--color-text-secondary)" }}>{b.Proje ?? "—"}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {b.Yol && (
                  <a href={b.Yol} target="_blank" rel="noopener noreferrer"
                    style={{ padding: "4px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "0.75rem", textDecoration: "none", color: "var(--color-accent)" }}>
                    Görüntüle
                  </a>
                )}
                <button
                  type="button" onClick={() => sil(b)} disabled={silingId === b.ID}
                  style={{ padding: "4px 10px", border: "1px solid #ff3b3040", borderRadius: 6, fontSize: "0.75rem", background: "transparent", color: "#c00", cursor: silingId === b.ID ? "wait" : "pointer" }}>
                  {silingId === b.ID ? "…" : "Sil"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
