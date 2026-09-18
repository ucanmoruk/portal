"use client";
import { useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";
import KysStockPicker from "./KysStockPicker";
import { KYS_REQUEST_TYPES } from "@/lib/kysRequestRules";
type Stock = { id:number; kod:string; ad:string; birim:string; ozellik:string };
const emptyItem = { stokId:"",kod:"",malzemeAdi:"",miktar:"1",birim:"Adet",ozellik:"",marka:"",kullaniciNotu:"" };
type Item = typeof emptyItem;
type Draft = {seri?:string;firmaAdi?:string;talepTuru:string;notlar:string;teknikSartname:string;kalemler:Item[]};
export default function TalepEditModal({id,initial,onClose,onSaved}:{id:number;initial:Draft;onClose:()=>void;onSaved:()=>Promise<void>}) {
const [form,setForm]=useState({...initial,talepTuru:initial.seri === "Spektrotek" && initial.talepTuru !== "Sipariş" ? "Satın Alma" : initial.talepTuru});
const [saving,setSaving]=useState(false);
const [formError,setFormError]=useState("");
  function updateItem(index: number, key: keyof typeof emptyItem, value: string) {
    setForm(f => ({ ...f, kalemler: f.kalemler.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  }

  function pickStock(index: number, stock: Stock|null) {
    const stockId=stock?String(stock.id):"";
    setForm(f => {
      const items = [...f.kalemler];
      items[index] = {
        ...items[index],
        stokId: stockId,
        kod: stock?.kod || items[index].kod,
        malzemeAdi: stock?.ad || items[index].malzemeAdi,
        birim: stock?.birim || items[index].birim,
        ozellik: stock?.ozellik || items[index].ozellik,
      };
      return { ...f, kalemler: items };
    });
  }

async function save(){
 if(saving)return;setSaving(true);setFormError("");
 try{const res=await fetch(`/api/kys/talepler/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,islem:"duzenle",kalemler:form.kalemler.map(k=>({...k,stokId:k.stokId?Number(k.stokId):null}))})});const json=await res.json();if(!res.ok)throw new Error(json.error||"Talep güncellenemedi.");await onSaved();onClose();}
 catch(e){setFormError(e instanceof Error?e.message:"Talep güncellenemedi.");}finally{setSaving(false);}
}
return (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 940 }} role="dialog" aria-modal="true" aria-labelledby="request-title">
            <div className={styles.modalHeader}><h2 id="request-title">Talebi düzenle</h2><button className={styles.modalClose} aria-label="Kapat" disabled={saving} onClick={() => onClose()}>×</button></div>
            <div className={styles.modalBody}>
              {formError && <div role="alert" className={styles.formError}>{formError}</div>}
              {initial.seri === "Spektrotek" ? <div className={kys.spektrotekHeader} style={{marginBottom:18}}><div className={styles.formGroup}><label htmlFor="spektrotek-type">Talep türü</label><select id="spektrotek-type" value={form.talepTuru} onChange={e=>setForm(f=>({...f,talepTuru:e.target.value}))}><option>Satın Alma</option><option>Sipariş</option></select></div><div className={styles.formGroup}><label htmlFor="request-company">Firma adı</label><input id="request-company" maxLength={220} value={form.firmaAdi || ""} onChange={e=>setForm(f=>({...f,firmaAdi:e.target.value}))}/></div></div> : (              <div className={styles.formGroup} style={{ maxWidth: 280, marginBottom: 18 }}><label htmlFor="request-type">Talep türü</label><select id="request-type" value={form.talepTuru} onChange={e => setForm(f => ({ ...f, talepTuru: e.target.value }))}>{!KYS_REQUEST_TYPES.some(type => type === form.talepTuru) && <option>{form.talepTuru}</option>}{KYS_REQUEST_TYPES.map(type => <option key={type}>{type}</option>)}</select></div>)}
              <div className={kys.requestItems}>
                {form.kalemler.map((item, index) => (
                  <details key={index} open={index === form.kalemler.length - 1} className={kys.requestItem}>
                    <summary>Kalem {index + 1} · {item.malzemeAdi || "Yeni kalem"} · {item.miktar} {item.birim}</summary>
                    <div className={kys.requestItemGrid}>
                      {initial.seri !== "Spektrotek" && <div className={`${styles.formGroup} ${kys.itemStock}`}><label>Stok kodu / adı ara</label><KysStockPicker value={item.stokId ? `${item.kod} — ${item.malzemeAdi}` : ""} onPick={stock => pickStock(index, stock)} /></div>}
                      <div className={`${styles.formGroup} ${kys.itemCode}`}><label htmlFor={`item-code-${index}`}>Kod</label><input id={`item-code-${index}`} value={item.kod} onChange={e => updateItem(index, "kod", e.target.value)} /></div>
                      <div className={`${styles.formGroup} ${kys.itemName}`}><label htmlFor={`item-name-${index}`}>Malzeme / hizmet adı</label><input id={`item-name-${index}`} value={item.malzemeAdi} onChange={e => updateItem(index, "malzemeAdi", e.target.value)} /></div>
                      <div className={`${styles.formGroup} ${kys.itemQuantity}`}><label htmlFor={`item-quantity-${index}`}>Miktar</label><input id={`item-quantity-${index}`} inputMode="decimal" value={item.miktar} onChange={e => updateItem(index, "miktar", e.target.value)} /></div>
                      <div className={`${styles.formGroup} ${kys.itemUnit}`}><label htmlFor={`item-unit-${index}`}>Birim</label><input id={`item-unit-${index}`} readOnly={!!item.stokId} title={item.stokId ? "Stok kartı birimi" : undefined} value={item.birim} onChange={e => updateItem(index, "birim", e.target.value)} /></div>
                      <div className={`${styles.formGroup} ${kys.itemFeature}`}><label htmlFor={`item-feature-${index}`}>Özellik</label><textarea id={`item-feature-${index}`} rows={2} value={item.ozellik} onChange={e => updateItem(index, "ozellik", e.target.value)} /></div>
                    </div>
                    {form.kalemler.length > 1 && <button className={styles.cancelBtn} type="button" onClick={() => setForm(f => ({ ...f, kalemler: f.kalemler.filter((_, i) => i !== index) }))}>Kalemi kaldır</button>}
                  </details>
                ))}
                <button className={styles.cancelBtn} type="button" onClick={() => setForm(f => ({ ...f, kalemler: [...f.kalemler, { ...emptyItem }] }))}>+ Kalem ekle</button>
              </div>
              {form.talepTuru === "Cihaz" && <div className={styles.formGroup} style={{ marginTop: 18 }}><label htmlFor="request-spec">Teknik şartname</label><textarea id="request-spec" rows={4} value={form.teknikSartname} onChange={e => setForm(f => ({ ...f, teknikSartname: e.target.value }))} /></div>}
              <div className={styles.formGroup} style={{ marginTop: 18 }}><label htmlFor="request-notes">Not</label><textarea id="request-notes" rows={3} value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} placeholder="Talebin tamamı için açıklama veya teslimat notu…" /></div>
            </div>
            <div className={styles.modalFooter}><button className={styles.cancelBtn} disabled={saving} onClick={() => onClose()}>Vazgeç</button><button className={styles.saveBtn} disabled={saving} onClick={save}>{saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div>
          </div>
        </div>
);
}
