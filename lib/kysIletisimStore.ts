/* eslint-disable @typescript-eslint/no-explicit-any */
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

type User = { userId: string; userName: string };
type Row = Record<string, any>;
let ready: Promise<void> | null = null;
const text = (value: unknown) => String(value ?? "").trim();
const number = (row: Row, key: string) => Number(row[key] ?? row[key.toLowerCase()] ?? 0);
const string = (row: Row, key: string) => String(row[key] ?? row[key.toLowerCase()] ?? "");
const date = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null;

export async function ensureKysIletisimSchema() {
  if (!ready) ready = createSchema().catch(error => { ready = null; throw error; });
  return ready;
}

async function createSchema() {
  const pool = await cosmoPool;
  if (hasMysqlConfig()) {
    await pool.request().query(`CREATE TABLE IF NOT EXISTS KysIletisim (
      ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY, Tur VARCHAR(20) NOT NULL, Baslik VARCHAR(220) NOT NULL,
      Icerik TEXT NULL, OlusturanID VARCHAR(80) NOT NULL, OlusturanAd VARCHAR(160) NOT NULL,
      AliciID VARCHAR(80) NULL, AliciAd VARCHAR(160) NULL, KonusmaID INT NULL,
      Durum VARCHAR(30) NOT NULL DEFAULT 'Aktif', TerminTarihi DATE NULL,
      CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY IX_KysIletisim_Alici (AliciID), KEY IX_KysIletisim_Konusma (KonusmaID), KEY IX_KysIletisim_Tur (Tur)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`);
    await pool.request().query(`CREATE TABLE IF NOT EXISTS KysIletisimOkuma (
      ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY, IcerikID INT NOT NULL, KullaniciID VARCHAR(80) NOT NULL,
      OkunduAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY UX_KysIletisimOkuma (IcerikID,KullaniciID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`);
    await pool.request().query(`CREATE TABLE IF NOT EXISTS KysIletisimGorevLog (
      ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY, GorevID INT NOT NULL, Durum VARCHAR(30) NOT NULL,
      KullaniciID VARCHAR(80) NOT NULL, KullaniciAd VARCHAR(160) NOT NULL, CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY IX_KysIletisimGorevLog_Gorev (GorevID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`);
  } else {
    await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='KysIletisim') CREATE TABLE KysIletisim (
      ID INT IDENTITY(1,1) PRIMARY KEY, Tur NVARCHAR(20) NOT NULL, Baslik NVARCHAR(220) NOT NULL, Icerik NVARCHAR(MAX) NULL,
      OlusturanID NVARCHAR(80) NOT NULL, OlusturanAd NVARCHAR(160) NOT NULL, AliciID NVARCHAR(80) NULL, AliciAd NVARCHAR(160) NULL,
      KonusmaID INT NULL, Durum NVARCHAR(30) NOT NULL DEFAULT 'Aktif', TerminTarihi DATE NULL,
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE(), UpdatedAt DATETIME NOT NULL DEFAULT GETDATE())`);
    await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='KysIletisimOkuma') CREATE TABLE KysIletisimOkuma (
      ID INT IDENTITY(1,1) PRIMARY KEY, IcerikID INT NOT NULL, KullaniciID NVARCHAR(80) NOT NULL, OkunduAt DATETIME NOT NULL DEFAULT GETDATE(),
      CONSTRAINT UX_KysIletisimOkuma UNIQUE (IcerikID,KullaniciID))`);
    await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='KysIletisimGorevLog') CREATE TABLE KysIletisimGorevLog (
      ID INT IDENTITY(1,1) PRIMARY KEY, GorevID INT NOT NULL, Durum NVARCHAR(30) NOT NULL, KullaniciID NVARCHAR(80) NOT NULL,
      KullaniciAd NVARCHAR(160) NOT NULL, CreatedAt DATETIME NOT NULL DEFAULT GETDATE())`);
  }
}

function mapItem(row: Row) {
  return { id:number(row,"ID"), tur:string(row,"Tur"), baslik:string(row,"Baslik"), icerik:string(row,"Icerik"),
    olusturanId:string(row,"OlusturanID"), olusturanAd:string(row,"OlusturanAd"), aliciId:string(row,"AliciID"), aliciAd:string(row,"AliciAd"),
    konusmaId:row.KonusmaID==null?null:number(row,"KonusmaID"), durum:string(row,"Durum"), terminTarihi:date(row.TerminTarihi),
    createdAt:date(row.CreatedAt), updatedAt:date(row.UpdatedAt), okundu:Boolean(number(row,"Okundu")) };
}

export async function listKysIletisim(user: User) {
  await ensureKysIletisimSchema(); const pool=await cosmoPool;
  const res=await pool.request().input("UserID",user.userId).query(`SELECT i.*,CASE WHEN o.ID IS NULL THEN 0 ELSE 1 END AS Okundu
    FROM KysIletisim i LEFT JOIN KysIletisimOkuma o ON o.IcerikID=i.ID AND o.KullaniciID=@UserID
    WHERE i.Tur='Duyuru' OR i.OlusturanID=@UserID OR i.AliciID=@UserID ORDER BY i.CreatedAt DESC`);
  const items=res.recordset.map(mapItem);
  const readRows=await pool.request().query(`SELECT IcerikID,KullaniciID,OkunduAt FROM KysIletisimOkuma ORDER BY OkunduAt ASC`);
  const readsByItem=new Map<number,Array<{kullaniciId:string;okunduAt:string|null}>>();
  for(const row of readRows.recordset){const id=number(row,"IcerikID");const list=readsByItem.get(id)||[];list.push({kullaniciId:string(row,"KullaniciID"),okunduAt:date(row.OkunduAt)});readsByItem.set(id,list);}
  const logs=await pool.request().query(`SELECT GorevID,Durum,KullaniciAd,CreatedAt FROM KysIletisimGorevLog ORDER BY CreatedAt ASC`);
  const logByTask=new Map<number,any[]>();
  for(const row of logs.recordset){const id=number(row,"GorevID");const list=logByTask.get(id)||[];list.push({durum:string(row,"Durum"),kullaniciAd:string(row,"KullaniciAd"),createdAt:date(row.CreatedAt)});logByTask.set(id,list);}
  const messages=items.filter((item:any)=>item.tur==="Mesaj");
  const threads=Array.from(new Set(messages.map((item:any)=>item.konusmaId||item.id))).map(id=>({id,messages:messages.filter((item:any)=>(item.konusmaId||item.id)===id).sort((a:any,b:any)=>String(a.createdAt).localeCompare(String(b.createdAt)))})).sort((a,b)=>String(b.messages.at(-1)?.createdAt).localeCompare(String(a.messages.at(-1)?.createdAt)));
  return {duyurular:items.filter((item:any)=>item.tur==="Duyuru").map((item:any)=>({...item,okuyanlar:readsByItem.get(item.id)||[]})),mesajlar:threads,gorevler:items.filter((item:any)=>item.tur==="Görev").map((item:any)=>({...item,akış:logByTask.get(item.id)||[]}))};
}

export async function createKysIletisim(input:Record<string,unknown>,user:User){
  await ensureKysIletisimSchema(); const tur=text(input.tur); const baslik=text(input.baslik); const icerik=text(input.icerik);
  if(!["Duyuru","Mesaj","Görev"].includes(tur))throw new Error("Geçersiz iletişim türü."); if(!baslik)throw new Error("Başlık zorunludur."); if(!icerik)throw new Error("İçerik zorunludur.");
  const ids=Array.isArray(input.aliciIds)?input.aliciIds.map(text).filter(Boolean):[text(input.aliciId)].filter(Boolean);
  const names=Array.isArray(input.aliciAdlar)?input.aliciAdlar.map(text):[text(input.aliciAd)];
  if(tur!=="Duyuru"&&!ids.length)throw new Error("Alıcı seçilmelidir."); if(tur==="Görev"&&ids.length!==1)throw new Error("Görev için tek alıcı seçilmelidir.");
  const recipients=tur==="Duyuru"?[{id:null,name:null}]:ids.map((id,index)=>({id,name:names[index]||id})); const created:number[]=[]; const pool=await cosmoPool;
  for(const recipient of recipients){const result=await pool.request().input("Tur",tur).input("Baslik",baslik.slice(0,220)).input("Icerik",icerik)
    .input("OlusturanID",user.userId).input("OlusturanAd",user.userName).input("AliciID",recipient.id).input("AliciAd",recipient.name).input("Termin",text(input.terminTarihi)||null)
    .query(`INSERT INTO KysIletisim (Tur,Baslik,Icerik,OlusturanID,OlusturanAd,AliciID,AliciAd,Durum,TerminTarihi) OUTPUT INSERTED.ID VALUES (@Tur,@Baslik,@Icerik,@OlusturanID,@OlusturanAd,@AliciID,@AliciAd,${tur==="Görev"?"'Atandı'":"'Aktif'"},@Termin)`);
   const id=Number(result.recordset[0]?.ID);created.push(id);if(tur==="Mesaj")await pool.request().input("ID",id).query("UPDATE KysIletisim SET KonusmaID=@ID WHERE ID=@ID");if(tur==="Görev")await pool.request().input("ID",id).input("UserID",user.userId).input("UserName",user.userName).query("INSERT INTO KysIletisimGorevLog (GorevID,Durum,KullaniciID,KullaniciAd) VALUES (@ID,'Atandı',@UserID,@UserName)");}
  return {id:created[0],ids:created};
}

export async function replyKysMesaj(threadId:number,icerik:string,user:User){
  await ensureKysIletisimSchema(); if(!text(icerik))throw new Error("Yanıt boş olamaz."); const pool=await cosmoPool;
  const root=(await pool.request().input("ID",threadId).query("SELECT TOP 1 * FROM KysIletisim WHERE KonusmaID=@ID AND Tur='Mesaj' ORDER BY ID ASC")).recordset[0]; if(!root)throw new Error("Konuşma bulunamadı.");
  if(![string(root,"OlusturanID"),string(root,"AliciID")].includes(user.userId))throw new Error("Bu konuşmaya erişiminiz yok.");
  const aliciId=string(root,"OlusturanID")===user.userId?string(root,"AliciID"):string(root,"OlusturanID"); const aliciAd=string(root,"OlusturanID")===user.userId?string(root,"AliciAd"):string(root,"OlusturanAd");
  await pool.request().input("Baslik",string(root,"Baslik")).input("Icerik",text(icerik)).input("OlusturanID",user.userId).input("OlusturanAd",user.userName).input("AliciID",aliciId).input("AliciAd",aliciAd).input("ThreadID",threadId)
    .query("INSERT INTO KysIletisim (Tur,Baslik,Icerik,OlusturanID,OlusturanAd,AliciID,AliciAd,KonusmaID,Durum) VALUES ('Mesaj',@Baslik,@Icerik,@OlusturanID,@OlusturanAd,@AliciID,@AliciAd,@ThreadID,'Aktif')");
}

export async function markKysIletisimRead(id:number,user:User){
  await ensureKysIletisimSchema();const pool=await cosmoPool;
  const item=(await pool.request().input("ID",id).query("SELECT TOP 1 Tur,OlusturanID,AliciID FROM KysIletisim WHERE ID=@ID")).recordset[0];
  if(!item)throw new Error("Bildirim bulunamadı.");
  if(string(item,"Tur")!=="Duyuru"&&![string(item,"OlusturanID"),string(item,"AliciID")].includes(user.userId))throw new Error("Bu bildirime erişiminiz yok.");
  await pool.request().input("ID",id).input("UserID",user.userId).query(hasMysqlConfig()?"INSERT IGNORE INTO KysIletisimOkuma (IcerikID,KullaniciID) VALUES (@ID,@UserID)":"IF NOT EXISTS (SELECT 1 FROM KysIletisimOkuma WHERE IcerikID=@ID AND KullaniciID=@UserID) INSERT INTO KysIletisimOkuma (IcerikID,KullaniciID) VALUES (@ID,@UserID)");
}
export async function markAllKysIletisimRead(user:User){await ensureKysIletisimSchema();const pool=await cosmoPool;await pool.request().input("UserID",user.userId).query(hasMysqlConfig()?"INSERT IGNORE INTO KysIletisimOkuma (IcerikID,KullaniciID) SELECT ID,@UserID FROM KysIletisim WHERE (Tur='Duyuru' AND OlusturanID<>@UserID) OR AliciID=@UserID":"INSERT INTO KysIletisimOkuma (IcerikID,KullaniciID) SELECT i.ID,@UserID FROM KysIletisim i WHERE ((i.Tur='Duyuru' AND i.OlusturanID<>@UserID) OR i.AliciID=@UserID) AND NOT EXISTS (SELECT 1 FROM KysIletisimOkuma o WHERE o.IcerikID=i.ID AND o.KullaniciID=@UserID)");}

export async function updateKysGorev(id:number,durum:string,user:User){await ensureKysIletisimSchema();if(!["Başladı","Tamamlandı"].includes(durum))throw new Error("Geçersiz görev durumu.");const pool=await cosmoPool;const row=(await pool.request().input("ID",id).query("SELECT * FROM KysIletisim WHERE ID=@ID AND Tur='Görev'")).recordset[0];if(!row)throw new Error("Görev bulunamadı.");if(string(row,"AliciID")!==user.userId&&string(row,"OlusturanID")!==user.userId)throw new Error("Bu görevi güncelleme yetkiniz yok.");await pool.request().input("ID",id).input("Durum",durum).query("UPDATE KysIletisim SET Durum=@Durum,UpdatedAt=GETDATE() WHERE ID=@ID");await pool.request().input("ID",id).input("Durum",durum).input("UserID",user.userId).input("UserName",user.userName).query("INSERT INTO KysIletisimGorevLog (GorevID,Durum,KullaniciID,KullaniciAd) VALUES (@ID,@Durum,@UserID,@UserName)");}

export async function updateKysGorevDetails(id:number,input:Record<string,unknown>,user:User){
  await ensureKysIletisimSchema();const pool=await cosmoPool;
  const row=(await pool.request().input("ID",id).query("SELECT TOP 1 * FROM KysIletisim WHERE ID=@ID AND Tur='Görev'")).recordset[0];
  if(!row)throw new Error("Görev bulunamadı.");
  if(string(row,"OlusturanID")!==user.userId)throw new Error("Görevi yalnızca atayan kişi düzenleyebilir.");
  if(string(row,"Durum")==="Tamamlandı")throw new Error("Tamamlanan görevler düzenlenemez.");
  const baslik=text(input.baslik);const icerik=text(input.icerik);const aliciId=text(input.aliciId);const aliciAd=text(input.aliciAd);const termin=text(input.terminTarihi);
  if(!baslik||!icerik||!aliciId||!termin)throw new Error("Başlık, içerik, alıcı ve termin zorunludur.");
  await pool.request().input("ID",id).input("Baslik",baslik.slice(0,220)).input("Icerik",icerik).input("AliciID",aliciId).input("AliciAd",aliciAd||aliciId).input("Termin",termin)
    .query("UPDATE KysIletisim SET Baslik=@Baslik,Icerik=@Icerik,AliciID=@AliciID,AliciAd=@AliciAd,TerminTarihi=@Termin,UpdatedAt=GETDATE() WHERE ID=@ID");
  await pool.request().input("ID",id).input("UserID",user.userId).input("UserName",user.userName).query("INSERT INTO KysIletisimGorevLog (GorevID,Durum,KullaniciID,KullaniciAd) VALUES (@ID,'Düzenlendi',@UserID,@UserName)");
}

export async function deleteKysGorev(id:number,user:User){
  await ensureKysIletisimSchema();const pool=await cosmoPool;
  const row=(await pool.request().input("ID",id).query("SELECT TOP 1 OlusturanID,Durum FROM KysIletisim WHERE ID=@ID AND Tur='Görev'")).recordset[0];
  if(!row)throw new Error("Görev bulunamadı.");
  if(string(row,"OlusturanID")!==user.userId)throw new Error("Görevi yalnızca atayan kişi silebilir.");
  if(string(row,"Durum")==="Tamamlandı")throw new Error("Tamamlanan görevler silinemez.");
  await pool.request().input("ID",id).query("DELETE FROM KysIletisimOkuma WHERE IcerikID=@ID");
  await pool.request().input("ID",id).query("DELETE FROM KysIletisimGorevLog WHERE GorevID=@ID");
  await pool.request().input("ID",id).query("DELETE FROM KysIletisim WHERE ID=@ID AND Tur='Görev'");
}

export async function getKysBildirimler(user:User){const data=await listKysIletisim(user);const items=[...data.duyurular.filter((x:any)=>!x.okundu&&x.olusturanId!==user.userId).map((x:any)=>({...x,etiket:"Duyuru"})),...data.mesajlar.flatMap((t:any)=>t.messages).filter((x:any)=>!x.okundu&&x.aliciId===user.userId).map((x:any)=>({...x,etiket:"Mesaj"})),...data.gorevler.filter((x:any)=>!x.okundu&&x.aliciId===user.userId).map((x:any)=>({...x,etiket:"Görev"}))].sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt)));return {count:items.length,items:items.slice(0,8)};}
