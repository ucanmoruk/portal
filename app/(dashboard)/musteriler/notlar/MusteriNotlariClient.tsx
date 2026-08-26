"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Circle, Clock3, FilePlus2, RotateCw, Search, X } from "lucide-react";
import tableStyles from "@/app/styles/table.module.css";
import styles from "./musteriNotlari.module.css";

type Durum = "Bekleyen" | "Çalışılan" | "Tamamlanan";

type NoteRow = {
  id: number;
  firmaId: number | null;
  firmaAdi: string;
  baslik: string;
  notMetni: string;
  gorusmeTarihi: string | null;
  odemeTarihi: string | null;
  durum: Durum;
  createdByAd: string;
  durumDegistirenAd: string;
  durumDegisimTarihi: string | null;
  tamamlanmaTarihi: string | null;
};

const NEXT_DURUM: Record<Durum, Durum> = {
  "Bekleyen": "Çalışılan",
  "Çalışılan": "Tamamlanan",
  "Tamamlanan": "Bekleyen",
};

type FirmaOption = { id: number; ad: string; yetkili: string };

// Firma modalındaki "Notlar" sekmesi — Müşteri Notları sisteminden bağımsız,
// firma hakkında ufak bilgilendirme notları (bkz. lib/firmaGenelNotStore.ts).
type GenelNot = { id: number; notMetni: string; olusturanAd: string; createdAt: string | null };

type FirmaDetay = {
  firma: {
    id: number;
    ad: string;
    adres: string;
    telefon: string;
    email: string;
    yetkili: string;
    vergiNo: string;
    vergiDairesi: string;
  };
  numuneler: Array<{ id: number; raporNo: string; tarih: string; numuneAdi: string; grup: string }>;
  testler: Array<{ kod: string; ad: string; adet: number; sonTarih: string }>;
};

type CariRow = {
  Kaynak: string;
  KaynakID: number;
  BelgeNo: string;
  Tarih: string | null;
  Durum: string | null;
  Tutar: number | string;
  ParaBirimi: string;
};

type CariSummary = {
  paraBirimi: string;
  net: number;
};

const emptyForm = {
  firmaId: "",
  manuelFirmaAdi: "",
  baslik: "",
  notMetni: "",
  gorusmeTarihi: "",
  durum: "Bekleyen" as Durum,
};

type Stats = { toplam: number; bekleyen: number; calisilan: number; tamamlanan: number };
const emptyStats: Stats = { toplam: 0, bekleyen: 0, calisilan: 0, tamamlanan: 0 };

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isOverdue(row: NoteRow) {
  return Boolean(row.gorusmeTarihi) && row.durum !== "Tamamlanan" && row.gorusmeTarihi! < todayIso();
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value);
}

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function statusClass(durum: Durum) {
  if (durum === "Tamamlanan") return styles.statusDone;
  if (durum === "Çalışılan") return styles.statusWorking;
  return styles.statusWaiting;
}

export default function MusteriNotlariClient() {
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [durum, setDurum] = useState("");
  const [tarih, setTarih] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [firmaSearch, setFirmaSearch] = useState("");
  const [firmaOptions, setFirmaOptions] = useState<FirmaOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [firmaModalId, setFirmaModalId] = useState<number | null>(null);
  const [firmaDetay, setFirmaDetay] = useState<FirmaDetay | null>(null);
  const [firmaDetayLoading, setFirmaDetayLoading] = useState(false);
  const [firmaDetayError, setFirmaDetayError] = useState("");
  const [firmaTab, setFirmaTab] = useState<"cari" | "numune" | "test" | "notlar">("cari");
  const [manuelFirma, setManuelFirma] = useState(false);
  const [cariRows, setCariRows] = useState<CariRow[]>([]);
  const [cariSummary, setCariSummary] = useState<CariSummary[]>([]);
  const [cariLoading, setCariLoading] = useState(false);
  const [genelNotlar, setGenelNotlar] = useState<GenelNot[]>([]);
  const [genelNotlarLoading, setGenelNotlarLoading] = useState(false);
  const [genelNotDraft, setGenelNotDraft] = useState("");
  const [genelNotSaving, setGenelNotSaving] = useState(false);
  const [genelNotError, setGenelNotError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, durum, tarih, limit]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        durum,
        // Tek gün filtresi: aynı tarihi hem alt hem üst sınır olarak gönderip
        // API'nin mevcut GorusmeTarihi >= @tarihBas AND <= @tarihBit aralık
        // sorgusunu "o güne eşit" hâline getiriyoruz — backend değişmedi.
        tarihBas: tarih,
        tarihBit: tarih,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/musteri-notlari?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Notlar alınamadı.");
      setRows(json.data || []);
      setStats(json.stats || emptyStats);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e: unknown) {
      setError(errorMessage(e, "Notlar alınamadı."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, durum, tarih, limit, page]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ firmalar: "1", search: firmaSearch });
        const res = await fetch(`/api/musteri-notlari?${params}`);
        const json = await res.json();
        setFirmaOptions(res.ok ? json.data || [] : []);
      } catch {
        setFirmaOptions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [firmaSearch]);

  function openAdd() {
    setForm(emptyForm);
    setFirmaSearch("");
    setManuelFirma(false);
    setFormError("");
    setModalOpen(true);
  }

  function toggleManuelFirma(next: boolean) {
    setManuelFirma(next);
    setFirmaSearch("");
    setForm(prev => ({ ...prev, firmaId: "", manuelFirmaAdi: "" }));
  }

  async function save() {
    if (manuelFirma) {
      if (!form.manuelFirmaAdi.trim() || !form.notMetni.trim()) {
        setFormError("Firma adı ve not metni zorunludur.");
        return;
      }
    } else if (!form.firmaId || !form.notMetni.trim()) {
      setFormError("Firma ve not metni zorunludur.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/musteri-notlari", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manuelFirma ? { ...form, firmaId: "" } : { ...form, manuelFirmaAdi: "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Not kaydedilemedi.");
      setModalOpen(false);
      await fetchRows();
    } catch (e: unknown) {
      setFormError(errorMessage(e, "Not kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  }

  function handleFirmaSearch(value: string) {
    setFirmaSearch(value);
    const exact = firmaOptions.find(firma => firma.ad.toLocaleLowerCase("tr-TR") === value.toLocaleLowerCase("tr-TR"));
    setForm(prev => ({ ...prev, firmaId: exact ? String(exact.id) : "" }));
  }

  async function updateStatus(id: number, nextDurum: Durum) {
    try {
      const res = await fetch(`/api/musteri-notlari/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durum: nextDurum }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Durum güncellenemedi.");
      await fetchRows();
    } catch (e: unknown) {
      setError(errorMessage(e, "Durum güncellenemedi."));
    }
  }

  async function fetchGenelNotlar(firmaId: number) {
    setGenelNotlarLoading(true);
    try {
      const res = await fetch(`/api/firmalar/${firmaId}/genel-notlar`);
      const json = await res.json();
      setGenelNotlar(res.ok ? json.data || [] : []);
    } catch {
      setGenelNotlar([]);
    } finally {
      setGenelNotlarLoading(false);
    }
  }

  async function openFirmaModal(firmaId: number) {
    setFirmaModalId(firmaId);
    setFirmaTab("cari");
    setFirmaDetay(null);
    setFirmaDetayError("");
    setFirmaDetayLoading(true);
    setCariRows([]);
    setCariSummary([]);
    setCariLoading(true);
    setGenelNotlar([]);
    setGenelNotDraft("");
    setGenelNotError("");
    try {
      const [detayRes, cariRes] = await Promise.all([
        fetch(`/api/musteri-notlari/firma/${firmaId}`),
        fetch(`/api/firmalar/${firmaId}/cari?tip=Tümü`, { cache: "no-store" }),
        fetchGenelNotlar(firmaId),
      ]);
      const detayJson = await detayRes.json();
      const cariJson = await cariRes.json();
      if (!detayRes.ok) throw new Error(detayJson.error || "Firma bilgileri alınamadı.");
      setFirmaDetay(detayJson.data);
      setCariRows(cariRes.ok ? cariJson.data || [] : []);
      setCariSummary(cariRes.ok ? cariJson.summary || [] : []);
    } catch (e: unknown) {
      setFirmaDetayError(errorMessage(e, "Firma bilgileri alınamadı."));
    } finally {
      setFirmaDetayLoading(false);
      setCariLoading(false);
    }
  }

  async function addGenelNot() {
    if (!firmaModalId || !genelNotDraft.trim()) return;
    setGenelNotSaving(true);
    setGenelNotError("");
    try {
      const res = await fetch(`/api/firmalar/${firmaModalId}/genel-notlar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notMetni: genelNotDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Not kaydedilemedi.");
      setGenelNotDraft("");
      await fetchGenelNotlar(firmaModalId);
    } catch (e: unknown) {
      setGenelNotError(errorMessage(e, "Not kaydedilemedi."));
    } finally {
      setGenelNotSaving(false);
    }
  }

  const filtreAktif = Boolean(debouncedSearch || durum || tarih);

  return (
    <div className={styles.shell}>
      <div className={styles.summaryStrip}>
        <button type="button" className={!durum ? styles.summaryActive : ""} onClick={() => setDurum("")}>
          <strong>{stats.toplam}</strong>
          <span>Toplam</span>
        </button>
        <button type="button" className={durum === "Bekleyen" ? styles.summaryActive : ""} onClick={() => setDurum("Bekleyen")}>
          <strong>{stats.bekleyen}</strong>
          <span>Bekleyen</span>
        </button>
        <button type="button" className={durum === "Çalışılan" ? styles.summaryActive : ""} onClick={() => setDurum("Çalışılan")}>
          <strong>{stats.calisilan}</strong>
          <span>Çalışılan</span>
        </button>
        <button type="button" className={durum === "Tamamlanan" ? styles.summaryActive : ""} onClick={() => setDurum("Tamamlanan")}>
          <strong>{stats.tamamlanan}</strong>
          <span>Tamamlanan</span>
        </button>
      </div>

      <div className={styles.listCard}>
        <div className={tableStyles.toolbar}>
          <div className={tableStyles.toolbarLeft}>
            <div className={tableStyles.searchBox}>
              <Search size={15} className={tableStyles.searchIcon} />
              <input
                className={tableStyles.searchInput}
                placeholder="Firma, başlık veya not ara..."
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
              {search && (
                <button type="button" className={tableStyles.searchClear} onClick={() => setSearch("")} aria-label="Aramayı temizle">
                  <X size={14} />
                </button>
              )}
            </div>
            <span className={tableStyles.totalCount}>{total} not</span>
            {filtreAktif && (
              <button type="button" className={tableStyles.filterBadge} onClick={() => { setSearch(""); setDurum(""); setTarih(""); }}>
                Filtreleri temizle
              </button>
            )}
          </div>
          <div className={tableStyles.toolbarRight}>
            <select value={limit} onChange={event => setLimit(Number(event.target.value))} className={tableStyles.pageSizeSelect}>
              {[10, 25, 50, 100].map(item => <option key={item} value={item}>{item} / sayfa</option>)}
            </select>
            <button type="button" className={styles.ghostButton} onClick={() => void fetchRows()}>
              <RotateCw size={15} />
              Yenile
            </button>
            <button className={tableStyles.addBtn} type="button" onClick={openAdd}>
              <FilePlus2 size={16} />
              Yeni not
            </button>
          </div>
        </div>

        <div className={styles.filterRow}>
          <span className={styles.filterRowLabel}>Filtreler:</span>
          <div className={styles.dateRangeGroup}>
            <span>Görüşme tarihi</span>
            <input
              type="date"
              value={tarih}
              aria-label="Görüşme tarihi"
              onChange={event => setTarih(event.target.value)}
            />
            {tarih && (
              <button type="button" className={styles.linkButton} onClick={() => setTarih("")}>
                Temizle
              </button>
            )}
          </div>
        </div>

        <div className={styles.noteList}>
          {error && <div className={tableStyles.errorBar}>{error}</div>}
          {loading ? (
            Array.from({ length: 5 }).map((_, index) => <div key={index} className={styles.skeleton} />)
          ) : rows.length === 0 ? (
            <div className={styles.empty}>Henüz not yok. Yeni not ile ilk takibi oluşturun.</div>
          ) : rows.map(row => (
            <article key={row.id} className={`${styles.noteCard} ${row.durum === "Tamamlanan" ? styles.noteDone : ""}`}>
              <div className={styles.noteCardHeader}>
                {row.firmaId != null ? (
                  <button type="button" className={styles.companyButton} onClick={() => void openFirmaModal(row.firmaId as number)}>
                    <Building2 size={15} />
                    {row.firmaAdi || "Firma"}
                  </button>
                ) : (
                  <span className={styles.companyStatic}>
                    <Building2 size={15} />
                    {row.firmaAdi || "Firma"} <em>(manuel)</em>
                  </span>
                )}
                <button
                  type="button"
                  className={`${styles.statusPill} ${styles.statusToggle} ${statusClass(row.durum)}`}
                  title={`Durum: ${row.durum} — tıklayınca "${NEXT_DURUM[row.durum]}" durumuna geçer`}
                  onClick={() => void updateStatus(row.id, NEXT_DURUM[row.durum])}
                >
                  {row.durum === "Tamamlanan" ? <CheckCircle2 size={13} /> : row.durum === "Çalışılan" ? <Clock3 size={13} /> : <Circle size={13} />}
                  {row.durum}
                </button>
              </div>
              <h3>{row.baslik || "Takip notu"}</h3>
              <p>{row.notMetni}</p>
              <div className={styles.noteFooter}>
                <span><Clock3 size={12} /> Görüşme: {fmtDate(row.gorusmeTarihi)}</span>
                {isOverdue(row) && (
                  <span className={styles.overdueBadge}><AlertTriangle size={12} /> Gecikti</span>
                )}
                <span>Oluşturan: {row.createdByAd || "-"}</span>
                <span>Son durum: {row.durumDegistirenAd || "-"} · {fmtDateTime(row.durumDegisimTarihi)}</span>
              </div>
            </article>
          ))}
        </div>

        {totalPages > 1 && (
          <div className={tableStyles.pagination}>
            <button type="button" className={tableStyles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Önceki</button>
            <span className={tableStyles.pageInfo}>{page} / {totalPages}</span>
            <button type="button" className={tableStyles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sonraki</button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className={tableStyles.modalOverlay} role="dialog" aria-modal="true" aria-label="Yeni müşteri notu">
          <div className={tableStyles.modal}>
            <div className={tableStyles.modalHeader}>
              <h2>Yeni not</h2>
              <button type="button" className={tableStyles.modalClose} onClick={() => setModalOpen(false)} aria-label="Kapat">×</button>
            </div>
            <div className={tableStyles.modalBody}>
              {formError && <div className={tableStyles.formError}>{formError}</div>}
              <div className={tableStyles.formGrid}>
                <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                  <div className={styles.fieldLabelRow}>
                    <label>Firma <span className={tableStyles.required}>*</span></label>
                    <button type="button" className={styles.linkButton} onClick={() => toggleManuelFirma(!manuelFirma)}>
                      {manuelFirma ? "Listeden seç" : "Firma listede yok, manuel gir"}
                    </button>
                  </div>
                  {manuelFirma ? (
                    <input
                      value={form.manuelFirmaAdi}
                      placeholder="Firma adını yazın"
                      autoFocus
                      onChange={event => setForm(prev => ({ ...prev, manuelFirmaAdi: event.target.value }))}
                    />
                  ) : (
                    <>
                      <input
                        value={firmaSearch}
                        placeholder="Firma ara..."
                        list="musteri-not-firmalar"
                        onChange={event => handleFirmaSearch(event.target.value)}
                      />
                      {/* Listeden birebir eşleşen bir firma seçilmeden formError zaten submit'i engeller —
                          burada yanlış firmayı sessizce "tahmin edip" seçmiyoruz. */}
                      {firmaSearch.trim() && !form.firmaId && (
                        <span className={styles.fieldHint}>Listede bulamadıysanız &quot;Firma listede yok&quot; ile manuel girin.</span>
                      )}
                      <datalist id="musteri-not-firmalar">
                        {firmaOptions.map(firma => (
                          <option key={firma.id} value={firma.ad} label={firma.yetkili || firma.ad} />
                        ))}
                      </datalist>
                    </>
                  )}
                </div>
                <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                  <label>Başlık</label>
                  <input value={form.baslik} onChange={event => setForm(prev => ({ ...prev, baslik: event.target.value }))} placeholder="Örn. Ödeme takibi" />
                </div>
                <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                  <label>Tekrar görüşme tarihi</label>
                  <input type="date" value={form.gorusmeTarihi} onChange={event => setForm(prev => ({ ...prev, gorusmeTarihi: event.target.value }))} />
                </div>
                <div className={`${tableStyles.formGroup} ${tableStyles.colSpan2}`}>
                  <label>Not <span className={tableStyles.required}>*</span></label>
                  <textarea rows={4} value={form.notMetni} onChange={event => setForm(prev => ({ ...prev, notMetni: event.target.value }))} />
                </div>
              </div>
            </div>
            <div className={tableStyles.modalFooter}>
              <button type="button" className={tableStyles.cancelBtn} disabled={saving} onClick={() => setModalOpen(false)}>Vazgeç</button>
              <button type="button" className={tableStyles.saveBtn} disabled={saving} onClick={() => void save()}>
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {firmaModalId && (
        <div className={tableStyles.modalOverlay} role="dialog" aria-modal="true" aria-label="Firma bilgileri">
          <div className={`${tableStyles.modal} ${styles.detailModal}`}>
            <div className={tableStyles.modalHeader}>
              <div>
                <h2>{firmaDetay?.firma.ad || "Firma bilgileri"}</h2>
                {firmaDetay?.firma.yetkili && <p className={styles.modalSub}>{firmaDetay.firma.yetkili}</p>}
              </div>
              <button type="button" className={tableStyles.modalClose} onClick={() => setFirmaModalId(null)} aria-label="Kapat">×</button>
            </div>
            <div className={styles.detailTabs}>
              <button type="button" className={firmaTab === "cari" ? styles.activeTab : ""} onClick={() => setFirmaTab("cari")}>Cari detaylar</button>
              <button type="button" className={firmaTab === "numune" ? styles.activeTab : ""} onClick={() => setFirmaTab("numune")}>Numuneler</button>
              <button type="button" className={firmaTab === "test" ? styles.activeTab : ""} onClick={() => setFirmaTab("test")}>Testler</button>
              <button type="button" className={firmaTab === "notlar" ? styles.activeTab : ""} onClick={() => setFirmaTab("notlar")}>Notlar</button>
            </div>
            <div className={tableStyles.modalBody}>
              {firmaDetayError && <div className={tableStyles.formError}>{firmaDetayError}</div>}
              {firmaDetayLoading ? (
                <div className={styles.empty}>Firma bilgileri yükleniyor...</div>
              ) : firmaTab === "cari" ? (
                <div className={styles.detailPane}>
                  <div className={styles.companyInfo}>
                    <span>{firmaDetay?.firma.telefon || "-"}</span>
                    <span>{firmaDetay?.firma.email || "-"}</span>
                    <span>{firmaDetay?.firma.adres || "-"}</span>
                  </div>
                  {cariLoading ? <div className={styles.empty}>Cari hareketler yükleniyor...</div> : (
                    <>
                      <div className={styles.summaryMini}>
                        {cariSummary.length ? cariSummary.map((item, index) => (
                          <div key={index}>
                            <span>{item.paraBirimi}</span>
                            <strong>{Number(item.net || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</strong>
                          </div>
                        )) : <div><span>Cari</span><strong>Hareket yok</strong></div>}
                      </div>
                      <table className={`${tableStyles.table} ${styles.compactTable}`}>
                        <thead><tr><th>Tür</th><th>Belge</th><th>Tarih</th><th>Durum</th><th>Tutar</th></tr></thead>
                        <tbody>
                          {cariRows.slice(0, 20).map((item, index) => (
                            <tr key={`${item.Kaynak}-${item.KaynakID}-${index}`}>
                              <td>{item.Kaynak}</td>
                              <td>{item.BelgeNo || "-"}</td>
                              <td>{fmtDate(item.Tarih)}</td>
                              <td>{item.Durum || "-"}</td>
                              <td>{Number(item.Tutar || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} {item.ParaBirimi || ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              ) : firmaTab === "numune" ? (
                <table className={`${tableStyles.table} ${styles.compactTable}`}>
                  <thead><tr><th>Rapor</th><th>Numune Adı</th><th>Tarih</th><th>Grup</th></tr></thead>
                  <tbody>
                    {(firmaDetay?.numuneler || []).map(item => (
                      <tr key={item.id}>
                        <td>{item.raporNo || item.id}</td>
                        <td>{item.numuneAdi || "-"}</td>
                        <td>{fmtDate(item.tarih)}</td>
                        <td>{item.grup || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : firmaTab === "notlar" ? (
                <div className={styles.genelNotWrap}>
                  <div className={styles.genelNotComposer}>
                    {genelNotError && <div className={tableStyles.formError}>{genelNotError}</div>}
                    <textarea
                      rows={3}
                      value={genelNotDraft}
                      placeholder="Firma hakkında kısa bir bilgi notu yazın..."
                      onChange={event => setGenelNotDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className={tableStyles.saveBtn}
                      disabled={genelNotSaving || !genelNotDraft.trim()}
                      onClick={() => void addGenelNot()}
                    >
                      {genelNotSaving ? "Ekleniyor..." : "Not ekle"}
                    </button>
                  </div>
                  {genelNotlarLoading ? (
                    <div className={styles.empty}>Notlar yükleniyor...</div>
                  ) : genelNotlar.length === 0 ? (
                    <div className={styles.empty}>Bu firma için henüz bilgi notu eklenmemiş.</div>
                  ) : (
                    <div className={styles.genelNotList}>
                      {genelNotlar.map(note => (
                        <div key={note.id} className={styles.genelNotItem}>
                          <p>{note.notMetni}</p>
                          <span>{note.olusturanAd || "-"} · {fmtDateTime(note.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <table className={`${tableStyles.table} ${styles.compactTable}`}>
                  <thead><tr><th>Kod</th><th>Test</th><th>Adet</th><th>Son Tarih</th></tr></thead>
                  <tbody>
                    {(firmaDetay?.testler || []).map((item, index) => (
                      <tr key={`${item.kod}-${index}`}>
                        <td>{item.kod || "-"}</td>
                        <td>{item.ad || "-"}</td>
                        <td>{item.adet}</td>
                        <td>{fmtDate(item.sonTarih)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
