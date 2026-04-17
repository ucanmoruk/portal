import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const { items } = await request.json(); // Array of { name, amount }
    if (!Array.isArray(items)) return Response.json({ error: "Geçersiz veri formatı" }, { status: 400 });

    const pool = await poolPromise;
    const results = [];

    for (const item of items) {
      // Madde 5 & 6: Normalizasyon
      // i -> I dönüşümü (Örn: glycerin -> GLYCERN, user specifically asked i -> I)
      let normalizedName = (item.name || "").trim().toUpperCase().replace(/i/g, "I");
      
      // Virgülü noktaya çevir
      let normalizedAmount = String(item.amount || "0").replace(",", ".");

      // Matching Logic
      // 1. rCosing fetch (ID dahil)
      const cosingResult = await pool.request()
        .input("name", normalizedName)
        .query(`
          SELECT TOP 1 ID, INCIName, Cas, EC, Functions, Regulation, Link
          FROM rCosing
          WHERE INCIName = @name OR CAS = @name
        `);

      const cosing = cosingResult.recordset[0] || {};

      // 2. rHammadde'den NOAEL değeri (rCosing.ID = rHammadde.cID)
      // Tablo yoksa veya hata varsa sessizce devam et
      let noael: string | null = null;
      if (cosing.ID) {
        try {
          const hammaddeResult = await pool.request()
            .input("cid", cosing.ID)
            .query(`SELECT TOP 1 Noael2 FROM rHammadde WHERE cID = @cid`);
          noael = hammaddeResult.recordset[0]?.Noael2?.toString() || null;
        } catch {
          // rHammadde tablosu yoksa veya Noael2 kolonu eksikse devam et
        }
      }

      // 3. rUGDYonetmelik fetch (limitler)
      const yonetmelikResult = await pool.request()
        .input("name", normalizedName)
        .query(`
          SELECT TOP 1 Maks as 'Maks', Diger as 'Diger', Etiket as 'Etiket'
          FROM rUGDYonetmelik
          WHERE INCI = @name OR INCI LIKE '%' + @name + '%'
        `);

      const yonetmelik = yonetmelikResult.recordset[0] || {};

      results.push({
        inputName: item.name,
        inputAmount: normalizedAmount,
        matched: cosing.INCIName ? true : false,
        cosingId: cosing.ID || null,
        INCIName: cosing.INCIName || null,
        Cas: cosing.Cas || null,
        Ec: cosing.EC || null,
        Functions: cosing.Functions || null,
        Regulation: cosing.Regulation || null,
        Link: cosing.Link || null,
        Maks: yonetmelik.Maks || null,
        Diger: yonetmelik.Diger || null,
        Etiket: yonetmelik.Etiket || null,
        noael: noael,
      });
    }

    return Response.json(results);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
