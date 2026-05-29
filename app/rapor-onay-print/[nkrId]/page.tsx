import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import poolPromise from "@/lib/db";
import type { ComponentType } from "react";
import GenelReport from "./formats/GenelReport";
import type { HizmetRow, RaporHeader, OnayInfo, ReportFormatProps } from "./reportTypes";

export const metadata = { title: "Analiz Raporu — Onay Önizleme" };

// Rapor türüne göre format bileşeni. Yeni format eklemek için formats/ altında
// bir bileşen oluşturup buraya kaydetmek yeterli.
const FORMAT_COMPONENTS: Record<string, ComponentType<ReportFormatProps>> = {
  Genel: GenelReport,
};

function resolveFormatComponent(format: string): ComponentType<ReportFormatProps> {
  return FORMAT_COMPONENTS[format] ?? GenelReport;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(dt.getTime())) return String(d);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${dt.getFullYear()}`;
  } catch { return String(d); }
}

export default async function RaporOnayPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ nkrId: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { nkrId } = await params;
  const sp = await searchParams;
  const format = (sp.format || "").trim();
  const nkrIdNum = parseInt(nkrId, 10);

  if (!Number.isFinite(nkrIdNum) || !format) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Geçersiz rapor / format.</div>;
  }

  const pool = await poolPromise;

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
      LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
      LEFT JOIN NumuneDetay   nd ON nd.RaporID = n.ID
      WHERE n.ID = @id AND n.Durum = 'Aktif'
    `);
  const header = headerRes.recordset[0] as RaporHeader | undefined;
  if (!header) {
    return <div style={{ padding: 40, fontFamily: "system-ui" }}>Rapor bulunamadı.</div>;
  }

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
    .map(h => h.Termin)
    .filter((t): t is string => !!t)
    .sort();
  const testBaslangic = terminTarihler[0] || null;
  const testBitis = terminTarihler[terminTarihler.length - 1] || null;

  let onay: OnayInfo | null = null;
  const onayTblCheck = await pool.request().query(
    `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
  );
  if (onayTblCheck.recordset.length > 0) {
    const onayRes = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .query(`
        SELECT o.KarekodToken, o.Durum, o.OnayTarihi, o.YayinTarihi, o.YayinUrl,
               ISNULL(u.Ad, '')    AS OnaylayanAd,
               ISNULL(u.Soyad, '') AS OnaylayanSoyad
        FROM NKR_RaporOnay o
        LEFT JOIN RootKullanici u ON u.ID = o.OnaylayanID
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

  const sirketAdi = process.env.SIRKET_ADI || "UNIQUE Analiz Belgelendirme ve Gözetim Hizmetleri Ltd. Şti.";

  // ───── Üst meta + imza değerleri ─────
  const yayinTarihi = onay?.yayinTarihi
    ? fmtDate(onay.yayinTarihi)
    : onay?.onayTarihi
      ? fmtDate(onay.onayTarihi)
      : "—";

  const meta = {
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

  const ReportComponent = resolveFormatComponent(format);

  return (
    <ReportComponent
      nkrId={nkrIdNum}
      format={format}
      header={header}
      hizmetler={hizmetler}
      testBaslangic={testBaslangic}
      testBitis={testBitis}
      onay={onay}
      meta={meta}
    />
  );
}
