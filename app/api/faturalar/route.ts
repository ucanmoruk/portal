import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { hasProformaFaturaFirmaCol } from "@/lib/proformaSchema";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

// Fatura Takip — cosmo `Fatura` (başlık) + `Odeme` (ödeme durumu aşamaları) tabloları.
// Proforma "Faturaya çevir" akışı: Fatura kaydı oluşturur, Odeme'ye 'Ödeme Bekliyor'
// yazar (numune-takip "Ödeme" sütunu da buradan beslenir) ve proformayı 'Faturalaştı'
// yapar. Ödeme durumu Evrak_No üzerinden bağlanır: Fatura.ProformaNo = Odeme.Evrak_No
// = ProformaBaslik.EvrakNo. Yeni tablo YOK — mevcut legacy şema kullanılır.

function toNumber(value: any, fallback = 0) {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function cleanOptionalText(value: any): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

async function ensureProformaNkrTable(pool: any) {
  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS ProformaNkr (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        ProformaID INT NOT NULL,
        NkrID INT NOT NULL,
        EvrakNo VARCHAR(40) NULL,
        RaporNo VARCHAR(60) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY UX_ProformaNkr_Proforma_Nkr (ProformaID, NkrID),
        KEY IX_ProformaNkr_EvrakNo (EvrakNo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    return;
  }

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='ProformaNkr' AND xtype='U')
    CREATE TABLE ProformaNkr (
      ID          INT IDENTITY(1,1) PRIMARY KEY,
      ProformaID  INT          NOT NULL,
      NkrID       INT          NOT NULL,
      EvrakNo     NVARCHAR(40) NULL,
      RaporNo     NVARCHAR(60) NULL,
      CreatedAt   DATETIME     NOT NULL DEFAULT GETDATE()
    )
  `);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const yil = (sp.get("yil") || "").trim();           // "" = tümü, yoksa "2026" gibi
  const odeme = (sp.get("odeme") || "").trim();        // "" = tümü, yoksa ödeme durumu
  const ay = (sp.get("ay") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  // Guncel odeme durumu: backfill'in sonradan ekledigi yalniz "Proforma" satiri,
  // faturalasan kaydin "Odeme Bekliyor/Odendi/..." durumunu ezmemeli.
  const sonOdeme = `COALESCE(
    (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Fatura_ID = f.ID AND ISNULL(o.Odeme_Durumu, N'') <> N'Proforma' ORDER BY o.ID DESC),
    (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Evrak_No = f.ProformaNo AND ISNULL(o.Odeme_Durumu, N'') <> N'Proforma' ORDER BY o.ID DESC),
    (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Fatura_ID = f.ID ORDER BY o.ID DESC),
    (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Evrak_No = f.ProformaNo ORDER BY o.ID DESC)
  )`;
  // Yıl Fatura_No içinde gömülü (UNA2026...); Fatura.Tarih çoğunlukla boş olduğu için ondan değil bundan.
  const yilExpr = `COALESCE(NULLIF(REGEXP_SUBSTR(f.Fatura_No, '20[0-9][0-9]'), ''), DATE_FORMAT(COALESCE(NULLIF(f.Tarih, '0000-00-00 00:00:00'), (SELECT MAX(fd.Tarih) FROM FaturaDetay fd WHERE fd.ProformaNo = f.ProformaNo)), '%Y'))`;
  // Efektif tarih: gerçek Fatura.Tarih yoksa FaturaDetay'daki en güncel tarih.
  const tarihExpr = `COALESCE(NULLIF(f.Tarih, '0000-00-00 00:00:00'), (SELECT MAX(fd.Tarih) FROM FaturaDetay fd WHERE fd.ProformaNo = f.ProformaNo))`;

  // Ortak WHERE (search/yil/odeme). Parametreler her request'e ayrıca eklenir.
  let where = "WHERE f.Durum = 'Aktif'";
  if (search) where += ` AND (ISNULL(f.Fatura_No,'') LIKE @search OR ISNULL(f.ProformaNo,'') LIKE @search OR ISNULL(fr.Firma_Adi,'') LIKE @search)`;
  if (yil) where += ` AND ${yilExpr} = @yil`;
  if (ay) where += ` AND DATE_FORMAT(${tarihExpr}, '%m') = @ay`;
  if (odeme) where += ` AND ${sonOdeme} = @odeme`;

  const bindFilters = (r: any) => {
    r.input("search", `%${search}%`);
    r.input("yil", yil);
    r.input("ay", ay);
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
          f.Toplam, f.Tutar, f.KDV, f.Odenen_Tutar AS OdenenTutar,
          f.FaturaFirmaID, f.Aciklama,
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
    if (!faturaNo) return Response.json({ error: "Fatura no zorunludur." }, { status: 400 });
    if (!faturaTarihi) return Response.json({ error: "Fatura tarihi zorunludur." }, { status: 400 });

    const pool = await cosmoPool;
    await ensureProformaNkrTable(pool);
    if (!proformaId) {
      const evrakNo = cleanOptionalText(body.evrakNo);
      const toplam = toNumber(body.toplam);
      const kdvOran = toNumber(body.kdvOran, 20);
      const net = toplam / (1 + kdvOran / 100);
      const kdv = toplam - net;
      const faturaFirmaId = body.faturaFirmaId ? Number(body.faturaFirmaId) : null;
      const aciklama = cleanOptionalText(body.aciklama);

      const insRes = await pool.request()
        .input("FaturaNo", faturaNo)
        .input("ProformaNo", evrakNo)
        .input("Toplam", Number(toplam.toFixed(2)))
        .input("Tutar", Number(net.toFixed(2)))
        .input("KDV", Number(kdv.toFixed(2)))
        .input("OdenenTutar", 0)
        .input("FaturaFirmaID", faturaFirmaId)
        .input("Tarih", faturaTarihi)
        .input("Aciklama", aciklama)
        .query(`
          INSERT INTO Fatura (Fatura_No, ProformaNo, Toplam, Tutar, KDV, Odenen_Tutar, FaturaFirmaID, Tarih, Durum, Aciklama)
          OUTPUT INSERTED.ID
          VALUES (@FaturaNo, @ProformaNo, @Toplam, @Tutar, @KDV, @OdenenTutar, @FaturaFirmaID, @Tarih, 'Aktif', @Aciklama)
        `);
      const faturaId = Number(insRes.recordset[0]?.ID);

      await pool.request()
        .input("Evrak_No", evrakNo)
        .input("Fatura_ID", faturaId || null)
        .input("Tarih", faturaTarihi)
        .query(`
          INSERT INTO Odeme (Evrak_No, Odeme_Durumu, Fatura_ID, Tarih)
          VALUES (@Evrak_No, N'Ödeme Bekliyor', @Fatura_ID, @Tarih)
        `);

      return Response.json({ id: faturaId }, { status: 201 });
    }

    // Fatura firması rapor firmasından farklı olabilir (opsiyonel kolon).
    const hasFaturaFirmaCol = await hasProformaFaturaFirmaCol(pool);
    const ffSelect = hasFaturaFirmaCol ? ", FaturaFirmaID" : "";
    const profRes = await pool.request()
      .input("id", proformaId)
      .query(`SELECT ID, EvrakNo, FirmaID, GenelToplam, KdvOran, Durum${ffSelect} FROM ProformaBaslik WHERE ID = @id AND SilindiMi = 0`);
    const proforma = profRes.recordset[0];
    if (!proforma) return Response.json({ error: "Proforma bulunamadı." }, { status: 404 });
    if (String(proforma.Durum) === "Faturalaştı") {
      return Response.json({ error: "Bu proforma zaten faturalaştırılmış." }, { status: 409 });
    }
    // Fatura firması: proformada ayrı seçildiyse o, yoksa rapor firması.
    const faturaFirmaId = (hasFaturaFirmaCol && proforma.FaturaFirmaID)
      ? Number(proforma.FaturaFirmaID)
      : (proforma.FirmaID ? Number(proforma.FirmaID) : null);

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
      .input("FaturaFirmaID", faturaFirmaId)
      .input("Tarih", faturaTarihi)
      .input("Aciklama", aciklama)
      .query(`
        INSERT INTO Fatura (Fatura_No, ProformaNo, Toplam, Tutar, KDV, Odenen_Tutar, FaturaFirmaID, Tarih, Durum, Aciklama)
        OUTPUT INSERTED.ID
        VALUES (@FaturaNo, @ProformaNo, @Toplam, @Tutar, @KDV, @OdenenTutar, @FaturaFirmaID, @Tarih, 'Aktif', @Aciklama)
      `);
    const faturaId = Number(insRes.recordset[0]?.ID);

    const odemeEvrakNos = new Set<string>();
    if (evrakNo) odemeEvrakNos.add(evrakNo);
    const linkedEvrakRes = await pool.request()
      .input("ProformaID", proformaId)
      .query(`
        SELECT DISTINCT EvrakNo
        FROM ProformaNkr
        WHERE ProformaID = @ProformaID
          AND EvrakNo IS NOT NULL
          AND EvrakNo <> ''
      `);
    for (const row of linkedEvrakRes.recordset || []) {
      const linkedEvrakNo = String(row.EvrakNo || "").trim();
      if (linkedEvrakNo) odemeEvrakNos.add(linkedEvrakNo);
    }

    // Ödeme aşaması → numune-takip "Ödeme" sütunu 'Ödeme Bekliyor' gösterir.
    for (const targetEvrakNo of odemeEvrakNos) {
      await pool.request()
        .input("Evrak_No", targetEvrakNo)
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
