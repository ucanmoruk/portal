import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

function calcToplam(kalemler: any[], genelIskonto: number, kdvOran: number): number {
  const ara = kalemler
    .filter((k: any) => k.dahil)
    .reduce((sum: number, k: any) => {
      const m = parseFloat(k.miktar)     || 1;
      const f = parseFloat(k.birimFiyat) || 0;
      const i = parseFloat(k.iskonto)    || 0;
      return sum + m * f * (1 - i / 100);
    }, 0);
  const iskontolu = ara * (1 - genelIskonto / 100);
  return iskontolu * (1 + kdvOran / 100);
}

async function insertKalemler(pool: any, teklifId: number, kalemler: any[]) {
  for (let i = 0; i < kalemler.length; i++) {
    const k = kalemler[i];
    await pool.request()
      .input("TeklifID",   teklifId)
      .input("Bolum",      k.bolum      || "")
      .input("HizmetAdi",  k.hizmetAdi  || "")
      .input("Sure",       k.sure       || null)
      .input("Miktar",     parseFloat(k.miktar)     || 1)
      .input("BirimFiyat", parseFloat(k.birimFiyat) || 0)
      .input("ParaBirimi", k.paraBirimi || "TRY")
      .input("Iskonto",    parseFloat(k.iskonto)    || 0)
      .input("Dahil",      k.dahil ? 1 : 0)
      .input("Sira",       i)
      .input("Notlar",     k.notlar || null)
      .query(`
        INSERT INTO RootKozTeklifKalem
          (TeklifID, Bolum, HizmetAdi, Sure, Miktar, BirimFiyat, ParaBirimi, Iskonto, Dahil, Sira, Notlar)
        VALUES
          (@TeklifID, @Bolum, @HizmetAdi, @Sure, @Miktar, @BirimFiyat, @ParaBirimi, @Iskonto, @Dahil, @Sira, @Notlar)
      `);
  }
}

// ──────────────────────────────────────────────────────────────
// GET — tek teklif (header + kalemler)
// ──────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pool = await poolPromise;

  const headerRes = await pool.request()
    .input("id", parseInt(id))
    .query(`SELECT * FROM RootKozTeklif WHERE ID = @id AND SilindiMi = 0`);

  if (!headerRes.recordset.length)
    return Response.json({ error: "Bulunamadı" }, { status: 404 });

  const kalemRes = await pool.request()
    .input("id", parseInt(id))
    .query(`SELECT * FROM RootKozTeklifKalem WHERE TeklifID = @id ORDER BY Sira`);

  return Response.json({
    ...headerRes.recordset[0],
    kalemler: kalemRes.recordset,
  });
}

// ──────────────────────────────────────────────────────────────
// PUT — tam güncelleme
// ──────────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pool = await poolPromise;
  const body = await req.json();

  const {
    musteriAdi, musteriEmail, musteriTelefon,
    markaAdi, urunKategorisi, skuSayisi, uretimMiktari, hedefPazar,
    odemeTuru, kdvOran, genelIskonto, notlar,
    kalemler = [],
  } = body;

  const kdv      = parseFloat(kdvOran)      || 20;
  const gIskonto = parseFloat(genelIskonto) || 0;
  const toplam   = calcToplam(kalemler, gIskonto, kdv);
  const numId    = parseInt(id);

  await pool.request()
    .input("id",             numId)
    .input("MusteriAdi",     musteriAdi     || null)
    .input("MusteriEmail",   musteriEmail   || null)
    .input("MusteriTelefon", musteriTelefon || null)
    .input("MarkaAdi",       markaAdi       || null)
    .input("UrunKategorisi", urunKategorisi || null)
    .input("SKUSayisi",      parseInt(skuSayisi) || null)
    .input("UretimMiktari",  uretimMiktari  || null)
    .input("HedefPazar",     hedefPazar     || null)
    .input("OdemeTuru",      odemeTuru      || null)
    .input("KDVOran",        kdv)
    .input("GenelIskonto",   gIskonto)
    .input("ToplamTutar",    toplam)
    .input("Notlar",         notlar         || null)
    .query(`
      UPDATE RootKozTeklif SET
        MusteriAdi = @MusteriAdi, MusteriEmail = @MusteriEmail,
        MusteriTelefon = @MusteriTelefon, MarkaAdi = @MarkaAdi,
        UrunKategorisi = @UrunKategorisi, SKUSayisi = @SKUSayisi,
        UretimMiktari = @UretimMiktari, HedefPazar = @HedefPazar,
        OdemeTuru = @OdemeTuru, KDVOran = @KDVOran, GenelIskonto = @GenelIskonto,
        ToplamTutar = @ToplamTutar, Notlar = @Notlar,
        GuncellenmeTarihi = GETDATE()
      WHERE ID = @id AND SilindiMi = 0
    `);

  // Kalemler: sil + yeniden ekle
  await pool.request()
    .input("id", numId)
    .query(`DELETE FROM RootKozTeklifKalem WHERE TeklifID = @id`);

  await insertKalemler(pool, numId, kalemler);

  return Response.json({ ok: true });
}

// ──────────────────────────────────────────────────────────────
// PATCH — sadece durum güncelle
// ──────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pool = await poolPromise;
  const { durum } = await req.json();

  const VALID = ["Taslak", "Gönderildi", "Onaylandı", "Reddedildi"];
  if (!VALID.includes(durum))
    return Response.json({ error: "Geçersiz durum" }, { status: 400 });

  await pool.request()
    .input("id",    parseInt(id))
    .input("durum", durum)
    .query(`
      UPDATE RootKozTeklif SET Durum = @durum, GuncellenmeTarihi = GETDATE()
      WHERE ID = @id AND SilindiMi = 0
    `);

  return Response.json({ ok: true });
}

// ──────────────────────────────────────────────────────────────
// DELETE — soft delete
// ──────────────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pool = await poolPromise;

  await pool.request()
    .input("id", parseInt(id))
    .query(`UPDATE RootKozTeklif SET SilindiMi = 1, GuncellenmeTarihi = GETDATE() WHERE ID = @id`);

  return Response.json({ ok: true });
}
