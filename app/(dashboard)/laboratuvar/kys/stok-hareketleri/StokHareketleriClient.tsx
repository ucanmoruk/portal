"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type Stock = { id: number; kod: string; ad: string; birim: string; stokMiktari: number; kritikMi: boolean };
type Birim = { id: number; ad: string };
const errorMessage = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

const today = () => new Date().toISOString().slice(0, 10);

export default function StokHareketleriClient() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [birimler, setBirimler] = useState<Birim[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
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

  const loadStocks = useCallback(async () => {
    const qs = new URLSearchParams({ search, limit: "50", sort: "miktar-asc" });
    const res = await fetch(`/api/kys/stoklar?${qs.toString()}`);
    const json = await res.json();
    setStocks(json.data || []);
  }, [search]);

  useEffect(() => {
    loadStocks().catch(() => {});
  }, [loadStocks]);
  useEffect(() => {
    fetch("/api/kys/birimler").then(r => r.json()).then(j => setBirimler(j.data || [])).catch(() => {});
  }, []);

  const selectedStock = stocks.find(s => String(s.id) === selected);

  async function save() {
    if (!selected) {
      setError("Önce stok seçiniz.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/kys/stoklar/${selected}/hareketler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          kaynakBirimId: form.kaynakBirimId ? Number(form.kaynakBirimId) : null,
          hedefBirimId: form.hedefBirimId ? Number(form.hedefBirimId) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Stok hareketi kaydedilemedi.");
      setForm(f => ({ ...f, miktar: "", marka: "", lot: "", skt: "", aciklama: "" }));
      await loadStocks();
    } catch (e: unknown) {
      setError(errorMessage(e, "Stok hareketi kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.tableCard} style={{ padding: 18 }}>
      {error && <div className={styles.formError}>{error}</div>}
      <div className={styles.formGrid3}>
        <div className={`${styles.formGroup} ${styles.colSpan3}`}>
          <label>Stok ara</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Kod veya ad..." />
        </div>
        <div className={`${styles.formGroup} ${styles.colSpan3}`}>
          <label>Stok kartı</label>
          <select value={selected} onChange={e => {
            const stock = stocks.find(s => String(s.id) === e.target.value);
            setSelected(e.target.value);
            if (stock) setForm(f => ({ ...f, birim: stock.birim || "Adet" }));
          }}>
            <option value="">Seçiniz</option>
            {stocks.map(s => <option key={s.id} value={s.id}>{s.kod} - {s.ad} ({s.stokMiktari} {s.birim})</option>)}
          </select>
        </div>
        {selectedStock && (
          <div className={`${styles.colSpan3} ${kys.inlineActions}`}>
            <span className={`${kys.pill} ${selectedStock.kritikMi ? kys.pillDanger : kys.pillOk}`}>Mevcut: {selectedStock.stokMiktari} {selectedStock.birim}</span>
            <Link href={`/laboratuvar/kys/stok-listesi/${selectedStock.id}`} className={styles.cancelBtn}>Stok detayına git</Link>
          </div>
        )}
        <div className={styles.formGroup}><label>Hareket tipi</label><select value={form.hareketTipi} onChange={e => setForm(f => ({ ...f, hareketTipi: e.target.value }))}><option>Giriş</option><option>Çıkış</option><option>Aktarma</option></select></div>
        <div className={styles.formGroup}><label>Miktar</label><input value={form.miktar} onChange={e => setForm(f => ({ ...f, miktar: e.target.value }))} /></div>
        <div className={styles.formGroup}><label>Birim</label><input value={form.birim} onChange={e => setForm(f => ({ ...f, birim: e.target.value }))} /></div>
        <div className={styles.formGroup}><label>Kaynak birim</label><select value={form.kaynakBirimId} onChange={e => setForm(f => ({ ...f, kaynakBirimId: e.target.value }))}><option value="">Seçiniz</option>{birimler.map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}</select></div>
        <div className={styles.formGroup}><label>Hedef birim</label><select value={form.hedefBirimId} onChange={e => setForm(f => ({ ...f, hedefBirimId: e.target.value }))}><option value="">Seçiniz</option>{birimler.map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}</select></div>
        <div className={styles.formGroup}><label>Giriş tarihi</label><input type="date" value={form.stokGirisTarihi} onChange={e => setForm(f => ({ ...f, stokGirisTarihi: e.target.value }))} /></div>
        <div className={styles.formGroup}><label>Marka</label><input value={form.marka} onChange={e => setForm(f => ({ ...f, marka: e.target.value }))} /></div>
        <div className={styles.formGroup}><label>Lot</label><input value={form.lot} onChange={e => setForm(f => ({ ...f, lot: e.target.value }))} /></div>
        <div className={styles.formGroup}><label>SKT</label><input type="date" value={form.skt} onChange={e => setForm(f => ({ ...f, skt: e.target.value }))} /></div>
        <div className={`${styles.formGroup} ${styles.colSpan3}`}><label>Açıklama</label><textarea rows={3} value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} /></div>
      </div>
      <div className={styles.modalFooter} style={{ paddingLeft: 0, paddingRight: 0, marginTop: 14 }}>
        <button className={styles.saveBtn} disabled={saving} onClick={save}>{saving ? "Kaydediliyor..." : "Stok hareketini kaydet"}</button>
      </div>
    </div>
  );
}
