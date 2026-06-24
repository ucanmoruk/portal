import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { randomDisKodTalep } from "@/lib/disKod";

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/talepler?tur=Analiz|Destek&search=&page=1&limit=20  — listele
// POST /api/talepler  — yeni Talep olustur (iç TalepNo = MAX+1, dış kod = ÜGAM/A26/XXXX)
//
// Müşteri portalında oluşturulan TALEPLER (Analiz / Destek).
// Analiz için cosmoroot.VIEW_TALEP_LISTE (Tur='Analiz' filtreli) kullanılır.
// Destek için dbo.Talep'ten doğrudan (Tur='Destek', Durum<>'Pasif').
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp     = request.nextUrl.searchParams;
  const tur    = (sp.get("tur") || "Analiz").trim();
  const search = sp.get("search")?.trim() || "";
  const durum  = sp.get("durum")?.trim() || "";
  const page   = Math.max(1, parseInt(sp.get("page")  || "1",  10));
  const limit  = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  if (tur !== "Analiz" && tur !== "Destek") {
    return Response.json({ error: "Geçersiz tur (Analiz | Destek)." }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;

    if (tur === "Analiz") {
      // Analiz: cosmoroot.VIEW_TALEP_LISTE (kolon adlarında boşluk var)
      const searchClause = search
        ? `AND (
            ISNULL(v.[Talep No], '') COLLATE Turkish_CI_AS LIKE @searchLike
            OR ISNULL(v.FirmaKodu, '') COLLATE Turkish_CI_AS LIKE @searchLike
            OR ISNULL(v.[Talep Oluşturan], '') COLLATE Turkish_CI_AS LIKE @searchLike
            OR ISNULL(v.[Müşteri], '') COLLATE Turkish_CI_AS LIKE @searchLike
            OR ISNULL(v.Durum, '') COLLATE Turkish_CI_AS LIKE @searchLike
          )`
        : "";
      const durumClause = durum ? `AND ISNULL(v.Durum, '') = @durum` : "";

      const [countRes, dataRes] = await Promise.all([
        pool.request().input("searchLike", `%${search}%`).input("durum", durum).query(`
          SELECT COUNT(*) AS total FROM cosmoroot.VIEW_TALEP_LISTE v
          WHERE 1 = 1 ${searchClause} ${durumClause}
        `),
        pool.request().input("searchLike", `%${search}%`).input("durum", durum).input("offset", offset).input("limit", limit).query(`
          SELECT
            v.ID,
            v.[Talep No]          AS TalepNo,
            -- İç takip kodu: '26' + dbo.Talep.TalepNo (sayı). Eski "UQ193" view'da
            -- dış kod olarak görünür; iç kod = "26193".
            N'26' + CAST(t.TalepNo AS NVARCHAR(20)) AS IcTakipNo,
            FORMAT(v.Tarih, 'dd.MM.yyyy') AS Tarih,
            v.FirmaKodu,
            v.[Talep Oluşturan]   AS TalepOlusturan,
            v.[Müşteri]            AS Musteri,
            v.Durum,
            v.FirmaID
          FROM cosmoroot.VIEW_TALEP_LISTE v
          INNER JOIN dbo.Talep t ON t.ID = v.ID
          WHERE 1 = 1 ${searchClause} ${durumClause}
          ORDER BY v.Tarih DESC, v.ID DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `),
      ]);

      const total = countRes.recordset[0].total;
      return Response.json({
        data: dataRes.recordset, total, page, limit, totalPages: Math.ceil(total / limit),
      });
    }

    // Destek: dbo.Talep WHERE Tur='Destek' (view yok)
    const searchClause = search
      ? `AND (
          ISNULL(COALESCE(t.DisTalepKodu, CAST(t.TalepNo AS NVARCHAR(50))), '') COLLATE Turkish_CI_AS LIKE @searchLike
          OR ISNULL(t.FirmaKodu, '') COLLATE Turkish_CI_AS LIKE @searchLike
          OR ISNULL(f.Firma_Adi, '') COLLATE Turkish_CI_AS LIKE @searchLike
          OR ISNULL(t.Durum, '') COLLATE Turkish_CI_AS LIKE @searchLike
        )`
      : "";
    const durumClause = durum ? `AND ISNULL(t.Durum, '') = @durum` : "";

    const [countRes, dataRes] = await Promise.all([
      pool.request().input("searchLike", `%${search}%`).input("durum", durum).query(`
        SELECT COUNT(*) AS total
        FROM dbo.Talep t
        LEFT JOIN dbo.Firma f ON f.Kod = t.FirmaKodu
        WHERE t.Tur = N'Destek' AND ISNULL(t.Durum, '') <> N'Pasif' ${searchClause} ${durumClause}
      `),
      pool.request().input("searchLike", `%${search}%`).input("durum", durum).input("offset", offset).input("limit", limit).query(`
        SELECT
          t.ID,
          COALESCE(t.DisTalepKodu, N'26' + CAST(t.TalepNo AS NVARCHAR(20))) AS TalepNo,
          N'26' + CAST(t.TalepNo AS NVARCHAR(20)) AS IcTakipNo,
          FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
          t.FirmaKodu,
          ISNULL(f.Firma_Adi, '')   AS TalepOlusturan,
          ISNULL(f.Firma_Adi, '')   AS Musteri,
          t.Durum,
          f.ID                       AS FirmaID
        FROM dbo.Talep t
        LEFT JOIN dbo.Firma f ON f.Kod = t.FirmaKodu
        WHERE t.Tur = N'Destek' AND ISNULL(t.Durum, '') <> N'Pasif' ${searchClause} ${durumClause}
        ORDER BY t.Tarih DESC, t.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `),
    ]);

    const total = countRes.recordset[0].total;
    return Response.json({
      data: dataRes.recordset, total, page, limit, totalPages: Math.ceil(total / limit),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/talepler  — Yeni talep oluştur
//
// Body:
// {
//   tur: "Analiz" | "Destek",
//   firmaKodu: string,
//   sozlesme?: number,
//   yetkili?: number,
//   raporlama?: { firma, adres, yetkili, iletisim, mail, karar, dil, iade, ureticiFirma, note },
//   fatura?:    { firma, adres, vergiDairesi, vergiNo, mail },
//   numuneler?: Array<{ numune, ozellik?, analiz?, metot? }>,
// }
//
// İç TalepNo: global MAX(TalepNo) + 1. Dış kod: ÜGAM/A26/XXXX (benzersiz, retry).
// ─────────────────────────────────────────────────────────────────────────────

async function nextTalepNo(pool: any): Promise<number> {
  const r = await pool.request().query(
    `SELECT ISNULL(MAX(TalepNo), 0) + 1 AS nextNo FROM dbo.Talep`
  );
  return r.recordset[0].nextNo as number;
}

async function genUniqueDisTalepKodu(pool: any): Promise<string> {
  const year = new Date().getFullYear();
  for (let i = 0; i < 25; i++) {
    const kod = randomDisKodTalep(year);
    const exists = await pool.request()
      .input("kod", kod)
      .query(`SELECT TOP 1 ID FROM dbo.Talep WHERE DisTalepKodu = @kod`);
    if (!exists.recordset.length) return kod;
  }
  return randomDisKodTalep(year) + String(Date.now()).slice(-2);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const userId = (session.user as any)?.userId ?? null;

  let body: any;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Geçersiz JSON" }, { status: 400 }); }

  const tur = String(body?.tur || "").trim();
  if (tur !== "Analiz" && tur !== "Destek") {
    return Response.json({ error: "tur 'Analiz' veya 'Destek' olmalı." }, { status: 400 });
  }
  const firmaKodu = String(body?.firmaKodu || "").trim();
  if (!firmaKodu) {
    return Response.json({ error: "firmaKodu zorunlu." }, { status: 400 });
  }

  const sozlesme = Number.isFinite(Number(body?.sozlesme)) ? Number(body.sozlesme) : null;
  const yetkili  = Number.isFinite(Number(body?.yetkili))  ? Number(body.yetkili)  : null;

  try {
    const pool = await cosmoPool;

    const talepNo = await nextTalepNo(pool);
    const disKod  = await genUniqueDisTalepKodu(pool);

    const insRes = await pool.request()
      .input("TalepNo",      talepNo)
      .input("DisTalepKodu", disKod)
      .input("FirmaKodu",    firmaKodu)
      .input("Sozlesme",     sozlesme)
      .input("Yetkili",      yetkili)
      .input("Tur",          tur)
      .input("Durum",        "Yeni Talep")
      .input("Olusturan",    userId ? Number(userId) : null)
      .query(`
        INSERT INTO dbo.Talep (Tarih, FirmaKodu, Sozlesme, Durum, TalepNo, Yetkili, Tur, Olusturan, DisTalepKodu)
        OUTPUT INSERTED.ID
        VALUES (CAST(GETDATE() AS DATE), @FirmaKodu, @Sozlesme, @Durum, @TalepNo, @Yetkili, @Tur, @Olusturan, @DisTalepKodu)
      `);
    const talepId = insRes.recordset[0].ID as number;

    // TalepRaporlama (opsiyonel — body.raporlama varsa)
    const r = body?.raporlama;
    if (r && typeof r === "object") {
      await pool.request()
        .input("TalepID",      talepId)
        .input("Firma",        r.firma        || null)
        .input("Adres",        r.adres        || null)
        .input("Yetkili",      r.yetkili      || null)
        .input("Iletisim",     r.iletisim     || null)
        .input("Mail",         r.mail         || null)
        .input("Karar",        r.karar        || null)
        .input("Dil",          r.dil          || null)
        .input("Iade",         r.iade         || null)
        .input("UreticiFirma", r.ureticiFirma || null)
        .input("Note",         r.note         || null)
        .query(`
          INSERT INTO dbo.TalepRaporlama (TalepID, Firma, Adres, Yetkili, Iletisim, Mail, Karar, Dil, Iade, UreticiFirma, Note)
          VALUES (@TalepID, @Firma, @Adres, @Yetkili, @Iletisim, @Mail, @Karar, @Dil, @Iade, @UreticiFirma, @Note)
        `);
    }

    // TalepFatura (opsiyonel)
    const f = body?.fatura;
    if (f && typeof f === "object") {
      await pool.request()
        .input("TalepID",      talepId)
        .input("Firma",        f.firma        || null)
        .input("Adres",        f.adres        || null)
        .input("VergiDairesi", f.vergiDairesi || null)
        .input("VergiNo",      f.vergiNo      || null)
        .input("Mail",         f.mail         || null)
        .query(`
          INSERT INTO dbo.TalepFatura (TalepID, Firma, Adres, VergiDairesi, VergiNo, Mail)
          VALUES (@TalepID, @Firma, @Adres, @VergiDairesi, @VergiNo, @Mail)
        `);
    }

    // TalepNumune (opsiyonel — çoklu)
    if (Array.isArray(body?.numuneler)) {
      for (const n of body.numuneler) {
        if (!n?.numune) continue;
        await pool.request()
          .input("TalepID", talepId)
          .input("Numune",  String(n.numune))
          .input("Ozellik", n.ozellik || null)
          .input("Analiz",  n.analiz  || null)
          .input("Metot",   n.metot   || null)
          .query(`
            INSERT INTO dbo.TalepNumune (TalepID, Numune, Ozellik, Analiz, Metot)
            VALUES (@TalepID, @Numune, @Ozellik, @Analiz, @Metot)
          `);
      }
    }

    return Response.json(
      { id: talepId, talepNo, disTalepKodu: disKod },
      { status: 201 }
    );
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
