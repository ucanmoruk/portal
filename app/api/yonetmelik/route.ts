import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const ek = sp.get("ek")?.trim() || ""; 
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "10", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await poolPromise;
    let whereClauses: string[] = [];

    if (ek) {
      const roman = ek.split(" ")[1]; 
      if (roman) whereClauses.push(`Num LIKE N'${roman}/%'`);
    }

    if (search) {
      whereClauses.push(`(
        INCI LIKE N'%' + @search + '%'
        OR Num LIKE N'%' + @search + '%'
        OR UrunTipi LIKE N'%' + @search + '%'
      )`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const req = pool.request().input("search", search).input("offset", offset).input("limit", limit);

    const countResult = await req.query(`SELECT COUNT(*) as total FROM rUGDYonetmelik ${where}`);
    const total = countResult.recordset[0].total;

    const dataResult = await req.query(`
        SELECT Num as 'YonetmelikNo', INCI as 'Bilesen', UrunTipi as 'UrunTipi',
               Maks as 'MaksimumKonsantrasyon', Diger, Etiket as 'EtiketBeyani', ID
        FROM rUGDYonetmelik
        ${where}
        ORDER BY Num, INCI
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
// POST /api/yonetmelik (Yeni Yönetmelik Ekle)
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const body = await request.json();
    const { YonetmelikNo, Bilesen, UrunTipi, MaksimumKonsantrasyon, Diger, EtiketBeyani } = body;

    const pool = await poolPromise;
    await pool.request()
      .input("Num", YonetmelikNo)
      .input("INCI", Bilesen)
      .input("UrunTipi", UrunTipi || null)
      .input("Maks", MaksimumKonsantrasyon || null)
      .input("Diger", Diger || null)
      .input("Etiket", EtiketBeyani || null)
      .query(`
        INSERT INTO rUGDYonetmelik (Num, INCI, UrunTipi, Maks, Diger, Etiket)
        VALUES (@Num, @INCI, @UrunTipi, @Maks, @Diger, @Etiket)
      `);

    // Madde 3: Bilgilendirme Maili (Log/Mock)
    console.log(`[MAIL] To: oguzhan@rootkozmetik.com | Subject: Yeni Yönetmelik Eklendi | Body: ${Bilesen} (${YonetmelikNo}) eklendi.`);

    return Response.json({ message: "Başarıyla eklendi" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// PUT /api/yonetmelik/[id] (Yönetmelik Güncelle) - Next.js rotası gereği burada ID parametresi bekleriz
// Not: Ayrı bir dosya [id]/route.ts açmak daha temizdir ama tek dosyada halledebiliriz 
// ama standarda uyup PUT'u burada bırakıp ID'yi body'den de alabiliriz.
// ----------------------------------------------------------------
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const body = await request.json();
    const { ID, YonetmelikNo, Bilesen, UrunTipi, MaksimumKonsantrasyon, Diger, EtiketBeyani } = body;

    if (!ID) return Response.json({ error: "ID gerekli" }, { status: 400 });

    const pool = await poolPromise;
    await pool.request()
      .input("ID", ID)
      .input("Num", YonetmelikNo)
      .input("INCI", Bilesen)
      .input("UrunTipi", UrunTipi || null)
      .input("Maks", MaksimumKonsantrasyon || null)
      .input("Diger", Diger || null)
      .input("Etiket", EtiketBeyani || null)
      .query(`
        UPDATE rUGDYonetmelik
        SET Num = @Num, INCI = @INCI, UrunTipi = @UrunTipi, Maks = @Maks, Diger = @Diger, Etiket = @Etiket
        WHERE ID = @ID
      `);

    // Madde 3: Bilgilendirme Maili (Log/Mock)
    console.log(`[MAIL] To: oguzhan@rootkozmetik.com | Subject: Yönetmelik Güncellendi | Body: ID ${ID} - ${Bilesen} güncellendi.`);

    return Response.json({ message: "Başarıyla güncellendi" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
