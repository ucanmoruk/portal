"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type PurchaseRow = {
  id: number;
  stokId: number | null;
  stokKod: string;
  malzemeAdi: string;
  talepId: number;
  talepNo: string;
  miktar: number;
  birim: string;
  tedarikci: string;
  satinAlmaTarihi: string | null;
  birimFiyat: number | null;
  paraBirimi: string;
  toplamTutar: number | null;
  faturaNo: string;
  satinAlanAd: string;
};

function dateFmt(value: string | null) {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function money(value: number | null, currency: string) {
  if (value == null) return "-";
  return `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency || "TRY"}`;
}

export default function SatinAlmaGecmisiClient() {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search, page: String(page), limit: "25" });
      const response = await fetch(`/api/kys/satin-almalar?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Satın alma geçmişi alınamadı.");
      setRows(json.data || []);
      setTotal(Number(json.total || 0));
      setTotalPages(Number(json.totalPages || 1));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Satın alma geçmişi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  function onSearch(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPage(1), 250);
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>⌕</span>
            <input className={styles.searchInput} value={search} onChange={event => onSearch(event.target.value)} placeholder="Stok kodu, malzeme, tedarikçi, talep veya fatura ara..." />
          </div>
          <span className={styles.totalCount}>{total} satın alma kaydı</span>
        </div>
      </div>
      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead><tr><th>Tarih</th><th>Stok</th><th>Malzeme</th><th>Tedarikçi</th><th>Miktar</th><th>Birim fiyat</th><th>Toplam</th><th>Fatura no</th><th>Talep</th><th>Kaydeden</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={10}><div className={styles.skeleton} /></td></tr> : rows.length === 0 ? (
                <tr><td colSpan={10}><div className={styles.empty}>Satın alma kaydı bulunamadı.</div></td></tr>
              ) : rows.map(row => (
                <tr key={row.id}>
                  <td>{dateFmt(row.satinAlmaTarihi)}</td>
                  <td>{row.stokId ? <Link href={`/laboratuvar/kys/stok-listesi/${row.stokId}`} className={styles.tdMono}>{row.stokKod || `#${row.stokId}`}</Link> : (row.stokKod || "-")}</td>
                  <td className={styles.tdName}>{row.malzemeAdi}</td>
                  <td>{row.tedarikci || "-"}</td>
                  <td>{row.miktar.toLocaleString("tr-TR")} {row.birim}</td>
                  <td>{money(row.birimFiyat, row.paraBirimi)}</td>
                  <td><strong>{money(row.toplamTutar, row.paraBirimi)}</strong></td>
                  <td className={styles.tdMono}>{row.faturaNo || "-"}</td>
                  <td><Link className={kys.purchaseLink} href={`/laboratuvar/kys/talep-listesi/${row.talepId}`}>{row.talepNo}</Link></td>
                  <td>{row.satinAlanAd || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(current => current - 1)}>‹</button>
          <span className={styles.pageInfo}>Sayfa {page} / {totalPages}</span>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>›</button>
        </div>
      </div>
    </>
  );
}
