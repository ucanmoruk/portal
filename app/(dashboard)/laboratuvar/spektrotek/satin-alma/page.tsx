'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { SktPurchase } from '@/lib/spektrotek/types';
import styles from '../spektrotek.module.css';

const MOCK: SktPurchase[] = [
  { id: '1', supplier: 'Knauer GmbH', description: 'HPLC Kolon', amount: 2400, currency: 'EUR', date: '2025-01-20', category: 'Cihaz' },
  { id: '2', supplier: 'Sigma-Aldrich', description: 'Sarf Malzeme', amount: 850, currency: 'USD', date: '2025-02-10', category: 'Sarf' },
];

export default function SpektrotekSatinAlma() {
  const [purchases, setPurchases] = useState<SktPurchase[]>(MOCK);
  const [form, setForm] = useState<Partial<SktPurchase>>({ currency: 'USD', date: new Date().toISOString().split('T')[0], category: 'Diğer' });
  const [modalOpen, setModalOpen] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setPurchases(prev => [{ ...form, id: Date.now().toString() } as SktPurchase, ...prev]);
    setModalOpen(false);
    setForm({ currency: 'USD', date: new Date().toISOString().split('T')[0], category: 'Diğer' });
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Satın Alma</h1>
          <p className={styles.subtitle}>Spektrotek satın alma siparişleri</p>
        </div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setModalOpen(true)}><Plus size={15} /> Yeni Sipariş</button>
      </div>

      <div className={styles.card}>
        <div className={styles.overflowX}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Tedarikçi</th>
                <th>Kategori</th>
                <th>Açıklama</th>
                <th style={{ textAlign: 'right' }}>Tutar</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(p => (
                <tr key={p.id}>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{p.date}</td>
                  <td style={{ fontWeight: 600 }}>{p.supplier}</td>
                  <td><span className={styles.badge} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>{p.category}</span></td>
                  <td style={{ fontSize: '0.85rem' }}>{p.description}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{(p.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {p.currency}</td>
                  <td>
                    <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                      onClick={() => setPurchases(prev => prev.filter(x => x.id !== p.id))}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Yeni Satın Alma</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className={styles.formGrid2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tarih</label>
                <input type="date" className={styles.formInput} value={form.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Kategori</label>
                <select className={styles.formSelect} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {['Cihaz','Sarf','Yedek Parça','Hizmet','Diğer'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Tedarikçi</label>
                <input className={styles.formInput} value={form.supplier || ''} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Açıklama</label>
                <input className={styles.formInput} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
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
