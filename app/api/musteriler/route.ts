import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// ----------------------------------------------------------------
// GET  /api/musteriler?search=&page=1&limit=20
// ----------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const birimId: number = (session.user as any)?.birimId ?? 0;
  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await poolPromise;

    const whereClauses: string[] = ["Durum = 'Aktif'"]; // Sadece Aktif olanlar
    const kimin = sp.get("kimin")?.trim() || "";

    if (kimin) {
      whereClauses.push(`Kimin = @kimin`);
    }

    if (search) {
      whereClauses.push(`(
        LOWER(ISNULL(Ad, '')) LIKE LOWER(@searchLike)
        OR LOWER(ISNULL(Adres, '')) LIKE LOWER(@searchLike)
        OR LOWER(ISNULL(VergiDairesi, '')) LIKE LOWER(@searchLike)
        OR LOWER(ISNULL(VergiNo, '')) LIKE LOWER(@searchLike)
        OR LOWER(ISNULL(Telefon, '')) LIKE LOWER(@searchLike)
        OR LOWER(ISNULL(Email, '')) LIKE LOWER(@searchLike)
        OR LOWER(ISNULL(Yetkili, '')) LIKE LOWER(@searchLike)
      )`);
    }

    const where = `WHERE ${whereClauses.join(" AND ")}`;

    const req = pool.request()
      .input("search", search)
      .input("searchLike", `%${search}%`)
      .input("kimin", kimin) // Eğer boşsa bile ekleyelim, @kimin parametresini her şekilde hazırlayalım
      .input("offset", offset)
      .input("limit", limit);

    const countResult = await req.query(`SELECT COUNT(*) AS total FROM RootTedarikci ${where}`);
    const total = countResult.recordset[0].total;

    const dataResult = await req.query(`
      SELECT ID, Ad, Adres, VergiDairesi, VergiNo, Telefon, Email, Web, Tur2, Yetkili, Kimin
      FROM RootTedarikci
      ${where}
      ORDER BY Ad
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return Response.json({
      data: dataResult.recordset,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// POST /api/musteriler  (yeni firma ekle)
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const birimId: number = (session.user as any)?.birimId ?? 0;

  try {
    const body = await request.json();
    const { Ad, Adres, VergiDairesi, VergiNo, Telefon, Email, Web, Tur2, Yetkili, Kimin: bodyKimin } = body;

    if (!Ad?.trim()) {
      return Response.json({ error: "Firma adı zorunludur." }, { status: 400 });
    }

    // Madde 1: Firma Listesi sayfasından gelirse 'Ozeco' zorla, yoksa BirimID kuralı
    let kimin = bodyKimin || (birimId === 2 ? "Ozeco" : "Root");

    const pool = await poolPromise;
    const result = await pool.request()
      .input("Ad", Ad.trim())
      .input("Adres", Adres || null)
      .input("VergiDairesi", VergiDairesi || null)
      .input("VergiNo", VergiNo || null)
      .input("Telefon", Telefon || null)
      .input("Email", Email || null)
      .input("Web", Web || null)
      .input("Tur2", Tur2 || null)
      .input("Yetkili", Yetkili || null)
      .input("Durum", "Aktif")
      .input("Durumu", "Aktif")
      .input("Kimin", kimin)
      .query(`
        INSERT INTO RootTedarikci
          (Ad, Adres, VergiDairesi, VergiNo, Telefon, Email, Web, Tur2, Yetkili, Durum, Durumu, Kimin)
        OUTPUT INSERTED.ID
        VALUES
          (@Ad, @Adres, @VergiDairesi, @VergiNo, @Telefon, @Email, @Web, @Tur2, @Yetkili, @Durum, @Durumu, @Kimin)
      `);

    return Response.json({ id: result.recordset[0].ID }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
