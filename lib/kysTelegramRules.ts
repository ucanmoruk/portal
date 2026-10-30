export type TelegramKind="daily"|"weekly"|"analyses"|"quality"|"overdue";
export const TELEGRAM_KINDS:TelegramKind[]=["daily","weekly","analyses","quality","overdue"];
export type TelegramRecipient={userId:string;name:string;chatId:string;chatLabel:string;enabled:boolean;daily:boolean;weekly:boolean;analyses:boolean;quality:boolean;overdue:boolean};
export type DigestTask={id:number;title:string;status:string;start:string;end:string};
export type DigestAnalysis={id:number;name:string;report:string;sample:string;end:string;done:boolean};
export type DigestQuality={id:number;title:string;description:string;date:string;done:boolean};
export function istanbulClock(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const value=(type:string)=>parts.find(part=>part.type===type)?.value||"";
  const today=`${value("year")}-${value("month")}-${value("day")}`;
  const day=new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday=shiftDay(today,-((day+6)%7));
  return {today,hour:Number(value("hour")),monday,sunday:shiftDay(monday,6)};
}
export function shiftDay(day:string,offset:number){const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
export const TELEGRAM_TITLES={daily:"Günlük işleriniz",weekly:"Haftalık işleriniz",analyses:"Bugün çıkacak analizler",quality:"Kalite işleri",overdue:"Geciken işleriniz · Hatırlatma"};
const display=(day:string)=>day?day.slice(0,10).split("-").reverse().join("."):"Tarih belirtilmemiş";
const clean=(text:string)=>text.replace(/[\r\n\t]+/g," ").trim();
export function digestLines(kind:TelegramKind,person:string,clock:ReturnType<typeof istanbulClock>,tasks:DigestTask[],analyses:DigestAnalysis[],quality:DigestQuality[]){
  const period=kind==="weekly"?`${display(clock.monday)} – ${display(clock.sunday)}`:display(clock.today);

  let items:string[]=[];
  if(kind==="daily"||kind==="weekly"||kind==="overdue")items=telegramDigestTasks(kind,clock,tasks).map(task=>`• ${clean(task.title)}\n  ${task.end&&task.end<clock.today?"Gecikmiş · ":""}${task.status} · Termin: ${display(task.end)}`);
  if(kind==="analyses")items=analyses.filter(item=>!item.done&&item.end===clock.today).map(item=>`• ${clean(item.name)} · Rapor ${clean(item.report)}\n  ${clean(item.sample)}`);
  if(kind==="quality")items=quality.filter(item=>!item.done&&item.date===clock.today).map(item=>`• ${clean(item.title)}${item.description?`\n  ${clean(item.description)}`:""}`);
  if(!items.length)return [];
  return [`UNIQUE · ${TELEGRAM_TITLES[kind]}\n${clean(person)} · ${period}\n${items.length} kayıt\n`,...items];
}
export function telegramParts(lines:string[],url:string){
  if(!lines.length)return [];
  const footer=`\n\nDetaylar: ${url}`;
  const limit=3400;
  const parts:string[]=[];let current="";
  for(const line of lines){
    for(const character of line+"\n"){
      if(current.length+character.length>limit){parts.push(current);current="";}
      current+=character;
    }
  }
  if(current.trim())parts.push(current.trimEnd());
  return parts.map((text,index)=>`${parts.length>1?`(${index+1}/${parts.length})\n`:""}${text}${footer}`);
}

export type TelegramPart={text:string;reply_markup?:{inline_keyboard:Array<Array<{text:string;callback_data:string}>>}};
export function telegramDigestTasks(kind:TelegramKind,clock:ReturnType<typeof istanbulClock>,tasks:DigestTask[]){
  return tasks.filter(task=>task.status!=="Tamamlandı"&&(kind!=="overdue"||Boolean(task.end&&task.end<clock.today))&&(!task.start||task.start<=(kind==="weekly"?clock.sunday:clock.today))).sort((a,b)=>a.end.localeCompare(b.end)||a.id-b.id);
}
export function telegramTaskParts(kind:TelegramKind,person:string,clock:ReturnType<typeof istanbulClock>,tasks:DigestTask[],url:string):TelegramPart[]{
  const selected=telegramDigestTasks(kind,clock,tasks),parts:TelegramPart[]=[];
  for(let offset=0;offset<selected.length;offset+=10){
    const group=selected.slice(offset,offset+10);
    const texts=telegramParts(digestLines(kind,person,clock,group,[],[]),url);
    texts.forEach((text,index)=>parts.push({text,...(index===texts.length-1?{reply_markup:{inline_keyboard:group.map(task=>[{text:`✅ #${task.id} · ${clean(task.title).slice(0,45)}`,callback_data:`kys:done:${task.id}`}])}}:{})}));
  }
  return parts;
}
