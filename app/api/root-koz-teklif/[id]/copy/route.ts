import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

async function nextTeklifNo(pool: any): Promise<string> {
  const year = new Date().getFullYear();
  const res = await pool.request()
    .input("prefix", `RKZ-${year}-`)
    .query(`
      SELECT ISNULL(MAX(CAST(RIGHT(TeklifNo, 4) AS INT)), 0) + 1 AS nextSeq
      FROM RootKozTeklif
      WHERE TeklifNo LIKE @prefix + '%' AND SilindiMi = 0
    `);
  const seq: number = res.recordset[0].nextSeq;
  return `RKZ-${year}-${String(seq).padStart(4, "0")}`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pool = await poolPromise;
  const kid  = (session.user as any)?.userId || null;

  // Kaynak teklifi oku
  const srcRes = await pool.request()
    .input("id", parseInt(id))
    .query(`SELECT * FROM RootKozTeklif WHERE ID = @id AND SilindiMi = 0`);
  if (!srcRes.recordset.length)
    return Response.json({ error: "Bulunamadı" }, { status: 404 });
  const src = srcRes.recordset[0];

  const kalemRes = await pool.request()
    .input("id", parseInt(id))
    .query(`SELECT * FROM RootKozTeklifKalem WHERE TeklifID = @id ORDER BY Sira`);

  const teklifNo = await nextTeklifNo(pool);

  const ins = await pool.request()
    .input("TeklifNo",       teklifNo)
    .input("MusteriAdi",     src.MusteriAdi     || null)
    .input("MusteriEmail",   src.MusteriEmail   || null)
    .input("MusteriTelefon", src.MusteriTelefon || null)
    .input("MarkaAdi",       src.MarkaAdi       || null)
    .input("UrunKategorisi", src.UrunKategorisi || null)
    .input("SKUSayisi",      src.SKUSayisi      || null)
    .input("UretimMiktari",  src.UretimMiktari  || null)
    .input("HedefPazar",     src.HedefPazar     || null)
    .input("OdemeTuru",      src.OdemeTuru      || null)
    .input("KDVOran",        src.KDVOran        ?? 20)
    .input("GenelIskonto",   src.GenelIskonto   ?? 0)
    .input("ToplamTutar",    src.ToplamTutar    ?? 0)
    .input("Notlar",         src.Notlar         || null)
    .input("KID",            kid)
    .query(`
      INSERT INTO RootKozTeklif
        (TeklifNo, MusteriAdi, MusteriEmail, MusteriTelefon, MarkaAdi, UrunKategorisi,
         SKUSayisi, UretimMiktari, HedefPazar, OdemeTuru, KDVOran, GenelIskonto,
         ToplamTutar, Notlar, KID, Durum)
      OUTPUT INSERTED.ID
      VALUES
        (@TeklifNo, @MusteriAdi, @MusteriEmail, @MusteriTelefon, @MarkaAdi, @UrunKategorisi,
         @SKUSayisi, @UretimMiktari, @HedefPazar, @OdemeTuru, @KDVOran, @GenelIskonto,
         @ToplamTutar, @Notlar, @KID, 'Taslak')
    `);

  const newId = ins.recordset[0].ID as number;

  // Kalemleri kopyala
  for (let i = 0; i < kalemRes.recordset.length; i++) {
    const k = kalemRes.recordset[i];
    await pool.request()
      .input("TeklifID",   newId)
      .input("Bolum",      k.Bolum      || "")
      .input("HizmetAdi",  k.HizmetAdi  || "")
      .input("Sure",       k.Sure       || null)
      .input("Miktar",     k.Miktar     ?? 1)
      .input("BirimFiyat", k.BirimFiyat ?? 0)
      .input("ParaBirimi", k.ParaBirimi || "TRY")
      .input("Iskonto",    k.Iskonto    ?? 0)
      .input("Dahil",      k.Dahil ? 1 : 0)
      .input("Sira",       i)
      .input("Notlar",     k.Notlar || null)
      .query(`
        INSERT INTO RootKozTeklifKalem
          (TeklifID, Bolum, HizmetAdi, Sure, Miktar, BirimFiyat, ParaBirimi, Iskonto, Dahil, Sira, Notlar)
        VALUES
          (@TeklifID, @Bolum, @HizmetAdi, @Sure, @Miktar, @BirimFiyat, @ParaBirimi, @Iskonto, @Dahil, @Sira, @Notlar)
      `);
  }

  return Response.json({ id: newId, teklifNo });
}
