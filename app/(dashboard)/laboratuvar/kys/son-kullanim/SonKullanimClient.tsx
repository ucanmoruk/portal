"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type Row = { id: number; stokId: number; kod: string; ad: string; marka: string; lot: string; miktar: number; birim: string; skt: string | null };
const errorMessage = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

function dateFmt(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

function daysLeft(value?: string | null) {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

const pageNums = (page: number, totalPages: number) => {
  const nums: Array<number | "..."> = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return nums;
};

export default function SonKullanimClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [days, setDays] = useState("180");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pages = useMemo(() => pageNums(page, totalPages), [page, totalPages]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ search, days, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/kys/son-kullanim?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Son kullanım listesi alınamadı.");
      setRows(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e: unknown) {
      setError(errorMessage(e, "Son kullanım listesi alınamadı."));
    } finally {
      setLoading(false);
    }
  }, [days, limit, page, search]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}><input className={styles.searchInput} placeholder="Kod, ad, lot veya marka ara..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
        <div className={styles.toolbarRight}>
          <select className={kys.select} value={days} onChange={e => { setDays(e.target.value); setPage(1); }}>
            <option value="30">30 gün</option><option value="60">60 gün</option><option value="90">90 gün</option><option value="180">180 gün</option><option value="365">1 yıl</option>
          </select>
          <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / sayfa</option>)}</select>
        </div>
      </div>
      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead><tr><th>SKT</th><th>Durum</th><th>Kod</th><th>Malzeme</th><th>Marka</th><th>Lot</th><th>Miktar</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8}><div className={styles.skeleton} /></td></tr> : rows.length === 0 ? <tr><td colSpan={8}><div className={styles.empty}>SKT kaydı yok.</div></td></tr> : rows.map(row => {
                const left = daysLeft(row.skt);
                const danger = left !== null && left < 0;
                const warn = left !== null && left >= 0 && left <= 30;
                return (
                  <tr key={row.id}>
                    <td className={styles.tdMono}>{dateFmt(row.skt)}</td>
                    <td><span className={`${kys.pill} ${danger ? kys.pillDanger : warn ? kys.pillWarn : kys.pillOk}`}>{danger ? "Süresi geçti" : `${left} gün`}</span></td>
                    <td className={styles.tdMono}>{row.kod}</td>
                    <td className={styles.tdName}>{row.ad}</td>
                    <td>{row.marka || "-"}</td>
                    <td className={styles.tdMono}>{row.lot || "-"}</td>
                    <td>{row.miktar} {row.birim}</td>
                    <td><Link className={styles.editBtn} href={`/laboratuvar/kys/stok-listesi/${row.stokId}`}>i</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          {pages.map((p, i) => p === "..." ? <span className={styles.pageDots} key={i}>...</span> : <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`} onClick={() => setPage(p)}>{p}</button>)}
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      </div>
    </>
  );
}
