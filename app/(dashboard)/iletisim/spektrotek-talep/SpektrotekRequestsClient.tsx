"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, RefreshCw, X } from "lucide-react";
import { SPEKTROTEK_TALEP_DURUMLAR, type SpektrotekTalep, type SpektrotekTalepDurum, type SpektrotekTalepList } from "@/lib/spektrotekTalepRules";
import table from "@/app/styles/table.module.css";
import styles from "./requests.module.css";

type Fields={tarih:string;musteriAdi:string;kisiAdi:string;email:string;talep:string;ozet:string;konu:string;hesap:string;skor:string;durum:SpektrotekTalepDurum};
type Editor={id?:number;surum?:number;values:Fields};
const formatDate=(value:string)=>value?new Intl.DateTimeFormat("tr-TR",{timeZone:"Europe/Istanbul",dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"—";
function inputDate(value:string){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
async function api(path:string,init?:RequestInit){
  const response=await fetch(`/api/spektrotek-talepleri${path}`,{cache:"no-store",...init});
  const json=await response.json().catch(()=>({error:"Sunucudan yanıt alınamadı."}));
  if(!response.ok)throw new Error(json.error||"İstek tamamlanamadı.");return json;
}
export default function SpektrotekRequestsClient(){
  const [data,setData]=useState<SpektrotekTalepList|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[loadError,setLoadError]=useState("");
  const [searchInput,setSearchInput]=useState(""),[search,setSearch]=useState(""),[status,setStatus]=useState(""),[account,setAccount]=useState(""),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
  const [editor,setEditor]=useState<Editor|null>(null),[saving,setSaving]=useState(false),[pending,setPending]=useState<number|null>(null);
  const sequence=useRef(0),firstField=useRef<HTMLInputElement>(null);
  const query=useMemo(()=>`?${new URLSearchParams({q:search,durum:status,hesap:account,page:String(page)})}`,[search,status,account,page]);
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(searchInput);setPage(1);},300);return ()=>clearTimeout(timer);},[searchInput]);
  useEffect(()=>{
    const controller=new AbortController(),id=++sequence.current;
    setLoading(true);setLoadError("");
    void api(query,{signal:controller.signal}).then((result:SpektrotekTalepList)=>{if(id===sequence.current){setData(result);const last=Math.max(1,Math.ceil(result.total/result.limit));if(result.page>last)setPage(last);}}).catch(error=>{if(!controller.signal.aborted&&id===sequence.current)setLoadError(error instanceof Error?error.message:"Talepler alınamadı.");}).finally(()=>{if(id===sequence.current)setLoading(false);});
    return ()=>controller.abort();
  },[query,refresh]);
  useEffect(()=>{if(editor||saving||pending!==null)return;const timer=setInterval(()=>{if(document.visibilityState==="visible")setRefresh(value=>value+1);},30000);return ()=>clearInterval(timer);},[editor,saving,pending]);
  const editorOpen=editor!==null,editorId=editor?.id;
  useEffect(()=>{if(editorOpen)firstField.current?.focus();},[editorOpen,editorId]);
  function open(item?:SpektrotekTalep){
    setNotice("");setError("");
    setEditor(item?{id:item.id,surum:item.surum,values:{tarih:inputDate(item.tarih),musteriAdi:item.musteriAdi,kisiAdi:item.kisiAdi,email:item.email,talep:item.talep,ozet:item.ozet,konu:item.konu,hesap:item.hesap,skor:item.skor==null?"":String(item.skor),durum:item.durum}}:{values:{tarih:inputDate(new Date().toISOString()),musteriAdi:"",kisiAdi:"",email:"",talep:"",ozet:"",konu:"",hesap:"info",skor:"",durum:"Bekliyor"}});
  }
  function field(key:keyof Fields,value:string){setEditor(current=>current?{...current,values:{...current.values,[key]:value}}:current);}
  async function save(event:React.FormEvent){
    event.preventDefault();if(!editor||saving)return;setSaving(true);setError("");setNotice("");sequence.current++;
    try{
      const values=editor.values,body={...values,tarih:`${values.tarih}:00+03:00`,skor:values.skor===""?null:Number(values.skor),...(editor.id?{surum:editor.surum}:{})};
      await api(editor.id?`/${editor.id}`:"",{method:editor.id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      setEditor(null);setNotice(editor.id?"Talep güncellendi.":"Manuel talep eklendi.");setRefresh(value=>value+1);
    }catch(error){setError(error instanceof Error?error.message:"Kaydedilemedi.");setLoading(false);}finally{setSaving(false);}
  }
  async function changeStatus(item:SpektrotekTalep,durum:SpektrotekTalepDurum){
    if(pending!==null||saving)return;sequence.current++;setPending(item.id);setError("");setNotice("");
    setData(current=>current?{...current,items:current.items.map(row=>row.id===item.id?{...row,durum}:row)}:current);
    try{const result=await api(`/${item.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({durum,surum:item.surum})});setData(current=>current?{...current,items:current.items.map(row=>row.id===item.id?result.item:row)}:current);setNotice("Talebin durumu kaydedildi.");}
    catch(error){setData(current=>current?{...current,items:current.items.map(row=>row.id===item.id&&row.surum===item.surum?{...row,durum:item.durum}:row)}:current);setError(error instanceof Error?error.message:"Durum kaydedilemedi.");}
    finally{setPending(null);setLoading(false);setRefresh(value=>value+1);}
  }
  const pages=data?Math.max(1,Math.ceil(data.total/data.limit)):1;
  return <div className={`${table.page} ${styles.page}`}>
    <div className={table.pageHeader}><div><h1 className={table.pageTitle}>Spektrotek Talep</h1><p className={table.pageSubtitle}>Spektrotek üzerinden gelen müşteri talepleri ve manuel kayıtlar</p></div><div className={styles.actions}><button className={styles.button} type="button" onClick={()=>setRefresh(value=>value+1)} disabled={loading||saving||pending!==null}><RefreshCw size={14}/>Yenile</button><button className={styles.primary} type="button" onClick={()=>open()} disabled={saving||pending!==null}><Plus size={15}/>Manuel ekle</button></div></div>
    {(error||loadError)&&<p className={styles.error} role="alert">{error||loadError}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
    <section aria-label="Talep özeti" className={styles.summaryWrap}><table className={styles.summary}><caption>Tüm kayıtların özeti</caption><thead><tr><th>Toplam</th><th>Bekliyor</th><th>Teklif gönderildi</th><th>Manuel</th></tr></thead><tbody><tr>{[data?.summary.total,data?.summary.pending,data?.summary.offered,data?.summary.manual].map((value,index)=><td key={index}>{value??"—"}</td>)}</tr></tbody></table></section>
    <div className={styles.filters}><label className={styles.search}>Ara<input value={searchInput} maxLength={200} onChange={event=>setSearchInput(event.target.value)} placeholder="Müşteri, kişi, mail veya talep"/></label><label>Durum<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">Tümü</option>{SPEKTROTEK_TALEP_DURUMLAR.map(value=><option key={value}>{value}</option>)}</select></label><label>Hesap<select value={account} onChange={event=>{setAccount(event.target.value);setPage(1);}}><option value="">Tümü</option>{data?.accounts.map(value=><option key={value}>{value}</option>)}</select></label><span className={styles.muted}>{loading?"Yükleniyor…":`${data?.total??0} kayıt`} · 30 sn’de yenilenir</span></div>
    {editor&&<section className={styles.editor} aria-label={editor.id?"Talep düzenle":"Manuel talep ekle"}><header><h2>{editor.id?"Talep düzenle":"Manuel talep ekle"}</h2><button type="button" className={styles.icon} aria-label="Formu kapat" disabled={saving} onClick={()=>setEditor(null)}><X size={17}/></button></header><form onSubmit={save}><fieldset disabled={saving} className={styles.fields}>
      <label>Müşteri adı<input ref={firstField} required maxLength={300} value={editor.values.musteriAdi} onChange={event=>field("musteriAdi",event.target.value)}/></label>
      <label>Kişi adı<input maxLength={200} value={editor.values.kisiAdi} onChange={event=>field("kisiAdi",event.target.value)}/></label>
      <label>Mail adresi<input required type="email" maxLength={320} value={editor.values.email} onChange={event=>field("email",event.target.value)}/></label>
      <label>Tarih / saat (Türkiye)<input required type="datetime-local" value={editor.values.tarih} onChange={event=>field("tarih",event.target.value)}/></label>
      <label className={styles.wide}>Talep<input required maxLength={300} value={editor.values.talep} onChange={event=>field("talep",event.target.value)}/></label>
      <label>Hesap<input required maxLength={100} placeholder="info" value={editor.values.hesap} onChange={event=>field("hesap",event.target.value)}/></label>
      <label>Durum<select value={editor.values.durum} onChange={event=>field("durum",event.target.value)}>{SPEKTROTEK_TALEP_DURUMLAR.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className={styles.wide}>Mail konusu<input maxLength={500} value={editor.values.konu} onChange={event=>field("konu",event.target.value)}/></label>
      <label className={styles.wide}>Özet<textarea rows={3} maxLength={1000} value={editor.values.ozet} onChange={event=>field("ozet",event.target.value)}/></label>
      <label>Müşteri skoru (0–100)<input type="number" min={0} max={100} step={1} value={editor.values.skor} onChange={event=>field("skor",event.target.value)}/></label>
      <div className={`${styles.actions} ${styles.wide}`}><button className={styles.primary} type="submit">{saving?"Kaydediliyor…":"Kaydet"}</button><button className={styles.button} type="button" onClick={()=>setEditor(null)}>Vazgeç</button></div>
    </fieldset></form><p className={styles.muted}>Entegrasyondan gelen kayıtların mail bilgileri sonraki aktarımda güncellenebilir. Portalda seçilen durum korunur.</p></section>}
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{["Tarih","Müşteri adı","Mail adresi","Talep","Hesap","Durum","Düzenle"].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{data?.items.map(item=><tr key={item.id}>
      <td className={styles.date}>{formatDate(item.tarih)}</td><td><strong>{item.musteriAdi}</strong>{item.kisiAdi&&<small>{item.kisiAdi}</small>}{item.kaynakId.startsWith("manual:")&&<small>Manuel kayıt</small>}</td>
      <td><a href={`mailto:${item.email}`}>{item.email}</a></td><td className={styles.request}><span title={[item.konu,item.ozet].filter(Boolean).join("\n")}>{item.talep}</span>{(item.ozet||item.konu)&&<details><summary>Detay</summary>{item.konu&&<p><b>Konu:</b> {item.konu}</p>}{item.ozet&&<p>{item.ozet}</p>}{item.skor!=null&&<p>Skor: {item.skor}/100</p>}</details>}</td>
      <td>{item.hesap.includes("@")?item.hesap:`${item.hesap}@spektrotek.com`}</td><td><select className={styles.status} data-status={item.durum} aria-label={`${item.musteriAdi} talep durumu`} disabled={pending!==null||saving||Boolean(editor)} value={item.durum} onChange={event=>void changeStatus(item,event.target.value as SpektrotekTalepDurum)}>{SPEKTROTEK_TALEP_DURUMLAR.map(value=><option key={value}>{value}</option>)}</select>{item.durumKullanici&&<small title={item.durumTarihi?formatDate(item.durumTarihi):""}>{item.durumKullanici}</small>}</td>
      <td><button className={styles.icon} type="button" aria-label={`${item.musteriAdi} talebini düzenle`} disabled={pending!==null||saving} onClick={()=>open(item)}><Pencil size={15}/></button></td>
    </tr>)}{!data?.items.length&&<tr><td colSpan={7} className={styles.empty}>{loading?"Talepler yükleniyor…":error||loadError?"Talepler alınamadı. Yenile düğmesiyle tekrar deneyin.":search||status||account?"Filtrelere uygun talep bulunamadı.":"Henüz talep yok. Spektrotek aktarımıyla veya manuel ekleyerek kayıt oluşturabilirsiniz."}</td></tr>}</tbody></table></div>
    <div className={styles.pagination}><span>{page} / {pages}</span><button className={styles.button} type="button" disabled={page<=1||loading||saving||pending!==null} onClick={()=>setPage(value=>value-1)}>Önceki</button><button className={styles.button} type="button" disabled={page>=pages||loading||saving||pending!==null} onClick={()=>setPage(value=>value+1)}>Sonraki</button></div>
  </div>;
}
