"use client";
import { useEffect, useState } from "react";
import WorkspaceClient from "./WorkspaceClient";
import s from "./Workspace.module.css";
export default function VerificationReports() {
 const [running,setRunning]=useState(false),[error,setError]=useState(""),[revision,setRevision]=useState(0);
 async function start() {setError("");try{const r=await fetch('/api/kys/dogrulama',{method:'POST'});const b=await r.json();if(!r.ok)throw Error(b.error);setRunning(b.running);}catch(e){setError(e instanceof Error?e.message:'Çalıştırılamadı.')}}
 useEffect(()=>{let alive=true;const poll=async()=>{try{const r=await fetch('/api/kys/dogrulama');if(!r.ok)return;const b=await r.json();if(!alive)return;setRunning(previous=>{if(previous&&!b.running)setRevision(v=>v+1);return b.running;});if(b.error)setError(b.error);}catch{}};void poll();const timer=setInterval(()=>void poll(),3000);return()=>{alive=false;clearInterval(timer)}},[]);
 const intro = <><div className={s.notice}>Geliştirme sırasında kaynak değişiklikleri sonrasında teknik kontroller otomatik çalışır. Her çalışmanın sonucu ayrı rapor olarak saklanır; detayını açıp yazdırabilir veya PDF olarak kaydedebilirsiniz.</div><div><button className={`${s.button} ${s.primary}`} disabled={running} onClick={()=>void start()}>{running?'Doğrulama çalışıyor…':'Şimdi doğrula ve rapor oluştur'}</button></div>{error&&<p className={s.error} role="alert">{error}</p>}</>;
 return <WorkspaceClient key={revision} module="yazilim-raporlari" intro={intro} />;
}
