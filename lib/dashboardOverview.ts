import { cosmoPool } from "@/lib/db";

export interface DashboardMetric {
  label: string;
  value: string;
  sub: string;
  color: string;
}

export interface RankedMetric {
  label: string;
  sub?: string;
  value: number;
  amount?: number;
}

export interface MonthlyRevenueMetric {
  month: string;
  label: string;
  amount: number;
  invoiceCount: number;
  paidAmount: number;
  unpaidAmount: number;
  unpaidInvoiceCount: number;
}

export interface MonthlySampleGroupMetric {
  month: number;
  label: string;
  ozel: number;
  kd: number;
}

/** Ciro/tahsilat ozeti. paid + unpaid = amount (kaynakta clamp edilir). */
export interface RevenueTotals {
  amount: number;
  paid: number;
  unpaid: number;
  invoiceCount: number;
  unpaidInvoiceCount: number;
}

export interface DashboardOverview {
  cards: DashboardMetric[];
  monthlyRevenue: MonthlyRevenueMetric[];
  monthlySampleGroups: MonthlySampleGroupMetric[];
  sampleYears: number[];
  selectedSampleYear: number;
  /** monthlyRevenue satirlarinin toplami — grafikteki cubuklarla birebir tutar. */
  revenueTotals: RevenueTotals;
  topTestsThisMonth: RankedMetric[];
  topTestsLastYear: RankedMetric[];
  topRevenueFirms: RankedMetric[];
  topSampleFirms: RankedMetric[];
  followUpFirms: RankedMetric[];
  error?: string;
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

function count(value: unknown) {
  return Number(value || 0).toLocaleString("tr-TR");
}

function pct(current: number, previous: number) {
  if (!previous && !current) return "Gecen ay veri yok";
  if (!previous) return "Gecen aya gore yeni";
  const diff = ((current - previous) / previous) * 100;
  const sign = diff > 0 ? "+" : "";
  return `Gecen ay: ${count(previous)} (${sign}${diff.toFixed(1)}%)`;
}

function moneyPct(current: number, previous: number) {
  if (!previous && !current) return "Gecen ay veri yok";
  if (!previous) return "Gecen aya gore yeni";
  const diff = ((current - previous) / previous) * 100;
  const sign = diff > 0 ? "+" : "";
  return `Gecen ay: ${money(previous)} (${sign}${diff.toFixed(1)}%)`;
}

function mapRank(
  rows: Array<Record<string, unknown>>,
  labelKey: string,
  valueKey: string,
  subKey?: string,
  amountKey?: string,
): RankedMetric[] {
  return rows.map((row) => ({
    label: String(row[labelKey] || "-"),
    sub: subKey ? String(row[subKey] || "") : undefined,
    value: Number(row[valueKey] || 0),
    amount: amountKey ? Number(row[amountKey] || 0) : undefined,
  }));
}

export async function getDashboardOverview(selectedRevenueMonth?: string, selectedSampleYear = 2026): Promise<DashboardOverview> {
  try {
    const pool = await cosmoPool;
    const invoiceDate = `COALESCE(NULLIF(f.Tarih, '0000-00-00 00:00:00'), (SELECT MAX(fd.Tarih) FROM FaturaDetay fd WHERE fd.ProformaNo = f.ProformaNo))`;

    // Tahsilat: Fatura.Odenen_Tutar (fatura-takip ozet satiriyla ayni kaynak).
    // Birkac kayitta Odenen_Tutar > Toplam oldugu icin clamp'lenir; boylece
    // HER ZAMAN odenen + odenmeyen = ciro olur ve grafikteki yigin sasmaz.
    const invoiceTotal = `IFNULL(f.Toplam, 0)`;
    const paidExpr = `LEAST(IFNULL(f.Odenen_Tutar, 0), ${invoiceTotal})`;
    const unpaidExpr = `GREATEST(${invoiceTotal} - IFNULL(f.Odenen_Tutar, 0), 0)`;
    // 1 kurustan buyuk acik = tahsil edilmemis fatura (kayan nokta toleransi).
    const unpaidFlag = `CASE WHEN ${invoiceTotal} - IFNULL(f.Odenen_Tutar, 0) > 0.005 THEN 1 ELSE 0 END`;
    const safeRevenueMonth = selectedRevenueMonth && /^\d{4}-\d{2}$/.test(selectedRevenueMonth)
      ? selectedRevenueMonth
      : "";
    const revenueMonthFilter = safeRevenueMonth
      ? `AND DATE_FORMAT(${invoiceDate}, '%Y-%m') = '${safeRevenueMonth}'`
      : "";
    const safeSampleYear = Number.isInteger(selectedSampleYear) && selectedSampleYear >= 2000 && selectedSampleYear <= 2100
      ? selectedSampleYear
      : 2026;

    const invoiceRes = await pool.request().query(`
      SELECT
        SUM(CASE WHEN ${invoiceDate} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                  AND ${invoiceDate} < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                 THEN 1 ELSE 0 END) AS ThisMonthCount,
        SUM(CASE WHEN ${invoiceDate} >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                  AND ${invoiceDate} < DATE_FORMAT(CURDATE(), '%Y-%m-01')
                 THEN 1 ELSE 0 END) AS PrevMonthCount,
        SUM(CASE WHEN ${invoiceDate} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                  AND ${invoiceDate} < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                 THEN IFNULL(f.Toplam, 0) ELSE 0 END) AS ThisMonthTotal,
        SUM(CASE WHEN ${invoiceDate} >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                  AND ${invoiceDate} < DATE_FORMAT(CURDATE(), '%Y-%m-01')
                 THEN IFNULL(f.Toplam, 0) ELSE 0 END) AS PrevMonthTotal,
        SUM(CASE WHEN ${invoiceDate} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                  AND ${invoiceDate} < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                 THEN ${paidExpr} ELSE 0 END) AS ThisMonthPaid,
        SUM(CASE WHEN ${invoiceDate} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                  AND ${invoiceDate} < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                 THEN ${unpaidExpr} ELSE 0 END) AS ThisMonthUnpaid,
        SUM(CASE WHEN ${invoiceDate} >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                  AND ${invoiceDate} < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                 THEN ${unpaidFlag} ELSE 0 END) AS ThisMonthUnpaidCount
      FROM Fatura f
      WHERE f.Durum = 'Aktif'
    `);

    const sampleStatsRes = await pool.request().query(`
      SELECT
        SUM(CASE WHEN n.Tarih >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                  AND n.Tarih < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                 THEN 1 ELSE 0 END) AS ThisMonthSamples,
        SUM(CASE WHEN n.Tarih >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                  AND n.Tarih < DATE_FORMAT(CURDATE(), '%Y-%m-01')
                 THEN 1 ELSE 0 END) AS PrevMonthSamples,
        COUNT(DISTINCT CASE WHEN n.Tarih >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                              AND n.Tarih < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                             THEN n.Firma_ID END) AS ThisMonthFirms,
        COUNT(DISTINCT CASE WHEN n.Tarih >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                              AND n.Tarih < DATE_FORMAT(CURDATE(), '%Y-%m-01')
                             THEN n.Firma_ID END) AS PrevMonthFirms
      FROM NKR n
      WHERE n.Durum = 'Aktif'
    `);

    const businessStatsRes = await pool.request().query(`
      SELECT
        COUNT(DISTINCT CASE WHEN YEAR(n.Tarih) = 2025 THEN n.Firma_ID END) AS ActiveCustomers2025,
        COUNT(DISTINCT CASE WHEN YEAR(n.Tarih) = 2026 THEN n.Firma_ID END) AS ActiveCustomers2026,
        COUNT(CASE WHEN YEAR(n.Tarih) = 2026 THEN n.ID END) AS Reports2026,
        COUNT(CASE WHEN YEAR(n.Tarih) = 2026 AND MONTH(n.Tarih) = 7 THEN n.ID END) AS ReportsJuly2026
      FROM NKR n
      WHERE n.Durum = 'Aktif'
        AND n.Firma_ID IS NOT NULL
    `);

    const topTestsThisMonthRes = await pool.request().query(`
      SELECT
        IFNULL(s.Kod, '') AS Kod,
        IFNULL(s.Ad, '') AS Ad,
        COUNT(*) AS Adet
      FROM NumuneX1 x1
      INNER JOIN NKR n ON n.ID = x1.RaporID
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE n.Durum = 'Aktif'
        AND n.Tarih >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND n.Tarih < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
      GROUP BY s.ID, s.Kod, s.Ad
      ORDER BY Adet DESC
      LIMIT 10
    `);

    const topTestsLastYearRes = await pool.request().query(`
      SELECT
        IFNULL(s.Kod, '') AS Kod,
        IFNULL(s.Ad, '') AS Ad,
        COUNT(*) AS Adet
      FROM NumuneX1 x1
      INNER JOIN NKR n ON n.ID = x1.RaporID
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE n.Durum = 'Aktif'
        AND n.Tarih >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
      GROUP BY s.ID, s.Kod, s.Ad
      ORDER BY Adet DESC
      LIMIT 10
    `);

    const monthlyRevenueRes = await pool.request().query(`
      SELECT
        DATE_FORMAT(${invoiceDate}, '%Y-%m') AS Ay,
        DATE_FORMAT(${invoiceDate}, '%m.%Y') AS Etiket,
        COUNT(*) AS FaturaAdet,
        SUM(IFNULL(f.Toplam, 0)) AS Ciro,
        SUM(${paidExpr}) AS Odenen,
        SUM(${unpaidExpr}) AS Odenmeyen,
        SUM(${unpaidFlag}) AS AcikFaturaAdet
      FROM Fatura f
      WHERE f.Durum = 'Aktif'
        AND ${invoiceDate} >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)
        AND ${invoiceDate} < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
      GROUP BY DATE_FORMAT(${invoiceDate}, '%Y-%m'), DATE_FORMAT(${invoiceDate}, '%m.%Y')
      ORDER BY Ay ASC
    `);

    const [monthlySampleGroupsRes, sampleYearsRes] = await Promise.all([
      pool.request().query(`
        SELECT MONTH(n.Tarih) AS Ay,
          SUM(CASE WHEN TRIM(n.Grup) = 'Özel' THEN 1 ELSE 0 END) AS Ozel,
          SUM(CASE WHEN TRIM(n.Grup) = 'K.D.' THEN 1 ELSE 0 END) AS KD
        FROM NKR n
        WHERE n.Durum = 'Aktif' AND YEAR(n.Tarih) = ${safeSampleYear}
          AND TRIM(n.Grup) IN ('Özel', 'K.D.')
        GROUP BY MONTH(n.Tarih)
        ORDER BY Ay
      `),
      pool.request().query(`
        SELECT DISTINCT YEAR(n.Tarih) AS Yil
        FROM NKR n
        WHERE n.Durum = 'Aktif' AND n.Tarih IS NOT NULL
        ORDER BY Yil DESC
      `),
    ]);

    const topRevenueRes = await pool.request().query(`
      SELECT
        IFNULL(fr.Firma_Adi, 'Firmasiz') AS FirmaAdi,
        COUNT(*) AS FaturaAdet,
        SUM(IFNULL(f.Toplam, 0)) AS Ciro
      FROM Fatura f
      LEFT JOIN Firma fr ON fr.ID = f.FaturaFirmaID
      WHERE f.Durum = 'Aktif'
        ${revenueMonthFilter}
      GROUP BY fr.ID, fr.Firma_Adi
      ORDER BY Ciro DESC
      LIMIT 10
    `);

    const topSampleRes = await pool.request().query(`
      SELECT
        IFNULL(fr.Firma_Adi, 'Firmasiz') AS FirmaAdi,
        COUNT(*) AS NumuneAdet
      FROM NKR n
      LEFT JOIN Firma fr ON fr.ID = n.Firma_ID
      WHERE n.Durum = 'Aktif'
      GROUP BY fr.ID, fr.Firma_Adi
      ORDER BY NumuneAdet DESC
      LIMIT 10
    `);

    const followUpFirmsRes = await pool.request().query(`
      SELECT
        IFNULL(fr.Firma_Adi, 'Firmasiz') AS FirmaAdi,
        COUNT(n.ID) AS NumuneAdet,
        DATE_FORMAT(MAX(n.Tarih), '%d.%m.%Y') AS SonNumune
      FROM NKR n
      LEFT JOIN Firma fr ON fr.ID = n.Firma_ID
      WHERE n.Durum = 'Aktif'
        AND n.Firma_ID IS NOT NULL
      GROUP BY fr.ID, fr.Firma_Adi
      HAVING MAX(n.Tarih) < DATE_SUB(CURDATE(), INTERVAL 90 DAY)
      ORDER BY NumuneAdet DESC
      LIMIT 10
    `);

    const invoice = invoiceRes.recordset[0] || {};
    const thisMonthCount = Number(invoice.ThisMonthCount || 0);
    const prevMonthCount = Number(invoice.PrevMonthCount || 0);
    const thisMonthTotal = Number(invoice.ThisMonthTotal || 0);
    const prevMonthTotal = Number(invoice.PrevMonthTotal || 0);
    const thisMonthPaid = Number(invoice.ThisMonthPaid || 0);
    const thisMonthUnpaid = Number(invoice.ThisMonthUnpaid || 0);
    const thisMonthUnpaidCount = Number(invoice.ThisMonthUnpaidCount || 0);
    const sampleStats = sampleStatsRes.recordset[0] || {};
    const thisMonthSamples = Number(sampleStats.ThisMonthSamples || 0);
    const prevMonthSamples = Number(sampleStats.PrevMonthSamples || 0);
    const thisMonthFirms = Number(sampleStats.ThisMonthFirms || 0);
    const prevMonthFirms = Number(sampleStats.PrevMonthFirms || 0);
    const businessStats = businessStatsRes.recordset[0] || {};
    const activeCustomers2025 = Number(businessStats.ActiveCustomers2025 || 0);
    const activeCustomers2026 = Number(businessStats.ActiveCustomers2026 || 0);
    const reports2026 = Number(businessStats.Reports2026 || 0);
    const reportsJuly2026 = Number(businessStats.ReportsJuly2026 || 0);
    const elapsedMonths2026 = new Date().getFullYear() === 2026
      ? new Date().getMonth() + 1
      : 12;
    const monthlyReportAverage2026 = reports2026 / Math.max(1, elapsedMonths2026);

    const monthlyRevenue: MonthlyRevenueMetric[] = monthlyRevenueRes.recordset.map(
      (row: Record<string, unknown>) => ({
        month: String(row.Ay || ""),
        label: String(row.Etiket || ""),
        amount: Number(row.Ciro || 0),
        invoiceCount: Number(row.FaturaAdet || 0),
        paidAmount: Number(row.Odenen || 0),
        unpaidAmount: Number(row.Odenmeyen || 0),
        unpaidInvoiceCount: Number(row.AcikFaturaAdet || 0),
      }),
    );
    const sampleByMonth = new Map(monthlySampleGroupsRes.recordset.map((row: Record<string, unknown>) => [Number(row.Ay), row]));
    const monthLabels = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    const monthlySampleGroups: MonthlySampleGroupMetric[] = monthLabels.map((label, index) => {
      const row = sampleByMonth.get(index + 1) as Record<string, unknown> | undefined;
      return { month: index + 1, label, ozel: Number(row?.Ozel || 0), kd: Number(row?.KD || 0) };
    });

    // "Genel" ozet = grafikte gorunen aylarin toplami. Ayri bir sorgu yerine
    // satirlardan toplanir ki ust seritteki rakam cubuklarla asla celismesin.
    const revenueTotals: RevenueTotals = monthlyRevenue.reduce<RevenueTotals>(
      (acc, row) => ({
        amount: acc.amount + row.amount,
        paid: acc.paid + row.paidAmount,
        unpaid: acc.unpaid + row.unpaidAmount,
        invoiceCount: acc.invoiceCount + row.invoiceCount,
        unpaidInvoiceCount: acc.unpaidInvoiceCount + row.unpaidInvoiceCount,
      }),
      { amount: 0, paid: 0, unpaid: 0, invoiceCount: 0, unpaidInvoiceCount: 0 },
    );

    return {
      cards: [
        {
          label: "Bu Ay Fatura Adedi",
          value: count(thisMonthCount),
          sub: pct(thisMonthCount, prevMonthCount),
          color: "#0071e3",
        },
        {
          label: "Bu Ay Numune Adedi",
          value: count(thisMonthSamples),
          sub: pct(thisMonthSamples, prevMonthSamples),
          color: "#ff9f0a",
        },
        {
          label: "Bu Ay Fatura Toplami",
          value: money(thisMonthTotal),
          sub: moneyPct(thisMonthTotal, prevMonthTotal),
          color: "#30d158",
        },
        {
          label: "Bu Ay Numune Gonderen Firma",
          value: count(thisMonthFirms),
          sub: pct(thisMonthFirms, prevMonthFirms),
          color: "#bf5af2",
        },
        {
          label: "2025 Aktif Musteri",
          value: count(activeCustomers2025),
          sub: "2025 icinde numune gonderen firma",
          color: "#5ac8fa",
        },
        {
          label: "2026 Aktif Musteri",
          value: count(activeCustomers2026),
          sub: activeCustomers2025
            ? `2025'e gore ${activeCustomers2026 >= activeCustomers2025 ? "+" : ""}${(((activeCustomers2026 - activeCustomers2025) / activeCustomers2025) * 100).toFixed(1)}%`
            : "2025 karsilastirma verisi yok",
          color: "#34c759",
        },
        {
          label: "2026 Aylik Rapor Ort.",
          value: monthlyReportAverage2026.toLocaleString("tr-TR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
          sub: `${elapsedMonths2026} aylik ortalama`,
          color: "#ff9500",
        },
        {
          label: "Temmuz 2026 Rapor Adedi",
          value: count(reportsJuly2026),
          sub: "Sadece Temmuz ayindaki raporlar",
          color: "#af52de",
        },
        {
          label: "Bu Ay Tahsil Edilen",
          value: money(thisMonthPaid),
          sub: thisMonthTotal
            ? `Bu ayin %${((thisMonthPaid / thisMonthTotal) * 100).toFixed(1)} tahsil edildi`
            : "Bu ay fatura yok",
          color: "#30d158",
        },
        {
          label: "Bu Ay Acik Bakiye",
          value: money(thisMonthUnpaid),
          sub: thisMonthUnpaidCount
            ? `${count(thisMonthUnpaidCount)} fatura tahsil bekliyor`
            : "Bu ayin tamami tahsil edildi",
          color: "#ff375f",
        },
      ],
      monthlyRevenue,
      monthlySampleGroups,
      sampleYears: sampleYearsRes.recordset.map((row: Record<string, unknown>) => Number(row.Yil)).filter(Boolean),
      selectedSampleYear: safeSampleYear,
      revenueTotals,
      topTestsThisMonth: mapRank(topTestsThisMonthRes.recordset, "Ad", "Adet", "Kod"),
      topTestsLastYear: mapRank(topTestsLastYearRes.recordset, "Ad", "Adet", "Kod"),
      topRevenueFirms: mapRank(topRevenueRes.recordset, "FirmaAdi", "FaturaAdet", undefined, "Ciro"),
      topSampleFirms: mapRank(topSampleRes.recordset, "FirmaAdi", "NumuneAdet"),
      followUpFirms: mapRank(followUpFirmsRes.recordset, "FirmaAdi", "NumuneAdet", "SonNumune"),
    };
  } catch (e: unknown) {
    return {
      cards: [],
      monthlyRevenue: [],
      monthlySampleGroups: [],
      sampleYears: [],
      selectedSampleYear: 2026,
      revenueTotals: { amount: 0, paid: 0, unpaid: 0, invoiceCount: 0, unpaidInvoiceCount: 0 },
      topTestsThisMonth: [],
      topTestsLastYear: [],
      topRevenueFirms: [],
      topSampleFirms: [],
      followUpFirms: [],
      error: e instanceof Error ? e.message : "Dashboard verileri alinamadi.",
    };
  }
}
