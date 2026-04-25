"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import styles from "@/app/styles/table.module.css";

interface ProformaRow {
  ID: number;
  ProformaNo: string;
  EvrakNo: string | null;
  TeklifID: number | null;
  Tarih: string;
  Durum: string;
  FirmaAd: string;
  GenelToplam: number | string;
  KalemSayisi: number | string;
}

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

const DURUMLAR = ["Taslak", "Gönderildi", "Onaylandı", "İptal"];

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

export default function ProformaTable() {
  const searchParams = useSearchParams();
  const initialEvrakRef = useRef(searchParams.get("evrakNo") || "");
  const initialTeklifRef = useRef(searchParams.get("teklifId") || "");

  const [rows, setRows] = useState<ProformaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [evrakNo, setEvrakNo] = useState("");
  const [teklifId, setTeklifId] = useState("");
  const [teklifler, setTeklifler] = useState<OfferOpt[]>([]);
  const [firma, setFirma] = useState<CustomerOpt | null>(null);
  const [firmaQ, setFirmaQ] = useState("");
  const [firmaOpts, setFirmaOpts] = useState<CustomerOpt[]>([]);
  const [firmaOpen, setFirmaOpen] = useState(false);
  const [kdvOran, setKdvOran] = useState("20");
  const [genelIskonto, setGenelIskonto] = useState("0");
  const [notlar, setNotlar] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const [detail, setDetail] = useState<any | null>(null);
  const [detailLines, setDetailLines] = useState<any[]>([]);

  const totals = useMemo(() => {
    const ara = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const iskonto = ara * (Number(genelIskonto || 0) / 100);
    const kdv = (ara - iskonto) * (Number(kdvOran || 0) / 100);
    return { ara, iskonto, kdv, genel: ara - iskonto + kdv };
  }, [lines, genelIskonto, kdvOran]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/proformalar?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Proforma listesi alınamadı.");
      setRows(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, page, limit]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (initialEvrakRef.current) {
      openNew(initialEvrakRef.current, initialTeklifRef.current);
      initialEvrakRef.current = "";
      initialTeklifRef.current = "";
    }
  }, []);

  async function loadOffers() {
    const res = await fetch("/api/teklifler?page=1&limit=100");
    const json = await res.json();
    setTeklifler(json.data || []);
  }

  async function prepare(nextEvrakNo: string, nextTeklifId = "") {
    if (!nextEvrakNo.trim()) return;
    setFormErr("");
    const url = `/api/proformalar/prepare?evrakNo=${encodeURIComponent(nextEvrakNo.trim())}${nextTeklifId ? `&teklifId=${nextTeklifId}` : ""}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
      setFormErr(json.error || "Proforma hazırlanamadı.");
      return;
    }
    if (json.firma) {
      setFirma(json.firma);
      setFirmaQ(json.firma.Ad || "");
    }
    setLines(json.satirlar || []);
    setKdvOran(String(json.kdvOran ?? 20));
    setGenelIskonto(String(json.genelIskonto ?? 0));
  }

  async function openNew(nextEvrakNo = "", nextTeklifId = "") {
    setModalOpen(true);
    setFormErr("");
    setEvrakNo(nextEvrakNo);
    setTeklifId(nextTeklifId);
    setFirma(null);
    setFirmaQ("");
    setLines([]);
    setKdvOran("20");
    setGenelIskonto("0");
    setNotlar("");
    await loadOffers();
    if (nextEvrakNo) await prepare(nextEvrakNo, nextTeklifId);
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
      const res = await fetch("/api/proformalar", {
        method: "POST",
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
      setModalOpen(false);
      fetchRows();
      openDetail(json.id);
    } catch (e: any) {
      setFormErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: number) {
    const res = await fetch(`/api/proformalar/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Proforma açılmadı.");
      return;
    }
    setDetail(json.header);
    setDetailLines(json.satirlar || []);
  }

  async function updateStatus(row: ProformaRow, durum: string) {
    await fetch(`/api/proformalar/${row.ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durum }),
    });
    fetchRows();
  }

  async function sendMail() {
    if (!detail) return;
    await fetch(`/api/proformalar/${detail.ID}/mail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: detail.FirmaEmail, subject: detail.ProformaNo }),
    });
    alert("Mail gönderim isteği oluşturuldu.");
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 320 }}>
            <input className={styles.searchInput} placeholder="Proforma, evrak no, firma..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
        <div className={styles.toolbarRight}>
          <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
          <button className={styles.addBtn} onClick={() => openNew()}>Yeni Proforma</button>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Proforma</th>
              <th>Evrak No</th>
              <th>Firma</th>
              <th>Tarih</th>
              <th>Durum</th>
              <th>Kalem</th>
              <th>Toplam</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className={styles.empty}>Yükleniyor...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className={styles.empty}>Henüz proforma oluşturulmamış.</td></tr>
            ) : rows.map(row => (
              <tr key={row.ID}>
                <td className={styles.primaryCell}>{row.ProformaNo}</td>
                <td>{row.EvrakNo || "-"}</td>
                <td>{row.FirmaAd || "-"}</td>
                <td>{row.Tarih}</td>
                <td>
                  <select value={row.Durum} onChange={e => updateStatus(row, e.target.value)} className={styles.pageSizeSelect}>
                    {DURUMLAR.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
                <td>{row.KalemSayisi}</td>
                <td>{fmtMoney(row.GenelToplam)} TRY</td>
                <td style={{ textAlign: "right" }}>
                  <button className={styles.editBtn} onClick={() => openDetail(row.ID)}>Aç</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Önceki</button>
          <span className={styles.pageInfo}>{page} / {totalPages}</span>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sonraki</button>
        </div>
      )}

      {modalOpen && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Yeni Proforma</h2>
              <button className={styles.editBtn} onClick={() => setModalOpen(false)}>Kapat</button>
            </div>
            {formErr && <div className={styles.errorBar}>{formErr}</div>}
            <div style={gridStyle}>
              <label style={fieldStyle}>Evrak No
                <input className={styles.searchInput} value={evrakNo} onChange={e => setEvrakNo(e.target.value)} onBlur={() => prepare(evrakNo, teklifId)} placeholder="Evrak no" />
              </label>
              <label style={fieldStyle}>Teklif
                <select className={styles.pageSizeSelect} value={teklifId} onChange={e => { setTeklifId(e.target.value); prepare(evrakNo, e.target.value); }}>
                  <option value="">Manuel fiyat gireceğim</option>
                  {teklifler.map(t => <option key={t.ID} value={t.ID}>{offerLabel(t)}</option>)}
                </select>
              </label>
              <label style={fieldStyle}>Firma
                <div style={{ position: "relative" }}>
                  <input className={styles.searchInput} value={firmaQ} onChange={e => searchFirma(e.target.value)} onFocus={() => setFirmaOpen(true)} placeholder="Firma seç" />
                  {firmaOpen && firmaOpts.length > 0 && (
                    <div style={dropdownStyle}>
                      {firmaOpts.map(f => (
                        <button key={f.ID} type="button" style={dropdownItemStyle} onClick={() => { setFirma(f); setFirmaQ(f.Ad); setFirmaOpen(false); }}>
                          {f.Ad}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>
              <label style={fieldStyle}>KDV %
                <input className={styles.searchInput} value={kdvOran} onChange={e => setKdvOran(e.target.value)} />
              </label>
              <label style={fieldStyle}>Genel İskonto %
                <input className={styles.searchInput} value={genelIskonto} onChange={e => setGenelIskonto(e.target.value)} />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 8px" }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Kalemler</h3>
              <button className={styles.editBtn} onClick={addManualLine}>Manuel Kalem</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Hizmet</th><th>Raporlar</th><th>Adet</th><th>Birim Fiyat</th><th>PB</th><th>İsk. %</th><th>Tutar</th><th></th></tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td><input className={styles.searchInput} value={line.hizmetAdi} onChange={e => updateLine(i, "hizmetAdi", e.target.value)} /></td>
                      <td style={{ maxWidth: 220, fontSize: 12 }}>{line.raporNoListesi || "-"}</td>
                      <td><input className={styles.searchInput} value={line.adet} onChange={e => updateLine(i, "adet", e.target.value)} style={{ width: 70 }} /></td>
                      <td><input className={styles.searchInput} value={line.birimFiyat} onChange={e => updateLine(i, "birimFiyat", e.target.value)} style={{ width: 110 }} /></td>
                      <td><input className={styles.searchInput} value={line.paraBirimi} onChange={e => updateLine(i, "paraBirimi", e.target.value)} style={{ width: 70 }} /></td>
                      <td><input className={styles.searchInput} value={line.iskonto} onChange={e => updateLine(i, "iskonto", e.target.value)} style={{ width: 70 }} /></td>
                      <td>{fmtMoney(lineTotal(line))}</td>
                      <td><button className={styles.deleteBtn} onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}>Sil</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label style={{ ...fieldStyle, marginTop: 12 }}>Notlar
              <textarea className={styles.searchInput} value={notlar} onChange={e => setNotlar(e.target.value)} style={{ minHeight: 70, resize: "vertical" }} />
            </label>
            <div style={summaryStyle}>
              <span>Ara Toplam: <b>{fmtMoney(totals.ara)}</b></span>
              <span>İskonto: <b>{fmtMoney(totals.iskonto)}</b></span>
              <span>KDV: <b>{fmtMoney(totals.kdv)}</b></span>
              <span>Genel Toplam: <b>{fmtMoney(totals.genel)} TRY</b></span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className={styles.editBtn} onClick={() => setModalOpen(false)}>Vazgeç</button>
              <button className={styles.addBtn} disabled={saving} onClick={save}>{saving ? "Kaydediliyor..." : "Proforma Oluştur"}</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div style={overlayStyle}>
          <div style={modalStyle} id="proforma-print-area">
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{detail.ProformaNo}</h2>
                <p style={{ margin: "4px 0 0", color: "var(--color-text-secondary)" }}>{detail.FirmaAd} {detail.EvrakNo ? `- Evrak ${detail.EvrakNo}` : ""}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={styles.editBtn} onClick={() => window.print()}>Yazdır</button>
                <button className={styles.editBtn} onClick={sendMail}>Mail Gönder</button>
                <button className={styles.editBtn} onClick={() => setDetail(null)}>Kapat</button>
              </div>
            </div>
            <table className={styles.table}>
              <thead><tr><th>Hizmet</th><th>Raporlar</th><th>Adet</th><th>Birim</th><th>İsk.</th><th>Tutar</th></tr></thead>
              <tbody>
                {detailLines.map(line => (
                  <tr key={line.ID}>
                    <td>{line.HizmetAdi}</td>
                    <td>{line.RaporNoListesi || "-"}</td>
                    <td>{line.Adet}</td>
                    <td>{fmtMoney(line.BirimFiyat)} {line.ParaBirimi}</td>
                    <td>{line.Iskonto}%</td>
                    <td>{fmtMoney(line.Tutar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={summaryStyle}>
              <span>Ara Toplam: <b>{fmtMoney(detail.AraToplam)}</b></span>
              <span>İskonto: <b>{fmtMoney(detail.IskontoTutar)}</b></span>
              <span>KDV: <b>{fmtMoney(detail.KdvTutar)}</b></span>
              <span>Genel Toplam: <b>{fmtMoney(detail.GenelToplam)} TRY</b></span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)",
  zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: "28px 16px", overflow: "auto",
};

const modalStyle: CSSProperties = {
  width: "min(1180px, 100%)", background: "var(--color-surface)", borderRadius: 8,
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)", padding: 20,
};

const modalHeaderStyle: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  paddingBottom: 14, borderBottom: "1px solid var(--color-border-light)", marginBottom: 14,
};

const gridStyle: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: 12,
};

const fieldStyle: CSSProperties = {
  display: "flex", flexDirection: "column", gap: 6, fontSize: 12,
  color: "var(--color-text-secondary)", fontWeight: 600,
};

const dropdownStyle: CSSProperties = {
  position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0,
  maxHeight: 220, overflow: "auto", background: "var(--color-surface)",
  border: "1px solid var(--color-border)", borderRadius: 6,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
};

const dropdownItemStyle: CSSProperties = {
  display: "block", width: "100%", border: "none", background: "transparent",
  padding: "9px 10px", textAlign: "left", cursor: "pointer",
};

const summaryStyle: CSSProperties = {
  display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 18,
  marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border-light)",
};
