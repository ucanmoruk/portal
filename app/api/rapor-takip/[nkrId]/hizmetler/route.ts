import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { loadBilesenSonuclar, saveBilesenSonuclar } from "@/lib/altParametre";
import { NextRequest } from "next/server";

// Değerlendirme Türkçe → İngilizce çeviri
function computeDegerlendirmeEn(degerlendirme: string | null | undefined): string | null {
  if (!degerlendirme) return null;
  const t = degerlendirme.trim();
  if (t === "Uygun")       return "Pass";
  if (t === "Uygun Değil") return "Fail";
  if (t === "D.Y.")        return "N/A";
  return t;
}

function computeSonucAuto(
  limit: string | null | undefined,
  loq: string | null | undefined,
): { sonuc: string | null; sonucEn: string | null } {
  if (!limit) return { sonuc: null, sonucEn: null };
  const t = String(limit).trim();
  if (t.toLocaleLowerCase("tr-TR").startsWith("bulun")) {
    return { sonuc: "Tespit Edilmedi", sonucEn: "Not Detected" };
  }
  if (t !== "" && !Number.isNaN(Number(t.replace(",", ".")))) {
    const loqVal = loq ? String(loq).trim() : "";
    const sonuc = loqVal && loqVal !== "-" ? `< ${loqVal}` : "";
    return { sonuc, sonucEn: sonuc };
  }
  return { sonuc: null, sonucEn: null };
}

// GET /api/rapor-takip/[nkrId]/hizmetler?raporFormati=Genel
// Bir numune + rapor formatına ait hizmetleri döner
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId);
  if (isNaN(nkrIdNum)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  const raporFormati = request.nextUrl.searchParams.get("raporFormati") || "";

  try {
    const pool = await cosmoPool;

    // Hangi opsiyonel kolonlar mevcut?
    const colCheck = await pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('NumuneX1')
        AND name IN ('Sonuc', 'Degerlendirme', 'DegerlendirmeEn', 'Birim', 'SonucEn', 'BirimEn', 'Limit', 'LimitEn', 'SonucKayitTarihi', 'RaporSira')
    `);
    const existingCols = new Set<string>(colCheck.recordset.map((r: any) => r.name));

    const raporSiraSel        = existingCols.has("RaporSira")        ? "x1.RaporSira,"                                : "CAST(NULL AS int) AS RaporSira,";
    const sonucSel            = existingCols.has("Sonuc")            ? "x1.Sonuc,"                                   : "NULL AS Sonuc,";
    const degerlendirmeSel    = existingCols.has("Degerlendirme")    ? "x1.Degerlendirme,"                            : "NULL AS Degerlendirme,";
    const degerlendirmeEnSel  = existingCols.has("DegerlendirmeEn")  ? "ISNULL(x1.DegerlendirmeEn,'') AS DegerlendirmeEn," : "'' AS DegerlendirmeEn,";
    const sonucEnSel          = existingCols.has("SonucEn")          ? "ISNULL(x1.SonucEn,'') AS SonucEn,"           : "'' AS SonucEn,";
    const limitEnSel          = existingCols.has("LimitEn")          ? "ISNULL(x1.LimitEn,'') AS LimitEn,"           : "'' AS LimitEn,";
    const birimEnSel          = existingCols.has("BirimEn")          ? "ISNULL(x1.BirimEn,'') AS BirimEn,"           : "'' AS BirimEn,";
    const kayitTarihiSel      = existingCols.has("SonucKayitTarihi") ? "x1.[SonucKayitTarihi] AS SonucKayitTarihi,"   : "NULL AS SonucKayitTarihi,";
    // Birim: NumuneX1'den al, yoksa StokAnalizListesi.BirimText'e düş
    // (Matriks = numune matrisi "Kozmetik", birim değil; BirimText = "kob/g").
    const birimSel            = existingCols.has("Birim")
      ? "ISNULL(x1.Birim, s.BirimText) AS Birim,"
      : "s.BirimText AS Birim,";

    const req = pool.request()
      .input("nkrId",        nkrIdNum)
      .input("raporFormati", raporFormati);

    const result = await req.query(`
      SELECT
        x1.ID                                       AS X1ID,
        x1.AnalizID,
        ${raporSiraSel}
        s.Kod,
        s.Ad,
        s.Akreditasyon,
        s.Method                                    AS Metot,
        ${birimSel}
        ${birimEnSel}
        ISNULL(x1.[Limit], ISNULL(s.[Limit], ''))   AS LimitDeger,
        ISNULL(x1.LOQ, ISNULL(s.LOQ, ''))           AS LOQ,
        ${limitEnSel}
        ${sonucSel}
        ${sonucEnSel}
        ${degerlendirmeSel}
        ${degerlendirmeEnSel}
        ${kayitTarihiSel}
        CONVERT(varchar(10), x1.Termin, 23)        AS Termin
      FROM NumuneX1 x1
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE x1.RaporID        = @nkrId
        AND COALESCE(NULLIF(s.RaporFormati, ''), N'Genel') = @raporFormati
      ORDER BY ${existingCols.has("RaporSira")
        ? "CASE WHEN x1.RaporSira IS NULL THEN 1 ELSE 0 END, x1.RaporSira, s.Kod, x1.ID"
        : "s.Kod, x1.ID"}
    `);

    // Alt parametreler (bileşenler) — katalog + girilmiş sonuçlar
    const hizmetler = result.recordset as Array<{
      X1ID: number;
      AnalizID: number;
      RaporSira?: number | null;
      LimitDeger?: string | null;
      LOQ?: string | null;
      Sonuc?: string | null;
      SonucEn?: string | null;
      Degerlendirme?: string | null;
      DegerlendirmeEn?: string | null;
      altParametreler?: unknown;
    }>;
    for (const h of hizmetler) {
      const auto = computeSonucAuto(h.LimitDeger, h.LOQ);
      if (!h.Sonuc) h.Sonuc = auto.sonuc;
      if (!h.SonucEn) h.SonucEn = auto.sonucEn;
      if (!h.Degerlendirme) h.Degerlendirme = "Uygun";
      if (!h.DegerlendirmeEn) h.DegerlendirmeEn = "Pass";
    }
    const pairs = hizmetler
      .map((h) => ({ x1Id: Number(h.X1ID), analizId: Number(h.AnalizID) }))
      .filter((p) => Number.isFinite(p.x1Id) && Number.isFinite(p.analizId));
    const bilesenMap = await loadBilesenSonuclar(pool, pairs);
    for (const h of hizmetler) h.altParametreler = bilesenMap[String(h.X1ID)] || [];

    return Response.json(hizmetler);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/rapor-takip/[nkrId]/hizmetler
// Body: { updates: [{ x1Id, sonuc, degerlendirme }] }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId);
  if (isNaN(nkrIdNum)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const body = await request.json();
    const updates: { x1Id: number; raporSira?: number | string | null; sonuc: string; sonucEn?: string; limit?: string; limitEn?: string; degerlendirme: string; altParametreler?: unknown }[] = body.updates || [];

    if (updates.length === 0) return Response.json({ ok: true });

    const pool = await cosmoPool;

    // Kolonları kontrol et
    const colCheck = await pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('NumuneX1')
        AND name IN ('Sonuc', 'Degerlendirme', 'DegerlendirmeEn', 'SonucEn', 'Limit', 'LimitEn', 'SonucKayitTarihi', 'RaporSira')
    `);
    const existingCols = new Set<string>(colCheck.recordset.map((r: any) => r.name));
    const hasSonuc            = existingCols.has("Sonuc");
    const hasDegerlendirme    = existingCols.has("Degerlendirme");
    const hasDegerlendirmeEn  = existingCols.has("DegerlendirmeEn");
    const hasSonucEn          = existingCols.has("SonucEn");
    const hasLimit            = existingCols.has("Limit");
    const hasLimitEn          = existingCols.has("LimitEn");
    const hasKayitTarihi      = existingCols.has("SonucKayitTarihi");
    const hasRaporSira        = existingCols.has("RaporSira");

    if (!hasSonuc && !hasDegerlendirme) {
      return Response.json(
        { error: "Sonuc ve Degerlendirme kolonları henüz eklenmemiş. Migration çalıştırın." },
        { status: 422 },
      );
    }

    // Hizmet adlarını al (log mesajı için)
    const x1Ids = updates.map(u => u.x1Id).filter(n => Number.isFinite(n));
    const hizmetAdMap = new Map<number, string>();
    if (x1Ids.length > 0) {
      const inList = x1Ids.join(",");
      const adRes = await pool.request().query(`
        SELECT x1.ID, ISNULL(s.Ad, '') AS Ad
        FROM NumuneX1 x1
        LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
        WHERE x1.ID IN (${inList}) AND x1.RaporID = ${nkrIdNum}
      `);
      for (const r of adRes.recordset) hizmetAdMap.set(Number(r.ID), String(r.Ad || ""));
    }

    // NKR_Log varlığı (Ürün Geçmişi'ne yazmak için)
    const logCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_Log' AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
    );
    const hasLog = logCheck.recordset.length > 0;
    const userId = ((session.user as any)?.userId ?? null) as number | null;

    // Her satırı güncelle + log
    for (const upd of updates) {
      const sets: string[] = [];
      const req = pool.request().input("x1Id", upd.x1Id).input("nkrId", nkrIdNum);

      if (hasRaporSira && Object.prototype.hasOwnProperty.call(upd, "raporSira")) {
        const rawSira = upd.raporSira;
        const raporSira = rawSira === null || rawSira === "" || rawSira === undefined
          ? null
          : Number(rawSira);
        sets.push("RaporSira = @raporSira");
        req.input("raporSira", Number.isFinite(raporSira) ? raporSira : null);
      }

      if (hasSonuc) {
        sets.push("Sonuc = @sonuc");
        req.input("sonuc", upd.sonuc ?? null);
      }
      if (hasSonucEn) {
        sets.push("SonucEn = @sonucEn");
        req.input("sonucEn", upd.sonucEn ?? null);
      }
      if (hasLimit) {
        sets.push("[Limit] = @limit");
        req.input("limit", upd.limit ?? null);
      }
      if (hasLimitEn) {
        sets.push("LimitEn = @limitEn");
        req.input("limitEn", upd.limitEn ?? null);
      }
      if (hasDegerlendirme) {
        sets.push("Degerlendirme = @degerlendirme");
        req.input("degerlendirme", upd.degerlendirme ?? null);
      }
      if (hasDegerlendirmeEn) {
        sets.push("DegerlendirmeEn = @degerlendirmeEn");
        req.input("degerlendirmeEn", computeDegerlendirmeEn(upd.degerlendirme ?? null));
      }
      // Kullanıcı Kaydet bastı → kayıt tarihini set et ("kayıtlı" işareti)
      // Bracket syntax → metadata cache stale olsa bile Postgres'te doğru quote'lanır
      if (hasKayitTarihi) {
        sets.push("[SonucKayitTarihi] = GETDATE()");
      }

      if (sets.length === 0) continue;

      await req.query(`
        UPDATE NumuneX1
        SET ${sets.join(", ")}
        WHERE ID = @x1Id AND RaporID = @nkrId
      `);

      // Alt parametre (bileşen) sonuçları — gönderildiyse replace et (tablo yoksa no-op)
      if (Array.isArray(upd.altParametreler)) {
        await saveBilesenSonuclar(pool, upd.x1Id, upd.altParametreler);
      }

      // Ürün Geçmişi log girişi
      if (hasLog) {
        const hizmetAd = hizmetAdMap.get(upd.x1Id) || `Hizmet #${upd.x1Id}`;
        const sonucBilgi = (upd.sonuc ?? "").trim();
        const aciklama = sonucBilgi
          ? `"${hizmetAd}" hizmeti için sonuç girişi yapıldı: ${sonucBilgi}`
          : `"${hizmetAd}" hizmeti için sonuç girişi yapıldı (boş kayıt).`;
        await pool.request()
          .input("NKRID", nkrIdNum)
          .input("KullaniciID", userId)
          .input("Eylem", "Sonuç Girişi")
          .input("Aciklama", aciklama)
          .query(
            `INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama, Tarih)
             VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
          );
      }
    }

    return Response.json({ ok: true, updated: updates.length });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
