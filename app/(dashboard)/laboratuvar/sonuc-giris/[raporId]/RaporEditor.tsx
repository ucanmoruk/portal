"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import ed from "./rapor-editor.module.css";

// ── Tipler ──────────────────────────────────────────────────────
type Uygunluk = "uygun" | "uygun-degil" | "na";

interface StandartSatir {
  id: number;
  hizmetKodu: string;
  hizmetAdi: string;
  metod: string;
  birim: string;
  limitMin: string;
  limitMax: string;
  sonuc: string;
  uygunluk: Uygunluk;
}

interface ChallengeSatir {
  id: number;
  mikroorganizma: string;
  kategori: string;
  t0: string; t7: string; t14: string; t21: string; t28: string;
  artisOrani: string;
  sonuc: "Geçti" | "Kaldı" | "Devam" | "";
}

interface DermaSatir {
  id: number;
  testTipi: string;
  uygulamaBolgesi: string;
  katilimciSayisi: string;
  tamamlayanSayisi: string;
  reaksiyonSayisi: string;
  maksSkala: string;
  testBaslangic: string;
  testBitis: string;
  sonuc: string;
}

interface RaporBaslik {
  numuneAdi: string;
  firmaAd: string;
  evrakNo: string;
  raporNo: string;
  tarih: string;
  durum: "Taslak" | "Tamamlandı" | "Onaylandı";
  analistAdi: string;
}

// ── Mock veri ────────────────────────────────────────────────────
const MOCK_BASLIK: RaporBaslik = {
  numuneAdi: "Nemlendirici Krem SPF30",
  firmaAd:   "XYZ Kozmetik A.Ş.",
  evrakNo:   "LAB-2025-0042",
  raporNo:   "R-2025-0098",
  tarih:     "2025-03-28",
  durum:     "Taslak",
  analistAdi: "Ayşe Kaya",
};

const MOCK_STANDART: StandartSatir[] = [
  { id: 1, hizmetKodu: "M-001", hizmetAdi: "Toplam Aerobik Mezofilik Bakteri Sayımı", metod: "ISO 21149", birim: "kob/g", limitMin: "", limitMax: "1000", sonuc: "", uygunluk: "na" },
  { id: 2, hizmetKodu: "M-002", hizmetAdi: "Toplam Maya ve Küf Sayımı", metod: "ISO 16212", birim: "kob/g", limitMin: "", limitMax: "100", sonuc: "", uygunluk: "na" },
  { id: 3, hizmetKodu: "M-003", hizmetAdi: "Escherichia coli", metod: "ISO 21150", birim: "", limitMin: "", limitMax: "Bulunmamalı", sonuc: "", uygunluk: "na" },
  { id: 4, hizmetKodu: "M-004", hizmetAdi: "Pseudomonas aeruginosa", metod: "ISO 22717", birim: "", limitMin: "", limitMax: "Bulunmamalı", sonuc: "", uygunluk: "na" },
];

const MOCK_CHALLENGE: ChallengeSatir[] = [
  { id: 1, mikroorganizma: "Staphylococcus aureus", kategori: "Kategori A", t0: "2.2×10⁵", t7: "", t14: "", t21: "", t28: "", artisOrani: "", sonuc: "" },
  { id: 2, mikroorganizma: "Pseudomonas aeruginosa", kategori: "Kategori A", t0: "2.1×10⁵", t7: "", t14: "", t21: "", t28: "", artisOrani: "", sonuc: "" },
  { id: 3, mikroorganizma: "Candida albicans", kategori: "Kategori B", t0: "2.0×10⁵", t7: "", t14: "", t21: "", t28: "", artisOrani: "", sonuc: "" },
];

// ── Yardımcı bileşenler ──────────────────────────────────────────
function UygunlukToggle({
  value, onChange,
}: { value: Uygunluk; onChange: (v: Uygunluk) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {([
        ["uygun",       "✓", "#248a3d", "#34c75918"],
        ["uygun-degil", "✗", "#c1001a", "#ff2d5518"],
        ["na",          "—", "#86868b", "#8e8e9318"],
      ] as const).map(([v, label, fg, bg]) => (
        <button
          key={v}
          onClick={() => onChange(v as Uygunluk)}
          style={{
            width: 26, height: 26, borderRadius: 6, border: "none",
            background: value === v ? bg : "var(--color-surface-3)",
            color: value === v ? fg : "var(--color-text-tertiary)",
            fontWeight: 700, fontSize: "0.8rem", cursor: "pointer",
            transition: "all 0.12s",
            outline: value === v ? `1.5px solid ${fg}40` : "none",
          }}
        >{label}</button>
      ))}
    </div>
  );
}

function SonucInput({
  value, onChange, placeholder = "—",
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", border: "1px solid var(--color-border)", borderRadius: 6,
        padding: "5px 8px", fontSize: "0.82rem", fontFamily: "inherit",
        background: "var(--color-surface)", outline: "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
        color: "var(--color-text-primary)",
      }}
      onFocus={e => {
        e.target.style.borderColor = "var(--color-accent)";
        e.target.style.boxShadow = "0 0 0 3px var(--color-accent-light)";
      }}
      onBlur={e => {
        e.target.style.borderColor = "var(--color-border)";
        e.target.style.boxShadow = "none";
      }}
    />
  );
}

function SeksiyonBaslik({ fmt, label, count }: { fmt: string; label: string; count: number }) {
  const fmtColors: Record<string, { bg: string; fg: string }> = {
    STANDART:    { bg: "#8e8e9318", fg: "#48484a" },
    KIMYASAL:    { bg: "#5e5ce618", fg: "#3634a3" },
    CHALLENGE:   { bg: "#ff9f0a18", fg: "#b06400" },
    DERMATOLOJI: { bg: "#ff2d5518", fg: "#c1001a" },
    MAYA_KUF:    { bg: "#8e8e9318", fg: "#48484a" },
  };
  const c = fmtColors[fmt] ?? { bg: "#8e8e9318", fg: "#48484a" };
  return (
    <div className={ed.seksiyonBaslik}>
      <span style={{
        display: "inline-block", padding: "3px 10px", borderRadius: 7,
        fontSize: "0.72rem", fontWeight: 700, background: c.bg, color: c.fg,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>{label}</span>
      <span style={{ fontSize: "0.78rem", color: "var(--color-text-tertiary)" }}>
        {count} test
      </span>
    </div>
  );
}

// ── Ana Bileşen ──────────────────────────────────────────────────
export default function RaporEditor({ raporId }: { raporId: string }) {
  const router = useRouter();
  const [baslik] = useState<RaporBaslik>(MOCK_BASLIK);
  const [standartRows, setStandartRows] = useState<StandartSatir[]>(MOCK_STANDART);
  const [challengeRows, setChallengeRows] = useState<ChallengeSatir[]>(MOCK_CHALLENGE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmTamamla, setConfirmTamamla] = useState(false);
  const [notlar, setNotlar] = useState("");

  // Tamamlanma oranı
  const toplamSonuc = standartRows.filter(r => r.sonuc.trim() !== "").length;
  const toplamSatir = standartRows.length + challengeRows.length;
  const challengeDolu = challengeRows.filter(r => r.t7.trim() !== "").length;
  const oran = toplamSatir === 0 ? 0 : Math.round(((toplamSonuc + challengeDolu) / toplamSatir) * 100);

  const handleStandartChange = <K extends keyof StandartSatir>(
    id: number, field: K, val: StandartSatir[K]
  ) => setStandartRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));

  const handleChallengeChange = <K extends keyof ChallengeSatir>(
    id: number, field: K, val: ChallengeSatir[K]
  ) => setChallengeRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));

  const handleSave = async () => {
    setSaving(true);
    // TODO: API çağrısı
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const formatTarih = (t: string) => {
    const [y, m, d] = t.split("-");
    return `${d}.${m}.${y}`;
  };

  return (
    <div className={ed.pageWrapper}>
      {/* ── Üst navigasyon ── */}
      <div className={ed.navBar}>
        <button className={ed.backBtn} onClick={() => router.push("/laboratuvar/sonuc-giris")}>
          <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
          Geri
        </button>
        <div className={ed.breadcrumb}>
          <span style={{ color: "var(--color-text-tertiary)" }}>Laboratuvar</span>
          <span style={{ color: "var(--color-text-tertiary)" }}>/</span>
          <span style={{ color: "var(--color-text-tertiary)" }}>Sonuç Girişi</span>
          <span style={{ color: "var(--color-text-tertiary)" }}>/</span>
          <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{baslik.raporNo}</span>
        </div>
      </div>

      {/* ── Rapor başlık kartı ── */}
      <div className={ed.baslikKart}>
        <div className={ed.baslikSol}>
          <div className={ed.baslikNumune}>{baslik.numuneAdi}</div>
          <div className={ed.baslikFirma}>{baslik.firmaAd}</div>
          <div className={ed.baslikMeta}>
            <span>Evrak: <b>{baslik.evrakNo}</b></span>
            <span className={ed.metaDivider} />
            <span>Rapor: <b>{baslik.raporNo}</b></span>
            <span className={ed.metaDivider} />
            <span>Tarih: <b>{formatTarih(baslik.tarih)}</b></span>
            <span className={ed.metaDivider} />
            <span>Analist: <b>{baslik.analistAdi}</b></span>
          </div>
        </div>
        <div className={ed.baslikSag}>
          {/* Tamamlanma */}
          <div className={ed.ilerlemeKutu}>
            <div className={ed.ilerlemeLabel}>Tamamlanma</div>
            <div className={ed.ilerlemeBar}>
              <div
                className={ed.ilerlemeIc}
                style={{
                  width: `${oran}%`,
                  background: oran === 100 ? "#34c759" : oran > 0 ? "#ff9f0a" : "#d2d2d7",
                }}
              />
            </div>
            <div className={ed.ilerlemeYuzde}>{oran}%</div>
          </div>
          {/* Durum badge */}
          {baslik.durum === "Taslak" && (
            <span className={ed.durumTaslak}>Taslak</span>
          )}
          {baslik.durum === "Tamamlandı" && (
            <span className={ed.durumTamamlandi}>Tamamlandı</span>
          )}
          {baslik.durum === "Onaylandı" && (
            <span className={ed.durumOnaylandi}>Onaylandı</span>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          BÖLÜM 1 — STANDART MİKROBİYOLOJİK
      ══════════════════════════════════════════════ */}
      <div className={ed.seksiyon}>
        <SeksiyonBaslik fmt="STANDART" label="Standart Mikrobiyolojik" count={standartRows.length} />
        <div className={ed.seksiyonIcerik}>
          <div className={ed.standartHead}>
            <div style={{ width: 80 }}>Kod</div>
            <div style={{ flex: 1 }}>Test Parametresi</div>
            <div style={{ width: 140 }}>Metod</div>
            <div style={{ width: 110 }}>Sonuç</div>
            <div style={{ width: 60 }}>Birim</div>
            <div style={{ width: 130 }}>Limit</div>
            <div style={{ width: 90, textAlign: "center" }}>Uygunluk</div>
          </div>

          {standartRows.map((row, i) => (
            <div
              key={row.id}
              className={ed.standartRow}
              style={{ borderBottom: i < standartRows.length - 1 ? "1px solid var(--color-border-light)" : "none" }}
            >
              <div style={{ width: 80, flexShrink: 0, fontSize: "0.76rem", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                {row.hizmetKodu}
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-primary)", paddingRight: 8 }}>
                {row.hizmetAdi}
              </div>
              <div style={{ width: 140, flexShrink: 0, fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                {row.metod}
              </div>
              <div style={{ width: 110, flexShrink: 0 }}>
                <SonucInput
                  value={row.sonuc}
                  onChange={v => handleStandartChange(row.id, "sonuc", v)}
                  placeholder="Girin…"
                />
              </div>
              <div style={{ width: 60, flexShrink: 0, fontSize: "0.78rem", color: "var(--color-text-secondary)", textAlign: "center" }}>
                {row.birim || "—"}
              </div>
              <div style={{ width: 130, flexShrink: 0, fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                {row.limitMax ? (row.limitMin ? `${row.limitMin}–${row.limitMax}` : `≤ ${row.limitMax}`) : "—"}
              </div>
              <div style={{ width: 90, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                <UygunlukToggle
                  value={row.uygunluk}
                  onChange={v => handleStandartChange(row.id, "uygunluk", v)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          BÖLÜM 2 — CHALLENGE TEST
      ══════════════════════════════════════════════ */}
      <div className={ed.seksiyon}>
        <SeksiyonBaslik fmt="CHALLENGE" label="Challenge Test (Koruyucu Etkinlik)" count={challengeRows.length} />
        <div className={ed.seksiyonIcerik}>
          {/* Açıklama notu */}
          <div className={ed.challengeNot}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style={{ flexShrink: 0, marginTop: 1, color: "#b06400" }}>
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
            </svg>
            <span>Değerler log₁₀ kob/g veya kob/mL olarak girilmelidir. Artış oranı otomatik hesaplanır.</span>
          </div>

          <div className={ed.challengeHead}>
            <div style={{ flex: 1 }}>Mikroorganizma</div>
            <div style={{ width: 90 }}>Kategori</div>
            <div style={{ width: 72, textAlign: "center" }}>T0</div>
            <div style={{ width: 72, textAlign: "center" }}>T7</div>
            <div style={{ width: 72, textAlign: "center" }}>T14</div>
            <div style={{ width: 72, textAlign: "center" }}>T21</div>
            <div style={{ width: 72, textAlign: "center" }}>T28</div>
            <div style={{ width: 80, textAlign: "center" }}>Artış (log)</div>
            <div style={{ width: 80, textAlign: "center" }}>Sonuç</div>
          </div>

          {challengeRows.map((row, i) => (
            <div
              key={row.id}
              className={ed.challengeRow}
              style={{ borderBottom: i < challengeRows.length - 1 ? "1px solid var(--color-border-light)" : "none" }}
            >
              <div style={{ flex: 1, fontSize: "0.82rem", fontWeight: 500, fontStyle: "italic", color: "var(--color-text-primary)", paddingRight: 8 }}>
                {row.mikroorganizma}
              </div>
              <div style={{ width: 90, flexShrink: 0, fontSize: "0.76rem", color: "var(--color-text-tertiary)" }}>
                {row.kategori}
              </div>
              {(["t0", "t7", "t14", "t21", "t28"] as const).map(tp => (
                <div key={tp} style={{ width: 72, flexShrink: 0 }}>
                  <SonucInput
                    value={row[tp]}
                    onChange={v => handleChallengeChange(row.id, tp, v)}
                    placeholder="—"
                  />
                </div>
              ))}
              {/* Artış oranı — hesaplanmış veya manuel */}
              <div style={{ width: 80, flexShrink: 0 }}>
                <SonucInput
                  value={row.artisOrani}
                  onChange={v => handleChallengeChange(row.id, "artisOrani", v)}
                  placeholder="—"
                />
              </div>
              {/* Sonuç seçimi */}
              <div style={{ width: 80, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                <select
                  value={row.sonuc}
                  onChange={e => handleChallengeChange(row.id, "sonuc", e.target.value as ChallengeSatir["sonuc"])}
                  style={{
                    width: "100%", border: "1px solid var(--color-border)", borderRadius: 6,
                    padding: "5px 4px", fontSize: "0.78rem", fontFamily: "inherit",
                    background: row.sonuc === "Geçti" ? "#34c75914" : row.sonuc === "Kaldı" ? "#ff2d5514" : "var(--color-surface)",
                    color: row.sonuc === "Geçti" ? "#248a3d" : row.sonuc === "Kaldı" ? "#c1001a" : "var(--color-text-secondary)",
                    fontWeight: row.sonuc ? 600 : 400,
                    outline: "none", cursor: "pointer",
                  }}
                >
                  <option value="">—</option>
                  <option value="Geçti">Geçti</option>
                  <option value="Kaldı">Kaldı</option>
                  <option value="Devam">Devam</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          GENEL NOTLAR
      ══════════════════════════════════════════════ */}
      <div className={ed.seksiyon}>
        <div className={ed.seksiyonBaslik}>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>Genel Notlar / Değerlendirme</span>
        </div>
        <div className={ed.seksiyonIcerik} style={{ padding: "16px 20px" }}>
          <textarea
            value={notlar}
            onChange={e => setNotlar(e.target.value)}
            placeholder="Rapor ile ilgili genel değerlendirme, gözlem veya notlarınızı buraya girebilirsiniz…"
            rows={4}
            style={{
              width: "100%", border: "1px solid var(--color-border)", borderRadius: 8,
              padding: "10px 12px", fontSize: "0.845rem", fontFamily: "inherit",
              background: "var(--color-surface)", color: "var(--color-text-primary)",
              resize: "vertical", outline: "none", lineHeight: 1.6,
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onFocus={e => {
              e.target.style.borderColor = "var(--color-accent)";
              e.target.style.boxShadow = "0 0 0 3px var(--color-accent-light)";
            }}
            onBlur={e => {
              e.target.style.borderColor = "var(--color-border)";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>
      </div>

      {/* ── Sticky alt aksiyon çubuğu ── */}
      <div className={ed.aksiyonBar}>
        <div className={ed.aksiyonSol}>
          {saved && (
            <span className={ed.savedMsg}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
              </svg>
              Kaydedildi
            </span>
          )}
        </div>
        <div className={ed.aksiyonSag}>
          <button
            className={ed.printBtn}
            onClick={handlePrint}
            title="Raporu Yazdır"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9v-2h8v2H6Zm8 2H6v-1h8v1Z" clipRule="evenodd" />
            </svg>
            Yazdır
          </button>
          <button
            className={styles.cancelBtn}
            onClick={() => router.push("/laboratuvar/sonuc-giris")}
          >
            Vazgeç
          </button>
          <button
            className={ed.taslakBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <span className={styles.loader} /> : "Taslak Kaydet"}
          </button>
          <button
            className={ed.tamamlaBtn}
            onClick={() => setConfirmTamamla(true)}
            disabled={oran < 100 || saving}
            title={oran < 100 ? "Tüm sonuçlar girilmeden tamamlanamaz" : ""}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
            </svg>
            Tamamlandı İşaretle
          </button>
        </div>
      </div>

      {/* ── Tamamla onay modal ── */}
      {confirmTamamla && (
        <div className={styles.modalOverlay} onClick={() => setConfirmTamamla(false)}>
          <div className={styles.modal} style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Raporu Tamamla</h2>
              <button className={styles.modalClose} onClick={() => setConfirmTamamla(false)}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.deleteWarning}>
                <strong>{baslik.raporNo}</strong> nolu rapor &quot;Tamamlandı&quot; olarak işaretlenecek.
                Tamamlanan raporlar yalnızca yetkili kullanıcılar tarafından değiştirilebilir.
              </p>
              <p className={styles.deleteWarning} style={{ marginTop: 8 }}>
                Devam etmek istiyor musunuz?
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setConfirmTamamla(false)}>İptal</button>
              <button
                className={ed.tamamlaBtn}
                onClick={async () => {
                  setConfirmTamamla(false);
                  await handleSave();
                  // TODO: durum güncelle
                }}
              >
                Evet, Tamamla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── YAZDIR GÖRÜNÜMÜ (print CSS ile) ── */}
      <div className={ed.printOnly}>
        <div className={ed.printHeader}>
          <div className={ed.printLogo}>ÜGD LABORATUVAR</div>
          <div className={ed.printBaslik}>ANALİZ RAPORU</div>
        </div>
        <div className={ed.printMeta}>
          <div><b>Numune:</b> {baslik.numuneAdi}</div>
          <div><b>Firma:</b> {baslik.firmaAd}</div>
          <div><b>Evrak No:</b> {baslik.evrakNo}</div>
          <div><b>Rapor No:</b> {baslik.raporNo}</div>
          <div><b>Tarih:</b> {formatTarih(baslik.tarih)}</div>
          <div><b>Analist:</b> {baslik.analistAdi}</div>
        </div>
        <div className={ed.printSeksiyonBaslik}>MİKROBİYOLOJİK ANALİZ SONUÇLARI</div>
        <table className={ed.printTable}>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Test Parametresi</th>
              <th>Metod</th>
              <th>Sonuç</th>
              <th>Birim</th>
              <th>Limit</th>
              <th>Uygunluk</th>
            </tr>
          </thead>
          <tbody>
            {standartRows.map(r => (
              <tr key={r.id}>
                <td>{r.hizmetKodu}</td>
                <td>{r.hizmetAdi}</td>
                <td>{r.metod}</td>
                <td>{r.sonuc || "—"}</td>
                <td>{r.birim || "—"}</td>
                <td>{r.limitMax ? `≤ ${r.limitMax}` : "—"}</td>
                <td style={{ textAlign: "center", fontWeight: 700,
                  color: r.uygunluk === "uygun" ? "#248a3d" : r.uygunluk === "uygun-degil" ? "#c1001a" : "#86868b",
                }}>
                  {r.uygunluk === "uygun" ? "✓ Uygun" : r.uygunluk === "uygun-degil" ? "✗ Uygun Değil" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={ed.printSeksiyonBaslik} style={{ marginTop: 24 }}>CHALLENGE TEST (KORUYUCu ETKİNLİK)</div>
        <table className={ed.printTable}>
          <thead>
            <tr>
              <th>Mikroorganizma</th>
              <th>Kategori</th>
              <th>T0</th><th>T7</th><th>T14</th><th>T21</th><th>T28</th>
              <th>Artış (log)</th>
              <th>Sonuç</th>
            </tr>
          </thead>
          <tbody>
            {challengeRows.map(r => (
              <tr key={r.id}>
                <td style={{ fontStyle: "italic" }}>{r.mikroorganizma}</td>
                <td>{r.kategori}</td>
                <td>{r.t0 || "—"}</td><td>{r.t7 || "—"}</td>
                <td>{r.t14 || "—"}</td><td>{r.t21 || "—"}</td><td>{r.t28 || "—"}</td>
                <td>{r.artisOrani || "—"}</td>
                <td style={{ fontWeight: 700,
                  color: r.sonuc === "Geçti" ? "#248a3d" : r.sonuc === "Kaldı" ? "#c1001a" : "#86868b",
                }}>{r.sonuc || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {notlar && (
          <>
            <div className={ed.printSeksiyonBaslik} style={{ marginTop: 24 }}>DEĞERLENDİRME</div>
            <p style={{ fontSize: "0.85rem", lineHeight: 1.7, color: "#1d1d1f" }}>{notlar}</p>
          </>
        )}
        <div className={ed.printImza}>
          <div className={ed.printImzaKutu}>
            <div className={ed.printImzaCizgi} />
            <div>Analist</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{baslik.analistAdi}</div>
          </div>
          <div className={ed.printImzaKutu}>
            <div className={ed.printImzaCizgi} />
            <div>Onaylayan</div>
          </div>
          <div className={ed.printImzaKutu}>
            <div className={ed.printImzaCizgi} />
            <div>Tarih</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{formatTarih(baslik.tarih)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
