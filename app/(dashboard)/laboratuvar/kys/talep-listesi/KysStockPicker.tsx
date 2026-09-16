"use client";
import {useEffect,useState} from "react";
export type KysStockOption={id:number;kod:string;ad:string;birim:string;ozellik:string};
export default function KysStockPicker({value,onPick}:{value:string;onPick:(stock:KysStockOption|null)=>void}){
  const [search,setSearch]=useState(""),[rows,setRows]=useState<KysStockOption[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    if(!search.trim()){setRows([]);setBusy(false);setError("");return;}
    const controller=new AbortController();const timer=setTimeout(async()=>{
      setBusy(true);setError("");try{const r=await fetch(`/api/kys/stoklar?search=${encodeURIComponent(search)}&limit=25`,{signal:controller.signal});const j=await r.json();if(!r.ok)throw new Error(j.error);setRows(j.data||[]);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Stoklar alınamadı.");}finally{if(!controller.signal.aborted)setBusy(false);}
    },250);return()=>{clearTimeout(timer);controller.abort();};
  },[search]);
  return <div><div style={{fontSize:12,marginBottom:5}}>{value||"Manuel kalem (stok seçilmedi)"}</div><input aria-label="Stok kodu veya adı ara" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Stok kodu veya adı yaz…"/>
    {busy&&<small role="status">Aranıyor…</small>}{error&&<small role="alert">{error}</small>}
    {!!search.trim()&&!busy&&<div style={{maxHeight:180,overflowY:"auto",border:"1px solid #dce1e8",marginTop:4}}>{rows.length?rows.map(s=><button key={s.id} type="button" style={{display:"block",width:"100%",textAlign:"left",padding:8,border:0,borderBottom:"1px solid #eee",background:"white",color:"#242424"}} onClick={()=>{onPick(s);setSearch("");}}>{s.kod} — {s.ad} ({s.birim})</button>):<small>Eşleşen stok yok. Manuel kalem ekleyebilirsiniz.</small>}</div>}
    <button type="button" onClick={()=>{onPick(null);setSearch("");}} style={{fontSize:11,marginTop:5}}>Stok seçimini kaldır / manuel</button>
  </div>;
}
