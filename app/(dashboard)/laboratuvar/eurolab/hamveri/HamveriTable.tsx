"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/app/styles/table.module.css";

interface RawdataRow {
  id: number;
  code: string;
  sample_name: string;
  standard: string;
  toy_category: string | null;
  age_group: string | null;
  status: string;
  created_at: string | null;
}

interface RawdataResponse {
  rows: RawdataRow[];
  total: number;
  page: number;
  pageSize: number;
}

const buildPages = (page: number, pageCount: number) => {
  const pages: Array<number | "..."> = [];
  for (let i = 1; i <= pageCount; i += 1) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "...") pages.push("...");
  }
  return pages;
};

const formatDate = (date: string | null) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("tr-TR");
};

export default function HamveriTable() {
  const [rows, setRows] = useState<RawdataRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pages = useMemo(() => buildPages(page, pageCount), [page, pageCount]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search, page: String(page), pageSize: String(pageSize) });
      const res = await fetch(`/api/eurolab/rawdata?${params.toString()}`, { credentials: "same-origin" });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Eurolab hamveri servisi oturum veya bağlantı yanıtı döndürmedi.");
      }
      const json: RawdataResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error || "Hamveri kayıtları alınamadı.");
      setRows(json.rows || []);
      setTotal(json.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.473 9.764l2.631 2.632a.75.75 0 1 0 1.061-1.061l-2.632-2.631A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
            </svg>
            <input
              className={styles.searchInput}
              placeholder="Rapor no, ürün adı, standart veya kategori ara..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && <button className={styles.searchClear} onClick={() => setSearch("")}>×</button>}
          </div>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>

        <div className={styles.toolbarRight}>
          <select className={styles.pageSizeSelect} value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <Link className={styles.addBtn} href="/laboratuvar/eurolab/hamveri/yeni">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Yeni Hamveri
          </Link>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>Rapor No</th>
                <th>Ürün Adı</th>
                <th style={{ width: 140 }}>Standart</th>
                <th style={{ width: 170 }}>Kategori</th>
                <th style={{ width: 130 }}>Yaş Grubu</th>
                <th style={{ width: 120 }}>Test Durumu</th>
                <th style={{ width: 110 }}>Tarih</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td><div className={styles.skeleton} /></td>
                    <td><div className={styles.skeleton} /></td>
                    <td><div className={styles.skeleton} /></td>
                    <td><div className={styles.skeleton} /></td>
                    <td><div className={styles.skeleton} /></td>
                    <td><div className={styles.skeleton} /></td>
                    <td><div className={styles.skeleton} /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.empty}>
                      <p>Hamveri kaydı bulunamadı.</p>
                      <Link className={styles.addBtn} href="/laboratuvar/eurolab/hamveri/yeni">İlk hamveriyi oluştur</Link>
                    </div>
                  </td>
                </tr>
              ) : rows.map(row => (
                <tr key={row.id}>
                  <td className={styles.tdMono}>{row.code}</td>
                  <td className={styles.tdName}>{row.sample_name}</td>
                  <td>{row.standard}</td>
                  <td>{row.toy_category || "—"}</td>
                  <td>{row.age_group || "—"}</td>
                  <td><span className={styles.badge}>{row.status}</span></td>
                  <td>{formatDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <button className={styles.pageBtn} onClick={() => setPage(page - 1)} disabled={page <= 1}>‹</button>
          {pages.map((item, index) => item === "..." ? (
            <span key={`dots-${index}`} className={styles.pageDots}>...</span>
          ) : (
            <button
              key={item}
              className={`${styles.pageBtn} ${item === page ? styles.pageBtnActive : ""}`}
              onClick={() => setPage(item)}
            >
              {item}
            </button>
          ))}
          <button className={styles.pageBtn} onClick={() => setPage(page + 1)} disabled={page >= pageCount}>›</button>
          <span className={styles.pageInfo}>Sayfa {page} / {pageCount}</span>
        </div>
      </div>
    </>
  );
}
