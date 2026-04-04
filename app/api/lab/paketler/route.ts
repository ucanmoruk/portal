import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// ── Tabloları hazırla ────────────────────────────────────────────────────────
async function ensureTables() {
  const pool = await poolPromise;

  // NumuneX3 yoksa oluştur
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='NumuneX3' AND xtype='U')
    CREATE TABLE NumuneX3 (
      ID       INT IDENTITY(1,1) PRIMARY KEY,
      ListeAdi NVARCHAR(200) NOT NULL,
      Aciklama NVARCHAR(500) NULL,
      Durum    NVARCHAR(20)  NOT NULL DEFAULT 'Aktif',
      Tarih    DATETIME      NULL DEFAULT GETDATE(),
      KID      INT           NULL
    )
  `);

  // Varsa eksik kolonları ekle
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NumuneX3'
  `);
  const existing = new Set(cols.recordset.map((r: any) => r.COLUMN_NAME as string));

  if (!existing.has("ListeAdi"))
    await pool.request().query(`ALTER TABLE NumuneX3 ADD ListeAdi NVARCHAR(200) NOT NULL DEFAULT ''`);
  if (!existing.has("Aciklama"))
    await pool.request().query(`ALTER TABLE NumuneX3 ADD Aciklama NVARCHAR(500) NULL`);
  if (!existing.has("Durum"))
    await pool.request().query(`ALTER TABLE NumuneX3 ADD Durum NVARCHAR(20) NOT NULL DEFAULT 'Aktif'`);
  if (!existing.has("Tarih"))
    await pool.request().query(`ALTER TABLE NumuneX3 ADD Tarih DATETIME NULL DEFAULT GETDATE()`);
  if (!existing.has("KID"))
    await pool.request().query(`ALTER TABLE NumuneX3 ADD KID INT NULL`);

  // NumuneX4 yoksa oluştur
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='NumuneX4' AND xtype='U')
    CREATE TABLE NumuneX4 (
      ID          INT IDENTITY(1,1) PRIMARY KEY,
      ListeID     INT           NOT NULL,
      AltAnalizID INT           NOT NULL,
      LimitDeger  NVARCHAR(100) NULL,
      LimitBirimi NVARCHAR(50)  NULL,
      Notlar      NVARCHAR(500) NULL
    )
  `);

  const cols4 = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='NumuneX4'
  `);
  const existing4 = new Set(cols4.recordset.map((r: any) => r.COLUMN_NAME as string));

  if (!existing4.has("ListeID"))
    await pool.request().query(`ALTER TABLE NumuneX4 ADD ListeID INT NOT NULL DEFAULT 0`);
  if (!existing4.has("LimitDeger"))
    await pool.request().query(`ALTER TABLE NumuneX4 ADD LimitDeger NVARCHAR(100) NULL`);
  if (!existing4.has("LimitBirimi"))
    await pool.request().query(`ALTER TABLE NumuneX4 ADD LimitBirimi NVARCHAR(50) NULL`);
  if (!existing4.has("Notlar"))
    await pool.request().query(`ALTER TABLE NumuneX4 ADD Notlar NVARCHAR(500) NULL`);

  // HizmetID → AltAnalizID migrasyonu
  if (existing4.has("HizmetID") && !existing4.has("AltAnalizID")) {
    await pool.request().query(`EXEC sp_rename 'NumuneX4.HizmetID', 'AltAnalizID', 'COLUMN'`);
  } else if (!existing4.has("AltAnalizID")) {
    await pool.request().query(`ALTER TABLE NumuneX4 ADD AltAnalizID INT NOT NULL DEFAULT 0`);
  }
}

// ── Kullanıcı adı kolonunu bul ────────────────────────────────────────────────
async function findUserNameCol(): Promise<string> {
  const pool = await poolPromise;
  const res  = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='RootKullanici'
  `);
  const cols = res.recordset.map((r: any) => r.COLUMN_NAME as string);
  return (
    cols.find(c => ["KullaniciAdi", "Kadi", "Username", "username", "UserName", "Ad", "AdSoyad"].includes(c))
    ?? "ID"
  );
}

// ── GET /api/lab/paketler?q=&sayfa=1&limit=20  (sadece Aktif) ────────────────
export async function GET(request: Request) {
  try {
    await ensureTables();
    const { searchParams } = new URL(request.url);
    const q      = (searchParams.get("q") || "").trim();
    const page   = Math.max(1, parseInt(searchParams.get("sayfa") || "1"));
    const limit  = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const nameCol    = await findUserNameCol();
    const searchClause = q ? `AND x3.ListeAdi LIKE @q` : "";
    const pool = await poolPromise;

    const countRes = await pool.request()
      .input("q", `%${q}%`)
      .query(`
        SELECT COUNT(*) AS toplam FROM NumuneX3 x3
        WHERE x3.Durum = 'Aktif' ${searchClause}
      `);

    const dataRes = await pool.request()
      .input("q",      `%${q}%`)
      .input("offset", offset)
      .input("limit",  limit)
      .query(`
        SELECT
          x3.ID, x3.ListeAdi, x3.Aciklama,
          FORMAT(x3.Tarih, 'dd.MM.yyyy') AS Tarih,
          x3.KID,
          rk.${nameCol} AS KullaniciAdi,
          COUNT(x4.ID) AS HizmetSayisi
        FROM NumuneX3 x3
        LEFT JOIN NumuneX4 x4 ON x4.ListeID = x3.ID
        LEFT JOIN RootKullanici rk ON rk.ID = x3.KID
        WHERE x3.Durum = 'Aktif' ${searchClause}
        GROUP BY x3.ID, x3.ListeAdi, x3.Aciklama, x3.Tarih, x3.KID, rk.${nameCol}
        ORDER BY x3.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return NextResponse.json({
      data:   dataRes.recordset,
      toplam: countRes.recordset[0].toplam,
      sayfa:  page,
      limit,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── POST /api/lab/paketler ────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    await ensureTables();
    const session   = await getServerSession(authOptions);
    const userId    = (session?.user as any)?.userId ?? null;

    const body     = await request.json();
    const listeAdi = (body.listeAdi || "").trim();
    const aciklama = (body.aciklama || "").trim();

    if (!listeAdi)
      return NextResponse.json({ error: "Liste adı zorunludur." }, { status: 400 });

    const pool   = await poolPromise;
    const result = await pool.request()
      .input("listeAdi", listeAdi)
      .input("aciklama", aciklama || null)
      .input("kid",      userId ? parseInt(userId) : null)
      .query(`
        INSERT INTO NumuneX3 (ListeAdi, Aciklama, Durum, Tarih, KID)
        OUTPUT INSERTED.ID
        VALUES (@listeAdi, @aciklama, 'Aktif', GETDATE(), @kid)
      `);

    return NextResponse.json({ id: result.recordset[0].ID }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
