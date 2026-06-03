import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Müşteriler menüsü — cari/müşteri listesi (MSSQL massgrup_cosmo · Firma tablosu)
//
// NOT: /api/musteriler (Postgres · RootTedarikci) ÜGD "Firma Listesi" + henüz
// taşınmamış Laboratuvar sayfaları için AYNEN kalır. Bu uç yalnızca Müşteriler
// menüsünün cosmo'ya taşınmış cari listesine hizmet eder.
//
// Alan eşlemesi (RootTedarikci → Firma):
//   Ad→Firma_Adi, Email→Mail, VergiDairesi→Vergi_Dairesi, VergiNo→Vergi_No,
//   Tur2→Tur. (Web/Kimin karşılığı yok → boş döner.)
// ─────────────────────────────────────────────────────────────────────────────

// ----------------------------------------------------------------
// GET /api/firmalar?search=&page=1&limit=20
// ----------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  const searchClause = search
    ? `AND (
          LOWER(ISNULL(Firma_Adi,'')) LIKE LOWER(@searchLike)
       OR LOWER(ISNULL(Adres,'')) LIKE LOWER(@searchLike)
       OR LOWER(ISNULL(Vergi_Dairesi,'')) LIKE LOWER(@searchLike)
       OR LOWER(ISNULL(Vergi_No,'')) LIKE LOWER(@searchLike)
       OR LOWER(ISNULL(Telefon,'')) LIKE LOWER(@searchLike)
       OR LOWER(ISNULL(Mail,'')) LIKE LOWER(@searchLike)
       OR LOWER(ISNULL(Yetkili,'')) LIKE LOWER(@searchLike)
       )`
    : "";

  try {
    const pool = await cosmoPool;

    const countRes = await pool.request()
      .input("searchLike", `%${search}%`)
      .query(`SELECT COUNT(*) AS total FROM Firma WHERE Durum = 'Aktif' ${searchClause}`);
    const total = countRes.recordset[0].total;

    const dataRes = await pool.request()
      .input("searchLike", `%${search}%`)
      .input("offset", offset)
      .input("limit", limit)
      .query(`
        SELECT
          ID,
          ISNULL(Firma_Adi,'')     AS Ad,
          ISNULL(Adres,'')         AS Adres,
          ISNULL(Vergi_Dairesi,'') AS VergiDairesi,
          ISNULL(Vergi_No,'')      AS VergiNo,
          ISNULL(Telefon,'')       AS Telefon,
          ISNULL(Mail,'')          AS Email,
          ''                       AS Web,
          ISNULL(Tur,'')           AS Tur2,
          ISNULL(Yetkili,'')       AS Yetkili,
          ''                       AS Kimin
        FROM Firma
        WHERE Durum = 'Aktif' ${searchClause}
        ORDER BY Firma_Adi
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return Response.json({
      data: dataRes.recordset,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// POST /api/firmalar  (yeni firma ekle)
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const body = await request.json();
    const { Ad, Adres, VergiDairesi, VergiNo, Telefon, Email, Tur2, Yetkili } = body;

    if (!Ad?.trim()) {
      return Response.json({ error: "Firma adı zorunludur." }, { status: 400 });
    }

    const pool = await cosmoPool;
    const result = await pool.request()
      .input("Ad", Ad.trim())
      .input("Adres", Adres || null)
      .input("VergiDairesi", VergiDairesi || null)
      .input("VergiNo", VergiNo || null)
      .input("Telefon", Telefon || null)
      .input("Email", Email || null)
      .input("Tur2", Tur2 || "Müşteri")
      .input("Yetkili", Yetkili || null)
      .query(`
        INSERT INTO Firma
          (Firma_Adi, Adres, Vergi_Dairesi, Vergi_No, Telefon, Mail, Yetkili, Tur, Durum)
        OUTPUT INSERTED.ID
        VALUES
          (@Ad, @Adres, @VergiDairesi, @VergiNo, @Telefon, @Email, @Yetkili, @Tur2, 'Aktif')
      `);

    return Response.json({ id: result.recordset[0].ID }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
