import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const id = sp.get("id"); // Detaylar için ID

  if (id) {
    try {
      const pool = await poolPromise;
      const hammadde = await pool.request()
        .input("id", id)
        .query(`SELECT Mix, GenelAd, Noael2, Fizikokimya, Toksikoloji, Kaynak, EkBilgi FROM rHammadde WHERE cID = @id`);
      
      const cosing = await pool.request()
        .input("id", id)
        .query(`SELECT INCIName, Tur, Cas, EC, Functions, Regulation, SCCS, SCCSLink FROM rCosing WHERE ID = @id`);

      return Response.json({
        hammadde: hammadde.recordset[0] || null,
        cosing: cosing.recordset[0] || null
      });
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  // Normal Liste
  const search = sp.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await poolPromise;
    let whereClauses: string[] = ["Tur LIKE '%Ingredient%'"];

    if (search) {
      // Madde 2: I character case sensitivity 
      // SQL Server default collation allows case insensitivity but I/i logic can be tricky.
      // COLLATE Turkish_CI_AS is used for exact Tr logic if available.
      whereClauses.push(`(
        INCIName COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
        OR Cas LIKE N'%' + @search + '%'
        OR EC LIKE N'%' + @search + '%'
        OR Functions COLLATE Turkish_CI_AS LIKE N'%' + @search + '%'
      )`);
    }

    const where = `WHERE ${whereClauses.join(" AND ")}`;

    const req = pool.request().input("search", search).input("offset", offset).input("limit", limit);

    const countResult = await req.query(`SELECT COUNT(*) as total FROM rCosing ${where}`);
    const total = countResult.recordset[0].total;

    const dataResult = await req.query(`
      SELECT Link, SUBSTRING(Link,60,69) as 'CosIngID', INCIName, Cas, EC, Regulation, ID 
      FROM rCosing 
      ${where}
      ORDER BY ID
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
// POST /api/cosing (Detay Güncelleme - Madde 5)
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, hammadde } = body;
    if (!id) return Response.json({ error: "ID gerekli" }, { status: 400 });

    const pool = await poolPromise;
    
    // rHammadde kaydı varsa güncelle, yoksa ekle (cID üzerinden)
    const check = await pool.request().input("id", id).query(`SELECT ID FROM rHammadde WHERE cID = @id`);
    
    if (check.recordset.length > 0) {
      // Update
      await pool.request()
        .input("id", id)
        .input("Mix", hammadde.Mix)
        .input("GenelAd", hammadde.GenelAd)
        .input("Noael2", hammadde.Noael2)
        .input("Fizikokimya", hammadde.Fizikokimya)
        .input("Toksikoloji", hammadde.Toksikoloji)
        .input("Kaynak", hammadde.Kaynak)
        .input("EkBilgi", hammadde.EkBilgi)
        .query(`
          UPDATE rHammadde 
          SET Mix = @Mix, GenelAd = @GenelAd, Noael2 = @Noael2, Fizikokimya = @Fizikokimya, 
              Toksikoloji = @Toksikoloji, Kaynak = @Kaynak, EkBilgi = @EkBilgi
          WHERE cID = @id
        `);
    } else {
      // Insert
      await pool.request()
        .input("id", id)
        .input("Mix", hammadde.Mix)
        .input("GenelAd", hammadde.GenelAd)
        .input("Noael2", hammadde.Noael2)
        .input("Fizikokimya", hammadde.Fizikokimya)
        .input("Toksikoloji", hammadde.Toksikoloji)
        .input("Kaynak", hammadde.Kaynak)
        .input("EkBilgi", hammadde.EkBilgi)
        .query(`
          INSERT INTO rHammadde (cID, Mix, GenelAd, Noael2, Fizikokimya, Toksikoloji, Kaynak, EkBilgi, Durum)
          VALUES (@id, @Mix, @GenelAd, @Noael2, @Fizikokimya, @Toksikoloji, @Kaynak, @EkBilgi, 'Aktif')
        `);
    }

    return Response.json({ message: "Başarıyla güncellendi" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
