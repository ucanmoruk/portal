import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { nkrUgdTipFkColumn } from "@/lib/nkrUgdTipColumn";
import { hasNkrFormulTable, hasNkrLogTable, nkrHasColumn } from "@/lib/numuneFormTables";

// Limit ve LOQ değerine göre Sonuç ve SonucEn otomatik hesapla
function computeSonucAuto(
  limit: string | null | undefined,
  loq:   string | null | undefined,
): { sonuc: string | null; sonucEn: string | null } {
  if (!limit) return { sonuc: null, sonucEn: null };
  const t = String(limit).trim();
  if (t === "Bulunmamalı") return { sonuc: "Tespit Edilmedi", sonucEn: "Not Detected" };
  if (t !== "" && !isNaN(Number(t))) {
    const loqVal = loq ? String(loq).trim() : "";
    const sonuc  = loqVal ? `< ${loqVal}` : "";
    return { sonuc, sonucEn: sonuc };
  }
  return { sonuc: null, sonucEn: null };
}

// Değerlendirme Türkçe → İngilizce çeviri
function computeDegerlendirmeEn(degerlendirme: string | null): string | null {
  if (!degerlendirme) return null;
  const t = degerlendirme.trim();
  if (t === "Uygun")       return "Pass";
  if (t === "Uygun Değil") return "Fail";
  if (t === "D.Y.")        return "N/A";
  return t;
}

// ----------------------------------------------------------------
// POST /api/numune-form
// Body: { nkr, detay, hizmetler[], formul[] }
// Tüm yeni NKR kolonları dinamik olarak kontrol edilir;
// migration uygulanmamışsa mevcut kolonlarla çalışmaya devam eder.
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const userId = (session.user as any)?.userId;

  try {
    const body = await request.json();
    const { nkr, detay, hizmetler = [], formul = [] } = body;

    if (!nkr?.Evrak_No?.trim())   return Response.json({ error: "Evrak No zorunludur."   }, { status: 400 });
    if (!nkr?.RaporNo?.trim())    return Response.json({ error: "Rapor No zorunludur."   }, { status: 400 });
    if (!nkr?.Numune_Adi?.trim()) return Response.json({ error: "Numune Adı zorunludur." }, { status: 400 });

    const pool = await poolPromise;

    // ── Tüm yeni kolonları tek seferde kontrol et (önbelleklenir) ──
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

    // ── 1. NKR INSERT (dinamik kolon listesi) ────────────────────
    const ins = pool.request()
      .input("Tarih",      nkr.Tarih     || null)
      .input("Evrak_No",   nkr.Evrak_No.trim())
      .input("RaporNo",    nkr.RaporNo.trim())
      .input("Firma_ID",   nkr.Firma_ID  ? parseInt(nkr.Firma_ID)  : null)
      .input("Numune_Adi", nkr.Numune_Adi.trim())
      .input("Grup",       nkr.Grup      || null);

    const cols: string[] = ["Tarih", "Evrak_No", "RaporNo", "Firma_ID", "Numune_Adi", "Grup", "Durum"];
    const vals: string[] = ["@Tarih", "@Evrak_No", "@RaporNo", "@Firma_ID", "@Numune_Adi", "@Grup", "'Aktif'"];

    const add = (col: string, param: string, val: unknown) => {
      cols.push(col); vals.push(`@${param}`); ins.input(param, val);
    };

    if (hasRevno)          add("Revno",            "Revno",            parseInt(nkr.Revno) || 0);
    if (hasKarar)          add("Karar",             "Karar",            nkr.Karar           || null);
    if (hasDil)            add("Dil",               "Dil",              nkr.Dil             || null);
    if (hasAciklama)       add("Aciklama",          "Aciklama",         nkr.Aciklama        || null);
    if (hasTur)            add("Tur",               "Tur",              nkr.Tur             || null);
    if (hasBarkod)         add("Barkod",            "Barkod",           nkr.Barkod          || null);
    if (hasTeklifNo)       add("Teklif_No",         "Teklif_No",        nkr.Teklif_No       || null);
    if (hasTalepNo)        add("Talep_No",          "Talep_No",         nkr.Talep_No        || null);
    if (hasNuAdiEn)        add("Numune_Adi_En",     "Numune_Adi_En",    nkr.Numune_Adi_En   || null);
    if (hasUrunTipi)       add("Urun_Tipi",         "Urun_Tipi",        nkr.Urun_Tipi       || null);
    if (hasHedefGrup)      add("Hedef_Grup",        "Hedef_Grup",       nkr.Hedef_Grup      || null);
    if (hasTesteMiktar)    add("TesteMiktar",       "TesteMiktar",      nkr.TesteMiktar      ? parseFloat(nkr.TesteMiktar)     : null);
    if (hasTesteMiktarBirim) add("TesteMiktarBirim","TesteMiktarBirim", nkr.TesteMiktarBirim || null);
    if (ugdCol)            add(ugdCol,              "UGDTip_ID",        nkr.UGDTip_ID        ? parseInt(nkr.UGDTip_ID)         : null);

    const nkrResult = await ins.query(
      `INSERT INTO NKR (${cols.join(", ")}) OUTPUT INSERTED.ID VALUES (${vals.join(", ")})`
    );
    const nkrId: number = nkrResult.recordset[0].ID;

    // ── 2. NumuneDetay ──────────────────────────────────────────
    await pool.request()
      .input("RaporID",      nkrId)
      .input("ProjeID",      detay?.ProjeID      ? parseInt(detay.ProjeID)          : null)
      .input("Miktar",       detay?.Miktar        ? parseFloat(detay.Miktar)         : null)
      .input("Birim",        detay?.Birim         || null)
      .input("SeriNo",       detay?.SeriNo        || null)
      .input("UretimTarihi", detay?.UretimTarihi  || null)
      .input("SKT",          detay?.SKT           || null)
      .query(`
        INSERT INTO NumuneDetay (RaporID, ProjeID, Miktar, Birim, SeriNo, UretimTarihi, SKT)
        VALUES (@RaporID, @ProjeID, @Miktar, @Birim, @SeriNo, @UretimTarihi, @SKT)
      `);

    // ── 3. NumuneX1 (hizmetler) ──────────────────────────────────
    if (hizmetler.length > 0) {
      // Opsiyonel kolon kontrolü
      const x1ColRes = await pool.request().query(`
        SELECT name FROM sys.columns
        WHERE object_id = OBJECT_ID('NumuneX1')
          AND name IN ('Sonuc', 'SonucEn', 'Degerlendirme', 'DegerlendirmeEn', 'Durum', 'HizmetDurum')
      `);
      const x1Cols = new Set<string>(x1ColRes.recordset.map((r: any) => r.name));

      const q = (v: string | undefined | null) =>
        v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";

      // StokAnalizListesi'nden LimitEn / BirimEn / LOQ / LOQEn çek (tüm hizmetler)
      const analizIds = [...new Set(hizmetler.map((h: any) => Number(h.AnalizID)))];
      const stalRes = await pool.request().query(`
        SELECT ID,
          ISNULL(LimitEn, '') AS LimitEn, ISNULL(BirimEn, '') AS BirimEn,
          ISNULL(LOQ,     '') AS LOQ,     ISNULL(LOQEn,   '') AS LOQEn
        FROM StokAnalizListesi WHERE ID IN (${analizIds.join(",")})
      `);
      const stalMap = new Map<number, { LimitEn: string; BirimEn: string; LOQ: string; LOQEn: string }>();
      for (const r of stalRes.recordset) {
        stalMap.set(r.ID, { LimitEn: r.LimitEn, BirimEn: r.BirimEn, LOQ: r.LOQ, LOQEn: r.LOQEn });
      }

      // NumuneX4'ten paket hizmetler için LimitDegerEn / LimitBirimiEn çek
      const paketHizmetler = hizmetler.filter((h: any) => h.x3ID);
      const paketMap = new Map<string, { LimitEn: string; BirimEn: string }>();
      if (paketHizmetler.length > 0) {
        const paketCond = paketHizmetler.map((h: any) =>
          `(ListeID=${Number(h.x3ID)} AND AltAnalizID=${Number(h.AnalizID)})`
        ).join(" OR ");
        const x4Res = await pool.request().query(`
          SELECT ListeID, AltAnalizID,
            ISNULL(LimitDegerEn,  '') AS LimitEn,
            ISNULL(LimitBirimiEn, '') AS BirimEn
          FROM NumuneX4 WHERE ${paketCond}
        `);
        for (const r of x4Res.recordset) {
          paketMap.set(`${r.ListeID}_${r.AltAnalizID}`, { LimitEn: r.LimitEn, BirimEn: r.BirimEn });
        }
      }

      const extraCols: string[] = [];
      if (x1Cols.has("Sonuc"))            extraCols.push("Sonuc");
      if (x1Cols.has("SonucEn"))          extraCols.push("SonucEn");
      if (x1Cols.has("Degerlendirme"))    extraCols.push("Degerlendirme");
      if (x1Cols.has("DegerlendirmeEn"))  extraCols.push("DegerlendirmeEn");
      if (x1Cols.has("Durum"))            extraCols.push("Durum");
      if (x1Cols.has("HizmetDurum"))      extraCols.push("HizmetDurum");

      const values = hizmetler.map((h: any) => {
        const stal = stalMap.get(Number(h.AnalizID)) ?? { LimitEn: "", BirimEn: "", LOQ: "", LOQEn: "" };
        let limitEn: string;
        let birimEn: string;
        if (h.x3ID) {
          const px = paketMap.get(`${h.x3ID}_${h.AnalizID}`) ?? { LimitEn: "", BirimEn: "" };
          limitEn = px.LimitEn;
          birimEn = px.BirimEn;
        } else {
          limitEn = stal.LimitEn;
          birimEn = stal.BirimEn;
        }
        const loq   = stal.LOQ;
        const loqEn = stal.LOQEn;
        const auto  = computeSonucAuto(h.Limit, loq);

        const extraVals = [
          ...(x1Cols.has("Sonuc")            ? [q(auto.sonuc)]                      : []),
          ...(x1Cols.has("SonucEn")          ? [q(auto.sonucEn)]                    : []),
          ...(x1Cols.has("Degerlendirme")    ? ["'Uygun'"]                           : []),
          ...(x1Cols.has("DegerlendirmeEn")  ? [q(computeDegerlendirmeEn("Uygun"))] : []),
          ...(x1Cols.has("Durum")            ? ["'Aktif'"]                           : []),
          ...(x1Cols.has("HizmetDurum")      ? ["'YeniAnaliz'"]                      : []),
        ];
        const base = `${nkrId}, ${h.AnalizID}, ${h.Termin ? `'${h.Termin}'` : "NULL"}, ${h.x3ID ?? "NULL"}, ${q(h.Limit)}, ${q(h.Birim)}, ${q(limitEn)}, ${q(birimEn)}, ${q(loq)}, ${q(loqEn)}`;
        return `(${base}${extraVals.length > 0 ? ", " + extraVals.join(", ") : ""})`;
      }).join(", ");

      const colList = `RaporID, AnalizID, Termin, x3ID, Limit, Birim, LimitEn, BirimEn, LOQ, LOQEn${extraCols.length > 0 ? ", " + extraCols.join(", ") : ""}`;
      await pool.request().query(`INSERT INTO NumuneX1 (${colList}) VALUES ${values}`);
    }

    // ── 4. NKR_Formul ────────────────────────────────────────────
    if (doFormul) {
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
      // Detaylı açıklama oluştur
      let aciklama = `Rapor No: ${nkr.RaporNo} — Evrak No: ${nkr.Evrak_No}`;
      
      if (hizmetler.length > 0) {
        const hizmetSayisi = hizmetler.length;
        aciklama += `\n• ${hizmetSayisi} hizmet eklendi`;
        
        // Paket hizmetleri varsa belirt
        const paketHizmetler = hizmetler.filter((h: any) => h.x3ID);
        if (paketHizmetler.length > 0) {
          aciklama += ` (${paketHizmetler.length} tanesi paketten)`;
        }
      }
      
      if (formul.length > 0) {
        aciklama += `\n• ${formul.length} formül maddesi eklendi`;
      }
      
      await pool.request()
        .input("NKRID",       nkrId)
        .input("KullaniciID", userId ? parseInt(userId) : null)
        .input("Eylem",       "Oluşturuldu")
        .input("Aciklama",    aciklama)
        .query("INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama) VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama)");
    }

    return Response.json({ id: nkrId }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
