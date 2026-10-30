import { istanbulClock, shiftDay } from "@/lib/kysTelegramRules";

export function normalizeTelegramName(value:string){
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").replace(/[^a-z0-9]+/g," ").trim();
}
export function parseTelegramTaskText(text:string,now=new Date()){
  const input=text.trim().replace(/^\/(?:gorev|görev)(?:@[a-zA-Z0-9_]+)?\s+/iu,"");
  const match=/^(.+?)\s+(bugün|bugun|yarın|yarin|b[iİıI]r\s+hafta\s+sonra|1\s+hafta\s+sonra|\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+([\s\S]+)$/iu.exec(input);
  if(!match)throw new Error("Kişi, tarih ve görev yazın. Örnek: Selin yarın teklifleri kontrol et. Tarih: bugün, yarın, bir hafta sonra veya 05.11.2026.");
  const person=match[1].trim(),title=match[3].trim(),dateText=match[2].toLocaleLowerCase("tr-TR").replace(/\s+/g," ");
  if(person.length>160||!title||title.length>2000)throw new Error("Kişi adı en fazla 160, görev açıklaması en fazla 2000 karakter olabilir.");
  const today=istanbulClock(now).today;
  let date:string;
  if(["bugün","bugun"].includes(dateText))date=today;
  else if(["yarın","yarin"].includes(dateText))date=shiftDay(today,1);
  else if(["bir hafta sonra","1 hafta sonra"].includes(dateText))date=shiftDay(today,7);
  else if(/^\d{4}-/.test(dateText))date=dateText;
  else {const [day,month,year]=dateText.split(/[./-]/);date=`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`;}
  const parsed=new Date(`${date}T12:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||date<today)throw new Error("Bugün veya sonrası için geçerli bir tarih girin; örnek: 05.11.2026.");
  return {person,title,date};
}
export function matchTelegramPeople<T extends {id:string;name:string}>(person:string,people:T[]){
  const wanted=normalizeTelegramName(person);
  if(!wanted)return [];
  const exact=people.filter(user=>normalizeTelegramName(user.name)===wanted);
  return exact.length?exact:people.filter(user=>` ${normalizeTelegramName(user.name)} `.includes(` ${wanted} `));
}
