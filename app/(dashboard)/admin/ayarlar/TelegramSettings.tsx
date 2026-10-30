"use client";
import { useEffect, useState } from "react";
import { type TelegramRecipient } from "@/lib/kysTelegramRules";
import styles from "./telegram.module.css";
type Config={users:Array<{id:string;name:string}>;recipients:TelegramRecipient[];deliveries:Array<{UserID:string;Kind:string;Period:string;State:string;LastError:string|null;UpdatedAt:string}>;enabled:boolean;botConfigured:boolean;interactionEnabled:boolean;cronConfigured:boolean;botUsername:string;schedule:string};
type DiscoveredChat={chatId:string;name:string;username:string};
const stateLabels:Record<string,string>={pending:"Bekliyor",retry:"Tekrar denenecek",sent:"Gönderildi",failed:"Gönderilemedi",uncertain:"Sonuç belirsiz",sending:"Gönderim sürüyor",empty:"Kayıt yok",cancelled:"İptal",skipped:"Yeniden deneme bekleniyor",error:"Gönderilemedi"};
const blank={userId:"",chatId:"",enabled:true,daily:true,weekly:true,analyses:false,quality:false,overdue:false};
const labels={daily:"Günlük kişisel işler",weekly:"Haftalık kişisel işler",analyses:"Bugün çıkacak analizler",quality:"Kalite işleri",overdue:"Geciken işler — her gün hatırlat"};
export default function TelegramSettings(){
  const [open,setOpen]=useState(true),[data,setData]=useState<Config|null>(null),[form,setForm]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [chats,setChats]=useState<DiscoveredChat[]>([]),[chatsBusy,setChatsBusy]=useState(false),[chatsError,setChatsError]=useState("");
  const [testUsers,setTestUsers]=useState<string[]>([]),[testKinds,setTestKinds]=useState<Array<keyof typeof labels>>(["daily"]),[testBusy,setTestBusy]=useState(false),[testRequest,setTestRequest]=useState<string|null>(null),[testResults,setTestResults]=useState<Array<{userId:string;kind:string;state:string}>>([]);
  const [connecting,setConnecting]=useState(false);
  async function connect(){
    setConnecting(true);setError("");setNotice("");
    try{const response=await fetch("/api/kys/iletisim/telegram/interaction",{method:"POST"});const json=await response.json();if(!response.ok)throw new Error(json.error);await load();await loadChats();setNotice("Telegram görev düğmeleri etkinleştirildi. Yeni mesajlarda görevleri tamamlayabilirsiniz.");}catch(error){setError(error instanceof Error?error.message:"Bağlantı kurulamadı.");}finally{setConnecting(false);}
  }
  const testBlockReason=!data?.botConfigured?"Bu sunucuda Telegram bot token’ı tanımlı değil. Canlı sunucuya eklenen token localhost’a aktarılmaz. Yerel deneme için .env.local dosyasına TELEGRAM_BOT_TOKEN ekleyip uygulamayı yeniden başlatın.":!data.recipients.some(item=>item.enabled)?"Önce bir Telegram alıcısını eşleştirip kaydedin ve bildirimlerini açın.":!testUsers.length?"Deneme bölümündeki Alıcılar alanından en az bir kişi seçin.":testUsers.length>10?"Tek gönderimde en fazla 10 alıcı seçebilirsiniz.":!testKinds.length?"Deneme için en az bir bildirim türü seçin.":"";
  async function sendTest(){
    if(testBusy)return;if(testBlockReason){setError(testBlockReason);return;}setTestBusy(true);setError("");setNotice("");setTestResults([]);
    try{
      if(!testRequest&&typeof globalThis.crypto?.randomUUID!=="function")throw new Error("Gönderim başlatılamadı. Sayfayı localhost veya HTTPS üzerinden açıp tekrar deneyin.");
      const requestId=testRequest||crypto.randomUUID();setTestRequest(requestId);
      const response=await fetch("/api/kys/iletisim/telegram/test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userIds:testUsers,kinds:testKinds,requestId})});const json=await response.json();if(!response.ok)throw new Error(json.error);setTestResults(json.results);setNotice(json.results.length?"Gönderim sonuçları aşağıda. Sonucu belirsiz mesajlar otomatik tekrar gönderilmez.":"Gönderilebilen alıcı bulunamadı; aktifliği, yetkileri ve kayıtlı tercihleri kontrol edin.");if(json.results.length&&json.results.every((item:{state:string})=>item.state==="sent"))setTestRequest(null);await load();}catch(error){setError(error instanceof Error?error.message:"Sonuç alınamadı. Aynı gönderim kimliğiyle durumu tekrar kontrol edebilirsiniz.");}finally{setTestBusy(false);}
  }
  async function loadChats(){
    setChatsBusy(true);setChatsError("");
    try{const response=await fetch("/api/kys/iletisim/telegram/chats",{cache:"no-store"});const json=await response.json();if(!response.ok)throw new Error(json.error||"Sohbetler alınamadı.");setChats(json.chats);}
    catch(error){setChatsError(error instanceof Error?error.message:"Sohbetler alınamadı.");}
    finally{setChatsBusy(false);}
  }
  useEffect(()=>{if(data?.botConfigured)void loadChats();},[data?.botConfigured]);
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
        <div className={styles.list}>
          <h3>Telegram’dan görev tamamlama</h3>
          <p className={styles.help}>Bağlantı: {data.interactionEnabled?"Etkin":"Kurulum bekliyor"}. Yeni kişisel görev mesajlarındaki ✅ düğmesi görevi portalda doğrudan tamamlar. İşlem yalnız görevin atandığı kişiye açıktır ve görev geçmişine kaydedilir.</p>
          <div className={styles.actions}><button type="button" disabled={connecting||!data.botConfigured} onClick={()=>void connect()}>{connecting?"Bağlanıyor…":data.interactionEnabled?"Telegram bağlantısını yenile":"Telegram görev düğmelerini etkinleştir"}</button></div>
        </div>
        <div className={styles.list}>
          <h3>Telegram’dan hızlı görev atama</h3>
          <p className={styles.help}>Bota kişi adı, tarih ve görevi tek mesajda yazın. Bot önce taslağı gösterir; “Görevi ata” düğmesiyle portalda kaydedilir. Aynı isimde birden fazla kişi varsa seçim yapabilirsiniz.</p>
          <p className={styles.help}><code>Selin bugün teklifleri kontrol et</code><br/><code>Oğuzhan Eker yarın kargo durumunu sor</code><br/><code>Selin bir hafta sonra stokları kontrol et</code><br/><code>Selin 05.11.2026 raporu hazırla</code></p>
          <p className={styles.help}>Başlangıç ve termin seçilen gündür; kategori Rutin olur. Geçmiş tarihler kabul edilmez. Hesabınızın portal kullanıcısıyla eşleştirilmiş ve KYS erişiminizin açık olması gerekir. Taslaklar 30 dakika geçerlidir. Yardım için bota /yardim yazın.</p>
        </div>
        <div className={styles.list}>
          <h3>Bota mesaj yazan kişiler</h3>
          <p className={styles.help}>Önce portal kullanıcısını seçin, ardından aşağıdaki kişiye tıklayın. Chat ID forma aktarılır; eşleştirme “Doğrula ve kaydet” ile kaydedilir.</p>
          <div className={styles.actions}><button type="button" disabled={chatsBusy||!data.botConfigured} onClick={()=>void loadChats()}>{chatsBusy?"Sohbetler alınıyor…":"Telegram listesini yenile"}</button></div>
          {chatsError&&<p className={styles.error} role="alert">{chatsError}</p>}
          {!chatsBusy&&!chatsError&&chats.length===0&&<p className={styles.help}>{data.botConfigured?"Henüz kişi bulunamadı. Bota yeni bir mesaj gönderip listeyi yenileyin.":"Listeyi almak için sunucuda bot token’ı tanımlanmalıdır."}</p>}
          {chats.map(chat=>{const linked=data.recipients.find(item=>item.chatId===chat.chatId);return <button type="button" key={chat.chatId} disabled={busy||!form.userId||Boolean(linked&&linked.userId!==form.userId)} onClick={()=>{setForm({...form,chatId:chat.chatId});setNotice("Chat ID seçildi. Eşleştirmeyi kaydetmek için Doğrula ve kaydet’e basın.");setError("");}}><strong>{chat.name}{chat.username?` · @${chat.username}`:""}</strong><span>Chat ID: {chat.chatId}</span>{linked&&<small>Eşleşen kullanıcı: {data.users.find(user=>user.id===linked.userId)?.name||linked.userId}</small>}</button>})}
          <p className={styles.help}>Görev düğmeleri etkinse mesaj yazan kişiler kalıcı olarak listelenir. Etkinleştirmeden önce Telegram’ın bekleyen mesajlarından en fazla 100 kayıt okunur; eski mesajlar listede olmayabilir. Yalnız kişisel sohbetler gösterilir. Mesaj içeriği görüntülenmez.</p>
        </div>
        <form onSubmit={save} className={styles.form}>
          <label>Kullanıcı<select required disabled={busy} value={form.userId} onChange={event=>selectUser(event.target.value)}><option value="">Kişi seçin…</option>{data.users.map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label>Telegram Chat ID<input required disabled={busy} inputMode="numeric" pattern="[1-9][0-9]*" value={form.chatId} onChange={event=>setForm({...form,chatId:event.target.value})} placeholder="Kişisel Telegram sohbetinin sayısal kimliği"/></label>
          <p className={styles.help}>Kişi önce botla sohbet başlatmalıdır. Chat ID, @kullanıcıadı değildir; yukarıdaki Telegram listesinden seçebilir veya elle girebilirsiniz. Kaydederken özel sohbet bilgileri Telegram’dan doğrulanır.{data.botUsername&&<> <a target="_blank" rel="noopener noreferrer" href={`https://t.me/${data.botUsername.replace(/^@/,"")}`}>Botu aç</a></>}</p>
          <p className={styles.help}>Geciken işler seçilirse, termini geçmiş ve tamamlanmamış kişisel görevler her gün 09.00’da ayrıca hatırlatılır. Görev tamamlandığında hatırlatma durur.</p><fieldset><legend>Bu kişiye gönderilecek bildirimler</legend>{(Object.keys(labels) as Array<keyof typeof labels>).map(key=><label key={key} className={styles.check}><input type="checkbox" disabled={busy} checked={form[key]} onChange={event=>setForm({...form,[key]:event.target.checked})}/>{labels[key]}</label>)}</fieldset>
          <label className={styles.check}><input type="checkbox" disabled={busy} checked={form.enabled} onChange={event=>setForm({...form,enabled:event.target.checked})}/>Bu kişinin bildirimleri açık</label>
          <div className={styles.actions}><button disabled={busy||!data.botConfigured||!form.userId} type="submit">{busy?"Kaydediliyor…":"Doğrula ve kaydet"}</button>{data.recipients.some(item=>item.userId===form.userId)&&<button type="button" disabled={busy} onClick={()=>void remove()}>Bağlantıyı kaldır</button>}</div>
        </form>
        <div className={styles.list}><h3>Kayıtlı alıcılar</h3>{data.recipients.length?data.recipients.map(recipient=><button type="button" key={recipient.userId} onClick={()=>selectUser(recipient.userId)}><strong>{data.users.find(user=>user.id===recipient.userId)?.name||recipient.userId}</strong><span>{recipient.chatLabel} · {recipient.enabled?"Açık":"Kapalı"}</span><small>{(Object.keys(labels) as Array<keyof typeof labels>).filter(key=>recipient[key]).map(key=>labels[key]).join(" · ")}</small></button>):<p>Henüz alıcı tanımlanmadı.</p>}</div>
        <div className={styles.list}>
          <h3>Anında deneme gönderimi</h3>
          <p className={styles.help}>Seçilen kayıtlı alıcılara, açık aboneliklerinden seçtiğiniz türleri şimdi gönderir. Otomatik gönderim kapalıyken de kullanılabilir ve sabah özetini engellemez. Görev düğmeleri gerçek portal görevlerini tamamlar.</p>
          <fieldset className={styles.testOptions} disabled={testBusy}><legend>Alıcılar (en fazla 10)</legend>{data.recipients.filter(item=>item.enabled).map(item=><label key={item.userId}><input type="checkbox" checked={testUsers.includes(item.userId)} onChange={event=>{setTestUsers(event.target.checked?[...testUsers,item.userId]:testUsers.filter(id=>id!==item.userId));setTestRequest(null);setTestResults([]);}}/>{data.users.find(user=>user.id===item.userId)?.name||item.userId}</label>)}{!data.recipients.some(item=>item.enabled)&&<p>Önce alıcı eşleştirmesini kaydedin.</p>}</fieldset>
          <fieldset className={styles.testOptions} disabled={testBusy}><legend>Bildirim türleri</legend>{(Object.keys(labels) as Array<keyof typeof labels>).map(kind=><label key={kind}><input type="checkbox" checked={testKinds.includes(kind)} onChange={event=>{setTestKinds(event.target.checked?[...testKinds,kind]:testKinds.filter(value=>value!==kind));setTestRequest(null);setTestResults([]);}}/>{labels[kind]}</label>)}</fieldset>
          {testBlockReason&&<p id="telegram-test-block-reason" className={styles.help} role="status">{testBlockReason}</p>}
          <div className={styles.actions}><button type="button" disabled={testBusy||Boolean(testBlockReason)} aria-describedby={testBlockReason?"telegram-test-block-reason":undefined} onClick={()=>void sendTest()}>{testBusy?"Gönderiliyor…":testRequest?"Aynı gönderimin durumunu kontrol et":"Seçilenlere deneme gönder"}</button>{testRequest&&<button type="button" disabled={testBusy} onClick={()=>{setTestRequest(null);setTestResults([]);setNotice("Yeni deneme hazırlanıyor. Önceki gönderim belirsizse Telegram sohbetini kontrol edin.");}}>Yeni deneme hazırla</button>}</div>
          {testResults.length>0&&<ul>{testResults.map((result,index)=><li key={index}>{data.users.find(user=>user.id===result.userId)?.name||result.userId} · {labels[result.kind as keyof typeof labels]||result.kind} · {stateLabels[result.state]||result.state}</li>)}</ul>}
        </div>
        <details><summary>Son gönderim kayıtları</summary>{data.deliveries.length?<ul>{data.deliveries.map((delivery,index)=><li key={index}>{data.users.find(user=>user.id===delivery.UserID)?.name||delivery.UserID} · {delivery.Kind.startsWith("test_")?`Deneme · ${labels[delivery.Kind.slice(5) as keyof typeof labels]||delivery.Kind}`:labels[delivery.Kind as keyof typeof labels]||delivery.Kind} · {delivery.Period} · {stateLabels[delivery.State]||delivery.State}{delivery.LastError&&` — ${delivery.LastError}`}</li>)}</ul>:<p>Gönderim kaydı yok.</p>}</details>
      </>}
    </div>}
  </section>;
}
