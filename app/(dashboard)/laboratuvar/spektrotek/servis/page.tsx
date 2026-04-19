'use client';

import { useState } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import type { SktTicket } from '@/lib/spektrotek/types';
import styles from '../spektrotek.module.css';

const TICKET_PRIORITIES: SktTicket['priority'][] = ['Düşük', 'Orta', 'Yüksek', 'Kritik'];
const TICKET_STATUSES: SktTicket['status'][] = ['Açık', 'İşlemde', 'Parça Bekliyor', 'Kapalı'];

const MOCK: SktTicket[] = [
  { id: '1', customerId: '', productId: '', status: 'İşlemde', priority: 'Yüksek', subject: 'HPLC cihazı arızası', dateCreated: '2025-03-10' },
  { id: '2', customerId: '', productId: '', status: 'Açık', priority: 'Orta', subject: 'Pompa bakım talebi', dateCreated: '2025-03-15' },
  { id: '3', customerId: '', productId: '', status: 'Kapalı', priority: 'Düşük', subject: 'Yazılım güncelleme', dateCreated: '2025-02-20' },
];

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  'Açık':            { background: '#dbeafe', color: '#1d4ed8' },
  'İşlemde':         { background: '#fef3c7', color: '#b45309' },
  'Parça Bekliyor':  { background: '#ede9fe', color: '#6d28d9' },
  'Kapalı':          { background: '#d1fae5', color: '#065f46' },
};
const PRIORITY_COLOR: Record<string, string> = {
  Kritik: 'var(--color-danger)', Yüksek: 'var(--color-danger)', Orta: 'var(--color-warning)', Düşük: 'var(--color-success)',
};

const defaultForm = (): Partial<SktTicket> => ({
  status: 'Açık', priority: 'Orta', subject: '', dateCreated: new Date().toISOString().split('T')[0],
});

export default function SpektrotekServis() {
  const [tickets, setTickets] = useState<SktTicket[]>(MOCK);
  const [form, setForm]       = useState<Partial<SktTicket>>(defaultForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function openCreate() { setEditingId(null); setForm(defaultForm()); setModalOpen(true); }
  function openEdit(t: SktTicket) { setEditingId(t.id); setForm(t); setModalOpen(true); }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      setTickets(prev => prev.map(t => t.id === editingId ? { ...t, ...form } as SktTicket : t));
    } else {
      setTickets(prev => [{ ...form, id: Date.now().toString(), customerId: '', productId: '' } as SktTicket, ...prev]);
    }
    setModalOpen(false);
  }

  function handleStatus(id: string, status: SktTicket['status']) {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Servis</h1>
          <p className={styles.subtitle}>Spektrotek servis talepleri</p>
        </div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}><Plus size={15} /> Yeni Talep</button>
      </div>

      <div className={styles.card}>
        <div className={styles.overflowX}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 16 }}></th>
                <th style={{ width: 90 }}>Tarih</th>
                <th>Konu</th>
                <th style={{ width: 140 }}>Durum</th>
                <th style={{ width: 80 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.id}>
                  <td>
                    <div className={styles.priorityDot} style={{ background: PRIORITY_COLOR[t.priority] || 'var(--color-text-tertiary)' }} title={t.priority} />
                  </td>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{t.dateCreated}</td>
                  <td style={{ fontWeight: 600 }}>{t.subject}</td>
                  <td>
                    <select
                      value={t.status}
                      onChange={e => handleStatus(t.id, e.target.value as SktTicket['status'])}
                      style={{
                        padding: '3px 8px', borderRadius: 12, border: 'none', fontSize: '0.75rem', fontWeight: 600,
                        cursor: 'pointer', width: '100%',
                        ...(STATUS_STYLE[t.status] || {}),
                      }}
                    >
                      {TICKET_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => openEdit(t)}><Edit size={13} /></button>
                      <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                        onClick={() => setTickets(prev => prev.filter(x => x.id !== t.id))}><Trash2 size={13} /></button>
                    </div>
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
              <h2 className={styles.modalTitle}>{editingId ? 'Servis Düzenle' : 'Yeni Servis Talebi'}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className={styles.formGrid2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tarih</label>
                <input type="date" className={styles.formInput} value={form.dateCreated || ''} onChange={e => setForm(f => ({ ...f, dateCreated: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Öncelik</label>
                <select className={styles.formSelect} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as SktTicket['priority'] }))}>
                  {TICKET_PRIORITIES.map(priority => <option key={priority}>{priority}</option>)}
                </select>
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Konu *</label>
                <input required className={styles.formInput} value={form.subject || ''} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Durum</label>
                <select className={styles.formSelect} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as SktTicket['status'] }))}>
                  {TICKET_STATUSES.map(status => <option key={status}>{status}</option>)}
                </select>
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
