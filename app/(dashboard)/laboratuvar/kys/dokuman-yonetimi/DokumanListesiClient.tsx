"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, Eye, FilePlus2, Printer, RotateCw, Search, Trash2, Upload, X } from "lucide-react";
import tableStyles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";
import styles from "./dokumanYonetimi.module.css";
import {
  BOS_YETKI,
  DOKUMAN_DURUMLARI,
  DOKUMAN_TURLERI,
  errorMessage,
  formatDate,
  formatDateTime,
  statusTone,
  type DokumanDetay,
  type DokumanOzet,
  type DokumanYetki,
} from "./dokumanTypes";

type Kullanici = { ID: number | string; Ad: string };

type Stats = {
  toplam: number;
  taslak: number;
  kontrolBekliyor: number;
  onayBekliyor: number;
  yayinda: number;
  revizyonda: number;
  arsiv: number;
};

const BOS_STATS: Stats = {
  toplam: 0, taslak: 0, kontrolBekliyor: 0, onayBekliyor: 0, yayinda: 0, revizyonda: 0, arsiv: 0,
};

const bosForm = {
  kod: "",
  baslik: "",
  tur: "Prosedür",
  hazirlayanId: "",
  hazirlayanAd: "",
  onaylayanId: "",
  onaylayanAd: "",
  yururlukTarihi: "",
  ozet: "",
};

export default function DokumanListesiClient() {
  const [rows, setRows] = useState<DokumanOzet[]>([]);
  const [stats, setStats] = useState<Stats>(BOS_STATS);
  const [yetki, setYetki] = useState<DokumanYetki>(BOS_YETKI);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tur, setTur] = useState("");
  const [durum, setDurum] = useState("");
  const [sort, setSort] = useState("guncel");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(bosForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [silinecek, setSilinecek] = useState<DokumanOzet | null>(null);
  const [silmeHatasi, setSilmeHatasi] = useState("");
  const kodDokunuldu = useRef(false);

  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DokumanDetay | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Arama girişini yavaşlat — her tuşta istek atma
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, tur, durum, sort, limit]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        tur,
        durum,
        sort,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/kys/dokumanlar?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Doküman listesi alınamadı.");
      setRows(json.data || []);
      setStats(json.stats || BOS_STATS);
      setYetki(json.yetki || BOS_YETKI);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e: unknown) {
      setError(errorMessage(e, "Doküman listesi alınamadı."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, tur, durum, sort, page, limit]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  // Hazırlayan/onaylayan seçimleri için personel listesi — modal
  // açılmadan önce hazır olsun diye baştan çekilir.
  useEffect(() => {
    fetch("/api/kullanicilar")
      .then(r => r.json())
      .then(j => setKullanicilar(j.data || []))
      .catch(() => { /* liste alınamazsa "Yükleniyor..." görünmeye devam eder */ });
  }, []);

  // Modal Escape ile kapansın
  useEffect(() => {
    if (!modalOpen && !silinecek && previewId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (previewId != null) setPreviewId(null);
      else if (silinecek) setSilinecek(null);
      else if (!saving) setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, silinecek, saving, previewId]);

  async function openPreview(id: number) {
    const row = rows.find(item => item.id === id);
    if (row?.hasDosya) {
      window.open(`/api/kys/dokumanlar/${id}/dosya`, "_blank", "noopener,noreferrer");
      return;
    }
    setPreviewId(id);
    setPreviewDoc(null);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/kys/dokumanlar/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Doküman alınamadı.");
      setPreviewDoc(json.data);
    } catch (e: unknown) {
      setPreviewError(errorMessage(e, "Doküman alınamadı."));
    } finally {
      setPreviewLoading(false);
    }
  }

  function openAdd() {
    kodDokunuldu.current = false;
    setForm(bosForm);
    setDocumentFile(null);
    setFormError("");
    setModalOpen(true);
    void suggestKod(bosForm.tur);
  }

  async function suggestKod(nextTur: string) {
    if (kodDokunuldu.current) return;
    try {
      const res = await fetch(`/api/kys/dokumanlar?nextKod=${encodeURIComponent(nextTur)}`);
      const json = await res.json();
      if (res.ok && json.kod) setForm(f => (kodDokunuldu.current ? f : { ...f, kod: json.kod }));
    } catch { /* kod önerisi başarısız olursa kullanıcı elle girer */ }
  }

  async function save() {
    if (!form.baslik.trim()) {
      setFormError("Doküman başlığı zorunludur.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const requestBody = new FormData();
      requestBody.set("document", JSON.stringify(form));
      if (documentFile) requestBody.set("file", documentFile);
      const res = await fetch("/api/kys/dokumanlar", { method: "POST", body: requestBody });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Doküman kaydedilemedi.");
      setModalOpen(false);
      await fetchRows();
      if (json.id) window.open(`/laboratuvar/kys/dokuman-yonetimi/${json.id}`, "_blank", "noopener");
    } catch (e: unknown) {
      setFormError(errorMessage(e, "Doküman kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!silinecek) return;
    setSaving(true);
    setSilmeHatasi("");
    try {
      const res = await fetch(`/api/kys/dokumanlar/${silinecek.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Doküman silinemedi.");
      setSilinecek(null);
      await fetchRows();
    } catch (e: unknown) {
      setSilmeHatasi(errorMessage(e, "Doküman silinemedi."));
    } finally {
      setSaving(false);
    }
  }

  function printPreview(id: number) {
    window.open(`/kys-dokuman-yazdir/${id}?print=1`, "_blank", "noopener,noreferrer");
  }

  const filtreAktif = Boolean(debouncedSearch || tur || durum);
  const kisiSecenekleri = useMemo(
    () => kullanicilar.map(k => ({ id: String(k.ID), ad: k.Ad })),
    [kullanicilar],
  );

  function setKisi(alan: "hazirlayan" | "onaylayan", id: string) {
    const kisi = kisiSecenekleri.find(k => k.id === id);
    setForm(f => ({ ...f, [`${alan}Id`]: id, [`${alan}Ad`]: kisi?.ad || "" }));
  }

  return (
    <div className={styles.listShell}>
      <div className={styles.summaryStrip}>
        <button type="button" className={!durum ? styles.summaryActive : ""} onClick={() => setDurum("")}>
          <strong>{stats.toplam}</strong><span>Toplam</span>
        </button>
        <button type="button" className={durum === "Taslak" ? styles.summaryActive : ""} onClick={() => setDurum("Taslak")}>
          <strong>{stats.taslak}</strong><span>Taslak</span>
        </button>
        <button type="button" className={durum === "Onay Bekliyor" ? styles.summaryActive : ""} onClick={() => setDurum("Onay Bekliyor")}>
          <strong>{stats.onayBekliyor}</strong><span>Onay bekliyor</span>
        </button>
        <button type="button" className={durum === "Yayında" ? styles.summaryActive : ""} onClick={() => setDurum("Yayında")}>
          <strong>{stats.yayinda}</strong><span>Yayında</span>
        </button>
        <button type="button" className={durum === "Revize Ediliyor" ? styles.summaryActive : ""} onClick={() => setDurum("Revize Ediliyor")}>
          <strong>{stats.revizyonda}</strong><span>Revizyonda</span>
        </button>
        <button type="button" className={durum === "Arşiv" ? styles.summaryActive : ""} onClick={() => setDurum("Arşiv")}>
          <strong>{stats.arsiv}</strong><span>Arşiv</span>
        </button>
      </div>

      <div className={styles.listCard}>
        <div className={tableStyles.toolbar}>
          <div className={tableStyles.toolbarLeft}>
            <div className={tableStyles.searchBox}>
              <Search size={15} className={tableStyles.searchIcon} />
              <input
                className={tableStyles.searchInput}
                placeholder="Kod, başlık, içerik veya sorumlu ara..."
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
              <button
                type="button"
                className={tableStyles.filterBadge}
                onClick={() => { setSearch(""); setTur(""); setDurum(""); }}
              >
                Filtreleri temizle
              </button>
            )}
          </div>
          <div className={tableStyles.toolbarRight}>
            <button type="button" className={styles.ghostButton} onClick={() => void fetchRows()} title="Yenile">
              <RotateCw size={15} />
              Yenile
            </button>
            {yetki.olustur && (
              <button className={tableStyles.addBtn} type="button" onClick={() => void openAdd()}>
                <FilePlus2 size={16} />
                Yeni doküman
              </button>
            )}
          </div>
        </div>

        <div className={kys.filterRow}>
          <select className={kys.select} value={tur} onChange={event => setTur(event.target.value)}>
            <option value="">Tüm türler</option>
            {DOKUMAN_TURLERI.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={kys.select} value={durum} onChange={event => setDurum(event.target.value)}>
            <option value="">Tüm durumlar</option>
            {DOKUMAN_DURUMLARI.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={kys.select} value={sort} onChange={event => setSort(event.target.value)}>
            <option value="guncel">Son güncellenen</option>
            <option value="kod-asc">Koda göre (A→Z)</option>
            <option value="kod-desc">Koda göre (Z→A)</option>
            <option value="baslik-asc">Başlığa göre</option>
            <option value="yururluk-desc">Yürürlük tarihine göre</option>
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
                  <th>Kod</th>
                  <th>Doküman Adı</th>
                  <th>Tür</th>
                  <th>Rev.</th>
                  <th>Durum</th>
                  <th>Hazırlayan</th>
                  <th>Yürürlük</th>
                  <th>Son güncelleme</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`sk-${i}`}><td colSpan={9}><div className={tableStyles.skeleton} /></td></tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className={tableStyles.empty}>
                        {filtreAktif
                          ? "Filtrelere uyan doküman bulunamadı."
                          : "Henüz doküman yok. \"Yeni doküman\" ile ilk kaydı oluşturun."}
                      </div>
                    </td>
                  </tr>
                ) : rows.map(doc => (
                  <tr key={doc.id} className={styles.documentTableRow}>
                    <td className={tableStyles.tdMono}>
                      <Link href={`/laboratuvar/kys/dokuman-yonetimi/${doc.id}`} className={styles.documentCodeLink}>
                        {doc.kod}
                      </Link>
                    </td>
                    <td className={tableStyles.tdName}>
                      <Link href={`/laboratuvar/kys/dokuman-yonetimi/${doc.id}`} className={styles.documentTitleLink}>
                        {doc.baslik}
                      </Link>
                      {doc.onaylayanAd && (
                        <span className={styles.documentSubText}>
                          Onay: {doc.onaylayanAd}
                        </span>
                      )}
                    </td>
                    <td>{doc.tur}</td>
                    <td className={tableStyles.tdMono}>{doc.revizyonEtiket}</td>
                    <td><span className={`${styles.statusPill} ${statusTone[doc.durum] || ""}`}>{doc.durum}</span></td>
                    <td>{doc.hazirlayanAd || "-"}</td>
                    <td className={tableStyles.tdMono}>{formatDate(doc.yururlukTarihi)}</td>
                    <td className={tableStyles.tdSecondary}>{formatDateTime(doc.updatedAt)}</td>
                    <td>
                      <div className={tableStyles.actionBtns}>
                        <button
                          type="button"
                          className={tableStyles.editBtn}
                          title={doc.hasDosya ? (doc.dosyaMimeType === "application/pdf" ? "Dosyayı önizle" : "Dosyayı indir") : "Önizle"}
                          onClick={() => void openPreview(doc.id)}
                        >
                          {doc.hasDosya && doc.dosyaMimeType !== "application/pdf" ? <Download size={15} /> : <Eye size={15} />}
                        </button>
                        <Link
                          href={doc.hasDosya ? `/api/kys/dokumanlar/${doc.id}/dosya` : `/laboratuvar/kys/dokuman-yonetimi/${doc.id}/onizleme`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={tableStyles.editBtn}
                          title="Yeni sekmede aç"
                        >
                          <ArrowUpRight size={15} />
                        </Link>
                        {yetki.sil && (
                          <button
                            type="button"
                            className={tableStyles.deleteBtn}
                            title="Dokümanı sil"
                            onClick={() => { setSilinecek(doc); setSilmeHatasi(""); }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
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
        <div className={tableStyles.modalOverlay} role="dialog" aria-modal="true" aria-label="Yeni doküman">
          <div className={tableStyles.modal}>
            <div className={tableStyles.modalHeader}>
              <h2>Yeni doküman</h2>
              <button type="button" className={tableStyles.modalClose} onClick={() => setModalOpen(false)} aria-label="Kapat">×</button>
            </div>
            <div className={tableStyles.modalBody}>
              {formError && <div className={tableStyles.formError}>{formError}</div>}
              <div className={tableStyles.formGrid}>
                <div className={tableStyles.formGroup}>
                  <label>Doküman türü</label>
                  <select
                    value={form.tur}
                    onChange={event => {
                      const nextTur = event.target.value;
                      setForm(f => ({ ...f, tur: nextTur }));
                      void suggestKod(nextTur);
                    }}
                  >
                    {DOKUMAN_TURLERI.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className={tableStyles.formGroup}>
                  <label>Doküman kodu</label>
                  <input
                    value={form.kod}
                    placeholder="Boş bırakılırsa otomatik üretilir"
                    onChange={event => { kodDokunuldu.current = true; setForm(f => ({ ...f, kod: event.target.value })); }}
                  />
                </div>
                <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                  <label>Doküman adı <span className={tableStyles.required}>*</span></label>
                  <input
                    value={form.baslik}
                    autoFocus
                    onChange={event => setForm(f => ({ ...f, baslik: event.target.value }))}
                  />
                </div>
                <div className={tableStyles.formGroup}>
                  <label>Hazırlayan</label>
                  <select
                    value={form.hazirlayanId}
                    disabled={!kisiSecenekleri.length}
                    onChange={event => setKisi("hazirlayan", event.target.value)}
                  >
                    <option value="">{kisiSecenekleri.length ? "Beni ata (varsayılan)" : "Personel listesi yükleniyor..."}</option>
                    {kisiSecenekleri.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
                  </select>
                </div>
                <div className={tableStyles.formGroup}>
                  <label>Yürürlük tarihi</label>
                  <input type="date" value={form.yururlukTarihi} onChange={event => setForm(f => ({ ...f, yururlukTarihi: event.target.value }))} />
                </div>
                <div className={tableStyles.formGroup}>
                  <label>Doküman dosyası</label>
                  <label className={styles.ghostButton} style={{ cursor: "pointer", justifyContent: "center" }}>
                    <Upload size={15} />
                    {documentFile ? documentFile.name : "Doküman yükle"}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      hidden
                      onChange={event => setDocumentFile(event.target.files?.[0] || null)}
                    />
                  </label>
                  <small style={{ color: "var(--color-text-tertiary)" }}>PDF, Word veya Excel · en fazla 20 MB</small>
                </div>
                <div className={tableStyles.formGroup}>
                  <label>Onaylayan</label>
                  <select
                    value={form.onaylayanId}
                    disabled={!kisiSecenekleri.length}
                    onChange={event => setKisi("onaylayan", event.target.value)}
                  >
                    <option value="">{kisiSecenekleri.length ? "Seçilmedi" : "Personel listesi yükleniyor..."}</option>
                    {kisiSecenekleri.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
                  </select>
                </div>
                <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                  <label>Kısa açıklama</label>
                  <textarea rows={2} value={form.ozet} onChange={event => setForm(f => ({ ...f, ozet: event.target.value }))} />
                </div>
              </div>
            </div>
            <div className={tableStyles.modalFooter}>
              <button type="button" className={tableStyles.cancelBtn} disabled={saving} onClick={() => setModalOpen(false)}>Vazgeç</button>
              <button type="button" className={tableStyles.saveBtn} disabled={saving} onClick={() => void save()}>
                {saving ? "Oluşturuluyor..." : "Oluştur ve aç"}
              </button>
            </div>
          </div>
        </div>
      )}

      {silinecek && (
        <div className={tableStyles.modalOverlay} role="dialog" aria-modal="true" aria-label="Doküman sil">
          <div className={`${tableStyles.modal} ${tableStyles.modalSm}`}>
            <div className={tableStyles.modalHeader}>
              <h2>Dokümanı sil</h2>
              <button type="button" className={tableStyles.modalClose} onClick={() => setSilinecek(null)} aria-label="Kapat">×</button>
            </div>
            <div className={tableStyles.modalBody}>
              {silmeHatasi && <div className={tableStyles.formError}>{silmeHatasi}</div>}
              <p className={tableStyles.deleteWarning}>
                <strong>{silinecek.kod} — {silinecek.baslik}</strong> ve dokümana ait revizyon/dosya geçmişi kalıcı olarak silinecek. Bu işlem geri alınamaz.
              </p>
            </div>
            <div className={tableStyles.modalFooter}>
              <button type="button" className={tableStyles.cancelBtn} disabled={saving} onClick={() => setSilinecek(null)}>Vazgeç</button>
              <button type="button" className={tableStyles.deleteBtnPrimary} disabled={saving} onClick={() => void confirmDelete()}>
                {saving ? "Siliniyor..." : "Sil"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewId != null && (
        <div className={styles.previewBackdrop} role="dialog" aria-modal="true" aria-label="Doküman önizleme" onClick={() => setPreviewId(null)}>
          <div className={styles.previewModal} onClick={event => event.stopPropagation()}>
            <div className={styles.previewHeader}>
              <div>
                <div className={styles.kicker}>
                  {previewDoc ? <>{previewDoc.kod} · Rev. {previewDoc.revizyonEtiket}</> : "Yükleniyor..."}
                </div>
                <h3>{previewDoc?.baslik || ""}</h3>
              </div>
              <div className={tableStyles.toolbarRight}>
                {previewDoc && (
                  <Link
                    href={`/laboratuvar/kys/dokuman-yonetimi/${previewDoc.id}/onizleme`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.ghostButton}
                  >
                    <ArrowUpRight size={15} />
                    Yeni sekmede aç
                  </Link>
                )}
                {previewDoc && (
                  <button type="button" className={styles.ghostButton} onClick={() => printPreview(previewDoc.id)}>
                    <Printer size={15} />
                    Yazdır / PDF
                  </button>
                )}
                <button type="button" className={styles.iconButton} aria-label="Önizlemeyi kapat" onClick={() => setPreviewId(null)}>
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className={styles.previewPaper}>
              <div className={styles.previewPaperInner}>
                {previewLoading && <div className={tableStyles.skeleton} />}
                {previewError && <div className={tableStyles.formError}>{previewError}</div>}
                {previewDoc && (
                  <>
                    <div className={styles.previewDocumentHeader}>
                      <img src="/unique-logo-wide.png" alt="UNIQUE Analyse" />
                      <strong>{previewDoc.baslik}</strong>
                      <table><tbody>
                        <tr><th>Doküman No</th><td>{previewDoc.kod}</td></tr>
                        <tr><th>Revizyon</th><td>{previewDoc.revizyonEtiket}</td></tr>
                        <tr><th>Yürürlük Tarihi</th><td>{formatDate(previewDoc.yururlukTarihi)}</td></tr>
                      </tbody></table>
                    </div>
                    <div className={styles.documentBody} dangerouslySetInnerHTML={{ __html: previewDoc.icerik }} />
                    <div className={styles.previewDocumentFooter}>
                      <span>Sayfa 1</span>
                      <strong>ELEKTRONİK NÜSHA. BASILMIŞ HALİ KONTROLSÜZ KOPYADIR.</strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
