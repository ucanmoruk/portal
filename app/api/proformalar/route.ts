import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function calcLine(line: any) {
  const adet = toNumber(line.adet ?? line.Adet, 1);
  const fiyat = toNumber(line.birimFiyat ?? line.BirimFiyat, 0);
  const iskonto = toNumber(line.iskonto ?? line.Iskonto, 0);
  return adet * fiyat * (1 - iskonto / 100);
}

async function nextProformaNo(pool: any) {
  const year = new Date().getFullYear();
  const prefix = `PRF-${year}-`;
  const res = await pool.request()
    .input("prefix", prefix)
    .query(`
      SELECT ISNULL(MAX(CAST(RIGHT(ProformaNo, 4) AS INT)), 0) + 1 AS nextSeq
      FROM ProformaX1
      WHERE ProformaNo LIKE @prefix + '%'
    `);
  const seq = Number(res.recordset[0]?.nextSeq || 1);
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  try {
    const pool = await poolPromise;
    const where = search
      ? `AND (p.ProformaNo LIKE @search OR p.EvrakNo LIKE @search OR f.Ad LIKE @search OR p.Durum LIKE @search)`
      : "";

    const countRes = await pool.request()
      .input("search", `%${search}%`)
      .query(`
        SELECT COUNT(*) AS total
        FROM ProformaX1 p
        LEFT JOIN RootTedarikci f ON f.ID = p.FirmaID
        WHERE p.SilindiMi = 0 ${where}
      `);

    const dataRes = await pool.request()
      .input("search", `%${search}%`)
      .input("offset", offset)
      .input("limit", limit)
      .query(`
        SELECT
          p.ID, p.ProformaNo, p.EvrakNo, p.TeklifID, p.FirmaID,
          FORMAT(p.Tarih, 'dd.MM.yyyy') AS Tarih,
          p.Durum, p.AraToplam, p.IskontoTutar, p.KdvTutar, p.GenelToplam,
          p.KdvOran, p.GenelIskonto, p.Notlar,
          ISNULL(f.Ad, '') AS FirmaAd,
          ISNULL(f.Email, '') AS FirmaEmail,
          COUNT(x.ID) AS KalemSayisi
        FROM ProformaX1 p
        LEFT JOIN RootTedarikci f ON f.ID = p.FirmaID
        LEFT JOIN ProformaX2 x ON x.ProformaID = p.ID
        WHERE p.SilindiMi = 0 ${where}
        GROUP BY p.ID, p.ProformaNo, p.EvrakNo, p.TeklifID, p.FirmaID, p.Tarih, p.Durum,
          p.AraToplam, p.IskontoTutar, p.KdvTutar, p.GenelToplam, p.KdvOran, p.GenelIskonto,
          p.Notlar, f.Ad, f.Email
        ORDER BY p.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const total = Number(countRes.recordset[0]?.total || 0);
    return Response.json({ data: dataRes.recordset, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const body = await request.json();
    const firmaId = Number(body.firmaId);
    const satirlar = Array.isArray(body.satirlar) ? body.satirlar : [];
    if (!firmaId) return Response.json({ error: "Firma seçimi zorunludur." }, { status: 400 });
    if (satirlar.length === 0) return Response.json({ error: "En az bir proforma kalemi eklenmelidir." }, { status: 400 });

    const kdvOran = toNumber(body.kdvOran, 20);
    const genelIskonto = toNumber(body.genelIskonto, 0);
    const araToplam = satirlar.reduce((sum: number, line: any) => sum + calcLine(line), 0);
    const iskontoTutar = araToplam * (genelIskonto / 100);
    const kdvMatrah = araToplam - iskontoTutar;
    const kdvTutar = kdvMatrah * (kdvOran / 100);
    const genelToplam = kdvMatrah + kdvTutar;

    const pool = await poolPromise;
    const proformaNo = await nextProformaNo(pool);
    const userId = (session.user as any)?.userId ?? null;

    await pool.request()
      .input("ProformaNo", proformaNo)
      .input("EvrakNo", body.evrakNo || null)
      .input("TeklifID", body.teklifId ? Number(body.teklifId) : null)
      .input("FirmaID", firmaId)
      .input("Durum", body.durum || "Taslak")
      .input("KdvOran", kdvOran)
      .input("GenelIskonto", genelIskonto)
      .input("AraToplam", Number(araToplam.toFixed(2)))
      .input("IskontoTutar", Number(iskontoTutar.toFixed(2)))
      .input("KdvTutar", Number(kdvTutar.toFixed(2)))
      .input("GenelToplam", Number(genelToplam.toFixed(2)))
      .input("Notlar", body.notlar || null)
      .input("KID", userId ? Number(userId) : null)
      .query(`
        INSERT INTO ProformaX1
          (ProformaNo, EvrakNo, TeklifID, FirmaID, Tarih, Durum, KdvOran, GenelIskonto,
           AraToplam, IskontoTutar, KdvTutar, GenelToplam, Notlar, KID, SilindiMi)
        VALUES
          (@ProformaNo, @EvrakNo, @TeklifID, @FirmaID, GETDATE(), @Durum, @KdvOran, @GenelIskonto,
           @AraToplam, @IskontoTutar, @KdvTutar, @GenelToplam, @Notlar, @KID, FALSE)
      `);

    const idRes = await pool.request()
      .input("ProformaNo", proformaNo)
      .query(`SELECT TOP 1 ID FROM ProformaX1 WHERE ProformaNo = @ProformaNo ORDER BY ID DESC`);
    const proformaId = Number(idRes.recordset[0]?.ID);
    for (const line of satirlar) {
      const adet = toNumber(line.adet ?? line.Adet, 1);
      const birimFiyat = toNumber(line.birimFiyat ?? line.BirimFiyat, 0);
      const iskonto = toNumber(line.iskonto ?? line.Iskonto, 0);
      const tutar = calcLine({ adet, birimFiyat, iskonto });
      await pool.request()
        .input("ProformaID", proformaId)
        .input("HizmetID", line.hizmetId ? Number(line.hizmetId) : null)
        .input("HizmetKodu", line.hizmetKodu || null)
        .input("HizmetAdi", line.hizmetAdi || "")
        .input("RaporNoListesi", line.raporNoListesi || null)
        .input("NumuneListesi", line.numuneListesi || null)
        .input("Adet", adet)
        .input("BirimFiyat", birimFiyat)
        .input("ParaBirimi", line.paraBirimi || "TRY")
        .input("Iskonto", iskonto)
        .input("Tutar", Number(tutar.toFixed(2)))
        .input("Kaynak", line.kaynak || null)
        .query(`
          INSERT INTO ProformaX2
            (ProformaID, HizmetID, HizmetKodu, HizmetAdi, RaporNoListesi, NumuneListesi,
             Adet, BirimFiyat, ParaBirimi, Iskonto, Tutar, Kaynak)
          VALUES
            (@ProformaID, @HizmetID, @HizmetKodu, @HizmetAdi, @RaporNoListesi, @NumuneListesi,
             @Adet, @BirimFiyat, @ParaBirimi, @Iskonto, @Tutar, @Kaynak)
        `);
    }

    return Response.json({ id: proformaId, proformaNo }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
