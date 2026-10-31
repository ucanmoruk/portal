import { randomUUID } from "node:crypto";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { SpektrotekTalepBatch, SpektrotekTalepCreate, SpektrotekTalepEdit, SpektrotekTalepStatus, SPEKTROTEK_TALEP_DURUMLAR, type GelenSpektrotekTalep, type SpektrotekTalep, type SpektrotekTalepList } from "@/lib/spektrotekTalepRules";

export class SpektrotekTalepError extends Error{constructor(message:string,readonly status=400){super(message);}}
let ready:Promise<void>|null=null;
const utc=()=>hasMysqlConfig()?"UTC_TIMESTAMP(3)":"SYSUTCDATETIME()";
const columns="Id,KaynakId,Tarih,MusteriAdi,KisiAdi,Email,Talep,Ozet,Konu,Hesap,Skor,Durum,DurumTarihi,DurumKullanici,Surum";
type Row=Record<string,unknown>;
function iso(value:unknown):string|null{
  if(!value)return null;
  if(value instanceof Date)return value.toISOString();
  const text=String(value).replace(" ","T");
  const parsed=new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(text)?text:`${text}Z`);
  return Number.isFinite(parsed.getTime())?parsed.toISOString():null;
}
function map(row:Row):SpektrotekTalep{return {id:Number(row.Id),kaynakId:String(row.KaynakId),tarih:iso(row.Tarih)||"",musteriAdi:String(row.MusteriAdi),kisiAdi:String(row.KisiAdi||""),email:String(row.Email),talep:String(row.Talep),ozet:String(row.Ozet||""),konu:String(row.Konu||""),hesap:String(row.Hesap),skor:row.Skor==null?null:Number(row.Skor),durum:String(row.Durum) as SpektrotekTalep["durum"],durumTarihi:iso(row.DurumTarihi),durumKullanici:String(row.DurumKullanici||""),surum:Number(row.Surum)};}
export function ensureSpektrotekTalepSchema(){
  if(!ready)ready=(async()=>{
    await (await cosmoPool).request().query(hasMysqlConfig()?`CREATE TABLE IF NOT EXISTS SpektrotekTalep (
      Id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,KaynakId VARCHAR(64) NOT NULL UNIQUE,Tarih DATETIME(3) NOT NULL,
      MusteriAdi VARCHAR(300) NOT NULL,KisiAdi VARCHAR(200) NULL,Email VARCHAR(320) NOT NULL,Talep VARCHAR(300) NOT NULL,
      Ozet VARCHAR(1000) NULL,Konu VARCHAR(500) NULL,Hesap VARCHAR(100) NOT NULL,Skor TINYINT UNSIGNED NULL,
      Durum VARCHAR(40) NOT NULL DEFAULT 'Bekliyor',DurumTarihi DATETIME(3) NULL,DurumKullanici VARCHAR(100) NULL,
      OlusturmaTarihi DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),GuncellemeTarihi DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      Surum INT NOT NULL DEFAULT 1,KEY IX_SpektrotekTalep_Tarih (Tarih,Id),
      CONSTRAINT CK_SpektrotekTalep_Durum CHECK (Durum IN ('Bekliyor','Teklif Gönderildi'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`:`IF OBJECT_ID('SpektrotekTalep','U') IS NULL BEGIN CREATE TABLE SpektrotekTalep (
      Id INT IDENTITY(1,1) PRIMARY KEY,KaynakId NVARCHAR(64) NOT NULL UNIQUE,Tarih DATETIME2(3) NOT NULL,
      MusteriAdi NVARCHAR(300) NOT NULL,KisiAdi NVARCHAR(200) NULL,Email NVARCHAR(320) NOT NULL,Talep NVARCHAR(300) NOT NULL,
      Ozet NVARCHAR(1000) NULL,Konu NVARCHAR(500) NULL,Hesap NVARCHAR(100) NOT NULL,Skor TINYINT NULL,
      Durum NVARCHAR(40) NOT NULL DEFAULT N'Bekliyor',DurumTarihi DATETIME2(3) NULL,DurumKullanici NVARCHAR(100) NULL,
      OlusturmaTarihi DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),GuncellemeTarihi DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),Surum INT NOT NULL DEFAULT 1,
      CONSTRAINT CK_SpektrotekTalep_Durum CHECK (Durum IN (N'Bekliyor',N'Teklif Gönderildi')));
      CREATE INDEX IX_SpektrotekTalep_Tarih ON SpektrotekTalep (Tarih DESC,Id DESC); END`);
    await (await cosmoPool).request().query(hasMysqlConfig()?"ALTER TABLE SpektrotekTalep ADD COLUMN IF NOT EXISTS Surum INT NOT NULL DEFAULT 1":"IF COL_LENGTH('SpektrotekTalep','Surum') IS NULL ALTER TABLE SpektrotekTalep ADD Surum INT NOT NULL DEFAULT 1");
  })().catch(error=>{ready=null;throw error;});return ready;
}

export async function upsertSpektrotekTalepler(input:GelenSpektrotekTalep[]){
  const {talepler}=SpektrotekTalepBatch.parse({talepler:input});
  await ensureSpektrotekTalepSchema();
  const tx=await (await cosmoPool).transaction();await tx.begin();let eklenen=0;
  try{
    for(const t of [...talepler].sort((a,b)=>a.kaynakId.localeCompare(b.kaynakId))){
      const existing=(await tx.request().input("Source",t.kaynakId).query(hasMysqlConfig()?"SELECT Id FROM SpektrotekTalep WHERE KaynakId=@Source FOR UPDATE":"SELECT Id FROM SpektrotekTalep WITH (UPDLOCK,HOLDLOCK) WHERE KaynakId=@Source")).recordset[0];
      const request=tx.request().input("Source",t.kaynakId).input("Date",new Date(t.tarih)).input("Customer",t.musteriAdi).input("Person",t.kisiAdi||null).input("Email",t.email).input("Request",t.talep).input("Summary",t.ozet||null).input("Subject",t.konu||null).input("Account",t.hesap).input("Score",t.skor??null);
      if(existing)await request.query(`UPDATE SpektrotekTalep SET Tarih=@Date,MusteriAdi=@Customer,KisiAdi=@Person,Email=@Email,Talep=@Request,Ozet=@Summary,Konu=@Subject,Hesap=@Account,Skor=@Score,GuncellemeTarihi=${utc()},Surum=Surum+1 WHERE KaynakId=@Source`);
      else{await request.query(`INSERT INTO SpektrotekTalep (KaynakId,Tarih,MusteriAdi,KisiAdi,Email,Talep,Ozet,Konu,Hesap,Skor,OlusturmaTarihi,GuncellemeTarihi) VALUES (@Source,@Date,@Customer,@Person,@Email,@Request,@Summary,@Subject,@Account,@Score,${utc()},${utc()})`);eklenen++;}
    }
    await tx.commit();return {alinan:talepler.length,eklenen};
  }catch(error){await tx.rollback();throw error;}
}

export async function listSpektrotekTalepler(params:URLSearchParams):Promise<SpektrotekTalepList>{
  await ensureSpektrotekTalepSchema();const pool=await cosmoPool;
  const q=(params.get("q")||"").trim().slice(0,200),status=params.get("durum")||"",account=(params.get("hesap")||"").slice(0,100);
  if(status&&!SPEKTROTEK_TALEP_DURUMLAR.includes(status as SpektrotekTalep["durum"]))throw new SpektrotekTalepError("Geçersiz durum filtresi.");
  const rawPage=Number(params.get("page")||1),page=Number.isSafeInteger(rawPage)&&rawPage>0?Math.min(rawPage,100000):1,limit=50;
  const clauses:string[]=[];
  if(q)clauses.push("(MusteriAdi LIKE @Search ESCAPE '!' OR KisiAdi LIKE @Search ESCAPE '!' OR Email LIKE @Search ESCAPE '!' OR Talep LIKE @Search ESCAPE '!')");
  if(status)clauses.push("Durum=@Status");if(account)clauses.push("Hesap=@Account");
  const where=clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
  const req=()=>pool.request().input("Search",`%${q.replace(/[!%_\[]/g,char=>`!${char}`)}%`).input("Status",status).input("Account",account);
  const [rows,count,accounts,summary]=await Promise.all([
    req().input("Offset",(page-1)*limit).input("Limit",limit).query(`SELECT ${columns} FROM SpektrotekTalep ${where} ORDER BY Tarih DESC,Id DESC OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`),
    req().query(`SELECT COUNT(*) AS Total FROM SpektrotekTalep ${where}`),
    pool.request().query("SELECT DISTINCT Hesap FROM SpektrotekTalep ORDER BY Hesap"),
    pool.request().query("SELECT COUNT(*) AS Total,SUM(CASE WHEN Durum='Bekliyor' THEN 1 ELSE 0 END) AS Pending,SUM(CASE WHEN Durum='Teklif Gönderildi' THEN 1 ELSE 0 END) AS Offered,SUM(CASE WHEN KaynakId LIKE 'manual:%' THEN 1 ELSE 0 END) AS Manual FROM SpektrotekTalep"),
  ]);
  const stats=summary.recordset[0]||{};
  return {items:rows.recordset.map(map),total:Number(count.recordset[0]?.Total||0),page,limit,accounts:accounts.recordset.map((r:Row)=>String(r.Hesap)),summary:{total:Number(stats.Total||0),pending:Number(stats.Pending||0),offered:Number(stats.Offered||0),manual:Number(stats.Manual||0)}};
}
async function read(id:number){const row=(await (await cosmoPool).request().input("ID",id).query(`SELECT ${columns} FROM SpektrotekTalep WHERE Id=@ID`)).recordset[0];if(!row)throw new SpektrotekTalepError("Talep bulunamadı.",404);return map(row);}
export async function createSpektrotekTalep(input:unknown,actor:string){
  const t=SpektrotekTalepCreate.parse(input);await ensureSpektrotekTalepSchema();
  const source=`manual:${randomUUID()}`;
  const result=await (await cosmoPool).request().input("Source",source).input("Date",new Date(t.tarih)).input("Customer",t.musteriAdi).input("Person",t.kisiAdi||null).input("Email",t.email).input("Request",t.talep).input("Summary",t.ozet||null).input("Subject",t.konu||null).input("Account",t.hesap).input("Score",t.skor).input("Status",t.durum).input("Actor",actor.slice(0,100)).query(`INSERT INTO SpektrotekTalep (KaynakId,Tarih,MusteriAdi,KisiAdi,Email,Talep,Ozet,Konu,Hesap,Skor,Durum,DurumTarihi,DurumKullanici,OlusturmaTarihi,GuncellemeTarihi) OUTPUT INSERTED.Id VALUES (@Source,@Date,@Customer,@Person,@Email,@Request,@Summary,@Subject,@Account,@Score,@Status,${utc()},@Actor,${utc()},${utc()})`);
  return read(Number(result.recordset[0]?.Id??result.recordset[0]?.ID));
}
export async function updateSpektrotekTalep(id:number,input:unknown,actor:string,statusOnly=false){
  const edit=statusOnly?null:SpektrotekTalepEdit.parse(input),t=edit||SpektrotekTalepStatus.parse(input);await ensureSpektrotekTalepSchema();
  const request=(await cosmoPool).request().input("ID",id).input("Version",t.surum).input("Status",t.durum).input("Actor",actor.slice(0,100));
  let fields="";
  if(edit){const t=edit;request.input("Date",new Date(t.tarih)).input("Customer",t.musteriAdi).input("Person",t.kisiAdi||null).input("Email",t.email).input("Request",t.talep).input("Summary",t.ozet||null).input("Subject",t.konu||null).input("Account",t.hesap).input("Score",t.skor);fields="Tarih=@Date,MusteriAdi=@Customer,KisiAdi=@Person,Email=@Email,Talep=@Request,Ozet=@Summary,Konu=@Subject,Hesap=@Account,Skor=@Score,";}
  const result=await request.query(`UPDATE SpektrotekTalep SET ${fields}DurumTarihi=CASE WHEN Durum<>@Status THEN ${utc()} ELSE DurumTarihi END,DurumKullanici=CASE WHEN Durum<>@Status THEN @Actor ELSE DurumKullanici END,Durum=@Status,GuncellemeTarihi=${utc()},Surum=Surum+1 WHERE Id=@ID AND Surum=@Version`);
  if(!result.rowsAffected[0]){await read(id);throw new SpektrotekTalepError("Kayıt başka bir işlemle güncellendi. Güncel kaydı yeniden açıp değişikliği tekrar yapın.",409);}return read(id);
}
