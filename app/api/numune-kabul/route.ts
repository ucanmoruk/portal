import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { type NextRequest } from "next/server";

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

function splitCsv(value: unknown): string[] {
  return Array.from(new Set(
    String(value || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
  ));
}

async function backfillRecentProformaLinks(pool: any) {
  const missingRes = await pool.request().query(`
    SELECT TOP 50 p.ID, p.ProformaNo, pk.RaporNoListesi
    FROM ProformaBaslik p
    INNER JOIN ProformaKalem pk ON pk.ProformaID = p.ID
    WHERE p.SilindiMi = 0
      AND pk.RaporNoListesi IS NOT NULL
      AND pk.RaporNoListesi <> ''
      AND NOT EXISTS (SELECT 1 FROM ProformaNkr pn WHERE pn.ProformaID = p.ID)
    ORDER BY p.ID DESC
  `);

  const byProforma = new Map<number, Set<string>>();
  for (const row of missingRes.recordset || []) {
    const id = Number(row.ID);
    if (!Number.isFinite(id)) continue;
    if (!byProforma.has(id)) byProforma.set(id, new Set());
    for (const raporNo of splitCsv(row.RaporNoListesi)) byProforma.get(id)!.add(raporNo);
  }

  for (const [proformaId, raporNoSet] of byProforma) {
    const raporNos = Array.from(raporNoSet).slice(0, 500);
    if (raporNos.length === 0) continue;

    const req = pool.request();
    const inParams = raporNos.map((raporNo, i) => {
      req.input(`r${i}`, raporNo);
      return `@r${i}`;
    }).join(", ");

    const nkrRes = await req.query(`
      SELECT ID, Evrak_No, RaporNo
      FROM NKR
      WHERE Durum = 'Aktif' AND RaporNo IN (${inParams})
    `);

    const evrakNos = new Set<number>();
    for (const nkr of nkrRes.recordset || []) {
      await pool.request()
        .input("ProformaID", proformaId)
        .input("NkrID", Number(nkr.ID))
        .input("EvrakNo", String(nkr.Evrak_No || ""))
        .input("RaporNo", String(nkr.RaporNo || ""))
        .query(`
          INSERT INTO ProformaNkr (ProformaID, NkrID, EvrakNo, RaporNo)
          SELECT @ProformaID, @NkrID, @EvrakNo, @RaporNo
          WHERE NOT EXISTS (
            SELECT 1 FROM ProformaNkr WHERE ProformaID = @ProformaID AND NkrID = @NkrID
          )
        `);

      const evrakNo = Number(nkr.Evrak_No);
      if (Number.isFinite(evrakNo) && evrakNo > 0) evrakNos.add(evrakNo);
    }

    for (const evrakNo of evrakNos) {
      await pool.request()
        .input("Evrak_No", evrakNo)
        .query(`
          INSERT INTO Odeme (Evrak_No, Odeme_Durumu, Tarih)
          VALUES (@Evrak_No, N'Proforma', GETDATE())
        `);
    }
  }
}

// ----------------------------------------------------------------
// GET  /api/numune-kabul?search=&page=1&limit=20
//
// Sayfalama: Evrak_No grubu başına 1 sayfa birimi.
// Yanıt: { data: EvrakGroup[], total, page, limit, totalPages }
// EvrakGroup: { evrakNo, tarih, firmaAd, projeAd, numuneSayisi,
//               odemeDurumu, numuneler: NumuneItem[] }
// ----------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp     = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page   = Math.max(1, parseInt(sp.get("page")  || "1",  10));
  const limit  = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  // ── Filtreler ──
  const tarihBas    = sp.get("tarihBas")?.trim()    || "";
  const tarihBit    = sp.get("tarihBit")?.trim()    || "";
  const odeme       = sp.get("odeme")?.trim()       || "";
  const raporDurumu = sp.get("raporDurumu")?.trim() || "";

  try {
    const pool = await cosmoPool;
    await ensureProformaNkrTable(pool);
    await backfillRecentProformaLinks(pool);

    // Migration 018: NKR_RaporOnay.DisRaporKodu — kolon yoksa arama/gösterim
    // dışı kalır (graceful degrade).
    const disKodCheck = await pool.request().query(`
      SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'NKR_RaporOnay' AND COLUMN_NAME = 'DisRaporKodu'
    `);
    const hasDisRaporKodu = disKodCheck.recordset.length > 0;

    // DisRaporKodu (ÜGAM/RR26/XXXX) NKR_RaporOnay tablosunda — EXISTS ile arar.
    const disKodSearchClause = (hasDisRaporKodu && search)
      ? `OR EXISTS (
             SELECT 1 FROM NKR_RaporOnay ro
             WHERE ro.NkrID = n.ID
               AND LOWER(COALESCE(ro.DisRaporKodu, '')) LIKE LOWER(@searchLike)
           )`
      : "";

    // Proje adı: NumuneDetay.ProjeID → Firma. EXISTS ile arar (evrak içindeki
    // herhangi bir numunenin proje firması eşleşirse evrak listede çıkar).
    const projeSearchClause = search
      ? `OR EXISTS (
             SELECT 1 FROM NumuneDetay nd3
             INNER JOIN Firma pf ON pf.ID = nd3.ProjeID
             WHERE nd3.RaporID = n.ID
               AND LOWER(ISNULL(pf.Firma_Adi, '')) LIKE LOWER(@searchLike)
           )`
      : "";

    // Arama: Evrak_No, RaporNo, FirmaAd, NumuneAdi, ProjeAd (+ DisRaporKodu) üzerinde
    const searchClause = search
      ? `AND (
          LOWER(ISNULL(CAST(n.Evrak_No AS NVARCHAR), '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(CAST(n.RaporNo AS NVARCHAR), '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(f.Ad, '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(n.Numune_Adi, '')) LIKE LOWER(@searchLike)
          ${projeSearchClause}
          ${disKodSearchClause}
        )`
      : "";

    const raporDurumuExpr = `
      CASE
        WHEN COALESCE(NULLIF(n.Rapor_Durumu, ''), N'Analiz Aşamasında')
          IN (N'Analiz Aşamasında', N'Bekletiliyor', N'Gönderildi')
        THEN COALESCE(NULLIF(n.Rapor_Durumu, ''), N'Analiz Aşamasında')
        ELSE N'Analiz Aşamasında'
      END
    `;

    // Filtre cümlesi: tarih aralığı + rapor durumu (NKR satırı) + ödeme (Evrak bazında)
    const filterClause =
      (tarihBas    ? " AND CONVERT(date, n.Tarih) >= @tarihBas" : "") +
      (tarihBit    ? " AND CONVERT(date, n.Tarih) <= @tarihBit" : "") +
      (raporDurumu ? ` AND ${raporDurumuExpr} = @raporDurumu` : "") +
      // NULL (hiç Odeme kaydı yok) = "Fatura Kesilmedi" — OdemeBadge ile aynı mantık.
      // Aksi halde Odeme satırı olmayan (yeni) evraklar "Fatura Kesilmedi" filtresinde kaybolurdu.
      (odeme       ? " AND ISNULL((SELECT TOP 1 Odeme_Durumu FROM Odeme WHERE Evrak_No = n.Evrak_No ORDER BY ID DESC), N'Fatura Kesilmedi') = @odeme" : "");

    // Filtre input'larını bir request'e ekler (yalnızca kullanılanlar)
    const addFilters = <T extends { input: (n: string, v: unknown) => T }>(req: T): T => {
      if (tarihBas)    req.input("tarihBas", tarihBas);
      if (tarihBit)    req.input("tarihBit", tarihBit);
      if (raporDurumu) req.input("raporDurumu", raporDurumu);
      if (odeme)       req.input("odeme", odeme);
      return req;
    };

    const baseJoin = `
      FROM NKR n
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f ON f.ID = n.Firma_ID
      WHERE n.Durum = 'Aktif' ${searchClause} ${filterClause}
    `;

    const signal = request.signal;

    // ── Query 1 + 2 paralel: Count ve sayfalanmış gruplar aynı anda ──
    const [countResult, groupResult] = await Promise.all([
      addFilters(pool.request()
        .input("search", search)
        .input("searchLike", `%${search}%`))
        .query(`SELECT COUNT(DISTINCT n.Evrak_No) AS total ${baseJoin}`),

      addFilters(pool.request()
        .input("search", search)
        .input("searchLike", `%${search}%`)
        .input("offset", offset)
        .input("limit",  limit))
        .query(`
          SELECT
            n.Evrak_No,
            MIN(CONVERT(varchar(10), n.Tarih, 120))  AS Tarih,
            MIN(f.Ad)                                 AS FirmaAd,
            COUNT(*)                                  AS NumuneSayisi,
            CASE
              WHEN COUNT(DISTINCT ${raporDurumuExpr}) = 1
                THEN MIN(${raporDurumuExpr})
              ELSE N'Mixed'
            END                                       AS Rapor_Durumu,
            (
              SELECT TOP 1 Odeme_Durumu
              FROM Odeme
              WHERE Evrak_No = n.Evrak_No
              ORDER BY ID DESC
            )                                         AS Odeme_Durumu,
            (
              SELECT TOP 1 p.ID
              FROM ProformaBaslik p
              WHERE p.SilindiMi = 0 AND (
                p.EvrakNo = CAST(n.Evrak_No AS NVARCHAR(40))
                OR EXISTS (
                  SELECT 1
                  FROM ProformaNkr pn
                  INNER JOIN NKR nx ON nx.ID = pn.NkrID
                  WHERE pn.ProformaID = p.ID
                    AND nx.Evrak_No = n.Evrak_No
                    AND nx.Durum = 'Aktif'
                )
              )
              ORDER BY p.ID DESC
            )                                         AS ProformaID,
            (
              SELECT TOP 1 p.ProformaNo
              FROM ProformaBaslik p
              WHERE p.SilindiMi = 0 AND (
                p.EvrakNo = CAST(n.Evrak_No AS NVARCHAR(40))
                OR EXISTS (
                  SELECT 1
                  FROM ProformaNkr pn
                  INNER JOIN NKR nx ON nx.ID = pn.NkrID
                  WHERE pn.ProformaID = p.ID
                    AND nx.Evrak_No = n.Evrak_No
                    AND nx.Durum = 'Aktif'
                )
              )
              ORDER BY p.ID DESC
            )                                         AS ProformaNo,
            (
              SELECT TOP 1 rt.Ad
              FROM   NKR n2
              LEFT JOIN NumuneDetay nd ON nd.RaporID = n2.ID
              LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) rt ON nd.ProjeID = rt.ID
              WHERE  n2.Evrak_No = n.Evrak_No AND n2.Durum = 'Aktif'
                AND  rt.Ad IS NOT NULL
            )                                         AS ProjeAd,
            CAST(CASE WHEN EXISTS (
              SELECT 1 FROM NKR_EvrakEslestirme
              WHERE EvrakNo = CAST(n.Evrak_No AS NVARCHAR(50))
                AND Tur IN (N'Teklif', N'Dosya')
            ) THEN 1 ELSE 0 END AS BIT)             AS HasEslestirme
          ${baseJoin}
          GROUP BY n.Evrak_No
          ORDER BY n.Evrak_No DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `),
    ]);

    if (signal.aborted) return new Response(null, { status: 499 });

    const total  = countResult.recordset[0].total;
    const groups = groupResult.recordset as any[];

    // ── Query 3: Bu sayfadaki gruplara ait numuneler ──
    let numunesByEvrak: Record<string, any[]> = {};
    if (groups.length > 0) {
      const req3 = pool.request();
      const inParams = groups.map((g, i) => {
        req3.input(`ev${i}`, g.Evrak_No);
        return `@ev${i}`;
      }).join(", ");

      // Aşama (Numune Takip ile bağlı):
      //   - Onaylandı       : NKR_RaporOnay'da Durum='Onaylandı'
      //   - Onay Bekliyor   : tüm NumuneX1.SonucKayitTarihi dolu, onay yok
      //   - Sonuç Girişi    : NKR_LabKabul var, sonuç tamamlanmamış
      //   - Kabul Bekliyor  : NKR_LabKabul yok
      // DisRaporKodu(lar): bir NKR'nin birden fazla rapor formatı varsa virgülle
      // birleştirilir. Kolon yoksa NULL döner (graceful).
      const disKodSelect = hasDisRaporKodu
        ? `(SELECT STRING_AGG(ro.DisRaporKodu, N', ')
             FROM NKR_RaporOnay ro
             WHERE ro.NkrID = n.ID AND ro.DisRaporKodu IS NOT NULL)`
        : `CAST(NULL AS NVARCHAR(400))`;

      const numuneResult = await req3.query(`
        SELECT
          n.ID,
          n.Evrak_No,
          n.RaporNo,
          ${disKodSelect} AS DisRaporKodu,
          n.Numune_Adi,
          n.Grup,
          n.Tur,
          CASE
            WHEN EXISTS (SELECT 1 FROM NKR_RaporOnay o WHERE o.NkrID = n.ID AND o.Durum = N'Onaylandı')
              THEN N'Onaylandı'
            WHEN NOT EXISTS (SELECT 1 FROM NKR_LabKabul k WHERE k.NkrID = n.ID)
              THEN N'Kabul Bekliyor'
            WHEN EXISTS (SELECT 1 FROM NumuneX1 x WHERE x.RaporID = n.ID AND x.SonucKayitTarihi IS NULL)
              THEN N'Analiz Aşamasında'
            ELSE N'Onay Bekliyor'
          END AS Asama
        FROM NKR n
        WHERE n.Durum = 'Aktif'
          AND n.Evrak_No IN (${inParams})
        ORDER BY n.Evrak_No DESC, n.RaporNo DESC
      `);

      for (const row of numuneResult.recordset) {
        if (!numunesByEvrak[row.Evrak_No]) numunesByEvrak[row.Evrak_No] = [];
        numunesByEvrak[row.Evrak_No].push(row);
      }
    }

    // ── Merge ──
    const data = groups.map(g => {
      const normalizedOdeme = g.Odeme_Durumu || (g.ProformaID ? "Proforma" : null);
      return {
        evrakNo:        g.Evrak_No,
        tarih:          g.Tarih,
        firmaAd:        g.FirmaAd,
        projeAd:        g.ProjeAd,
        numuneSayisi:   g.NumuneSayisi,
        raporDurumu:    g.Rapor_Durumu,
        odemeDurumu:    normalizedOdeme,
        proformaId:     g.ProformaID ? Number(g.ProformaID) : null,
        proformaNo:     g.ProformaNo || null,
        hasEslestirme:  Boolean(g.HasEslestirme),
        numuneler:      numunesByEvrak[g.Evrak_No] ?? [],
      };
    });

    return Response.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// PATCH /api/numune-kabul
// Body: { evrakNo, raporDurumu }
// Evrak altındaki tüm aktif numunelerin manuel rapor durumunu günceller.
// ----------------------------------------------------------------
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const allowed = new Set([
    "Analiz Aşamasında",
    "Gönderildi",
    "Bekletiliyor",
  ]);

  try {
    const body = await request.json();
    const evrakNo = String(body?.evrakNo || "").trim();
    const raporDurumu = String(body?.raporDurumu || "").trim();

    if (!evrakNo) return Response.json({ error: "Evrak No zorunludur." }, { status: 400 });
    if (!allowed.has(raporDurumu)) return Response.json({ error: "Geçersiz rapor durumu." }, { status: 400 });

    const pool = await cosmoPool;
    const result = await pool.request()
      .input("Evrak_No", evrakNo)
      .input("Rapor_Durumu", raporDurumu)
      .query(`
        UPDATE NKR
        SET Rapor_Durumu = @Rapor_Durumu
        WHERE Evrak_No = @Evrak_No
          AND Durum = 'Aktif'
      `);

    return Response.json({ ok: true, updated: result.rowsAffected?.[0] ?? 0 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// POST /api/numune-kabul
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const body = await request.json();
    const { Tarih, Evrak_No, RaporNo, Firma_ID, Numune_Adi, Grup } = body;

    if (!Evrak_No?.trim())   return Response.json({ error: "Evrak No zorunludur."   }, { status: 400 });
    if (!RaporNo?.trim())    return Response.json({ error: "Rapor No zorunludur."   }, { status: 400 });
    if (!Numune_Adi?.trim()) return Response.json({ error: "Numune Adı zorunludur." }, { status: 400 });

    const pool = await cosmoPool;
    const result = await pool.request()
      .input("Tarih",      Tarih      || null)
      .input("Evrak_No",   Evrak_No.trim())
      .input("RaporNo",    RaporNo.trim())
      .input("Firma_ID",   Firma_ID ? parseInt(Firma_ID) : null)
      .input("Numune_Adi", Numune_Adi.trim())
      .input("Grup",       Grup       || null)
      .input("Rapor_Durumu", "Analiz Aşamasında")
      .query(`
        INSERT INTO NKR (Tarih, Evrak_No, RaporNo, Firma_ID, Numune_Adi, Grup, Durum, Rapor_Durumu)
        OUTPUT INSERTED.ID
        VALUES (@Tarih, @Evrak_No, @RaporNo, @Firma_ID, @Numune_Adi, @Grup, 'Aktif', @Rapor_Durumu)
      `);

    return Response.json({ id: result.recordset[0].ID }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
