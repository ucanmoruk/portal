"use client";
import { useEffect, useState } from "react";
import { type TelegramRecipient } from "@/lib/kysTelegramRules";
import styles from "./telegram.module.css";
type Config={users:Array<{id:string;name:string}>;recipients:TelegramRecipient[];deliveries:Array<{UserID:string;Kind:string;Period:string;State:string;LastError:string|null;UpdatedAt:string}>;enabled:boolean;botConfigured:boolean;cronConfigured:boolean;botUsername:string;schedule:string};
const stateLabels:Record<string,string>={pending:"Bekliyor",retry:"Tekrar denenecek",sent:"Gönderildi",failed:"Gönderilemedi",uncertain:"Sonuç belirsiz",sending:"Gönderim sürüyor",empty:"Kayıt yok",cancelled:"İptal"};
const blank={userId:"",chatId:"",enabled:true,daily:true,weekly:true,analyses:false,quality:false,overdue:false};
const labels={daily:"Günlük kişisel işler",weekly:"Haftalık kişisel işler",analyses:"Bugün çıkacak analizler",quality:"Kalite işleri",overdue:"Geciken işler — her gün hatırlat"};
export default function TelegramSettings(){
  const [open,setOpen]=useState(false),[data,setData]=useState<Config|null>(null),[form,setForm]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function load(){
    const response=await fetch("/api/kys/iletisim/telegram");const json=await response.json();
    if(!response.ok)throw new Error(json.error||"Ayarlar alınamadı.");setData(json);
  }
  useEffect(()=>{if(open)void load().catch(error=>setError(error.message));},[open]);
  function selectUser(userId:string){const saved=data?.recipients.find(item=>item.userId===userId);setForm(saved?{userId,chatId:saved.chatId,enabled:saved.enabled,daily:saved.daily,weekly:saved.weekly,analyses:saved.analyses,quality:saved.quality,overdue:saved.overdue}:{...blank,userId});setError("");setNotice("");}
  async function save(event:React.FormEvent){
    event.preventDefault();if(busy)return;setBusy(true);setError("");setNotice("");
    try{const response=await fetch("/api/kys/iletisim/telegram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const json=await response.json();if(!response.ok)throw new Error(json.error);await load();setNotice("Telegram alıcısı doğrulandı ve kaydedildi.");}catch(error){setError(error instanceof Error?error.message:"Kaydedilemedi.");}finally{setBusy(false);}
  }
  async function remove(){if(busy||!form.userId)return;setBusy(true);setError("");try{const response=await fetch("/api/kys/iletisim/telegram",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:form.userId})});const json=await response.json();if(!response.ok)throw new Error(json.error);await load();setForm({...blank});setNotice("Telegram bağlantısı kaldırıldı.");}catch(error){setError(error instanceof Error?error.message:"Kaldırılamadı.");}finally{setBusy(false);}}
  return <section className={styles.panel}>
    <button className={styles.toggle} type="button" aria-expanded={open} aria-controls="telegram-settings" onClick={()=>setOpen(value=>!value)}>Telegram Bildirimleri {open?"▴":"▾"}</button>
    {open&&<div id="telegram-settings" className={styles.body}>
      <header><h2>Alıcılar ve otomatik özetler</h2><p>Günlük 09.00 · Haftalık pazartesi 09.00 · Türkiye saati</p></header>
      {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.success} role="status">{notice}</p>}
      {!data?<p>Yükleniyor…</p>:<>
        <p className={styles.status}>Bot: {data.botConfigured?"Tanımlı":"Sunucuda token bekleniyor"} · Otomatik gönderim: {data.enabled?"Açık":"Kapalı"} · Zamanlayıcı anahtarı: {data.cronConfigured?"Tanımlı":"Bekleniyor"}</p>
        <form onSubmit={save} className={styles.form}>
          <label>Kullanıcı<select required disabled={busy} value={form.userId} onChange={event=>selectUser(event.target.value)}><option value="">Kişi seçin…</option>{data.users.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label>Telegram Chat ID<input required disabled={busy} inputMode="numeric" pattern="[1-9][0-9]*" value={form.chatId} onChange={event=>setForm({...form,chatId:event.target.value})} placeholder="Kişisel Telegram sohbetinin sayısal kimliği"/></label>
          <p className={styles.help}>Kişi önce botla sohbet başlatmalıdır. Chat ID, @kullanıcıadı değildir; bot yöneticisinden alınır. Kaydederken özel sohbet bilgileri Telegram’dan doğrulanır.{data.botUsername&&<> <a target="_blank" rel="noopener noreferrer" href={`https://t.me/${data.botUsername.replace(/^@/,"")}`}>Botu aç</a></>}</p>
          <p className={styles.help}>Geciken işler seçilirse, termini geçmiş ve tamamlanmamış kişisel görevler her gün 09.00’da ayrıca hatırlatılır. Görev tamamlandığında hatırlatma durur.</p><fieldset><legend>Bu kişiye gönderilecek bildirimler</legend>{(Object.keys(labels) as Array<keyof typeof labels>).map(key=><label key={key} className={styles.check}><input type="checkbox" disabled={busy} checked={form[key]} onChange={event=>setForm({...form,[key]:event.target.checked})}/>{labels[key]}</label>)}</fieldset>
          <label className={styles.check}><input type="checkbox" disabled={busy} checked={form.enabled} onChange={event=>setForm({...form,enabled:event.target.checked})}/>Bu kişinin bildirimleri açık</label>
          <div className={styles.actions}><button disabled={busy||!data.botConfigured||!form.userId} type="submit">{busy?"Kaydediliyor…":"Doğrula ve kaydet"}</button>{data.recipients.some(item=>item.userId===form.userId)&&<button type="button" disabled={busy} onClick={()=>void remove()}>Bağlantıyı kaldır</button>}</div>
        </form>
        <div className={styles.list}><h3>Kayıtlı alıcılar</h3>{data.recipients.length?data.recipients.map(recipient=><button type="button" key={recipient.userId} onClick={()=>selectUser(recipient.userId)}><strong>{data.users.find(user=>user.id===recipient.userId)?.name||recipient.userId}</strong><span>{recipient.chatLabel} · {recipient.enabled?"Açık":"Kapalı"}</span><small>{(Object.keys(labels) as Array<keyof typeof labels>).filter(key=>recipient[key]).map(key=>labels[key]).join(" · ")}</small></button>):<p>Henüz alıcı tanımlanmadı.</p>}</div>
        <details><summary>Son gönderim kayıtları</summary>{data.deliveries.length?<ul>{data.deliveries.map((delivery,index)=><li key={index}>{data.users.find(user=>user.id===delivery.UserID)?.name||delivery.UserID} · {labels[delivery.Kind as keyof typeof labels]||delivery.Kind} · {delivery.Period} · {stateLabels[delivery.State]||delivery.State}{delivery.LastError&&` — ${delivery.LastError}`}</li>)}</ul>:<p>Gönderim kaydı yok.</p>}</details>
      </>}
    </div>}
  </section>;
}
