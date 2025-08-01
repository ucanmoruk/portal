"use client";

import { useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";

type LogRow = {
  LogID: string;
  NkrID: number;
  RaporFormati: string | null;
  EvrakNo: string | null;
  FirmaAdi: string | null;
  MailAdresi: string;
  GonderimTarihi: string | null;
  Durum: "Gönderiliyor" | "Başarılı" | "Başarısız" | string;
  Aciklama: string | null;
  Gonderen: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}${match[4] ? ` ${match[4]}:${match[5] || "00"}` : ""}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("tr-TR");
}

function statusColor(status: string) {
  if (status === "Başarılı") return { background: "#34c75918", color: "#248a3d" };
  if (status === "Başarısız") return { background: "#ff3b3018", color: "#c00" };
  return { background: "#ff950018", color: "#a55d00" };
}

export default function RaporMailLogTable() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), limit: "25", search, status });
        const response = await fetch(`/api/rapor-takip/mail-log?${params}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Loglar yüklenemedi.");
        if (!cancelled) {
          setRows(payload.data || []);
          setTotal(Number(payload.total || 0));
          setTotalPages(Number(payload.totalPages || 1));
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Loglar yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [page, search, status]);

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <input
            className={styles.searchInput}
            style={{ width: "min(420px, 100%)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "9px 12px", background: "var(--color-surface)" }}
            value={search}
            placeholder="Evrak no, firma veya mail adresi ara…"
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          />
          <select
            value={status}
            onChange={(event) => { setStatus(event.target.value); setPage(1); }}
            aria-label="Gönderim durumu"
            style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "9px 12px", background: "var(--color-surface)", color: "var(--color-text-primary)" }}
          >
            <option value="">Tüm durumlar</option>
            <option value="Başarılı">Başarılı</option>
            <option value="Başarısız">Başarısız</option>
            <option value="Gönderiliyor">Gönderiliyor</option>
          </select>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
      </div>

      {error && <div role="alert" style={{ color: "#c00", padding: 12 }}>{error}</div>}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Evrak No</th><th>Firma Adı</th><th>Mail Adresi</th><th>Gönderim Tarihi</th><th>Durum</th><th>Detay</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 28 }}>Yükleniyor…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--color-text-secondary)" }}>Henüz rapor mail gönderim kaydı yok.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.LogID}>
                <td style={{ fontWeight: 600 }}>{row.EvrakNo || `NKR ${row.NkrID}`}</td>
                <td>{row.FirmaAdi || "—"}</td>
                <td style={{ minWidth: 220, overflowWrap: "anywhere" }}>{row.MailAdresi}</td>
                <td style={{ whiteSpace: "nowrap" }}>{formatDate(row.GonderimTarihi)}</td>
                <td><span style={{ ...statusColor(row.Durum), display: "inline-block", padding: "3px 9px", borderRadius: 12, fontSize: ".75rem", fontWeight: 700, whiteSpace: "nowrap" }}>{row.Durum}</span></td>
                <td style={{ minWidth: 160, fontSize: ".78rem", color: "var(--color-text-secondary)" }}>
                  <div>{row.Aciklama || row.RaporFormati || "—"}</div>
                  {row.Gonderen && <div style={{ marginTop: 3 }}>Gönderen: {row.Gonderen}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>‹</button>
          <span className={styles.pageInfo}>{page} / {totalPages}</span>
          <button className={styles.pageBtn} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading}>›</button>
        </div>
      )}
    </div>
  );
}
