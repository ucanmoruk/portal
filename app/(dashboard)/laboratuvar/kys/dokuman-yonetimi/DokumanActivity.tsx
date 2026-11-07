"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { History, RotateCw, Search, X } from "lucide-react";
import table from "@/app/styles/table.module.css";
import kys from "../kys.module.css";
import styles from "./dokumanYonetimi.module.css";
import { formatDateTime } from "./dokumanTypes";

type Entry = { id: number; dokumanId: number; kod: string; baslik: string; islem: string; revizyon: number | null; oncekiDurum: string; yeniDurum: string; aciklama: string; kullaniciAd: string; tarih: string | null };
const ISLEMLER = ["Oluşturuldu", "Dosya yüklendi", "Kaydedildi", "Onaya gönderildi", "Kontrol onayı verildi", "Yayına alındı", "Revizyon başlatıldı", "Revizyona geri gönderildi", "Geçmiş revizyon eklendi", "Revizyon geçmişi düzenlendi", "Revizyon silindi", "Arşive alındı", "Arşivden çıkarıldı", "Güncellendi", "Silindi"];

export default function DokumanActivity() {
  const [search, setSearch] = useState("");
  const [islem, setIslem] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/kys/dokumanlar/activity?${new URLSearchParams({ search, islem, page: String(page) })}`, { signal: controller.signal });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Kayıtlar alınamadı.");
        setData(result.data || []);
        setTotal(result.total || 0);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Kayıtlar alınamadı.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, islem, page, refresh]);

  return (
    <section className={styles.listCard} aria-labelledby="activity-title" aria-busy={loading}>
      <div className={styles.panelHeader}>
        <div><h2 id="activity-title">Değişiklik Kayıtları</h2><p>Dokümanların oluşturulma, düzenleme, revizyon ve onay geçmişini takip edin.</p></div>
        <button type="button" className={styles.ghostButton} disabled={loading} onClick={() => setRefresh(value => value + 1)}><RotateCw size={15} />Yenile</button>
      </div>
      <div className={styles.panelFilters}>
        <div className={table.searchBox}>
          <Search size={15} className={table.searchIcon} />
          <input aria-label="Kayıtlarda ara" placeholder="Kod, doküman, işlem veya kişi ara…" className={table.searchInput} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          {search && <button type="button" className={table.searchClear} aria-label="Aramayı temizle" onClick={() => { setSearch(""); setPage(1); }}><X size={14} /></button>}
        </div>
        <select className={kys.select} aria-label="İşlem türü" value={islem} onChange={e => { setIslem(e.target.value); setPage(1); }}><option value="">Tüm işlemler</option>{ISLEMLER.map(i => <option key={i} value={i}>{i}</option>)}</select>
        <span className={table.totalCount} aria-live="polite">{total} kayıt</span>
        {(search || islem) && <button type="button" className={table.filterBadge} onClick={() => { setSearch(""); setIslem(""); setPage(1); }}>Filtreleri temizle</button>}
      </div>
      {error && <div className={table.errorBar} role="alert">{error}</div>}
      <div className={table.tableCard}>
        <div className={table.tableWrapper}>
          <table className={`${table.table} ${styles.activityTable}`}>
            <thead><tr>{["Tarih", "Doküman", "İşlem", "Rev.", "Durum Değişikliği", "İşlemi Yapan", "Açıklama"].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7}><div className={styles.relationEmpty} role="status">Kayıtlar yükleniyor…</div></td></tr> : error ? <tr><td colSpan={7}><div className={styles.relationEmpty}>Kayıtlar yüklenemedi. Yenile düğmesiyle tekrar deneyin.</div></td></tr> : data.length ? data.map(row => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.tarih)}</td>
                  <td>{row.kod ? <div className={styles.activityDocument}><Link href={`/laboratuvar/kys/dokuman-yonetimi/${row.dokumanId}`}>{row.kod}</Link><span>{row.baslik}</span></div> : <span title="Doküman silinmiş">{row.islem === "Silindi" ? row.aciklama.split(" — ")[0] : `#${row.dokumanId}`} <small>(silinmiş)</small></span>}</td>
                  <td><span className={styles.activityAction}>{row.islem}</span></td>
                  <td>{row.revizyon == null ? "-" : String(row.revizyon).padStart(2, "0")}</td>
                  <td>{[row.oncekiDurum, row.yeniDurum].filter(Boolean).join(" → ") || "-"}</td>
                  <td>{row.kullaniciAd || "-"}</td>
                  <td>{row.aciklama || "-"}</td>
                </tr>
              )) : <tr><td colSpan={7}><div className={styles.relationEmpty}><History size={24} /><strong>Kayıt bulunamadı</strong><span>{search || islem ? "Arama veya işlem filtresini değiştirmeyi deneyin." : "Doküman işlemleri burada listelenecek."}</span></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className={table.pagination}>
          <button type="button" className={table.pageBtn} disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>Önceki</button>
          <span className={table.pageInfo}>{page} / {Math.max(1, Math.ceil(total / 25))} · {total} kayıt</span>
          <button type="button" className={table.pageBtn} disabled={page * 25 >= total || loading} onClick={() => setPage(p => p + 1)}>Sonraki</button>
        </div>
      </div>
    </section>
  );
}
