import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const pool = await poolPromise;
    const header = await pool.request()
      .input("id", Number(id))
      .query(`
        SELECT p.*, ISNULL(f.Ad, '') AS FirmaAd, ISNULL(f.Email, '') AS FirmaEmail,
               ISNULL(f.Telefon, '') AS FirmaTelefon, ISNULL(f.Adres, '') AS FirmaAdres,
               ISNULL(f.VergiDairesi, '') AS VergiDairesi, ISNULL(f.VergiNo, '') AS VergiNo
        FROM ProformaX1 p
        LEFT JOIN RootTedarikci f ON f.ID = p.FirmaID
        WHERE p.ID = @id AND p.SilindiMi = 0
      `);
    if (!header.recordset.length) return Response.json({ error: "Proforma bulunamadı" }, { status: 404 });

    const lines = await pool.request()
      .input("id", Number(id))
      .query(`
        SELECT *
        FROM ProformaX2
        WHERE ProformaID = @id
        ORDER BY ID
      `);

    return Response.json({ header: header.recordset[0], satirlar: lines.recordset });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const body = await request.json();
    const durum = body.durum;
    const valid = ["Taslak", "Gönderildi", "Onaylandı", "İptal"];
    if (!valid.includes(durum)) return Response.json({ error: "Geçersiz durum" }, { status: 400 });

    const pool = await poolPromise;
    await pool.request()
      .input("id", Number(id))
      .input("durum", durum)
      .query(`UPDATE ProformaX1 SET Durum = @durum WHERE ID = @id`);

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

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
    await pool.request()
      .input("id", Number(id))
      .input("EvrakNo", body.evrakNo || null)
      .input("TeklifID", body.teklifId ? Number(body.teklifId) : null)
      .input("FirmaID", firmaId)
      .input("KdvOran", kdvOran)
      .input("GenelIskonto", genelIskonto)
      .input("AraToplam", Number(araToplam.toFixed(2)))
      .input("IskontoTutar", Number(iskontoTutar.toFixed(2)))
      .input("KdvTutar", Number(kdvTutar.toFixed(2)))
      .input("GenelToplam", Number(genelToplam.toFixed(2)))
      .input("Notlar", body.notlar || null)
      .query(`
        UPDATE ProformaX1 SET
          EvrakNo = @EvrakNo,
          TeklifID = @TeklifID,
          FirmaID = @FirmaID,
          KdvOran = @KdvOran,
          GenelIskonto = @GenelIskonto,
          AraToplam = @AraToplam,
          IskontoTutar = @IskontoTutar,
          KdvTutar = @KdvTutar,
          GenelToplam = @GenelToplam,
          Notlar = @Notlar
        WHERE ID = @id AND SilindiMi = 0
      `);

    await pool.request()
      .input("id", Number(id))
      .query(`DELETE FROM ProformaX2 WHERE ProformaID = @id`);

    for (const line of satirlar) {
      const adet = toNumber(line.adet ?? line.Adet, 1);
      const birimFiyat = toNumber(line.birimFiyat ?? line.BirimFiyat, 0);
      const iskonto = toNumber(line.iskonto ?? line.Iskonto, 0);
      const tutar = calcLine({ adet, birimFiyat, iskonto });
      await pool.request()
        .input("ProformaID", Number(id))
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

    const evrakNoForPayment = Number(body.evrakNo);
    if (Number.isFinite(evrakNoForPayment) && evrakNoForPayment > 0) {
      await pool.request()
        .input("Evrak_No", evrakNoForPayment)
        .query(`
          INSERT INTO Odeme (Evrak_No, Odeme_Durumu, Tarih)
          VALUES (@Evrak_No, 'Proforma', GETDATE())
        `);
    }

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const pool = await poolPromise;
    await pool.request()
      .input("id", Number(id))
      .query(`UPDATE ProformaX1 SET SilindiMi = 1 WHERE ID = @id`);
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
