"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./paketler.module.css";

// ── Types ────────────────────────────────────────────────────────────────────
interface Liste {
  ID: number;
  ListeAdi: string;
  Aciklama: string | null;
  Tarih: string | null;
  KID: number | null;
  KullaniciAdi: string | null;
  HizmetSayisi: number;
}

interface Item {
  ID: number;
  ListeID: number;
  AltAnalizID: number;
  LimitDeger: string | null;
  LimitBirimi: string | null;
  Notlar: string | null;
  Kod: string;
  Ad: string;
  Method: string;
  Matriks: string;
  Akreditasyon: string;
  Sure: string;
  Fiyat: string;
  ParaBirimi: string;
}

interface AvailableHizmet {
  ID: number;
  Kod: string;
  Ad: string;
  Method: string;
  Matriks: string;
  Akreditasyon: string;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function HizmetPaketleri() {
  // Liste state
  const [listeler,   setListeler]   = useState<Liste[]>([]);
  const [toplam,     setToplam]     = useState(0);
  const [sayfa,      setSayfa]      = useState(1);
  const [aramaL,     setAramaL]     = useState("");
  const [loadingL,   setLoadingL]   = useState(false);

  // Detay panel
  const [aktifListe, setAktifListe] = useState<Liste | null>(null);
  const [items,      setItems]      = useState<Item[]>([]);
  const [itemToplam, setItemToplam] = useState(0);
  const [itemSayfa,  setItemSayfa]  = useState(1);
  const [aramaI,     setAramaI]     = useState("");
  const [loadingI,   setLoadingI]   = useState(false);

  // Modals
  const [listeModal,  setListeModal]  = useState<null | "new" | Liste>(null);
  const [hizmetModal, setHizmetModal] = useState(false);
  const [limitModal,  setLimitModal]  = useState<null | Item>(null);
  const [delConfirm,  setDelConfirm]  = useState<null | { msg: string; fn: () => void }>(null);

  // Hizmet seçici
  const [availHizmetler, setAvailHizmetler] = useState<AvailableHizmet[]>([]);
  const [availArama,     setAvailArama]     = useState("");
  const [availLoading,   setAvailLoading]   = useState(false);
  const [availSayfa,     setAvailSayfa]     = useState(1);
  const [availToplam,    setAvailToplam]    = useState(0);

  // Toast
  const [toastMsg, setToastMsg] = useState<{ text: string; type: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string, type = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg({ text, type });
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const LIMIT = 15;

  // ── Liste yükle ────────────────────────────────────────────────────────────
  const loadListeler = useCallback(async (pg = sayfa, q = aramaL) => {
    setLoadingL(true);
    try {
      const res  = await fetch(`/api/lab/paketler?sayfa=${pg}&limit=${LIMIT}&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setListeler(json.data);
      setToplam(json.toplam);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoadingL(false);
    }
  }, [sayfa, aramaL, toast]);

  useEffect(() => { loadListeler(1, ""); }, []);

  const handleSearch = (v: string) => {
    setAramaL(v); setSayfa(1);
    loadListeler(1, v);
  };
  const handlePage = (p: number) => {
    setSayfa(p);
    loadListeler(p, aramaL);
  };

  // ── İtem yükle ─────────────────────────────────────────────────────────────
  const loadItems = useCallback(async (listeId: number, pg = 1, q = "") => {
    setLoadingI(true);
    try {
      const res  = await fetch(`/api/lab/paketler/${listeId}/items?sayfa=${pg}&limit=20&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setItems(json.data);
      setItemToplam(json.toplam);
      setItemSayfa(pg);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoadingI(false);
    }
  }, [toast]);

  const openDetay = (liste: Liste) => {
    setAktifListe(liste);
    setAramaI("");
    loadItems(liste.ID, 1, "");
  };

  // ── Mevcut hizmetler (ekle modalı için) ────────────────────────────────────
  const loadAvailHizmetler = useCallback(async (q = "", pg = 1) => {
    setAvailLoading(true);
    try {
      const res  = await fetch(`/api/hizmetler?page=${pg}&limit=15&search=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAvailHizmetler(json.data || []);
      setAvailToplam(json.total || 0);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setAvailLoading(false);
    }
  }, [toast]);

  const openHizmetModal = () => {
    setAvailArama(""); setAvailSayfa(1);
    loadAvailHizmetler("", 1);
    setHizmetModal(true);
  };

  // ── CRUD: Liste ────────────────────────────────────────────────────────────
  const saveListe = async (form: { listeAdi: string; aciklama: string }) => {
    const isEdit = typeof listeModal === "object" && listeModal !== null;
    const url    = isEdit ? `/api/lab/paketler/${(listeModal as Liste).ID}` : "/api/lab/paketler";
    const method = isEdit ? "PUT" : "POST";
    try {
      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(isEdit ? "Liste güncellendi." : "Liste oluşturuldu.", "success");
      setListeModal(null);
      loadListeler(1, aramaL);
      if (isEdit && aktifListe?.ID === (listeModal as Liste).ID) {
        setAktifListe(prev => prev ? { ...prev, ListeAdi: form.listeAdi, Aciklama: form.aciklama } : prev);
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const pasifYap = (liste: Liste) => {
    setDelConfirm({
      msg: `"${liste.ListeAdi}" listesini silmek istediğinizden emin misiniz?`,
      fn: async () => {
        setDelConfirm(null);
        try {
          const res = await fetch(`/api/lab/paketler/${liste.ID}`, { method: "DELETE" });
          if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
          toast("Liste silindi.", "success");
          if (aktifListe?.ID === liste.ID) setAktifListe(null);
          loadListeler(1, aramaL);
        } catch (e: any) { toast(e.message, "error"); }
      },
    });
  };

  // ── CRUD: Item ─────────────────────────────────────────────────────────────
  const addHizmet = async (hizmet: AvailableHizmet) => {
    if (!aktifListe) return;
    try {
      const res  = await fetch(`/api/lab/paketler/${aktifListe.ID}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hizmetId: hizmet.ID }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`"${hizmet.Ad}" eklendi.`, "success");
      loadItems(aktifListe.ID, 1, aramaI);
      loadListeler(sayfa, aramaL);
    } catch (e: any) { toast(e.message, "error"); }
  };

  const removeItem = (item: Item) => {
    setDelConfirm({
      msg: `"${item.Ad}" hizmetini listeden çıkarmak istediğinizden emin misiniz?`,
      fn: async () => {
        setDelConfirm(null);
        if (!aktifListe) return;
        try {
          const res = await fetch(`/api/lab/paketler/${aktifListe.ID}/items`, {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.ID }),
          });
          if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
          toast("Hizmet listeden çıkarıldı.", "success");
          loadItems(aktifListe.ID, itemSayfa, aramaI);
          loadListeler(sayfa, aramaL);
        } catch (e: any) { toast(e.message, "error"); }
      },
    });
  };

  const saveLimit = async (form: { limitDeger: string; limitBirimi: string; notlar: string }) => {
    if (!aktifListe || !limitModal) return;
    try {
      const res = await fetch(`/api/lab/paketler/${aktifListe.ID}/items`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: limitModal.ID, ...form }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast("Limit güncellendi.", "success");
      setLimitModal(null);
      loadItems(aktifListe.ID, itemSayfa, aramaI);
    } catch (e: any) { toast(e.message, "error"); }
  };

  const totalPages      = Math.ceil(toplam / LIMIT);
  const itemTotalPages  = Math.ceil(itemToplam / 20);
  const availTotalPages = Math.ceil(availToplam / 15);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrap}>

      {/* ── Sol panel: Liste tablosu ────────────────────────────────────────── */}
      <div className={aktifListe ? styles.leftPanelNarrow : styles.leftPanelFull}>

        {/* Başlık */}
        <div className={styles.panelHeader}>
          <div>
            <h1 className={styles.title}>Hizmet Paketleri</h1>
            <p className={styles.subtitle}>NumuneX3 — müşteriye özel servis listeleri</p>
          </div>
          <button className={styles.btnPrimary} onClick={() => setListeModal("new")}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            Yeni Liste
          </button>
        </div>

        {/* Filtreler */}
        <div className={styles.filters}>
          <input
            className={styles.searchInput}
            placeholder="Liste ara…"
            value={aramaL}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        {/* Tablo */}
        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Paket Adı</th>
                  {!aktifListe && <th>Açıklama</th>}
                  {!aktifListe && <th>Oluşturma Tarihi</th>}
                  {!aktifListe && <th>Oluşturan</th>}
                  <th style={{ textAlign: "center" }}>Hizmet</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loadingL && (
                  <tr><td colSpan={aktifListe ? 3 : 6} className={styles.emptyCell}>Yükleniyor…</td></tr>
                )}
                {!loadingL && listeler.length === 0 && (
                  <tr><td colSpan={aktifListe ? 3 : 6} className={styles.emptyCell}>Kayıt bulunamadı.</td></tr>
                )}
                {!loadingL && listeler.map(l => (
                  <tr
                    key={l.ID}
                    className={`${styles.tr} ${aktifListe?.ID === l.ID ? styles.trActive : ""}`}
                    onClick={() => openDetay(l)}
                  >
                    <td className={styles.tdBold}>{l.ListeAdi}</td>
                    {!aktifListe && <td className={styles.tdSub}>{l.Aciklama || "—"}</td>}
                    {!aktifListe && <td className={styles.tdSub}>{l.Tarih || "—"}</td>}
                    {!aktifListe && <td className={styles.tdSub}>{l.KullaniciAdi || "—"}</td>}
                    <td style={{ textAlign: "center" }}>
                      <span className={styles.countBadge}>{l.HizmetSayisi}</span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className={styles.actions}>
                        <button
                          className={styles.btnIcon}
                          title="Düzenle"
                          onClick={() => setListeModal(l)}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                            <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                          </svg>
                        </button>
                        <button
                          className={`${styles.btnIcon} ${styles.btnIconDanger}`}
                          title="Sil"
                          onClick={() => pasifYap(l)}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sayfalama */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.pageInfo}>{toplam} kayıt</span>
              <div className={styles.pageButtons}>
                <button className={styles.pageBtn} disabled={sayfa <= 1} onClick={() => handlePage(sayfa - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    className={`${styles.pageBtn} ${p === sayfa ? styles.pageBtnActive : ""}`}
                    onClick={() => handlePage(p)}
                  >{p}</button>
                ))}
                <button className={styles.pageBtn} disabled={sayfa >= totalPages} onClick={() => handlePage(sayfa + 1)}>›</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sağ panel: Detay ────────────────────────────────────────────────── */}
      {aktifListe && (
        <div className={styles.rightPanel}>

          {/* Başlık */}
          <div className={styles.detayHeader}>
            <div className={styles.detayTitleRow}>
              <div>
                <h2 className={styles.detayTitle}>Paket Detayları</h2>
                <p className={styles.detaySubtitle}>
                  {aktifListe.ListeAdi}
                  {aktifListe.Aciklama && <> — {aktifListe.Aciklama}</>}
                </p>
              </div>
              <div className={styles.detayActions}>
                <button className={styles.btnPrimary} onClick={openHizmetModal}>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                  </svg>
                  Hizmet Ekle
                </button>
                <button className={styles.btnGhost} onClick={() => setAktifListe(null)}>✕</button>
              </div>
            </div>

            {/* Arama */}
            <input
              className={styles.searchInput}
              placeholder="Hizmet ara (kod, ad, matriks)…"
              value={aramaI}
              onChange={e => {
                setAramaI(e.target.value);
                loadItems(aktifListe.ID, 1, e.target.value);
              }}
            />
          </div>

          {/* Items tablosu */}
          <div className={styles.tableCard}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Akr.</th>
                    <th>Kod</th>
                    <th>Hizmet Adı</th>
                    <th>Limit</th>
                    <th>Birim</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingI && (
                    <tr><td colSpan={6} className={styles.emptyCell}>Yükleniyor…</td></tr>
                  )}
                  {!loadingI && items.length === 0 && (
                    <tr>
                      <td colSpan={6} className={styles.emptyCell}>
                        Bu listede henüz hizmet yok.
                        <button className={styles.btnLinkInline} onClick={openHizmetModal}>
                          Hizmet ekle →
                        </button>
                      </td>
                    </tr>
                  )}
                  {!loadingI && items.map(item => (
                    <tr key={item.ID} className={styles.tr}>
                      <td style={{ textAlign: "center", fontSize: 15 }}>
                        {item.Akreditasyon === "Var" ? "★" : ""}
                      </td>
                      <td className={styles.tdCode}>{item.Kod}</td>
                      <td className={styles.tdBold}>{item.Ad}</td>
                      <td>
                        {item.LimitDeger
                          ? <span className={styles.limitBadge}>{item.LimitDeger}</span>
                          : <span className={styles.tdSub}>—</span>
                        }
                      </td>
                      <td className={styles.tdSub}>{item.LimitBirimi || "—"}</td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={styles.btnIcon}
                            title="Limit / Not Düzenle"
                            onClick={() => setLimitModal(item)}
                          >
                            <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                              <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                            </svg>
                          </button>
                          <button
                            className={`${styles.btnIcon} ${styles.btnIconDanger}`}
                            title="Listeden Çıkar"
                            onClick={() => removeItem(item)}
                          >
                            <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {itemTotalPages > 1 && (
              <div className={styles.pagination}>
                <span className={styles.pageInfo}>{itemToplam} hizmet</span>
                <div className={styles.pageButtons}>
                  <button className={styles.pageBtn} disabled={itemSayfa <= 1} onClick={() => loadItems(aktifListe.ID, itemSayfa - 1, aramaI)}>‹</button>
                  {Array.from({ length: itemTotalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      className={`${styles.pageBtn} ${p === itemSayfa ? styles.pageBtnActive : ""}`}
                      onClick={() => loadItems(aktifListe.ID, p, aramaI)}
                    >{p}</button>
                  ))}
                  <button className={styles.pageBtn} disabled={itemSayfa >= itemTotalPages} onClick={() => loadItems(aktifListe.ID, itemSayfa + 1, aramaI)}>›</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
           MODAL: Yeni / Düzenle Liste
      ══════════════════════════════════════════════════════════════ */}
      {listeModal !== null && (
        <ListeModal
          initial={listeModal === "new" ? null : listeModal}
          onSave={saveListe}
          onClose={() => setListeModal(null)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════
           MODAL: Hizmet Ekle (seçici)
      ══════════════════════════════════════════════════════════════ */}
      {hizmetModal && (
        <div className={styles.overlay} onClick={() => setHizmetModal(false)}>
          <div className={styles.modal} style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Hizmet Ekle — {aktifListe?.ListeAdi}</span>
              <button className={styles.modalClose} onClick={() => setHizmetModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <input
                className={styles.searchInput}
                placeholder="Hizmet ara (kod, ad, matriks)…"
                value={availArama}
                onChange={e => {
                  setAvailArama(e.target.value);
                  setAvailSayfa(1);
                  loadAvailHizmetler(e.target.value, 1);
                }}
                style={{ marginBottom: 0 }}
                autoFocus
              />
              <div style={{ marginTop: 12 }}>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Akr.</th>
                        <th>Kod</th>
                        <th>Hizmet Adı</th>
                        <th>Matriks</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {availLoading && (
                        <tr><td colSpan={5} className={styles.emptyCell}>Yükleniyor…</td></tr>
                      )}
                      {!availLoading && availHizmetler.length === 0 && (
                        <tr><td colSpan={5} className={styles.emptyCell}>Sonuç bulunamadı.</td></tr>
                      )}
                      {!availLoading && availHizmetler.map(h => (
                        <tr key={h.ID} className={styles.tr}>
                          <td style={{ textAlign: "center" }}>{h.Akreditasyon === "Var" ? "★" : ""}</td>
                          <td className={styles.tdCode}>{h.Kod}</td>
                          <td className={styles.tdBold}>{h.Ad}</td>
                          <td className={styles.tdSub}>{h.Matriks || "—"}</td>
                          <td>
                            <button
                              className={styles.btnPrimarySmall}
                              onClick={async () => {
                                await addHizmet(h as any);
                              }}
                            >
                              Ekle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {availTotalPages > 1 && (
                  <div className={styles.pagination} style={{ marginTop: 8 }}>
                    <span className={styles.pageInfo}>{availToplam} hizmet</span>
                    <div className={styles.pageButtons}>
                      <button className={styles.pageBtn} disabled={availSayfa <= 1} onClick={() => { const p = availSayfa-1; setAvailSayfa(p); loadAvailHizmetler(availArama, p); }}>‹</button>
                      {Array.from({ length: Math.min(availTotalPages,7) }, (_, i) => i + 1).map(p => (
                        <button key={p} className={`${styles.pageBtn} ${p===availSayfa?styles.pageBtnActive:""}`} onClick={() => { setAvailSayfa(p); loadAvailHizmetler(availArama, p); }}>{p}</button>
                      ))}
                      <button className={styles.pageBtn} disabled={availSayfa >= availTotalPages} onClick={() => { const p = availSayfa+1; setAvailSayfa(p); loadAvailHizmetler(availArama, p); }}>›</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
           MODAL: Limit / Not Düzenle
      ══════════════════════════════════════════════════════════════ */}
      {limitModal && (
        <LimitModal
          item={limitModal}
          onSave={saveLimit}
          onClose={() => setLimitModal(null)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════
           MODAL: Onay
      ══════════════════════════════════════════════════════════════ */}
      {delConfirm && (
        <div className={styles.overlay}>
          <div className={styles.confirmBox}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <p className={styles.confirmMsg}>{delConfirm.msg}</p>
            <div className={styles.confirmBtns}>
              <button className={styles.btnGhost} onClick={() => setDelConfirm(null)}>İptal</button>
              <button className={styles.btnDanger} onClick={delConfirm.fn}>Evet, devam et</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className={`${styles.toast} ${styles[`toast_${toastMsg.type}`]}`}>
          <span>{toastMsg.type === "success" ? "✓" : toastMsg.type === "error" ? "✗" : "ℹ"}</span>
          {toastMsg.text}
        </div>
      )}
    </div>
  );
}

// ── ListeModal ────────────────────────────────────────────────────────────────
function ListeModal({
  initial, onSave, onClose,
}: {
  initial: Liste | null;
  onSave:  (form: { listeAdi: string; aciklama: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [listeAdi, setListeAdi] = useState(initial?.ListeAdi || "");
  const [aciklama, setAciklama] = useState(initial?.Aciklama || "");
  const [saving,   setSaving]   = useState(false);

  const styles2 = {
    overlay:    { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.4)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center" },
    modal:      { background:"#fff", borderRadius:16, width:480, maxWidth:"90vw", boxShadow:"0 20px 60px rgba(0,0,0,0.2)", overflow:"hidden" },
    header:     { padding:"18px 22px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between" },
    title:      { fontSize:16, fontWeight:700, color:"#1d1d1f" },
    close:      { background:"#f1f5f9", border:"none", borderRadius:6, width:28, height:28, cursor:"pointer", fontSize:15, color:"#6e6e73" },
    body:       { padding:"20px 22px", display:"flex", flexDirection:"column" as const, gap:14 },
    label:      { fontSize:12, fontWeight:600, color:"#374151", marginBottom:4, display:"block" },
    input:      { width:"100%", padding:"9px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:"inherit", outline:"none" },
    footer:     { padding:"14px 22px", borderTop:"1px solid #f1f5f9", display:"flex", justifyContent:"flex-end", gap:10 },
    btnCancel:  { padding:"8px 18px", border:"1px solid #e2e8f0", borderRadius:8, background:"#fff", cursor:"pointer", fontSize:13 },
    btnSave:    { padding:"8px 18px", background:"var(--color-accent,#0071e3)", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 },
  };

  return (
    <div style={styles2.overlay} onClick={onClose}>
      <div style={styles2.modal} onClick={e => e.stopPropagation()}>
        <div style={styles2.header}>
          <span style={styles2.title}>{initial ? "Listeyi Düzenle" : "Yeni Liste"}</span>
          <button style={styles2.close} onClick={onClose}>✕</button>
        </div>
        <div style={styles2.body}>
          <div>
            <label style={styles2.label}>Liste Adı <span style={{color:"#dc2626"}}>*</span></label>
            <input style={styles2.input} value={listeAdi} onChange={e => setListeAdi(e.target.value)} placeholder="Örn: Gıda Temel Paketi" autoFocus />
          </div>
          <div>
            <label style={styles2.label}>Açıklama</label>
            <textarea
              style={{ ...styles2.input, minHeight:64, resize:"vertical" }}
              value={aciklama}
              onChange={e => setAciklama(e.target.value)}
              placeholder="Opsiyonel"
            />
          </div>
        </div>
        <div style={styles2.footer}>
          <button style={styles2.btnCancel} onClick={onClose}>İptal</button>
          <button
            style={styles2.btnSave}
            disabled={saving || !listeAdi.trim()}
            onClick={async () => {
              setSaving(true);
              await onSave({ listeAdi, aciklama });
              setSaving(false);
            }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LimitModal ────────────────────────────────────────────────────────────────
function LimitModal({
  item, onSave, onClose,
}: {
  item:    Item;
  onSave:  (form: { limitDeger: string; limitBirimi: string; notlar: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [limitDeger,  setLimitDeger]  = useState(item.LimitDeger  || "");
  const [limitBirimi, setLimitBirimi] = useState(item.LimitBirimi || "");
  const [notlar,      setNotlar]      = useState(item.Notlar      || "");
  const [saving,      setSaving]      = useState(false);

  const s = {
    overlay:   { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.4)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center" },
    modal:     { background:"#fff", borderRadius:16, width:460, maxWidth:"90vw", boxShadow:"0 20px 60px rgba(0,0,0,0.2)", overflow:"hidden" },
    header:    { padding:"18px 22px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between" },
    title:     { fontSize:15, fontWeight:700, color:"#1d1d1f" },
    close:     { background:"#f1f5f9", border:"none", borderRadius:6, width:28, height:28, cursor:"pointer", fontSize:15, color:"#6e6e73" },
    body:      { padding:"20px 22px", display:"flex", flexDirection:"column" as const, gap:14 },
    label:     { fontSize:12, fontWeight:600, color:"#374151", marginBottom:4, display:"block" },
    input:     { width:"100%", padding:"9px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:"inherit", outline:"none" },
    footer:    { padding:"14px 22px", borderTop:"1px solid #f1f5f9", display:"flex", justifyContent:"flex-end", gap:10 },
    btnCancel: { padding:"8px 18px", border:"1px solid #e2e8f0", borderRadius:8, background:"#fff", cursor:"pointer", fontSize:13 },
    btnSave:   { padding:"8px 18px", background:"var(--color-accent,#0071e3)", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 },
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>Limit / Not Düzenle — {item.Ad}</span>
          <button style={s.close} onClick={onClose}>✕</button>
        </div>
        <div style={s.body}>
          <div>
            <label style={s.label}>Limit Değer</label>
            <input style={s.input} value={limitDeger} onChange={e => setLimitDeger(e.target.value)} placeholder="Örn: 0.5" autoFocus />
          </div>
          <div>
            <label style={s.label}>Limit Birimi</label>
            <input style={s.input} value={limitBirimi} onChange={e => setLimitBirimi(e.target.value)} placeholder="Örn: mg/kg" />
          </div>
          <div>
            <label style={s.label}>Notlar</label>
            <textarea
              style={{ ...s.input, minHeight:64, resize:"vertical" }}
              value={notlar}
              onChange={e => setNotlar(e.target.value)}
              placeholder="Opsiyonel"
            />
          </div>
        </div>
        <div style={s.footer}>
          <button style={s.btnCancel} onClick={onClose}>İptal</button>
          <button
            style={s.btnSave}
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave({ limitDeger, limitBirimi, notlar });
              setSaving(false);
            }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
