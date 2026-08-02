"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../../kys.module.css";

type Birim = { id: number; ad: string };
type Detail = { talep: any; kalemler: any[]; kabuller: any[] };

const today = () => new Date().toISOString().slice(0, 10);

function dateFmt(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value).slice(0, 10);
}

export default function TalepDetayClient({ id }: { id: number }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [birimler, setBirimler] = useState<Birim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptItem, setAcceptItem] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    gelenMiktar: "",
    hedefBirimId: "",
    marka: "",
    lot: "",
    skt: "",
    kabulTarihi: today(),
    istenilenMiktardaGeldi: true,
    markaOzellikUygun: true,
    sktUygun: true,
    sertifikaGerekli: false,
    genelDegerlendirme: "",
  });

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/kys/talepler/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Talep detayı alınamadı.");
      setDetail(json);
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

  async function setStatus(durum: string) {
    setError("");
    const res = await fetch(`/api/kys/talepler/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durum }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Durum güncellenemedi.");
    fetchDetail();
  }

  function openAccept(item: any) {
    setAcceptItem(item);
    setForm({
      gelenMiktar: String(Math.max(Number(item.miktar || 0) - Number(item.kabulMiktari || 0), 0) || item.miktar || ""),
      hedefBirimId: "",
      marka: item.marka || "",
      lot: "",
      skt: "",
      kabulTarihi: today(),
      istenilenMiktardaGeldi: true,
      markaOzellikUygun: true,
      sktUygun: true,
      sertifikaGerekli: false,
      genelDegerlendirme: "",
    });
    setFormError("");
  }

  async function accept() {
    if (!acceptItem) return;
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/kys/talepler/${id}/kabul`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kalemId: acceptItem.id, hedefBirimId: form.hedefBirimId ? Number(form.hedefBirimId) : null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kabul kaydedilemedi.");
      setAcceptItem(null);
      fetchDetail();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !detail) return <div className={styles.tableCard}><div className={styles.empty}>Yükleniyor...</div></div>;
  if (error && !detail) return <div className={styles.errorBanner}>{error}</div>;
  if (!detail) return null;

  return (
    <>
      {error && <div className={styles.errorBanner}>{error}</div>}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link href="/laboratuvar/kys/talep-listesi" className={styles.cancelBtn}>← Talep listesi</Link>
          <span className={kys.pill}>{detail.talep.talepNo}</span>
          <span className={kys.pill}>{detail.talep.durum}</span>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.cancelBtn} onClick={() => window.print()}>Yazdır</button>
          <button className={styles.cancelBtn} onClick={() => setStatus("Onaylandı")}>Onayla</button>
          <button className={styles.cancelBtn} onClick={() => setStatus("İşleme Alındı")}>İşleme al</button>
          <button className={styles.cancelBtn} onClick={() => setStatus("İptal")}>İptal</button>
        </div>
      </div>

      <div className={styles.tableCard} style={{ padding: 16 }}>
        <div className={kys.detailGrid}>
          <div className={kys.detailItem}><div className={kys.detailLabel}>Talep türü</div><div className={kys.detailValue}>{detail.talep.talepTuru}</div></div>
          <div className={kys.detailItem}><div className={kys.detailLabel}>Oluşturan</div><div className={kys.detailValue}>{detail.talep.olusturanAd || "-"}</div></div>
          <div className={kys.detailItem}><div className={kys.detailLabel}>Tarih</div><div className={kys.detailValue}>{dateFmt(detail.talep.olusturmaTarihi)}</div></div>
          <div className={kys.detailItem}><div className={kys.detailLabel}>Not</div><div className={kys.detailValue}>{detail.talep.notlar || "-"}</div></div>
        </div>
        {detail.talep.teknikSartname && (
          <div className={kys.detailItem} style={{ marginTop: 12 }}>
            <div className={kys.detailLabel}>Teknik şartname</div>
            <div className={kys.detailValue} style={{ whiteSpace: "pre-wrap" }}>{detail.talep.teknikSartname}</div>
          </div>
        )}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead><tr><th>Kod</th><th>Malzeme</th><th>Miktar</th><th>Kabul</th><th>Marka</th><th>Not</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              {detail.kalemler.map(item => (
                <tr key={item.id}>
                  <td className={styles.tdMono}>{item.kod || item.stokKod || "-"}</td>
                  <td className={styles.tdName}>{item.malzemeAdi}</td>
                  <td>{item.miktar} {item.birim}</td>
                  <td>{item.kabulMiktari} {item.birim}</td>
                  <td>{item.marka || "-"}</td>
                  <td className={styles.tdAdres}>{item.kullaniciNotu || item.ozellik || "-"}</td>
                  <td><span className={kys.pill}>{item.durum}</span></td>
                  <td><button className={styles.editBtn} onClick={() => openAccept(item)}>✓</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead><tr><th>Kabul tarihi</th><th>Kalem</th><th>Gelen miktar</th><th>Değerlendiren</th><th>Genel değerlendirme</th></tr></thead>
            <tbody>
              {detail.kabuller.length === 0 ? <tr><td colSpan={5}><div className={styles.empty}>Kabul kaydı yok.</div></td></tr> : detail.kabuller.map(k => {
                const item = detail.kalemler.find(i => i.id === k.kalemId);
                return <tr key={k.id}><td>{dateFmt(k.kabulTarihi)}</td><td>{item?.malzemeAdi || k.kalemId}</td><td>{k.gelenMiktar}</td><td>{k.degerlendirenAd || "-"}</td><td>{k.genelDegerlendirme || "-"}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {acceptItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 820 }}>
            <div className={styles.modalHeader}><h2>Talep kabul - {acceptItem.malzemeAdi}</h2><button className={styles.modalClose} onClick={() => setAcceptItem(null)}>×</button></div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid3}>
                <div className={styles.formGroup}><label>Gelen miktar</label><input value={form.gelenMiktar} onChange={e => setForm(f => ({ ...f, gelenMiktar: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Kabul tarihi</label><input type="date" value={form.kabulTarihi} onChange={e => setForm(f => ({ ...f, kabulTarihi: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Depoya/Birime işle</label><select value={form.hedefBirimId} onChange={e => setForm(f => ({ ...f, hedefBirimId: e.target.value }))}><option value="">Seçiniz</option>{birimler.map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}</select></div>
                <div className={styles.formGroup}><label>Marka</label><input value={form.marka} onChange={e => setForm(f => ({ ...f, marka: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Lot</label><input value={form.lot} onChange={e => setForm(f => ({ ...f, lot: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>SKT</label><input type="date" value={form.skt} onChange={e => setForm(f => ({ ...f, skt: e.target.value }))} /></div>
                {[
                  ["İstenilen miktarda geldi mi?", "istenilenMiktardaGeldi"],
                  ["İstenilen marka ve özelliklerde geldi mi?", "markaOzellikUygun"],
                  ["Son kullanım tarihi uygun mu?", "sktUygun"],
                  ["Sertifika gerektiriyor mu?", "sertifikaGerekli"],
                ].map(([label, key]) => (
                  <label key={key} className={kys.pill}>
                    <input type="checkbox" checked={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
                <div className={`${styles.formGroup} ${styles.colSpan3}`}><label>Genel değerlendirme</label><textarea rows={3} value={form.genelDegerlendirme} onChange={e => setForm(f => ({ ...f, genelDegerlendirme: e.target.value }))} /></div>
              </div>
            </div>
            <div className={styles.modalFooter}><button className={styles.cancelBtn} onClick={() => setAcceptItem(null)}>Vazgeç</button><button className={styles.saveBtn} disabled={saving} onClick={accept}>{saving ? "Kaydediliyor..." : "Kabulü kaydet"}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
