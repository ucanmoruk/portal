export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

async function ensureLogTable() {
  const pool = await cosmoPool;
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TeklifOnayLog]') AND type in (N'U'))
    BEGIN
      CREATE TABLE [dbo].[TeklifOnayLog] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [TeklifID] INT NOT NULL,
        [TeklifNo] NVARCHAR(50) NULL,
        [Aksiyon] NVARCHAR(20) NOT NULL,
        [Aciklama] NVARCHAR(MAX) NULL,
        [IpAdresi] NVARCHAR(100) NULL,
        [UserAgent] NVARCHAR(500) NULL,
        [MusteriAd] NVARCHAR(255) NULL,
        [MusteriEmail] NVARCHAR(255) NULL,
        [MusteriYetkili] NVARCHAR(255) NULL,
        [KullaniciID] INT NULL,
        [KullaniciAd] NVARCHAR(255) NULL,
        [Tarih] DATETIME NOT NULL DEFAULT GETDATE()
      )
    END
  `);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || Number.isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  await ensureLogTable();
  const pool = await cosmoPool;

  // 1) Bu teklifin TeklifNo'sunu bul — aynı TeklifNo'ya sahip TÜM kayıtların
  //    (tüm revizyonlar) ID'lerini topla. Geçmiş bu birleşik küme üzerinden döner,
  //    böylece yeni revizyon açıldığında eski revizyonların log'ları da görünür.
  const idRow = await pool.request()
    .input("ID", Number(id))
    .query(`SELECT TeklifNo FROM TeklifBaslik WHERE ID = @ID`);

  const teklifNo = idRow.recordset[0]?.TeklifNo as number | null | undefined;

  // Family IDs (tüm revizyonlar) — TeklifNo varsa ona göre, yoksa sadece bu ID
  let familyIds: number[] = [Number(id)];
  if (teklifNo) {
    const famRes = await pool.request()
      .input("TeklifNo", teklifNo)
      .query(`SELECT ID FROM TeklifBaslik WHERE TeklifNo = @TeklifNo ORDER BY ID`);
    familyIds = famRes.recordset.map((r: { ID: number }) => Number(r.ID)).filter(Boolean);
    if (familyIds.length === 0) familyIds = [Number(id)];
  }

  // IN list — parametrize edilmediği için inline güvenli sayı listesi
  const idList = familyIds.map(n => Number(n)).filter(Number.isFinite).join(",") || String(Number(id));

  // 2) Log query — explicit AS alias HER kolon için (recordset mapper aliases'ı
  //    JS tarafına aynı case ile yansıtsın). Saat dilimi PG için 'Europe/Istanbul'
  //    olarak çevriliyor (NOW() UTC saklıyor, kullanıcı TR saatini görmeli).
  const res = await pool.request().query(`
    SELECT TOP 200
      ID                            AS ID,
      TeklifID                      AS TeklifID,
      TeklifNo                      AS TeklifNo,
      ISNULL(Aksiyon, '')           AS Aksiyon,
      ISNULL(Aciklama, '')          AS Aciklama,
      ISNULL(IpAdresi, '')          AS IpAdresi,
      ISNULL(UserAgent, '')         AS UserAgent,
      ISNULL(MusteriAd, '')         AS MusteriAd,
      ISNULL(MusteriEmail, '')      AS MusteriEmail,
      ISNULL(MusteriYetkili, '')    AS MusteriYetkili,
      ISNULL(KullaniciID, 0)        AS KullaniciID,
      ISNULL(KullaniciAd, '')       AS KullaniciAd,
      FORMAT(Tarih, 'dd.MM.yyyy HH:mm:ss') AS Tarih
    FROM TeklifOnayLog
    WHERE TeklifID IN (${idList})
    ORDER BY ID DESC
  `);

  return Response.json({ logs: res.recordset });
}
