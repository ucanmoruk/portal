'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { SktInvoice } from '@/lib/spektrotek/types';
import styles from '../spektrotek.module.css';

const INVOICE_STATUSES: SktInvoice['status'][] = ['Ödendi', 'Bekliyor', 'Gecikmiş'];

const MOCK: SktInvoice[] = [
  { id: '1', customerId: '', quoteId: '', amount: 12500, currency: 'USD', dateIssued: '2025-01-10', dueDate: '2025-02-10', status: 'Ödendi' },
  { id: '2', customerId: '', quoteId: '', amount: 8200, currency: 'EUR', dateIssued: '2025-02-15', dueDate: '2025-03-15', status: 'Bekliyor' },
  { id: '3', customerId: '', quoteId: '', amount: 3400, currency: 'USD', dateIssued: '2025-03-01', dueDate: '2025-04-01', status: 'Gecikmiş' },
];

const STATUS_COLOR: Record<string, React.CSSProperties> = {
  'Ödendi':   { background: '#dcfce7', color: '#15803d' },
  'Bekliyor': { background: '#fef3c7', color: '#b45309' },
  'Gecikmiş': { background: '#fee2e2', color: '#991b1b' },
};

export default function SpektrotekFaturalar() {
  const [invoices, setInvoices] = useState<SktInvoice[]>(MOCK);
  const [form, setForm] = useState<Partial<SktInvoice>>({ currency: 'USD', status: 'Bekliyor', dateIssued: new Date().toISOString().split('T')[0] });
  const [modalOpen, setModalOpen] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const id = Date.now().toString();
    setInvoices(prev => [{ ...form, id, customerId: '', quoteId: '' } as SktInvoice, ...prev]);
    setModalOpen(false);
    setForm({ currency: 'USD', status: 'Bekliyor', dateIssued: new Date().toISOString().split('T')[0] });
  }

  const total = invoices.reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Faturalar</h1>
          <p className={styles.subtitle}>Spektrotek fatura takibi</p>
        </div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setModalOpen(true)}><Plus size={15} /> Yeni Fatura</button>
      </div>

      <div className={styles.card}>
        <div className={styles.overflowX}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Vade</th>
                <th style={{ textAlign: 'right' }}>Tutar</th>
                <th style={{ width: 100 }}>Durum</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>{inv.dateIssued}</td>
                  <td>{inv.dueDate}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{(inv.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {inv.currency}</td>
                  <td>
                    <span className={styles.badge} style={STATUS_COLOR[inv.status] || {}}>{inv.status}</span>
                  </td>
                  <td>
                    <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                      onClick={() => setInvoices(prev => prev.filter(i => i.id !== inv.id))}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ padding: '8px 10px', fontWeight: 700 }}>Toplam</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, fontSize: '1rem' }}>
                  {total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Yeni Fatura</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className={styles.formGrid2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Fatura Tarihi</label>
                <input type="date" className={styles.formInput} value={form.dateIssued || ''} onChange={e => setForm(f => ({ ...f, dateIssued: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Vade Tarihi</label>
                <input type="date" className={styles.formInput} value={form.dueDate || ''} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tutar</label>
                <input type="number" step="0.01" className={styles.formInput} value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Para Birimi</label>
                <select className={styles.formSelect} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                  {['USD','EUR','TRY','GBP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Durum</label>
                <select className={styles.formSelect} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as SktInvoice['status'] }))}>
                  {INVOICE_STATUSES.map(status => <option key={status}>{status}</option>)}
                </select>
              </div>
              <div className={styles.formActions}>
                <button type="button" className={styles.btn} onClick={() => setModalOpen(false)}>İptal</button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
