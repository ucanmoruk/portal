"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, FilePlus2, FileText, RotateCw, Search, X } from "lucide-react";
import tableStyles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";
import styles from "../dokuman-yonetimi/dokumanYonetimi.module.css";

type Row = {
  id: number;
  akreditasyon: boolean;
  dokumanKodu: string;
  dokumanAdi: string;
  yayincisi: string;
  yayinTarihi: string;
  yayinLinki: string;
  pdfPath: string;
  pdfOriginalName: string;
  kontrolEdildi: boolean;
  kontrolTarihi: string | null;
  kontrolEdenAd: string;
  updatedAt: string | null;
};

const emptyForm = {
  akreditasyon: "0",
  dokumanKodu: "",
  dokumanAdi: "",
  yayincisi: "",
  yayinTarihi: "",
  yayinLinki: "",
};

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export default function DisKaynakliDokumanClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [canCheck, setCanCheck] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [akreditasyon, setAkreditasyon] = useState("");
  const [kontrol, setKontrol] = useState("");
  const [sort, setSort] = useState("guncel");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, akreditasyon, kontrol, sort, limit]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        akreditasyon,
        kontrol,
        sort,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/kys/dis-kaynakli-dokumanlar?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Dış kaynaklı doküman listesi alınamadı.");
      setRows(json.data || []);
      setCanCheck(Boolean(json.yetki?.kontrol));
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
      setSelected([]);
    } catch (e: unknown) {
      setError(errorMessage(e, "Dış kaynaklı doküman listesi alınamadı."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [akreditasyon, kontrol, debouncedSearch, limit, page, sort]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, saving]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleIds = useMemo(() => rows.map(row => row.id), [rows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedSet.has(id));
  const filtreAktif = Boolean(debouncedSearch || akreditasyon || kontrol);

  function toggleSelected(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  }

  function toggleAllVisible() {
    setSelected(prev => {
      const current = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach(id => current.delete(id));
      else visibleIds.forEach(id => current.add(id));
      return Array.from(current);
    });
  }

  function openAdd() {
    setForm(emptyForm);
    setPdfFile(null);
    setFormError("");
    setModalOpen(true);
  }

  async function save() {
    if (!form.dokumanKodu.trim() || !form.dokumanAdi.trim()) {
      setFormError("Doküman kodu ve doküman adı zorunludur.");
      return;
    }
    if (!pdfFile) {
      setFormError("PDF dosyası seçilmelidir.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => fd.append(key, value));
      fd.append("pdf", pdfFile);
      const res = await fetch("/api/kys/dis-kaynakli-dokumanlar", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Doküman kaydedilemedi.");
      setModalOpen(false);
      await fetchRows();
    } catch (e: unknown) {
      setFormError(errorMessage(e, "Doküman kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  }

  async function markChecked() {
    if (!selected.length) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/kys/dis-kaynakli-dokumanlar/kontrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kontrol kaydı oluşturulamadı.");
      await fetchRows();
    } catch (e: unknown) {
      setError(errorMessage(e, "Kontrol kaydı oluşturulamadı."));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={styles.listShell}>
      <div className={styles.listCard}>
        <div className={tableStyles.toolbar}>
          <div className={tableStyles.toolbarLeft}>
            <div className={tableStyles.searchBox}>
              <Search size={15} className={tableStyles.searchIcon} />
              <input
                className={tableStyles.searchInput}
                placeholder="Kod, doküman adı veya yayıncı ara..."
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
              {search && (
                <button type="button" className={tableStyles.searchClear} onClick={() => setSearch("")} aria-label="Aramayı temizle">
                  <X size={14} />
                </button>
              )}
            </div>
            <span className={tableStyles.totalCount}>{total} kayıt</span>
            {filtreAktif && (
              <button type="button" className={tableStyles.filterBadge} onClick={() => { setSearch(""); setAkreditasyon(""); setKontrol(""); }}>
                Filtreleri temizle
              </button>
            )}
          </div>
          <div className={tableStyles.toolbarRight}>
            {canCheck && (
              <button type="button" className={styles.ghostButton} disabled={!selected.length || checking} onClick={() => void markChecked()}>
                <CheckCircle2 size={15} />
                Kontrol edildi
              </button>
            )}
            <button type="button" className={styles.ghostButton} onClick={() => void fetchRows()} title="Yenile">
              <RotateCw size={15} />
              Yenile
            </button>
            <button className={tableStyles.addBtn} type="button" onClick={openAdd}>
              <FilePlus2 size={16} />
              PDF yükle
            </button>
          </div>
        </div>

        <div className={kys.filterRow}>
          <select className={kys.select} value={akreditasyon} onChange={event => setAkreditasyon(event.target.value)}>
            <option value="">Akreditasyon: Tümü</option>
            <option value="var">Var</option>
            <option value="yok">Yok</option>
          </select>
          <select className={kys.select} value={kontrol} onChange={event => setKontrol(event.target.value)}>
            <option value="">Kontrol: Tümü</option>
            <option value="edildi">Kontrol edildi</option>
            <option value="bekliyor">Kontrol bekliyor</option>
          </select>
          <select className={kys.select} value={sort} onChange={event => setSort(event.target.value)}>
            <option value="guncel">Son güncellenen</option>
            <option value="kod-asc">Koda göre</option>
            <option value="ad-asc">Ada göre</option>
            <option value="kontrol-desc">Kontrol tarihine göre</option>
          </select>
          <select className={tableStyles.pageSizeSelect} value={limit} onChange={event => setLimit(Number(event.target.value))}>
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>

        <div className={tableStyles.tableCard}>
          {error && <div className={tableStyles.errorBar}>{error}</div>}
          <div className={tableStyles.tableWrapper}>
            <table className={`${tableStyles.table} ${styles.documentTable}`}>
              <thead>
                <tr>
                  <th style={{ width: 42 }}>
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Tümünü seç" />
                  </th>
                  <th style={{ width: 56, textAlign: "center" }} title="Akreditasyon">*</th>
                  <th style={{ width: 150 }}>Doküman Kodu</th>
                  <th>Doküman Adı</th>
                  <th style={{ width: 170 }}>Yayıncısı</th>
                  <th style={{ width: 120 }}>Yayın Tarihi</th>
                  <th style={{ width: 90 }}>Kaynak</th>
                  <th style={{ width: 210 }}>Kontrol Kaydı</th>
                  <th style={{ width: 72 }} aria-label="Önizleme" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`sk-${index}`}><td colSpan={9}><div className={tableStyles.skeleton} /></td></tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className={tableStyles.empty}>
                        {filtreAktif ? "Filtrelere uyan kayıt bulunamadı." : "Henüz dış kaynaklı doküman yok. PDF yükle ile ilk kaydı oluşturun."}
                      </div>
                    </td>
                  </tr>
                ) : rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        aria-label={`${row.dokumanKodu} seç`}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {row.akreditasyon ? <span className={tableStyles.required} title="Akreditasyon var">*</span> : "-"}
                    </td>
                    <td className={tableStyles.tdMono}>{row.dokumanKodu}</td>
                    <td className={tableStyles.tdName}>
                      <span className={styles.documentTitleLink}>{row.dokumanAdi}</span>
                    </td>
                    <td>{row.yayincisi || "-"}</td>
                    <td className={tableStyles.tdMono}>{row.yayinTarihi || "-"}</td>
                    <td>
                      {row.yayinLinki ? (
                        <a href={row.yayinLinki} target="_blank" rel="noopener noreferrer" className={styles.documentCodeLink}>Kaynak</a>
                      ) : "-"}
                    </td>
                    <td className={tableStyles.tdSecondary}>
                      {row.kontrolEdildi ? (
                        <>
                          <span className={`${styles.statusPill} ${styles.statusLive}`}>Kontrol edildi</span>
                          <span className={styles.documentSubText}>{formatDateTime(row.kontrolTarihi)} · {row.kontrolEdenAd || "-"}</span>
                        </>
                      ) : (
                        <span className={`${styles.statusPill} ${styles.statusWaiting}`}>Bekliyor</span>
                      )}
                    </td>
                    <td>
                      {row.pdfPath ? (
                        <a
                          href={row.pdfPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={tableStyles.editBtn}
                          title="PDF önizleme"
                        >
                          <FileText size={15} />
                          <ArrowUpRight size={13} />
                        </a>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={tableStyles.pagination}>
              <button type="button" className={tableStyles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Önceki</button>
              <span className={tableStyles.pageInfo}>{page} / {totalPages}</span>
              <button type="button" className={tableStyles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sonraki</button>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className={tableStyles.modalOverlay} role="dialog" aria-modal="true" aria-label="Dış kaynaklı doküman yükle">
          <div className={tableStyles.modal}>
            <div className={tableStyles.modalHeader}>
              <h2>Dış kaynaklı doküman yükle</h2>
              <button type="button" className={tableStyles.modalClose} onClick={() => setModalOpen(false)} aria-label="Kapat">×</button>
            </div>
            <div className={tableStyles.modalBody}>
              {formError && <div className={tableStyles.formError}>{formError}</div>}
              <div className={tableStyles.formGrid}>
                <div className={tableStyles.formGroup}>
                  <label>Akreditasyon</label>
                  <select value={form.akreditasyon} onChange={event => setForm(f => ({ ...f, akreditasyon: event.target.value }))}>
                    <option value="0">Yok</option>
                    <option value="1">Var</option>
                  </select>
                </div>
                <div className={tableStyles.formGroup}>
                  <label>Doküman kodu <span className={tableStyles.required}>*</span></label>
                  <input value={form.dokumanKodu} onChange={event => setForm(f => ({ ...f, dokumanKodu: event.target.value }))} />
                </div>
                <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                  <label>Doküman adı <span className={tableStyles.required}>*</span></label>
                  <input value={form.dokumanAdi} onChange={event => setForm(f => ({ ...f, dokumanAdi: event.target.value }))} />
                </div>
                <div className={tableStyles.formGroup}>
                  <label>Yayıncısı</label>
                  <input value={form.yayincisi} onChange={event => setForm(f => ({ ...f, yayincisi: event.target.value }))} />
                </div>
                <div className={tableStyles.formGroup}>
                  <label>Yayın tarihi</label>
                  <input value={form.yayinTarihi} onChange={event => setForm(f => ({ ...f, yayinTarihi: event.target.value }))} placeholder="Örn. 2024, Mart 2025 veya 12.03.2025" />
                </div>
                <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                  <label>Yayın linki</label>
                  <input value={form.yayinLinki} onChange={event => setForm(f => ({ ...f, yayinLinki: event.target.value }))} placeholder="https://..." />
                </div>
                <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                  <label>PDF dosyası <span className={tableStyles.required}>*</span></label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={event => setPdfFile(event.target.files?.[0] || null)}
                  />
                  {pdfFile && <small>{pdfFile.name}</small>}
                </div>
              </div>
            </div>
            <div className={tableStyles.modalFooter}>
              <button type="button" className={tableStyles.cancelBtn} disabled={saving} onClick={() => setModalOpen(false)}>Vazgeç</button>
              <button type="button" className={tableStyles.saveBtn} disabled={saving} onClick={() => void save()}>
                {saving ? "Yükleniyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
