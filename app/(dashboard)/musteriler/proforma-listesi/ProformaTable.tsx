"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

const DURUMLAR = ["Taslak", "Gönderildi", "Onaylandı", "İptal"];

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value || 0);
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProformaTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<ProformaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLines, setDetailLines] = useState<any[]>([]);

  useEffect(() => {
    const evrakNo = searchParams.get("evrakNo");
    const teklifId = searchParams.get("teklifId");
    if (!evrakNo) return;
    const qs = new URLSearchParams({ evrakNo });
    if (teklifId) qs.set("teklifId", teklifId);
    router.replace(`/musteriler/proforma-listesi/yeni?${qs.toString()}`);
  }, [router, searchParams]);

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

  async function openDetail(id: number) {
    const res = await fetch(`/api/proformalar/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Proforma açılamadı.");
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
    const res = await fetch(`/api/proformalar/${detail.ID}/mail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: detail.FirmaEmail, subject: detail.ProformaNo }),
    });
    const json = await res.json().catch(() => ({}));
    alert(res.ok ? "Mail gönderim isteği oluşturuldu." : (json.error || "Mail gönderilemedi."));
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 320 }}>
            <input
              className={styles.searchInput}
              placeholder="Proforma, evrak no, firma..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
        <div className={styles.toolbarRight}>
          <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
          <button className={styles.addBtn} onClick={() => router.push("/musteriler/proforma-listesi/yeni")}>Yeni Proforma</button>
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
                <td>
                  <div className={styles.actionBtns} style={{ justifyContent: "flex-end" }}>
                    <button className={styles.cancelBtn} onClick={() => router.push(`/musteriler/proforma-listesi/${row.ID}/duzenle`)}>Düzenle</button>
                    <button className={styles.saveBtn} onClick={() => openDetail(row.ID)}>Önizleme</button>
                  </div>
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

      {detail && (
        <div style={overlayStyle}>
          <div style={modalStyle} id="proforma-print-area">
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{detail.ProformaNo}</h2>
                <p style={{ margin: "4px 0 0", color: "var(--color-text-secondary)" }}>
                  {detail.FirmaAd} {detail.EvrakNo ? `- Evrak ${detail.EvrakNo}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className={styles.cancelBtn} onClick={() => window.print()}>Yazdır</button>
                <button className={styles.cancelBtn} onClick={sendMail}>Mail Gönder</button>
                <button className={styles.saveBtn} onClick={() => setDetail(null)}>Kapat</button>
              </div>
            </div>
            <table className={styles.table}>
              <thead><tr><th>Hizmet</th><th>Adet</th><th>Birim</th><th>İsk.</th><th>Tutar</th></tr></thead>
              <tbody>
                {detailLines.map(line => (
                  <tr key={line.ID}>
                    <td>{line.HizmetAdi}</td>
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

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)",
  zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: "28px 16px", overflow: "auto",
};

const modalStyle: React.CSSProperties = {
  width: "min(980px, 100%)", background: "var(--color-surface)", borderRadius: 8,
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)", padding: 20,
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  paddingBottom: 14, borderBottom: "1px solid var(--color-border-light)", marginBottom: 14,
  flexWrap: "wrap",
};

const summaryStyle: React.CSSProperties = {
  display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 18,
  marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border-light)",
};
