"use client";

import { useCallback, useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// EvrakDetayModal — Numune Kabul evrakına bağlı eşleştirmeler.
//   • Üstte: bu evrakta zaten eşleştirilmiş Teklif / Analiz Talep /
//     Destek Talep / Dosya listesi. Tıkla → yeni sekmede ilgili sayfa.
//   • Altta: 4 buton (Teklif Eşleştir, Analiz Talep Eşleştir, Destek Talebi
//     Eşleştir, Dosya Yükle). İlk üçü açılan seçici modal'da kayıt seçtirir →
//     POST /api/evrak/:no/eslestirme → otomatik durum geçişi (Teklif → Onaylandı,
//     Analiz Talep → Analiz Aşamasında).
//   • Dosya Yükle: yakında.
// ─────────────────────────────────────────────────────────────────────────────

interface TeklifEs {
  EslestirmeID: number; TeklifID: number;
  DisTeklifKodu: string; TeklifNo: number; RevNo: number;
  TeklifDurum: string; Toplam: number; Tarih: string; MusteriAd: string;
  EslestirmeTarihi: string; EslestirenAd: string;
}
interface TalepEs {
  EslestirmeID: number; TalepID: number;
  TalepNo: string; IcTakipNo: string; Durum: string; Tarih: string; FirmaAd: string;
  EslestirmeTarihi: string; EslestirenAd: string;
}
interface Eslestirmeler {
  teklifler: TeklifEs[];
  analizTalepleri: TalepEs[];
  destekTalepleri: TalepEs[];
  dosyalar: { EslestirmeID: number; Aciklama: string; EslestirenAd: string; EslestirmeTarihi: string }[];
}

interface TeklifSec { ID: number; DisTeklifKodu: string | null; TeklifNo: number | null; RevNo: number;
  TeklifDurum: string; MusteriAd: string; Tarih: string; Toplam: number | null; KisaAciklama?: string; }
interface TalepSec { ID: number; TalepNo: string; IcTakipNo: string; Durum: string; Tarih: string;
  TalepOlusturan: string; Musteri: string; }

function disLabel(kod: string | null | undefined, rev: number) {
  if (!kod) return "—";
  return `${kod}/${String(rev).padStart(2, "0")}`;
}

const TEKLIF_DURUM_RENK: Record<string, string> = {
  "Onay Bekleniyor": "#9a6700",
  "Onaylandı":       "#1a7f4b",
  "Reddedildi":      "#c0392b",
  "Taslak":          "#6e6e73",
  "Gönderildi":      "#9a6700",
};
const TALEP_DURUM_RENK: Record<string, string> = {
  "Yeni Talep":         "#9a6700",
  "Numune Bekleniyor":  "#9a6700",
  "Analiz Aşamasında":  "#0071e3",
  "Raporlandı":         "#1a7f4b",
  "Pasif":              "#6e6e73",
};

const ovStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
};
const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)", borderRadius: 14, width: "100%", maxWidth: 760,
  maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};

// ──────────────────────────────────────────────────────────────
// Seçici modal — Teklif / Analiz Talep / Destek Talep ortak
// ──────────────────────────────────────────────────────────────
type SeciciTur = "Teklif" | "AnalizTalep" | "DestekTalep";
function SeciciModal({
  tur, onClose, onSecildi,
}: {
  tur: SeciciTur;
  onClose: () => void;
  onSecildi: (item: { id: number; kod: string }) => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const startsearch = useCallback(async (search: string) => {
    setLoading(true);
    try {
      let url = "";
      if (tur === "Teklif") {
        url = `/api/teklifler?limit=30&search=${encodeURIComponent(search)}`;
      } else {
        const t = tur === "AnalizTalep" ? "Analiz" : "Destek";
        url = `/api/talepler?tur=${t}&limit=30&search=${encodeURIComponent(search)}`;
      }
      const r = await fetch(url);
      const j = await r.json();
      setRows(j.data || []);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [tur]);

  useEffect(() => { startsearch(""); }, [startsearch]);

  useEffect(() => {
    const id = setTimeout(() => startsearch(q), 250);
    return () => clearTimeout(id);
  }, [q, startsearch]);

  const baslik = tur === "Teklif" ? "Teklif Seç"
    : tur === "AnalizTalep" ? "Analiz Talebi Seç" : "Destek Talebi Seç";

  const handleSec = async (id: number, kod: string) => {
    if (busy) return;
    setBusy(true);
    try { await onSecildi({ id, kod }); } finally { setBusy(false); }
  };

  return (
    <div style={{ ...ovStyle, zIndex: 1200 }} onClick={onClose}>
      <div style={{ ...cardStyle, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border-light)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{baslik}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-tertiary)" }}>✕</button>
        </div>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-border-light)" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ara…" autoFocus
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 13 }} />
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: 8 }}>
          {loading ? <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-tertiary)" }}>Yükleniyor…</div>
            : rows.length === 0 ? <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-tertiary)" }}>Kayıt bulunamadı.</div>
            : rows.map((r: TeklifSec | TalepSec) => {
                if (tur === "Teklif") {
                  const t = r as TeklifSec;
                  const kod = disLabel(t.DisTeklifKodu, t.RevNo);
                  const cnt = TEKLIF_DURUM_RENK[t.TeklifDurum] ?? "#6e6e73";
                  return (
                    <button key={t.ID} disabled={busy} onClick={() => handleSec(t.ID, kod)}
                      style={{ display: "block", width: "100%", textAlign: "left",
                        padding: "10px 12px", background: "transparent", border: "1px solid transparent",
                        borderRadius: 8, cursor: busy ? "default" : "pointer", marginBottom: 4 }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-bg-elevated, #fafafa)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, fontSize: 13 }}>{kod}</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.MusteriAd || "—"} · {t.Tarih}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: cnt, whiteSpace: "nowrap" }}>{t.TeklifDurum}</span>
                      </div>
                    </button>
                  );
                }
                const t = r as TalepSec;
                const cnt = TALEP_DURUM_RENK[t.Durum] ?? "#6e6e73";
                return (
                  <button key={t.ID} disabled={busy} onClick={() => handleSec(t.ID, t.TalepNo)}
                    style={{ display: "block", width: "100%", textAlign: "left",
                      padding: "10px 12px", background: "transparent", border: "1px solid transparent",
                      borderRadius: 8, cursor: busy ? "default" : "pointer", marginBottom: 4 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--color-bg-elevated, #fafafa)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, fontSize: 13 }}>{t.TalepNo}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.Musteri || t.TalepOlusturan || "—"} · {t.Tarih}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: cnt, whiteSpace: "nowrap" }}>{t.Durum}</span>
                    </div>
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Ana Detay Modal
// ──────────────────────────────────────────────────────────────
export default function EvrakDetayModal({ evrakNo, onClose }: { evrakNo: string; onClose: () => void }) {
  const [data, setData] = useState<Eslestirmeler | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [secici, setSecici] = useState<SeciciTur | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`/api/evrak/${encodeURIComponent(evrakNo)}/eslestirme`);
      if (!r.ok) throw new Error((await r.json()).error || "Yüklenemedi");
      setData(await r.json());
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [evrakNo]);

  useEffect(() => { load(); }, [load]);

  const handleSeciliKayit = async ({ id, kod }: { id: number; kod: string }) => {
    if (!secici) return;
    try {
      const r = await fetch(`/api/evrak/${encodeURIComponent(evrakNo)}/eslestirme`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tur: secici, hedefId: id, hedefKod: kod }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || "Eşleştirilemedi."); return; }
      if (j.durumDegisti) {
        // sessizce devam — listede güncel durum görünecek
      }
      setSecici(null);
      load();
    } catch (e: any) { alert(e?.message || "Eşleştirilemedi."); }
  };

  const remove = async (id: number) => {
    if (!confirm("Bu eşleştirme kaldırılsın mı?")) return;
    try {
      const r = await fetch(`/api/evrak/${encodeURIComponent(evrakNo)}/eslestirme?id=${id}`, { method: "DELETE" });
      if (!r.ok) { alert("Kaldırılamadı."); return; }
      load();
    } catch (e: any) { alert(e?.message || "Kaldırılamadı."); }
  };

  return (
    <>
      <div style={ovStyle} onClick={onClose}>
        <div style={cardStyle} onClick={e => e.stopPropagation()}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border-light)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Evrak {evrakNo} · Eşleştirmeler</h2>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-tertiary)" }}>✕</button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px" }}>
            {loading ? <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)" }}>Yükleniyor…</div>
              : err ? <div style={{ padding: 16, color: "#c0392b", fontSize: 13 }}>{err}</div>
              : data && (
                <>
                  {/* Teklifler */}
                  <Group title="Teklifler" count={data.teklifler.length}>
                    {data.teklifler.length === 0 ? <Empty>Henüz teklif eşleştirilmemiş.</Empty>
                      : data.teklifler.map(t => (
                          <Row key={t.EslestirmeID}
                            mono={disLabel(t.DisTeklifKodu, t.RevNo)}
                            sub={`${t.MusteriAd || "—"} · ${t.Tarih}`}
                            durum={t.TeklifDurum}
                            durumRenk={TEKLIF_DURUM_RENK[t.TeklifDurum] ?? "#6e6e73"}
                            href={`/teklif-print/${t.TeklifID}`}
                            onRemove={() => remove(t.EslestirmeID)} />
                        ))}
                  </Group>

                  {/* Analiz Talepleri */}
                  <Group title="Analiz Talepleri" count={data.analizTalepleri.length}>
                    {data.analizTalepleri.length === 0 ? <Empty>Henüz analiz talebi eşleştirilmemiş.</Empty>
                      : data.analizTalepleri.map(t => (
                          <Row key={t.EslestirmeID}
                            mono={t.TalepNo}
                            sub={`${t.FirmaAd || "—"} · ${t.Tarih} · iç ${t.IcTakipNo}`}
                            durum={t.Durum}
                            durumRenk={TALEP_DURUM_RENK[t.Durum] ?? "#6e6e73"}
                            href={`/musteriler/talepler/${t.TalepID}`}
                            onRemove={() => remove(t.EslestirmeID)} />
                        ))}
                  </Group>

                  {/* Destek Talepleri */}
                  <Group title="Destek Talepleri" count={data.destekTalepleri.length}>
                    {data.destekTalepleri.length === 0 ? <Empty>Henüz destek talebi eşleştirilmemiş.</Empty>
                      : data.destekTalepleri.map(t => (
                          <Row key={t.EslestirmeID}
                            mono={t.TalepNo}
                            sub={`${t.FirmaAd || "—"} · ${t.Tarih}`}
                            durum={t.Durum}
                            durumRenk={TALEP_DURUM_RENK[t.Durum] ?? "#6e6e73"}
                            href={`/musteriler/talepler/${t.TalepID}`}
                            onRemove={() => remove(t.EslestirmeID)} />
                        ))}
                  </Group>

                  {/* Dosyalar */}
                  <Group title="Dosyalar" count={data.dosyalar.length}>
                    {data.dosyalar.length === 0 ? <Empty>Henüz dosya eklenmedi.</Empty>
                      : data.dosyalar.map(d => (
                          <div key={d.EslestirmeID} style={{ padding: "10px 12px", border: "1px solid var(--color-border-light)", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                            📎 {d.Aciklama || "(adsız)"}
                          </div>
                        ))}
                  </Group>
                </>
              )}
          </div>

          {/* Alt aksiyon butonları */}
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-border-light)",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ActionBtn onClick={() => setSecici("Teklif")} icon="💼" label="Teklif Eşleştir" />
            <ActionBtn onClick={() => setSecici("AnalizTalep")} icon="🔬" label="Analiz Talep Eşleştir" />
            <ActionBtn onClick={() => setSecici("DestekTalep")} icon="📞" label="Destek Talebi Eşleştir" />
            <ActionBtn onClick={() => alert("Dosya yükleme yakında.")} icon="📎" label="Dosya Yükle" disabled />
          </div>
        </div>
      </div>

      {secici && (
        <SeciciModal tur={secici} onClose={() => setSecici(null)} onSecildi={handleSeciliKayit} />
      )}
    </>
  );
}

// ── Küçük yardımcı görsel bileşenler ──
function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 999, background: "var(--color-bg-elevated, #f5f5f7)", color: "var(--color-text-secondary)" }}>{count}</span>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 12, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 12, background: "var(--color-bg-elevated, #fafafa)", borderRadius: 8 }}>{children}</div>;
}

function Row({ mono, sub, durum, durumRenk, href, onRemove }: {
  mono: string; sub: string; durum: string; durumRenk: string; href: string;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      border: "1px solid var(--color-border-light)", borderRadius: 8, marginBottom: 6 }}>
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, fontSize: 13, color: "var(--color-accent)" }}>{mono} ↗</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </a>
      <span style={{ fontSize: 11, fontWeight: 600, color: durumRenk, whiteSpace: "nowrap" }}>{durum}</span>
      <button onClick={onRemove} title="Eşleştirmeyi kaldır"
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#c0392b", fontSize: 14, padding: "2px 6px" }}>✕</button>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, disabled = false }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: "10px 14px", borderRadius: 10, border: "1px solid var(--color-border)",
        background: disabled ? "var(--color-bg-elevated, #f5f5f7)" : "var(--color-surface)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13, fontWeight: 600, color: disabled ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
      <span>{icon}</span><span>{label}</span>
    </button>
  );
}
