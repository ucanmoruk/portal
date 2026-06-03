import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Hizmet Paketleri — MSSQL massgrup_cosmo (legacy NumuneX3 / NumuneX4)
//   • NumuneX3.Aciklama  = paket adı  (API'de ListeAdi olarak sunulur)
//   • NumuneX4.x3ID      = ListeID,  NumuneX4.AltAnalizID = HizmetID
//   • RootKullanici cosmo'da yok → oluşturan adı gösterilmez (auth Postgres'te)
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/lab/paketler?q=&sayfa=1&limit=20  (sadece Aktif) ────────────────
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
          ''                      AS Aciklama,
          FORMAT(x3.Tarih, 'dd.MM.yyyy') AS Tarih,
          x3.KID,
          ''                      AS KullaniciAdi,
          COUNT(x4.ID) AS HizmetSayisi
        FROM NumuneX3 x3
        LEFT JOIN NumuneX4 x4 ON x4.x3ID = x3.ID
          AND EXISTS (SELECT 1 FROM StokAnalizListesi s WHERE s.ID = x4.AltAnalizID)
        WHERE x3.Durum = 'Aktif' ${searchClause}
        GROUP BY x3.ID, x3.Aciklama, x3.Tarih, x3.KID
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
    const session = await getServerSession(authOptions);
    const userId  = (session?.user as any)?.userId ?? null;

    const body     = await request.json();
    const listeAdi = (body.listeAdi || "").trim();

    if (!listeAdi)
      return NextResponse.json({ error: "Liste adı zorunludur." }, { status: 400 });

    const pool   = await cosmoPool;
    const result = await pool.request()
      .input("aciklama", listeAdi)
      .input("kid",      userId ? parseInt(userId) : null)
      .query(`
        INSERT INTO NumuneX3 (Aciklama, Durum, Tarih, KID)
        OUTPUT INSERTED.ID
        VALUES (@aciklama, 'Aktif', GETDATE(), @kid)
      `);

    return NextResponse.json({ id: result.recordset[0].ID }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
