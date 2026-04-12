'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Edit, Copy, Printer } from 'lucide-react';
import { getQuotes, updateQuoteStatus, createRevision } from '@/lib/spektrotek/quoteActions';
import type { SktQuote } from '@/lib/spektrotek/types';
import styles from '../spektrotek.module.css';

const STATUS_OPTIONS = ['Hazırlanıyor', 'Teklif İletildi', 'Yayında', 'Revize', 'Onaylandı', 'Reddedildi', 'İptal'];

function statusStyle(s: string): React.CSSProperties {
  const v = (s || '').toLowerCase();
  if (v.includes('onay'))                           return { background: '#dcfce7', color: '#15803d' };
  if (v.includes('red') || v.includes('iptal'))     return { background: '#fee2e2', color: '#991b1b' };
  if (v.includes('iletildi') || v === 'yayında')    return { background: '#dbeafe', color: '#1d4ed8' };
  if (v.includes('hazır') || v.includes('revize'))  return { background: '#fef3c7', color: '#b45309' };
  return { background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' };
}

export default function SpektrotekTeklifler() {
  const router = useRouter();

  const [quotes, setQuotes]     = useState<SktQuote[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);

  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [page, setPage]                   = useState(1);
  const limit = 15;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 450);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter]);
  useEffect(() => { load(); }, [page, debouncedSearch, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const data = await getQuotes({ page, limit, search: debouncedSearch, status: statusFilter || undefined });
    setQuotes(data.quotes);
    setTotal(data.totalCount);
    setLoading(false);
  }

  async function handleStatusChange(id: string, newStatus: string) {
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: newStatus } : q));
    await updateQuoteStatus(id, newStatus);
  }

  async function handleRevision(quoteId: string) {
    if (!confirm('Bu teklifin yeni bir revizyonunu oluşturmak istediğinize emin misiniz?')) return;
    const res = await createRevision(quoteId);
    if (res.success && res.newQuoteId) {
      alert('Yeni revizyon oluşturuldu.');
      router.push(`/laboratuvar/spektrotek/teklifler/${res.newQuoteId}`);
    } else {
      alert('Revizyon oluşturulamadı.');
    }
  }

  function handlePrint(quoteId: string) {
    window.open(`/laboratuvar/spektrotek/teklifler/${quoteId}?print=true`, '_blank');
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Teklifler</h1>
          <p className={styles.subtitle}>Spektrotek teklif listesi</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={15} color="var(--color-text-tertiary)" />
            <input
              className={styles.searchInput}
              placeholder="Teklif no, firma veya plasiyer ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className={styles.filterSelect} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">Tüm Durumlar</option>
            {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className={styles.overflowX}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Teklif No</th>
                <th style={{ width: 80 }}>Talep No</th>
                <th style={{ width: 90 }}>Tarih</th>
                <th>Firma</th>
                <th style={{ width: 130 }}>Plasiyer</th>
                <th style={{ width: 130 }}>Tutar</th>
                <th style={{ width: 150 }}>Durum</th>
                <th style={{ width: 100 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>Yükleniyor…</td></tr>
              ) : quotes.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-tertiary)' }}>Kayıt bulunamadı.</td></tr>
              ) : quotes.map(q => (
                <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/laboratuvar/spektrotek/teklifler/${q.id}`)}>
                  <td style={{ fontWeight: 700 }}>#{q.quoteNo}/{q.rev ?? 0}</td>
                  <td style={{ fontSize: '0.8rem' }}>{q.requestDisplayNo ? `#${q.requestDisplayNo}` : '—'}</td>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {q.date ? new Date(q.date).toLocaleDateString('tr-TR') : ''}
                  </td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={q.customerName}>
                    {q.customerName}
                  </td>
                  <td style={{ fontSize: '0.8rem', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.salesPersonName}>
                    {q.salesPersonName}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {q.amount != null ? q.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '—'} {q.currency}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <select
                      value={q.status}
                      onChange={e => handleStatusChange(q.id, e.target.value)}
                      style={{
                        padding: '3px 8px', borderRadius: 12, border: 'none',
                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', width: '100%',
                        ...statusStyle(q.status),
                      }}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                      {!STATUS_OPTIONS.includes(q.status) && <option value={q.status}>{q.status}</option>}
                    </select>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className={`${styles.btn} ${styles.btnSm}`}
                        onClick={() => router.push(`/laboratuvar/spektrotek/teklifler/${q.id}`)} title="Düzenle">
                        <Edit size={13} />
                      </button>
                      <button className={`${styles.btn} ${styles.btnSm}`}
                        onClick={() => handleRevision(q.id)} title="Revizyon Oluştur">
                        <Copy size={13} />
                      </button>
                      <button className={`${styles.btn} ${styles.btnSm}`}
                        onClick={() => handlePrint(q.id)} title="Yazdır">
                        <Printer size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>Toplam {total} kayıt · Sayfa {page}/{totalPages || 1}</span>
          <div className={styles.paginationBtns}>
            <button className={`${styles.btn} ${styles.btnSm} ${page === 1 ? styles.btnDisabled : ''}`}
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Önceki</button>
            <button className={`${styles.btn} ${styles.btnSm} ${page >= totalPages ? styles.btnDisabled : ''}`}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Sonraki</button>
          </div>
        </div>
      </div>
    </div>
  );
}
