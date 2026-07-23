"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type FirmaSecenek = {
  ID: number;
  Ad: string;
  VergiNo?: string;
  Email?: string;
};

export default function TalepFirmaEslestir({
  talepId,
  firmaKodu,
  firmaAd,
}: {
  talepId: number;
  firmaKodu?: string | null;
  firmaAd?: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<FirmaSecenek[]>([]);
  const [selected, setSelected] = useState<FirmaSecenek | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = search.trim();
    if (q.length < 2) {
      setRows([]);
      return;
    }

    timer.current = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/firmalar?search=${encodeURIComponent(q)}&limit=10`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Firma listesi alınamadı.");
        setRows(Array.isArray(json.data) ? json.data : []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Firma listesi alınamadı.");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [search]);

  const save = async () => {
    if (!selected) {
      setError("Önce bir firma seçmelisin.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/talepler/${talepId}/firma-eslestir`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmaId: selected.ID }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Firma eşleştirilemedi.");
      setMessage(`${json.firmaAd || selected.Ad} firması talebe bağlandı.`);
      setRows([]);
      setSearch("");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Firma eşleştirilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-light)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12, letterSpacing: 0.2 }}>
        FİRMA EŞLEŞTİRME
      </h2>

      <div style={{ display: "grid", gap: 6, marginBottom: 12, fontSize: 13 }}>
        <div><strong>Mevcut firma kodu:</strong> {firmaKodu?.trim() || <em style={{ color: "var(--color-text-tertiary)" }}>Yok</em>}</div>
        <div><strong>Mevcut firma:</strong> {firmaAd?.trim() || <em style={{ color: "var(--color-text-tertiary)" }}>Eşleşmemiş</em>}</div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSelected(null);
            setMessage("");
          }}
          placeholder="Firma adı, vergi no, mail veya telefon ile ara..."
          style={{
            width: "100%",
            padding: "9px 11px",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            background: "var(--color-background, #fff)",
            color: "var(--color-text)",
            fontSize: "0.88rem",
          }}
        />

        {loading && <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Firmalar aranıyor...</div>}

        {rows.length > 0 && (
          <div style={{ border: "1px solid var(--color-border-light)", borderRadius: 8, overflow: "hidden" }}>
            {rows.map((firma) => {
              const active = selected?.ID === firma.ID;
              return (
                <button
                  type="button"
                  key={firma.ID}
                  onClick={() => {
                    setSelected(firma);
                    setSearch(firma.Ad || "");
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 11px",
                    border: "none",
                    borderBottom: "1px solid var(--color-border-light)",
                    background: active ? "var(--color-accent-soft, #0071e312)" : "transparent",
                    color: "var(--color-text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{firma.Ad || `Firma #${firma.ID}`}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                    ID: {firma.ID}{firma.VergiNo ? ` · Vergi: ${firma.VergiNo}` : ""}{firma.Email ? ` · ${firma.Email}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selected && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 10, border: "1px solid var(--color-border-light)", borderRadius: 8 }}>
            <span style={{ fontSize: 13 }}>
              Seçili firma: <strong>{selected.Ad}</strong>
            </span>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--color-accent)",
                background: "var(--color-accent)",
                color: "#fff",
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {saving ? "Kaydediliyor..." : "Eşleştir"}
            </button>
          </div>
        )}

        {message && <div style={{ padding: "9px 11px", borderRadius: 8, background: "#19875414", color: "#157347", fontSize: 12 }}>{message}</div>}
        {error && <div style={{ padding: "9px 11px", borderRadius: 8, background: "#ff3b3010", color: "#c00", fontSize: 12 }}>{error}</div>}
      </div>
    </section>
  );
}
