import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { nkrUgdTipFkColumn } from "@/lib/nkrUgdTipColumn";
import { hasNkrFormulTable, hasNkrLogTable, nkrHasColumn } from "@/lib/numuneFormTables";

// ----------------------------------------------------------------
// GET /api/numune-form/[id]
// Tam kaydı döner: NKR + NumuneDetay + NumuneX1 + NKR_Formul + Fotograf
// ----------------------------------------------------------------
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const nkrId = parseInt(id);

  try {
    const pool = await poolPromise;
    const [ugdCol, doFormul] = await Promise.all([
      nkrUgdTipFkColumn(pool),
      hasNkrFormulTable(pool),
    ]);

    const nkrSql = ugdCol
      ? `SELECT n.*, f.Ad AS FirmaAd,
           t.Kategori AS UGDTip_Kategori, t.UrunTipi AS UGDTip_UrunTipi,
           t.UygulamaBolgesi, t.ADegeri
         FROM NKR n
         LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
         LEFT JOIN rUGDTip t       ON t.ID = n.[${ugdCol}]
         WHERE n.ID = @id AND n.Durum = 'Aktif'`
      : `SELECT n.*, f.Ad AS FirmaAd,
           CAST(NULL AS nvarchar(200)) AS UGDTip_Kategori,
           CAST(NULL AS nvarchar(500)) AS UGDTip_UrunTipi,
           CAST(NULL AS nvarchar(500)) AS UygulamaBolgesi,
           CAST(NULL AS nvarchar(200)) AS ADegeri
         FROM NKR n
         LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
         WHERE n.ID = @id AND n.Durum = 'Aktif'`;

    const [nkrRes, detayRes, hizmetlerRes, formulRes, fotoRes] = await Promise.all([
      pool.request().input("id", nkrId).query(nkrSql),
      pool.request().input("id", nkrId).query(`
        SELECT nd.*, p.Ad AS ProjeAd
        FROM NumuneDetay nd
        LEFT JOIN RootTedarikci p ON p.ID = nd.ProjeID
        WHERE nd.RaporID = @id
      `),
      pool.request().input("id", nkrId).query(`
        SELECT x1.ID, x1.AnalizID, x1.Termin, x1.x3ID,
               s.Kod, s.Ad, s.Method AS Metot, s.Sure,
               p.ListeAdi AS PaketAd
        FROM NumuneX1 x1
        LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
        LEFT JOIN NumuneX3 p          ON p.ID = x1.x3ID
        WHERE x1.RaporID = @id
        ORDER BY x1.ID
      `),
      doFormul
        ? pool.request().input("id", nkrId).query(
            "SELECT * FROM NKR_Formul WHERE NKRID = @id ORDER BY ID"
          )
        : Promise.resolve({ recordset: [] as any[] }),
      pool.request().input("id", nkrId).query(
        "SELECT Path FROM Fotograf WHERE RaporID = @id"
      ),
    ]);

    const nkrRow = nkrRes.recordset[0];
    if (!nkrRow) return Response.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    // Eski DB'lerde UGDTip_ID alanı Tip2 altında olabilir
    if (ugdCol === "Tip2" && nkrRow.UGDTip_ID == null && nkrRow.Tip2 != null) {
      nkrRow.UGDTip_ID = nkrRow.Tip2;
    }

    return Response.json({
      nkr:       nkrRow,
      detay:     detayRes.recordset[0] || null,
      hizmetler: hizmetlerRes.recordset,
      formul:    formulRes.recordset,
      fotoPath:  fotoRes.recordset[0]?.Path || null,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// PUT /api/numune-form/[id]
// Tüm kaydı günceller. Tüm yeni NKR kolonları dinamik kontrol edilir.
// ----------------------------------------------------------------
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const userId = (session.user as any)?.userId;
  const { id }  = await params;
  const nkrId   = parseInt(id);

  try {
    const body = await request.json();
    const { nkr, detay, hizmetler = [], formul = [] } = body;

    if (!nkr?.Evrak_No?.trim())   return Response.json({ error: "Evrak No zorunludur."   }, { status: 400 });
    if (!nkr?.RaporNo?.trim())    return Response.json({ error: "Rapor No zorunludur."   }, { status: 400 });
    if (!nkr?.Numune_Adi?.trim()) return Response.json({ error: "Numune Adı zorunludur." }, { status: 400 });

    const pool = await poolPromise;

    const [
      hasRevno, hasKarar, hasDil, hasAciklama, hasTur,
      hasBarkod, hasTeklifNo, hasTalepNo, hasNuAdiEn,
      hasTesteMiktar, hasTesteMiktarBirim, hasUrunTipi, hasHedefGrup,
      ugdCol, doFormul, doLog,
    ] = await Promise.all([
      nkrHasColumn(pool, "Revno"),
      nkrHasColumn(pool, "Karar"),
      nkrHasColumn(pool, "Dil"),
      nkrHasColumn(pool, "Aciklama"),
      nkrHasColumn(pool, "Tur"),
      nkrHasColumn(pool, "Barkod"),
      nkrHasColumn(pool, "Teklif_No"),
      nkrHasColumn(pool, "Talep_No"),
      nkrHasColumn(pool, "Numune_Adi_En"),
      nkrHasColumn(pool, "TesteMiktar"),
      nkrHasColumn(pool, "TesteMiktarBirim"),
      nkrHasColumn(pool, "Urun_Tipi"),
      nkrHasColumn(pool, "Hedef_Grup"),
      nkrUgdTipFkColumn(pool),
      hasNkrFormulTable(pool),
      hasNkrLogTable(pool),
    ]);

    // ── 1. NKR UPDATE (dinamik SET listesi) ──────────────────────
    const upd = pool.request()
      .input("id",       nkrId)
      .input("Tarih",    nkr.Tarih     || null)
      .input("Evrak_No", nkr.Evrak_No.trim())
      .input("RaporNo",  nkr.RaporNo.trim())
      .input("Firma_ID", nkr.Firma_ID  ? parseInt(nkr.Firma_ID) : null)
      .input("Numune_Adi", nkr.Numune_Adi.trim())
      .input("Grup",     nkr.Grup      || null);

    const sets: string[] = [
      "Tarih = @Tarih",
      "Evrak_No = @Evrak_No",
      "RaporNo = @RaporNo",
      "Firma_ID = @Firma_ID",
      "Numune_Adi = @Numune_Adi",
      "Grup = @Grup",
    ];

    const addSet = (col: string, param: string, val: unknown) => {
      sets.push(`${col} = @${param}`); upd.input(param, val);
    };

    if (hasRevno)          addSet("Revno",            "Revno",            parseInt(nkr.Revno) || 0);
    if (hasKarar)          addSet("Karar",             "Karar",            nkr.Karar           || null);
    if (hasDil)            addSet("Dil",               "Dil",              nkr.Dil             || null);
    if (hasAciklama)       addSet("Aciklama",          "Aciklama",         nkr.Aciklama        || null);
    if (hasTur)            addSet("Tur",               "Tur",              nkr.Tur             || null);
    if (hasBarkod)         addSet("Barkod",            "Barkod",           nkr.Barkod          || null);
    if (hasTeklifNo)       addSet("Teklif_No",         "Teklif_No",        nkr.Teklif_No       || null);
    if (hasTalepNo)        addSet("Talep_No",          "Talep_No",         nkr.Talep_No        || null);
    if (hasNuAdiEn)        addSet("Numune_Adi_En",     "Numune_Adi_En",    nkr.Numune_Adi_En   || null);
    if (hasUrunTipi)       addSet("Urun_Tipi",         "Urun_Tipi",        nkr.Urun_Tipi       || null);
    if (hasHedefGrup)      addSet("Hedef_Grup",        "Hedef_Grup",       nkr.Hedef_Grup      || null);
    if (hasTesteMiktar)    addSet("TesteMiktar",       "TesteMiktar",      nkr.TesteMiktar      ? parseFloat(nkr.TesteMiktar)     : null);
    if (hasTesteMiktarBirim) addSet("TesteMiktarBirim","TesteMiktarBirim", nkr.TesteMiktarBirim || null);
    if (ugdCol)            addSet(ugdCol,              "UGDTip_ID",        nkr.UGDTip_ID        ? parseInt(nkr.UGDTip_ID)         : null);

    await upd.query(`UPDATE NKR SET ${sets.join(", ")} WHERE ID = @id`);

    // ── 2. NumuneDetay UPSERT ─────────────────────────────────────
    const exists = await pool.request().input("id", nkrId)
      .query("SELECT 1 AS x FROM NumuneDetay WHERE RaporID = @id");

    const detayReq = pool.request()
      .input("ProjeID",      detay?.ProjeID      ? parseInt(detay.ProjeID)          : null)
      .input("Miktar",       detay?.Miktar        ? parseFloat(detay.Miktar)         : null)
      .input("Birim",        detay?.Birim         || null)
      .input("SeriNo",       detay?.SeriNo        || null)
      .input("UretimTarihi", detay?.UretimTarihi  || null)
      .input("SKT",          detay?.SKT           || null);

    if (exists.recordset.length > 0) {
      detayReq.input("id", nkrId);
      await detayReq.query(`
        UPDATE NumuneDetay
        SET ProjeID=@ProjeID, Miktar=@Miktar, Birim=@Birim,
            SeriNo=@SeriNo, UretimTarihi=@UretimTarihi, SKT=@SKT
        WHERE RaporID=@id
      `);
    } else {
      detayReq.input("RaporID", nkrId);
      await detayReq.query(`
        INSERT INTO NumuneDetay (RaporID, ProjeID, Miktar, Birim, SeriNo, UretimTarihi, SKT)
        VALUES (@RaporID, @ProjeID, @Miktar, @Birim, @SeriNo, @UretimTarihi, @SKT)
      `);
    }

    // ── 3. NumuneX1 — sil + yeniden ekle ─────────────────────────
    await pool.request().input("id", nkrId).query("DELETE FROM NumuneX1 WHERE RaporID = @id");
    for (const h of hizmetler) {
      await pool.request()
        .input("RaporID",  nkrId)
        .input("AnalizID", h.AnalizID)
        .input("Termin",   h.Termin || null)
        .input("x3ID",     h.x3ID   || null)
        .query("INSERT INTO NumuneX1 (RaporID, AnalizID, Termin, x3ID) VALUES (@RaporID, @AnalizID, @Termin, @x3ID)");
    }

    // ── 4. NKR_Formul — sil + yeniden ekle ───────────────────────
    if (doFormul) {
      await pool.request().input("id", nkrId).query("DELETE FROM NKR_Formul WHERE NKRID = @id");
      for (const f of formul) {
        await pool.request()
          .input("NKRID",      nkrId)
          .input("HammaddeID", f.HammaddeID || null)
          .input("INCIName",   f.INCIName   || null)
          .input("Miktar",     f.Miktar     ? parseFloat(f.Miktar) : null)
          .input("DaP",        f.DaP        ? parseFloat(f.DaP)    : null)
          .input("Noael",      f.Noael      ? parseFloat(f.Noael)  : null)
          .query("INSERT INTO NKR_Formul (NKRID, HammaddeID, INCIName, Miktar, DaP, Noael) VALUES (@NKRID, @HammaddeID, @INCIName, @Miktar, @DaP, @Noael)");
      }
    }

    // ── 5. NKR_Log ───────────────────────────────────────────────
    if (doLog) {
      await pool.request()
        .input("NKRID",       nkrId)
        .input("KullaniciID", userId ? parseInt(userId) : null)
        .input("Eylem",       "Güncellendi")
        .input("Aciklama",    `Rapor No: ${nkr.RaporNo} — Revizyon: ${nkr.Revno || 0}`)
        .query("INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama) VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama)");
    }

    return Response.json({ message: "Güncellendi" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
