import { cosmoPool } from "@/lib/db";
import QRCode from "qrcode";
import type { HizmetRow, RaporHeader, OnayInfo, KarekodInfo } from "@/app/rapor-onay-print/[nkrId]/reportTypes";
import { imzaColumnExists, imzalaVeKaydet } from "@/lib/raporImzaData";

// Rapor önizleme + imzalı PDF için ORTAK veri yükleyici.
// Hem app/rapor-onay-print/[nkrId]/page.tsx (önizleme) hem
// app/api/rapor-takip/[nkrId]/imzali-pdf (PDF) bunu kullanır →
// PDF içeriği ile önizleme/imza HER ZAMAN birebir aynı olur (tutarlılık garantisi).

export interface RaporMeta {
  revNo: string;
  kabulTarihi: string;
  yayinTarihi: string;
  hazirlayanAd: string;
  hazirlayanUnvan: string;
  onaylayanAd: string;
  onaylayanUnvan: string;
  docKodu: string;
  sirketAdi: string;
}

export interface RaporViewData {
  header: RaporHeader;
  hizmetler: HizmetRow[];
  testBaslangic: string | null;
  testBitis: string | null;
  onay: OnayInfo | null;
  meta: RaporMeta;
  karekod: KarekodInfo | null;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(dt.getTime())) return String(d);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${dt.getFullYear()}`;
  } catch {
    return String(d);
  }
}

// Veriyi yükler. Rapor yoksa null döner (çağıran tarafı 404 verir).
export async function loadRaporViewData(nkrIdNum: number, format: string): Promise<RaporViewData | null> {
  const pool = await cosmoPool;

  const headerRes = await pool.request()
    .input("id", nkrIdNum)
    .query(`
      SELECT
        n.ID AS NkrID,
        n.RaporNo,
        n.Tarih,
        n.Evrak_No,
        n.Numune_Adi,
        n.Numune_Adi_En,
        n.Urun_Tipi,
        n.TesteMiktar,
        n.TesteMiktarBirim,
        ISNULL(f.Ad, '')        AS FirmaAd,
        ISNULL(f.Adres, '')     AS FirmaAdres,
        ISNULL(f.Yetkili, '')   AS FirmaYetkili,
        ISNULL(f.Email, '')     AS FirmaEmail,
        ISNULL(f.Telefon, '')   AS FirmaTelefon,
        n.Karar,
        n.Dil,
        nd.SeriNo,
        nd.UretimTarihi,
        nd.SKT
      FROM NKR n
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f ON f.ID = n.Firma_ID
      LEFT JOIN NumuneDetay   nd ON nd.RaporID = n.ID
      WHERE n.ID = @id AND n.Durum = 'Aktif'
    `);
  const header = headerRes.recordset[0] as RaporHeader | undefined;
  if (!header) return null;

  const hizmetRes = await pool.request()
    .input("nkrId", nkrIdNum)
    .input("format", format)
    .query(`
      SELECT
        ISNULL(s.Kod, '')          AS Kod,
        ISNULL(s.Ad, '')           AS Ad,
        ISNULL(s.Akreditasyon, '') AS Akreditasyon,
        ISNULL(s.Method, '')       AS Metot,
        ISNULL(x1.Birim, ISNULL(s.Matriks, '')) AS Birim,
        x1.[Limit]                  AS LimitDeger,
        ISNULL(s.LOQ, '')          AS LOQ,
        x1.Sonuc                    AS Sonuc,
        x1.Degerlendirme            AS Degerlendirme,
        CONVERT(varchar(10), x1.Termin, 23) AS Termin
      FROM NumuneX1 x1
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE x1.RaporID = @nkrId
        AND s.RaporFormati = @format
      ORDER BY s.Kod
    `);
  const hizmetler = hizmetRes.recordset as HizmetRow[];

  // Test başlangıç ve bitiş tarihi (min/max termin)
  const terminTarihler = hizmetler
    .map((h) => h.Termin)
    .filter((t): t is string => !!t)
    .sort();
  const testBaslangic = terminTarihler[0] || null;
  const testBitis = terminTarihler[terminTarihler.length - 1] || null;

  // ───── Onay bilgisi ─────
  let onay: OnayInfo | null = null;
  const onayTblCheck = await pool.request().query(
    `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo','cosmoroot')`,
  );
  if (onayTblCheck.recordset.length > 0) {
    const onayRes = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .query(`
        SELECT o.KarekodToken, o.Durum, o.OnayTarihi, o.YayinTarihi, o.YayinUrl,
               ISNULL(o.OnaylayanAd, '') AS OnaylayanAd,
               ''                  AS OnaylayanSoyad
        FROM NKR_RaporOnay o
        WHERE o.NkrID = @nkrId AND o.RaporFormati = @format
      `);
    const r = onayRes.recordset[0];
    if (r) {
      const ad = String(r.OnaylayanAd ?? "").trim();
      const soyad = String(r.OnaylayanSoyad ?? "").trim();
      onay = {
        token: r.KarekodToken,
        durum: r.Durum,
        onayTarihi: r.OnayTarihi,
        yayinTarihi: r.YayinTarihi,
        yayinUrl: r.YayinUrl,
        onaylayanAd: [ad, soyad].filter(Boolean).join(" ") || null,
      };
    }
  }

  // ───── Karekod (QR) + dijital imza ─────
  let karekod: KarekodInfo | null = null;
  if (onay?.token) {
    const dogrulamaBase = (process.env.NEXT_PUBLIC_DOGRULAMA_URL || "https://uniqueanalyse.com").replace(/\/+$/, "");
    const dogrulamaUrl = `${dogrulamaBase}/rapordogrulama/${onay.token}`;

    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(dogrulamaUrl, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
    } catch {
      qrDataUrl = "";
    }

    let imzaHash: string | null = null;
    try {
      if (await imzaColumnExists(pool)) {
        const ih = await pool.request()
          .input("nkrId", nkrIdNum)
          .input("format", format)
          .query(`SELECT ID, ImzaHash FROM NKR_RaporOnay WHERE NkrID = @nkrId AND RaporFormati = @format`);
        const row = ih.recordset[0];
        imzaHash = row?.ImzaHash ? String(row.ImzaHash) : null;
        // Self-heal: onaylı ama imzasız eski raporu burada imzala.
        if (!imzaHash && row?.ID) {
          imzaHash = await imzalaVeKaydet(pool, row.ID, nkrIdNum, format);
        }
      }
    } catch {
      imzaHash = null;
    }

    karekod = { url: dogrulamaUrl, qrDataUrl, imzaHash };
  }

  const sirketAdi = process.env.SIRKET_ADI || "UNIQUE Analiz Belgelendirme ve Gözetim Hizmetleri Ltd. Şti.";

  const yayinTarihi = onay?.yayinTarihi
    ? fmtDate(onay.yayinTarihi)
    : onay?.onayTarihi
      ? fmtDate(onay.onayTarihi)
      : "—";

  const meta: RaporMeta = {
    revNo: "0",
    kabulTarihi: fmtDate(header.Tarih),
    yayinTarihi,
    hazirlayanAd: process.env.RAPOR_HAZIRLAYAN || "Büşra ALBAYRAK",
    hazirlayanUnvan: process.env.RAPOR_HAZIRLAYAN_UNVAN || "Raportör",
    onaylayanAd: onay?.onaylayanAd || process.env.RAPOR_ONAYLAYAN || "Alaettin ÖZDEMİR",
    onaylayanUnvan: process.env.RAPOR_ONAYLAYAN_UNVAN || "Laboratuvar Müdürü",
    docKodu: process.env.RAPOR_DOC_KODU || "Ek-1.PR.20 Yayın Tarihi: 27.09.2023   Revizyon Tarih / No: 25.11.2024 / 01",
    sirketAdi,
  };

  return { header, hizmetler, testBaslangic, testBitis, onay, meta, karekod };
}
