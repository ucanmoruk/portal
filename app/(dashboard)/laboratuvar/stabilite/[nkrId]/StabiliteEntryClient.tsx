"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/styles/table.module.css";
import { DEFAULT_STABILITE_VERI } from "@/lib/stabiliteDefault";

// Stabilite matris veri modeli (StabiliteReport.tsx ile aynı şekil).
interface Test {
  ad: string;
  birim: string;
  metot: string;
  limit: string;
  akredite: boolean;
  sonuclar: Record<string, string>; // "gun|sicaklik"
}
interface Veri {
  gunler: number[];
  sicakliklar: string[];
  degerlendirme: string;
  testler: Test[];
}

const GUN_SECENEK = [1, 28, 45, 90];
const SICAKLIK_SECENEK = ["4°C", "25°C", "45°C"];
const VARSAYILAN_DEG =
  "90 günlük hızlandırılmış stabilite testi sonucunda ürünün ilgili limitlere uygun olduğu ve stabil olduğu gözlemlendi.";

const bos: Veri = { gunler: [1, 90], sicakliklar: ["4°C", "25°C", "45°C"], degerlendirme: VARSAYILAN_DEG, testler: [] };

const inputSt: React.CSSProperties = {
  padding: "5px 7px", borderRadius: 6, border: "1px solid var(--color-border)",
  fontSize: 12, background: "var(--color-bg-elevated,#fff)", color: "inherit", width: "100%",
};

export default function StabiliteEntryClient({ nkrId, format }: { nkrId: number; format: string }) {
  const [veri, setVeri] = useState<Veri>(bos);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Test arama (katalogtan ekle)
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/rapor-takip/${nkrId}/stabilite?format=${encodeURIComponent(format)}`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (j.veri && typeof j.veri === "object" && Array.isArray(j.veri.testler)) {
          // Kayıtlı veri var → onu yükle
          setVeri({ ...bos, ...j.veri });
        } else {
          // Kayıt yok → önizlemedeki varsayılan testlerle doldur (kullanıcı siler/ekler)
          setVeri(JSON.parse(JSON.stringify(DEFAULT_STABILITE_VERI)) as Veri);
        }
      })
      .catch(() => setVeri(JSON.parse(JSON.stringify(DEFAULT_STABILITE_VERI)) as Veri))
      .finally(() => setLoading(false));
  }, [nkrId, format]);

  // ── Config ──
  const toggleGun = (g: number) =>
    setVeri(v => ({ ...v, gunler: v.gunler.includes(g) ? v.gunler.filter(x => x !== g) : [...v.gunler, g].sort((a, b) => a - b) }));
  const toggleSic = (s: string) =>
    setVeri(v => ({ ...v, sicakliklar: v.sicakliklar.includes(s) ? v.sicakliklar.filter(x => x !== s) : [...v.sicakliklar, s] }));
  const [ozelGun, setOzelGun] = useState("");
  const addOzelGun = () => {
    const n = parseInt(ozelGun, 10);
    if (Number.isFinite(n) && n > 0 && !veri.gunler.includes(n)) {
      setVeri(v => ({ ...v, gunler: [...v.gunler, n].sort((a, b) => a - b) }));
    }
    setOzelGun("");
  };
  const [ozelSic, setOzelSic] = useState("");
  const addOzelSic = () => {
    const s = ozelSic.trim();
    if (s && !veri.sicakliklar.includes(s)) setVeri(v => ({ ...v, sicakliklar: [...v.sicakliklar, s] }));
    setOzelSic("");
  };

  // ── Testler ──
  const searchHizmet = (val: string) => {
    setQ(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!val.trim()) { setOpts([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/teklifler/lookup?type=hizmetler&q=${encodeURIComponent(val)}`);
        const j = await r.json();
        setOpts(j.data || []);
      } finally { setSearching(false); }
    }, 250);
  };
  const addTest = (h: any) => {
    // Metot/birim/limit/akreditasyon DOĞRUDAN hizmet listesinden gelir.
    const t: Test = {
      ad: h.Ad || "",
      birim: h.Birim || "",
      metot: h.Metot || "",
      limit: h.Limit || "",
      akredite: String(h.Akreditasyon || "").trim().toLowerCase() === "var",
      sonuclar: {},
    };
    setVeri(v => ({ ...v, testler: [...v.testler, t] }));
    setQ(""); setOpts([]);
  };
  const addBosTest = () =>
    setVeri(v => ({ ...v, testler: [...v.testler, { ad: "", birim: "", metot: "", limit: "", akredite: false, sonuclar: {} }] }));
  const removeTest = (i: number) => setVeri(v => ({ ...v, testler: v.testler.filter((_, idx) => idx !== i) }));
  const updTest = (i: number, k: keyof Test, val: any) =>
    setVeri(v => ({ ...v, testler: v.testler.map((t, idx) => idx === i ? { ...t, [k]: val } : t) }));
  const updHucre = (i: number, gun: number, sic: string, val: string) =>
    setVeri(v => ({
      ...v,
      testler: v.testler.map((t, idx) => idx === i ? { ...t, sonuclar: { ...t.sonuclar, [`${gun}|${sic}`]: val } } : t),
    }));

  const kaydet = async () => {
    setSaving(true); setErr(""); setMsg("");
    try {
      const r = await fetch(`/api/rapor-takip/${nkrId}/stabilite`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, veri }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Kaydedilemedi");
      setMsg("Kaydedildi ✓");
      setTimeout(() => setMsg(""), 3000);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 24 }}>Yükleniyor…</div>;

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Stabilite Sonuç Girişi</h1>
          <p className={styles.pageSubtitle}>NkrID {nkrId} · gün / sıcaklık / test matrisi</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.addBtn} style={{ background: "transparent", color: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
            onClick={() => window.open(`/rapor-onay-print/${nkrId}?format=${encodeURIComponent(format)}`, "_blank")}>
            👁 Önizleme
          </button>
          <button className={styles.addBtn} disabled={saving} onClick={kaydet}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>

      {err && <div className={styles.errorBar}>{err}</div>}
      {msg && <div style={{ background: "#34c75918", color: "#248a3d", padding: "8px 14px", borderRadius: 8, marginBottom: 12, fontWeight: 600 }}>{msg}</div>}

      {/* ── Config: günler + sıcaklıklar ── */}
      <div className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Günler</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {GUN_SECENEK.map(g => (
                <label key={g} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={veri.gunler.includes(g)} onChange={() => toggleGun(g)} /> {g}. gün
                </label>
              ))}
              {veri.gunler.filter(g => !GUN_SECENEK.includes(g)).map(g => (
                <span key={g} style={{ fontSize: 12, background: "var(--color-accent-light)", color: "var(--color-accent)", padding: "2px 8px", borderRadius: 8 }}>
                  {g}. gün <button onClick={() => toggleGun(g)} style={{ border: "none", background: "none", cursor: "pointer", color: "inherit" }}>✕</button>
                </span>
              ))}
              <input value={ozelGun} onChange={e => setOzelGun(e.target.value)} onKeyDown={e => e.key === "Enter" && addOzelGun()} placeholder="özel gün" style={{ ...inputSt, width: 80 }} />
              <button className={styles.editBtn} onClick={addOzelGun}>+ ekle</button>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Sıcaklıklar</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {SICAKLIK_SECENEK.map(s => (
                <label key={s} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={veri.sicakliklar.includes(s)} onChange={() => toggleSic(s)} /> {s}
                </label>
              ))}
              {veri.sicakliklar.filter(s => !SICAKLIK_SECENEK.includes(s)).map(s => (
                <span key={s} style={{ fontSize: 12, background: "var(--color-accent-light)", color: "var(--color-accent)", padding: "2px 8px", borderRadius: 8 }}>
                  {s} <button onClick={() => toggleSic(s)} style={{ border: "none", background: "none", cursor: "pointer", color: "inherit" }}>✕</button>
                </span>
              ))}
              <input value={ozelSic} onChange={e => setOzelSic(e.target.value)} onKeyDown={e => e.key === "Enter" && addOzelSic()} placeholder="örn. 40°C" style={{ ...inputSt, width: 90 }} />
              <button className={styles.editBtn} onClick={addOzelSic}>+ ekle</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Testler (metot/birim/limit hizmet listesinden) ── */}
      <div className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Testler ({veri.testler.length})</div>
          <button className={styles.editBtn} onClick={addBosTest}>+ boş test</button>
        </div>
        {/* Katalogtan test ekle */}
        <div style={{ position: "relative", marginBottom: 12, maxWidth: 480 }}>
          <input value={q} onChange={e => searchHizmet(e.target.value)} placeholder="Hizmet listesinden test ekle (kod/ad ara)…" style={inputSt} />
          {opts.length > 0 && (
            <div style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, background: "var(--color-surface,#fff)", border: "1px solid var(--color-border)", borderRadius: 8, maxHeight: 260, overflow: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
              {opts.map((h, i) => (
                <button key={i} type="button" onClick={() => addTest(h)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: "inherit" }}>
                  <b>{h.Kod}</b> — {h.Ad} <span style={{ color: "var(--color-text-tertiary)" }}>· {h.Metot || "metot yok"} · {h.Birim || "-"}</span>
                </button>
              ))}
            </div>
          )}
          {searching && <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>aranıyor…</span>}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: "6px 4px" }}>Analiz</th>
              <th style={{ width: 80 }}>Birim</th>
              <th style={{ width: 150 }}>Metot</th>
              <th style={{ width: 120 }}>Limit</th>
              <th style={{ width: 60 }}>Akr.</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {veri.testler.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 12, color: "var(--color-text-tertiary)" }}>Test yok — yukarıdan ekleyin.</td></tr>
            ) : veri.testler.map((t, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                <td style={{ padding: "4px" }}><input value={t.ad} onChange={e => updTest(i, "ad", e.target.value)} style={inputSt} /></td>
                <td><input value={t.birim} onChange={e => updTest(i, "birim", e.target.value)} style={inputSt} /></td>
                <td><input value={t.metot} onChange={e => updTest(i, "metot", e.target.value)} style={inputSt} /></td>
                <td><input value={t.limit} onChange={e => updTest(i, "limit", e.target.value)} style={inputSt} /></td>
                <td style={{ textAlign: "center" }}><input type="checkbox" checked={t.akredite} onChange={e => updTest(i, "akredite", e.target.checked)} /></td>
                <td style={{ textAlign: "center" }}><button className={styles.editBtn} style={{ color: "#ff3b30" }} onClick={() => removeTest(i)} title="Sil">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Sonuç matrisi (gün başına tablo) ── */}
      {veri.gunler.map(g => (
        <div key={g} className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{g}. Gün Sonuçları</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "6px 4px", minWidth: 180 }}>Analiz</th>
                  {veri.sicakliklar.map(s => <th key={s} style={{ minWidth: 110, padding: "6px 4px" }}>{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {veri.testler.length === 0 ? (
                  <tr><td colSpan={1 + veri.sicakliklar.length} style={{ padding: 12, color: "var(--color-text-tertiary)" }}>Önce test ekleyin.</td></tr>
                ) : veri.testler.map((t, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border-light)" }}>
                    <td style={{ padding: "4px", fontWeight: 500 }}>{t.akredite ? "*" : ""}{t.ad || <span style={{ color: "var(--color-text-tertiary)" }}>(isimsiz)</span>}</td>
                    {veri.sicakliklar.map(s => (
                      <td key={s} style={{ padding: "4px" }}>
                        <input value={t.sonuclar[`${g}|${s}`] || ""} onChange={e => updHucre(i, g, s, e.target.value)} placeholder="—" style={{ ...inputSt, textAlign: "center" }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* ── Değerlendirme ── */}
      <div className={styles.tableCard} style={{ padding: 16, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Değerlendirme</div>
        <textarea value={veri.degerlendirme} onChange={e => setVeri(v => ({ ...v, degerlendirme: e.target.value }))}
          rows={3} style={{ ...inputSt, resize: "vertical" }} />
      </div>
    </div>
  );
}
