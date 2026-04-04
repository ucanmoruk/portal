"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from '@/app/styles/table.module.css';
export default function YeniUrunPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lookups, setLookups] = useState<{ firmalar: any[], tipler: any[] }>({ firmalar: [], tipler: [] });

  const [form, setForm] = useState({
    Tarih: new Date().toISOString().split('T')[0],
    RaporNo: "",
    Versiyon: "1",
    FirmaID: "",
    Urun: "",
    UrunEn: "",
    Barkod: "",
    Miktar: "",
    Tip1: "Durulanmayan",
    Tip2: "",
    Uygulama: "",
    Hedef: "Yetişkinler",
    A: "",
    RaporDurum: "Tamamlandı",
    // Ürün Detayları
    Gorunum: "", GorunumEn: "",
    Renk: "", RenkEn: "",
    Koku: "", KokuEn: "",
    PH: "", PHEn: "",
    Yogunluk: "", YogunlukEn: "",
    Viskozite: "", ViskoziteEn: "",
    Kaynama: "", KaynamaEn: "",
    Erime: "", ErimeEn: "",
    SudaCozunebilirlik: "", SudaCozunebilirlikEn: "",
    DigerCozunebilirlik: "", DigerCozunebilirlikEn: "",
    // Laboratuvar Testleri
    Mikrobiyoloji: "", MikrobiyolojiEn: "",
    KoruyucuEtkinlik: "", KoruyucuEtkinlikEn: "",
    Stabilite: "", StabiliteEn: "",
    // Kutu / Etiket Bilgileri
    Kullanim: "", KullanimEn: "",
    Ozellikler: "", OzelliklerEn: "",
    Uyarilar: "", UyarilarEn: ""
  });

  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const res = await fetch("/api/urunler/lookup");
        if (res.ok) setLookups(await res.json());
      } catch (e) {}
    };
    fetchLookups();
  }, []);

  const handleTipChange = (tipId: string) => {
    const selectedTip = lookups.tipler.find(t => t.ID.toString() === tipId);
    if (selectedTip) {
      setForm(prev => ({
        ...prev,
        Tip2: tipId,
        Uygulama: selectedTip.UygulamaBolgesi || "",
        A: selectedTip.ADegeri || ""
      }));
    } else {
      setForm(prev => ({ ...prev, Tip2: tipId }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.Urun || !form.FirmaID) {
      setError("Ürün adı ve firma seçimi zorunludur.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      // Veritabanı bağlantısı sonra eklenecek dendiği için şu an sadece UI'da tutuyoruz
      const res = await fetch("/api/urunler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  const SectionCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className={styles.tableCard} style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ 
        marginBottom: 20, 
        paddingBottom: 10, 
        borderBottom: '1px solid var(--color-border-light)', 
        color: 'var(--color-accent)',
        fontWeight: 700,
        fontSize: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}>
        <div style={{ width: 4, height: 16, background: 'var(--color-accent)', borderRadius: 2 }}></div>
        {title}
      </div>
      {children}
    </div>
  );

  const LangInput = ({ label, field, fieldEn, rows = 1 }: { label: string, field: string, fieldEn: string, rows?: number }) => {
    const [lang, setLang] = useState<'TR' | 'EN'>('TR');
    const isTr = lang === 'TR';
    const value = isTr ? (form as any)[field] : (form as any)[fieldEn];
    
    return (
      <div className={styles.formGroup}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{label} {isTr ? "(TR)" : "(EN)"}</span>
          <button 
            type="button"
            onClick={() => setLang(isTr ? 'EN' : 'TR')}
            style={{ 
              background: 'rgba(0,113,227,0.08)', 
              border: 'none', 
              borderRadius: 4, 
              padding: '2px 6px', 
              fontSize: '0.65rem', 
              fontWeight: 700, 
              color: 'var(--color-accent)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {isTr ? "🇹🇷 TR" : "🇬🇧 EN"}
            <svg viewBox="0 0 20 20" fill="currentColor" width="10" height="10">
                <path fillRule="evenodd" d="M15.312 11.424a1 1 0 0 1 0 1.152l-4.592 5.74a1 1 0 0 1-1.44 0l-4.592-5.74a1 1 0 1 1 1.44-1.152L10 15.308l3.872-4.836a1 1 0 0 1 1.44-.048Z" />
            </svg>
          </button>
        </label>
        <div style={{ position: 'relative' }}>
          {rows > 1 ? (
            <textarea 
              rows={rows} 
              value={value} 
              onChange={e => setForm({...form, [isTr ? field : fieldEn]: e.target.value})} 
              style={{ width: '100%', paddingRight: 40 }}
            />
          ) : (
            <input 
              value={value} 
              onChange={e => setForm({...form, [isTr ? field : fieldEn]: e.target.value})} 
              style={{ width: '100%', paddingRight: 40 }}
            />
          )}
          <div style={{ 
            position: 'absolute', 
            right: 12, 
            top: rows > 1 ? 12 : '50%', 
            transform: rows > 1 ? 'none' : 'translateY(-50%)',
            pointerEvents: 'none',
            opacity: 0.5,
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            {isTr ? "TR" : "EN"}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Yeni Ürün Ekle</h1>
          <p className={styles.pageSubtitle}>Yeni ÜGD ürün kaydı oluşturun.</p>
        </div>
        <button className={styles.cancelBtn} onClick={() => router.back()}>Geri Dön</button>
      </div>

      <div style={{ marginBottom: 40 }}>
        {error && <div className={styles.formError} style={{ marginBottom: 20 }}>{error}</div>}
        
        <form onSubmit={handleSave}>
          <SectionCard title="Genel Bilgiler">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Row 1: RaporNo, Versiyon, Tarih */}
                <div className={styles.formGrid3}>
                  <div className={styles.formGroup}><label>Rapor No</label><input value={form.RaporNo} onChange={e => setForm({...form, RaporNo: e.target.value})} /></div>
                  <div className={styles.formGroup}><label>Versiyon No</label><input value={form.Versiyon} onChange={e => setForm({...form, Versiyon: e.target.value})} /></div>
                  <div className={styles.formGroup}><label>Tarih</label><input type="date" value={form.Tarih} onChange={e => setForm({...form, Tarih: e.target.value})} /></div>
                </div>

                {/* Row 2: Firma */}
                <div className={styles.formGroup}>
                  <label>Firma Adı</label>
                  <select value={form.FirmaID} onChange={e => setForm({...form, FirmaID: e.target.value})} required>
                    <option value="">Firma Seçin</option>
                    {lookups.firmalar.map(f => <option key={f.ID} value={f.ID}>{f.Ad}</option>)}
                  </select>
                </div>

                {/* Row 3: Ürün Adı */}
                <LangInput label="Ürün Adı" field="Urun" fieldEn="UrunEn" />

                {/* Row 4: Barkod, Miktar */}
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}><label>Barkod</label><input value={form.Barkod} onChange={e => setForm({...form, Barkod: e.target.value})} /></div>
                  <div className={styles.formGroup}><label>Ürün Miktarı</label><input value={form.Miktar} onChange={e => setForm({...form, Miktar: e.target.value})} /></div>
                </div>

                {/* Row 5: Kullanım Şekli, Ürün Tipi */}
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Kullanım Şekli</label>
                    <select value={form.Tip1} onChange={e => setForm({...form, Tip1: e.target.value})}>
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

                {/* Row 6: Hedef Grup, Uygulama Alanı, A Değeri */}
                <div className={styles.formGrid3}>
                  <div className={styles.formGroup}><label>Hedef Grup</label><input value={form.Hedef} onChange={e => setForm({...form, Hedef: e.target.value})} /></div>
                  <div className={styles.formGroup}><label>Uygulama Alanı</label><input value={form.Uygulama} onChange={e => setForm({...form, Uygulama: e.target.value})} /></div>
                  <div className={styles.formGroup}><label>A Değeri</label><input value={form.A} onChange={e => setForm({...form, A: e.target.value})} /></div>
                </div>
            </div>
          </SectionCard>

          <SectionCard title="Ürün Detayları">
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

          <SectionCard title="Kutu / Etiket Bilgileri">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <LangInput label="Kullanım" field="Kullanim" fieldEn="KullanimEn" rows={3} />
                <LangInput label="Özellikler" field="Ozellikler" fieldEn="OzelliklerEn" rows={3} />
                <LangInput label="Uyarılar" field="Uyarilar" fieldEn="UyarilarEn" rows={3} />
            </div>
          </SectionCard>

          <div style={{ marginTop: 40, display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid var(--color-border-light)', paddingTop: 24 }}>
            <button type="button" className={styles.cancelBtn} onClick={() => router.back()}>İptal</button>
            <button type="submit" className={styles.saveBtn} disabled={loading} style={{ minWidth: 200 }}>
              {loading ? "Kaydediliyor..." : "ÜRÜNÜ KAYDET"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

