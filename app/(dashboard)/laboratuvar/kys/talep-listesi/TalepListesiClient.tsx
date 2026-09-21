"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../kys.module.css";
import KysStockPicker from "./KysStockPicker";
import { KYS_REQUEST_TYPES } from "@/lib/kysRequestRules";
import { ODEME_DURUMLARI } from "@/lib/faturaConstants";

type RequestRow = {
  id: number;
  talepNo: string;
  talepTuru: string;
  firmaAdi: string;
  faturaId:number|null; faturaNo:string; faturaTutari:number|null; vade:string|null; odemeDurumu:string;
  seri: string;
  durum: string;
  olusturanAd: string;
  olusturmaTarihi: string | null;
  onaylayanAd: string;
  onayTarihi: string | null;
  islemeAlanAd: string;
  islemeAlmaTarihi: string | null;
  kalemSayisi: number;
};
type Stock = { id: number; kod: string; ad: string; birim: string; ozellik: string };
type InvoiceOpt = { ID:number; FaturaNo:string; FirmaAd:string; Toplam:number|string; VadeTarihi:string|null; OdemeDurumu:string|null };
const errorMessage = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

const emptyItem = { stokId: "", kod: "", malzemeAdi: "", miktar: "1", birim: "Adet", ozellik: "" };

function InvoicePicker({value,onChange}:{value:InvoiceOpt|null;onChange:(invoice:InvoiceOpt|null)=>void}){
  const [query,setQuery]=useState(value?.FaturaNo||"");
  const [options,setOptions]=useState<InvoiceOpt[]>([]);
  const [open,setOpen]=useState(false);
  const box=useRef<HTMLDivElement>(null);
  useEffect(()=>{const timer=setTimeout(async()=>{if(!open)return;try{const qs=new URLSearchParams({search:query,yil:"",page:"1",limit:"50"});const res=await fetch(`/api/faturalar?${qs}`);const json=await res.json();setOptions(res.ok&&Array.isArray(json.data)?json.data:[]);}catch{setOptions([]);}},200);return()=>clearTimeout(timer);},[query,open]);
  useEffect(()=>{const close=(event:MouseEvent)=>{if(box.current&&!box.current.contains(event.target as Node))setOpen(false);};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);},[]);
  return <div ref={box} style={{position:"relative"}}><input value={query} placeholder="Fatura no veya firma ara..." onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);onChange(null);setOpen(true);}} />{open&&<div style={{position:"absolute",zIndex:20,left:0,right:0,top:"calc(100% + 4px)",maxHeight:260,overflowY:"auto",background:"var(--color-surface)",border:"1px solid var(--color-border)",borderRadius:8,boxShadow:"0 12px 28px rgba(0,0,0,.14)"}}>{options.length===0?<div style={{padding:10,fontSize:12,color:"var(--color-text-tertiary)"}}>Fatura bulunamadı.</div>:options.map(invoice=><button key={invoice.ID} type="button" onClick={()=>{onChange(invoice);setQuery(invoice.FaturaNo);setOpen(false);}} style={{display:"block",width:"100%",padding:"9px 10px",border:0,borderBottom:"1px solid var(--color-border-light)",background:"transparent",textAlign:"left",cursor:"pointer"}}><strong>{invoice.FaturaNo}</strong><span style={{display:"block",fontSize:11,color:"var(--color-text-tertiary)"}}>{invoice.FirmaAd||"Firmasız"} · {Number(invoice.Toplam||0).toLocaleString("tr-TR",{minimumFractionDigits:2})} TL</span></button>)}</div>}</div>;
}

function dateFmt(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value).slice(0, 10);
}

function statusClass(status: string) {
  if (status === "Tamamlandı") return kys.pillOk;
  if (status === "Kısmi Kabul" || status === "İşleme Alındı") return kys.pillWarn;
  return kys.pill;
}

const pageNums = (page: number, totalPages: number) => {
  const nums: Array<number | "..."> = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return nums;
};

export default function TalepListesiClient({ordersOnly=false}:{ordersOnly?:boolean}) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [search, setSearch] = useState("");
  const [durum, setDurum] = useState("");
  const [seri, setSeri] = useState("");
  const [odeme,setOdeme]=useState("");
  const [billing,setBilling]=useState<RequestRow|null>(null);
  const [billingInvoice,setBillingInvoice]=useState<InvoiceOpt|null>(null);
  const [newSeries, setNewSeries] = useState("Unique");
  const [tur, setTur] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ firmaAdi: "", talepTuru: "Stok Malzeme", notlar: "", teknikSartname: "", kalemler: [{ ...emptyItem }] });
  const pages = useMemo(() => pageNums(page, totalPages), [page, totalPages]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ search, durum, tur:ordersOnly?"Sipariş":tur, seri:ordersOnly?"Spektrotek":seri, odeme, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/kys/talepler?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Talep listesi alınamadı.");
      setRows(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e: unknown) {
      setError(errorMessage(e, "Talep listesi alınamadı."));
    } finally {
      setLoading(false);
    }
  }, [durum, limit, page, search, tur, seri, ordersOnly, odeme]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

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

  async function save() {
    if(saving)return;
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        ...form,
        seri: newSeries,
        kalemler: form.kalemler.map(k => ({ ...k, stokId: k.stokId ? Number(k.stokId) : null })),
      };
      const res = await fetch("/api/kys/talepler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Talep oluşturulamadı.");
      setModalOpen(false);
      setForm({ firmaAdi: "", talepTuru: "Stok Malzeme", notlar: "", teknikSartname: "", kalemler: [{ ...emptyItem }] });
      fetchRows();
    } catch (e: unknown) {
      setFormError(errorMessage(e, "Talep oluşturulamadı."));
    } finally {
      setSaving(false);
    }
  }


  async function saveBilling(id:number,body:Record<string,unknown>){if(saving)return;setSaving(true);setFormError("");setError("");try{const res=await fetch(`/api/kys/talepler/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,islem:"siparis-fatura"})});const json=await res.json();if(!res.ok)throw new Error(json.error||"Sipariş güncellenemedi.");setBilling(null);setBillingInvoice(null);await fetchRows();}catch(e){const message=errorMessage(e,"Sipariş güncellenemedi.");setFormError(message);setError(message);}finally{setSaving(false);}}
  async function deleteRow(row:RequestRow){
    if(!confirm(`${row.talepNo} listeden kaldırılacak. Bağlı kabul ve satın alma kayıtları silinecek, kabul edilen miktarlar stoktan düşülecek. Devam edilsin mi?`))return;
    try{const r=await fetch(`/api/kys/talepler/${row.id}`,{method:"DELETE"});const j=await r.json();if(!r.ok)throw new Error(j.error);await fetchRows();}catch(e){setError(errorMessage(e,"Talep silinemedi."));}
  }
  async function restoreRow(row:RequestRow){try{const r=await fetch(`/api/kys/talepler/${row.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({islem:"geri-al"})});const j=await r.json();if(!r.ok)throw new Error(j.error);await fetchRows();}catch(e){setError(errorMessage(e,"Geri alınamadı."));}}

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}><input className={styles.searchInput} placeholder="Talep no, tür, firma, oluşturan veya not ara..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
          <span className={styles.totalCount}>{total} {ordersOnly ? "sipariş" : "talep"}</span>
        </div>
        {ordersOnly ? <div className={styles.toolbarRight}><button className={styles.addBtn} onClick={()=>{setNewSeries("Spektrotek");setForm({firmaAdi:"",talepTuru:"Sipariş",notlar:"",teknikSartname:"",kalemler:[{...emptyItem}]});setModalOpen(true);}}>+ Yeni sipariş</button></div> : (        <div className={styles.toolbarRight}><Link className={styles.cancelBtn} href="/laboratuvar/kys/tedarikci-listesi">Tedarikçi listesi</Link><button className={styles.addBtn} onClick={() => { setNewSeries("Unique"); setForm({firmaAdi:"",talepTuru:"Stok Malzeme",notlar:"",teknikSartname:"",kalemler:[{...emptyItem}]}); setModalOpen(true); }}>+ Talep oluştur</button><button className={styles.addBtn} onClick={() => {setNewSeries("Spektrotek");setForm({firmaAdi:"",talepTuru:"Satın Alma",notlar:"",teknikSartname:"",kalemler:[{...emptyItem}]});setModalOpen(true);}}>Spektrotek</button></div>)}
      </div>
      <div className={kys.filterRow}>
        {!ordersOnly && <select aria-label="Talep serisi" className={kys.select} value={seri} onChange={e=>{setSeri(e.target.value);setPage(1);}}><option value="">Tümü</option><option>Unique</option><option>Spektrotek</option></select>}
        {!ordersOnly && <select className={kys.select} value={tur} onChange={e => { setTur(e.target.value); setPage(1); }}><option value="">Tüm türler</option>{KYS_REQUEST_TYPES.map(type => <option key={type}>{type}</option>)}<option value="Sarf">Sarf (eski kayıtlar)</option></select>}
        <select className={kys.select} value={durum} onChange={e => { setDurum(e.target.value); setPage(1); }}><option value="">Tüm durumlar</option><option>Onay Bekliyor</option><option>Onaylandı</option><option>İşleme Alındı</option><option>Kısmi Kabul</option><option>Tamamlandı</option><option>İptal</option><option value="Silindi">Silinen talepler</option></select>
      {ordersOnly && <select aria-label="Ödeme durumu filtresi" className={kys.select} value={odeme} onChange={e=>{setOdeme(e.target.value);setPage(1);}}><option value="">Tüm ödeme durumları</option>{ODEME_DURUMLARI.map(value=><option key={value}>{value}</option>)}</select>}
        <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / sayfa</option>)}</select>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <div className={styles.tableWrapper}>
          {ordersOnly ? (          <table className={styles.table}><thead><tr><th>Sipariş Kodu</th><th>Firma Adı</th><th>Sipariş Durumu</th><th>Fatura No</th><th>Fatura Tutarı</th><th>Vade</th><th>Ödeme Durumu</th><th></th></tr></thead><tbody>{loading?<tr><td colSpan={8}>Yükleniyor…</td></tr>:rows.length===0?<tr><td colSpan={8} className={styles.empty}>Sipariş bulunamadı.</td></tr>:rows.map(row=><tr key={row.id}><td><Link className={kys.requestLink} href={`/laboratuvar/kys/talep-listesi/${row.id}`}>{row.talepNo}</Link></td><td>{row.firmaAdi}</td><td>{row.durum}</td><td>{row.faturaNo||"-"}</td><td>{row.faturaTutari==null?"-":row.faturaTutari.toLocaleString("tr-TR",{minimumFractionDigits:2})}</td><td>{dateFmt(row.vade)}</td><td><span className={`${kys.pill} ${row.odemeDurumu==="Ödendi"?kys.pillOk:row.odemeDurumu==="Kısmen Ödendi"?kys.pillWarn:""}`}>{row.faturaId?row.odemeDurumu:"-"}</span></td><td><button type="button" className={`${styles.editBtn} ${kys.iconButton}`} title="Fatura seç" aria-label={`${row.talepNo} için fatura seç`} onClick={()=>{setFormError("");setBilling(row);setBillingInvoice(row.faturaId?{ID:row.faturaId,FaturaNo:row.faturaNo,FirmaAd:"",Toplam:row.faturaTutari||0,VadeTarihi:row.vade,OdemeDurumu:row.odemeDurumu}:null);}}><Pencil size={16} aria-hidden="true" /></button></td></tr>)}</tbody></table>) : (          <table className={styles.table}>
            <thead><tr><th>Talep no</th><th>Tür</th><th>Durum</th><th>Kalem</th><th>Oluşturan</th><th>Onaylayan</th><th>İşleme alan</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8}><div className={styles.skeleton} /></td></tr> : rows.length === 0 ? <tr><td colSpan={8}><div className={styles.empty}>Talep bulunamadı.</div></td></tr> : rows.map(row => (
                <tr key={row.id}>
                  <td className={styles.tdMono}><Link className={kys.requestLink} href={`/laboratuvar/kys/talep-listesi/${row.id}`}>{row.talepNo}</Link></td>
                  <td>{row.seri === "Spektrotek" ? `${row.talepTuru === "Sipariş" ? "Sipariş" : "Satın Alma"} / ${row.firmaAdi}` : row.talepTuru}</td>
                  <td><span className={`${kys.pill} ${statusClass(row.durum)}`}>{row.durum}</span></td>
                  <td>{row.kalemSayisi}</td>
                  <td>{row.olusturanAd || "-"}<div className={kys.muted}>{dateFmt(row.olusturmaTarihi)}</div></td>
                  <td>{row.onaylayanAd || "-"}<div className={kys.muted}>{dateFmt(row.onayTarihi)}</div></td>
                  <td>{row.islemeAlanAd || "-"}<div className={kys.muted}>{dateFmt(row.islemeAlmaTarihi)}</div></td>
                  <td>{row.durum==="Silindi"?<button className={styles.cancelBtn} onClick={()=>restoreRow(row)}>Geri al</button>:<button className={`${styles.deleteBtn} ${kys.iconButton}`} title="Talebi sil" aria-label={`${row.talepNo} talebini sil`} onClick={()=>deleteRow(row)}><Trash2 size={16} aria-hidden="true" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>)}
        </div>
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
          {pages.map((p, i) => p === "..." ? <span className={styles.pageDots} key={i}>...</span> : <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ""}`} onClick={() => setPage(p)}>{p}</button>)}
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</button>
        </div>
      </div>

      {billing && <div className={styles.modalOverlay}><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="billing-title"><div className={styles.modalHeader}><h2 id="billing-title">Fatura seç · {billing.talepNo}</h2><button disabled={saving} aria-label="Kapat" className={styles.modalClose} onClick={()=>{setBilling(null);setBillingInvoice(null);}}>×</button></div><div className={styles.modalBody}>{formError && <div role="alert" className={styles.formError}>{formError}</div>}<div className={styles.formGroup}><label>Fatura No</label><InvoicePicker value={billingInvoice} onChange={setBillingInvoice}/></div>{billingInvoice&&<div className={styles.formGrid} style={{marginTop:16}}><div className={styles.formGroup}><label>Fatura Tutarı</label><input readOnly value={`${Number(billingInvoice.Toplam||0).toLocaleString("tr-TR",{minimumFractionDigits:2})} TL`}/></div><div className={styles.formGroup}><label>Vade</label><input readOnly value={dateFmt(billingInvoice.VadeTarihi)}/></div><div className={styles.formGroup}><label>Ödeme Durumu</label><input readOnly value={billingInvoice.OdemeDurumu||"Ödeme Bekliyor"}/></div></div>}</div><div className={styles.modalFooter}><button disabled={saving} className={styles.cancelBtn} onClick={()=>{setBilling(null);setBillingInvoice(null);}}>Vazgeç</button>{billing.faturaId&&<button disabled={saving} className={styles.cancelBtn} onClick={()=>saveBilling(billing.id,{faturaId:null})}>Bağlantıyı kaldır</button>}<button disabled={saving||!billingInvoice} className={styles.saveBtn} onClick={()=>saveBilling(billing.id,{faturaId:billingInvoice?.ID??null})}>{saving?"Kaydediliyor…":"Kaydet"}</button></div></div></div>}
      {modalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 940 }} role="dialog" aria-modal="true" aria-labelledby="request-title">
            <div className={styles.modalHeader}><h2 id="request-title">{newSeries === "Spektrotek" ? "Spektrotek talebi oluştur" : "Yeni talep oluştur"}</h2><button className={styles.modalClose} aria-label="Kapat" disabled={saving} onClick={() => setModalOpen(false)}>×</button></div>
            <div className={styles.modalBody}>
              {formError && <div role="alert" className={styles.formError}>{formError}</div>}
              {newSeries === "Spektrotek" ? <div className={kys.spektrotekHeader} style={{marginBottom:18}}><div className={styles.formGroup}><label htmlFor="spektrotek-type">Talep türü</label><select id="spektrotek-type" value={form.talepTuru} onChange={e=>setForm(f=>({...f,talepTuru:e.target.value}))}><option>Satın Alma</option><option>Sipariş</option></select></div><div className={styles.formGroup}><label htmlFor="request-company">Firma adı</label><input id="request-company" maxLength={220} value={form.firmaAdi} onChange={e=>setForm(f=>({...f,firmaAdi:e.target.value}))} /></div></div> : (              <div className={styles.formGroup} style={{ maxWidth: 280, marginBottom: 18 }}><label htmlFor="request-type">Talep türü</label><select id="request-type" value={form.talepTuru} onChange={e => setForm(f => ({ ...f, talepTuru: e.target.value }))}>{KYS_REQUEST_TYPES.map(type => <option key={type}>{type}</option>)}</select></div>)}
              <div className={kys.requestItems}>
                {form.kalemler.map((item, index) => (
                  <details key={index} open={index === form.kalemler.length - 1} className={kys.requestItem}>
                    <summary>Kalem {index + 1} · {item.malzemeAdi || "Yeni kalem"} · {item.miktar} {item.birim}</summary>
                    <div className={kys.requestItemGrid}>
                      {newSeries !== "Spektrotek" && <div className={`${styles.formGroup} ${kys.itemStock}`}><label>Stok kodu / adı ara</label><KysStockPicker value={item.stokId ? `${item.kod} — ${item.malzemeAdi}` : ""} onPick={stock => pickStock(index, stock)} /></div>}
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
            <div className={styles.modalFooter}><button className={styles.cancelBtn} disabled={saving} onClick={() => setModalOpen(false)}>Vazgeç</button><button className={styles.saveBtn} disabled={saving} onClick={save}>{saving ? "Oluşturuluyor…" : "Talep oluştur"}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
