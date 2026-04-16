"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from '@/app/styles/table.module.css';
import * as XLSX from "xlsx";

interface MatchedIngredient {
  inputName: string;
  inputAmount: string;
  matched: boolean;
  INCIName: string | null;
  Cas: string | null;
  Ec: string | null;
  Functions: string | null;
  Regulation: string | null;
  Link?: string | null;
  Maks: string | null;
  Diger: string | null;
  Etiket: string | null;
}

const TABS = [
  { id: 'genel',    label: '1 · Genel Bilgiler' },
  { id: 'formul',   label: '2 · Ürün Formülü' },
  { id: 'detaylar', label: '3 · Ürün Detayları' },
  { id: 'etiket',   label: '4 · Kutu / Etiket' },
  { id: 'rapor',    label: '5 · Rapor' },
];

export default function YeniUrunPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('genel');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lookups, setLookups] = useState<{ firmalar: any[]; tipler: any[] }>({ firmalar: [], tipler: [] });

  // ── Formül sekmesi state ─────────────────────────────
  const [formulInput, setFormulInput] = useState("");
  const [formulResults, setFormulResults] = useState<MatchedIngredient[]>([]);
  const [formulLoading, setFormulLoading] = useState(false);
  const [formulError, setFormulError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Ana form state ───────────────────────────────────
  const [form, setForm] = useState({
    // Tab 1 — Genel Bilgiler
    Tarih: new Date().toISOString().split('T')[0],
    RaporNo: "",
    Versiyon: "1",
    FirmaID: "",
    Urun: "",        UrunEn: "",
    Barkod: "",
    Miktar: "",
    Tip1: "Durulanmayan",
    Tip2: "",
    Uygulama: "",
    Hedef: "Yetişkinler",
    A: "",
    RaporDurum: "Tamamlandı",
    // Tab 3 — Ürün Detayları
    Gorunum: "",               GorunumEn: "",
    Renk: "",                  RenkEn: "",
    Koku: "",                  KokuEn: "",
    PH: "",                    PHEn: "",
    Yogunluk: "",              YogunlukEn: "",
    Viskozite: "",             ViskoziteEn: "",
    Kaynama: "",               KaynamaEn: "",
    Erime: "",                 ErimeEn: "",
    SudaCozunebilirlik: "",    SudaCozunebilirlikEn: "",
    DigerCozunebilirlik: "",   DigerCozunebilirlikEn: "",
    // Tab 3 — Laboratuvar Testleri
    Mikrobiyoloji: "",         MikrobiyolojiEn: "",
    KoruyucuEtkinlik: "",      KoruyucuEtkinlikEn: "",
    Stabilite: "",             StabiliteEn: "",
    // Tab 4 — Kutu / Etiket
    Kullanim: "",              KullanimEn: "",
    Ozellikler: "",            OzelliklerEn: "",
    Uyarilar: "",              UyarilarEn: "",
    // Tab 5 — Rapor
    NormalKullanim: "",         NormalKullanimEn: "",
    MaruziyetAciklama: "",      MaruziyetAciklamaEn: "",
    BilesenlereMaruziyet: "",   BilesenlereMaruziyetEn: "",
    ToksikolojikProfil: "",     ToksikolojikProfilEn: "",
    IstenmedEtkiler: "",        IstenmedEtkilerEn: "",
    UrunBilgisi: "",            UrunBilgisiEn: "",
    DegerlendirmeSonucu: "",    DegerlendirmeSonucuEn: "",
    EtiketUyarilariB2: "",      EtiketUyarilariB2En: "",
    Gerekce: "",                GerekceEn: "",
    SorumluAd: "",
    SorumluAdres: "",
    SorumluKanit: "",
  });

  useEffect(() => {
    fetch("/api/urunler/lookup")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLookups(data); })
      .catch(() => {});
  }, []);

  const handleTipChange = (tipId: string) => {
    const tip = lookups.tipler.find(t => t.ID.toString() === tipId);
    setForm(prev => ({
      ...prev,
      Tip2: tipId,
      ...(tip ? { Uygulama: tip.UygulamaBolgesi || "", A: tip.ADegeri || "" } : {}),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.Urun || !form.FirmaID) {
      setError("Ürün adı ve firma seçimi zorunludur.");
      setActiveTab('genel');
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/urunler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, FormulaJSON: JSON.stringify(formulResults) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "İşlem başarısız");
      }
      router.push("/ugd/urun-listesi");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Formül tab işlemleri ─────────────────────────────
  const processFormulItems = async (items: { name: string; amount: string }[]) => {
    if (!items.length) return;
    setFormulLoading(true);
    setFormulError("");
    try {
      const res = await fetch("/api/formul-kontrol/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("Kontrol işlemi başarısız");
      setFormulResults(await res.json());
    } catch (e: any) {
      setFormulError(e.message);
    } finally {
      setFormulLoading(false);
    }
  };

  const handleFormulPaste = () => {
    if (!formulInput.trim()) { setFormulError("Lütfen formülü yapıştırın."); return; }
    const items = formulInput.split("\n").filter(l => l.trim()).map(l => {
      const parts = l.split("\t");
      if (parts.length < 2) {
        const fb = l.split(/\s\s+/);
        if (fb.length >= 2) return { name: fb[0].trim(), amount: fb[1].trim() };
      }
      return { name: (parts[0] || "").trim(), amount: (parts[1] || "0").trim() };
    }).filter(i => i.name);
    processFormulItems(items);
  };

  const handleFormulFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        const items = data.map(row => ({
          name: (row["INCI İsmi"] || row["INCI ismi"] || row["INCI"])?.toString() || "",
          amount: (row["Üst Değer(%)"] || row["Üst değer(%)"] || row["Miktar"])?.toString() || "0",
        })).filter(i => i.name);
        if (!items.length) { setFormulError("Excel'de 'INCI İsmi' ve 'Üst Değer(%)' sütunları bulunamadı."); return; }
        processFormulItems(items);
      } catch { setFormulError("Dosya okunurken hata oluştu."); }
    };
    reader.readAsBinaryString(file);
  };

  const addFormulRow = () => {
    setFormulResults([...formulResults, {
      inputName: "", inputAmount: "0", matched: false,
      INCIName: null, Cas: null, Ec: null, Functions: null,
      Regulation: null, Maks: null, Diger: null, Etiket: null,
    }]);
  };

  const updateFormulRow = async (index: number, name: string) => {
    if (!name) return;
    try {
      const res = await fetch("/api/formul-kontrol/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ name, amount: formulResults[index].inputAmount }] }),
      });
      const json = await res.json();
      if (json?.[0]) { const r = [...formulResults]; r[index] = json[0]; setFormulResults(r); }
    } catch {}
  };

  // ── Ortak UI bileşenleri ─────────────────────────────
  const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className={styles.tableCard} style={{ padding: 24, marginBottom: 20 }}>
      <div style={{
        marginBottom: 20, paddingBottom: 10,
        borderBottom: '1px solid var(--color-border-light)',
        color: 'var(--color-accent)', fontWeight: 700, fontSize: '1rem',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 4, height: 16, background: 'var(--color-accent)', borderRadius: 2 }} />
        {title}
      </div>
      {children}
    </div>
  );

  // Not: LangInput içindeki useState, her render'da bileşen yeniden oluşturulduğunda
  // sıfırlanır. Basit formlar için yeterli; ileride memoize edilebilir.
  const LangInput = ({ label, field, fieldEn, rows = 1 }: {
    label: string; field: string; fieldEn: string; rows?: number;
  }) => {
    const [lang, setLang] = useState<'TR' | 'EN'>('TR');
    const isTr = lang === 'TR';
    const value = (form as any)[isTr ? field : fieldEn];
    return (
      <div className={styles.formGroup}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{label} {isTr ? "(TR)" : "(EN)"}</span>
          <button
            type="button"
            onClick={() => setLang(isTr ? 'EN' : 'TR')}
            style={{
              background: 'rgba(0,113,227,0.08)', border: 'none', borderRadius: 4,
              padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700,
              color: 'var(--color-accent)', cursor: 'pointer',
            }}
          >
            {isTr ? "🇹🇷 TR" : "🇬🇧 EN"}
          </button>
        </label>
        <div style={{ position: 'relative' }}>
          {rows > 1 ? (
            <textarea
              rows={rows}
              value={value}
              onChange={e => setForm(prev => ({ ...prev, [isTr ? field : fieldEn]: e.target.value }))}
              style={{ width: '100%', paddingRight: 40 }}
            />
          ) : (
            <input
              value={value}
              onChange={e => setForm(prev => ({ ...prev, [isTr ? field : fieldEn]: e.target.value }))}
              style={{ width: '100%', paddingRight: 40 }}
            />
          )}
          <div style={{
            position: 'absolute', right: 12,
            top: rows > 1 ? 12 : '50%',
            transform: rows > 1 ? 'none' : 'translateY(-50%)',
            pointerEvents: 'none', opacity: 0.4,
            fontSize: '0.7rem', fontWeight: 700,
          }}>
            {isTr ? "TR" : "EN"}
          </div>
        </div>
      </div>
    );
  };

  const tabIndex = TABS.findIndex(t => t.id === activeTab);

  return (
    <div className={styles.page}>
      {/* Sayfa başlığı */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Yeni Ürün Ekle</h1>
          <p className={styles.pageSubtitle}>Yeni ÜGD ürün kaydı oluşturun.</p>
        </div>
        <button className={styles.cancelBtn} onClick={() => router.back()}>Geri Dön</button>
      </div>

      {/* Tab çubuğu */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 28,
        background: 'var(--color-bg)',
        padding: 4, borderRadius: 12,
        border: '1px solid var(--color-border-light)',
        overflowX: 'auto',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, minWidth: 140,
              padding: '10px 16px',
              border: 'none', borderRadius: 8,
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '0.83rem',
              background: activeTab === tab.id ? 'var(--color-accent)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--color-text-secondary)',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className={styles.formError} style={{ marginBottom: 20 }}>{error}</div>}

      <form onSubmit={handleSave}>

        {/* ──────────────────────────────────────────────
            Tab 1 — Genel Bilgiler
        ────────────────────────────────────────────── */}
        {activeTab === 'genel' && (
          <SectionCard title="Genel Bilgiler">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className={styles.formGrid3}>
                <div className={styles.formGroup}>
                  <label>Rapor No</label>
                  <input value={form.RaporNo} onChange={e => setForm({ ...form, RaporNo: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label>Versiyon No</label>
                  <input value={form.Versiyon} onChange={e => setForm({ ...form, Versiyon: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label>Tarih</label>
                  <input type="date" value={form.Tarih} onChange={e => setForm({ ...form, Tarih: e.target.value })} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Firma Adı</label>
                <select value={form.FirmaID} onChange={e => setForm({ ...form, FirmaID: e.target.value })} required>
                  <option value="">Firma Seçin</option>
                  {lookups.firmalar.map(f => <option key={f.ID} value={f.ID}>{f.Ad}</option>)}
                </select>
              </div>

              <LangInput label="Ürün Adı" field="Urun" fieldEn="UrunEn" />

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Barkod</label>
                  <input value={form.Barkod} onChange={e => setForm({ ...form, Barkod: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label>Ürün Miktarı</label>
                  <input value={form.Miktar} onChange={e => setForm({ ...form, Miktar: e.target.value })} />
                </div>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Kullanım Şekli</label>
                  <select value={form.Tip1} onChange={e => setForm({ ...form, Tip1: e.target.value })}>
                    <option value="Durulanan">Durulanan</option>
                    <option value="Durulanmayan">Durulanmayan</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Ürün Tipi (rUGDTip)</label>
                  <select value={form.Tip2} onChange={e => handleTipChange(e.target.value)}>
                    <option value="">Tip Seçin</option>
                    {lookups.tipler.map(t => <option key={t.ID} value={t.ID}>{t.UrunTipi}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.formGrid3}>
                <div className={styles.formGroup}>
                  <label>Hedef Grup</label>
                  <input value={form.Hedef} onChange={e => setForm({ ...form, Hedef: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label>Uygulama Alanı</label>
                  <input value={form.Uygulama} onChange={e => setForm({ ...form, Uygulama: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label>A Değeri</label>
                  <input value={form.A} onChange={e => setForm({ ...form, A: e.target.value })} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Rapor Durumu</label>
                <select value={form.RaporDurum} onChange={e => setForm({ ...form, RaporDurum: e.target.value })}>
                  <option value="Tamamlandı">Tamamlandı</option>
                  <option value="Taslak">Taslak</option>
                  <option value="İncelemede">İncelemede</option>
                </select>
              </div>
            </div>
          </SectionCard>
        )}

        {/* ──────────────────────────────────────────────
            Tab 2 — Ürün Formülü
        ────────────────────────────────────────────── */}
        {activeTab === 'formul' && (
          <>
            <div className={styles.tableCard} style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Formül Girişi</h3>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="file" accept=".xlsx,.xls,.csv"
                    ref={fileInputRef} onChange={handleFormulFile}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className={styles.addBtn}
                    style={{ background: '#1d6f42' }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style={{ marginRight: 6 }}>
                      <path d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5V7.621a2.5 2.5 0 0 0-.732-1.768l-2.621-2.621A2.5 2.5 0 0 0 12.379 2H4.5Zm10.06 4.5-2.56-2.56a1 1 0 0 0-.25-.5h3.06a1 1 0 0 0-.25.5ZM10 7.5a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 10 7.5Z" />
                    </svg>
                    Excel İçe Aktar
                  </button>
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                Excel'den <strong>"INCI İsmi"</strong> ve <strong>"Üst Değer(%)"</strong> sütunlarını seçip buraya
                yapıştırabilir veya dosyayı yükleyebilirsiniz.
              </p>
              <textarea
                className={styles.searchInput}
                style={{ width: '100%', minHeight: 160, padding: 16, fontFamily: 'monospace' }}
                placeholder="Kopyalayıp buraya yapıştırın (Excel stili)..."
                value={formulInput}
                onChange={e => setFormulInput(e.target.value)}
                disabled={formulLoading}
              />
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button type="button" className={styles.saveBtn} onClick={handleFormulPaste} disabled={formulLoading}>
                  {formulLoading ? "Analiz Ediliyor..." : "ANALİZİ BAŞLAT"}
                </button>
                <button
                  type="button" className={styles.cancelBtn}
                  onClick={() => { setFormulInput(""); setFormulResults([]); setFormulError(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                >
                  Temizle
                </button>
              </div>
              {formulError && <div className={styles.formError} style={{ marginTop: 12 }}>{formulError}</div>}
            </div>

            {formulResults.length > 0 && (
              <div className={styles.tableCard}>
                <div className={styles.toolbar} style={{ padding: '12px 24px' }}>
                  <div className={styles.toolbarLeft}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Değerlendirme Tablosu</h3>
                    <span className={styles.totalCount} style={{ marginLeft: 12 }}>{formulResults.length} bileşen</span>
                  </div>
                  <div className={styles.toolbarRight}>
                    <button type="button" className={styles.addBtn} onClick={addFormulRow}>+ Satır Ekle</button>
                  </div>
                </div>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Giriş (INCI / Miktar)</th>
                        <th>Cas / EC</th>
                        <th>Functions</th>
                        <th>Annex (Reg)</th>
                        <th>Limitler (Maks/Diğer)</th>
                        <th>Etiket Bilgisi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formulResults.map((row, i) => (
                        <tr key={i} style={{ opacity: row.matched ? 1 : 0.65, background: !row.matched ? '#fff0f0' : 'transparent' }}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              {row.matched ? (
                                <a
                                  href={row.Link || "#"} target="_blank" rel="noopener noreferrer"
                                  style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none' }}
                                >
                                  {row.INCIName}
                                </a>
                              ) : (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <span style={{ color: '#d32f2f' }}>⚠️</span>
                                  <input
                                    placeholder="Doğru ismi girin"
                                    defaultValue={row.inputName}
                                    onBlur={e => updateFormulRow(i, e.target.value)}
                                    style={{ border: '1px solid #ffb3b3', borderRadius: 4, padding: '2px 6px', fontSize: '0.8rem', width: '100%' }}
                                  />
                                </div>
                              )}
                              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Miktar: {row.inputAmount}%</span>
                            </div>
                          </td>
                          <td className={styles.tdMono}>
                            {row.Cas && <div>{row.Cas}</div>}
                            {row.Ec && <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{row.Ec}</div>}
                          </td>
                          <td style={{ fontSize: '0.75rem' }}>{row.Functions || "—"}</td>
                          <td style={{ fontSize: '0.75rem' }}>{row.Regulation || "—"}</td>
                          <td style={{ fontSize: '0.75rem' }}>
                            {row.Maks && <div><strong>Maks:</strong> {row.Maks}</div>}
                            {row.Diger && <div><strong>Sınır:</strong> {row.Diger}</div>}
                            {!row.Maks && !row.Diger && <span style={{ opacity: 0.5 }}>—</span>}
                          </td>
                          <td style={{ fontSize: '0.7rem' }}>{row.Etiket || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ──────────────────────────────────────────────
            Tab 3 — Ürün Detayları
        ────────────────────────────────────────────── */}
        {activeTab === 'detaylar' && (
          <>
            <SectionCard title="Fiziksel / Kimyasal Özellikler">
              <div className={styles.formGrid}>
                <LangInput label="Görünüm"               field="Gorunum"              fieldEn="GorunumEn" />
                <LangInput label="Renk"                  field="Renk"                 fieldEn="RenkEn" />
                <LangInput label="Koku"                  field="Koku"                 fieldEn="KokuEn" />
                <LangInput label="pH"                    field="PH"                   fieldEn="PHEn" />
                <LangInput label="Yoğunluk"              field="Yogunluk"             fieldEn="YogunlukEn" />
                <LangInput label="Viskozite"             field="Viskozite"            fieldEn="ViskoziteEn" />
                <LangInput label="Kaynama Noktası"       field="Kaynama"              fieldEn="KaynamaEn" />
                <LangInput label="Erime Noktası"         field="Erime"                fieldEn="ErimeEn" />
                <LangInput label="Suda Çözünebilirlik"   field="SudaCozunebilirlik"   fieldEn="SudaCozunebilirlikEn" />
                <LangInput label="Diğer Çözünebilirlik"  field="DigerCozunebilirlik"  fieldEn="DigerCozunebilirlikEn" />
              </div>
            </SectionCard>

            <SectionCard title="Laboratuvar Testleri">
              <div className={styles.formGrid}>
                <LangInput label="Mikrobiyoloji"       field="Mikrobiyoloji"      fieldEn="MikrobiyolojiEn" />
                <LangInput label="Koruyucu Etkinlik"   field="KoruyucuEtkinlik"   fieldEn="KoruyucuEtkinlikEn" />
                <LangInput label="Stabilite"           field="Stabilite"          fieldEn="StabiliteEn" />
              </div>
            </SectionCard>
          </>
        )}

        {/* ──────────────────────────────────────────────
            Tab 4 — Kutu / Etiket Bilgileri
        ────────────────────────────────────────────── */}
        {activeTab === 'etiket' && (
          <SectionCard title="Kutu / Etiket Bilgileri">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <LangInput label="Kullanım"   field="Kullanim"   fieldEn="KullanimEn"   rows={3} />
              <LangInput label="Özellikler" field="Ozellikler" fieldEn="OzelliklerEn" rows={3} />
              <LangInput label="Uyarılar"   field="Uyarilar"   fieldEn="UyarilarEn"   rows={3} />
            </div>
          </SectionCard>
        )}

        {/* ──────────────────────────────────────────────
            Tab 5 — Rapor
        ────────────────────────────────────────────── */}
        {activeTab === 'rapor' && (
          <>
            <SectionCard title="A.5 — Normal ve Makul Kullanım">
              <LangInput label="Normal Kullanım Tanımı" field="NormalKullanim" fieldEn="NormalKullanimEn" rows={4} />
            </SectionCard>

            <SectionCard title="A.6 — Kozmetik Ürüne Maruziyet">
              <LangInput label="Maruziyet Değerlendirmesi" field="MaruziyetAciklama" fieldEn="MaruziyetAciklamaEn" rows={4} />
            </SectionCard>

            <SectionCard title="A.7 — Bileşenlere Maruziyet Değerlendirmesi">
              <LangInput label="Bileşenlere Maruziyet" field="BilesenlereMaruziyet" fieldEn="BilesenlereMaruziyetEn" rows={4} />
            </SectionCard>

            <SectionCard title="A.8 — Toksikolojik Profil">
              <LangInput label="Toksikolojik Profil Özeti" field="ToksikolojikProfil" fieldEn="ToksikolojikProfilEn" rows={6} />
            </SectionCard>

            <SectionCard title="A.9 — İstenmeyen Etkiler ve Ciddi İstenmeyen Etkiler">
              <LangInput label="İstenmeyen Etkiler" field="IstenmedEtkiler" fieldEn="IstenmedEtkilerEn" rows={4} />
            </SectionCard>

            <SectionCard title="A.10 — Kozmetik Ürün Bilgisi">
              <LangInput label="Ürün Bilgisi" field="UrunBilgisi" fieldEn="UrunBilgisiEn" rows={4} />
            </SectionCard>

            <SectionCard title="B.1 — Değerlendirme Sonucu">
              <LangInput label="Değerlendirme Sonucu" field="DegerlendirmeSonucu" fieldEn="DegerlendirmeSonucuEn" rows={5} />
            </SectionCard>

            <SectionCard title="B.2 — Etiket Uyarıları ve Kullanım Talimatları">
              <LangInput label="Etiket Uyarıları (B.2)" field="EtiketUyarilariB2" fieldEn="EtiketUyarilariB2En" rows={4} />
            </SectionCard>

            <SectionCard title="B.3 — Gerekçelendirme">
              <LangInput label="Gerekçelendirme" field="Gerekce" fieldEn="GerekceEn" rows={4} />
            </SectionCard>

            <SectionCard title="B.4 — Güvenlilik Değerlendirme Sorumlusu">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className={styles.formGroup}>
                  <label>Ad Soyad / Kuruluş</label>
                  <input value={form.SorumluAd} onChange={e => setForm({ ...form, SorumluAd: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label>Adres</label>
                  <textarea
                    rows={3}
                    value={form.SorumluAdres}
                    onChange={e => setForm({ ...form, SorumluAdres: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Kanıt / Belge Referansı</label>
                  <input value={form.SorumluKanit} onChange={e => setForm({ ...form, SorumluKanit: e.target.value })} />
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {/* ── Alt navigasyon ────────────────────────────── */}
        <div style={{
          marginTop: 24,
          display: 'flex', gap: 12, justifyContent: 'space-between',
          borderTop: '1px solid var(--color-border-light)', paddingTop: 24,
        }}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => setActiveTab(TABS[Math.max(0, tabIndex - 1)].id)}
            disabled={tabIndex === 0}
            style={{ opacity: tabIndex === 0 ? 0.35 : 1 }}
          >
            ← Önceki
          </button>

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className={styles.cancelBtn} onClick={() => router.back()}>
              İptal
            </button>
            {tabIndex < TABS.length - 1 ? (
              <button
                type="button"
                className={styles.saveBtn}
                onClick={() => setActiveTab(TABS[tabIndex + 1].id)}
              >
                Sonraki →
              </button>
            ) : (
              <button
                type="submit"
                className={styles.saveBtn}
                disabled={loading}
                style={{ minWidth: 200 }}
              >
                {loading ? "Kaydediliyor..." : "ÜRÜNÜ KAYDET"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
