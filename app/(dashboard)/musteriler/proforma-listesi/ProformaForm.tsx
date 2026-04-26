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
  const n = Number(value || 0);
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function offerLabel(t: OfferOpt) {
  if (!t.TeklifNo) return `Teklif #${t.ID}`;
  return `ROT${t.TeklifNo}${t.RevNo > 0 ? `/${t.RevNo}` : ""} - ${t.MusteriAd}`;
}

function lineTotal(line: Line) {
  const adet = Number(line.adet || 1);
  const fiyat = Number(line.birimFiyat || 0);
  const iskonto = Number(line.iskonto || 0);
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
  const [kdvOran, setKdvOran] = useState("20");
  const [genelIskonto, setGenelIskonto] = useState("0");
  const [notlar, setNotlar] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [sampleLine, setSampleLine] = useState<Line | null>(null);

  const totals = useMemo(() => {
    const ara = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const iskonto = ara * (Number(genelIskonto || 0) / 100);
    const kdv = (ara - iskonto) * (Number(kdvOran || 0) / 100);
    return { ara, iskonto, kdv, genel: ara - iskonto + kdv };
  }, [lines, genelIskonto, kdvOran]);

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
        birimFiyat: line.BirimFiyat ?? "",
        paraBirimi: line.ParaBirimi || "TRY",
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
      setLines(json.satirlar || []);
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
          kdvOran,
          genelIskonto,
          notlar,
          satirlar: lines,
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
          <label className={styles.field}>Firma
            <div className={styles.lookup}>
              <input className={styles.input} value={firmaQ} onChange={e => searchFirma(e.target.value)} onFocus={() => setFirmaOpen(true)} placeholder="Firma seç" />
              {firmaOpen && firmaOpts.length > 0 && (
                <div className={styles.dropdown}>
                  {firmaOpts.map(f => (
                    <button key={f.ID} type="button" className={styles.dropdownItem} onClick={() => { setFirma(f); setFirmaQ(f.Ad); setFirmaOpen(false); }}>
                      {f.Ad}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
          <label className={styles.field}>KDV %
            <input className={styles.input} value={kdvOran} onChange={e => setKdvOran(e.target.value)} />
          </label>
          <label className={styles.field}>Genel İskonto %
            <input className={styles.input} value={genelIskonto} onChange={e => setGenelIskonto(e.target.value)} />
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
                  <td><input className={styles.lineInput} value={line.birimFiyat} onChange={e => updateLine(i, "birimFiyat", e.target.value)} style={{ width: 124 }} /></td>
                  <td><input className={styles.lineInput} value={line.paraBirimi} onChange={e => updateLine(i, "paraBirimi", e.target.value)} style={{ width: 82 }} /></td>
                  <td><input className={styles.lineInput} value={line.iskonto} onChange={e => updateLine(i, "iskonto", e.target.value)} style={{ width: 82 }} /></td>
                  <td>{fmtMoney(lineTotal(line))}</td>
                  <td><button className={styles.dangerButton} onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}>Sil</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className={styles.field} style={{ marginTop: 14 }}>Notlar
          <textarea className={styles.textarea} value={notlar} onChange={e => setNotlar(e.target.value)} />
        </label>

        <div className={styles.summary}>
          <span>Ara Toplam: <b>{fmtMoney(totals.ara)}</b></span>
          <span>İskonto: <b>{fmtMoney(totals.iskonto)}</b></span>
          <span>KDV: <b>{fmtMoney(totals.kdv)}</b></span>
          <span>Genel Toplam: <b>{fmtMoney(totals.genel)} TRY</b></span>
        </div>
      </div>

      {sampleLine && (
        <div className={styles.overlay} onClick={() => setSampleLine(null)}>
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
