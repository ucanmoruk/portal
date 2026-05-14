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

function pickField(row: Record<string, unknown> | null | undefined, ...names: string[]) {
  if (!row) return undefined;
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
    const lower = name.toLowerCase();
    if ((row as any)[lower] !== undefined) return (row as any)[lower];
    const upper = name.toUpperCase();
    if ((row as any)[upper] !== undefined) return (row as any)[upper];
  }
  return undefined;
}

async function resolveNkrId(pool: any, rawId: string) {
  const result = await pool
    .request()
    .input("idRaw", rawId)
    .query(`
      SELECT TOP 1 ID
      FROM NKR
      WHERE Durum = 'Aktif'
        AND (ID = TRY_CAST(@idRaw AS INT) OR CAST(RaporNo AS NVARCHAR(100)) = @idRaw)
      ORDER BY CASE WHEN CAST(RaporNo AS NVARCHAR(100)) = @idRaw THEN 0 ELSE 1 END, ID DESC
    `);

  const first = result.recordset?.[0];
  const id = pickField(first, "ID", "id");
  return id ? Number(id) : null;
}

function findCol(cols: Set<string>, candidates: string[]) {
  return candidates.find((c) => cols.has(c) || cols.has(c.toLowerCase()) || cols.has(c.toUpperCase())) || null;
}

async function loadUgdDetayUsage(pool: any, tipId: unknown) {
  const parsedTipId = Number.parseInt(String(tipId ?? ""), 10);
  if (!Number.isFinite(parsedTipId)) return null;

  const colsRes = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = N'rUGDDetay'
  `);

  const cols = new Set<string>((colsRes.recordset || []).map((r: any) => String(pickField(r, "COLUMN_NAME", "column_name") || "")));
  if (!cols.size) return null;

  const idCol = findCol(cols, ["UGDTip_ID", "UGDTipID", "TipID", "Tip2", "rUGDTipID", "ID"]);
  if (!idCol) return null;

  const trUseCol = findCol(cols, ["Kullanim", "KullanimTr"]);
  const enUseCol = findCol(cols, ["KullanimEn", "Kullanim_En"]);
  const trWarnCol = findCol(cols, ["Uyarilar", "UyarilarTr"]);
  const enWarnCol = findCol(cols, ["UyarilarEn", "Uyarilar_En"]);
  if (!trUseCol && !enUseCol && !trWarnCol && !enWarnCol) return null;

  const selectParts = [
    trUseCol ? `[${trUseCol}] AS Kullanim` : "CAST(NULL AS NVARCHAR(MAX)) AS Kullanim",
    enUseCol ? `[${enUseCol}] AS KullanimEn` : "CAST(NULL AS NVARCHAR(MAX)) AS KullanimEn",
    trWarnCol ? `[${trWarnCol}] AS Uyarilar` : "CAST(NULL AS NVARCHAR(MAX)) AS Uyarilar",
    enWarnCol ? `[${enWarnCol}] AS UyarilarEn` : "CAST(NULL AS NVARCHAR(MAX)) AS UyarilarEn",
  ];

  const sql = `
    SELECT TOP 1 ${selectParts.join(", ")}
    FROM rUGDDetay
    WHERE [${idCol}] = @tipId
  `;

  const detail = await pool.request().input("tipId", parsedTipId).query(sql);
  return detail.recordset?.[0] || null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erisim" }, { status: 401 });

  const { id } = await params;

  try {
    const pool = await poolPromise;
    const searchParams = new URL(request.url).searchParams;
    const forcedNkrId = searchParams.get("nkrId");
    const nkrId = forcedNkrId ? await resolveNkrId(pool, forcedNkrId) : await resolveNkrId(pool, id);
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
      ID: pickField(n, "ID"),
      Tarih: pickField(n, "Tarih"),
      RaporNo: pickField(n, "RaporNo"),
      Versiyon: pickField(n, "Revno") != null ? String(pickField(n, "Revno")) : "1",
      FirmaID: pickField(n, "Firma_ID"),
      FirmaAd: pickField(n, "FirmaAd") || "",
      Barkod: pickField(n, "Barkod"),
      Urun: pickField(n, "Numune_Adi"),
      UrunEn: pickField(n, "Numune_Adi_En"),
      Miktar: pickField(d, "Miktar") != null
        ? `${asText(pickField(d, "Miktar"))}${pickField(d, "Birim") ? ` ${pickField(d, "Birim")}` : ""}`
        : pickField(n, "TesteMiktar") != null
          ? `${asText(pickField(n, "TesteMiktar"))}${pickField(n, "TesteMiktarBirim") ? ` ${pickField(n, "TesteMiktarBirim")}` : ""}`
          : "",
      Tip1: pickField(n, "Tur") || pickField(n, "Urun_Tipi") || "Durulanmayan",
      Tip2: ugdCol ? pickField(n, ugdCol) : null,
      Uygulama: pickField(n, "UygulamaBolgesi") || "",
      Hedef: pickField(n, "Hedef_Grup") || "Yetiskinler",
      A: pickField(n, "ADegeri") || "",
      RaporDurum: "Tamamlandi",
    };

    const ugdDetay = await loadUgdDetayUsage(pool, row.Tip2);
    if (ugdDetay) {
      const trUse = pickField(ugdDetay, "Kullanim");
      const enUse = pickField(ugdDetay, "KullanimEn");
      const trWarn = pickField(ugdDetay, "Uyarilar");
      const enWarn = pickField(ugdDetay, "UyarilarEn");
      if (!row.Kullanim && trUse) row.Kullanim = trUse;
      if (!row.KullanimEn && enUse) row.KullanimEn = enUse;
      if (!row.Uyarilar && trWarn) row.Uyarilar = trWarn;
      if (!row.UyarilarEn && enWarn) row.UyarilarEn = enWarn;
    }

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

