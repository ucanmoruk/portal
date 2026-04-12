import Link from 'next/link';
import { getDashboardStats } from '@/lib/spektrotek/dashboardActions';
import styles from './spektrotek.module.css';

export const metadata = { title: 'Spektrotek — Özet' };

export default async function SpektrotekDashboard({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearStr } = await searchParams;
  const currentYear = new Date().getFullYear();
  const selectedYear = yearStr ? parseInt(yearStr) : currentYear;

  const stats = await getDashboardStats(selectedYear);

  const fmt = (val: number, currency = 'TRY') => {
    const map: Record<string, string> = { TL: 'TRY', 'TURK LIRASI': 'TRY', DOLAR: 'USD', EURO: 'EUR', STERLIN: 'GBP' };
    const c = map[currency.toUpperCase()] ?? currency;
    try {
      return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(val);
    } catch {
      return `${val.toLocaleString('tr-TR')} ${currency}`;
    }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Spektrotek — Özet Panel</h1>
          <p className={styles.subtitle}>{selectedYear} yılı performans özeti</p>
        </div>
        <div className={styles.yearPicker}>
          {[currentYear, currentYear - 1].map(y => (
            <Link
              key={y}
              href={`/laboratuvar/spektrotek?year=${y}`}
              className={`${styles.yearBtn} ${selectedYear === y ? styles.yearBtnActive : ''}`}
            >
              {y}
            </Link>
          ))}
        </div>
      </div>

      {/* Metrikler */}
      <div className={styles.metrics}>
        <div className={`${styles.metricCard} ${styles.metricBlue}`}>
          <span className={styles.metricLabel}>Yeni Talepler</span>
          <span className={styles.metricValue}>{stats.newRequestsCount}</span>
          <span className={styles.metricHint}>Açılmayı bekleyen</span>
        </div>
        <div className={`${styles.metricCard} ${styles.metricAmber}`}>
          <span className={styles.metricLabel}>Teklif İletilenler</span>
          <span className={styles.metricValue}>{stats.quoteSentCount}</span>
          <span className={styles.metricHint}>Cevap bekleyen</span>
        </div>
        <div className={`${styles.metricCard} ${styles.metricGreen}`}>
          <span className={styles.metricLabel}>Onaylanan Teklifler</span>
          <span className={styles.metricValue}>{stats.approvedQuotesCount}</span>
          <span className={styles.metricHint}>Toplam adet</span>
        </div>
        <div className={`${styles.metricCard} ${styles.metricGradient}`}>
          <span className={styles.metricLabel}>Toplam Satış (TRY)</span>
          <span className={styles.metricValue}>{fmt(stats.totalApprovedValueTRY)}</span>
          <span className={styles.metricHint}>
            USD {stats.rates?.USD?.toFixed(2)} · EUR {stats.rates?.EUR?.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Alt satır */}
      <div className={styles.grid2}>
        {/* Son Aktiviteler */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Son Aktiviteler</h3>
            <Link href="/laboratuvar/spektrotek/talepler" className={styles.cardLink}>Tümü →</Link>
          </div>
          {stats.recentActivity.length === 0 ? (
            <p className={styles.empty}>Henüz aktivite yok.</p>
          ) : (
            <ul className={styles.activityList}>
              {stats.recentActivity.map((a, i) => (
                <li
                  key={a.id}
                  className={styles.activityItem}
                  style={{ borderBottom: i < stats.recentActivity.length - 1 ? '1px solid var(--color-border-light)' : 'none' }}
                >
                  <div className={styles.activityDot} />
                  <div className={styles.activityBody}>
                    <div className={styles.activityTop}>
                      <span className={styles.activityTitle}>{a.type} #{a.id}</span>
                      <span className={styles.activityDate}>{new Date(a.date).toLocaleDateString('tr-TR')}</span>
                    </div>
                    <p className={styles.activitySubject}>{a.subject}</p>
                    <p className={styles.activityMeta}>{a.customerName} · {a.user}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sağ kolon */}
        <div className={styles.rightCol}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>En Çok Satan Ürünler</h3>
            </div>
            {stats.topProducts.length === 0 ? (
              <p className={styles.empty}>Veri yok.</p>
            ) : (
              <ul className={styles.barList}>
                {stats.topProducts.map((p, i) => {
                  const max = Math.max(...stats.topProducts.map(x => x.totalValue));
                  const pct = max ? (p.totalValue / max) * 100 : 0;
                  return (
                    <li key={i} className={styles.barItem}>
                      <div className={styles.barLabels}>
                        <span className={styles.barName}>{p.name}</span>
                        <span className={styles.barAmt}>{fmt(p.totalValue)}</span>
                      </div>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{ width: `${pct}%` }} />
                      </div>
                      <p className={styles.barHint}>{p.count} adet</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>En Yüksek Cirolu Satışlar</h3>
            </div>
            {stats.highestPricedSales.length === 0 ? (
              <p className={styles.empty}>Veri yok.</p>
            ) : (
              <ul className={styles.saleList}>
                {stats.highestPricedSales.map((s, i) => (
                  <li
                    key={i}
                    className={styles.saleItem}
                    style={{ borderBottom: i < stats.highestPricedSales.length - 1 ? '1px solid var(--color-border-light)' : 'none' }}
                  >
                    <div>
                      <p className={styles.saleName}>{s.customerName}</p>
                      <p className={styles.saleMeta}>Teklif #{s.quoteNo}</p>
                    </div>
                    <span className={styles.saleAmt}>{fmt(s.total, s.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Aylık Grafik */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Aylık Talep Grafiği</h3>
        </div>
        <div className={styles.barChart}>
          {stats.monthlyRequestCounts.map((m, i) => {
            const max = Math.max(...stats.monthlyRequestCounts.map(x => x.count)) || 1;
            const h = (m.count / max) * 100;
            return (
              <div key={i} className={styles.barCol}>
                <div className={styles.barColInner}>
                  {m.count > 0 && <span className={styles.barColLabel}>{m.count}</span>}
                  <div className={styles.barColFill} style={{ height: `${h}%` }} />
                </div>
                <span className={styles.barColMonth}>{m.month.substring(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
