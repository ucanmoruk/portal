import { randomBytes } from "node:crypto";
import { randomDisKodRapor } from "@/lib/disKod";
import { imzalaVeKaydet } from "@/lib/raporImzaData";
import { lockRaporEdit } from "@/lib/raporDuzenleme";
import { baseReportFormat, englishReportFormat } from "@/lib/raporFormatLanguage";

function generateToken(): string {
  return randomBytes(18).toString("base64url");
}

async function newUniqueToken(pool: any): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const token = generateToken();
    const exists = await pool.request()
      .input("token", token)
      .query(`SELECT TOP 1 ID FROM NKR_RaporOnay WHERE KarekodToken = @token`);
    if (!exists.recordset.length) return token;
  }
  return generateToken() + String(Date.now()).slice(-4);
}

async function hasDisRaporKoduColumn(pool: any): Promise<boolean> {
  const res = await pool.request().query(`
    SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'NKR_RaporOnay' AND COLUMN_NAME = 'DisRaporKodu'
  `);
  return res.recordset.length > 0;
}

async function newUniqueDisRaporKodu(pool: any, format: string): Promise<string | null> {
  if (!(await hasDisRaporKoduColumn(pool))) return null;
  const year = new Date().getFullYear();
  for (let i = 0; i < 25; i++) {
    const kod = randomDisKodRapor(year, format);
    const exists = await pool.request()
      .input("kod", kod)
      .query(`SELECT TOP 1 ID FROM NKR_RaporOnay WHERE DisRaporKodu = @kod`);
    if (!exists.recordset.length) return kod;
  }
  return randomDisKodRapor(year, format) + String(Date.now()).slice(-2);
}

export async function getApprovalForFormatOrBase(pool: any, nkrId: number, format: string) {
  const baseFormat = baseReportFormat(format);
  const request = pool.request()
    .input("nkrId", nkrId)
    .input("format", format)
    .input("baseFormat", baseFormat);
  const res = await request.query(`
    SELECT TOP 1 *
    FROM NKR_RaporOnay
    WHERE NkrID = @nkrId
      AND (
        UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
        OR UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@baseFormat, N'Ü', N'U'))
      )
    ORDER BY
      CASE
        WHEN UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U')) THEN 0
        ELSE 1
      END,
      ID DESC
  `);
  return res.recordset[0] ?? null;
}

export async function ensureEnglishApprovalForBase(
  pool: any,
  nkrId: number,
  baseFormatInput: string,
  opts: {
    userId: number | null;
    userName: string | null;
    raporYayinTarihi?: string | null;
  },
): Promise<{ format: string; id: number } | null> {
  const baseFormat = baseReportFormat(baseFormatInput);
  const englishFormat = englishReportFormat(baseFormat);
  if (!englishFormat || baseFormat === baseFormatInput && englishFormat === baseFormatInput) return null;

  const baseRes = await pool.request()
    .input("nkrId", nkrId)
    .input("baseFormat", baseFormat)
    .query(`
      SELECT TOP 1 ID, Durum, OnayTarihi, YayinTarihi
      FROM NKR_RaporOnay
      WHERE NkrID = @nkrId
        AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@baseFormat, N'Ü', N'U'))
      ORDER BY ID DESC
    `);
  const base = baseRes.recordset[0];
  if (!base || (base.Durum !== "Onaylandı" && base.Durum !== "Yayınlandı" && base.Durum !== "Arşiv")) {
    return null;
  }

  const existingRes = await pool.request()
    .input("nkrId", nkrId)
    .input("englishFormat", englishFormat)
    .query(`
      SELECT TOP 1 ID, Durum
      FROM NKR_RaporOnay
      WHERE NkrID = @nkrId
        AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@englishFormat, N'Ü', N'U'))
      ORDER BY ID DESC
    `);
  const existing = existingRes.recordset[0];
  const dateExpr = opts.raporYayinTarihi ? "CAST(@raporYayinTarihi AS DATE)" : "COALESCE(OnayTarihi, GETDATE())";

  if (existing) {
    if (existing.Durum !== "Yayınlandı" && existing.Durum !== "Arşiv") {
      await pool.request()
        .input("id", existing.ID)
        .input("userId", opts.userId)
        .input("userName", opts.userName)
        .input("raporYayinTarihi", opts.raporYayinTarihi ?? null)
        .query(`
          UPDATE NKR_RaporOnay
          SET Durum = N'Onaylandı',
              OnaylayanID = COALESCE(OnaylayanID, @userId),
              OnaylayanAd = COALESCE(OnaylayanAd, @userName),
              OnayTarihi = ${dateExpr},
              YayinTarihi = ${opts.raporYayinTarihi ? "CAST(@raporYayinTarihi AS DATE)" : "YayinTarihi"}
          WHERE ID = @id
        `);
    }
    await imzalaVeKaydet(pool, existing.ID, nkrId, englishFormat);
    await lockRaporEdit(pool, nkrId, englishFormat);
    return { format: englishFormat, id: existing.ID };
  }

  const token = await newUniqueToken(pool);
  const disKod = await newUniqueDisRaporKodu(pool, englishFormat);
  const insertWithDisKod = disKod !== null;
  const insertRes = await pool.request()
    .input("nkrId", nkrId)
    .input("format", englishFormat)
    .input("token", token)
    .input("userId", opts.userId)
    .input("userName", opts.userName)
    .input("raporYayinTarihi", opts.raporYayinTarihi ?? null)
    .input("disKod", disKod)
    .query(insertWithDisKod
      ? `
        INSERT INTO NKR_RaporOnay (NkrID, RaporFormati, KarekodToken, Durum, OnaylayanID, OnaylayanAd, OnayTarihi, YayinTarihi, DisRaporKodu)
        OUTPUT INSERTED.ID
        VALUES (@nkrId, @format, @token, N'Onaylandı', @userId, @userName, ${opts.raporYayinTarihi ? "CAST(@raporYayinTarihi AS DATE)" : "GETDATE()"}, ${opts.raporYayinTarihi ? "CAST(@raporYayinTarihi AS DATE)" : "NULL"}, @disKod)
      `
      : `
        INSERT INTO NKR_RaporOnay (NkrID, RaporFormati, KarekodToken, Durum, OnaylayanID, OnaylayanAd, OnayTarihi, YayinTarihi)
        OUTPUT INSERTED.ID
        VALUES (@nkrId, @format, @token, N'Onaylandı', @userId, @userName, ${opts.raporYayinTarihi ? "CAST(@raporYayinTarihi AS DATE)" : "GETDATE()"}, ${opts.raporYayinTarihi ? "CAST(@raporYayinTarihi AS DATE)" : "NULL"})
      `);
  const id = insertRes.recordset[0]?.ID;
  await imzalaVeKaydet(pool, id, nkrId, englishFormat);
  await lockRaporEdit(pool, nkrId, englishFormat);
  return { format: englishFormat, id };
}
