"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import styles from "@/app/styles/table.module.css";

type QcCardRow = {
  id: number;
  code: string;
  card_type: string;
  validation_code: string;
  method_name: string;
  component_name: string;
  lower_limit: number;
  center_line: number;
  upper_limit: number;
  unit: string | null;
  created_at: string;
  updated_at: string;
};

const formatDate = (date: string) =>
  date ? new Date(date).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : "-";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function QcCardsPage() {
  const [rows, setRows] = useState<QcCardRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const loadCards = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        const res = await fetch(`/api/eurolab/qc-cards?${params.toString()}`, { credentials: "same-origin" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "QC kartları alınamadı.");
        if (alive) setRows(json);
      } catch (err: unknown) {
        if (alive) setError(getErrorMessage(err, "QC kartları alınamadı."));
      } finally {
        if (alive) setLoading(false);
      }
    };

    const timer = window.setTimeout(loadCards, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [currentPage, pageSize, rows]);

  const pageNums = () => {
    const nums: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i);
    } else {
      nums.push(1);
      if (currentPage > 3) nums.push("...");
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) nums.push(i);
      if (currentPage < totalPages - 2) nums.push("...");
      nums.push(totalPages);
    }
    return nums;
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>QC Kartlar</h1>
          <p className={styles.pageSubtitle}>Validasyon geri kazanım verilerinden oluşturulan kalite kontrol kartları.</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 340 }}>
            <Search className={styles.searchIcon} size={15} />
            <input
              className={styles.searchInput}
              placeholder="Kart kodu, validasyon, metot, alt etken madde..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => setSearch("")}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
          <span className={styles.totalCount}>{rows.length} kart</span>
        </div>
        <div className={styles.toolbarRight}>
          <select className={styles.pageSizeSelect} value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
            {[10, 20, 50].map(size => <option key={size} value={size}>{size} / sayfa</option>)}
          </select>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>Kart No</th>
                <th style={{ width: 120 }}>Validasyon</th>
                <th>Metot</th>
                <th style={{ width: 180 }}>Alt Etken Madde</th>
                <th style={{ width: 90 }}>Tip</th>
                <th style={{ width: 180 }}>Aralık</th>
                <th style={{ width: 120 }}>Oluşturma</th>
                <th style={{ width: 120 }}>Güncelleme</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr key={rowIndex}>
                    {Array.from({ length: 9 }).map((__, cellIndex) => (
                      <td key={cellIndex}><div className={styles.skeleton} /></td>
                    ))}
                  </tr>
                ))
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className={styles.empty}>QC kart bulunamadı.</div>
                  </td>
                </tr>
              ) : pagedRows.map(row => (
                <tr key={row.id}>
                  <td className={styles.tdMono}>
                    <Link className="text-blue-600 hover:underline font-semibold" href={`/laboratuvar/eurolab/qc-kartlar/${row.id}`}>
                      {row.code}
                    </Link>
                  </td>
                  <td className={styles.tdMono}>{row.validation_code}</td>
                  <td className={styles.tdName}>{row.method_name || "-"}</td>
                  <td>{row.component_name}</td>
                  <td>{row.card_type === "RANGE" ? "Range" : row.card_type}</td>
                  <td className={styles.tdMono}>{formatNumber(row.lower_limit)} - {formatNumber(row.upper_limit)}%</td>
                  <td className={styles.tdMono}>{formatDate(row.created_at)}</td>
                  <td className={styles.tdMono}>{formatDate(row.updated_at)}</td>
                  <td>
                    <Link href={`/laboratuvar/eurolab/qc-kartlar/${row.id}`}>
                      <button className={styles.editBtn} title="QC karta gir">
                        <ExternalLink size={14} />
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <button className={styles.pageBtn} onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>‹</button>
          {pageNums().map((num, index) => (
            num === "..."
              ? <span key={`dots-${index}`} className={styles.pageDots}>...</span>
              : <button key={num} className={`${styles.pageBtn} ${num === currentPage ? styles.pageBtnActive : ""}`} onClick={() => setPage(num)}>{num}</button>
          ))}
          <button className={styles.pageBtn} onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>›</button>
          <span className={styles.pageInfo}>Sayfa {currentPage}/{totalPages}</span>
        </div>
      </div>
    </div>
  );
}
