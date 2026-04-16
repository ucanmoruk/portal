"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from '@/app/styles/table.module.css';
import * as XLSX from "xlsx";

interface MatchedIngredient {
  inputName: string; inputAmount: string; matched: boolean;
  INCIName: string | null; Cas: string | null; Ec: string | null;
  Functions: string | null; Regulation: string | null;
  Link?: string | null; Maks: string | null; Diger: string | null; Etiket: string | null;
}

const TABS = [
  { id: 'genel',    label: '1 · Genel Bilgiler' },
  { id: 'formul',   label: '2 · Ürün Formülü' },
  { id: 'detaylar', label: '3 · Ürün Detayları' },
  { id: 'etiket',   label: '4 · Kutu / Etiket' },
  { id: 'rapor',    label: '5 · Rapor' },
];

// ── Rapor sekmesi için default metinler (rapordan alındı) ────────────────────
const DEFAULTS = {
  NormalKullanim: "Tüm vücut cildine uygulanır. Yetişkinler tarafından kullanım içindir.",
  MaruziyetAciklama: "Ürün tipi: Durulanmayan\nUygulama yeri: Tüm vücut\nUygulanan ürünün deriye temas ettiği alan: 200 cm²\nUygulanan ürünün miktarı: 20,630 g\nTemas süresi ve uygulama sıklığı: 1/gün\nMaruziyet yolu: Dermal emilim\nA değeri için (toplam günlük maruziyet) (yetişkin vücut ağırlığı: 60 kg) SCCS Notes Of Guidance 12th Revision (SCCS/1647/22) baz alınmıştır.",
  BilesenlereMaruziyet: "SED: Sistemik maruziyet dozu. Kan dolaşımına geçmesi beklenen kozmetik bileşeninin miktarıdır. Birimi mg/kg vücut ağırlığı/gün cinsinden ifade edilir.\n\nEldeki veriler ışığında SED iki yöntemle hesaplanabilir. Burada tercih edilen metot uygulanan ürünün % olarak dermal emilim miktarı üzerinden yapılan hesaplamadır.\n\nSED = A (mg/kg × Vücut Ağırlığı/Gün) × C (%) / 100 × DAP (%) / 100\n\nGünlük maruziyet miktarı için hesaplanan A değeri: 20,630\nKoruyucular için kullanılan A değeri: 269,00 mg/kg vücut ağırlığı/gün.\n\nİlgili ürüne ait hesaplanmış SED değerleri Ek-1 Tablo-1'de belirtilmiştir.",
  ToksikolojikProfil: "Formülde yer alan hammaddeler ve karışımlar ticari adlarına göre gruplandırılarak toksikolojik değerlendirmeleri yapılmıştır. Hammadde ve karışımların fiziksel özellikleri ve toksikolojik profilleri Ek-3'te verilmiştir.\n\nGüvenlilik Sınırının (MoS) Hesaplanması:\nBütün belirgin emilim yolları dikkate alınarak ve deneyler sonucu gözlemlenen toksikolojik veriler ışığında belirlenen NO(A)EL değerine dayanarak, sistemik etkiler ve güvenlilik sınırı (MoS) hesaplanır.\n\nMoS = NO(A)EL / SED ≥ 100\n\nToksikolojik verilerin mevcut olduğu bileşenler için hesaplanan güvenlik marjı, güvenlik faktörünün kabul edilebilir olduğunu buldu (MoS > 100). Bu bileşenler insanlar için bir tehlike oluşturmaz ve nihai kozmetik ürünün güvenliğini olumsuz yönde etkilemez.\n\nİlgili ürüne ait hesaplanmış MoS değerleri Ek-1 Tablo-1'de belirtilmiştir.",
  IstenmedEtkiler: "Ürünün piyasaya arzı sonrası kullanımında üründen kaynaklanan istenmeyen etkileri toplayacak, belgelendirecek, nedensellik kuracak ve yönetecek bir sistem kurulmalı ve ciddi istenmeyen etkiler olduğunda, ilgili kılavuz gereğince Kurum bilgilendirilmelidir.\n\nÜretici tarafından istenmeyen etki ve ciddi istenmeyen etki bildirilmemiştir.",
  UrunBilgisi: "Güvenlik değerlendirme raporuna ve toksikolojik profil hesaplamalarına göre ürünün satışında herhangi bir engel bulunmamaktadır. İspatlanması gereken bir iddia bulunmamaktadır ve ürün hakkında destekleyici bir güvenlik verisi bulunmamaktadır.\n\nEtiket, ürün bileşimi, GMP Sertifikası, Test sonuçları (Stabilite Testi, Challenge ve Mikrobiyolojik Test), Hammaddelere ait Güvenlik Bilgi Formları, Ambalajlama Materyaline ait bilgiler, Üretim yöntemi ve Bitmiş ürüne ait Güvenlik Bilgi Formu gibi ek belgeler ürün bilgi dosyasında bulunmaktadır.",
  DegerlendirmeSonucu: "Kozmetik Yönetmeliğinin 6'ncı maddesi gereğince piyasaya arz edilen bir kozmetik ürün, normal ve üretici tarafından öngörülebilen şartlar altında uygulandığında insan sağlığı açısından güvenli olmalıdır.\n\nİşbu rapor; ürün bileşenlerinin toksikolojik karakteri, kimyasal yapısı ve maruz kalma seviyeleri, ürünün kullanımına sunulduğu hedef kitlenin veya ürünün uygulanacağı bölgenin belirgin maruziyet özellikleri göz önünde bulundurularak Kozmetik Yönetmeliği'nin 12'nci maddesi gereğince kozmetik bitmiş ürüne hazırlanmıştır.\n\nBütün kaynaklardan elde edilen mevcut veriler değerlendirilerek kozmetik ürün güvenlilik raporu hazırlanmıştır. Formülasyonda yer alan her bir maddenin, karışımın ve bitmiş ürünün öngörülen kullanım koşulları altında güvenlilik değerlendirmesi yapılmıştır.\n\nDeğerlendirilen kozmetik ürün düzenli kullanım için uygun olup, harici kullanım içindir.\n\nÜrün; Kozmetik Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik / EK II — Kozmetik Ürünlerde Yasaklı Maddeler Listesi'ndeki maddeleri içermemektedir.\n\nBu rapor mevcut veriler doğrultusunda hazırlanmıştır. Normal şartlar altında ürünün, kullanım yeri, kullanım amacı ve miktarına göre normal ve makul olarak öngörülebilir kullanımı uygundur.\n\nÜrün güvenlik değerlendirmesi tarafımca hazırlanmış olup başkalarına devredilemez.",
  EtiketUyarilariB2: "Ürün üzerinde yer alan kullanım ve uyarılar bölümüne A.5. maddesinde değinilmiştir. Ürüne ait görseller ürün güvenlik dosyasında da paylaşılmıştır.",
  Gerekce: "Bu Ürün Bilgi Dosyasında yer alan aşağıdaki kriterlere ilişkin belgeler incelenmiş ve söz konusu ürünün güvenlik değerlendirmesi sonucuna varılması için dikkate alınmıştır:\n\n- Kozmetik ürünün niceliksel ve niteliksel bileşimi: Kozmetik formülündeki bileşenlerin tanımlanması ve işlevi değerlendirilmiştir.\n\n- Kozmetik ürünün fiziksel/kimyasal özellikleri ve stabilitesi: Stabilite çalışmaları, ürünün test koşulları altında kararlı kaldığını göstermektedir. Etikette, açıldıktan sonra geçen sürenin 12 ay olduğu belirtilmektedir.\n\n- Mikrobiyolojik kalite: Ürün mikrobiyolojik açıdan kararlıdır. Üretici, challenge testi yaparak bu ürünün korunmasının etkinliğini deneysel olarak garanti eder.\n\n- Safsızlıklar, izler, ambalaj malzemesi: Tüm hammaddeler güvenlik ve yönetmeliğe uygunluk açısından değerlendirildi. İçeriklerde bulunan safsızlıklar belirlenen sınırlar içindedir ve toksikolojik olarak önemli kabul edilmemektedir.\n\n- Maddelerin Toksikolojik Profili: Güvenlik marjları (MoS = NO(A)EL / SED ≥ 100) hesaplanmıştır. Mevcut toksikolojik verilere ve hesaplanan güvenlik marjlarına dayanarak, kozmetik formülünde bulunan hammaddeler, kullanılan konsantrasyonlarda sistemik bir toksisite riski oluşturmaz.\n\n- İstenmeyen etkiler ve ciddi istenmeyen etkiler: Kasıtsız ve ciddi olumsuz etkiler olması durumunda düzeltici önlemler alınır ve güvenlik değerlendirmesi güncellenir.\n\nGüvenlik değerlendirmesi kişisel olarak yapılmış olup devredilemez.",
  SorumluAd: "Oğuzhan EKER — ROOT KOZMETİK A.Ş.",
  SorumluAdres: "Yakuplu Mah. Hürriyet Blv. Yakuplu Eval Plaza No.131 D.40 Beylikdüzü İstanbul",
  SorumluKanit: "Balıkesir Üniversitesi Fen Fakültesi // Kimya — Bkz. Ek – Güvenlilik Değerlendiricisinin Niteliği",
};

export default function YeniUrunPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('genel');
  const [savingTab, setSavingTab] = useState<string | null>(null);
  const [savedTabs, setSavedTabs] = useState<Set<string>>(new Set());
  const [globalError, setGlobalError] = useState("");
  const [printLoading, setPrintLoading] = useState(false);

  // Formül sekmesi
  const [formulInput, setFormulInput] = useState("");
  const [formulResults, setFormulResults] = useState<MatchedIngredient[]>([]);
  const [formulLoading, setFormulLoading] = useState(false);
  const [formulError, setFormulError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lookup
  const [lookups, setLookups] = useState<{ firmalar: any[]; tipler: any[] }>({ firmalar: [], tipler: [] });

  // Ana form — rapor alanları default metinlerle başlatılır
  const [form, setForm] = useState({
    Tarih: new Date().toISOString().split('T')[0],
    RaporNo: "", Versiyon: "1", FirmaID: "",
    Urun: "", UrunEn: "", Barkod: "", Miktar: "",
    Tip1: "Durulanmayan", Tip2: "", Uygulama: "",
    Hedef: "Yetişkinler", A: "", RaporDurum: "Tamamlandı",
    // Tab 3
    Gorunum: "", GorunumEn: "", Renk: "", RenkEn: "",
    Koku: "", KokuEn: "", PH: "", PHEn: "",
    Yogunluk: "", YogunlukEn: "", Viskozite: "", ViskoziteEn: "",
    Kaynama: "", KaynamaEn: "", Erime: "", ErimeEn: "",
    SudaCozunebilirlik: "", SudaCozunebilirlikEn: "",
    DigerCozunebilirlik: "", DigerCozunebilirlikEn: "",
    Mikrobiyoloji: "", MikrobiyolojiEn: "",
    KoruyucuEtkinlik: "", KoruyucuEtkinlikEn: "",
    Stabilite: "", StabiliteEn: "",
    // Tab 4
    Kullanim: "", KullanimEn: "",
    Ozellikler: "", OzelliklerEn: "",
    Uyarilar: "", UyarilarEn: "",
    // Tab 5 — default metinler ile başlatılır
    NormalKullanim: DEFAULTS.NormalKullanim,
    MaruziyetAciklama: DEFAULTS.MaruziyetAciklama,
    BilesenlereMaruziyet: DEFAULTS.BilesenlereMaruziyet,
    ToksikolojikProfil: DEFAULTS.ToksikolojikProfil,
    IstenmedEtkiler: DEFAULTS.IstenmedEtkiler,
    UrunBilgisi: DEFAULTS.UrunBilgisi,
    DegerlendirmeSonucu: DEFAULTS.DegerlendirmeSonucu,
    EtiketUyarilariB2: DEFAULTS.EtiketUyarilariB2,
    Gerekce: DEFAULTS.Gerekce,
    SorumluAd: DEFAULTS.SorumluAd,
    SorumluAdres: DEFAULTS.SorumluAdres,
    SorumluKanit: DEFAULTS.SorumluKanit,
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
      ...prev, Tip2: tipId,
      ...(tip ? { Uygulama: tip.UygulamaBolgesi || "", A: tip.ADegeri || "" } : {}),
    }));
  };

  // ── Per-tab save ──────────────────────────────────────────────────────────
  const handleTabSave = async (tabId: string) => {
    if (tabId === 'genel' && (!form.Urun || !form.FirmaID)) {
      setGlobalError("Ürün adı ve firma seçimi zorunludur.");
      return;
    }
    setGlobalError("");
    setSavingTab(tabId);
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
      setSavedTabs(prev => new Set([...prev, tabId]));
    } catch (err: any) {
      setGlobalError(err.message);
    } finally {
      setSavingTab(null);
    }
  };

  // ── Final save (tüm form) ─────────────────────────────────────────────────
  const handleFinalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.Urun || !form.FirmaID) {
      setGlobalError("Ürün adı ve firma seçimi zorunludur.");
      setActiveTab('genel');
      return;
    }
    await handleTabSave('final');
    if (!globalError) {
      router.push("/ugd/urun-listesi");
      router.refresh();
    }
  };

  // ── Print / Download DOCX ─────────────────────────────────────────────────
  const handlePrint = async () => {
    setPrintLoading(true);
    try {
      const firmaAd = lookups.firmalar.find(f => f.ID.toString() === form.FirmaID)?.Ad || "";
      const res = await fetch("/api/urunler/rapor-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, formulResults, firmaAd }),
      });
      if (!res.ok) throw new Error("Rapor oluşturulamadı");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `UGDR-${form.RaporNo || "rapor"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setGlobalError(err.message);
    } finally {
      setPrintLoading(false);
    }
  };

  // ── Formül işlemleri ──────────────────────────────────────────────────────
  const processFormulItems = async (items: { name: string; amount: string }[]) => {
    if (!items.length) return;
    setFormulLoading(true); setFormulError("");
    try {
      const res = await fetch("/api/formul-kontrol/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("Kontrol işlemi başarısız");
      setFormulResults(await res.json());
    } catch (e: any) { setFormulError(e.message); }
    finally { setFormulLoading(false); }
  };

  const handleFormulPaste = () => {
    if (!formulInput.trim()) { setFormulError("Lütfen formülü yapıştırın."); return; }
    const items = formulInput.split("\n").filter(l => l.trim()).map(l => {
      const parts = l.split("\t");
      if (parts.length < 2) { const fb = l.split(/\s\s+/); if (fb.length >= 2) return { name: fb[0].trim(), amount: fb[1].trim() }; }
      return { name: (parts[0] || "").trim(), amount: (parts[1] || "0").trim() };
    }).filter(i => i.name);
    processFormulItems(items);
  };

  const handleFormulFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
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

  const updateFormulRow = async (index: number, name: string) => {
    if (!name) return;
    try {
      const res = await fetch("/api/formul-kontrol/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ name, amount: formulResults[index].inputAmount }] }),
      });
      const json = await res.json();
      if (json?.[0]) { const r = [...formulResults]; r[index] = json[0]; setFormulResults(r); }
    } catch {}
  };

  // ── UI helpers ────────────────────────────────────────────────────────────
  const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className={styles.tableCard} style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ marginBottom: 20, paddingBottom: 10, borderBottom: '1px solid var(--color-border-light)', color: 'var(--color-accent)', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 4, height: 16, background: 'var(--color-accent)', borderRadius: 2 }} />
        {title}
      </div>
      {children}
    </div>
  );

  const LangInput = ({ label, field, fieldEn, rows = 1 }: { label: string; field: string; fieldEn: string; rows?: number }) => {
    const [lang, setLang] = useState<'TR' | 'EN'>('TR');
    const isTr = lang === 'TR';
    const value = (form as any)[isTr ? field : fieldEn];
    return (
      <div className={styles.formGroup}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{label} {isTr ? "(TR)" : "(EN)"}</span>
          <button type="button" onClick={() => setLang(isTr ? 'EN' : 'TR')} style={{ background: 'rgba(0,113,227,0.08)', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-accent)', cursor: 'pointer' }}>
            {isTr ? "🇹🇷 TR" : "🇬🇧 EN"}
          </button>
        </label>
        <div style={{ position: 'relative' }}>
          {rows > 1 ? (
            <textarea rows={rows} value={value} onChange={e => setForm(prev => ({ ...prev, [isTr ? field : fieldEn]: e.target.value }))} style={{ width: '100%', paddingRight: 40 }} />
          ) : (
            <input value={value} onChange={e => setForm(prev => ({ ...prev, [isTr ? field : fieldEn]: e.target.value }))} style={{ width: '100%', paddingRight: 40 }} />
          )}
          <div style={{ position: 'absolute', right: 12, top: rows > 1 ? 12 : '50%', transform: rows > 1 ? 'none' : 'translateY(-50%)', pointerEvents: 'none', opacity: 0.4, fontSize: '0.7rem', fontWeight: 700 }}>
            {isTr ? "TR" : "EN"}
          </div>
        </div>
      </div>
    );
  };

  // Rapor sekmesi — sadece TR textbox (EN yok, rapor TR)
  const RaporField = ({ label, field, rows = 4, hint }: { label: string; field: string; rows?: number; hint?: string }) => (
    <div className={styles.formGroup} style={{ marginBottom: 20 }}>
      <label style={{ fontWeight: 600, marginBottom: 6, display: 'block', fontSize: '0.85rem', color: 'var(--color-accent)' }}>
        {label}
      </label>
      {hint && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 6px' }}>{hint}</p>}
      <textarea
        rows={rows}
        value={(form as any)[field]}
        onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
        style={{ width: '100%', fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.6, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border-light)', background: 'var(--color-bg)', resize: 'vertical' }}
      />
    </div>
  );

  // ── Tab save bar ──────────────────────────────────────────────────────────
  const TabSaveBar = ({ tabId }: { tabId: string }) => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, marginBottom: 16 }}>
      {savedTabs.has(tabId) && (
        <span style={{ fontSize: '0.8rem', color: '#1a7340', alignSelf: 'center' }}>✓ Kaydedildi</span>
      )}
      <button
        type="button"
        onClick={() => handleTabSave(tabId)}
        disabled={savingTab === tabId}
        className={styles.saveBtn}
        style={{ minWidth: 160, background: 'var(--color-accent)', opacity: savingTab === tabId ? 0.6 : 1 }}
      >
        {savingTab === tabId ? "Kaydediliyor..." : "Bu Sekmeyi Kaydet"}
      </button>
    </div>
  );

  const tabIndex = TABS.findIndex(t => t.id === activeTab);

  return (
    <div className={styles.page}>
      {/* Başlık */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Yeni Ürün Ekle</h1>
          <p className={styles.pageSubtitle}>Yeni ÜGD ürün kaydı oluşturun.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#1F4788', opacity: printLoading ? 0.6 : 1 }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9v-1h8v1H6Zm0 2h8v2H6v-2Z" clipRule="evenodd" />
            </svg>
            {printLoading ? "Hazırlanıyor..." : "Yazdır / Word İndir"}
          </button>
          <button className={styles.cancelBtn} onClick={() => router.back()}>Geri Dön</button>
        </div>
      </div>

      {/* Tab çubuğu */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 28, background: 'var(--color-bg)', padding: 4, borderRadius: 12, border: '1px solid var(--color-border-light)', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1, minWidth: 140, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '0.83rem', background: activeTab === tab.id ? 'var(--color-accent)' : 'transparent', color: activeTab === tab.id ? '#fff' : 'var(--color-text-secondary)', transition: 'all 0.15s', whiteSpace: 'nowrap', position: 'relative' }}
          >
            {tab.label}
            {savedTabs.has(tab.id) && (
              <span style={{ position: 'absolute', top: 4, right: 6, fontSize: '0.55rem', color: activeTab === tab.id ? 'rgba(255,255,255,0.7)' : '#1a7340' }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {globalError && <div className={styles.formError} style={{ marginBottom: 20 }}>{globalError}</div>}

      <form onSubmit={handleFinalSave}>

        {/* ── Tab 1: Genel Bilgiler ─────────────────────────────────────── */}
        {activeTab === 'genel' && (
          <>
            <TabSaveBar tabId="genel" />
            <SectionCard title="Genel Bilgiler">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className={styles.formGrid3}>
                  <div className={styles.formGroup}><label>Rapor No</label><input value={form.RaporNo} onChange={e => setForm({ ...form, RaporNo: e.target.value })} /></div>
                  <div className={styles.formGroup}><label>Versiyon No</label><input value={form.Versiyon} onChange={e => setForm({ ...form, Versiyon: e.target.value })} /></div>
                  <div className={styles.formGroup}><label>Tarih</label><input type="date" value={form.Tarih} onChange={e => setForm({ ...form, Tarih: e.target.value })} /></div>
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
                  <div className={styles.formGroup}><label>Barkod</label><input value={form.Barkod} onChange={e => setForm({ ...form, Barkod: e.target.value })} /></div>
                  <div className={styles.formGroup}><label>Ürün Miktarı</label><input value={form.Miktar} onChange={e => setForm({ ...form, Miktar: e.target.value })} /></div>
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
                  <div className={styles.formGroup}><label>Hedef Grup</label><input value={form.Hedef} onChange={e => setForm({ ...form, Hedef: e.target.value })} /></div>
                  <div className={styles.formGroup}><label>Uygulama Alanı</label><input value={form.Uygulama} onChange={e => setForm({ ...form, Uygulama: e.target.value })} /></div>
                  <div className={styles.formGroup}><label>A Değeri</label><input value={form.A} onChange={e => setForm({ ...form, A: e.target.value })} /></div>
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
          </>
        )}

        {/* ── Tab 2: Ürün Formülü ──────────────────────────────────────── */}
        {activeTab === 'formul' && (
          <>
            <TabSaveBar tabId="formul" />
            <div className={styles.tableCard} style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Formül Girişi</h3>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef} onChange={handleFormulFile} style={{ display: 'none' }} />
                  <button type="button" className={styles.addBtn} style={{ background: '#1d6f42' }} onClick={() => fileInputRef.current?.click()}>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style={{ marginRight: 6 }}>
                      <path d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5V7.621a2.5 2.5 0 0 0-.732-1.768l-2.621-2.621A2.5 2.5 0 0 0 12.379 2H4.5Zm10.06 4.5-2.56-2.56a1 1 0 0 0-.25-.5h3.06a1 1 0 0 0-.25.5ZM10 7.5a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 10 7.5Z" />
                    </svg>
                    Excel İçe Aktar
                  </button>
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                Excel'den <strong>"INCI İsmi"</strong> ve <strong>"Üst Değer(%)"</strong> sütunlarını seçip yapıştırın veya dosyayı yükleyin.
              </p>
              <textarea className={styles.searchInput} style={{ width: '100%', minHeight: 160, padding: 16, fontFamily: 'monospace' }} placeholder="Kopyalayıp buraya yapıştırın (Excel stili)..." value={formulInput} onChange={e => setFormulInput(e.target.value)} disabled={formulLoading} />
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button type="button" className={styles.saveBtn} onClick={handleFormulPaste} disabled={formulLoading}>
                  {formulLoading ? "Analiz Ediliyor..." : "ANALİZİ BAŞLAT"}
                </button>
                <button type="button" className={styles.cancelBtn} onClick={() => { setFormulInput(""); setFormulResults([]); setFormulError(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
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
                    <button type="button" className={styles.addBtn} onClick={() => setFormulResults([...formulResults, { inputName: "", inputAmount: "0", matched: false, INCIName: null, Cas: null, Ec: null, Functions: null, Regulation: null, Maks: null, Diger: null, Etiket: null }])}>
                      + Satır Ekle
                    </button>
                  </div>
                </div>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Giriş (INCI / Miktar)</th><th>Cas / EC</th><th>Functions</th><th>Annex (Reg)</th><th>Limitler</th><th>Etiket Bilgisi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formulResults.map((row, i) => (
                        <tr key={i} style={{ opacity: row.matched ? 1 : 0.65, background: !row.matched ? '#fff0f0' : 'transparent' }}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              {row.matched ? (
                                <a href={row.Link || "#"} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none' }}>{row.INCIName}</a>
                              ) : (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <span style={{ color: '#d32f2f' }}>⚠️</span>
                                  <input placeholder="Doğru ismi girin" defaultValue={row.inputName} onBlur={e => updateFormulRow(i, e.target.value)} style={{ border: '1px solid #ffb3b3', borderRadius: 4, padding: '2px 6px', fontSize: '0.8rem', width: '100%' }} />
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

        {/* ── Tab 3: Ürün Detayları ─────────────────────────────────────── */}
        {activeTab === 'detaylar' && (
          <>
            <TabSaveBar tabId="detaylar" />
            <SectionCard title="Fiziksel / Kimyasal Özellikler">
              <div className={styles.formGrid}>
                <LangInput label="Görünüm" field="Gorunum" fieldEn="GorunumEn" />
                <LangInput label="Renk" field="Renk" fieldEn="RenkEn" />
                <LangInput label="Koku" field="Koku" fieldEn="KokuEn" />
                <LangInput label="pH" field="PH" fieldEn="PHEn" />
                <LangInput label="Yoğunluk" field="Yogunluk" fieldEn="YogunlukEn" />
                <LangInput label="Viskozite" field="Viskozite" fieldEn="ViskoziteEn" />
                <LangInput label="Kaynama Noktası" field="Kaynama" fieldEn="KaynamaEn" />
                <LangInput label="Erime Noktası" field="Erime" fieldEn="ErimeEn" />
                <LangInput label="Suda Çözünebilirlik" field="SudaCozunebilirlik" fieldEn="SudaCozunebilirlikEn" />
                <LangInput label="Diğer Çözünebilirlik" field="DigerCozunebilirlik" fieldEn="DigerCozunebilirlikEn" />
              </div>
            </SectionCard>
            <SectionCard title="Laboratuvar Testleri">
              <div className={styles.formGrid}>
                <LangInput label="Mikrobiyoloji" field="Mikrobiyoloji" fieldEn="MikrobiyolojiEn" />
                <LangInput label="Koruyucu Etkinlik" field="KoruyucuEtkinlik" fieldEn="KoruyucuEtkinlikEn" />
                <LangInput label="Stabilite" field="Stabilite" fieldEn="StabiliteEn" />
              </div>
            </SectionCard>
          </>
        )}

        {/* ── Tab 4: Kutu / Etiket ─────────────────────────────────────── */}
        {activeTab === 'etiket' && (
          <>
            <TabSaveBar tabId="etiket" />
            <SectionCard title="Kutu / Etiket Bilgileri">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <LangInput label="Kullanım" field="Kullanim" fieldEn="KullanimEn" rows={3} />
                <LangInput label="Özellikler" field="Ozellikler" fieldEn="OzelliklerEn" rows={3} />
                <LangInput label="Uyarılar" field="Uyarilar" fieldEn="UyarilarEn" rows={3} />
              </div>
            </SectionCard>
          </>
        )}

        {/* ── Tab 5: Rapor ──────────────────────────────────────────────── */}
        {activeTab === 'rapor' && (
          <>
            <TabSaveBar tabId="rapor" />

            <div style={{ marginBottom: 12, padding: '10px 16px', background: '#f0f7ff', borderRadius: 8, fontSize: '0.8rem', color: '#1F4788', border: '1px solid #c8e0ff' }}>
              Metinler rapordan varsayılan olarak yüklenmiştir. Ürüne özel bilgileri düzenleyip sekmeyi kaydedin, ardından <strong>Yazdır / Word İndir</strong> butonuyla raporu indirin.
            </div>

            <SectionCard title="A.5 — Normal ve Makul Kullanım">
              <RaporField label="Normal Kullanım Tanımı" field="NormalKullanim" rows={3} />
            </SectionCard>

            <SectionCard title="A.6 — Kozmetik Ürüne Maruziyet">
              <RaporField label="Maruziyet Değerlendirmesi" field="MaruziyetAciklama" rows={6}
                hint="A değeri, uygulama alanı (cm²), uygulama miktarı (g), sıklık ve maruziyet yolu bilgilerini içerir." />
            </SectionCard>

            <SectionCard title="A.7 — Bileşenlere Maruziyet Değerlendirmesi">
              <RaporField label="SED Hesaplama Açıklaması" field="BilesenlereMaruziyet" rows={7} />
            </SectionCard>

            <SectionCard title="A.8 — Toksikolojik Profil">
              <RaporField label="Toksikolojik Profil Özeti" field="ToksikolojikProfil" rows={8}
                hint="MoS = NO(A)EL / SED ≥ 100 hesaplama metodolojisini açıklayan metin." />
            </SectionCard>

            <SectionCard title="A.9 — İstenmeyen Etkiler">
              <RaporField label="İstenmeyen Etkiler ve Ciddi İstenmeyen Etkiler" field="IstenmedEtkiler" rows={4} />
            </SectionCard>

            <SectionCard title="A.10 — Kozmetik Ürün Bilgisi">
              <RaporField label="Ürün Bilgisi" field="UrunBilgisi" rows={5} />
            </SectionCard>

            <SectionCard title="B.1 — Değerlendirme Sonucu">
              <RaporField label="Değerlendirme Sonucu" field="DegerlendirmeSonucu" rows={10}
                hint="Mevzuata uygunluk, güvenlilik teyidi ve ürünün kullanım uygunluğunu açıklayan ana sonuç metni." />
            </SectionCard>

            <SectionCard title="B.2 — Etiket Uyarıları ve Kullanım Talimatları">
              <RaporField label="Etiket Uyarıları (B.2)" field="EtiketUyarilariB2" rows={4} />
            </SectionCard>

            <SectionCard title="B.3 — Gerekçelendirme">
              <RaporField label="Gerekçelendirme" field="Gerekce" rows={10}
                hint="Değerlendirilen her kriter için ayrı ayrı gerekçe yazın." />
            </SectionCard>

            <SectionCard title="B.4 — Güvenlilik Değerlendirme Sorumlusu">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className={styles.formGroup}>
                  <label>Ad Soyad / Kuruluş</label>
                  <input value={form.SorumluAd} onChange={e => setForm({ ...form, SorumluAd: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label>Adres</label>
                  <textarea rows={3} value={form.SorumluAdres} onChange={e => setForm({ ...form, SorumluAdres: e.target.value })} style={{ width: '100%' }} />
                </div>
                <div className={styles.formGroup}>
                  <label>Yeterlilik Kanıtı / Belge Referansı</label>
                  <input value={form.SorumluKanit} onChange={e => setForm({ ...form, SorumluKanit: e.target.value })} />
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {/* ── Alt navigasyon ────────────────────────────────────────────── */}
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'space-between', borderTop: '1px solid var(--color-border-light)', paddingTop: 24 }}>
          <button type="button" className={styles.cancelBtn} onClick={() => setActiveTab(TABS[Math.max(0, tabIndex - 1)].id)} disabled={tabIndex === 0} style={{ opacity: tabIndex === 0 ? 0.35 : 1 }}>
            ← Önceki
          </button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className={styles.cancelBtn} onClick={() => router.back()}>İptal</button>
            {tabIndex < TABS.length - 1 ? (
              <button type="button" className={styles.saveBtn} onClick={() => setActiveTab(TABS[tabIndex + 1].id)}>
                Sonraki →
              </button>
            ) : (
              <button type="submit" className={styles.saveBtn} style={{ minWidth: 200 }}>
                ÜRÜNÜ KAYDET
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
