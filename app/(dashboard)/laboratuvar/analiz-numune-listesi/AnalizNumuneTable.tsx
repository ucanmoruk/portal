"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import styles from "@/app/styles/table.module.css";

interface AnalizNumuneRow {
  X1ID: number;
  NkrID: number;
  HizmetKodu: string;
  HizmetAdi: string;
  Tarih: string | null;
  RaporNo: string | number | null;
  FirmaAdi: string;
  NumuneAdi: string;
}

interface ApiResponse {
  data: AnalizNumuneRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}.${m}.${y}`;
};

export default function AnalizNumuneTable() {
  const [rows, setRows] = useState<AnalizNumuneRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [hizmetKodu, setHizmetKodu] = useState("");
  const [tarihBas, setTarihBas] = useState("");
  const [tarihBit, setTarihBit] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestReq = useRef(0);

  const fetchData = useCallback(async (
    nextPage: number,
    nextLimit: number,
    nextSearch: string,
    nextHizmetKodu: string,
    nextTarihBas: string,
    nextTarihBit: string,
  ) => {
    const reqId = ++latestReq.current;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(nextLimit),
      });
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      if (nextHizmetKodu.trim()) params.set("hizmetKodu", nextHizmetKodu.trim());
      if (nextTarihBas) params.set("tarihBas", nextTarihBas);
      if (nextTarihBit) params.set("tarihBit", nextTarihBit);

      const res = await fetch(`/api/analiz-numune-listesi?${params}`, {
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (reqId !== latestReq.current) return;
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Liste alınamadı");

      const data = json as ApiResponse;
      setRows(data.data || []);
      setTotal(Number(data.total || 0));
      setTotalPages(Number(data.totalPages || 1));
    } catch (e: any) {
      if (e.name === "AbortError" || reqId !== latestReq.current) return;
      setError(e.message || "Liste alınamadı");
    } finally {
      if (reqId === latestReq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(page, limit, search, hizmetKodu, tarihBas, tarihBit);
  }, [page, limit, fetchData]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchData(1, limit, value, hizmetKodu, tarihBas, tarihBit);
    }, 300);
  };

  const applyFilters = () => {
    setPage(1);
    fetchData(1, limit, search, hizmetKodu, tarihBas, tarihBit);
  };

  const clearFilters = () => {
    setSearch("");
    setHizmetKodu("");
    setTarihBas("");
    setTarihBit("");
    setPage(1);
    fetchData(1, limit, "", "", "", "");
  };

  const pageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  };

  return (
    <>
      <div className={styles.toolbar} style={{ width: "100%", alignItems: "flex-start" }}>
        <div className={styles.toolbarLeft} style={{ minWidth: 0, flexWrap: "wrap" }}>
          <div className={styles.searchBox} style={{ width: "min(360px, 100%)", minWidth: 240 }}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Hizmet, rapor no, firma veya numune ara..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => handleSearch("")} aria-label="Aramayı temizle">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
          <input
            value={hizmetKodu}
            onChange={e => setHizmetKodu(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyFilters(); }}
            placeholder="Hizmet kodu"
            style={filterInputStyle}
          />
          <input
            type="date"
            value={tarihBas}
            onChange={e => setTarihBas(e.target.value)}
            style={filterInputStyle}
            title="Başlangıç tarihi"
          />
          <input
            type="date"
            value={tarihBit}
            onChange={e => setTarihBit(e.target.value)}
            style={filterInputStyle}
            title="Bitiş tarihi"
          />
          <button type="button" className={styles.pageSizeSelect} onClick={applyFilters} style={{ fontWeight: 600 }}>
            Filtrele
          </button>
          {(search || hizmetKodu || tarihBas || tarihBit) && (
            <button type="button" className={styles.pageSizeSelect} onClick={clearFilters}>
              Temizle
            </button>
          )}
        </div>
        <div className={styles.toolbarRight} style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className={styles.totalCount}>{total} kayıt</span>
          <select
            className={styles.pageSizeSelect}
            value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 54 }}>#</th>
                <th style={{ width: 120 }}>Hizmet Kodu</th>
                <th>Hizmet Adı</th>
                <th style={{ width: 110 }}>Tarih</th>
                <th style={{ width: 130 }}>Rapor No</th>
                <th>Firma Adı</th>
                <th>Numune Adı</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><span className={styles.skeleton} /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.empty}>
                      Kayıt bulunamadı.
                    </div>
                  </td>
                </tr>
              ) : rows.map((row, i) => (
                <tr key={row.X1ID}>
                  <td className={styles.tdNum}>{(page - 1) * limit + i + 1}</td>
                  <td className={styles.tdMono} style={{ fontWeight: 700 }}>{row.HizmetKodu || "-"}</td>
                  <td className={styles.tdName}>{row.HizmetAdi || "-"}</td>
                  <td className={styles.tdMono}>{formatDate(row.Tarih)}</td>
                  <td className={styles.tdMono}>
                    {row.RaporNo ? (
                      <a
                        href={`/laboratuvar/numune-form/${row.NkrID}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--color-accent)", textDecoration: "none", fontWeight: 700 }}
                      >
                        {row.RaporNo}
                      </a>
                    ) : "-"}
                  </td>
                  <td className={styles.tdSecondary}>{row.FirmaAdi || "-"}</td>
                  <td>{row.NumuneAdi || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            {pageNumbers().map((p, i) => p === "..." ? (
              <span key={`dots-${i}`} className={styles.pageDots}>...</span>
            ) : (
              <button
                key={p}
                className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`}
                onClick={() => setPage(p as number)}
              >
                {p}
              </button>
            ))}
            <button className={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
            <span className={styles.pageInfo}>Sayfa {page} / {totalPages}</span>
          </div>
        )}
      </div>
    </>
  );
}

const filterInputStyle: CSSProperties = {
  height: 34,
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  padding: "0 10px",
  fontSize: "0.8rem",
  fontFamily: "inherit",
  outline: "none",
};
