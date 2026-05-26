"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import styles from "@/app/styles/table.module.css";

interface Row {
  UrunID: number;
  RaporNo: string;
  UrunAdi: string;
  INCIName: string;
  Yuzde: string;
}

interface ApiResp {
  data: Row[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function FormulHammaddeTable() {
  const [data, setData] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (s: string, p: number, l: number) => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ search: s, page: String(p), limit: String(l) });
      const res = await fetch(`/api/ugd/formul-hammadde?${qs}`, { credentials: "same-origin" });
      const json: ApiResp = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error || "Liste alınamadı");
      setData(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  // Search debounce + reset page
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchData(search, 1, limit);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    fetchData(search, page, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  const fmtPct = (v: string) => {
    const n = Number(String(v ?? "").replace(",", "."));
    if (!Number.isFinite(n)) return v || "—";
    return n.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
  };

  const pageNumbers = useMemo(() => {
    const arr: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 360 }}>
            <Search className={styles.searchIcon} size={15} />
            <input
              className={styles.searchInput}
              placeholder="Rapor No, ürün adı veya INCI adı ile ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => setSearch("")} aria-label="Aramayı temizle">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
        <div className={styles.toolbarRight}>
          <select
            className={styles.pageSizeSelect}
            value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
            aria-label="Sayfa boyutu"
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
                <th style={{ width: 160 }}>Rapor No</th>
                <th>Ürün Adı</th>
                <th>Formül Bileşeni (INCI)</th>
                <th style={{ width: 120, textAlign: "right" }}>Yüzde (%)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j}><div className={styles.skeleton} /></td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className={styles.empty}>
                      <p>{search ? `"${search}" için kayıt bulunamadı.` : "Henüz formül kaydı yok."}</p>
                    </div>
                  </td>
                </tr>
              ) : data.map((row, i) => (
                <tr key={`${row.UrunID}-${i}`}>
                  <td className={styles.tdMono}>
                    <Link
                      href={`/ugd/urun-listesi/${row.UrunID}/duzenle`}
                      style={{ color: "var(--color-accent)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}
                    >
                      {row.RaporNo || `#${row.UrunID}`}
                    </Link>
                  </td>
                  <td className={styles.tdName}>{row.UrunAdi || "—"}</td>
                  <td>{row.INCIName || "—"}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtPct(row.Yuzde)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >← Önceki</button>
            {pageNumbers.map(n => (
              <button
                key={n}
                className={`${styles.pageBtn} ${n === page ? styles.pageBtnActive : ""}`}
                onClick={() => setPage(n)}
                disabled={loading}
              >{n}</button>
            ))}
            <button
              className={styles.pageBtn}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >Sonraki →</button>
          </div>
        )}
      </div>
    </>
  );
}
