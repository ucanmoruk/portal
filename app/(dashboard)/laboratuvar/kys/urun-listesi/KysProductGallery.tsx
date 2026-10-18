"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

export type StockPhoto = { id: number; dosyaAdi: string; altMetin: string; sira: number };

function Photo({ photo, stockId, cover, disabled, onSave }: {
  photo: StockPhoto; stockId: number; cover: boolean; disabled: boolean;
  onSave: (photoId: number, values: { altMetin?: string; sira?: number; kapak?: boolean; silindi?: boolean }) => Promise<void>;
}) {
  const [alt, setAlt] = useState(photo.altMetin);
  const [order, setOrder] = useState(String(photo.sira));
  return <div className={kys.productPhoto}>
    <Image src={`/api/kys/stoklar/${stockId}/gorseller/${photo.id}`} alt={photo.altMetin || photo.dosyaAdi} width={180} height={140} unoptimized />
    <strong>{cover ? "Kapak · " : ""}{photo.dosyaAdi}</strong>
    <label htmlFor={`photo-alt-${photo.id}`}>Görsel açıklaması</label>
    <input id={`photo-alt-${photo.id}`} maxLength={220} value={alt} disabled={disabled} onChange={e => setAlt(e.target.value)} />
    <label htmlFor={`photo-order-${photo.id}`}>Sıra</label>
    <input id={`photo-order-${photo.id}`} type="number" min={0} max={10000} step={1} value={order} disabled={disabled} onChange={e => setOrder(e.target.value)} />
    <div className={kys.inlineActions}>
      <button type="button" className={styles.cancelBtn} disabled={disabled || order === ""} onClick={() => void onSave(photo.id, { altMetin: alt, sira: Number(order) })}>Kaydet</button>
      {!cover && <button type="button" className={styles.cancelBtn} disabled={disabled} onClick={() => void onSave(photo.id, { kapak: true })}>Kapak yap</button>}
      <button type="button" className={styles.cancelBtn} disabled={disabled} onClick={() => void onSave(photo.id, { silindi: true })}>Kaldır</button>
    </div>
  </div>;
}

export default function KysProductGallery({ stockId, images, hasOriginal, onChanged }: {
  stockId: number; images: StockPhoto[]; hasOriginal: boolean; onChanged: () => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inputKey, setInputKey] = useState(0);

  async function upload() {
    if (busy || !files.length) return;
    if (files.length + images.length + (hasOriginal ? 1 : 0) > 24) { setError("Bir üründe en fazla 24 görsel olabilir."); return; }
    setBusy(true); setError(""); setMessage("");
    let completed = 0;
    try {
      for (const file of files) {
        const body = new FormData(); body.append("file", file);
        const response = await fetch(`/api/kys/stoklar/${stockId}/gorseller`, { method: "POST", body });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Görsel yüklenemedi.");
        completed++;
      }
      setMessage(`${completed} görsel eklendi.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Görsel yüklenemedi."); }
    finally {
      setFiles(files.slice(completed)); setInputKey(key => key + 1);
      if (completed) await onChanged();
      setBusy(false);
    }
  }

  async function edit(photoId: number, values: { altMetin?: string; sira?: number; kapak?: boolean; silindi?: boolean }) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/kys/stoklar/${stockId}/gorseller/${photoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Görsel güncellenemedi.");
      await onChanged(); setMessage("Görsel güncellendi.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Görsel güncellenemedi."); }
    finally { setBusy(false); }
  }

  return <section className={kys.productSection} aria-label="Ürün görselleri">
    <h2>Ürün görselleri</h2>
    <p className={kys.formHint}>En fazla 24 görsel, her biri en fazla 5 MB. JPG, PNG ve WebP. Sıralamadaki ilk görsel kapak olarak kullanılır.</p>
    {error && <p className={styles.formError} role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {hasOriginal && <p className={kys.formHint}>Mevcut stok fotoğrafı korunuyor; ilk eklemede galeriye taşınacak.</p>}
    <div className={kys.inlineActions}>
      <input key={inputKey} type="file" aria-label="Ürün fotoğrafları seç" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => setFiles(Array.from(e.target.files || []))} />
      <button type="button" className={styles.addBtn} disabled={busy || !files.length} onClick={() => void upload()}>{busy ? "İşleniyor…" : "Görselleri ekle"}</button>
    </div>
    {!!files.length && <p className={kys.formHint}>{files.length} görsel yüklenmeyi bekliyor.</p>}
    <div className={kys.productGallery}>{images.map((photo, index) => <Photo key={`${photo.id}-${photo.sira}-${photo.altMetin}`} photo={photo} stockId={stockId} cover={index === 0} disabled={busy} onSave={edit} />)}</div>
  </section>;
}
