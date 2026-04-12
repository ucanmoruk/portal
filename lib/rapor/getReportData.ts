import poolPromise from "@/lib/db";

// ── Tipler ───────────────────────────────────────────────────────────────────

export interface Hizmet {
  "Analiz-Eng":        string;
  Analiz:              string;
  "Birim-Eng":         string;
  Birim:               string;
  "Sonuc-Eng":         string;
  Sonuc:               string;
  LOQ:                 string;
  "Metot-Eng":         string;
  Metot:               string;
  "Limit-Eng":         string;
  Limit:               string;
  "Degerlendirme-Eng": string;
  Degerlendirme:       string;
}

export interface ReportData {
  RaporNo:         string;
  "MM-YY":         string;
  Rev:             string;
  Tarih:           string;   // Numune kabul tarihi DD.MM.YYYY
  Yayin:           string;   // Yazdırıldığı gün DD.MM.YYYY
  "NumuneAdi-Eng": string;
  NumuneAdi:       string;
  Miktar:          string;   // Miktar + Birim, boşsa '-'
  Urt:             string;   // Üretim tarihi, boşsa '-'
  SKT:             string;   // Son kullanım tarihi, boşsa '-'
  Seri:            string;   // Seri numarası, boşsa '-'
  FirmaAd:         string;
  Adres:           string;
  FirmaYetkili:    string;
  FirmaMail:       string;
  hizmetler:       Hizmet[];
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

function todayFormatted() {
  const d = new Date();
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function mmyy() {
  const d = new Date();
  return `${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(2)}`;
}

/** DB'den gelen string: boş/null → '-' */
const dash = (v: string | null | undefined) => (v?.trim() || "-");

/** Tarih string: boş/null → '-' */
const dashDate = (v: string | null | undefined) => (v?.trim() || "-");

function mapDeg(d: string): string {
  if (d === "U")  return "Uygun";
  if (d === "UD") return "Uygun Değil";
  if (d === "DY") return "Değerlendirme Yapılmadı";
  return d || "-";
}
function mapDegEng(d: string): string {
  if (d === "U")  return "P";
  if (d === "UD") return "F";
  if (d === "DY") return "NE";
  return d || "-";
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────

export async function getReportData(
  nkrId: number,
  format: string,
): Promise<ReportData | null> {
  const pool = await poolPromise;

  // ── Hangi opsiyonel kolonlar mevcut? (paralel sorgu) ─────────────────────
  const [x1ColRes, salColRes, loqRes, rtRes, ndColRes, nkrColRes] = await Promise.all([
    // NumuneX1
    pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('NumuneX1')
        AND name IN ('Sonuc','Degerlendirme','Birim','Limit')
    `),
    // StokAnalizListesi
    pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('StokAnalizListesi')
        AND name IN ('AdEn','MethodEn','LOQ','NumDipnot','RaporFormati')
    `),
    // LOQ özel kontrol (ayrı tablo da olabilir)
    pool.request().query(`
      SELECT 1 AS x FROM sys.columns
      WHERE object_id = OBJECT_ID('StokAnalizListesi') AND name = 'LOQ'
    `),
    // RootTedarikci
    pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('RootTedarikci')
        AND name IN ('Adres','Yetkili','Email')
    `),
    // NumuneDetay
    pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('NumuneDetay')
        AND name IN ('Miktar','Birim','SeriNo','UretimTarihi','SKT')
    `),
    // NKR (opsiyonel: Revno, Numune_Adi_En)
    pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('NKR')
        AND name IN ('Revno','Numune_Adi_En')
    `),
  ]);

  const x1Cols  = new Set<string>(x1ColRes.recordset.map((r: any) => r.name));
  const salCols = new Set<string>(salColRes.recordset.map((r: any) => r.name));
  const rtCols  = new Set<string>(rtRes.recordset.map((r: any) => r.name));
  const ndCols  = new Set<string>(ndColRes.recordset.map((r: any) => r.name));
  const nkrCols = new Set<string>(nkrColRes.recordset.map((r: any) => r.name));
  const hasLOQ  = loqRes.recordset.length > 0;

  // ── NKR + Firma sorgusu ──────────────────────────────────────────────────
  const adresE   = rtCols.has("Adres")   ? "ISNULL(f.Adres,   '')" : "''";
  const yetkiliE = rtCols.has("Yetkili") ? "ISNULL(f.Yetkili, '')" : "''";
  const emailE   = rtCols.has("Email")   ? "ISNULL(f.Email,   '')" : "''";
  const revnoE   = nkrCols.has("Revno")        ? "ISNULL(n.Revno, '0')" : "'0'";
  const adiEnE   = nkrCols.has("Numune_Adi_En") ? "ISNULL(n.Numune_Adi_En, '')" : "''";

  const nkrRes = await pool.request()
    .input("nkrId", nkrId)
    .query(`
      SELECT
        ISNULL(n.RaporNo, '')                        AS RaporNo,
        ${revnoE}                                    AS Revno,
        ISNULL(CONVERT(varchar(10), n.Tarih, 104),'') AS Tarih,
        ISNULL(n.Numune_Adi, '')                     AS NumuneAdi,
        ${adiEnE}                                    AS NumuneAdiEn,
        ISNULL(f.Ad, '')                             AS FirmaAd,
        ${adresE}                                    AS Adres,
        ${yetkiliE}                                  AS FirmaYetkili,
        ${emailE}                                    AS FirmaMail
      FROM NKR n
      LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
      WHERE n.ID = @nkrId AND n.Durum = 'Aktif'
    `);

  if (!nkrRes.recordset.length) return null;
  const nkr = nkrRes.recordset[0];

  // ── NumuneDetay: Miktar / Seri / Urt / SKT ──────────────────────────────
  // Her kolon runtime kontrol — yoksa boş string döner, dash() ile '-' yapılır
  const ndMiktar = ndCols.has("Miktar")       ? "ISNULL(nd.Miktar, '')"                           : "''";
  const ndBirim  = ndCols.has("Birim")        ? "ISNULL(nd.Birim, '')"                            : "''";
  const ndSeri   = ndCols.has("SeriNo")       ? "ISNULL(nd.SeriNo, '')"                           : "''";
  const ndUrt    = ndCols.has("UretimTarihi") ? "ISNULL(CONVERT(varchar(10), nd.UretimTarihi, 104), '')" : "''";
  const ndSKT    = ndCols.has("SKT")          ? "ISNULL(CONVERT(varchar(10), nd.SKT, 104), '')"   : "''";

  const ndRes = await pool.request()
    .input("nkrId", nkrId)
    .query(`
      SELECT TOP 1
        ${ndMiktar} AS Miktar,
        ${ndBirim}  AS Birim,
        ${ndSeri}   AS SeriNo,
        ${ndUrt}    AS UretimTarihi,
        ${ndSKT}    AS SKT
      FROM NumuneDetay nd
      WHERE nd.RaporID = @nkrId
    `);

  const nd = ndRes.recordset[0] ?? {};

  // ── Hizmetler: NumuneX1 + StokAnalizListesi ──────────────────────────────
  // Opsiyonel NumuneX1 kolonları (migration ile eklenmiş olabilir)
  const sonucE = x1Cols.has("Sonuc")         ? "ISNULL(x1.Sonuc, '')"         : "''";
  const degE   = x1Cols.has("Degerlendirme") ? "ISNULL(x1.Degerlendirme, '')" : "''";
  const limitE = x1Cols.has("Limit")         ? "ISNULL(x1.[Limit], '')"       : "''";
  const birimE = x1Cols.has("Birim")         ? "ISNULL(x1.Birim, '')"         : "''";

  // StokAnalizListesi opsiyonel kolonları
  const adEnE    = salCols.has("AdEn")     ? "ISNULL(s.AdEn, '')"     : "''";
  const metotEnE = salCols.has("MethodEn") ? "ISNULL(s.MethodEn, '')" : "''";
  const loqE     = hasLOQ                  ? "ISNULL(CAST(s.LOQ AS nvarchar(200)), '')"
                 : salCols.has("NumDipnot") ? "ISNULL(s.NumDipnot, '')"
                 : "''";

  // Kullanıcının çalışan sorgusuna birebir uygun yapı:
  // select l.Akreditasyon, l.Ad, l.AdEn, l.Method, l.MethodEn,
  //        x.Limit, x.Birim, x.Sonuc, x.Degerlendirme
  // from NumuneX1 x left join StokAnalizListesi l on x.AnalizID = l.ID
  // where RaporID = @nkrId
  const raporFormatiFilter = salCols.has("RaporFormati")
    ? "AND (ISNULL(s.RaporFormati,'') = '' OR s.RaporFormati = @format)"
    : "";

  const hRes = await pool.request()
    .input("nkrId", nkrId)
    .input("format", format)
    .query(`
      SELECT
        ISNULL(s.Akreditasyon, '') AS Akreditasyon,
        ISNULL(s.Ad,           '') AS Analiz,
        ${adEnE}                   AS AnalizEn,
        ISNULL(s.Method,       '') AS Metot,
        ${metotEnE}                AS MetotEn,
        ${limitE}                  AS LimitDeger,
        ${birimE}                  AS Birim,
        ${sonucE}                  AS Sonuc,
        ${degE}                    AS Deg,
        ${loqE}                    AS LOQ
      FROM NumuneX1 x1
      LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE x1.RaporID = @nkrId
        ${raporFormatiFilter}
      ORDER BY s.Ad
    `);

  const hizmetler: Hizmet[] = hRes.recordset.map((h: any) => ({
    "Analiz-Eng":        h.AnalizEn  || h.Analiz || "-",
    Analiz:              h.Analiz    || "-",
    "Birim-Eng":         h.Birim     || "-",
    Birim:               h.Birim     || "-",
    "Sonuc-Eng":         h.Sonuc     || "-",
    Sonuc:               h.Sonuc     || "-",
    LOQ:                 h.LOQ       || "-",
    "Metot-Eng":         h.MetotEn   || h.Metot || "-",
    Metot:               h.Metot     || "-",
    "Limit-Eng":         h.LimitDeger || "-",
    Limit:               h.LimitDeger || "-",
    "Degerlendirme-Eng": mapDegEng(h.Deg),
    Degerlendirme:       mapDeg(h.Deg),
  }));

  const miktar = [nd.Miktar, nd.Birim].filter(Boolean).join(" ");

  return {
    RaporNo:         nkr.RaporNo  || "-",
    "MM-YY":         mmyy(),
    Rev:             String(nkr.Revno || "0"),
    Tarih:           dashDate(nkr.Tarih),
    Yayin:           todayFormatted(),
    "NumuneAdi-Eng": nkr.NumuneAdiEn || nkr.NumuneAdi || "-",
    NumuneAdi:       nkr.NumuneAdi   || "-",
    Miktar:          dash(miktar),
    Urt:             dashDate(nd.UretimTarihi),
    SKT:             dashDate(nd.SKT),
    Seri:            dash(nd.SeriNo),
    FirmaAd:         nkr.FirmaAd      || "-",
    Adres:           nkr.Adres        || "-",
    FirmaYetkili:    nkr.FirmaYetkili || "-",
    FirmaMail:       nkr.FirmaMail    || "-",
    hizmetler,
  };
}
