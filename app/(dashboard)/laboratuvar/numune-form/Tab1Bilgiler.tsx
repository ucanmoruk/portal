"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "@/app/styles/table.module.css";
import t1 from "./Tab1Bilgiler.module.css";
import type { NkrFormData, LookupData } from "./numuneFormTypes";

interface Props {
  form: NkrFormData;
  onChange: (updates: Partial<NkrFormData>) => void;
  lookup: LookupData;
  loadingNos: boolean;
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={t1.card}>
      <header className={t1.cardHead}>
        <h3 className={t1.cardTitle}>{title}</h3>
        {hint ? <p className={t1.cardHint}>{hint}</p> : null}
      </header>
      <div className={t1.cardBody}>{children}</div>
    </section>
  );
}

// ── Typeahead: Firma / Proje arama ────────────────────────
function FirmaSearch({
  label, value, displayValue, onChange, placeholder,
}: {
  label: string;
  value: number | null;
  displayValue: string;
  onChange: (id: number | null, ad: string) => void;
  placeholder?: string;
}) {
  const [q, setQ]           = useState(displayValue);
  const [results, setRes]   = useState<{ ID: number; Ad: string }[]>([]);
  const [open, setOpen]     = useState(false);
  const timer               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef             = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(displayValue); }, [displayValue]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((val: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (val.trim().length < 1) { setRes([]); setOpen(false); return; }
      try {
        const r = await fetch(`/api/numune-form/firmalar?q=${encodeURIComponent(val)}`);
        const data = await r.json();
        setRes(data);
        setOpen(data.length > 0);
      } catch { setRes([]); }
    }, 200);
  }, []);

  return (
    <div className={styles.formGroup} ref={wrapRef} style={{ position: "relative" }}>
      <label>{label}</label>
      <input
        value={q}
        placeholder={placeholder || "Yazmaya başlayın…"}
        onChange={e => { setQ(e.target.value); search(e.target.value); if (!e.target.value) onChange(null, ""); }}
        onFocus={() => { if (results.length) setOpen(true); }}
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          onClick={() => { onChange(null, ""); setQ(""); setRes([]); }}
          style={{ position: "absolute", right: 8, top: 28, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: "0.8rem" }}
          aria-label="Temizle"
        >✕</button>
      ) : null}
      {open && results.length > 0 ? (
        <div style={{
          position: "absolute", zIndex: 300, top: "100%", left: 0, right: 0,
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)", boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          maxHeight: 200, overflowY: "auto",
        }}>
          {results.map(r => (
            <div
              key={r.ID}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: "0.845rem",
                borderBottom: "1px solid var(--color-border-light)",
                background: r.ID === value ? "var(--color-accent-light)" : "transparent",
              }}
              onMouseDown={() => { onChange(r.ID, r.Ad); setQ(r.Ad); setOpen(false); }}
            >
              {r.Ad}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WebcamModal({ onCapture, onClose }: { onCapture: (dataUrl: string) => void; onClose: () => void }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError]   = useState("");

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(s => { setStream(s); if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => setError("Kamera erişimi reddedildi."));
    return () => stream?.getTracks().forEach(tr => tr.stop());
  }, []);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width  = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    onCapture(c.toDataURL("image/jpeg", 0.85));
    stream?.getTracks().forEach(tr => tr.stop());
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Kameradan Çek</h2>
          <button type="button" className={styles.modalClose} onClick={() => { stream?.getTracks().forEach(tr => tr.stop()); onClose(); }}>✕</button>
        </div>
        <div className={styles.modalBody} style={{ textAlign: "center" }}>
          {error
            ? <p style={{ color: "var(--color-danger)" }}>{error}</p>
            : <video ref={videoRef} autoPlay playsInline style={{ width: "100%", borderRadius: 8 }} />
          }
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.cancelBtn} onClick={() => { stream?.getTracks().forEach(tr => tr.stop()); onClose(); }}>İptal</button>
          <button type="button" className={styles.saveBtn} onClick={capture} disabled={!!error}>Çek</button>
        </div>
      </div>
    </div>
  );
}


const BIRIMLER = ["g", "mL", "L", "Adet"];
const KARALAR  = ["Basit Karar Kuralı", "Müşteri Lehine", "Müşteri Aleyhine"];
const DILLER   = ["Türkçe", "İngilizce", "Hem Türkçe Hem İngilizce"];
const GRUPLAR  = ["Özel", "K.D."];
export default function Tab1Bilgiler({ form, onChange, lookup, loadingNos }: Props) {
  const fileRef         = useRef<HTMLInputElement>(null);
  const [webcam, setWC] = useState(false);

  const handleGrup = (val: string) => onChange({ Grup: val, Tur: "" });
  const turler = form.Grup
    ? lookup.grupTurleri.filter(g => g.Grup === form.Grup).map(g => g.Tur)
    : [];

  const handleFotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onChange({ FotoFile: file, FotoPreview: URL.createObjectURL(file) });
  };

  const handleWebcapture = (dataUrl: string) => {
    setWC(false);
    const arr  = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    const file = new File([u8], "webcam.jpg", { type: mime });
    onChange({ FotoFile: file, FotoPreview: dataUrl });
  };

  const sel = { width: "100%" as const };

  return (
    <div className={t1.root}>
      <Card
        title="Kayıt bilgileri"
        hint="Ürün grubunu seçtiğinizde evrak ve rapor numarası önerilir; gerekirse düzenleyebilirsiniz."
      >
        <div className={t1.gridKayitRow1}>
          <div className={`${styles.formGroup} ${t1.dateWrap}`}>
            <label>Tarih</label>
            <input type="date" value={form.Tarih} onChange={e => onChange({ Tarih: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label>Ürün grubu</label>
            <select style={sel} value={form.Grup} onChange={e => handleGrup(e.target.value)}>
              <option value="">Seçin</option>
              {GRUPLAR.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Ürün türü</label>
            <select style={sel} value={form.Tur} onChange={e => onChange({ Tur: e.target.value })} disabled={!form.Grup}>
              <option value="">Seçin</option>
              {turler.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>
              Evrak No <span className={styles.required}>*</span>
              {loadingNos ? <span style={{ marginLeft: 4, color: "var(--color-text-tertiary)", fontSize: "0.7rem" }}>…</span> : null}
            </label>
            <input style={sel} value={form.Evrak_No} onChange={e => onChange({ Evrak_No: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label>
              Rapor No <span className={styles.required}>*</span>
              {loadingNos ? <span style={{ marginLeft: 4, color: "var(--color-text-tertiary)", fontSize: "0.7rem" }}>…</span> : null}
            </label>
            <input style={sel} value={form.RaporNo} onChange={e => onChange({ RaporNo: e.target.value })} />
          </div>
          <div className={`${styles.formGroup} ${t1.revWrap}`}>
            <label>Rev.</label>
            <input type="number" min={0} value={form.Revno} onChange={e => onChange({ Revno: e.target.value })} title="Revizyon no" />
          </div>
        </div>

        <div className={t1.gridKayitRow2}>
          <div className={styles.formGroup}>
            <label>Teklif No</label>
            <input style={sel} value={form.Teklif_No} onChange={e => onChange({ Teklif_No: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label>Talep No</label>
            <input style={sel} value={form.Talep_No} onChange={e => onChange({ Talep_No: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label>Karar kuralı</label>
            <select style={sel} value={form.Karar} onChange={e => onChange({ Karar: e.target.value })}>
              <option value="">Seçin</option>
              {KARALAR.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Raporlama dili</label>
            <select style={sel} value={form.Dil} onChange={e => onChange({ Dil: e.target.value })}>
              <option value="">Seçin</option>
              {DILLER.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card
        title="Müşteri"
        hint="Firma ve proje kayıtları RootTedarikci üzerinden aranır."
      >
        <div className={t1.gridTwo}>
          <FirmaSearch
            label="Firma"
            value={form.Firma_ID}
            displayValue={form.FirmaAd}
            onChange={(id, ad) => onChange({ Firma_ID: id, FirmaAd: ad })}
            placeholder="Firma adı…"
          />
          <FirmaSearch
            label="Proje"
            value={form.ProjeID}
            displayValue={form.ProjeAd}
            onChange={(id, ad) => onChange({ ProjeID: id, ProjeAd: ad })}
            placeholder="Proje adı…"
          />
        </div>
      </Card>

      <Card
        title="Numune tanımı"
        hint="Örnek adı, miktar, parti ve numune notları."
      >
        <div className={t1.gridTwo}>
          <div className={styles.formGroup}>
            <label>Numune adı (TR) <span className={styles.required}>*</span></label>
            <input style={sel} value={form.Numune_Adi} onChange={e => onChange({ Numune_Adi: e.target.value })} placeholder="Türkçe ad…" />
          </div>
          <div className={styles.formGroup}>
            <label>Numune adı (EN)</label>
            <input style={sel} value={form.Numune_Adi_En} onChange={e => onChange({ Numune_Adi_En: e.target.value })} placeholder="English name…" />
          </div>
        </div>

        <div className={t1.gridNumuneRow}>
          <div className={styles.formGroup}>
            <label>Barkod</label>
            <input style={sel} value={form.Barkod} onChange={e => onChange({ Barkod: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label>Nominal miktar</label>
            <div className={t1.qtyRow}>
              <input type="number" min={0} placeholder="0" value={form.Miktar} onChange={e => onChange({ Miktar: e.target.value })} />
              <select value={form.Birim} onChange={e => onChange({ Birim: e.target.value })}>
                <option value="">—</option>
                {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>Teste gelen miktar</label>
            <div className={t1.qtyRow}>
              <input type="number" min={0} placeholder="0" value={form.TesteMiktar} onChange={e => onChange({ TesteMiktar: e.target.value })} />
              <select value={form.TesteMiktarBirim} onChange={e => onChange({ TesteMiktarBirim: e.target.value })}>
                <option value="">—</option>
                {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>Seri / Lot</label>
            <input style={sel} value={form.SeriNo} onChange={e => onChange({ SeriNo: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label>Üretim tarihi</label>
            <input style={sel} value={form.UretimTarihi} onChange={e => onChange({ UretimTarihi: e.target.value })} placeholder="örn. 2024-06 veya 2024" />
          </div>
          <div className={styles.formGroup}>
            <label>SKT</label>
            <input style={sel} value={form.SKT} onChange={e => onChange({ SKT: e.target.value })} placeholder="örn. 2025-12" />
          </div>
        </div>

        <div className={`${styles.formGroup} ${t1.notlarArea}`}>
          <label>Notlar</label>
          <textarea
            className={t1.notlarTextarea}
            rows={3}
            value={form.Aciklama}
            onChange={e => onChange({ Aciklama: e.target.value })}
            placeholder="İsteğe bağlı…"
          />
        </div>
      </Card>

      <Card title="Ürün fotoğrafı" hint="Dosya yükleyin veya kameradan çekin. Kayıt sırasında sunucuya aktarılır.">
        <div className={t1.fotoRow}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFotoFile} />
          <div className={t1.fotoActions}>
            <button type="button" className={styles.cancelBtn} onClick={() => fileRef.current?.click()}>
              Dosyadan seç
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setWC(true)}>
              Kameradan çek
            </button>
          </div>
          {(form.FotoPreview || form.FotoPath) ? (
            <div className={t1.fotoPreview}>
              <img src={form.FotoPreview || form.FotoPath} alt="Ürün önizleme" />
              <button type="button" className={styles.cancelBtn} style={{ color: "var(--color-danger)" }}
                onClick={() => onChange({ FotoFile: null, FotoPreview: "", FotoPath: "" })}>
                Kaldır
              </button>
            </div>
          ) : null}
        </div>
      </Card>

      {webcam ? <WebcamModal onCapture={handleWebcapture} onClose={() => setWC(false)} /> : null}
    </div>
  );
}
