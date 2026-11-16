import { createHash } from 'node:crypto';
import type { WorkspaceRecord } from './kysWorkspaceConfig';

type Row = Record<string, unknown>;
export type LegacyDeviceData = { cihazlar: Row[]; bakimlar: Row[]; kalibrasyonlar: Row[]; islemler: Row[] };
export const DEVICE_IMPORT_BATCH='cihaz-proseduru-2026-11-17';
const clean=(v:unknown)=>String(v??'').replace(/_x000D_/g,'').trim();
const match=(v:unknown)=>clean(v).replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
export function deviceImportId(table:string,id:number) {
  const h=createHash('sha256').update(`unique-device-import:${table}:${id}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
function date(value:unknown){const v=clean(value).slice(0,10);if(!v)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)!==v)throw Error(`Geçersiz kaynak tarihi: ${v}`);return v;}

/** Import only the supplied device list. Preserve legacy primary keys through deterministic IDs, never join histories by an ambiguous code. */
export function planDeviceImport(legacy:LegacyDeviceData, sourceDevices:Row[], existing:WorkspaceRecord[], now=new Date().toISOString()) {
  const devices=new Map<number,string>();
  const records:WorkspaceRecord[]=[];
  const sourceCodes=new Set<string>();
  const add=(module:string,table:string,row:Row,data:Record<string,string>,status:string)=>{
    const id=Number(row.ID);
    if(!Number.isSafeInteger(id)||id<=0)throw Error(`Geçersiz kaynak kimliği: ${table}`);
    records.push({id:deviceImportId(table,id),module,version:1,status,data,createdAt:now,updatedAt:now,createdBy:'Eski sistem aktarımı',updatedBy:'Eski sistem aktarımı',source:{table,id,state:clean(row.Durum),batch:DEVICE_IMPORT_BATCH}});
  };
  for(const source of sourceDevices) {
    const code=clean(source['Cihaz Kodu']);
    if(!code||sourceCodes.has(match(code)))throw Error(`Kaynak cihaz kodu boş veya mükerrer: ${code}`);
    sourceCodes.add(match(code));
    const candidates=legacy.cihazlar.filter(c=>c.Durum==='Aktif'&&match(c.Kod)===match(code)&&match(c.Ad)===match(source['Cihaz Adı'])&&match(c.Seri)===match(source['Seri No'])&&match(c.Marka)===match(source['Marka / Model']));
    if(candidates.length!==1)throw Error(`${code}: Excel satırı tek bir SQL cihazıyla eşleşmedi.`);
    const c=candidates[0],id=Number(c.ID),target=deviceImportId('CihazListesi',id);
    const collision=existing.find(r=>r.module==='cihaz-listesi'&&match(r.data.code)===match(code)&&r.id!==target);
    if(collision)throw Error(`${code}: Portalda farklı bir cihaz kaydı var; otomatik birleştirme yapılmadı.`);
    devices.set(id,target);
    const specs=legacy.kalibrasyonlar.filter(k=>Number(k.CihazID)===id&&k.Durum==='Aktif'&&clean(k.KalTip));
    add('cihaz-listesi','CihazListesi',c,{code,name:clean(c.Ad),brand:clean(c.Marka),model:'',serial:clean(c.Seri),unit:clean(c.Birim),location:'',owner:'',commissionedAt:'',range:'',resolution:'',calibrationRequired:specs.length?'Gerekli':'',conditions:'',instruction:clean(c.Talimat),notes:'',supplier:clean(c.Tedarikci),purchaseDate:clean(c.Tarih),technicalDetails:clean(c.Ozellik)},clean(c.Durumu)||'Kullanımda');
  }
  for(const b of legacy.bakimlar) {
    const deviceId=devices.get(Number(b.CihazID));
    if(!deviceId||b.Durum!=='Aktif'||![b.PfSiklik,b.PfDetay,b.BakimSiklik,b.BakimDetay].some(v=>clean(v)))continue;
    add('cihaz-bakim-sartlari','CihazBakim',b,{deviceId,performanceFrequency:clean(b.PfSiklik),performanceDetail:clean(b.PfDetay),maintenanceFrequency:clean(b.BakimSiklik),maintenanceDetail:clean(b.BakimDetay)},'Aktif');
  }
  for(const k of legacy.kalibrasyonlar) {
    const deviceId=devices.get(Number(k.CihazID));
    if(!deviceId||k.Durum!=='Aktif'||![k.KalTip,k.KalSiklik,k.AraSiklik,k.Calisma,k.Kalibrasyon,k.KabulKriteri].some(v=>clean(v)))continue;
    add('cihaz-kalibrasyon-sartname','CihazKalibrasyon',k,{deviceId,type:clean(k.KalTip),frequency:clean(k.KalSiklik),intermediateFrequency:clean(k.AraSiklik),range:clean(k.Calisma),points:clean(k.Kalibrasyon),criteria:clean(k.KabulKriteri),reference:clean(k.KaynakAdi)},'Aktif');
  }
  for(const i of legacy.islemler) {
    const deviceId=devices.get(Number(i.CihazID));
    if(!deviceId)continue;
    const status=i.Durum==='Aktif'?'Aktarıldı':'Pasif Eski Kayıt';
    const common={deviceId,provider:clean(i.Uygulayan),owner:'',evaluation:clean(i.Aciklama),nextDate:date(i.Tarih2),legacyDocument:clean(i.Path)};
    if(['Kalibrasyon','Ara Kontrol'].includes(clean(i.Tur)))add('kalibrasyon-kontrol','CihazIslem',i,{...common,kind:clean(i.Tur),dueDate:'',performedAt:date(i.Tarih1),control:'',certificate:'',evidence:'',scope:'',reference:'',criteria:'',result:'',reviewer:''},status);
    else add('cihaz-islemleri','CihazIslem',i,{...common,date:date(i.Tarih1),operation:clean(i.Tur),description:clean(i.Aciklama)},status);
  }
  const ids=new Set(existing.map(r=>r.id));
  for(const row of records){const before=existing.find(r=>r.id===row.id);if(before&&(before.source?.table!==row.source?.table||before.source?.id!==row.source?.id))throw Error('Aktarım kimliği başka bir kayıtla çakışıyor.');}
  return {records:records.filter(r=>!ids.has(r.id)),skipped:records.filter(r=>ids.has(r.id)).length,selectedDeviceIds:[...devices.keys()],excludedDevices:legacy.cihazlar.filter(c=>c.Durum==='Aktif'&&!devices.has(Number(c.ID))).map(c=>({id:c.ID,code:c.Kod,name:c.Ad})),counts:Object.fromEntries([...new Set(records.map(r=>r.module))].map(m=>[m,records.filter(r=>r.module===m).length]))};
}
