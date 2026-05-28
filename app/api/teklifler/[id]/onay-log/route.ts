export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

const isPostgres = Boolean(process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL);

async function ensureLogTable() {
  const pool = await poolPromise;
  if (isPostgres) {
    // Postgres: native syntax. lib/db.ts translator MSSQL "IF NOT EXISTS ... CREATE TABLE"
    // pattern'ini noop olarak skip ediyor; bu yüzden PG için ayrı yazıyoruz.
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS TeklifOnayLog (
        ID SERIAL PRIMARY KEY,
        TeklifID INTEGER NOT NULL,
        TeklifNo VARCHAR(50) NULL,
        Aksiyon VARCHAR(20) NOT NULL,
        Aciklama TEXT NULL,
        IpAdresi VARCHAR(100) NULL,
        UserAgent VARCHAR(500) NULL,
        MusteriAd VARCHAR(255) NULL,
        MusteriEmail VARCHAR(255) NULL,
        MusteriYetkili VARCHAR(255) NULL,
        kullaniciid INTEGER NULL,
        kullaniciad VARCHAR(255) NULL,
        Tarih TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    return;
  }
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
  const pool = await poolPromise;
  const res = await pool.request()
    .input("TeklifID", Number(id))
    .query(`
      SELECT TOP 200
        ID, TeklifID, TeklifNo, Aksiyon, Aciklama, IpAdresi, UserAgent,
        ISNULL(MusteriAd, '')      AS MusteriAd,
        ISNULL(MusteriEmail, '')   AS MusteriEmail,
        ISNULL(MusteriYetkili, '') AS MusteriYetkili,
        ISNULL(kullaniciid, 0)     AS KullaniciID,
        ISNULL(kullaniciad, '')    AS KullaniciAd,
        FORMAT(Tarih, 'dd.MM.yyyy HH:mm:ss') AS Tarih
      FROM TeklifOnayLog
      WHERE TeklifID = @TeklifID
      ORDER BY ID DESC
    `);

  return Response.json({ logs: res.recordset });
}
