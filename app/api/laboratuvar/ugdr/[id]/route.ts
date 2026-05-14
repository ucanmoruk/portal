import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { loadLabUgdrTexts, saveLabUgdrTexts } from "@/lib/labUgdrStorage";
import { nkrHasColumn } from "@/lib/numuneFormTables";
import { nkrUgdTipFkColumn } from "@/lib/nkrUgdTipColumn";

function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

async function resolveNkrId(pool: any, rawId: string) {
  const numericId = Number.parseInt(rawId, 10);
  const result = await pool
    .request()
    .input("idNum", Number.isFinite(numericId) ? numericId : null)
    .input("idRaw", rawId)
    .query(`
      SELECT TOP 1 ID
      FROM NKR
      WHERE Durum = 'Aktif'
        AND ((@idNum IS NOT NULL AND ID = @idNum) OR RaporNo = @idRaw)
      ORDER BY CASE WHEN (@idNum IS NOT NULL AND ID = @idNum) THEN 0 ELSE 1 END, ID DESC
    `);

  return result.recordset[0]?.ID ? Number(result.recordset[0].ID) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erisim" }, { status: 401 });

  const { id } = await params;

  try {
    const pool = await poolPromise;
    const nkrId = await resolveNkrId(pool, id);
    if (!nkrId) return Response.json({ error: "Kayit bulunamadi" }, { status: 404 });

    const ugdCol = await nkrUgdTipFkColumn(pool);

    const nkrSql = ugdCol
      ? `SELECT n.*, f.Ad AS FirmaAd,
           t.UrunTipi AS UGDTip_UrunTipi,
           t.UygulamaBolgesi,
           t.ADegeri
         FROM NKR n
         LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
         LEFT JOIN rUGDTip t ON t.ID = n.[${ugdCol}]
         WHERE n.ID = @id AND n.Durum = 'Aktif'`
      : `SELECT n.*, f.Ad AS FirmaAd,
           CAST(NULL AS nvarchar(500)) AS UGDTip_UrunTipi,
           CAST(NULL AS nvarchar(500)) AS UygulamaBolgesi,
           CAST(NULL AS nvarchar(200)) AS ADegeri
         FROM NKR n
         LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
         WHERE n.ID = @id AND n.Durum = 'Aktif'`;

    const [nkrRes, detayRes, textRows] = await Promise.all([
      pool.request().input("id", nkrId).query(nkrSql),
      pool.request().input("id", nkrId).query("SELECT TOP 1 * FROM NumuneDetay WHERE RaporID = @id"),
      loadLabUgdrTexts(pool, nkrId),
    ]);

    const n = nkrRes.recordset[0];
    if (!n) return Response.json({ error: "Kayit bulunamadi" }, { status: 404 });
    const d = detayRes.recordset[0] ?? {};

    const row: Record<string, unknown> = {
      ID: n.ID,
      Tarih: n.Tarih,
      RaporNo: n.RaporNo,
      Versiyon: n.Revno != null ? String(n.Revno) : "1",
      FirmaID: n.Firma_ID,
      FirmaAd: n.FirmaAd || "",
      Barkod: n.Barkod,
      Urun: n.Numune_Adi,
      UrunEn: n.Numune_Adi_En,
      Miktar: d.Miktar != null
        ? `${asText(d.Miktar)}${d.Birim ? ` ${d.Birim}` : ""}`
        : n.TesteMiktar != null
          ? `${asText(n.TesteMiktar)}${n.TesteMiktarBirim ? ` ${n.TesteMiktarBirim}` : ""}`
          : "",
      Tip1: n.Tur || n.Urun_Tipi || "Durulanmayan",
      Tip2: ugdCol ? n[ugdCol] : null,
      Uygulama: n.UygulamaBolgesi || "",
      Hedef: n.Hedef_Grup || "Yetiskinler",
      A: n.ADegeri || "",
      RaporDurum: "Tamamlandi",
    };

    for (const item of textRows) {
      const key = item.Dil === "en" ? `${item.Alan}En` : item.Alan;
      row[key] = item.Metin ?? "";
    }

    return Response.json(row);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erisim" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const pool = await poolPromise;
    const nkrId = await resolveNkrId(pool, id);
    if (!nkrId) return Response.json({ error: "Kayit bulunamadi" }, { status: 404 });

    const [
      hasRevno,
      hasBarkod,
      hasNumuneAdiEn,
      hasTur,
      hasHedefGrup,
      hasTesteMiktar,
      hasTesteMiktarBirim,
      ugdCol,
    ] = await Promise.all([
      nkrHasColumn(pool, "Revno"),
      nkrHasColumn(pool, "Barkod"),
      nkrHasColumn(pool, "Numune_Adi_En"),
      nkrHasColumn(pool, "Tur"),
      nkrHasColumn(pool, "Hedef_Grup"),
      nkrHasColumn(pool, "TesteMiktar"),
      nkrHasColumn(pool, "TesteMiktarBirim"),
      nkrUgdTipFkColumn(pool),
    ]);

    const upd = pool.request()
      .input("id", nkrId)
      .input("Tarih", body.Tarih || null)
      .input("RaporNo", body.RaporNo || null)
      .input("Firma_ID", body.FirmaID ? Number.parseInt(String(body.FirmaID), 10) : null)
      .input("Numune_Adi", body.Urun || null);

    const sets = [
      "Tarih = @Tarih",
      "RaporNo = @RaporNo",
      "Firma_ID = @Firma_ID",
      "Numune_Adi = @Numune_Adi",
    ];

    const addSet = (col: string, param: string, value: unknown) => {
      sets.push(`${col} = @${param}`);
      upd.input(param, value);
    };

    if (hasRevno) addSet("Revno", "Revno", Number.parseInt(String(body.Versiyon || "1"), 10) || 0);
    if (hasBarkod) addSet("Barkod", "Barkod", body.Barkod || null);
    if (hasNumuneAdiEn) addSet("Numune_Adi_En", "Numune_Adi_En", body.UrunEn || null);
    if (hasTur) addSet("Tur", "Tur", body.Tip1 || null);
    if (hasHedefGrup) addSet("Hedef_Grup", "Hedef_Grup", body.Hedef || null);
    if (hasTesteMiktar) addSet("TesteMiktar", "TesteMiktar", body.Miktar ? Number.parseFloat(String(body.Miktar).replace(",", ".")) || null : null);
    if (hasTesteMiktarBirim) addSet("TesteMiktarBirim", "TesteMiktarBirim", null);
    if (ugdCol) addSet(ugdCol, "UGDTip_ID", body.Tip2 ? Number.parseInt(String(body.Tip2), 10) : null);

    await upd.query(`UPDATE NKR SET ${sets.join(", ")} WHERE ID = @id`);
    await saveLabUgdrTexts(pool, nkrId, body);

    return Response.json({ message: "UGDR kaydi guncellendi" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}


