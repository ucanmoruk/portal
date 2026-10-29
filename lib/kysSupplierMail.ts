import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectionPool } from "mssql";
import nodemailer from "nodemailer";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { ensureKysPurchaseSchema } from "@/lib/kysPurchaseWorkflow";
import { getAllSettings } from "@/lib/settings";
import { renderHtmlToPdf } from "@/lib/chromiumPdf";
import { kysRequestCompany } from "@/lib/kysRequestCompany";
import { PURCHASING_CC, PURCHASING_FROM, purchaseFormHtml, supplierMailContent, supplierEmails, type PurchaseMailSnapshot } from "@/lib/kysSupplierMailPolicy";

type Executor = Pick<ConnectionPool,"request">;
let ready: Promise<void> | null = null;
export async function ensureSupplierMailSchema() {
  await ensureKysPurchaseSchema();
  if (!ready) ready=(async()=>{
    const pool=await cosmoPool;
    if(hasMysqlConfig()) {
      await pool.request().query("ALTER TABLE KysTalep ADD COLUMN IF NOT EXISTS MailOnayID VARCHAR(36) NULL");
      await pool.request().query(`CREATE TABLE IF NOT EXISTS KysTalepTedarikciMail (
        ID VARCHAR(36) NOT NULL PRIMARY KEY, OnayID VARCHAR(36) NOT NULL, TalepID INT NOT NULL,
        TedarikciID INT NOT NULL, TedarikciAd VARCHAR(220) NOT NULL, Alicilar TEXT NOT NULL, FormJson LONGTEXT NOT NULL,
        Durum VARCHAR(24) NOT NULL DEFAULT 'Bekliyor', Hata TEXT NULL, MesajID VARCHAR(255) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, SentAt DATETIME NULL,
        UNIQUE KEY UX_TalepMail_Onay (OnayID,TedarikciID), KEY IX_TalepMail_Talep (TalepID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`);
      await pool.request().query("ALTER TABLE KysTalepTedarikciMail ADD COLUMN IF NOT EXISTS BaslamaTarihi DATETIME NULL, ADD COLUMN IF NOT EXISTS Asama VARCHAR(40) NULL");
    } else {
      await pool.request().query("IF COL_LENGTH('KysTalep','MailOnayID') IS NULL ALTER TABLE KysTalep ADD MailOnayID NVARCHAR(36) NULL");
      await pool.request().query(`IF OBJECT_ID('KysTalepTedarikciMail','U') IS NULL CREATE TABLE KysTalepTedarikciMail (
        ID NVARCHAR(36) NOT NULL PRIMARY KEY, OnayID NVARCHAR(36) NOT NULL, TalepID INT NOT NULL,
        TedarikciID INT NOT NULL, TedarikciAd NVARCHAR(220) NOT NULL, Alicilar NVARCHAR(MAX) NOT NULL, FormJson NVARCHAR(MAX) NOT NULL,
        Durum NVARCHAR(24) NOT NULL DEFAULT 'Bekliyor', Hata NVARCHAR(MAX) NULL, MesajID NVARCHAR(255) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(), SentAt DATETIME NULL,
        CONSTRAINT UX_TalepMail_Onay UNIQUE (OnayID,TedarikciID))`);
      await pool.request().query("IF COL_LENGTH('KysTalepTedarikciMail','BaslamaTarihi') IS NULL ALTER TABLE KysTalepTedarikciMail ADD BaslamaTarihi DATETIME NULL; IF COL_LENGTH('KysTalepTedarikciMail','Asama') IS NULL ALTER TABLE KysTalepTedarikciMail ADD Asama NVARCHAR(40) NULL;");
    }
  })().catch(error=>{ready=null;throw error;});
  return ready;
}

// Called inside the send preparation transaction: addresses and form contents are frozen together.
export async function queueSupplierMail(tx:Executor, requestId:number, approvalId:string, ids:unknown, snapshot:PurchaseMailSnapshot, extra:unknown=[]){
  if(!Array.isArray(ids)||!Array.isArray(extra))throw new Error("Alıcı seçimi geçersiz.");
  const supplierIds=[...new Set(ids.map(Number))];
  if(supplierIds.some(id=>!Number.isSafeInteger(id)||id<=0))throw new Error("Tedarikçi seçimi geçersiz.");
  const recipients:Array<{id:number;name:string;addresses:string[]}>=[];
  for(const supplierId of supplierIds){
    const supplier=(await tx.request().input("ID",supplierId).query("SELECT ID,Ad,Email FROM KysTedarikci WHERE ID=@ID AND Durum='Aktif'")).recordset[0];
    if(!supplier)throw new Error("Seçili tedarikçi bulunamadı veya pasif.");
    const addresses=supplierEmails(supplier.Email);
    if(!addresses.length)throw new Error(`${supplier.Ad}: en az bir e-posta adresi kaydedilmelidir.`);
    recipients.push({id:supplierId,name:supplier.Ad,addresses});
  }
  const known=new Set(recipients.flatMap(recipient=>recipient.addresses));
  const manual=supplierEmails(extra.join(";")).filter(address=>!known.has(address));
  manual.forEach((address,index)=>recipients.push({id:-index-1,name:"Manuel alıcı",addresses:[address]}));
  if(!recipients.length||recipients.length>50)throw new Error("1–50 tedarikçi veya e-posta adresi seçin.");
  for(const recipient of recipients){
    await tx.request().input("ID",randomUUID()).input("OnayID",approvalId).input("TalepID",requestId).input("TedarikciID",recipient.id).input("Ad",recipient.name).input("Alicilar",JSON.stringify(recipient.addresses)).input("Form",JSON.stringify(snapshot))
      .query("INSERT INTO KysTalepTedarikciMail (ID,OnayID,TalepID,TedarikciID,TedarikciAd,Alicilar,FormJson) VALUES (@ID,@OnayID,@TalepID,@TedarikciID,@Ad,@Alicilar,@Form)");
  }
}

const staleSql=(alias="m")=>hasMysqlConfig()?`TIMESTAMPDIFF(SECOND,COALESCE(${alias}.BaslamaTarihi,${alias}.CreatedAt),CURRENT_TIMESTAMP)>600`:`DATEDIFF(second,COALESCE(${alias}.BaslamaTarihi,${alias}.CreatedAt),GETDATE())>600`;
export async function prepareSupplierMail(requestId:number,ids:unknown,extra:unknown=[],resend=false,sendKey?:string){
  await ensureSupplierMailSchema();
  const pool=await cosmoPool;
  const tx=await pool.transaction();await tx.begin();
  try{
    const current=(await tx.request().input("ID",requestId).query(hasMysqlConfig()?"SELECT * FROM KysTalep WHERE ID=@ID FOR UPDATE":"SELECT * FROM KysTalep WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID")).recordset[0];
    if(!current||!["Onaylandı","İşleme Alındı","Kısmi Kabul","Tamamlandı"].includes(current.Durum)||current.TalepTuru==="Sipariş")throw new Error("Mail yalnızca onaylanan talepler için gönderilebilir.");
    const existing=(await tx.request().input("ID",requestId).query(`SELECT m.ID,m.OnayID,m.Durum,CASE WHEN ${staleSql()} THEN 1 ELSE 0 END AS ZamanAsimi FROM KysTalepTedarikciMail m WHERE m.TalepID=@ID`)).recordset;
    if(sendKey&&!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sendKey))throw new Error("Gönderim anahtarı geçersiz.");
    if(sendKey&&existing.some(row=>row.OnayID===sendKey)){await tx.commit();return;}
    if(existing.some(row=>row.Durum==="Gönderiliyor"&&!Number(row.ZamanAsimi)))throw new Error("Bir mail gönderimi hâlâ sürüyor. Sonucu almadan yeniden göndermeyin.");
    if(existing.length&&!resend)throw new Error("Önceki gönderimi kontrol edip yeniden gönderim onayını işaretleyin.");
    const approvalId=sendKey||randomUUID();
    const {getKysRequestDetail}=await import("@/lib/kysStore");
    const detail=await getKysRequestDetail(requestId,false,tx);
    if(!detail)throw new Error("Talep bulunamadı.");
    await queueSupplierMail(tx,requestId,approvalId,ids,{...detail.talep,kalemler:detail.kalemler},extra);
    await tx.request().input("ID",requestId).input("MailOnayID",approvalId).query("UPDATE KysTalep SET MailOnayID=@MailOnayID WHERE ID=@ID");
    await tx.commit();
  }catch(error){await tx.rollback();throw error;}
}

async function purchasingMailer(){
  const cfg=await getAllSettings().catch(()=>({} as Record<string,string>));
  const setting=(key:string,fallback="")=>cfg[`PURCHASING_${key}`]||process.env[`PURCHASING_${key}`]||cfg[key]||process.env[key]||fallback;
  const host=setting("MAIL_HOST").trim().replace(/^[a-z]+:\/\//i,"").replace(/\/.*$/,"");
  const user=setting("MAIL_USER").trim(),pass=setting("MAIL_PASS");
  if(!host||!user||!pass)throw new Error("Satın alma SMTP ayarları eksik. PURCHASING_MAIL_* veya mevcut MAIL_* ayarlarını kontrol edin.");
  const transporter=nodemailer.createTransport({host,port:Number(setting("MAIL_PORT","587")),secure:setting("MAIL_SECURE","false")==="true",auth:{user,pass},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
  await transporter.verify();
  return transporter;
}

export async function sendQueuedSupplierMail(requestId:number,retry=false,actor:{userId?:string|null;userName?:string|null}={}) {
  await ensureSupplierMailSchema();
  const pool=await cosmoPool;
  const jobs=(await pool.request().input("ID",requestId).query(`SELECT m.* FROM KysTalepTedarikciMail m
    INNER JOIN KysTalep t ON t.ID=m.TalepID AND t.MailOnayID=m.OnayID
    WHERE m.TalepID=@ID AND t.Durum NOT IN ('Onay Bekliyor','İptal','Silindi') AND m.Durum IN (${retry?"'Bekliyor','Hata'":"'Bekliyor'"}) ORDER BY m.CreatedAt,m.ID`)).recordset;
  let transporter: Awaited<ReturnType<typeof purchasingMailer>> | undefined;
  const pdfs=new Map<string,Buffer>();
  const summary={gonderildi:0,hata:0,belirsiz:0};
  try {
    for(const job of jobs){
      const claim=await pool.request().input("ID",job.ID).query(`UPDATE KysTalepTedarikciMail SET Durum='Gönderiliyor',Hata=NULL,BaslamaTarihi=GETDATE(),Asama='SMTP bağlantısı' WHERE ID=@ID AND Durum IN (${retry?"'Bekliyor','Hata'":"'Bekliyor'"})
        AND EXISTS (SELECT 1 FROM KysTalep t WHERE t.ID=KysTalepTedarikciMail.TalepID AND t.MailOnayID=KysTalepTedarikciMail.OnayID AND t.Durum NOT IN ('Onay Bekliyor','İptal','Silindi'))`);
      if(!claim.rowsAffected[0])continue;
      let attempted=false;
      try {
        transporter ||= await purchasingMailer();
        await pool.request().input("ID",job.ID).input("Asama","PDF hazırlanıyor").query("UPDATE KysTalepTedarikciMail SET Asama=@Asama WHERE ID=@ID");
        const snapshot=JSON.parse(job.FormJson) as PurchaseMailSnapshot;
        const to=supplierEmails((JSON.parse(job.Alicilar) as string[]).join(";"));
        if(!to.length)throw new Error("Tedarikçi adresi bulunamadı.");
        let pdf=pdfs.get(job.OnayID);
        if(!pdf){
          const brand=kysRequestCompany(snapshot.seri);
          const logo=await readFile(path.join(process.cwd(),"public",brand?.logo.replace(/^\//,"")||"unique-logo.png"));
          const cfg=await getAllSettings().catch(()=>({} as Record<string,string>));
          pdf=await renderHtmlToPdf(purchaseFormHtml(snapshot,`data:image/png;base64,${logo.toString("base64")}`,cfg.SIRKET_ADI||process.env.SIRKET_ADI),{marginTop:14/25.4,marginBottom:22/25.4,marginLeft:14/25.4,marginRight:14/25.4});
          pdfs.set(job.OnayID,pdf);
        }
        const current=(await pool.request().input("TalepID",requestId).query("SELECT MailOnayID,Durum FROM KysTalep WHERE ID=@TalepID")).recordset[0];
        if(!current||current.MailOnayID!==job.OnayID||['Onay Bekliyor','İptal','Silindi'].includes(current.Durum))throw new Error("Talep onayı değiştiği için bu gönderim durduruldu.");
        await pool.request().input("ID",job.ID).input("Asama","Mail gönderiliyor").query("UPDATE KysTalepTedarikciMail SET Asama=@Asama WHERE ID=@ID");
        attempted=true;
        const content=supplierMailContent();
        const info=await transporter.sendMail({
          from:{name:"UNIQUE Satın Alma",address:PURCHASING_FROM},replyTo:PURCHASING_FROM,to,cc:PURCHASING_CC,
          messageId:`<kys-request-${job.ID}@uniquealphabet.com>`,subject:`Talep Formu – ${snapshot.talepNo}`,
          ...content,
          attachments:[{filename:`Talep-${snapshot.talepNo.replace(/[^a-zA-Z0-9_-]/g,"-")}.pdf`,content:pdf,contentType:"application/pdf"},{filename:"unique-logo.png",path:path.join(process.cwd(),"public","unique-logo.png"),cid:"purchasing-signature"}],
        });
        const accepted=(info.accepted||[]).map(address=>typeof address==="string"?address.toLowerCase():address.address.toLowerCase());
        if(info.rejected?.length||to.some(address=>!accepted.includes(address)))throw new Error("SMTP bazı alıcıları kabul etmedi. Kısmi gönderim olabilir; tekrar göndermeden önce kontrol edin.");
        await pool.request().input("ID",job.ID).input("MesajID",info.messageId).query("UPDATE KysTalepTedarikciMail SET Durum='Gönderildi',SentAt=GETDATE(),MesajID=@MesajID WHERE ID=@ID");
        summary.gonderildi++;
      } catch(error){
        const code=(error as {code?:string}).code;
        const uncertain=attempted&&!['EAUTH','ECONNECTION','EDNS','ETLS','EENVELOPE'].includes(code||"");
        const state=uncertain?"Belirsiz":"Hata";
        const message=error instanceof Error?error.message:"Mail gönderimi tamamlanamadı.";
        await pool.request().input("ID",job.ID).input("Durum",state).input("Hata",message.slice(0,1000)).query("UPDATE KysTalepTedarikciMail SET Durum=@Durum,Hata=@Hata WHERE ID=@ID");
        if(uncertain)summary.belirsiz++;else summary.hata++;
      }
    }
  } finally { transporter?.close(); }
  await pool.request().input("ID",requestId).input("UserID",actor.userId||null).input("UserName",actor.userName||null).query(`UPDATE KysTalep SET Durum='İşleme Alındı',IslemeAlanID=@UserID,IslemeAlanAd=@UserName,IslemeAlmaTarihi=GETDATE(),UpdatedAt=GETDATE()
    WHERE ID=@ID AND Durum='Onaylandı'
      AND EXISTS (SELECT 1 FROM KysTalepTedarikciMail m WHERE m.TalepID=KysTalep.ID AND m.OnayID=KysTalep.MailOnayID)
      AND NOT EXISTS (SELECT 1 FROM KysTalepTedarikciMail m WHERE m.TalepID=KysTalep.ID AND m.OnayID=KysTalep.MailOnayID AND m.Durum<>'Gönderildi')`);
  return summary;
}

export async function listSupplierMail(requestId:number) {
  await ensureSupplierMailSchema();
  const pool=await cosmoPool;
  return (await pool.request().input("ID",requestId).query(`SELECT m.ID,m.TedarikciAd,m.Alicilar,m.Durum,m.Hata,m.CreatedAt,m.SentAt,m.BaslamaTarihi,m.Asama,
    CASE WHEN ${staleSql()} THEN 1 ELSE 0 END AS ZamanAsimi,
    CASE WHEN t.MailOnayID=m.OnayID THEN 1 ELSE 0 END AS AktifOnay
    FROM KysTalepTedarikciMail m INNER JOIN KysTalep t ON t.ID=m.TalepID WHERE m.TalepID=@ID ORDER BY m.CreatedAt DESC,m.ID`)).recordset;
}
