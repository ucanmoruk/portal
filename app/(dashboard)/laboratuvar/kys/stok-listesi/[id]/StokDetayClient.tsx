"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../../kys.module.css";

type Birim = { id: number; ad: string };

type Detail = {
  stock: any;
  movements: any[];
  balances: any[];
  certificates: any[];
};

const today = () => new Date().toISOString().slice(0, 10);

function fmt(value: number) {
  return Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 4 });
}

function dateFmt(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value).slice(0, 10);
}

export default function StokDetayClient({ id }: { id: number }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [birimler, setBirimler] = useState<Birim[]>([]);
  const [tab, setTab] = useState<"bilgi" | "hareket" | "sertifika">("bilgi");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [moveForm, setMoveForm] = useState({
    hareketTipi: "Giriş",
    miktar: "",
    birim: "Adet",
    marka: "",
    lot: "",
    skt: "",
    stokGirisTarihi: today(),
    kaynakBirimId: "",
    hedefBirimId: "",
    aciklama: "",
  });
  const [uploading, setUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/kys/stoklar/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Stok detayı alınamadı.");
      setDetail(json);
      setMoveForm(f => ({ ...f, birim: json.stock?.birim || "Adet" }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);
  useEffect(() => {
    fetch("/api/kys/birimler").then(r => r.json()).then(j => setBirimler(j.data || [])).catch(() => {});
  }, []);

  async function saveMovement() {
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/kys/stoklar/${id}/hareketler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...moveForm,
          kaynakBirimId: moveForm.kaynakBirimId ? Number(moveForm.kaynakBirimId) : null,
          hedefBirimId: moveForm.hedefBirimId ? Number(moveForm.hedefBirimId) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Hareket kaydedilemedi.");
      setMoveOpen(false);
      fetchDetail();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadCert(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/kys/stoklar/${id}/sertifikalar`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sertifika yüklenemedi.");
      fetchDetail();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setImageUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/kys/stoklar/${id}/gorsel`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Görsel yüklenemedi.");
      fetchDetail();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImageUploading(false);
    }
  }

  if (loading && !detail) return <div className={styles.tableCard}><div className={styles.empty}>Yükleniyor...</div></div>;
  if (error && !detail) return <div className={styles.errorBanner}>{error}</div>;
  if (!detail) return null;
  const s = detail.stock;

  return (
    <>
      {error && <div className={styles.errorBanner}>{error}</div>}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link href="/laboratuvar/kys/stok-listesi" className={styles.cancelBtn}>← Stok listesi</Link>
          <span className={`${kys.pill} ${s.kritikMi ? kys.pillDanger : kys.pillOk}`}>
            {fmt(s.stokMiktari)} {s.birim}
          </span>
        </div>
        <div className={styles.toolbarRight}>
          <Link href={`/laboratuvar/kys/stok-karti-yazdir/${id}`} className={styles.addBtn}>Stok kartı yazdır</Link>
        </div>
      </div>

      <div className={styles.tableCard} style={{ padding: 16 }}>
        <div className={kys.tabs}>
          {[
            ["bilgi", "Stok Bilgileri"],
            ["hareket", "Stok Giriş / Çıkış ve Durum"],
            ["sertifika", "Stok Sertifikaları"],
          ].map(([key, label]) => (
            <button key={key} className={`${kys.tabButton} ${tab === key ? kys.tabButtonActive : ""}`} onClick={() => setTab(key as any)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "bilgi" && (
          <div className={kys.detailGrid}>
            <div className={kys.stockVisualPanel}>
              <div className={kys.stockVisualBox}>
                {s.hasImage ? (
                  <Image
                    src={`/api/kys/stoklar/${id}/gorsel?v=${encodeURIComponent(s.updatedAt || "")}`}
                    alt={s.ad || "Stok görseli"}
                    width={132}
                    height={132}
                    unoptimized
                    className={kys.stockVisualImg}
                  />
                ) : (
                  <div className={kys.stockVisualEmpty}>Ürün görseli yok</div>
                )}
              </div>
              <div className={kys.stockVisualInfo}>
                <div className={kys.detailLabel}>Ürün görseli</div>
                <div className={kys.formHint}>Stok kartında ürüne ait fotoğrafı saklayabilirsiniz. JPG, PNG veya WebP gibi görseller desteklenir.</div>
                <div className={kys.inlineActions}>
                  <input type="file" accept="image/*" onChange={e => uploadImage(e.target.files?.[0])} disabled={imageUploading} />
                  <span className={kys.formHint}>{imageUploading ? "Yükleniyor..." : s.gorselDosyaAdi || "Görsel seçin"}</span>
                </div>
              </div>
            </div>
            {[
              ["Barkod", s.barkod],
              ["Malzeme türü", s.malzemeTuru],
              ["Kod", s.kod],
              ["Ad", s.ad],
              ["Name", s.name],
              ["Cas No", s.casNo],
              ["Ambalaj", s.ambalaj],
              ["Saklama Koşulları", s.saklamaKosullari],
              ["Kritik Limit", `${fmt(s.kritikLimit)} ${s.birim}`],
              ["Stok Durumu", s.stokDurumu],
              ["Birim", s.birim],
              ["Özellik", s.ozellik],
            ].map(([label, value]) => (
              <div className={kys.detailItem} key={label}>
                <div className={kys.detailLabel}>{label}</div>
                <div className={kys.detailValue}>{value || "-"}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "hareket" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div className={kys.inlineActions}>
              <button className={styles.addBtn} onClick={() => setMoveOpen(true)}>+ Stok hareketi</button>
              <span className={kys.formHint}>Giriş, çıkış ve birimler arası aktarım izlenebilir şekilde saklanır.</span>
            </div>
            <div className={kys.detailGrid}>
              {detail.balances.length === 0 ? (
                <div className={kys.detailItem}><div className={kys.detailValue}>Birim bazlı stok yok</div></div>
              ) : detail.balances.map(b => (
                <div className={kys.detailItem} key={b.id}>
                  <div className={kys.detailLabel}>{b.birimAd}</div>
                  <div className={kys.detailValue}>{fmt(b.miktar)} {s.birim}</div>
                </div>
              ))}
            </div>
            <table className={kys.miniTable}>
              <thead><tr><th>Tarih</th><th>Tip</th><th>Miktar</th><th>Birim hareketi</th><th>Marka / Lot / SKT</th><th>Kullanıcı</th><th>Açıklama</th></tr></thead>
              <tbody>
                {detail.movements.length === 0 ? <tr><td colSpan={7}>Henüz hareket yok.</td></tr> : detail.movements.map(h => (
                  <tr key={h.id}>
                    <td>{dateFmt(h.createdAt)}</td>
                    <td><span className={kys.pill}>{h.hareketTipi}</span></td>
                    <td>{fmt(h.miktar)} {h.birim}</td>
                    <td>{h.kaynakBirimAd || "-"} → {h.hedefBirimAd || "-"}</td>
                    <td>{h.marka || "-"} / {h.lot || "-"} / {dateFmt(h.skt)}</td>
                    <td>{h.kullaniciAd || "-"}</td>
                    <td>{h.aciklama || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "sertifika" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div className={kys.inlineActions}>
              <input type="file" onChange={e => uploadCert(e.target.files?.[0])} disabled={uploading} />
              <span className={kys.formHint}>{uploading ? "Yükleniyor..." : "Ürünle gelen sertifikaları buraya yükleyebilirsiniz."}</span>
            </div>
            <table className={kys.miniTable}>
              <thead><tr><th>Dosya</th><th>Yükleyen</th><th>Tarih</th><th></th></tr></thead>
              <tbody>
                {detail.certificates.length === 0 ? <tr><td colSpan={4}>Sertifika yüklenmemiş.</td></tr> : detail.certificates.map(c => (
                  <tr key={c.id}>
                    <td>{c.dosyaAdi}</td>
                    <td>{c.yukleyenAd || "-"}</td>
                    <td>{dateFmt(c.createdAt)}</td>
                    <td><a className={styles.cancelBtn} href={`/api/kys/sertifikalar/${c.id}`}>İndir</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {moveOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 760 }}>
            <div className={styles.modalHeader}>
              <h2>Stok hareketi</h2>
              <button className={styles.modalClose} onClick={() => setMoveOpen(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid3}>
                <div className={styles.formGroup}><label>Hareket tipi</label><select value={moveForm.hareketTipi} onChange={e => setMoveForm(f => ({ ...f, hareketTipi: e.target.value }))}><option>Giriş</option><option>Çıkış</option><option>Aktarma</option></select></div>
                <div className={styles.formGroup}><label>Miktar</label><input value={moveForm.miktar} onChange={e => setMoveForm(f => ({ ...f, miktar: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Birim</label><input value={moveForm.birim} onChange={e => setMoveForm(f => ({ ...f, birim: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Kaynak birim</label><select value={moveForm.kaynakBirimId} onChange={e => setMoveForm(f => ({ ...f, kaynakBirimId: e.target.value }))}><option value="">Seçiniz</option>{birimler.map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}</select></div>
                <div className={styles.formGroup}><label>Hedef birim</label><select value={moveForm.hedefBirimId} onChange={e => setMoveForm(f => ({ ...f, hedefBirimId: e.target.value }))}><option value="">Seçiniz</option>{birimler.map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}</select></div>
                <div className={styles.formGroup}><label>Giriş tarihi</label><input type="date" value={moveForm.stokGirisTarihi} onChange={e => setMoveForm(f => ({ ...f, stokGirisTarihi: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Marka</label><input value={moveForm.marka} onChange={e => setMoveForm(f => ({ ...f, marka: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Lot</label><input value={moveForm.lot} onChange={e => setMoveForm(f => ({ ...f, lot: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>SKT</label><input type="date" value={moveForm.skt} onChange={e => setMoveForm(f => ({ ...f, skt: e.target.value }))} /></div>
                <div className={`${styles.formGroup} ${styles.colSpan3}`}><label>Açıklama</label><textarea rows={3} value={moveForm.aciklama} onChange={e => setMoveForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setMoveOpen(false)}>Vazgeç</button>
              <button className={styles.saveBtn} disabled={saving} onClick={saveMovement}>{saving ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
