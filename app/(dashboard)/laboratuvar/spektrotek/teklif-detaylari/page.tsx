'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ExternalLink } from 'lucide-react';
import { getQuoteDetails } from '@/lib/spektrotek/quoteActions';
import type { QuoteDetailListItem } from '@/lib/spektrotek/quoteActions';
import tableStyles from '@/app/styles/table.module.css';

export default function SpektrotekTeklifDetaylari() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const initialPage = Number(searchParams.get('page') || '1');
  const initialLimit = Number(searchParams.get('limit') || '20');

  const [details, setDetails] = useState<QuoteDetailListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [page, setPage] = useState(Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1);
  const [limit, setLimit] = useState([10, 20, 50].includes(initialLimit) ? initialLimit : 20);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 450);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    const data = await getQuoteDetails({ page, limit, search: debouncedSearch });
    setDetails(data.details);
    setTotal(data.totalCount);
    setLoading(false);
  }, [debouncedSearch, limit, page]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const totalPages = Math.ceil(total / limit);
  const fmtMoney = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtQty = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const pageNums = () => {
    const nums: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) nums.push(i);
    } else {
      nums.push(1);
      if (page > 3) nums.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) nums.push(i);
      if (page < totalPages - 2) nums.push('...');
      nums.push(totalPages);
    }
    return nums;
  };
  const openQuote = (quoteId: string) => {
    const returnParams = new URLSearchParams();
    if (search) returnParams.set('search', search);
    returnParams.set('page', String(page));
    returnParams.set('limit', String(limit));
    const returnTo = `/laboratuvar/spektrotek/teklif-detaylari?${returnParams.toString()}`;
    router.push(`/laboratuvar/spektrotek/teklifler/${quoteId}?returnTo=${encodeURIComponent(returnTo)}`);
  };

  return (
    <div className={tableStyles.page}>
      <div className={tableStyles.pageHeader}>
        <div>
          <h1 className={tableStyles.pageTitle}>Teklif Detayları</h1>
          <p className={tableStyles.pageSubtitle}>Ürün ve hizmet bazında geçmiş teklif fiyatları</p>
        </div>
      </div>

      <div className={tableStyles.toolbar}>
        <div className={tableStyles.toolbarLeft}>
          <div className={tableStyles.searchBox} style={{ width: 380 }}>
            <Search className={tableStyles.searchIcon} size={15} />
            <input
              className={tableStyles.searchInput}
              placeholder="Teklif no, firma, ürün/hizmet veya kod ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className={tableStyles.searchClear} onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
          <span className={tableStyles.totalCount}>{total} teklif kalemi</span>
        </div>
        <div className={tableStyles.toolbarRight}>
          <select className={tableStyles.pageSizeSelect} value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      <div className={tableStyles.tableCard}>
        <div className={tableStyles.tableWrapper}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Teklif No</th>
                <th style={{ width: 90 }}>Tarih</th>
                <th>Firma Adı</th>
                <th>Ürün/Hizmet Adı</th>
                <th style={{ width: 80, textAlign: 'right' }}>Adet</th>
                <th style={{ width: 120, textAlign: 'right' }}>Birim Fiyat</th>
                <th style={{ width: 90 }}>Para Birimi</th>
                <th style={{ width: 44 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 28, color: 'var(--color-text-tertiary)' }}>Yükleniyor…</td></tr>
              ) : details.length === 0 ? (
                <tr><td colSpan={8} className={tableStyles.empty}>Kayıt bulunamadı.</td></tr>
              ) : details.map(item => (
                <tr
                  key={item.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openQuote(item.quoteId)}
                >
                  <td className={tableStyles.tdMono} style={{ fontWeight: 700 }}>#{item.quoteNo}/{item.rev ?? 0}</td>
                  <td className={tableStyles.tdMono} style={{ whiteSpace: 'nowrap' }}>
                    {item.date ? new Date(item.date).toLocaleDateString('tr-TR') : ''}
                  </td>
                  <td className={tableStyles.tdName} style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.customerName}>
                    {item.customerName}
                  </td>
                  <td style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.productName}>
                    <span className={tableStyles.tdName}>{item.productName}</span>
                    {item.productCode && (
                      <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        {item.productCode}
                      </span>
                    )}
                  </td>
                  <td className={tableStyles.tdMono} style={{ textAlign: 'right', fontWeight: 600 }}>{fmtQty(item.quantity)}</td>
                  <td className={tableStyles.tdMono} style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(item.unitPrice)}</td>
                  <td>
                    <span className={`${tableStyles.badge} ${tableStyles.badgeGray}`}>
                      {item.currency || '-'}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      className={tableStyles.editBtn}
                      onClick={() => openQuote(item.quoteId)}
                      title="Teklifi aç"
                    >
                      <ExternalLink size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={tableStyles.pagination}>
          <button
            className={tableStyles.pageBtn}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Önceki
          </button>
          {pageNums().map((n, i) => n === '...' ? (
            <span key={`dots-${i}`} className={tableStyles.pageDots}>…</span>
          ) : (
            <button
              key={n}
              className={`${tableStyles.pageBtn} ${page === n ? tableStyles.pageBtnActive : ''}`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            className={tableStyles.pageBtn}
            onClick={() => setPage(p => Math.min(totalPages || 1, p + 1))}
            disabled={page >= totalPages}
          >
            Sonraki
          </button>
          <span className={tableStyles.pageInfo}>Sayfa {page}/{totalPages || 1}</span>
        </div>
      </div>
    </div>
  );
}
