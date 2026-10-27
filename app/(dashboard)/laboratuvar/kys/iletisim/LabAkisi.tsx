"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FlaskConical, List, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { LabAnalysis, LabFlowData } from "@/lib/labAkisTypes";
import styles from "./labAkisi.module.css";

type Entry = { key: string; selection: string; tur: "analiz" | "kalite" | "ara"; id: number; tarih: string; baslik: string; ad: string; rapor: string; grup: string; numune: string; etiket: string; tamamlandi: boolean; analysis?: LabAnalysis; aciklama?: string; movable?: boolean };
const todayKey = () => new Date().toLocaleDateString("sv-SE", { timeZone:"Europe/Istanbul" });
const keyOfDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const displayDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("tr-TR",{ day:"numeric",month:"long",year:"numeric" });
const selectionPayload = (keys: string[]) => keys.map(key => { const [tur,id] = key.split(":"); return { tur,id:Number(id) }; });

export default function LabAkisi() {
  const [month, setMonth] = useState(() => { const date = new Date(`${todayKey()}T12:00:00`); return new Date(date.getFullYear(),date.getMonth(),1); });
  const [data,setData] = useState<LabFlowData>({ analizler:[],kalite:[] });
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [kind,setKind] = useState("Tümü");
  const [analysisName,setAnalysisName] = useState("");
  const [department,setDepartment] = useState("");
  const [status,setStatus] = useState("Tümü");
  const [query,setQuery] = useState("");
  const [view,setView] = useState<"takvim" | "liste">("takvim");
  const [selected,setSelected] = useState<Set<string>>(new Set());
  const [detail,setDetail] = useState<string | null>(null);
  const [endDate,setEndDate] = useState("");
  const [qualityOpen,setQualityOpen] = useState(false);
  const [quality,setQuality] = useState({ baslik:"",aciklama:"",tarih:todayKey() });
  const [daysOpen,setDaysOpen] = useState(false);
  const [days,setDays] = useState("1, 7, 14");
  const [dropDate,setDropDate] = useState("");
  const requestVersion = useRef(0);
  const busy = useRef(false);
  const dragId = useRef<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(),month.getMonth(),1);
    const offset = (first.getDay()+6)%7;
    return Array.from({ length:42 },(_,index) => new Date(first.getFullYear(),first.getMonth(),1-offset+index));
  },[month]);
  const from = keyOfDate(cells[0]); const to = keyOfDate(cells[41]);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/kys/lab-akisi?from=${from}&to=${to}`,{ cache:"no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Lab akışı alınamadı.");
      if (version === requestVersion.current) { setData(json); setSelected(new Set()); }
    } catch (error) { if (version === requestVersion.current) setError(error instanceof Error ? error.message : "Veriler alınamadı."); }
    finally { if (version === requestVersion.current) setLoading(false); }
  },[from,to]);
  useEffect(() => { void load(); },[load]);
  useEffect(() => {
    if (!detail && !qualityOpen && !daysOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRef.current?.querySelector<HTMLElement>("input,button")?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy.current) { setDetail(null); setQualityOpen(false); setDaysOpen(false); }
      if (event.key === "Tab") {
        const elements = modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]');
        if (!elements?.length) return;
        const first = elements[0]; const last = elements[elements.length-1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown",escape); return () => { document.removeEventListener("keydown",escape); previousFocus?.focus(); };
  },[detail,qualityOpen,daysOpen]);
  const entries = useMemo<Entry[]>(() => [
    ...data.analizler.flatMap(analysis => {
      const base = { tur:"analiz" as const,id:analysis.id,selection:`analiz:${analysis.id}`,ad:analysis.ad,rapor:analysis.raporNo,grup:analysis.grup,numune:analysis.numune,tamamlandi:analysis.tamamlandi,analysis };
      return [
        { ...base,key:`start:${analysis.id}`,tarih:analysis.baslangic,baslik:analysis.ad,etiket:"Başlangıç" },
        ...(analysis.termin ? [{ ...base,key:`end:${analysis.id}`,tarih:analysis.termin,baslik:analysis.ad,etiket:"Bitiş",movable:!analysis.tamamlandi }] : []),
        ...analysis.araGunler.map(day => ({ ...base,tur:"ara" as const,id:day.id,key:`ara:${day.id}`,selection:`ara:${day.id}`,tarih:day.tarih,baslik:`${analysis.ad} ${day.gun}. gün`,etiket:"Ara gün",tamamlandi:day.tamamlandi })),
      ];
    }),
    ...data.kalite.map(work => ({ key:`kalite:${work.id}`,selection:`kalite:${work.id}`,tur:"kalite" as const,id:work.id,tarih:work.tarih,baslik:work.baslik,ad:"",rapor:"",grup:"",numune:"",etiket:"Kalite işi",tamamlandi:work.tamamlandi,aciklama:work.aciklama })),
  ],[data]);
  const visible = useMemo(() => entries.filter(entry =>
    (kind === "Tümü" || (kind === "Analiz" ? entry.tur !== "kalite" : entry.tur === "kalite")) &&
    (!analysisName || entry.ad === analysisName) &&
    (!department || (entry.analysis && String(entry.analysis.birimId ?? "unassigned") === department)) &&
    (status === "Tümü" || (status === "Tamamlandı" ? entry.tamamlandi : !entry.tamamlandi)) &&
    (!query || `${entry.baslik} ${entry.rapor} ${entry.numune} ${entry.aciklama || ""}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))) &&
    entry.tarih >= from && entry.tarih <= to),[entries,kind,analysisName,department,status,query,from,to]);
  const entriesByDate = useMemo(() => { const map = new Map<string,Entry[]>(); for (const entry of visible) { const list = map.get(entry.tarih) || []; list.push(entry); map.set(entry.tarih,list); } return map; },[visible]);
  const selectedKeys = [...selected].filter(key => visible.some(entry => entry.selection === key));
  const selectedAnalyses = selectedKeys.length > 0 && selectedKeys.every(key => key.startsWith("analiz:"));
  const active = entries.find(entry => entry.key === detail);
  const departments = [...new Map(data.analizler.map(analysis => [String(analysis.birimId ?? "unassigned"), analysis.birimAd])).entries()].sort((a,b) => a[1].localeCompare(b[1],"tr"));
  const names = [...new Set(data.analizler.filter(analysis => !department || String(analysis.birimId ?? "unassigned") === department).map(analysis => analysis.ad))].sort((a,b) => a.localeCompare(b,"tr"));
  function toggle(key: string) { setSelected(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  async function mutate(method: "POST" | "PATCH", body: Record<string, unknown>, message: string) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/kys/lab-akisi",{ method,headers:{ "Content-Type":"application/json" },body:JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "İşlem tamamlanamadı.");
      setDetail(null); setQualityOpen(false); setDaysOpen(false); setNotice(message); await load();
    } catch (error) { setError(error instanceof Error ? error.message : "İşlem tamamlanamadı."); }
    finally { busy.current = false; setSaving(false); }
  }
  function changeEnd(id: number, date: string) { void mutate("PATCH",{ islem:"termin",secim:[{ tur:"analiz",id }],tarih:date },"Bitiş ve analiz termin tarihi güncellendi."); }
  function openDetail(entry: Entry) { setDetail(entry.key); setEndDate(entry.analysis?.termin || ""); setError(""); }
  const counts = { Analiz:data.analizler.length,Kalite:data.kalite.length };
  function entryCard(entry: Entry) {
    return <article key={entry.key} className={`${styles.event} ${entry.tur === "kalite" ? styles.quality : entry.tur === "ara" ? styles.intermediate : entry.etiket === "Başlangıç" ? styles.start : styles.end} ${entry.tamamlandi ? styles.done : ""}`} draggable={Boolean(entry.movable) && !saving}
      onDragStart={event => { if (!entry.movable) { event.preventDefault(); return; } dragId.current = entry.id; event.dataTransfer.setData("text/plain",String(entry.id)); event.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={() => { dragId.current = null; setDropDate(""); }}>
      <label className={styles.selectEvent}><input type="checkbox" aria-label={`${entry.baslik} ${entry.rapor} ${entry.etiket} seç`} checked={selected.has(entry.selection)} disabled={saving} onChange={() => toggle(entry.selection)} /></label>
      <button type="button" className={styles.eventBody} aria-label={`${entry.baslik} ${entry.rapor} · ${entry.etiket}`} onClick={() => openDetail(entry)}>{(entry.tur !== "analiz" || entry.tamamlandi || entry.movable) && <span className={styles.eventLabel}>{entry.tamamlandi ? <CheckCircle2 size={12} /> : null}{entry.tur !== "analiz" && entry.etiket}{entry.movable && <span title="Termin tarihini başka bir güne sürükleyin" aria-hidden="true"> ⠿</span>}</span>}<strong>{entry.baslik}</strong>{entry.rapor && <span className={styles.report}>{entry.rapor}</span>}{entry.grup && <small>{entry.grup}</small>}</button>
    </article>;
  }
  return <section className={styles.flow} aria-label="Lab Akışı">
    <header className={styles.heading}><div><h2>Lab Akışı</h2><p>Numune kabul analizleri ve kalite işleri, tek takvimde.</p></div><button className={styles.primary} disabled={saving || loading} onClick={() => { setQuality({ baslik:"",aciklama:"",tarih:todayKey() }); setQualityOpen(true); setError(""); }}><Plus size={17} />Kalite işi ekle</button></header>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    <div className={styles.kindCards} aria-label="İş türü filtresi">
      {(["Tümü","Analiz","Kalite"] as const).map(value => { const Icon = value === "Analiz" ? FlaskConical : value === "Kalite" ? ShieldCheck : CalendarDays; return <button key={value} data-kind={value} aria-pressed={kind === value} onClick={() => { setKind(value); if (value === "Kalite") { setAnalysisName(""); setDepartment(""); } setSelected(new Set()); }}><Icon size={26} /><span>{value === "Tümü" ? "Tüm işler" : value === "Analiz" ? "Analizler" : "Kalite işleri"}{value !== "Analiz" && <small>{value === "Kalite" ? "Manuel planlanan işler" : "Analizler ve kalite"}</small>}</span><strong>{value === "Tümü" ? counts.Analiz+counts.Kalite : counts[value]}</strong></button>; })}
    </div>
    <div className={styles.filters}>
      <label>Birim<select value={department} disabled={kind === "Kalite"} onChange={event => { setDepartment(event.target.value); setAnalysisName(""); setSelected(new Set()); }}><option value="">Tüm birimler</option>{departments.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Analiz adı<select value={analysisName} disabled={kind === "Kalite"} onChange={event => { setAnalysisName(event.target.value); setSelected(new Set()); }}><option value="">Tüm analizler</option>{names.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Durum<select value={status} onChange={event => { setStatus(event.target.value); setSelected(new Set()); }}><option>Tümü</option><option>Devam eden</option><option>Tamamlandı</option></select></label>
      <label className={styles.search}>Rapor / numune / iş ara<input value={query} onChange={event => { setQuery(event.target.value); setSelected(new Set()); }} placeholder="Rapor no, numune veya başlık…" /></label>
      <button disabled={loading || saving} onClick={() => void load()} aria-label="Takvimi yenile"><RefreshCw size={16} /></button>
    </div>
    <div className={styles.calendarToolbar}><div className={styles.navigation}><button aria-label="Önceki ay" disabled={saving} onClick={() => setMonth(date => new Date(date.getFullYear(),date.getMonth()-1,1))}><ChevronLeft size={18} /></button><h3>{month.toLocaleDateString("tr-TR",{ month:"long",year:"numeric" })}</h3><button aria-label="Sonraki ay" disabled={saving} onClick={() => setMonth(date => new Date(date.getFullYear(),date.getMonth()+1,1))}><ChevronRight size={18} /></button><button disabled={saving} onClick={() => { const date = new Date(`${todayKey()}T12:00:00`); setMonth(new Date(date.getFullYear(),date.getMonth(),1)); }}>Bugün</button></div><div className={styles.viewSwitch}><button aria-pressed={view === "takvim"} onClick={() => setView("takvim")}><CalendarDays size={16} />Takvim</button><button aria-pressed={view === "liste"} onClick={() => setView("liste")}><List size={16} />Liste</button></div></div>
    <div className={styles.legend} aria-label="Takvim renkleri"><span className={styles.legendStart}>Numune kabul</span><span className={styles.legendEnd}>Termin</span><span className={styles.legendIntermediate}>Ara gün</span><span className={styles.legendQuality}>Kalite işi</span></div>
    <p className={styles.help}>Numune kabul tarihi sabittir. Termin kartını başka güne sürükleyebilir veya karta tıklayıp tarihi değiştirebilirsiniz. Kart sayıları görüntülenen tarih aralığındaki analiz ve kalite işlerini gösterir.</p>
    <div className={styles.selectionBar}><label><input type="checkbox" checked={visible.length > 0 && visible.every(entry => selected.has(entry.selection))} disabled={saving || loading || !visible.length} onChange={event => setSelected(event.target.checked ? new Set(visible.map(entry => entry.selection)) : new Set())} />Görünenleri seç</label><span>{selectedKeys.length} iş seçili</span><button disabled={!selectedKeys.length || saving || loading} onClick={() => void mutate("PATCH",{ islem:"tamamla",secim:selectionPayload(selectedKeys) },"Seçilen işler tamamlandı.")}><CheckCircle2 size={16} />Tamamlandı</button><button disabled={!selectedKeys.length || saving || loading} onClick={() => void mutate("PATCH",{ islem:"yeniden-ac",secim:selectionPayload(selectedKeys) },"Seçilen işler yeniden açıldı.")}>Yeniden aç</button><button disabled={!selectedAnalyses || saving || loading} onClick={() => { setDays("1, 7, 14"); setDaysOpen(true); setError(""); }}><Plus size={16} />Ara gün ekle</button></div>
    {loading ? <div className={styles.empty} role="status">Lab akışı yükleniyor…</div> : view === "takvim" ? <div className={styles.calendarScroll}><div className={styles.calendar}>
      {["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"].map(day => <div className={styles.weekday} key={day}>{day}</div>)}
      {cells.map(date => { const key = keyOfDate(date); return <div key={key} aria-label={displayDate(key)} className={`${styles.day} ${date.getMonth() !== month.getMonth() ? styles.otherMonth : ""} ${dropDate === key ? styles.dropTarget : ""}`} onDragOver={event => { if (dragId.current !== null && !saving) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropDate(key); } }} onDrop={event => { event.preventDefault(); const id = dragId.current; dragId.current = null; setDropDate(""); if (id !== null && !saving) changeEnd(id,key); }}><time dateTime={key} className={key === todayKey() ? styles.today : ""}>{date.getDate()}</time>{(entriesByDate.get(key) || []).map(entryCard)}</div>; })}
    </div></div> : <div className={styles.agenda}>{[...entriesByDate].sort(([a],[b]) => a.localeCompare(b)).map(([date,items]) => <section key={date}><h4>{displayDate(date)}</h4><div>{items.map(entryCard)}</div></section>)}</div>}
    {!loading && !visible.length && <div className={styles.empty}>Bu tarih aralığı ve filtreler için iş bulunamadı.</div>}
    {!loading && data.analizler.some(analysis => !analysis.termin) && <p className={styles.help}>Termin tarihi olmayan analizlerin yalnız başlangıcı gösterilir. Başlangıç kartını açıp bitiş tarihi belirleyebilirsiniz.</p>}
    {(active || qualityOpen || daysOpen) && <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget && !saving) { setDetail(null); setQualityOpen(false); setDaysOpen(false); } }}><div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="lab-flow-dialog-title"><header><h3 id="lab-flow-dialog-title">{qualityOpen ? "Kalite işi ekle" : daysOpen ? "Analizlere ara gün ekle" : active?.baslik}</h3><button disabled={saving} aria-label="Kapat" onClick={() => { setDetail(null); setQualityOpen(false); setDaysOpen(false); }}><X size={20} /></button></header>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {qualityOpen ? <form onSubmit={event => { event.preventDefault(); void mutate("POST",quality,"Kalite işi takvime eklendi."); }}><label>İş başlığı<input autoFocus required maxLength={220} value={quality.baslik} onChange={event => setQuality(current => ({ ...current,baslik:event.target.value }))} placeholder="İç tetkik, YGG, periyodik bakım…" /></label><label>Tarih<input required type="date" value={quality.tarih} onChange={event => setQuality(current => ({ ...current,tarih:event.target.value }))} /></label><label>Açıklama<textarea rows={4} value={quality.aciklama} onChange={event => setQuality(current => ({ ...current,aciklama:event.target.value }))} /></label><footer><button disabled={saving} type="submit" className={styles.primary}>{saving ? "Kaydediliyor…" : "Takvime ekle"}</button></footer></form> : daysOpen ? <form onSubmit={event => { event.preventDefault(); void mutate("PATCH",{ islem:"ara-gun",secim:selectionPayload(selectedKeys),gunler:days.split(",").map(value => Number(value.trim())) },"Ara günler seçilen analizlere eklendi."); }}><p>{selectedKeys.length} analiz seçili. 1. gün kayıt günüdür. Aynı gün ikinci kez eklenmez.</p><label>Ara günler<input autoFocus required value={days} onChange={event => setDays(event.target.value)} placeholder="1, 7, 14, 28" /></label><p>Her ara gün takvimde “Analiz adı · gün” olarak ayrı görünür ve ayrı tamamlanabilir. Bitiş tarihini aşan günler eklenmez.</p><footer><button disabled={saving} type="submit" className={styles.primary}>{saving ? "Kaydediliyor…" : "Ara günleri ekle"}</button></footer></form> : active && <div className={styles.detail}>
        <span className={styles.detailLabel}>{active.tur === "analiz" ? active.etiket === "Başlangıç" ? "Numune kabul" : "Termin" : active.etiket} · {active.tamamlandi ? "Tamamlandı" : "Devam ediyor"}</span>
        {active.rapor && <p><strong>Rapor:</strong> {active.rapor} · {active.grup}<br /><strong>Numune:</strong> {active.numune}</p>}
        {(!active.analysis || active.tur === "ara") && <p><strong>{active.tur === "ara" ? "Ara gün tarihi:" : "Tarih:"}</strong> {displayDate(active.tarih)}</p>}
        {active.aciklama && <p>{active.aciklama}</p>}
        {active.analysis && <><p><strong>Numune kabul tarihi:</strong> {displayDate(active.analysis.baslangic)}</p><label>Termin tarihi<input type="date" min={active.analysis.baslangic} disabled={active.analysis.tamamlandi || saving} value={endDate} onChange={event => setEndDate(event.target.value)} /></label><button disabled={saving || active.analysis.tamamlandi || !endDate || endDate === active.analysis.termin} onClick={() => changeEnd(active.analysis!.id,endDate)}>Termin tarihini güncelle</button>{active.analysis.araGunler.length > 0 && <ul>{active.analysis.araGunler.map(day => <li key={day.id}>{active.ad} {day.gun}. gün — {displayDate(day.tarih)}{day.tamamlandi ? " · Tamamlandı" : ""}</li>)}</ul>}<a className={styles.resultButton} href={`/laboratuvar/${active.grup === "K.D." ? "root-kozmetik/" : ""}sonuc-giris`}>Sonuç girişine git</a></>}
        <footer>{active.tur === "analiz" && <button disabled={saving || active.tamamlandi} onClick={() => { setSelected(new Set([active.selection])); setDetail(null); setDaysOpen(true); setDays("1, 7, 14"); }}>Ara gün ekle</button>}<button disabled={saving} className={styles.primary} onClick={() => void mutate("PATCH",{ islem:active.tamamlandi ? "yeniden-ac" : "tamamla",secim:selectionPayload([active.selection]) },active.tamamlandi ? "İş yeniden açıldı." : "İş tamamlandı.")}>{active.tamamlandi ? "Yeniden aç" : "Tamamlandı olarak işaretle"}</button></footer>
      </div>}
    </div></div>}
  </section>;
}
