import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { labScopeSql, type LabScope } from "@/lib/labResultAccess";
import { intermediateDates, validFlowDate, type LabFlowData } from "@/lib/labAkisTypes";

let ready: Promise<void> | null = null;
const date = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || "").slice(0, 10);
type Row = Record<string, unknown>;
const eligible = "n.Durum=N'Aktif' AND LTRIM(RTRIM(n.Grup)) IN (N'Özel',N'K.D.')";

export function ensureLabFlow() {
  if (!ready) ready = (async () => {
    const pool = await cosmoPool;
    if (hasMysqlConfig()) {
      await pool.request().query(`CREATE TABLE IF NOT EXISTS LabAkisAnaliz (
        X1ID INT PRIMARY KEY, Baslangic DATE NOT NULL, Tamamlandi INT NOT NULL DEFAULT 0,
        UpdatedBy VARCHAR(80) NULL, UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`);
      await pool.request().query(`CREATE TABLE IF NOT EXISTS LabAkisAraGun (
        ID INT AUTO_INCREMENT PRIMARY KEY, X1ID INT NOT NULL, Gun INT NOT NULL, Tarih DATE NOT NULL,
        Tamamlandi INT NOT NULL DEFAULT 0, UNIQUE KEY UX_LabAkisAraGun (X1ID,Gun)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`);
      await pool.request().query(`CREATE TABLE IF NOT EXISTS LabAkisKalite (
        ID INT AUTO_INCREMENT PRIMARY KEY, Baslik VARCHAR(220) NOT NULL, Aciklama TEXT NULL, Tarih DATE NOT NULL,
        Tamamlandi INT NOT NULL DEFAULT 0, CreatedBy VARCHAR(80) NOT NULL, UpdatedBy VARCHAR(80) NULL,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci`);
    } else {
      await pool.request().query(`IF OBJECT_ID('LabAkisAnaliz','U') IS NULL CREATE TABLE LabAkisAnaliz (
        X1ID INT PRIMARY KEY, Baslangic DATE NOT NULL, Tamamlandi INT NOT NULL DEFAULT 0,
        UpdatedBy NVARCHAR(80) NULL, UpdatedAt DATETIME NOT NULL DEFAULT GETDATE())`);
      await pool.request().query(`IF OBJECT_ID('LabAkisAraGun','U') IS NULL CREATE TABLE LabAkisAraGun (
        ID INT IDENTITY(1,1) PRIMARY KEY, X1ID INT NOT NULL, Gun INT NOT NULL, Tarih DATE NOT NULL,
        Tamamlandi INT NOT NULL DEFAULT 0, CONSTRAINT UX_LabAkisAraGun UNIQUE (X1ID,Gun))`);
      await pool.request().query(`IF OBJECT_ID('LabAkisKalite','U') IS NULL CREATE TABLE LabAkisKalite (
        ID INT IDENTITY(1,1) PRIMARY KEY, Baslik NVARCHAR(220) NOT NULL, Aciklama NVARCHAR(MAX) NULL, Tarih DATE NOT NULL,
        Tamamlandi INT NOT NULL DEFAULT 0, CreatedBy NVARCHAR(80) NOT NULL, UpdatedBy NVARCHAR(80) NULL,
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE())`);
    }
  })().catch(error => { ready = null; throw error; });
  return ready;
}

/** Live source: an accepted sample and its analyses appear without a separate task. */
export async function listLabFlow(scope: LabScope, from: string, to: string): Promise<LabFlowData> {
  await ensureLabFlow();
  const pool = await cosmoPool;
  const until = new Date(`${validFlowDate(to)}T12:00:00Z`);
  until.setUTCDate(until.getUTCDate()+1);
  const result = await pool.request().input("from", validFlowDate(from)).input("to", to).input("until",until.toISOString().slice(0,10)).query(`
    SELECT x1.ID, x1.RaporID, x1.AnalizID, s.BolumID AS BirimID, b.Ad AS BirimAd, s.Ad, n.RaporNo, n.Grup, n.Numune_Adi,
      CONVERT(varchar(10),COALESCE(a.Baslangic,n.Tarih),23) AS Baslangic,
      CONVERT(varchar(10),x1.Termin,23) AS Termin, COALESCE(a.Tamamlandi,0) AS Tamamlandi
    FROM NumuneX1 x1 INNER JOIN NKR n ON n.ID=x1.RaporID INNER JOIN StokAnalizListesi s ON s.ID=x1.AnalizID
    LEFT JOIN LabAkisAnaliz a ON a.X1ID=x1.ID
    LEFT JOIN KysLaboratuvarBirim b ON b.ID=s.BolumID
    WHERE ${eligible} ${labScopeSql(scope)} AND (
      (COALESCE(a.Baslangic,n.Tarih)>=@from AND COALESCE(a.Baslangic,n.Tarih)<@until)
      OR (x1.Termin>=@from AND x1.Termin<@until)
      OR EXISTS (SELECT 1 FROM LabAkisAraGun g WHERE g.X1ID=x1.ID AND g.Tarih>=@from AND g.Tarih<=@to))
    ORDER BY n.Tarih,x1.ID`);
  const ids = result.recordset.map(row => Number(row.ID)).filter(id => Number.isSafeInteger(id) && id > 0);
  // Snapshot starts in one statement, without a write round trip for every calendar card.
  if (ids.length) await pool.request().query(`${hasMysqlConfig() ? "INSERT IGNORE" : "INSERT"} INTO LabAkisAnaliz (X1ID,Baslangic)
    SELECT x1.ID,n.Tarih FROM NumuneX1 x1 INNER JOIN NKR n ON n.ID=x1.RaporID
    WHERE x1.ID IN (${ids.join(",")}) AND n.Tarih IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM LabAkisAnaliz ${hasMysqlConfig() ? "" : "WITH (UPDLOCK,HOLDLOCK)"} WHERE X1ID=x1.ID)`);
  const milestones = ids.length ? (await pool.request().query(`SELECT ID,X1ID,Gun,Tarih,Tamamlandi FROM LabAkisAraGun WHERE X1ID IN (${ids.join(",")}) ORDER BY Gun`)).recordset as Row[] : [];
  const quality = (await pool.request().input("from",from).input("to",to).query("SELECT ID,Baslik,Aciklama,Tarih,Tamamlandi FROM LabAkisKalite WHERE Tarih>=@from AND Tarih<=@to ORDER BY Tarih,ID")).recordset as Row[];
  return {
    analizler: result.recordset.map((row: Row) => ({ id:Number(row.ID), nkrId:Number(row.RaporID), analizId:Number(row.AnalizID), birimId:row.BirimID == null ? null : Number(row.BirimID), birimAd:String(row.BirimAd || "Birim atanmamış"), ad:String(row.Ad || "Analiz"), raporNo:String(row.RaporNo || "—"), grup:String(row.Grup), numune:String(row.Numune_Adi || ""), baslangic:date(row.Baslangic), termin:date(row.Termin) || null, tamamlandi:Boolean(Number(row.Tamamlandi)), araGunler:milestones.filter(g => Number(g.X1ID)===Number(row.ID)).map(g => ({ id:Number(g.ID), gun:Number(g.Gun), tarih:date(g.Tarih), tamamlandi:Boolean(Number(g.Tamamlandi)) })) })),
    kalite: quality.map(row => ({ id:Number(row.ID), baslik:String(row.Baslik), aciklama:String(row.Aciklama || ""), tarih:date(row.Tarih), tamamlandi:Boolean(Number(row.Tamamlandi)) })),
  };
}

export async function saveQualityWork(input: Record<string, unknown>, userId: string) {
  await ensureLabFlow();
  const title = String(input.baslik || "").trim();
  if (!title || title.length > 220) throw new Error("1–220 karakter arasında bir iş başlığı girin.");
  const pool = await cosmoPool;
  await pool.request().input("title",title).input("description",String(input.aciklama || "").trim()).input("date",validFlowDate(input.tarih)).input("user",userId)
    .query("INSERT INTO LabAkisKalite (Baslik,Aciklama,Tarih,CreatedBy) VALUES (@title,@description,@date,@user)");
}

type Selection = { tur: "analiz" | "kalite" | "ara"; id: number };
export function flowSelection(value: unknown): Selection[] {
  if (!Array.isArray(value) || !value.length || value.length > 200) throw new Error("1–200 iş seçin.");
  const items = value as Array<Record<string, unknown>>;
  if (items.some(item => !item || !["analiz","kalite","ara"].includes(String(item.tur)) || !Number.isSafeInteger(item.id) || Number(item.id) < 1)) throw new Error("Geçersiz iş seçimi.");
  return items.map(item => ({ tur:item.tur as Selection["tur"], id:Number(item.id) }));
}

export async function changeLabFlow(input: Record<string, unknown>, scope: LabScope, userId: string) {
  await ensureLabFlow();
  const selected = flowSelection(input.secim);
  const action = String(input.islem);
  if (!["termin","ara-gun","tamamla","yeniden-ac"].includes(action)) throw new Error("Geçersiz işlem.");
  if (action === "termin" && (selected.length !== 1 || selected[0].tur !== "analiz")) throw new Error("Bir analiz bitişi seçin.");
  if (action === "ara-gun" && selected.some(item => item.tur !== "analiz")) throw new Error("Ara gün için yalnız analiz seçin.");
  const pool = await cosmoPool;
  const transaction = await pool.transaction();
  await transaction.begin();
  try {
    for (const item of selected) {
      if (item.tur === "kalite") {
        const found = (await transaction.request().input("id",item.id).query("SELECT ID FROM LabAkisKalite WHERE ID=@id")).recordset[0];
        if (!found) throw new Error("Kalite işi bulunamadı.");
        await transaction.request().input("id",item.id).input("done",action === "tamamla" ? 1 : 0).input("user",userId).query("UPDATE LabAkisKalite SET Tamamlandi=@done,UpdatedBy=@user,UpdatedAt=GETDATE() WHERE ID=@id");
        continue;
      }
      const row = (await transaction.request().input("id",item.id).query(`SELECT x1.ID, x1.Termin, COALESCE(a.Baslangic,n.Tarih) AS Baslangic, COALESCE(a.Tamamlandi,0) AS Tamamlandi
        FROM NumuneX1 x1 INNER JOIN NKR n ON n.ID=x1.RaporID INNER JOIN StokAnalizListesi s ON s.ID=x1.AnalizID
        LEFT JOIN LabAkisAnaliz a ON a.X1ID=x1.ID
        WHERE ${item.tur === "ara" ? "EXISTS (SELECT 1 FROM LabAkisAraGun g WHERE g.ID=@id AND g.X1ID=x1.ID)" : "x1.ID=@id"} AND ${eligible} ${labScopeSql(scope)}`)).recordset[0];
      if (!row) throw new Error("Analiz bulunamadı veya bu analize erişim yetkiniz yok.");
      const x1Id = Number(row.ID);
      const start = validFlowDate(date(row.Baslangic));
      await transaction.request().input("id",x1Id).input("start",start).query(hasMysqlConfig()
        ? "INSERT IGNORE INTO LabAkisAnaliz (X1ID,Baslangic) VALUES (@id,@start)"
        : "IF NOT EXISTS (SELECT 1 FROM LabAkisAnaliz WHERE X1ID=@id) INSERT INTO LabAkisAnaliz (X1ID,Baslangic) VALUES (@id,@start)");
      if (action === "termin") {
        if (Number(row.Tamamlandi)) throw new Error("Tamamlanmış analizin bitişi taşınamaz. Önce yeniden açın.");
        const end = validFlowDate(input.tarih);
        if (end < start) throw new Error("Bitiş, başlangıçtan önce olamaz.");
        const later = (await transaction.request().input("id",x1Id).input("end",end).query("SELECT ID FROM LabAkisAraGun WHERE X1ID=@id AND Tarih>@end")).recordset;
        if (later.length) throw new Error("Bitiş, eklenmiş ara günlerden önce olamaz.");
        await transaction.request().input("id",x1Id).input("end",end).query("UPDATE NumuneX1 SET Termin=@end WHERE ID=@id");
        await transaction.request().input("id",x1Id).input("user",userId).query("UPDATE LabAkisAnaliz SET UpdatedBy=@user,UpdatedAt=GETDATE() WHERE X1ID=@id");
      } else if (action === "ara-gun") {
        if (Number(row.Tamamlandi)) throw new Error("Tamamlanmış analize ara gün eklenemez.");
        for (const step of intermediateDates(start,date(row.Termin) || null,input.gunler)) {
          await transaction.request().input("id",x1Id).input("day",step.gun).input("date",step.tarih).query(hasMysqlConfig()
            ? "INSERT IGNORE INTO LabAkisAraGun (X1ID,Gun,Tarih) VALUES (@id,@day,@date)"
            : "IF NOT EXISTS (SELECT 1 FROM LabAkisAraGun WHERE X1ID=@id AND Gun=@day) INSERT INTO LabAkisAraGun (X1ID,Gun,Tarih) VALUES (@id,@day,@date)");
        }
      } else {
        const done = action === "tamamla" ? 1 : 0;
        await transaction.request().input("id",item.tur === "ara" ? item.id : x1Id).input("done",done).query(item.tur === "ara"
          ? "UPDATE LabAkisAraGun SET Tamamlandi=@done WHERE ID=@id"
          : "UPDATE LabAkisAnaliz SET Tamamlandi=@done WHERE X1ID=@id");
        if (item.tur === "analiz") await transaction.request().input("id",x1Id).input("done",done).query("UPDATE LabAkisAraGun SET Tamamlandi=@done WHERE X1ID=@id");
        else if (!done) await transaction.request().input("id",x1Id).query("UPDATE LabAkisAnaliz SET Tamamlandi=0 WHERE X1ID=@id");
        await transaction.request().input("id",x1Id).input("user",userId).query("UPDATE LabAkisAnaliz SET UpdatedBy=@user,UpdatedAt=GETDATE() WHERE X1ID=@id");
      }
    }
    await transaction.commit();
  } catch (error) { await transaction.rollback(); throw error; }
}
