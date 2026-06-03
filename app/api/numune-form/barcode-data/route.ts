import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/numune-form/barcode-data?ids=1,2,3
// Barkod yazdırma için sadeleştirilmiş veri döner:
// [{ RaporNo, NumuneAd, FirmaAd, Tarih, hizmetler:[{Kod,Ad,BolumID,BolumAdi}] }]
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("ids")?.trim() || "";
  const ids = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (ids.length === 0) {
    return Response.json({ error: "ids parametresi gerekli" }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;

    // Dinamik kolon tespiti — BolumID varsa Bölüm JOIN'i yap
    const hasBolumCol = await pool.request().query(
      `SELECT 1 AS hasIt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME='StokAnalizListesi' AND COLUMN_NAME='BolumID'
         AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
    );
    const hasBL = hasBolumCol.recordset.length > 0;
    const bolumSelect = hasBL
      ? "s.BolumID AS BolumID, ISNULL(b.Birim, '') AS BolumAdi"
      : "NULL AS BolumID, '' AS BolumAdi";
    const bolumJoin = hasBL ? "LEFT JOIN RootFirmaBirim b ON b.ID = s.BolumID" : "";

    const inList = ids.join(",");

    // NKR + Firma
    const nkrRes = await pool.request().query(`
      SELECT n.ID, n.RaporNo, n.Numune_Adi, n.Tarih, ISNULL(f.Ad, '') AS FirmaAd
      FROM NKR n
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f ON f.ID = n.Firma_ID
      WHERE n.ID IN (${inList}) AND n.Durum = 'Aktif'
    `);

    // Hizmetler + Bölüm
    const hizRes = await pool.request().query(`
      SELECT x1.RaporID, x1.AnalizID,
             ISNULL(s.Kod, '') AS Kod,
             ISNULL(s.Ad, '')  AS Ad,
             ${bolumSelect}
      FROM NumuneX1 x1
      LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      ${bolumJoin}
      WHERE x1.RaporID IN (${inList})
      ORDER BY x1.RaporID, x1.ID
    `);

    const byRapor = new Map<number, any[]>();
    for (const h of hizRes.recordset) {
      const list = byRapor.get(h.RaporID) || [];
      list.push({
        key: `r-${h.RaporID}-${h.AnalizID}`,
        AnalizID: h.AnalizID,
        Termin: "",
        x3ID: null,
        Kod: h.Kod,
        Ad: h.Ad,
        BolumID: h.BolumID,
        BolumAdi: h.BolumAdi,
      });
      byRapor.set(h.RaporID, list);
    }

    // ids sırasına göre döndür
    const result = ids
      .map((id) => {
        const n = nkrRes.recordset.find((r: any) => r.ID === id);
        if (!n) return null;
        let tarih = "";
        if (n.Tarih) {
          if (n.Tarih instanceof Date) {
            // Local YYYY-MM-DD (timezone-safe)
            const y = n.Tarih.getFullYear();
            const m = String(n.Tarih.getMonth() + 1).padStart(2, "0");
            const d = String(n.Tarih.getDate()).padStart(2, "0");
            tarih = `${y}-${m}-${d}`;
          } else {
            const s = String(n.Tarih);
            tarih = s.includes("T") ? (s.split("T")[0] || "") : s.slice(0, 10);
          }
        }
        return {
          RaporNo: n.RaporNo || "",
          NumuneAd: n.Numune_Adi || "",
          FirmaAd: n.FirmaAd || "",
          Tarih: tarih,
          hizmetler: byRapor.get(id) || [],
        };
      })
      .filter(Boolean);

    return Response.json({ data: result });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
