import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// Fatura Takip — cosmo `Fatura` (başlık) + `Odeme` (ödeme durumu aşamaları) tabloları.
// Proforma "Faturaya çevir" akışı: Fatura kaydı oluşturur, Odeme'ye 'Ödeme Bekliyor'
// yazar (numune-takip "Ödeme" sütunu da buradan beslenir) ve proformayı 'Faturalaştı'
// yapar. Ödeme durumu Evrak_No üzerinden bağlanır: Fatura.ProformaNo = Odeme.Evrak_No
// = ProformaBaslik.EvrakNo. Yeni tablo YOK — mevcut legacy şema kullanılır.

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const yil = (sp.get("yil") || "").trim();           // "" = tümü, yoksa "2026" gibi
  const odeme = (sp.get("odeme") || "").trim();        // "" = tümü, yoksa ödeme durumu
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  // Güncel ödeme durumu (Evrak_No bazlı son Odeme kaydı) — birden çok yerde kullanılır.
  const sonOdeme = `(SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Evrak_No = f.ProformaNo ORDER BY o.ID DESC)`;
  // Yıl Fatura_No içinde gömülü (UNA2026...); Fatura.Tarih çoğunlukla boş olduğu için ondan değil bundan.
  const yilExpr = `REGEXP_SUBSTR(f.Fatura_No, '20[0-9][0-9]')`;
  // Efektif tarih: gerçek Fatura.Tarih yoksa FaturaDetay'daki en güncel tarih.
  const tarihExpr = `COALESCE(NULLIF(f.Tarih, '0000-00-00 00:00:00'), (SELECT MAX(fd.Tarih) FROM FaturaDetay fd WHERE fd.ProformaNo = f.ProformaNo))`;

  // Ortak WHERE (search/yil/odeme). Parametreler her request'e ayrıca eklenir.
  let where = "WHERE f.Durum = 'Aktif'";
  if (search) where += ` AND (ISNULL(f.Fatura_No,'') LIKE @search OR ISNULL(f.ProformaNo,'') LIKE @search OR ISNULL(fr.Firma_Adi,'') LIKE @search)`;
  if (yil) where += ` AND ${yilExpr} = @yil`;
  if (odeme) where += ` AND ${sonOdeme} = @odeme`;

  const bindFilters = (r: any) => {
    r.input("search", `%${search}%`);
    r.input("yil", yil);
    r.input("odeme", odeme);
    return r;
  };

  try {
    const pool = await cosmoPool;

    const countRes = await bindFilters(pool.request()).query(`
      SELECT COUNT(*) AS total
      FROM Fatura f
      LEFT JOIN Firma fr ON fr.ID = f.FaturaFirmaID
      ${where}
    `);

    const sumRes = await bindFilters(pool.request()).query(`
      SELECT COUNT(*) AS adet, ISNULL(SUM(f.Toplam),0) AS toplam, ISNULL(SUM(f.Odenen_Tutar),0) AS odenen
      FROM Fatura f
      LEFT JOIN Firma fr ON fr.ID = f.FaturaFirmaID
      ${where}
    `);

    const dataRes = await bindFilters(pool.request())
      .input("offset", offset)
      .input("limit", limit)
      .query(`
        SELECT
          f.ID, f.Fatura_No AS FaturaNo, f.ProformaNo,
          ${tarihExpr} AS Tarih,
          f.Toplam, f.Odenen_Tutar AS OdenenTutar,
          ISNULL(fr.Firma_Adi, '') AS FirmaAd,
          ${sonOdeme} AS OdemeDurumu
        FROM Fatura f
        LEFT JOIN Firma fr ON fr.ID = f.FaturaFirmaID
        ${where}
        ORDER BY f.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    // Yıl filtresi seçenekleri (dolu olanlar, azalan).
    const yearsRes = await pool.request().query(`
      SELECT DISTINCT ${yilExpr} AS yil
      FROM Fatura f
      WHERE f.Durum = 'Aktif' AND ${yilExpr} <> ''
      ORDER BY yil DESC
    `);

    const total = Number(countRes.recordset[0]?.total || 0);
    const s = sumRes.recordset[0] || {};
    return Response.json({
      data: dataRes.recordset,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      summary: { adet: Number(s.adet || 0), toplam: Number(s.toplam || 0), odenen: Number(s.odenen || 0) },
      years: yearsRes.recordset.map((r: any) => String(r.yil)).filter(Boolean),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const body = await request.json();
    const proformaId = Number(body.proformaId);
    const faturaNo = String(body.faturaNo || "").trim();
    const faturaTarihi = String(body.faturaTarihi || "").trim();
    if (!proformaId) return Response.json({ error: "Proforma seçimi zorunludur." }, { status: 400 });
    if (!faturaNo) return Response.json({ error: "Fatura no zorunludur." }, { status: 400 });
    if (!faturaTarihi) return Response.json({ error: "Fatura tarihi zorunludur." }, { status: 400 });

    const pool = await cosmoPool;
    const profRes = await pool.request()
      .input("id", proformaId)
      .query(`SELECT ID, EvrakNo, FirmaID, GenelToplam, KdvOran, Durum FROM ProformaBaslik WHERE ID = @id AND SilindiMi = 0`);
    const proforma = profRes.recordset[0];
    if (!proforma) return Response.json({ error: "Proforma bulunamadı." }, { status: 404 });
    if (String(proforma.Durum) === "Faturalaştı") {
      return Response.json({ error: "Bu proforma zaten faturalaştırılmış." }, { status: 409 });
    }

    const evrakNo = proforma.EvrakNo ? String(proforma.EvrakNo) : null;
    // Toplam = KDV dahil (proforma GenelToplam ya da popup'ta düzeltilmiş tutar).
    const toplam = body.tutar != null && body.tutar !== "" ? toNumber(body.tutar) : toNumber(proforma.GenelToplam);
    const kdvOran = toNumber(proforma.KdvOran, 20);
    const net = toplam / (1 + kdvOran / 100);
    const kdv = toplam - net;
    const aciklama = body.aciklama ? String(body.aciklama).trim() : null;

    // Fatura başlığı — legacy şema (Tutar=matrah, KDV=vergi, Toplam=KDV dahil).
    const insRes = await pool.request()
      .input("FaturaNo", faturaNo)
      .input("ProformaNo", evrakNo)
      .input("Toplam", Number(toplam.toFixed(2)))
      .input("Tutar", Number(net.toFixed(2)))
      .input("KDV", Number(kdv.toFixed(2)))
      .input("OdenenTutar", 0)
      .input("FaturaFirmaID", proforma.FirmaID ? Number(proforma.FirmaID) : null)
      .input("Tarih", faturaTarihi)
      .input("Aciklama", aciklama)
      .query(`
        INSERT INTO Fatura (Fatura_No, ProformaNo, Toplam, Tutar, KDV, Odenen_Tutar, FaturaFirmaID, Tarih, Durum, Aciklama)
        OUTPUT INSERTED.ID
        VALUES (@FaturaNo, @ProformaNo, @Toplam, @Tutar, @KDV, @OdenenTutar, @FaturaFirmaID, @Tarih, 'Aktif', @Aciklama)
      `);
    const faturaId = Number(insRes.recordset[0]?.ID);

    // Ödeme aşaması → numune-takip "Ödeme" sütunu 'Ödeme Bekliyor' gösterir.
    if (evrakNo) {
      await pool.request()
        .input("Evrak_No", evrakNo)
        .input("Fatura_ID", faturaId || null)
        .input("Tarih", faturaTarihi)
        .query(`
          INSERT INTO Odeme (Evrak_No, Odeme_Durumu, Fatura_ID, Tarih)
          VALUES (@Evrak_No, N'Ödeme Bekliyor', @Fatura_ID, @Tarih)
        `);
    }

    await pool.request()
      .input("id", proformaId)
      .query(`UPDATE ProformaBaslik SET Durum = N'Faturalaştı' WHERE ID = @id AND SilindiMi = 0`);

    return Response.json({ id: faturaId }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
