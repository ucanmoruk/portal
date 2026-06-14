import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool, rootPool } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Hizmet Paketleri — MSSQL massgrup_cosmo (legacy NumuneX3 / NumuneX4)
//   • NumuneX3.Aciklama  = paket adı  (API'de ListeAdi olarak sunulur)
//   • NumuneX3.Notlar    = paket açıklaması (migration 020 ile eklendi)
//   • NumuneX4.x3ID      = ListeID,  NumuneX4.AltAnalizID = HizmetID
//   • NumuneX3.KID       = oluşturan kullanıcı ID (RootKullanici massgrup_root'ta)
// ─────────────────────────────────────────────────────────────────────────────

// RootKullanici kolon adları dinamik. Process ömrü boyunca cache.
let _rkCols: { idCol: string; nameExpr: string } | null = null;
async function detectRkCols(pool: any) {
  if (_rkCols) return _rkCols;
  const r = await pool.request().query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RootKullanici'`
  );
  const cols = new Set(r.recordset.map((row: any) => row.COLUMN_NAME as string));
  const idCol = ["ID", "Id", "id", "KullaniciId"].find(c => cols.has(c)) || "ID";
  const nameCol     = ["AdSoyad", "FullName", "Name", "Adi"].find(c => cols.has(c));
  const firstName   = ["Ad", "FirstName", "Firstname"].find(c => cols.has(c));
  const lastName    = ["Soyad", "LastName", "Lastname"].find(c => cols.has(c));
  const usernameCol = ["KullaniciAdi", "Kadi", "UserName", "Username", "Login", "kadi"].find(c => cols.has(c));
  let nameExpr: string;
  if (nameCol) nameExpr = `ISNULL(${nameCol}, '')`;
  else if (firstName && lastName) nameExpr = `LTRIM(RTRIM(ISNULL(${firstName}, '') + ' ' + ISNULL(${lastName}, '')))`;
  else if (firstName) nameExpr = `ISNULL(${firstName}, '')`;
  else if (usernameCol) nameExpr = `ISNULL(${usernameCol}, '')`;
  else nameExpr = "''";
  _rkCols = { idCol, nameExpr };
  return _rkCols;
}

async function lookupKullaniciAdlari(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!ids.length) return map;
  try {
    const pool = await rootPool;
    const { idCol, nameExpr } = await detectRkCols(pool);
    const req = pool.request();
    const placeholders: string[] = [];
    ids.forEach((id, i) => { const n = `id${i}`; req.input(n, id); placeholders.push(`@${n}`); });
    const r = await req.query(
      `SELECT ${idCol} AS ID, ${nameExpr} AS Ad FROM RootKullanici WHERE ${idCol} IN (${placeholders.join(",")})`
    );
    for (const row of r.recordset) {
      const ad = String(row.Ad ?? "").trim();
      if (ad) map.set(Number(row.ID), ad);
    }
  } catch {}
  return map;
}

// ── GET /api/lab/paketler?q=&sayfa=1&limit=20 (sadece Aktif) ─────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q      = (searchParams.get("q") || "").trim();
    const page   = Math.max(1, parseInt(searchParams.get("sayfa") || "1"));
    const limit  = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const searchClause = q ? `AND ISNULL(x3.Aciklama, '') COLLATE Turkish_CI_AS LIKE @q` : "";
    const pool = await cosmoPool;

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
          x3.ID,
          ISNULL(x3.Aciklama, '') AS ListeAdi,
          ISNULL(x3.Notlar, '')   AS Aciklama,
          FORMAT(x3.Tarih, 'dd.MM.yyyy') AS Tarih,
          x3.KID,
          COUNT(x4.ID) AS HizmetSayisi
        FROM NumuneX3 x3
        LEFT JOIN NumuneX4 x4 ON x4.x3ID = x3.ID
          AND EXISTS (SELECT 1 FROM StokAnalizListesi s WHERE s.ID = x4.AltAnalizID)
        WHERE x3.Durum = 'Aktif' ${searchClause}
        GROUP BY x3.ID, x3.Aciklama, x3.Notlar, x3.Tarih, x3.KID
        ORDER BY x3.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    // KID'leri topla → RootKullanici'den ad lookup (cross-database)
    const kids: number[] = dataRes.recordset
      .map((r: any) => Number(r.KID))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    const adMap = await lookupKullaniciAdlari([...new Set(kids)]);

    const data = dataRes.recordset.map((r: any) => ({
      ...r,
      KullaniciAdi: adMap.get(Number(r.KID)) || "",
    }));

    return NextResponse.json({
      data,
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
    const session = await getServerSession(authOptions);
    const userId  = (session?.user as any)?.userId ?? null;

    const body     = await request.json();
    const listeAdi = (body.listeAdi || "").trim();
    const notlar   = (body.aciklama || "").trim() || null;

    if (!listeAdi)
      return NextResponse.json({ error: "Liste adı zorunludur." }, { status: 400 });

    const pool   = await cosmoPool;
    const result = await pool.request()
      .input("aciklama", listeAdi)
      .input("notlar",   notlar)
      .input("kid",      userId ? parseInt(userId) : null)
      .query(`
        INSERT INTO NumuneX3 (Aciklama, Notlar, Durum, Tarih, KID)
        OUTPUT INSERTED.ID
        VALUES (@aciklama, @notlar, 'Aktif', GETDATE(), @kid)
      `);

    return NextResponse.json({ id: result.recordset[0].ID }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
