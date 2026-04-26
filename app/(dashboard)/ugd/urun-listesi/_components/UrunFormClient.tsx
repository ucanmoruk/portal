"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from '@/app/styles/table.module.css';
import * as XLSX from "xlsx";

// ── Interfaces ───────────────────────────────────────────────────────────────
interface MatchedIngredient {
  inputName: string; inputAmount: string; matched: boolean;
  cosingId?: number | null;
  INCIName: string | null; Cas: string | null; Ec: string | null;
  Functions: string | null; Regulation: string | null;
  Link?: string | null; Maks: string | null; Diger: string | null; Etiket: string | null;
  // Toksikolojik hesaplama (EK-1)
  dap: number;    // Dermal Absorption % — default 100
  noael: string;  // mg/kg/gün — DB'den gelir veya kullanıcı girer
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'genel',  label: '1 · Genel Bilgiler' },
  { id: 'formul', label: '2 · Ürün Formülü' },
  { id: 'rapor',  label: '3 · Rapor' },
];

// ── Rapor default metinleri ───────────────────────────────────────────────────
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

// ── Hesaplama yardımcıları (SED = A × C/100 × DaP/100) ───────────────────────
function calcSED(a: number, c: number, dap: number): number {
  return a * (c / 100) * (dap / 100);
}
function calcMOS(noael: string, sed: number): number | null {
  const n = parseFloat(noael);
  if (!n || !sed) return null;
  return n / sed;
}
function fmtSED(v: number): string {
  if (!v) return "—";
  return v < 0.0001 ? v.toExponential(3) : v.toFixed(5);
}
function fmtMOS(v: number | null): string {
  if (v === null) return "—";
  return v >= 10000 ? ">10000" : v.toFixed(1);
}

// ── Fiziksel/Kimyasal kompakt tablo (module-level) ───────────────────────────
type FormKey = keyof ReturnType<typeof emptyForm>;
interface PhysRow { label: string; tr: FormKey; en: FormKey }

function PhysChemTable({ rows, form, onChange, language }: {
  rows: PhysRow[];
  form: ReturnType<typeof emptyForm>;
  onChange: (field: FormKey, v: string) => void;
  language: 'tr' | 'en';
}) {
  const tdLabel: React.CSSProperties = {
    width: 170, padding: '6px 12px', fontSize: '0.82rem', fontWeight: 600,
    color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-light)',
    whiteSpace: 'nowrap', verticalAlign: 'middle',
  };
  const tdInput: React.CSSProperties = {
    padding: '4px 8px', borderBottom: '1px solid var(--color-border-light)', verticalAlign: 'middle',
  };
  const inp: React.CSSProperties = {
    width: '100%', padding: '5px 10px', border: '1px solid var(--color-border-light)',
    borderRadius: 6, fontSize: '0.82rem', background: 'var(--color-bg)',
  };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: 'var(--color-bg)' }}>
          <th style={{ ...tdLabel, color: 'var(--color-accent)', fontSize: '0.75rem', letterSpacing: '0.04em', paddingTop: 0 }}>Özellik</th>
          <th style={{ ...tdInput, fontWeight: 700, fontSize: '0.75rem', color: 'var(--color-accent)', letterSpacing: '0.04em', paddingTop: 0 }}>{language === 'en' ? 'EN' : 'TR'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const field = language === 'en' ? row.en : row.tr;
          return (
            <tr key={row.label} style={{ background: i % 2 === 1 ? 'rgba(0,0,0,0.015)' : 'transparent' }}>
              <td style={tdLabel}>{row.label}</td>
              <td style={tdInput}><input value={String(form[field])} onChange={e => onChange(field, e.target.value)} style={inp} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Module-level UI bileşenleri (focus kaymasını önler) ────────────────────────
function PhysChemGrid({ groups, form, onChange, language }: {
  groups: PhysRow[][];
  form: ReturnType<typeof emptyForm>;
  onChange: (field: FormKey, v: string) => void;
  language: 'tr' | 'en';
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    minWidth: 0,
    padding: '6px 9px',
    border: '1px solid var(--color-border-light)',
    borderRadius: 6,
    fontSize: '0.82rem',
    background: 'var(--color-bg)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map((group, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${group.length}, minmax(0, 1fr))`,
            gap: 10,
            padding: 10,
            borderRadius: 8,
            border: '1px solid var(--color-border-light)',
            background: rowIndex % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg)',
          }}
        >
          {group.map(item => {
            const field = language === 'en' ? item.en : item.tr;
            return (
              <label key={item.label} style={{ minWidth: 0 }}>
                <span style={{ display: 'block', marginBottom: 5, fontSize: '0.76rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  {item.label}
                </span>
                <input value={String(form[field])} onChange={e => onChange(field, e.target.value)} style={inputStyle} />
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.tableCard} style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ marginBottom: 20, paddingBottom: 10, borderBottom: '1px solid var(--color-border-light)', color: 'var(--color-accent)', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 4, height: 16, background: 'var(--color-accent)', borderRadius: 2 }} />
        {title}
      </div>
      {children}
    </div>
  );
}

function DualInput({ label, value, valueEn, onChange, onChangeEn, language = 'tr', rows = 1 }: {
  label: string; value: string; valueEn: string;
  onChange: (v: string) => void; onChangeEn: (v: string) => void; language?: 'tr' | 'en'; rows?: number;
}) {
  const isEn = language === 'en';
  return (
    <div className={styles.formGroup}>
      <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {label}
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: isEn ? '#1F4788' : '#248a3d', background: isEn ? '#eaf3ff' : '#e6f4ea', borderRadius: 999, padding: '2px 7px' }}>
          {isEn ? 'EN' : 'TR'}
        </span>
      </label>
      {rows > 1
        ? <textarea rows={rows} value={isEn ? valueEn : value} onChange={e => (isEn ? onChangeEn(e.target.value) : onChange(e.target.value))} style={{ width: '100%' }} />
        : <input type="text" value={isEn ? valueEn : value} onChange={e => (isEn ? onChangeEn(e.target.value) : onChange(e.target.value))} style={{ width: '100%' }} />}
    </div>
  );
}

function RaporField({ label, value, valueEn, onChange, onChangeEn, language, rows = 4, hint, readOnly = false }: {
  label: string;
  value: string;
  valueEn: string;
  onChange: (v: string) => void;
  onChangeEn: (v: string) => void;
  language: 'tr' | 'en';
  rows?: number;
  hint?: string;
  readOnly?: boolean;
}) {
  const isEn = language === 'en';
  return (
    <div className={styles.formGroup} style={{ marginBottom: 20 }}>
      <label style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--color-accent)' }}>
        {label}
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: isEn ? '#1F4788' : '#248a3d', background: isEn ? '#eaf3ff' : '#e6f4ea', borderRadius: 999, padding: '2px 7px' }}>
          {isEn ? 'EN' : 'TR'}
        </span>
      </label>
      {hint && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0 0 6px' }}>{hint}</p>}
      <textarea
        rows={rows}
        value={isEn ? valueEn : value}
        onChange={e => (isEn ? onChangeEn(e.target.value) : onChange(e.target.value))}
        readOnly={readOnly}
        style={{ width: '100%', fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.6, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border-light)', background: readOnly ? 'var(--color-surface-2)' : 'var(--color-bg)', resize: 'vertical' }}
      />
    </div>
  );
}

function ReportLanguageSwitch({ language, onChange }: { language: 'tr' | 'en'; onChange: (v: 'tr' | 'en') => void }) {
  const btn = (lang: 'tr' | 'en'): React.CSSProperties => ({
    border: 'none',
    borderRadius: 999,
    padding: '7px 14px',
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
    background: language === lang ? 'var(--color-accent)' : 'transparent',
    color: language === lang ? '#fff' : 'var(--color-text-secondary)',
    transition: 'var(--transition-fast)',
  });
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'var(--color-surface-2)', border: '1px solid var(--color-border-light)', borderRadius: 999 }}>
        <button type="button" style={btn('tr')} onClick={() => onChange('tr')}>Türkçe</button>
        <button type="button" style={btn('en')} onClick={() => onChange('en')}>English</button>
      </div>
    </div>
  );
}

type LabStatus = 'Tamamlandı' | 'Devam Ediyor';

function labSentence(kind: 'mikro' | 'challenge' | 'stabilite', status: LabStatus, shelfLife: string, pao: string) {
  if (kind === 'mikro') {
    return status === 'Tamamlandı'
      ? "Son ürün için yapılan mikrobiyolojik analiz sonuçları ürün güvenlik dosyasında sunulmuştur. Sonuçlar mikrobiyolojik kalite kontrol limitlerine uygundur. Mikrobiyolojik kontaminasyon riski taşımamaktadır."
      : "Mikrobiyolojik çalışmalar devam etmektedir.";
  }
  if (kind === 'challenge') {
    return status === 'Tamamlandı'
      ? "Son ürün için yapılan koruyucu etkinlik test sonuçları ürün güvenlik dosyasında sunulmuştur. Sonuçlar uygun olarak değerlendirilmiştir."
      : "Koruyucu etkinlik testi çalışması devam etmektedir.";
  }

  const shelf = shelfLife || "[..]";
  const after = pao || "[..]";
  return status === 'Tamamlandı'
    ? `Ürünün üretici tarafından öngörülen raf ömrü ${shelf} aydır. Ürünün açıldıktan sonraki dayanıklılık süresi etikette ${after} ay olarak belirtilmiştir. Stabilite test raporu dosya ekinde yer almaktadır.`
    : `Ürünün üretici tarafından öngörülen raf ömrü ${shelf} aydır. Ürünün açıldıktan sonraki dayanıklılık süresi etikette ${after} ay olarak belirtilmiştir. Ürünle ilgili stabilite çalışmaları devam etmektedir.`;
}

function ImagePicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const handleFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 32, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text-secondary)', background: 'var(--color-surface)' }}>
        {label}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
      </label>
      {value && (
        <>
          <img src={value} alt="Önizleme" style={{ width: 52, height: 52, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--color-border-light)' }} />
          <button type="button" className={styles.cancelBtn} onClick={() => onChange("")}>Kaldır</button>
        </>
      )}
    </div>
  );
}

function LabTestCard({
  title, status, onStatus, image, onImage, children,
}: {
  title: string;
  status: LabStatus;
  onStatus: (v: LabStatus) => void;
  image: string;
  onImage: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 8, padding: 14, background: 'var(--color-surface)', minWidth: 0 }}>
      <strong style={{ display: 'block', color: 'var(--color-text-primary)', marginBottom: 12 }}>{title}</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'end', marginBottom: 12 }}>
        <label style={{ minWidth: 0 }}>
          <span style={{ display: 'block', marginBottom: 5, fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Seçenek</span>
          <select value={status} onChange={e => onStatus(e.target.value as LabStatus)} style={{ width: '100%', minWidth: 0, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', boxSizing: 'border-box' }}>
            <option value="Tamamlandı">Tamamlandı</option>
            <option value="Devam Ediyor">Devam ediyor</option>
          </select>
        </label>
        <ImagePicker label="Görsel ekle" value={image} onChange={onImage} />
      </div>
      {children}
    </div>
  );
}

const tblInput: React.CSSProperties = {
  width: '100%', padding: '3px 6px', border: '1px solid var(--color-border-light)',
  borderRadius: 4, fontSize: '0.75rem', background: 'var(--color-bg)', textAlign: 'right',
};

// ── Varsayılan form değerleri ─────────────────────────────────────────────────
function emptyForm() {
  return {
    Tarih: new Date().toISOString().split('T')[0],
    RaporNo: "", Versiyon: "1", FirmaID: "",
    Urun: "", UrunEn: "", Barkod: "", Miktar: "",
    Tip1: "Durulanmayan", Tip2: "", Uygulama: "",
    Hedef: "Yetişkinler", A: "",
    Gorunum: "N/A", GorunumEn: "N/A",
    Renk: "N/A", RenkEn: "N/A",
    Koku: "N/A", KokuEn: "N/A",
    PH: "N/A", PHEn: "N/A",
    Yogunluk: "N/A", YogunlukEn: "N/A",
    Viskozite: "N/A", ViskoziteEn: "N/A",
    Kaynama: "N/A", KaynamaEn: "N/A",
    Erime: "N/A", ErimeEn: "N/A",
    SudaCozunebilirlik: "N/A", SudaCozunebilirlikEn: "N/A",
    DigerCozunebilirlik: "N/A", DigerCozunebilirlikEn: "N/A",
    Mikrobiyoloji: "N/A", MikrobiyolojiEn: "N/A",
    MikrobiyolojiDurum: "Tamamlandı",
    MikrobiyolojiGorsel: "",
    KoruyucuEtkinlik: "N/A", KoruyucuEtkinlikEn: "N/A",
    KoruyucuEtkinlikDurum: "Tamamlandı",
    KoruyucuEtkinlikGorsel: "",
    Stabilite: "N/A", StabiliteEn: "N/A",
    StabiliteDurum: "Tamamlandı",
    StabiliteRafOmruAy: "",
    StabiliteAcilisAy: "",
    StabiliteGorsel: "",
    Kullanim: "", KullanimEn: "",
    Ozellikler: "", OzelliklerEn: "",
    Uyarilar: "", UyarilarEn: "",
    EtiketGorsel: "",
    NormalKullanim: DEFAULTS.NormalKullanim,
    NormalKullanimEn: "",
    MaruziyetAciklama: DEFAULTS.MaruziyetAciklama,
    MaruziyetAciklamaEn: "",
    BilesenlereMaruziyet: DEFAULTS.BilesenlereMaruziyet,
    BilesenlereMaruziyetEn: "",
    ToksikolojikProfil: DEFAULTS.ToksikolojikProfil,
    ToksikolojikProfilEn: "",
    IstenmedEtkiler: DEFAULTS.IstenmedEtkiler,
    IstenmedEtkilerEn: "",
    UrunBilgisi: DEFAULTS.UrunBilgisi,
    UrunBilgisiEn: "",
    DegerlendirmeSonucu: DEFAULTS.DegerlendirmeSonucu,
    DegerlendirmeSonucuEn: "",
    EtiketUyarilariB2: DEFAULTS.EtiketUyarilariB2,
    EtiketUyarilariB2En: "",
    Gerekce: DEFAULTS.Gerekce,
    GerekceEn: "",
    SorumluAd: DEFAULTS.SorumluAd,
    SorumluAdEn: "",
    SorumluAdres: DEFAULTS.SorumluAdres,
    SorumluAdresEn: "",
    SorumluKanit: DEFAULTS.SorumluKanit,
    SorumluKanitEn: "",
  };
}

function withCalcDefaults(r: Omit<MatchedIngredient, 'dap' | 'noael'> & Partial<MatchedIngredient>): MatchedIngredient {
  return { ...r, dap: r.dap ?? 100, noael: r.noael ?? '' } as MatchedIngredient;
}

// ── Ana Bileşen ───────────────────────────────────────────────────────────────
interface UrunFormClientProps {
  editId?: string;
}

export default function UrunFormClient({ editId }: UrunFormClientProps) {
  const router = useRouter();
  const isEdit = !!editId;

  const [activeTab, setActiveTab] = useState('genel');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(editId ?? null);
  const [globalError, setGlobalError] = useState("");
  const [savedOk, setSavedOk] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [reportLang, setReportLang] = useState<'tr' | 'en'>('tr');

  const [formulInput, setFormulInput] = useState("");
  const [formulResults, setFormulResults] = useState<MatchedIngredient[]>([]);
  const [formulLoading, setFormulLoading] = useState(false);
  const [formulError, setFormulError] = useState("");
  const [formulFromDB, setFormulFromDB] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [lookups, setLookups] = useState<{ firmalar: any[]; tipler: any[]; nextRaporNo?: number }>({ firmalar: [], tipler: [] });
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [activeTab]);

  useEffect(() => {
    const mikro = labSentence('mikro', form.MikrobiyolojiDurum as LabStatus, form.StabiliteRafOmruAy, form.StabiliteAcilisAy);
    const challenge = labSentence('challenge', form.KoruyucuEtkinlikDurum as LabStatus, form.StabiliteRafOmruAy, form.StabiliteAcilisAy);
    const stabilite = labSentence('stabilite', form.StabiliteDurum as LabStatus, form.StabiliteRafOmruAy, form.StabiliteAcilisAy);
    setForm(prev => (
      prev.Mikrobiyoloji === mikro &&
      prev.KoruyucuEtkinlik === challenge &&
      prev.Stabilite === stabilite
        ? prev
        : { ...prev, Mikrobiyoloji: mikro, KoruyucuEtkinlik: challenge, Stabilite: stabilite }
    ));
  }, [form.MikrobiyolojiDurum, form.KoruyucuEtkinlikDurum, form.StabiliteDurum, form.StabiliteRafOmruAy, form.StabiliteAcilisAy]);

  useEffect(() => {
    const tip = lookups.tipler.find(t => String(t.ID) === String(form.Tip2));
    if (!tip) return;

    const textTr = [
      `Ürün tipi: ${form.Tip1 || '-'}`,
      `Uygulama yeri: ${form.Uygulama || tip.UygulamaBolgesi || '-'}`,
      `Uygulanan ürünün deriye temas ettiği alan: ${tip.YuzeyAlani || '-'} cm2`,
      `Uygulanan ürünün miktarı: ${tip.GunlukMiktar || '-'}`,
      `Temas süresi ve uygulama sıklığı: ${tip.SiklikEn || tip.Siklik || '-'}`,
      `Maruziyet yolu: Dermal emilim`,
      `Hedeflenen Veya Maruz Kalan Kişi / Kişiler: ${form.Hedef || '-'}`,
      `A Değeri: ${form.A || tip.ADegeri || '-'}`,
    ].join('\n');

    const textEn = [
      `Product type: ${tip.UrunTipiEn || form.Tip1 || '-'}`,
      `Application area: ${tip.UygulamaBolgesiEn || form.Uygulama || tip.UygulamaBolgesi || '-'}`,
      `Skin contact surface area: ${tip.YuzeyAlani || '-'} cm2`,
      `Amount of product applied: ${tip.GunlukMiktar || '-'}`,
      `Contact duration and frequency of use: ${tip.SiklikEn || tip.Siklik || '-'}`,
      `Route of exposure: Dermal absorption`,
      `Targeted or exposed person(s): ${form.Hedef || '-'}`,
      `A value: ${form.A || tip.ADegeri || '-'}`,
    ].join('\n');

    setForm(prev => (
      prev.MaruziyetAciklama === textTr && prev.MaruziyetAciklamaEn === textEn
        ? prev
        : { ...prev, MaruziyetAciklama: textTr, MaruziyetAciklamaEn: textEn }
    ));
  }, [lookups.tipler, form.Tip2, form.Tip1, form.Uygulama, form.Hedef, form.A]);

  // Lookup + edit veri yükleme
  useEffect(() => {
    fetch("/api/urunler/lookup")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setLookups(data);
        if (!isEdit && data.nextRaporNo) {
          setForm(prev => prev.RaporNo ? prev : { ...prev, RaporNo: String(data.nextRaporNo) });
        }
      })
      .catch(() => {});
  }, [isEdit]);

  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);

    // Ürün bilgileri + formül satırları paralel yükle
    Promise.all([
      fetch(`/api/urunler/${editId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/urunler/formul?urunId=${editId}`).then(r => r.ok ? r.json() : []),
    ])
      .then(([data, formulData]) => {
        if (data) {
          setForm(prev => ({
            ...prev,
            Tarih: data.Tarih ? data.Tarih.split('T')[0] : prev.Tarih,
            RaporNo: data.RaporNo ?? prev.RaporNo,
            Versiyon: data.Versiyon ?? prev.Versiyon,
            FirmaID: data.FirmaID ? String(data.FirmaID) : prev.FirmaID,
            Barkod: data.Barkod ?? prev.Barkod,
            Urun: data.Urun ?? prev.Urun,
            UrunEn: data.UrunEn ?? prev.UrunEn,
            Miktar: data.Miktar ?? prev.Miktar,
            Tip1: data.Tip1 ?? prev.Tip1,
            Tip2: data.Tip2 ? String(data.Tip2) : prev.Tip2,
            Uygulama: data.Uygulama ?? prev.Uygulama,
            Hedef: data.Hedef ?? prev.Hedef,
            A: data.A ?? prev.A,
            Gorunum: data.Gorunum ?? prev.Gorunum,
            GorunumEn: data.GorunumEn ?? prev.GorunumEn,
            Renk: data.Renk ?? prev.Renk,
            RenkEn: data.RenkEn ?? prev.RenkEn,
            Koku: data.Koku ?? prev.Koku,
            KokuEn: data.KokuEn ?? prev.KokuEn,
            PH: data.PH ?? prev.PH,
            PHEn: data.PHEn ?? prev.PHEn,
            Yogunluk: data.Yogunluk ?? prev.Yogunluk,
            YogunlukEn: data.YogunlukEn ?? prev.YogunlukEn,
            Viskozite: data.Viskozite ?? prev.Viskozite,
            ViskoziteEn: data.ViskoziteEn ?? prev.ViskoziteEn,
            Kaynama: data.Kaynama ?? prev.Kaynama,
            KaynamaEn: data.KaynamaEn ?? prev.KaynamaEn,
            Erime: data.Erime ?? prev.Erime,
            ErimeEn: data.ErimeEn ?? prev.ErimeEn,
            SudaCozunebilirlik: data.SudaCozunebilirlik ?? prev.SudaCozunebilirlik,
            SudaCozunebilirlikEn: data.SudaCozunebilirlikEn ?? prev.SudaCozunebilirlikEn,
            DigerCozunebilirlik: data.DigerCozunebilirlik ?? prev.DigerCozunebilirlik,
            DigerCozunebilirlikEn: data.DigerCozunebilirlikEn ?? prev.DigerCozunebilirlikEn,
            Kullanim: data.Kullanim ?? prev.Kullanim,
            KullanimEn: data.KullanimEn ?? prev.KullanimEn,
            Uyarilar: data.Uyarilar ?? prev.Uyarilar,
            UyarilarEn: data.UyarilarEn ?? prev.UyarilarEn,
            MikrobiyolojiDurum: data.MikrobiyolojiDurum ?? prev.MikrobiyolojiDurum,
            MikrobiyolojiGorsel: data.MikrobiyolojiGorsel ?? prev.MikrobiyolojiGorsel,
            KoruyucuEtkinlikDurum: data.KoruyucuEtkinlikDurum ?? prev.KoruyucuEtkinlikDurum,
            KoruyucuEtkinlikGorsel: data.KoruyucuEtkinlikGorsel ?? prev.KoruyucuEtkinlikGorsel,
            StabiliteDurum: data.StabiliteDurum ?? prev.StabiliteDurum,
            StabiliteRafOmruAy: data.StabiliteRafOmruAy ?? prev.StabiliteRafOmruAy,
            StabiliteAcilisAy: data.StabiliteAcilisAy ?? prev.StabiliteAcilisAy,
            StabiliteGorsel: data.StabiliteGorsel ?? prev.StabiliteGorsel,
            EtiketGorsel: data.EtiketGorsel ?? prev.EtiketGorsel,
            NormalKullanim: data.NormalKullanim ?? prev.NormalKullanim,
            NormalKullanimEn: data.NormalKullanimEn ?? prev.NormalKullanimEn,
            MaruziyetAciklama: data.MaruziyetAciklama ?? prev.MaruziyetAciklama,
            MaruziyetAciklamaEn: data.MaruziyetAciklamaEn ?? prev.MaruziyetAciklamaEn,
            BilesenlereMaruziyet: data.BilesenlereMaruziyet ?? prev.BilesenlereMaruziyet,
            BilesenlereMaruziyetEn: data.BilesenlereMaruziyetEn ?? prev.BilesenlereMaruziyetEn,
            ToksikolojikProfil: data.ToksikolojikProfil ?? prev.ToksikolojikProfil,
            ToksikolojikProfilEn: data.ToksikolojikProfilEn ?? prev.ToksikolojikProfilEn,
            IstenmedEtkiler: data.IstenmedEtkiler ?? prev.IstenmedEtkiler,
            IstenmedEtkilerEn: data.IstenmedEtkilerEn ?? prev.IstenmedEtkilerEn,
            UrunBilgisi: data.UrunBilgisi ?? prev.UrunBilgisi,
            UrunBilgisiEn: data.UrunBilgisiEn ?? prev.UrunBilgisiEn,
            DegerlendirmeSonucu: data.DegerlendirmeSonucu ?? prev.DegerlendirmeSonucu,
            DegerlendirmeSonucuEn: data.DegerlendirmeSonucuEn ?? prev.DegerlendirmeSonucuEn,
            EtiketUyarilariB2: data.EtiketUyarilariB2 ?? prev.EtiketUyarilariB2,
            EtiketUyarilariB2En: data.EtiketUyarilariB2En ?? prev.EtiketUyarilariB2En,
            Gerekce: data.Gerekce ?? prev.Gerekce,
            GerekceEn: data.GerekceEn ?? prev.GerekceEn,
            SorumluAd: data.SorumluAd ?? prev.SorumluAd,
            SorumluAdEn: data.SorumluAdEn ?? prev.SorumluAdEn,
            SorumluAdres: data.SorumluAdres ?? prev.SorumluAdres,
            SorumluAdresEn: data.SorumluAdresEn ?? prev.SorumluAdresEn,
            SorumluKanit: data.SorumluKanit ?? prev.SorumluKanit,
            SorumluKanitEn: data.SorumluKanitEn ?? prev.SorumluKanitEn,
          }));
        }
        // Kayıtlı formül satırlarını yükle
        if (Array.isArray(formulData) && formulData.length > 0) {
          setFormulResults(formulData.map((r: any) => withCalcDefaults({
            inputName: r.INCIName || "",
            inputAmount: String(r.Miktar || "0"),
            matched: !!r.INCIName,
            cosingId: r.HammaddeID || null,
            INCIName: r.INCIName || null,
            Cas: r.Cas || null,
            Ec: r.EC || null,
            Functions: r.Functions || null,
            Regulation: r.Regulation || null,
            Link: r.Link || null,
            Maks: null, Diger: null, Etiket: null,
            dap: r.DaP ?? 100,
            noael: r.Noael != null ? String(r.Noael) : '',
          })));
          setFormulFromDB(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  const upd = (field: keyof ReturnType<typeof emptyForm>) => (v: string) =>
    setForm(prev => ({ ...prev, [field]: v }));

  const handleTipChange = (tipId: string) => {
    const tip = lookups.tipler.find(t => t.ID.toString() === tipId);
    setForm(prev => ({
      ...prev, Tip2: tipId,
      ...(tip ? { Uygulama: tip.UygulamaBolgesi || "", A: tip.ADegeri || "" } : {}),
    }));
  };

  // ── Formül satır işlemleri ────────────────────────────────────────────────
  const updateFormulField = (idx: number, field: keyof MatchedIngredient, value: any) => {
    setFormulResults(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const deleteFormulRow = (idx: number) => {
    setFormulResults(prev => prev.filter((_, i) => i !== idx));
  };

  const rematchFormulRow = async (index: number, name: string) => {
    if (!name) return;
    try {
      const res = await fetch("/api/formul-kontrol/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ name, amount: formulResults[index].inputAmount }] }),
      });
      const json = await res.json();
      if (json?.[0]) {
        const r = [...formulResults];
        r[index] = withCalcDefaults({ ...json[0], dap: formulResults[index].dap, noael: formulResults[index].noael });
        setFormulResults(r);
      }
    } catch {}
  };

  // ── Formül analizi ────────────────────────────────────────────────────────
  const processFormulItems = async (items: { name: string; amount: string }[]) => {
    if (!items.length) return;
    setFormulLoading(true); setFormulError("");
    try {
      const res = await fetch("/api/formul-kontrol/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("Kontrol işlemi başarısız");
      const data = await res.json();
      // noael: sunucudan gelen değeri string'e çevir, yoksa ""
      const mapped = data.map((r: any) => withCalcDefaults({
        ...r,
        noael: r.noael != null ? String(r.noael) : '',
      }));
      setFormulResults(mapped);
      setFormulFromDB(false);

      // Eğer kayıtlı ürün varsa formülü DB'ye kaydet
      if (savedId) {
        await saveFormulToDB(savedId, mapped);
      }
    } catch (e: any) { setFormulError(e.message); }
    finally { setFormulLoading(false); }
  };

  // ── Formülü DB'ye kaydet ─────────────────────────────────────────────────
  const saveFormulToDB = async (urunId: string, rows: MatchedIngredient[]) => {
    try {
      const res = await fetch("/api/urunler/formul", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urunId: Number(urunId), rows }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormulError(`Formül kaydedilemedi: ${err.error || `HTTP ${res.status}`}`);
      }
    } catch (e: any) {
      setFormulError(`Formül kaydedilemedi: ${e.message}`);
    }
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

  // ── Sonraki → (tab 1'de kayıt yap, diğerlerinde ilerle) ─────────────────
  const handleNext = async () => {
    const tabIndex = TABS.findIndex(t => t.id === activeTab);
    if (tabIndex === TABS.length - 1) return;

    if (activeTab === 'genel') {
      if (!form.Urun || !form.FirmaID) {
        setGlobalError("Ürün adı ve firma seçimi zorunludur.");
        return;
      }
      setGlobalError("");
      setSaving(true);
      try {
        if (!savedId) {
          const res = await fetch("/api/urunler", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              Tarih: form.Tarih, RaporNo: form.RaporNo, Versiyon: form.Versiyon,
              FirmaID: form.FirmaID, Barkod: form.Barkod, Urun: form.Urun,
              UrunEn: form.UrunEn, Miktar: form.Miktar, Tip1: form.Tip1,
              Tip2: form.Tip2, Uygulama: form.Uygulama, Hedef: form.Hedef,
              A: form.A, RaporDurum: "Tamamlandı",
            }),
          });
          if (!res.ok) throw new Error((await res.json()).error || "Kayıt başarısız");
          const data = await res.json();
          if (data.id) setSavedId(String(data.id));
        } else {
          await fetch(`/api/urunler/${savedId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...form, RaporDurum: "Tamamlandı" }),
          });
        }
      } catch (err: any) {
        setGlobalError(err.message);
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    setActiveTab(TABS[tabIndex + 1].id);
  };

  // ── Son kayıt ─────────────────────────────────────────────────────────────
  const handleFinalSave = async () => {
    if (!form.Urun || !form.FirmaID) {
      setGlobalError("Ürün adı ve firma seçimi zorunludur.");
      setActiveTab('genel');
      return;
    }
    setGlobalError("");
    setSavedOk(false);
    setSaving(true);
    try {
      if (!savedId) {
        const res = await fetch("/api/urunler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, RaporDurum: "Tamamlandı" }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Kayıt başarısız");
        const data = await res.json();
        if (data.id) setSavedId(String(data.id));
        // Yeni kayıt → listeye git
        router.push("/ugd/urun-listesi");
        router.refresh();
      } else {
        const res = await fetch(`/api/urunler/${savedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, RaporDurum: "Tamamlandı" }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Güncelleme başarısız");
        // Formül satırlarını da kaydet
        if (formulResults.length > 0) {
          await saveFormulToDB(savedId, formulResults);
        }
        // Güncelleme → sayfada kal, rapor indirilebilsin
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 4000);
      }
    } catch (err: any) {
      setGlobalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Word İndir ────────────────────────────────────────────────────────────
  const handlePrint = async () => {
    setPrintLoading(true);
    try {
      const firmaAd = lookups.firmalar.find(f => f.ID.toString() === form.FirmaID)?.Ad || "";
      const res = await fetch("/api/urunler/rapor-sablon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, formulResults, firmaAd }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Rapor oluşturulamadı (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `UGD_Rapor_${form.RaporNo || "rapor"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setGlobalError(err.message);
    } finally {
      setPrintLoading(false);
    }
  };

  const tabIndex = TABS.findIndex(t => t.id === activeTab);
  const aVal = parseFloat(form.A) || 0;

  if (loadingEdit) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-secondary)' }}>Yükleniyor…</div>;
  }

  return (
    <div className={styles.page}>
      {/* Başlık */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{isEdit ? "Ürün Güncelle" : "Yeni Ürün Ekle"}</h1>
          <p className={styles.pageSubtitle}>{isEdit ? `Kayıt #${editId} düzenleniyor` : "Yeni ÜGD ürün kaydı oluşturun."}</p>
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
      <div style={{ display: 'flex', gap: 2, marginBottom: 28, background: 'var(--color-bg)', padding: 4, borderRadius: 12, border: '1px solid var(--color-border-light)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1, padding: '10px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '0.83rem', background: activeTab === tab.id ? 'var(--color-accent)' : 'transparent', color: activeTab === tab.id ? '#fff' : 'var(--color-text-secondary)', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {globalError && <div className={styles.formError} style={{ marginBottom: 20 }}>{globalError}</div>}
      {savedOk && (
        <div style={{ marginBottom: 20, padding: '12px 18px', background: '#e6f4ea', border: '1px solid #a8d5b5', borderRadius: 8, fontSize: '0.85rem', color: '#1a7340', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>✓ Kayıt güncellendi. Raporu indirmek için <strong>Yazdır / Word İndir</strong> butonunu kullanın.</span>
          <button type="button" onClick={() => { router.push("/ugd/urun-listesi"); router.refresh(); }} style={{ background: 'none', border: '1px solid #1a7340', borderRadius: 6, padding: '4px 12px', fontSize: '0.8rem', color: '#1a7340', cursor: 'pointer', fontWeight: 600 }}>
            Listeye Dön
          </button>
        </div>
      )}

      {/* ── Tab 1: Genel Bilgiler ──────────────────────────────────────────── */}
      {activeTab === 'genel' && (
        <SectionCard title="Genel Bilgiler">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Kompakt üst satır: Rapor No · Versiyon · Tarih · Barkod · Miktar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.7fr 1.2fr 1.2fr 1fr', gap: 12 }}>
              <div className={styles.formGroup}>
                <label>Rapor No</label>
                <input value={form.RaporNo} onChange={e => setForm({ ...form, RaporNo: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label>Versiyon</label>
                <input value={form.Versiyon} onChange={e => setForm({ ...form, Versiyon: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label>Tarih</label>
                <input type="date" value={form.Tarih} onChange={e => setForm({ ...form, Tarih: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label>Barkod</label>
                <input value={form.Barkod} onChange={e => setForm({ ...form, Barkod: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label>Miktar</label>
                <input value={form.Miktar} onChange={e => setForm({ ...form, Miktar: e.target.value })} />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>Firma Adı</label>
              <select value={form.FirmaID} onChange={e => setForm({ ...form, FirmaID: e.target.value })} required>
                <option value="">Firma Seçin</option>
                {lookups.firmalar.map(firma => <option key={firma.ID} value={firma.ID}>{firma.Ad}</option>)}
              </select>
            </div>
            <DualInput label="Ürün Adı" value={form.Urun} valueEn={form.UrunEn} onChange={upd('Urun')} onChangeEn={upd('UrunEn')} />
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
                <label>A Değeri (mg/kg/gün)</label>
                <input value={form.A} onChange={e => setForm({ ...form, A: e.target.value })} />
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Tab 2: Ürün Formülü ───────────────────────────────────────────── */}
      {activeTab === 'formul' && (
        <>
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
            <textarea className={styles.searchInput} style={{ width: '100%', minHeight: 140, padding: 16, fontFamily: 'monospace' }} placeholder="Kopyalayıp buraya yapıştırın (Excel stili)..." value={formulInput} onChange={e => setFormulInput(e.target.value)} disabled={formulLoading} />
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

          {formulFromDB && formulResults.length > 0 && (
            <div style={{ marginBottom: 12, padding: '10px 16px', background: '#e6f4ea', border: '1px solid #a8d5b5', borderRadius: 8, fontSize: '0.82rem', color: '#1a7340', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
              <span><strong>{formulResults.length} bileşen</strong> rUGDFormul tablosundan yüklendi. Hesaplamalar için A değerinin girildiğinden emin olun.</span>
            </div>
          )}

          {formulResults.length > 0 && (
            <div className={styles.tableCard}>
              <div className={styles.toolbar} style={{ padding: '12px 24px' }}>
                <div className={styles.toolbarLeft}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>EK-1 Değerlendirme Tablosu</h3>
                  <span className={styles.totalCount} style={{ marginLeft: 12 }}>{formulResults.length} bileşen</span>
                  {aVal > 0 && (
                    <span style={{ marginLeft: 12, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      · A = <strong>{form.A}</strong> mg/kg/gün · SED = A × C% × DaP%
                    </span>
                  )}
                </div>
                <div className={styles.toolbarRight}>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => setFormulResults(prev => [...prev, withCalcDefaults({ inputName: "", inputAmount: "0", matched: false, INCIName: null, Cas: null, Ec: null, Functions: null, Regulation: null, Maks: null, Diger: null, Etiket: null })])}
                  >
                    + Satır Ekle
                  </button>
                </div>
              </div>
              <div className={styles.tableWrapper}>
                <table className={styles.table} style={{ minWidth: 1100 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}></th>
                      <th>INCI Adı / Bileşen</th>
                      <th style={{ width: 60, textAlign: 'right' }}>C (%)</th>
                      <th style={{ width: 90 }}>CAS / EC</th>
                      <th style={{ width: 120 }}>Fonksiyon</th>
                      <th style={{ width: 90 }}>Annex</th>
                      <th style={{ width: 72, textAlign: 'right' }}>DaP (%)</th>
                      <th style={{ width: 72, textAlign: 'right' }}>A</th>
                      <th style={{ width: 88, textAlign: 'right' }}>NOAEL</th>
                      <th style={{ width: 88, textAlign: 'right' }}>SED</th>
                      <th style={{ width: 76, textAlign: 'right' }}>MoS</th>
                      <th style={{ width: 96 }}>Değerlendirme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formulResults.map((row, i) => {
                      const c = parseFloat(row.inputAmount) || 0;
                      const sed = calcSED(aVal, c, row.dap);
                      const mos = calcMOS(row.noael, sed);
                      const isUygun = mos !== null && mos >= 100;
                      return (
                        <tr key={i} style={{ opacity: row.matched ? 1 : 0.7, background: !row.matched ? '#fff8f8' : 'transparent', verticalAlign: 'middle' }}>
                          {/* Sil */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => deleteFormulRow(i)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d32f2f', padding: 4, borderRadius: 4, lineHeight: 1 }}
                              title="Satırı sil"
                            >
                              <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
                                <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Z" />
                              </svg>
                            </button>
                          </td>
                          {/* INCI */}
                          <td>
                            {row.matched ? (
                              <a href={row.Link || "#"} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none', fontSize: '0.82rem' }}>{row.INCIName}</a>
                            ) : (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ color: '#d32f2f', fontSize: '0.8rem' }}>⚠</span>
                                <input placeholder="Doğru ismi girin" defaultValue={row.inputName} onBlur={e => rematchFormulRow(i, e.target.value)} style={{ border: '1px solid #ffb3b3', borderRadius: 4, padding: '2px 6px', fontSize: '0.78rem', width: '100%' }} />
                              </div>
                            )}
                          </td>
                          {/* C % */}
                          <td style={{ textAlign: 'right', fontSize: '0.8rem', fontWeight: 600 }}>{row.inputAmount}</td>
                          {/* CAS / EC */}
                          <td style={{ fontSize: '0.72rem' }}>
                            {row.Cas && <div>{row.Cas}</div>}
                            {row.Ec && <div style={{ opacity: 0.55 }}>{row.Ec}</div>}
                          </td>
                          {/* Fonksiyon */}
                          <td style={{ fontSize: '0.72rem' }}>{row.Functions || "—"}</td>
                          {/* Annex */}
                          <td style={{ fontSize: '0.72rem' }}>{row.Regulation || "—"}</td>
                          {/* DaP — editable */}
                          <td>
                            <input
                              type="number"
                              value={row.dap}
                              min={0} max={100} step={1}
                              onChange={e => updateFormulField(i, 'dap', Number(e.target.value))}
                              style={tblInput}
                            />
                          </td>
                          {/* A — readonly */}
                          <td style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{form.A || "—"}</td>
                          {/* NOAEL — editable */}
                          <td>
                            <input
                              type="number"
                              value={row.noael}
                              min={0} step="any"
                              placeholder="—"
                              onChange={e => updateFormulField(i, 'noael', e.target.value)}
                              style={tblInput}
                            />
                          </td>
                          {/* SED */}
                          <td style={{ textAlign: 'right', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                            {aVal > 0 ? fmtSED(sed) : <span style={{ opacity: 0.4 }}>—</span>}
                          </td>
                          {/* MoS */}
                          <td style={{ textAlign: 'right', fontSize: '0.8rem', fontWeight: 700, color: mos === null ? 'inherit' : isUygun ? '#1a7340' : '#c0392b' }}>
                            {fmtMOS(mos)}
                          </td>
                          {/* Değerlendirme */}
                          <td style={{ textAlign: 'center' }}>
                            {mos === null ? (
                              <span style={{ fontSize: '0.7rem', opacity: 0.4 }}>NOAEL girin</span>
                            ) : isUygun ? (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1a7340', background: '#e6f4ea', padding: '2px 7px', borderRadius: 4 }}>UYGUN</span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#c0392b', background: '#fdecea', padding: '2px 7px', borderRadius: 4 }}>KONTROL</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ?? Tab 3: Rapor ??????????????????????????????????????????????????? */}
      {activeTab === 'rapor' && (
        <>
          <ReportLanguageSwitch language={reportLang} onChange={setReportLang} />

          <SectionCard title="A.3 — Fiziksel / Kimyasal Özellikler">
            <PhysChemGrid
              form={form}
              onChange={(field, v) => setForm(prev => ({ ...prev, [field]: v }))}
              language={reportLang}
              groups={[
                [
                  { label: 'Görünüm', tr: 'Gorunum', en: 'GorunumEn' },
                  { label: 'Renk', tr: 'Renk', en: 'RenkEn' },
                  { label: 'Koku', tr: 'Koku', en: 'KokuEn' },
                ],
                [
                  { label: 'pH', tr: 'PH', en: 'PHEn' },
                  { label: 'Yoğunluk', tr: 'Yogunluk', en: 'YogunlukEn' },
                  { label: 'Viskozite', tr: 'Viskozite', en: 'ViskoziteEn' },
                ],
                [
                  { label: 'Kaynama Noktası', tr: 'Kaynama', en: 'KaynamaEn' },
                  { label: 'Erime Noktası', tr: 'Erime', en: 'ErimeEn' },
                ],
                [
                  { label: 'Suda Çözünebilirlik', tr: 'SudaCozunebilirlik', en: 'SudaCozunebilirlikEn' },
                  { label: 'Diğer Çözünebilirlik', tr: 'DigerCozunebilirlik', en: 'DigerCozunebilirlikEn' },
                ],
              ]}
            />
          </SectionCard>

          <SectionCard title="A.4 — Laboratuvar Testleri">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <LabTestCard
                title="Mikrobiyoloji"
                status={form.MikrobiyolojiDurum as LabStatus}
                onStatus={v => setForm(prev => ({ ...prev, MikrobiyolojiDurum: v }))}
                image={form.MikrobiyolojiGorsel}
                onImage={v => setForm(prev => ({ ...prev, MikrobiyolojiGorsel: v }))}
              />
              <LabTestCard
                title="Challenge / Koruyucu Etkinlik"
                status={form.KoruyucuEtkinlikDurum as LabStatus}
                onStatus={v => setForm(prev => ({ ...prev, KoruyucuEtkinlikDurum: v }))}
                image={form.KoruyucuEtkinlikGorsel}
                onImage={v => setForm(prev => ({ ...prev, KoruyucuEtkinlikGorsel: v }))}
              />
              <LabTestCard
                title="Stabilite"
                status={form.StabiliteDurum as LabStatus}
                onStatus={v => setForm(prev => ({ ...prev, StabiliteDurum: v }))}
                image={form.StabiliteGorsel}
                onImage={v => setForm(prev => ({ ...prev, StabiliteGorsel: v }))}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
                  <label className={styles.formGroup} style={{ minWidth: 0 }}>
                    <span>Raf ömrü (ay)</span>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={form.StabiliteRafOmruAy}
                      onChange={e => setForm(prev => ({ ...prev, StabiliteRafOmruAy: e.target.value.replace(/\D/g, '') }))}
                      style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                    />
                  </label>
                  <label className={styles.formGroup} style={{ minWidth: 0 }}>
                    <span>Açıldıktan sonra (ay)</span>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={form.StabiliteAcilisAy}
                      onChange={e => setForm(prev => ({ ...prev, StabiliteAcilisAy: e.target.value.replace(/\D/g, '') }))}
                      style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                    />
                  </label>
                </div>
              </LabTestCard>
            </div>
          </SectionCard>

          <SectionCard title="A.5 (Etiket) — Kutu / Etiket Bilgileri">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <DualInput label="Kullanım" value={form.Kullanim} valueEn={form.KullanimEn} onChange={upd('Kullanim')} onChangeEn={upd('KullanimEn')} language={reportLang} rows={3} />
              <DualInput label="Uyarılar" value={form.Uyarilar} valueEn={form.UyarilarEn} onChange={upd('Uyarilar')} onChangeEn={upd('UyarilarEn')} language={reportLang} rows={3} />
              <ImagePicker label="Etiket görseli ekle" value={form.EtiketGorsel} onChange={v => setForm(prev => ({ ...prev, EtiketGorsel: v }))} />
            </div>
          </SectionCard>

          <SectionCard title="A.6 — Kozmetik Ürüne Maruziyet">
            <RaporField label="Maruziyet Değerlendirmesi" value={form.MaruziyetAciklama} valueEn={form.MaruziyetAciklamaEn} onChange={upd('MaruziyetAciklama')} onChangeEn={upd('MaruziyetAciklamaEn')} language={reportLang} rows={8} readOnly hint="Bu alan 1. Genel Bilgiler bölümündeki ürün tipi, uygulama alanı, hedef grup ve rUGDTip değerlerinden otomatik oluşturulur." />
          </SectionCard>

          <SectionCard title="B.4 — Güvenlilik Değerlendirme Sorumlusu">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGroup}>
                <label>Ad Soyad / Kuruluş</label>
                <input value={reportLang === 'en' ? form.SorumluAdEn : form.SorumluAd} onChange={e => setForm({ ...form, [reportLang === 'en' ? 'SorumluAdEn' : 'SorumluAd']: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label>Adres</label>
                <textarea rows={3} value={reportLang === 'en' ? form.SorumluAdresEn : form.SorumluAdres} onChange={e => setForm({ ...form, [reportLang === 'en' ? 'SorumluAdresEn' : 'SorumluAdres']: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div className={styles.formGroup}>
                <label>Yeterlilik Kanıtı / Belge Referansı</label>
                <input value={reportLang === 'en' ? form.SorumluKanitEn : form.SorumluKanit} onChange={e => setForm({ ...form, [reportLang === 'en' ? 'SorumluKanitEn' : 'SorumluKanit']: e.target.value })} />
              </div>
            </div>
          </SectionCard>
        </>
      )}


      {/* ── Alt navigasyon ────────────────────────────────────────────────── */}
      <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'space-between', borderTop: '1px solid var(--color-border-light)', paddingTop: 24 }}>
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
          <button type="button" className={styles.cancelBtn} onClick={() => router.back()}>İptal</button>
          {tabIndex < TABS.length - 1 ? (
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleNext}
              disabled={saving}
              style={{ minWidth: 140, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Kaydediliyor..." : "Sonraki →"}
            </button>
          ) : (
            /* type="button" — form submit'ini önler, çift tık sorununu giderir */
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleFinalSave}
              disabled={saving}
              style={{ minWidth: 200, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Kaydediliyor..." : isEdit ? "GÜNCELLE" : "ÜRÜNÜ KAYDET"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
