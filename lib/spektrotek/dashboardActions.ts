'use server';

import poolPromise from '@/lib/db';
import { getExchangeRates } from './exchangeRates';

export interface DashboardStats {
  newRequestsCount: number;
  quoteSentCount: number;
  approvedQuotesCount: number;
  totalApprovedValueTRY: number;
  recentActivity: { id: string; type: string; subject: string; date: Date; user: string; status: string; customerName: string }[];
  topProducts: { name: string; count: number; totalValue: number }[];
  highestPricedSales: { customerName: string; total: number; currency: string; quoteNo: number }[];
  monthlyRequestCounts: { month: string; count: number }[];
  rates?: { USD: number; EUR: number; GBP: number };
}

export async function getDashboardStats(year: number): Promise<DashboardStats> {
  try {
    const pool = await poolPromise;
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    const [countResult, totalValueResult, activityResult, productResult, highPriceResult, monthlyResult, rates] =
      await Promise.all([
        pool.request().input('yearStart', yearStart).input('yearEnd', yearEnd).query(`
          SELECT
            SUM(CASE WHEN Durum IN ('Yeni','Yeni Talep') THEN 1 ELSE 0 END) as NewRequests,
            SUM(CASE WHEN Durum='Teklif İletildi' THEN 1 ELSE 0 END) as QuotesSent
          FROM STalepListe WHERE Tarih >= @yearStart AND Tarih <= @yearEnd
        `),
        pool.request().input('yearStart', yearStart).input('yearEnd', yearEnd).query(`
          SELECT ParaBirimi, SUM(Toplam) as TotalAmount, COUNT(*) as Count
          FROM STeklifListe
          WHERE Tarih >= @yearStart AND Tarih <= @yearEnd AND (GenelDurum LIKE '%Onay%')
          GROUP BY ParaBirimi
        `),
        pool.request().query(`
          SELECT TOP 5 T.TalepNo as id, T.Tur as type, T.Kaynak as subject, T.Tarih as date,
                       T.Durum as status, C.Ad as customerName, U.Ad + ' ' + U.Soyad as creatorName
          FROM STalepListe T
          LEFT JOIN RootTedarikci C ON T.FirmaID = C.ID
          LEFT JOIN RootKullanici U ON T.OlusturanID = U.ID
          ORDER BY T.Tarih DESC, T.ID DESC
        `),
        pool.request().input('yearStart', yearStart).input('yearEnd', yearEnd).query(`
          SELECT TOP 5 S.Ad as name, SUM(D.Miktar) as count, SUM(D.GTutar) as totalValue
          FROM STeklifDetay D
          JOIN STeklifListe Q ON D.TeklifID = Q.ID
          JOIN SStokListe S ON D.StokID = S.ID
          WHERE Q.Tarih >= @yearStart AND Q.Tarih <= @yearEnd AND (Q.GenelDurum LIKE '%Onay%')
          GROUP BY S.Ad ORDER BY count DESC
        `),
        pool.request().input('yearStart', yearStart).input('yearEnd', yearEnd).query(`
          SELECT TOP 5 C.Ad as customerName, Q.Toplam as total, Q.ParaBirimi as currency, Q.TeklifNo as quoteNo
          FROM STeklifListe Q
          LEFT JOIN RootTedarikci C ON Q.FirmaID = C.ID
          WHERE Q.Tarih >= @yearStart AND Q.Tarih <= @yearEnd AND (Q.GenelDurum LIKE '%Onay%')
          ORDER BY Q.Toplam DESC
        `),
        pool.request().input('yearStart', yearStart).input('yearEnd', yearEnd).query(`
          SELECT MONTH(Tarih) as MonthNum, COUNT(*) as RequestCount
          FROM STalepListe WHERE Tarih >= @yearStart AND Tarih <= @yearEnd
          GROUP BY MONTH(Tarih) ORDER BY MonthNum
        `),
        getExchangeRates(),
      ]);

    const RATES: Record<string, number> = {
      TRY: 1, TL: 1, 'TURK LIRASI': 1,
      USD: rates.USD, DOLAR: rates.USD, '$': rates.USD,
      EUR: rates.EUR, EURO: rates.EUR, '€': rates.EUR,
      GBP: rates.GBP, STERLIN: rates.GBP, '£': rates.GBP,
    };

    let totalValueTRY = 0;
    let approvedCount = 0;
    for (const row of totalValueResult.recordset as any[]) {
      const currency = (row.ParaBirimi || 'TRY').toUpperCase();
      const rate = RATES[currency] || 1;
      totalValueTRY += (row.TotalAmount || 0) * rate;
      approvedCount  += (row.Count || 0);
    }

    const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    const monthlyData = months.map((m, i) => {
      const found = (monthlyResult.recordset as any[]).find(r => r.MonthNum === i + 1);
      return { month: m, count: found ? found.RequestCount : 0 };
    });

    return {
      newRequestsCount:      countResult.recordset[0].NewRequests   || 0,
      quoteSentCount:        countResult.recordset[0].QuotesSent    || 0,
      approvedQuotesCount:   approvedCount,
      totalApprovedValueTRY: totalValueTRY,
      recentActivity: (activityResult.recordset as any[]).map(r => ({
        id: r.id.toString(), type: r.type || 'Talep', subject: r.subject || '(Konu Yok)',
        date: r.date, user: r.creatorName || 'Sistem', status: r.status, customerName: r.customerName || 'Bilinmiyor',
      })),
      topProducts: (productResult.recordset as any[]).map(r => ({ name: r.name, count: r.count, totalValue: r.totalValue })),
      highestPricedSales: (highPriceResult.recordset as any[]).map(r => ({
        customerName: r.customerName || 'Bilinmiyor', total: r.total, currency: r.currency, quoteNo: r.quoteNo,
      })),
      monthlyRequestCounts: monthlyData,
      rates: { USD: rates.USD, EUR: rates.EUR, GBP: rates.GBP },
    };
  } catch (e) {
    console.error('getDashboardStats error:', e);
    return { newRequestsCount: 0, quoteSentCount: 0, approvedQuotesCount: 0, totalApprovedValueTRY: 0, recentActivity: [], topProducts: [], highestPricedSales: [], monthlyRequestCounts: [] };
  }
}
