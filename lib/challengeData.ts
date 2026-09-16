/* eslint-disable @typescript-eslint/no-explicit-any */
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { validateChallengeData, type ChallengeData } from "@/lib/challengeImport";

let ready: Promise<void> | null = null;
export function ensureChallengeTable(pool: any): Promise<void> {
  if (!ready) ready = pool.request().query(hasMysqlConfig()
    ? "CREATE TABLE IF NOT EXISTS NKR_ChallengeVeri (NkrID INT PRIMARY KEY,VeriJson LONGTEXT NOT NULL,UpdatedBy VARCHAR(80) NULL,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    : "IF OBJECT_ID('NKR_ChallengeVeri','U') IS NULL CREATE TABLE NKR_ChallengeVeri (NkrID INT PRIMARY KEY,VeriJson NVARCHAR(MAX) NOT NULL,UpdatedBy NVARCHAR(80) NULL,UpdatedAt DATETIME NOT NULL DEFAULT GETDATE())"
  ).then(() => undefined).catch((error: unknown) => { ready = null; throw error; });
  return ready!;
}

export async function loadChallengeData(pool: any, nkrId: number): Promise<ChallengeData | null> {
  const exists = await pool.request().query("SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='NKR_ChallengeVeri'");
  if (!exists.recordset.length) return null;
  const result = await pool.request().input("ID", nkrId).query("SELECT VeriJson FROM NKR_ChallengeVeri WHERE NkrID=@ID");
  return result.recordset[0] ? validateChallengeData(JSON.parse(String(result.recordset[0].VeriJson))) : null;
}

export async function saveChallengeData(base: any, nkrId: number, value: unknown, userId: string, submit: boolean) {
  const data = validateChallengeData(value);
  await ensureChallengeTable(base);
  const tx = await base.transaction(); await tx.begin();
  try {
    const sample = (await tx.request().input("ID", nkrId).query(hasMysqlConfig()
      ? "SELECT ID FROM NKR WHERE ID=@ID AND Durum='Aktif' FOR UPDATE"
      : "SELECT ID FROM NKR WITH (UPDLOCK,HOLDLOCK) WHERE ID=@ID AND Durum='Aktif'")).recordset[0];
    if (!sample) throw new Error("Aktif numune bulunamadı.");
    const services = (await tx.request().input("ID", nkrId).query("SELECT x.ID FROM NumuneX1 x INNER JOIN StokAnalizListesi s ON s.ID=x.AnalizID WHERE x.RaporID=@ID AND UPPER(s.RaporFormati) IN ('CHALLENGE','CHALLENGEEN')")).recordset;
    if (!services.length) throw new Error("Bu numunede Challenge formatında analiz yok.");
    const approved = (await tx.request().input("ID", nkrId).query("SELECT ID FROM NKR_RaporOnay WHERE NkrID=@ID AND UPPER(RaporFormati) IN ('CHALLENGE','CHALLENGEEN') AND Durum IN (N'Onaylandı',N'Ödeme bekliyor',N'Yayınlandı',N'Arşiv')")).recordset;
    if (approved.length) throw new Error("Onaylı raporun sonuçları değiştirilemez. Önce raporu geri alın.");
    const existing = (await tx.request().input("ID", nkrId).query("SELECT NkrID FROM NKR_ChallengeVeri WHERE NkrID=@ID")).recordset[0];
    await tx.request().input("ID", nkrId).input("Json", JSON.stringify(data)).input("User", userId).query(existing
      ? "UPDATE NKR_ChallengeVeri SET VeriJson=@Json,UpdatedBy=@User,UpdatedAt=GETDATE() WHERE NkrID=@ID"
      : "INSERT INTO NKR_ChallengeVeri (NkrID,VeriJson,UpdatedBy) VALUES (@ID,@Json,@User)");
    const assessmentEn = data.assessment === "Uygun" ? "Pass" : data.assessment === "Uygun Değil" ? "Fail" : "N/A";
    for (const service of services) await tx.request().input("ID", service.ID).input("NkrID", nkrId).input("Assessment", data.assessment).input("AssessmentEn", assessmentEn)
      .query("UPDATE NumuneX1 SET Sonuc=N'Bkz. Ek-1',SonucEn='See Annex-1',Degerlendirme=@Assessment,DegerlendirmeEn=@AssessmentEn,SonucKayitTarihi=GETDATE() WHERE ID=@ID AND RaporID=@NkrID");
    for (const format of ["Challenge", "ChallengeEn"]) await tx.request().input("ID", nkrId).input("Format", format).input("Status", submit ? "Onay Bekleniyor" : "Analiz Devam Ediyor")
      .query("DELETE FROM NKR_RaporDurumOverride WHERE NkrID=@ID AND RaporFormati=@Format; INSERT INTO NKR_RaporDurumOverride (NkrID,RaporFormati,Durum,UpdatedAt) VALUES (@ID,@Format,@Status,GETDATE());");
    const logExists = (await tx.request().query("SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='NKR_Log'")).recordset.length;
    if (logExists) await tx.request().input("ID", nkrId).input("User", Number(userId) || null).input("Action", submit ? "Onaya Gönderildi" : "Sonuç Girişi").input("Description", `Challenge Excel: ${data.sourceFile} / ${data.sourceSheet}. Değerlendirme: ${data.assessment}.`)
      .query("INSERT INTO NKR_Log (NKRID,KullaniciID,Eylem,Aciklama,Tarih) VALUES (@ID,@User,@Action,@Description,CURRENT_TIMESTAMP)");
    await tx.commit(); return { ok: true, durum: submit ? "Onay Bekleniyor" : "Analiz Devam Ediyor" };
  } catch (error) { await tx.rollback(); throw error; }
}
