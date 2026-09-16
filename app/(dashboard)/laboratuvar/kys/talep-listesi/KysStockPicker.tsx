"use client";
import {useEffect,useState} from "react";
import kys from "../kys.module.css";
export type KysStockOption={id:number;kod:string;ad:string;birim:string;ozellik:string};
export default function KysStockPicker({value,onPick}:{value:string;onPick:(stock:KysStockOption|null)=>void}){
  const [search,setSearch]=useState(""),[rows,setRows]=useState<KysStockOption[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    if(!search.trim()){setRows([]);setBusy(false);setError("");return;}
    const controller=new AbortController();const timer=setTimeout(async()=>{
      setBusy(true);setError("");try{const r=await fetch(`/api/kys/stoklar?search=${encodeURIComponent(search)}&limit=25`,{signal:controller.signal});const j=await r.json();if(!r.ok)throw new Error(j.error);setRows(j.data||[]);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Stoklar alınamadı.");}finally{if(!controller.signal.aborted)setBusy(false);}
    },250);return()=>{clearTimeout(timer);controller.abort();};
  },[search]);
  return <div className={kys.stockPicker}><input aria-label="Stok kodu veya adı ara" value={search} onChange={e=>setSearch(e.target.value)} placeholder={value || "Stok kodu veya adı yaz…"}/>
    {busy&&<small role="status">Aranıyor…</small>}{error&&<small role="alert">{error}</small>}
    {!!search.trim()&&!busy&&<div className={kys.stockPickerResults}>{rows.length?rows.map(s=><button key={s.id} type="button" onClick={()=>{onPick(s);setSearch("");}}><strong>{s.kod}</strong><span>{s.ad}</span><small>{s.birim}</small></button>):<small>Eşleşen stok yok. Manuel kalem ekleyebilirsiniz.</small>}</div>}
    {value && <div className={kys.stockPickerSelection}><span title={value}>{value}</span><button type="button" onClick={()=>{onPick(null);setSearch("");}}>Kaldır</button></div>}
  </div>;
}
