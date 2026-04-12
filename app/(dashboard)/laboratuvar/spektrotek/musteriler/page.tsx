'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, Edit, Trash2, Download, Filter } from 'lucide-react';
import {
  getCustomers, addCustomer, updateCustomer, deleteCustomer,
} from '@/lib/spektrotek/customerActions';
import type { SktCustomer } from '@/lib/spektrotek/types';
import styles from '../spektrotek.module.css';

export default function SpektrotekMusteriler() {
  const [customers, setCustomers] = useState<SktCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showPassive, setShowPassive] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 15;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<SktCustomer>>({ type: 'Tedarikçi', status: 'Active' });

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 450);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { load(); }, [debouncedSearch, showPassive, page]);

  async function load() {
    setLoading(true);
    const res = await getCustomers({ page, limit, search: debouncedSearch, status: showPassive ? 'Passive' : 'Active' });
    setCustomers(res.customers);
    setTotal(res.totalCount);
    setLoading(false);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ type: 'Tedarikçi', status: 'Active', name: '', phone: '', email: '', address: '', web: '', taxOffice: '', taxNumber: '', authorizedPerson: '', notes: '' });
    setModalOpen(true);
  }
  function openEdit(c: SktCustomer) { setEditingId(c.id); setForm(c); setModalOpen(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) await updateCustomer(editingId, form);
    else await addCustomer(form);
    setModalOpen(false);
    load();
  }
  async function handleDelete(id: string) {
    if (!confirm('Bu müşteriyi pasife almak istiyor musunuz?')) return;
    await deleteCustomer(id);
    load();
  }
  async function handleRecall(id: string) {
    await updateCustomer(id, { status: 'Active' });
    load();
  }

  async function exportCsv() {
    const { customers: all } = await getCustomers({ page: 1, limit: 10000, search: debouncedSearch, status: showPassive ? 'Passive' : 'Active' });
    const headers = ['Tür','Firma Adı','Yetkili','Telefon','Email','Adres','Web','Vergi Dairesi','Vergi No','Notlar','Durum'];
    const rows = all.map(c => [c.type, c.name, c.authorizedPerson||'', c.phone, c.email, c.address, c.web||'', c.taxOffice||'', c.taxNumber||'', (c.notes||'').replace(/\n/g,' '), c.status].map(v => `"${v}"`).join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })), download: 'Spektrotek-Musteriler.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Müşteriler</h1>
          <p className={styles.subtitle}>Spektrotek müşteri listesi</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`${styles.btn} ${showPassive ? styles.btnPrimary : ''}`} onClick={() => { setShowPassive(!showPassive); setPage(1); }}>
            <Filter size={15} /> {showPassive ? 'Aktifleri Göster' : 'Pasifleri Göster'}
          </button>
          <button className={styles.btn} onClick={exportCsv}><Download size={15} /> Excel</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}><Plus size={15} /> Yeni</button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={15} color="var(--color-text-tertiary)" />
            <input className={styles.searchInput} placeholder="Firma, yetkili veya e-posta ara..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className={styles.overflowX}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tür</th>
                <th>Firma Adı</th>
                <th>Adres</th>
                <th>Telefon</th>
                <th>E-posta</th>
                <th>Notlar</th>
                <th style={{ width: 80 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>Yükleniyor…</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-tertiary)' }}>Kayıt bulunamadı.</td></tr>
              ) : customers.map(c => (
                <tr key={c.id} style={{ opacity: c.status === 'Passive' ? 0.55 : 1 }}>
                  <td>
                    <span className={styles.badge} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>{c.type}</span>
                  </td>
                  <td style={{ fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }} title={c.address}>{c.address}</td>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{c.phone}</td>
                  <td style={{ fontSize: '0.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.email}>{c.email}</td>
                  <td style={{ fontSize: '0.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.notes}>{c.notes}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => openEdit(c)}><Edit size={13} /></button>
                      {showPassive
                        ? <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => handleRecall(c.id)} title="Aktive et"><Plus size={13} /></button>
                        : <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`} onClick={() => handleDelete(c.id)}><Trash2 size={13} /></button>
                      }
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
            <button className={`${styles.btn} ${styles.btnSm} ${page === 1 ? styles.btnDisabled : ''}`} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Önceki</button>
            <button className={`${styles.btn} ${styles.btnSm} ${page >= totalPages ? styles.btnDisabled : ''}`} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Sonraki</button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editingId ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className={styles.formGrid2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tür</label>
                <select className={styles.formSelect} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {['Hastane','Üniversite','Özel Lab.','Fabrika','Tedarikçi','Bayi','Müşteri','Diğer'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Firma Adı *</label>
                <input className={styles.formInput} required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Yetkili Kişi</label>
                <input className={styles.formInput} value={form.authorizedPerson || ''} onChange={e => setForm({ ...form, authorizedPerson: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Telefon</label>
                <input className={styles.formInput} value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>E-posta</label>
                <input className={styles.formInput} type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Web Sitesi</label>
                <input className={styles.formInput} value={form.web || ''} onChange={e => setForm({ ...form, web: e.target.value })} />
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Adres</label>
                <input className={styles.formInput} value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Vergi Dairesi</label>
                <input className={styles.formInput} value={form.taxOffice || ''} onChange={e => setForm({ ...form, taxOffice: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Vergi No</label>
                <input className={styles.formInput} value={form.taxNumber || ''} onChange={e => setForm({ ...form, taxNumber: e.target.value })} />
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Notlar</label>
                <textarea className={styles.formTextarea} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className={styles.formActions}>
                <button type="button" className={styles.btn} onClick={() => setModalOpen(false)}>İptal</button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>{editingId ? 'Güncelle' : 'Kaydet'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
