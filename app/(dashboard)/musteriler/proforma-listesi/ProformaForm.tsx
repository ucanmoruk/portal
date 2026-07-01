"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import tableStyles from "@/app/styles/table.module.css";
import styles from "./proforma.module.css";

interface CustomerOpt {
  ID: number;
  Ad: string;
  Email?: string;
}

interface OfferOpt {
  ID: number;
  TeklifNo: number | null;
  RevNo: number;
  MusteriAd: string;
  Tarih: string;
}

interface Line {
  id?: number;
  hizmetId: number | null;
  hizmetKodu: string;
  hizmetAdi: string;
  raporNoListesi: string;
  numuneListesi: string;
  adet: number | string;
  birimFiyat: number | string;
  paraBirimi: string;
  iskonto: number | string;
  kaynak?: string;
}

function fmtMoney(value: number | string | null | undefined) {
  const n = typeof value === "number" ? value : parseTrNumber(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// TR biçimli sayıyı ayrıştır: "10.000,15" → 10000.15. Düz "10000.15" de çalışır.
//  - virgül varsa: nokta = binlik, virgül = ondalık (TR)
//  - virgül yoksa ama "10.000" / "1.234.567" gibi binlik gruplama varsa: noktaları sil
//  - aksi halde noktayı ondalık say (düz format)
function parseTrNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let s = String(value ?? "").trim();
  if (!s) return 0;
  s = s.replace(/\s/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// Para birimi seçenekleri (manuel fiyat girişinde döviz seçimi).
const PARA_BIRIMLERI = ["TRY", "USD", "EUR", "GBP"];
function normParaBirimi(v: string | null | undefined): string {
  const up = String(v ?? "TRY").trim().toUpperCase();
  if (up === "TL" || up === "₺" || up === "") return "TRY";
  return PARA_BIRIMLERI.includes(up) ? up : "TRY";
}

function offerLabel(t: OfferOpt) {
  if (!t.TeklifNo) return `Teklif #${t.ID}`;
  return `ROT${t.TeklifNo}${t.RevNo > 0 ? `/${t.RevNo}` : ""} - ${t.MusteriAd}`;
}

function lineTotal(line: Line) {
  const adet = parseTrNumber(line.adet || 1);
  const fiyat = parseTrNumber(line.birimFiyat || 0);
  const iskonto = parseTrNumber(line.iskonto || 0);
  return adet * fiyat * (1 - iskonto / 100);
}

function splitItems(value: string | null | undefined) {
  return String(value || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

export default function ProformaForm({ id }: { id?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = Boolean(id);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [proformaNo, setProformaNo] = useState("");
  const [evrakNo, setEvrakNo] = useState(searchParams.get("evrakNo") || "");
  const [teklifId, setTeklifId] = useState(searchParams.get("teklifId") || "");
  const [teklifler, setTeklifler] = useState<OfferOpt[]>([]);
  const [firma, setFirma] = useState<CustomerOpt | null>(null);
  const [firmaQ, setFirmaQ] = useState("");
  const [firmaOpts, setFirmaOpts] = useState<CustomerOpt[]>([]);
  const [firmaOpen, setFirmaOpen] = useState(false);
  // Fatura firması — rapor/proforma firmasından farklı olabilir (opsiyonel).
  const [faturaFirma, setFaturaFirma] = useState<CustomerOpt | null>(null);
  const [faturaFirmaQ, setFaturaFirmaQ] = useState("");
  const [faturaFirmaOpts, setFaturaFirmaOpts] = useState<CustomerOpt[]>([]);
  const [faturaFirmaOpen, setFaturaFirmaOpen] = useState(false);
  const [kdvOran, setKdvOran] = useState("20");
  const [genelIskonto, setGenelIskonto] = useState("0");
  const [notlar, setNotlar] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [sampleLine, setSampleLine] = useState<Line | null>(null);
  const [dovizAlis, setDovizAlis] = useState<number | null>(null);

  const totals = useMemo(() => {
    const ara = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const iskonto = ara * (parseTrNumber(genelIskonto || 0) / 100);
    const kdv = (ara - iskonto) * (parseTrNumber(kdvOran || 0) / 100);
    return { ara, iskonto, kdv, genel: ara - iskonto + kdv };
  }, [lines, genelIskonto, kdvOran]);

  const paraBirimi = useMemo(() => {
    const currencies = Array.from(new Set(lines.map(line => normParaBirimi(line.paraBirimi))));
    return currencies.length > 1 ? "Çoklu" : (currencies[0] || "TRY");
  }, [lines]);

  useEffect(() => {
    let alive = true;
    const pb = paraBirimi === "TL" || paraBirimi === "₺" ? "TRY" : paraBirimi;
    if (!pb || pb === "TRY" || pb === "ÇOKLU" || pb === "Çoklu") {
      setDovizAlis(null);
      return;
    }
    fetch(`/api/tcmb-kur?currency=${encodeURIComponent(pb)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive) setDovizAlis(j?.rate ? Number(j.rate) : null); })
      .catch(() => { if (alive) setDovizAlis(null); });
    return () => { alive = false; };
  }, [paraBirimi]);

  useEffect(() => {
    loadOffers();
    if (isEdit && id) {
      loadDetail(id);
    } else if (evrakNo) {
      prepare(evrakNo, teklifId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadOffers() {
    const res = await fetch("/api/teklifler?page=1&limit=100");
    const json = await res.json();
    setTeklifler(json.data || []);
  }

  async function loadDetail(nextId: string) {
    setLoading(true);
    setFormErr("");
    try {
      const res = await fetch(`/api/proformalar/${nextId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Proforma açılamadı.");
      const h = json.header;
      setProformaNo(h.ProformaNo || "");
      setEvrakNo(h.EvrakNo || "");
      setTeklifId(h.TeklifID ? String(h.TeklifID) : "");
      setFirma({ ID: Number(h.FirmaID), Ad: h.FirmaAd || "", Email: h.FirmaEmail || "" });
      setFirmaQ(h.FirmaAd || "");
      if (h.FaturaFirmaID) {
        setFaturaFirma({ ID: Number(h.FaturaFirmaID), Ad: h.FaturaFirmaAd || "" });
        setFaturaFirmaQ(h.FaturaFirmaAd || "");
      } else {
        setFaturaFirma(null);
        setFaturaFirmaQ("");
      }
      setKdvOran(String(h.KdvOran ?? 20));
      setGenelIskonto(String(h.GenelIskonto ?? 0));
      setNotlar(h.Notlar || "");
      setLines((json.satirlar || []).map((line: any) => ({
        id: line.ID,
        hizmetId: line.HizmetID,
        hizmetKodu: line.HizmetKodu || "",
        hizmetAdi: line.HizmetAdi || "",
        raporNoListesi: line.RaporNoListesi || "",
        numuneListesi: line.NumuneListesi || "",
        adet: line.Adet ?? 1,
        birimFiyat: line.BirimFiyat != null ? fmtMoney(line.BirimFiyat) : "",
        paraBirimi: normParaBirimi(line.ParaBirimi),
        iskonto: line.Iskonto ?? 0,
        kaynak: line.Kaynak || "",
      })));
    } catch (e: any) {
      setFormErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function prepare(nextEvrakNo: string, nextTeklifId = "") {
    if (!nextEvrakNo.trim()) return;
    setFormErr("");
    setLoading(true);
    try {
      const url = `/api/proformalar/prepare?evrakNo=${encodeURIComponent(nextEvrakNo.trim())}${nextTeklifId ? `&teklifId=${nextTeklifId}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Proforma hazırlanamadı.");
      if (json.firma) {
        setFirma(json.firma);
        setFirmaQ(json.firma.Ad || "");
      }
      setLines((json.satirlar || []).map((l: any) => ({
        ...l,
        birimFiyat: l.birimFiyat !== "" && l.birimFiyat != null ? fmtMoney(l.birimFiyat) : "",
        paraBirimi: normParaBirimi(l.paraBirimi),
      })));
      setKdvOran(String(json.kdvOran ?? 20));
      setGenelIskonto(String(json.genelIskonto ?? 0));
    } catch (e: any) {
      setFormErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function searchFirma(q: string) {
    setFirmaQ(q);
    setFirma(null);
    setFirmaOpen(true);
    const res = await fetch(`/api/teklifler/lookup?type=musteriler&q=${encodeURIComponent(q)}`);
    const json = await res.json();
    setFirmaOpts(json.data || []);
  }

  async function searchFaturaFirma(q: string) {
    setFaturaFirmaQ(q);
    setFaturaFirma(null);
    setFaturaFirmaOpen(true);
    const res = await fetch(`/api/teklifler/lookup?type=musteriler&q=${encodeURIComponent(q)}`);
    const json = await res.json();
    setFaturaFirmaOpts(json.data || []);
  }

  function updateLine(index: number, field: keyof Line, value: string) {
    setLines(prev => prev.map((line, i) => i === index ? { ...line, [field]: value } : line));
  }

  function addManualLine() {
    setLines(prev => [...prev, {
      hizmetId: null,
      hizmetKodu: "",
      hizmetAdi: "",
      raporNoListesi: "",
      numuneListesi: "",
      adet: 1,
      birimFiyat: "",
      paraBirimi: "TRY",
      iskonto: 0,
      kaynak: "Manuel",
    }]);
  }

  async function save() {
    if (!firma) {
      setFormErr("Firma seçimi zorunludur.");
      return;
    }
    setSaving(true);
    setFormErr("");
    try {
      const res = await fetch(isEdit ? `/api/proformalar/${id}` : "/api/proformalar", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evrakNo: evrakNo || null,
          teklifId: teklifId || null,
          firmaId: firma.ID,
          faturaFirmaId: faturaFirma?.ID ?? null,
          kdvOran: parseTrNumber(kdvOran),
          genelIskonto: parseTrNumber(genelIskonto),
          notlar,
          // TR biçimli ("10.000,15") tutarları temiz sayıya çevir + para birimini normalize et.
          satirlar: lines.map(l => ({
            ...l,
            adet: parseTrNumber(l.adet || 1),
            birimFiyat: parseTrNumber(l.birimFiyat || 0),
            iskonto: parseTrNumber(l.iskonto || 0),
            paraBirimi: normParaBirimi(l.paraBirimi),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Proforma kaydedilemedi.");
      router.push("/musteriler/proforma-listesi");
    } catch (e: any) {
      setFormErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const sampleRows = sampleLine
    ? splitItems(sampleLine.raporNoListesi).map((rapor, i) => ({
        rapor,
        numune: splitItems(sampleLine.numuneListesi)[i] || "-",
      }))
    : [];

  return (
    <div className={styles.formPage}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{isEdit ? "Proforma Düzenle" : "Yeni Proforma"}</h1>
          <p className={styles.subtitle}>{isEdit ? proformaNo : "Numune veya manuel kalemlerden proforma oluştur."}</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={() => router.push("/musteriler/proforma-listesi")}>Listeye Dön</button>
          <button className={styles.primaryButton} disabled={saving || loading} onClick={save}>
            {saving ? "Kaydediliyor..." : (isEdit ? "Proformayı Güncelle" : "Proforma Oluştur")}
          </button>
        </div>
      </div>

      {formErr && <div className={styles.error}>{formErr}</div>}

      <div className={styles.panel}>
        <div className={styles.grid}>
          <label className={styles.field}>Evrak No
            <input className={styles.input} value={evrakNo} onChange={e => setEvrakNo(e.target.value)} onBlur={() => prepare(evrakNo, teklifId)} placeholder="Evrak no" />
          </label>
          <label className={styles.field}>Teklif
            <select className={styles.select} value={teklifId} onChange={e => { setTeklifId(e.target.value); prepare(evrakNo, e.target.value); }}>
              <option value="">Manuel fiyat gireceğim</option>
              {teklifler.map(t => <option key={t.ID} value={t.ID}>{offerLabel(t)}</option>)}
            </select>
          </label>
          <label className={styles.field}>KDV %
            <input className={styles.input} value={kdvOran} onChange={e => setKdvOran(e.target.value)} />
          </label>
          <label className={styles.field}>Genel İskonto %
            <input className={styles.input} value={genelIskonto} onChange={e => setGenelIskonto(e.target.value)} />
          </label>
          {/* 2. satır: Rapor Firması + Fatura Firması yan yana (tam genişlik) */}
          <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label className={styles.field}>Rapor Firması
              <div className={styles.lookup}>
                <input className={styles.input} value={firmaQ} onChange={e => searchFirma(e.target.value)} onFocus={() => setFirmaOpen(true)} placeholder="Rapor firması seç" />
                {firmaOpen && firmaOpts.length > 0 && (
                  <div className={styles.dropdown}>
                    {firmaOpts.map(f => (
                      <button key={f.ID} type="button" className={styles.dropdownItem} onClick={() => { setFirma(f); setFirmaQ(f.Ad); setFirmaOpen(false); setFirmaOpts([]); }}>
                        {f.Ad}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <label className={styles.field}>Fatura Firması <small style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>(farklıysa — boş = rapor firması)</small>
              <div className={styles.lookup}>
                <input
                  className={styles.input}
                  value={faturaFirmaQ}
                  onChange={e => searchFaturaFirma(e.target.value)}
                  onFocus={() => setFaturaFirmaOpen(true)}
                  placeholder="Boş = rapor firması"
                />
                {faturaFirma && (
                  <button
                    type="button"
                    className={styles.button}
                    style={{ marginTop: 6 }}
                    onClick={() => { setFaturaFirma(null); setFaturaFirmaQ(""); setFaturaFirmaOpen(false); setFaturaFirmaOpts([]); }}
                  >Temizle (rapor firmasına kes)</button>
                )}
                {faturaFirmaOpen && faturaFirmaOpts.length > 0 && (
                  <div className={styles.dropdown}>
                    {faturaFirmaOpts.map(f => (
                      <button key={f.ID} type="button" className={styles.dropdownItem} onClick={() => { setFaturaFirma(f); setFaturaFirmaQ(f.Ad); setFaturaFirmaOpen(false); setFaturaFirmaOpts([]); }}>
                        {f.Ad}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
          </div>
          {/* Açıklama — proforma notu; listede küçük punto not olarak da görünür. */}
          <label className={styles.field} style={{ gridColumn: "1 / -1" }}>Açıklama
            <textarea
              className={styles.textarea}
              value={notlar}
              onChange={e => setNotlar(e.target.value)}
              placeholder="Proforma açıklaması / notu (listede de görünür)"
              rows={2}
            />
          </label>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Kalemler</h2>
          <button className={styles.button} onClick={addManualLine}>Manuel Kalem Ekle</button>
        </div>
        <div className={styles.tableScroll}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Hizmet</th>
                <th>Adet</th>
                <th>Birim Fiyat</th>
                <th>PB</th>
                <th>İsk. %</th>
                <th>Tutar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className={tableStyles.empty}>Yükleniyor...</td></tr>
              ) : lines.length === 0 ? (
                <tr><td colSpan={7} className={tableStyles.empty}>Kalem bulunmuyor.</td></tr>
              ) : lines.map((line, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 280 }}>
                    <button type="button" className={styles.serviceButton} onClick={() => setSampleLine(line)}>
                      {line.hizmetAdi || "Hizmet adı gir"}
                    </button>
                    <input className={styles.lineInput} value={line.hizmetAdi} onChange={e => updateLine(i, "hizmetAdi", e.target.value)} style={{ marginTop: 6 }} />
                  </td>
                  <td><input className={styles.lineInput} value={line.adet} onChange={e => updateLine(i, "adet", e.target.value)} style={{ width: 82 }} /></td>
                  <td><input
                    className={styles.lineInput}
                    value={line.birimFiyat}
                    onChange={e => updateLine(i, "birimFiyat", e.target.value)}
                    onBlur={e => updateLine(i, "birimFiyat", e.target.value.trim() ? fmtMoney(parseTrNumber(e.target.value)) : "")}
                    inputMode="decimal"
                    placeholder="0,00"
                    style={{ width: 124, textAlign: "right" }}
                  /></td>
                  <td><select
                    className={styles.lineInput}
                    value={normParaBirimi(line.paraBirimi)}
                    onChange={e => updateLine(i, "paraBirimi", e.target.value)}
                    style={{ width: 82 }}
                  >
                    {PARA_BIRIMLERI.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></td>
                  <td><input className={styles.lineInput} value={line.iskonto} onChange={e => updateLine(i, "iskonto", e.target.value)} style={{ width: 82 }} /></td>
                  <td>{fmtMoney(lineTotal(line))}</td>
                  <td><button className={styles.dangerButton} onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}>Sil</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.summary}>
          <span>Ara Toplam: <b>{fmtMoney(totals.ara)}</b></span>
          <span>İskonto: <b>{fmtMoney(totals.iskonto)}</b></span>
          <span>KDV: <b>{fmtMoney(totals.kdv)}</b></span>
          <span>Genel Toplam: <b>{fmtMoney(totals.genel)} {paraBirimi}</b></span>
          {dovizAlis && (
            <span>TL Karşılığı: <b>{fmtMoney(totals.genel * dovizAlis)} TL</b> <small>(TCMB alış {fmtMoney(dovizAlis)})</small></span>
          )}
        </div>
      </div>

      {sampleLine && (
        <div className={styles.overlay}>
          <div className={styles.miniModal} onClick={e => e.stopPropagation()}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{sampleLine.hizmetAdi}</h2>
              <button className={styles.button} onClick={() => setSampleLine(null)}>Kapat</button>
            </div>
            <div className={styles.sampleList}>
              {sampleRows.length === 0 ? (
                <div className={styles.sampleItem}>Bu hizmet için ürün bilgisi yok.</div>
              ) : sampleRows.map((row, i) => (
                <div key={`${row.rapor}-${i}`} className={styles.sampleItem}>
                  <strong>{row.rapor}</strong> - {row.numune}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
