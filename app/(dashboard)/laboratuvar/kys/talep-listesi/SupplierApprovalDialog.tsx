"use client";

import { useEffect, useMemo, useState } from "react";
import { PURCHASING_CC, PURCHASING_FROM, supplierEmails } from "@/lib/kysSupplierMailPolicy";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";

type Supplier={ID:number;Ad:string;Email:string};
export type SupplierMailSelection={tedarikciIds:number[];ekAlicilar:string[];yenidenGonder:boolean;gonderimAnahtari:string};
export default function SupplierApprovalDialog({requestNo,onClose,onSend,hasPrevious=false,sendingInProgress=false}:{requestNo:string;onClose:()=>void;onSend:(selection:SupplierMailSelection)=>Promise<boolean>;hasPrevious?:boolean;sendingInProgress?:boolean}){
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [selected,setSelected]=useState<number[]>([]);
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [listOpen,setListOpen]=useState(false);
  const [manual,setManual]=useState("");
  const [resend,setResend]=useState(false);
  const [sendKey]=useState(()=>globalThis.crypto.randomUUID());
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/kys/talepler/tedarikciler",{signal:controller.signal}).then(async response=>{
      const json=await response.json();if(!response.ok)throw new Error(json.error||"Tedarikçiler alınamadı.");setSuppliers(json.data||[]);
    }).catch(error=>{if(!controller.signal.aborted)setError(error.message||"Tedarikçiler alınamadı.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[]);
  const rows=useMemo(()=>suppliers.filter(s=>`${s.Ad} ${s.Email}`.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR"))),[suppliers,search]);
  async function approve(){
    if(busy||sendingInProgress||(hasPrevious&&!resend))return;
    setError("");
    try{
      const extra=supplierEmails(manual);
      if(!selected.length&&!extra.length){setError("En az bir tedarikçi veya e-posta adresi girin.");return;}
      setBusy(true);
      if(await onSend({tedarikciIds:selected,ekAlicilar:extra,yenidenGonder:resend,gonderimAnahtari:sendKey}))onClose();else setError("Gönderim tamamlanamadı. Talep detayındaki hata mesajını kontrol edin.");}
    catch(error){setError(error instanceof Error?error.message:"Gönderim tamamlanamadı.");}
    finally{setBusy(false);}
  }
  return <div className={styles.modalOverlay}><section className={`${styles.modal} ${kys.supplierModal} ${kys.approvalModal}`} role="dialog" aria-modal="true" aria-labelledby="supplier-approval-title" aria-busy={busy}
    onKeyDown={event=>{
      if(event.key==="Escape"&&!busy)onClose();
      if(event.key==="Tab"){
        const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}>
    <header className={styles.modalHeader}><h2 id="supplier-approval-title">Talep formunu tedarikçilere gönder</h2></header>
    <div className={styles.modalBody}>
    <p><strong>{requestNo}</strong> için seçilen her tedarikçiye ayrı bir e-posta gönderilir. Onaylanan talep formu PDF olarak eklenir.</p>
    <p className={kys.mailEnvelope}>Gönderen: {PURCHASING_FROM}<br/>CC: {PURCHASING_CC.join(", ")}</p>
    {error&&<p role="alert" className={styles.errorBar}>{error}</p>}
    {sendingInProgress&&<p role="status">Bir mail gönderimi hâlâ sürüyor. Sonuçlanınca yeniden gönderebilirsiniz.</p>}
    <button autoFocus type="button" className={styles.cancelBtn} disabled={busy||loading} aria-expanded={listOpen} aria-controls="supplier-mail-options" onClick={()=>setListOpen(open=>!open)}>{loading?"Tedarikçiler yükleniyor…":selected.length?`${selected.length} tedarikçi seçildi` :"Tedarikçi seç…"}</button>
    {selected.length>0&&<div className={kys.supplierSelected}>{selected.map(id=><span key={id}>{suppliers.find(s=>s.ID===id)?.Ad}<button type="button" disabled={busy} aria-label={`${suppliers.find(s=>s.ID===id)?.Ad} seçimini kaldır`} onClick={()=>setSelected(ids=>ids.filter(value=>value!==id))}>×</button></span>)}</div>}
    {listOpen&&<div id="supplier-mail-options" className={kys.supplierDropdown}>
    <input disabled={busy} className={styles.searchInput} aria-label="Tedarikçi ara" placeholder="Firma veya e-posta ara" value={search} onChange={event=>setSearch(event.target.value)}/>
    <div className={kys.supplierChoices}>
      {loading?<p>Yükleniyor…</p>:rows.length?rows.map(supplier=>{
        let addresses:string[]=[];try{addresses=supplierEmails(supplier.Email);}catch{/* Invalid addresses cannot be selected. */}
        return <label key={supplier.ID}><input type="checkbox" disabled={busy||!addresses.length||(!selected.includes(supplier.ID)&&selected.length>=50)} checked={selected.includes(supplier.ID)} onChange={event=>setSelected(ids=>event.target.checked?[...ids,supplier.ID]:ids.filter(id=>id!==supplier.ID))}/><span><strong>{supplier.Ad}</strong><small>{addresses.length?addresses.join("; "):"Geçerli e-posta adresi kaydedilmemiş."}</small></span></label>;
      }):<p>Tedarikçi bulunamadı.</p>}
    </div>
    <button type="button" className={styles.cancelBtn} onClick={()=>setListOpen(false)}>Seçimi tamamla</button>
    </div>}
    <label className={kys.manualRecipient}>Listede olmayan alıcılar<textarea rows={2} disabled={busy} value={manual} onChange={event=>setManual(event.target.value)} placeholder="teklif@firma.com; satis@digerfirma.com"/><small>Adresleri virgül veya noktalı virgülle ayırın. Tedarikçi listesine kaydedilmez; her adrese ayrı mail gönderilir.</small></label>
    {hasPrevious&&<label className={kys.resendConfirmation}><input type="checkbox" disabled={busy} checked={resend} onChange={event=>setResend(event.target.checked)}/><span>Önceki gönderimleri kontrol ettim. Seçtiğim alıcılara yeniden mail gönderilsin. Sonucu belirsiz bir mail ulaşmış olabilir.</span></label>}
    </div>
    <div className={styles.modalFooter}><button type="button" className={styles.cancelBtn} disabled={busy} onClick={onClose}>Vazgeç</button><button type="button" className={styles.addBtn} disabled={busy||loading||sendingInProgress||(!selected.length&&!manual.trim())||(hasPrevious&&!resend)} onClick={()=>void approve()}>{busy?"Gönderiliyor…":hasPrevious?"Yeniden mail gönder":"Mail gönder"}</button></div>
  </section></div>;
}
