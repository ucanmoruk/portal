"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";
import { ODEME_DURUMLARI } from "@/lib/faturaConstants";

interface FaturaRow {
  ID: number;
  ProformaNo: string | null;
  FaturaNo: string;
  Tarih: string | null;
  FirmaAd: string;
  Toplam: number | string;
  OdenenTutar: number | string | null;
  OdemeDurumu: string | null;
}

interface Summary { adet: number; toplam: number; odenen: number; }

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value || 0);
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function upperTr(value?: string | null) {
  return value ? value.toLocaleUpperCase("tr-TR") : "";
}

// Efektif tarih 'YYYY-MM-DD HH:MM:SS' (veya null) gelir → dd.MM.yyyy. Geçersizse "-".
function fmtTarih(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || m[1] === "0000") return "-";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function odemeStyle(durum: string | null): React.CSSProperties {
  const byStatus: Record<string, React.CSSProperties> = {
    "Ödeme Bekliyor": { background: "#fff7e6", color: "#a86400", borderColor: "#f5d99b" },
    "Kısmen Ödendi": { background: "#e8f1ff", color: "#0055a8", borderColor: "#b8d7ff" },
    "Ödendi": { background: "#e6f6ee", color: "#1a7f4b", borderColor: "#b8e6ce" },
    "İptal": { background: "#fdecea", color: "#c0392b", borderColor: "#f5b8b0" },
  };
  return {
    ...(byStatus[durum || ""] || { background: "#f5f5f7", color: "#6e6e73", borderColor: "#d2d2d7" }),
    borderWidth: 1, borderStyle: "solid", borderRadius: 999, fontWeight: 700, minWidth: 140,
  };
}

export default function FaturaTable() {
  const [rows, setRows] = useState<FaturaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [yil, setYil] = useState(String(new Date().getFullYear()));
  const [odeme, setOdeme] = useState("");
  const [years, setYears] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary>({ adet: 0, toplam: 0, odenen: 0 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ search, yil, odeme, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/faturalar?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fatura listesi alınamadı.");
      setRows(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
      setSummary(json.summary || { adet: 0, toplam: 0, odenen: 0 });
      if (Array.isArray(json.years) && json.years.length) setYears(json.years);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, yil, odeme, page, limit]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function updateOdeme(row: FaturaRow, odemeDurumu: string) {
    setRows(rs => rs.map(r => r.ID === row.ID ? { ...r, OdemeDurumu: odemeDurumu } : r));
    const res = await fetch(`/api/faturalar/${row.ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odemeDurumu }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Ödeme durumu güncellenemedi.");
    }
    fetchRows();
  }

  const pageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const kalan = summary.toplam - summary.odenen;

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 280 }}>
            <input
              className={styles.searchInput}
              placeholder="Fatura no, proforma, firma..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className={styles.pageSizeSelect} value={yil} onChange={e => { setYil(e.target.value); setPage(1); }}>
            <option value="">Tüm yıllar</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className={styles.pageSizeSelect} value={odeme} onChange={e => { setOdeme(e.target.value); setPage(1); }}>
            <option value="">Tüm ödeme durumları</option>
            {ODEME_DURUMLARI.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
        <div className={styles.toolbarRight}>
          <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Proforma No</th>
              <th>Fatura No</th>
              <th>Tarih</th>
              <th>Firma</th>
              <th style={{ textAlign: "right" }}>Tutar (KDV Dahil)</th>
              <th>Ödeme Durumu</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className={styles.empty}>Yükleniyor...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className={styles.empty}>Kayıt bulunamadı.</td></tr>
            ) : rows.map(row => {
              // Mevcut (legacy) durum listede yoksa seçeneğe ekle ki select doğru görünsün.
              const opts = row.OdemeDurumu && !ODEME_DURUMLARI.includes(row.OdemeDurumu)
                ? [row.OdemeDurumu, ...ODEME_DURUMLARI]
                : ODEME_DURUMLARI;
              return (
                <tr key={row.ID}>
                  <td>{row.ProformaNo || "-"}</td>
                  <td className={styles.primaryCell}>{row.FaturaNo}</td>
                  <td>{fmtTarih(row.Tarih)}</td>
                  <td>{upperTr(row.FirmaAd) || "-"}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {fmtMoney(row.Toplam)} TL
                  </td>
                  <td>
                    <select
                      value={row.OdemeDurumu || ""}
                      onChange={e => updateOdeme(row, e.target.value)}
                      className={styles.pageSizeSelect}
                      style={odemeStyle(row.OdemeDurumu)}
                    >
                      {!row.OdemeDurumu && <option value="">Fatura Kesilmedi</option>}
                      {opts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--color-border)", fontWeight: 700 }}>
                <td colSpan={4} style={{ padding: "12px 12px", color: "var(--color-text-secondary)" }}>
                  {summary.adet} fatura · Kalan: <span style={{ color: kalan > 0 ? "#c06800" : "#1a7f4b" }}>{fmtMoney(kalan)} TL</span>
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "12px 12px" }}>
                  <div>{fmtMoney(summary.toplam)} TL</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1a7f4b" }}>Ödenen: {fmtMoney(summary.odenen)} TL</div>
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          {pageNumbers().map((p, i) => p === "..." ? (
            <span key={`dots-${i}`} className={styles.pageDots}>…</span>
          ) : (
            <button
              key={p}
              className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`}
              onClick={() => setPage(p as number)}
            >{p}</button>
          ))}
          <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          <span className={styles.pageInfo}>Sayfa {page} / {totalPages}</span>
        </div>
      )}
    </>
  );
}
