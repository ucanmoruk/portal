import { cosmoPool } from "@/lib/db";
import QRCode from "qrcode";
import type { HizmetRow, RaporHeader, OnayInfo, KarekodInfo } from "@/app/rapor-onay-print/[nkrId]/reportTypes";
import { imzaColumnExists, imzalaVeKaydet } from "@/lib/raporImzaData";
import { loadBilesenSonuclar } from "@/lib/altParametre";
import { applyRaporEdit, loadRaporEdit } from "@/lib/raporDuzenleme";
import { baseReportFormat } from "@/lib/raporFormatLanguage";

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
  /** Revize açıklaması — revize edilmiş raporlarda (revNo > 0) gösterilir. */
  revizeNot?: string | null;
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
export async function loadRaporViewData(nkrIdNum: number, format: string, editFormat = format): Promise<RaporViewData | null> {
  const pool = await cosmoPool;

  const headerRes = await pool.request()
    .input("id", nkrIdNum)
    .query(`
      SELECT
        n.ID AS NkrID,
        n.RaporNo,
        n.Revno,
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
        s.ID                       AS AnalizID,
        x1.ID                      AS X1ID,
        ISNULL(s.Kod, '')          AS Kod,
        ISNULL(s.Ad, '')           AS Ad,
        ISNULL(s.AdEn, '')         AS AdEn,
        ISNULL(s.Akreditasyon, '') AS Akreditasyon,
        ISNULL(s.Method, '')       AS Metot,
        ISNULL(s.MethodEn, '')     AS MetotEn,
        ISNULL(x1.Birim, ISNULL(s.BirimText, '')) AS Birim,
        ISNULL(x1.BirimEn, ISNULL(s.BirimEn, '')) AS BirimEn,
        x1.[Limit]                  AS LimitDeger,
        ISNULL(x1.LimitEn, ISNULL(s.LimitEn, '')) AS LimitEn,
        ISNULL(s.LOQ, '')          AS LOQ,
        ISNULL(x1.LOQEn, ISNULL(s.LOQEn, '')) AS LOQEn,
        x1.Sonuc                    AS Sonuc,
        x1.SonucEn                  AS SonucEn,
        x1.Degerlendirme            AS Degerlendirme,
        x1.DegerlendirmeEn          AS DegerlendirmeEn,
        CONVERT(varchar(10), x1.Termin, 23) AS Termin
      FROM NumuneX1 x1
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE x1.RaporID = @nkrId
        AND COALESCE(NULLIF(s.RaporFormati, ''), N'Genel') = @format
      ORDER BY s.Kod
    `);
  const hizmetler = hizmetRes.recordset as HizmetRow[];

  // ───── Alt parametreler (bileşenler) — katalog + girilen sonuçlar ─────
  // Her hizmetin bileşenlerini (X1ID bazında girilen Sonuç/Değerlendirme ile) yükle.
  const altMap = await loadBilesenSonuclar(
    pool,
    hizmetler.map((h) => ({ x1Id: Number(h.X1ID), analizId: Number(h.AnalizID) })),
  );
  for (const h of hizmetler) {
    h.altParametreler = (altMap[String(h.X1ID)] || []) as HizmetRow["altParametreler"];
  }

  // ───── Onay bilgisi ─────
  let onay: OnayInfo | null = null;
  const onayTblCheck = await pool.request().query(
    `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo','cosmoroot')`,
  );
  if (onayTblCheck.recordset.length > 0) {
    // Migration 018: DisRaporKodu kolonu — yoksa NULL döner (eski şema graceful degrade)
    const disKodCol = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'NKR_RaporOnay' AND COLUMN_NAME = 'DisRaporKodu'`
    );
    const hasDisKod = disKodCol.recordset.length > 0;
    const baseEditFormat = baseReportFormat(editFormat);
    const onayRes = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", editFormat)
      .input("baseFormat", baseEditFormat)
      .query(`
        SELECT o.RaporFormati AS OnayRaporFormati,
               o.KarekodToken, o.Durum, o.OnayTarihi, o.YayinTarihi, o.YayinUrl,
               ISNULL(o.OnaylayanAd, '') AS OnaylayanAd,
               ''                  AS OnaylayanSoyad,
               ISNULL(o.Notlar, '') AS Notlar,
               ${hasDisKod ? "o.DisRaporKodu" : "CAST(NULL AS NVARCHAR(40)) AS DisRaporKodu"}
        FROM NKR_RaporOnay o
        WHERE o.NkrID = @nkrId
          AND (
            UPPER(REPLACE(o.RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
            OR UPPER(REPLACE(o.RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@baseFormat, N'Ü', N'U'))
          )
        ORDER BY
          CASE
            WHEN UPPER(REPLACE(o.RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U')) THEN 0
            ELSE 1
          END,
          o.ID DESC
      `);
    const r = onayRes.recordset[0];
    if (r) {
      const ad = String(r.OnaylayanAd ?? "").trim();
      const soyad = String(r.OnaylayanSoyad ?? "").trim();
      const exactOnayFormat =
        String(r.OnayRaporFormati ?? "").trim().toLocaleUpperCase("tr-TR") ===
        String(editFormat ?? "").trim().toLocaleUpperCase("tr-TR");
      const usingBaseApprovalFallback = baseReportFormat(editFormat) !== editFormat && !exactOnayFormat;
      onay = {
        token: r.KarekodToken,
        durum: usingBaseApprovalFallback && r.Durum === "Yayınlandı" ? "Onaylandı" : r.Durum,
        onayTarihi: r.OnayTarihi,
        yayinTarihi: r.YayinTarihi,
        yayinUrl: usingBaseApprovalFallback ? null : r.YayinUrl,
        onaylayanAd: [ad, soyad].filter(Boolean).join(" ") || null,
        disRaporKodu: r.DisRaporKodu ?? null,
        notlar: (r.Notlar ?? "").toString().trim() || null,
      };
    }
  }

  // ───── Karekod (QR) + dijital imza ─────
  // Yeni doğrulama sistemi: https://dogrulama.uniqueanalyse.com/
  // URL şu üç parçayı taşır:
  //   t = KarekodToken (gerçek auth)
  //   r = Rapor numarası (dış kod öncelikli, yoksa iç kod)
  //   k = 8 karakterlik doğrulama kodu (QR altında müşteriye gösterilir, manuel girişte de kullanılır)
  // Ek olarak rastgele decoy param eklenir → URL fingerprinting/tracking zorlaşır.
  // Müşteri QR okuduğunda doğrulama sayfası bu üçünü otomatik doldurur; sadece "Doğrula"ya basar.
  let karekod: KarekodInfo | null = null;
  if (onay?.token) {
    const dogrulamaBase = (process.env.NEXT_PUBLIC_DOGRULAMA_URL || "https://dogrulama.uniqueanalyse.com").replace(/\/+$/, "");

    // Doğrulama kodu: token'dan ilk 8 alfasayısal karakter, karışıklık önleyici filtre (I,L,O,0,1 yok), büyük harf.
    const dogrulamaKod = onay.token
      .replace(/[^A-Z0-9]/gi, "")
      .replace(/[ILO01]/gi, "")
      .toUpperCase()
      .slice(0, 8)
      .padEnd(8, "X");

    const raporNoForVerify = onay.disRaporKodu || header.RaporNo || "";

    // Decoy: her render'da değişen rastgele param — URL fingerprinting'i zorlaştırır.
    const decoy = Math.random().toString(36).slice(2, 12);
    // Doğrulama sitesi paramları:
    //   raporNo → Rapor numarası alanına yazılır (form auto-fill)
    //   token   → Doğrulama Kodu alanına yazılır (8 karakter, insan-okunur)
    //   auth    → 24 karakter tam KarekodToken — form'a yansıtılmaz, backend güçlü
    //             auth katmanı (brute-force koruması). Manuel girişte kullanılmaz.
    //   v       → decoy/anti-tracking
    const params = new URLSearchParams({
      raporNo: raporNoForVerify,
      token: dogrulamaKod,
      auth: onay.token,
      v: decoy,
    });
    const dogrulamaUrl = `${dogrulamaBase}/?${params.toString()}`;

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
          .input("format", editFormat)
          .input("baseFormat", baseReportFormat(editFormat))
          .query(`
            SELECT TOP 1 ID, ImzaHash
            FROM NKR_RaporOnay
            WHERE NkrID = @nkrId
              AND (
                UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
                OR UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@baseFormat, N'Ü', N'U'))
              )
            ORDER BY
              CASE
                WHEN UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U')) THEN 0
                ELSE 1
              END,
              ID DESC
          `);
        const row = ih.recordset[0];
        imzaHash = row?.ImzaHash ? String(row.ImzaHash) : null;
        // Self-heal: onaylı ama imzasız eski raporu burada imzala.
        if (!imzaHash && row?.ID) {
          imzaHash = await imzalaVeKaydet(pool, row.ID, nkrIdNum, editFormat);
        }
      }
    } catch {
      imzaHash = null;
    }

    karekod = { url: dogrulamaUrl, qrDataUrl, imzaHash, dogrulamaKod, raporNoForVerify };
  }

  const sirketAdi = process.env.SIRKET_ADI || "UNIQUE Analiz Belgelendirme ve Gözetim Hizmetleri Ltd. Şti.";

  // Yayın tarihi: onay yoksa raporun yazdırıldığı günün tarihi gösterilir.
  // Sıra: (1) gerçek yayın tarihi  (2) onay tarihi  (3) bugün
  const yayinTarihi = onay?.yayinTarihi
    ? fmtDate(onay.yayinTarihi)
    : onay?.onayTarihi
      ? fmtDate(onay.onayTarihi)
      : fmtDate(new Date());

  // Analiz Periyodu: Numune Kabul Tarihi → Rapor Onay Tarihi
  // Onay henüz yoksa raporun yazdırıldığı gün son tarih olur (önizleme tutarlılığı).
  // PDF formatter'ları "YYYY-MM-DD" prefix bekliyor — Date objesini ISO'ya çevir.
  const toIsoDate = (d: unknown): string | null => {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const s = String(d);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const parsed = new Date(s);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  };
  const testBaslangic: string | null = toIsoDate(header.Tarih);
  const testBitis: string | null = toIsoDate(onay?.onayTarihi) ?? toIsoDate(new Date());

  const revNoStr = header.Revno != null && String(header.Revno).trim() !== ""
    ? String(header.Revno).trim()
    : "0";
  const meta: RaporMeta = {
    revNo: revNoStr,
    revizeNot: (parseInt(revNoStr, 10) || 0) > 0 ? (onay?.notlar ?? null) : null,
    kabulTarihi: fmtDate(header.Tarih),
    yayinTarihi,
    hazirlayanAd: process.env.RAPOR_HAZIRLAYAN || "Büşra ALBAYRAK",
    hazirlayanUnvan: process.env.RAPOR_HAZIRLAYAN_UNVAN || "Raportör",
    onaylayanAd: onay?.onaylayanAd || process.env.RAPOR_ONAYLAYAN || "Alaettin ÖZDEMİR",
    onaylayanUnvan: process.env.RAPOR_ONAYLAYAN_UNVAN || "Laboratuvar Müdürü",
    docKodu: process.env.RAPOR_DOC_KODU || "Ek-1.PR.20 Yayın Tarihi: 27.09.2023   Revizyon Tarih / No: 25.11.2024 / 01",
    sirketAdi,
  };

  const data = { header, hizmetler, testBaslangic, testBitis, onay, meta, karekod };
  try {
    const edit = await loadRaporEdit(pool, nkrIdNum, editFormat);
    return applyRaporEdit(data, edit.payload);
  } catch {
    return data;
  }
}
