'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Edit, Eye, Banknote } from 'lucide-react';
import {
  getRequests, createRequest, updateRequest, getUsers,
} from '@/lib/spektrotek/requestActions';
import { getCustomers, addCustomer } from '@/lib/spektrotek/customerActions';
import { getLatestQuoteIdByRequest, createQuoteFromRequest } from '@/lib/spektrotek/quoteActions';
import type { SktRequest, SktCustomer } from '@/lib/spektrotek/types';
import styles from '../spektrotek.module.css';

const ALL_STATUSES = [
  'Yeni Talep', 'Cevap Bekleniyor', 'Teklif İletildi', 'Teklif Revize Edildi',
  'Sipariş', 'Sipariş Oluşturuldu', 'Ödeme Bekliyor', 'Satın Alma',
  'Satın Alma Yapılıyor', 'Ürün Gönderildi', 'Devam Ediyor',
  'Servis H. Verildi', 'Tamamlandı', 'Beklemede', 'Araştırılıyor', 'Olumsuz',
];

function priorityColor(p: string) {
  if (p === 'Yüksek') return 'var(--color-danger)';
  if (p === 'Orta')   return 'var(--color-warning)';
  return 'var(--color-success)';
}

function statusStyle(s: string): React.CSSProperties {
  const v = (s || 'Yeni Talep').trim();
  const map: Record<string, React.CSSProperties> = {
    'Yeni Talep':          { background: '#e0f2fe', color: '#0369a1' },
    'Cevap Bekleniyor':    { background: '#fef3c7', color: '#b45309' },
    'Teklif İletildi':     { background: '#dcfce7', color: '#15803d' },
    'Teklif Revize Edildi':{ background: '#d1fae5', color: '#065f46' },
    'Sipariş':             { background: '#ede9fe', color: '#6d28d9' },
    'Sipariş Oluşturuldu': { background: '#ddd6fe', color: '#5b21b6' },
    'Ödeme Bekliyor':      { background: '#ffe4e6', color: '#be123c' },
    'Satın Alma':          { background: '#f3e8ff', color: '#7e22ce' },
    'Tamamlandı':          { background: '#d1fae5', color: '#065f46' },
    'Olumsuz':             { background: '#fee2e2', color: '#991b1b' },
  };
  return map[v] || { background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' };
}

const defaultForm = (): Partial<SktRequest> => ({
  priority: 'Orta',
  status: 'Yeni Talep',
  contactType: 'Telefon',
  category: 'Diğer',
  distributor: 'Diğer',
  dateCreated: new Date().toISOString().split('T')[0],
});

const defaultCustomer = (): Partial<SktCustomer> => ({
  type: 'Hastane', status: 'Active', name: '', phone: '', email: '',
  address: '', web: '', taxOffice: '', taxNumber: '', authorizedPerson: '', notes: '',
});

type CustomerMutationResult = {
  success: boolean;
  customerId?: string;
};

export default function SpektrotekTalepler() {
  const router = useRouter();

  const [requests, setRequests]   = useState<SktRequest[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [customers, setCustomers] = useState<SktCustomer[]>([]);
  const [users, setUsers]         = useState<{ id: string; name: string }[]>([]);

  // filters
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [yearFilter, setYearFilter]       = useState(new Date().getFullYear().toString());
  const [page, setPage]                   = useState(1);
  const limit = 15;

  // modals
  const [modalOpen, setModalOpen]             = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingId, setEditingId]             = useState<string | null>(null);
  const [form, setForm]                       = useState<Partial<SktRequest>>(defaultForm());
  const [newCust, setNewCust]                 = useState<Partial<SktCustomer>>(defaultCustomer());
  const [saving, setSaving]                   = useState(false);

  // debounce
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 450);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    const [reqData, custRes, userData] = await Promise.all([
      getRequests({
        page, limit, search: debouncedSearch,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        year: yearFilter ? parseInt(yearFilter) : undefined,
      }),
      customers.length === 0 ? getCustomers({ page: 1, limit: 3000, status: 'Active' }) : Promise.resolve(null),
      users.length === 0     ? getUsers()                                                 : Promise.resolve(null),
    ]);
    setRequests(reqData.requests);
    setTotal(reqData.totalCount);
    if (custRes) setCustomers(custRes.customers);
    if (userData) setUsers(userData);
    setLoading(false);
  }, [customers.length, debouncedSearch, page, priorityFilter, users.length, yearFilter, statusFilter]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const totalPages = Math.ceil(total / limit);

  // ── handlers ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm());
    setModalOpen(true);
  }
  function openEdit(r: SktRequest) {
    setEditingId(r.id.toString());
    setForm(r);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const res = editingId
      ? await updateRequest(editingId, form)
      : await createRequest(form as SktRequest);
    setSaving(false);
    if (!res.success) { alert('Hata oluştu.'); return; }
    setModalOpen(false);
    setForm(defaultForm());
    load();
  }

  async function handleStatusChange(id: string, newStatus: string) {
    await updateRequest(id, { status: newStatus });
    setRequests(prev => prev.map(r => r.id.toString() === id ? { ...r, status: newStatus } : r));
  }

  async function handleViewQuote(e: React.MouseEvent, reqId: string) {
    e.stopPropagation();
    const quoteId = await getLatestQuoteIdByRequest(reqId);
    if (quoteId) router.push(`/laboratuvar/spektrotek/teklifler/${quoteId}`);
    else alert('Bu talebe bağlı aktif teklif bulunamadı.');
  }

  async function handleCreateQuote(e: React.MouseEvent, req: SktRequest) {
    e.stopPropagation();
    if (!confirm(`#${req.id} nolu talep için teklif oluşturulsun mu?`)) return;
    const res = await createQuoteFromRequest(req.id.toString());
    if (res.success && res.quoteId) {
      alert('Teklif oluşturuldu.');
      router.push(`/laboratuvar/spektrotek/teklifler/${res.quoteId}`);
    } else {
      alert('Teklif oluşturulamadı.');
    }
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCust.name) { alert('Firma adı zorunludur.'); return; }
    const res = await addCustomer(newCust);
    if (res.success) {
      const cid = (res as CustomerMutationResult).customerId;
      const created = { ...newCust, id: cid || '' } as SktCustomer;
      setCustomers(prev => [...prev, created]);
      if (cid) setForm(f => ({ ...f, customerId: cid }));
      setCustomerModalOpen(false);
      setNewCust(defaultCustomer());
    } else {
      alert('Müşteri kaydedilemedi.');
    }
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2022 }, (_, i) => currentYear - i);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Talepler</h1>
          <p className={styles.subtitle}>Spektrotek müşteri talepleri</p>
        </div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>
          <Plus size={15} /> Yeni Talep
        </button>
      </div>

      {/* Filters */}
      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={15} color="var(--color-text-tertiary)" />
            <input
              className={styles.searchInput}
              placeholder="No, müşteri veya konu ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className={styles.filterSelect} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            <option value="">Tüm Yıllar</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className={styles.filterSelect} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">Tüm Durumlar</option>
            {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className={styles.filterSelect} value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}>
            <option value="">Tüm Öncelikler</option>
            <option>Yüksek</option>
            <option>Orta</option>
            <option>Düşük</option>
          </select>
        </div>

        <div className={styles.overflowX}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 16 }}></th>
                <th style={{ width: 80 }}>No</th>
                <th style={{ width: 90 }}>Tarih</th>
                <th>Müşteri</th>
                <th style={{ width: 150 }}>Kategori</th>
                <th style={{ width: 110 }}>Distribütör</th>
                <th>Konu</th>
                <th style={{ width: 110 }}>Atanan</th>
                <th style={{ width: 155 }}>Durum</th>
                <th style={{ width: 88 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>Yükleniyor…</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-tertiary)' }}>Kayıt bulunamadı.</td></tr>
              ) : requests.map(r => (
                <tr
                  key={r.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/laboratuvar/spektrotek/talepler/${r.id}`)}
                >
                  <td>
                    <div className={styles.priorityDot} style={{ background: priorityColor(r.priority) }} title={r.priority} />
                  </td>
                  <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>#{r.id}</td>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {r.dateCreated ? new Date(r.dateCreated).toLocaleDateString('tr-TR') : ''}
                  </td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={r.customerName}>
                    {r.customerName}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{r.category}</td>
                  <td style={{ fontSize: '0.8rem' }}>{r.distributor}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }} title={r.subject}>
                    {r.subject}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{r.assigneeName}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <select
                      value={(r.status || '').trim()}
                      onChange={e => handleStatusChange(r.id.toString(), e.target.value)}
                      style={{
                        padding: '3px 8px', borderRadius: 12, border: 'none',
                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                        width: '100%',
                        ...statusStyle(r.status),
                      }}
                    >
                      {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => openEdit(r)} title="Düzenle">
                        <Edit size={13} />
                      </button>
                      {r.customerId && (
                        r.status === 'Teklif İletildi' ? (
                          <button className={`${styles.btn} ${styles.btnSm}`} style={{ color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}
                            onClick={e => handleViewQuote(e, r.id.toString())} title="Teklifi Görüntüle">
                            <Eye size={13} />
                          </button>
                        ) : (
                          <button className={`${styles.btn} ${styles.btnSm}`}
                            onClick={e => handleCreateQuote(e, r)} title="Teklif Oluştur">
                            <Banknote size={13} />
                          </button>
                        )
                      )}
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

      {/* ── Request Modal ─────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={styles.modal} style={{ maxWidth: 640 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editingId ? 'Talebi Düzenle' : 'Yeni Talep'}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className={styles.formGrid2}>
              {/* Tarih & Öncelik */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tarih</label>
                <input type="date" className={styles.formInput} value={form.dateCreated || ''}
                  onChange={e => setForm(f => ({ ...f, dateCreated: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Öncelik</label>
                <select className={styles.formSelect} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option>Düşük</option><option>Orta</option><option>Yüksek</option>
                </select>
              </div>
              {/* Müşteri (full width) */}
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Müşteri</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className={styles.formSelect} style={{ flex: 1 }} value={form.customerId || ''}
                    onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}>
                    <option value="">Seçiniz...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" className={styles.btn} onClick={() => setCustomerModalOpen(true)} title="Yeni müşteri ekle">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              {/* İletişim Türü & Kategori */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>İletişim Türü</label>
                <select className={styles.formSelect} value={form.contactType} onChange={e => setForm(f => ({ ...f, contactType: e.target.value }))}>
                  <option>Telefon</option><option>Mail</option><option>Ziyaret</option><option>Online</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Kategori</label>
                <select className={styles.formSelect} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option>Bakım & Kalibrasyon</option><option>Servis</option><option>Danışmanlık</option>
                  <option>Cihaz & Yedek Parça</option><option>Sarf Malzeme</option><option>Diğer</option>
                </select>
              </div>
              {/* Distribütör */}
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Distribütör</label>
                <select className={styles.formSelect} value={form.distributor} onChange={e => setForm(f => ({ ...f, distributor: e.target.value }))}>
                  <option>Knauer</option><option>Nanalysis</option><option>Advion</option>
                  <option>Peak</option><option>Axel Semrau</option><option>Sielc</option>
                  <option>VWR</option><option>Thermo</option><option>Diğer</option>
                </select>
              </div>
              {/* Atanan */}
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Atanan Kişi</label>
                <select className={styles.formSelect} value={form.assigneeId || ''} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
                  <option value="">Seçiniz...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              {/* Konu */}
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Konu</label>
                <input className={styles.formInput} value={form.subject || ''}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              {/* Açıklama */}
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Açıklama</label>
                <textarea className={styles.formTextarea} value={form.description || ''}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ minHeight: 90 }} />
              </div>
              <div className={styles.formActions}>
                <button type="button" className={styles.btn} onClick={() => setModalOpen(false)}>İptal</button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
                  {saving ? 'Kaydediliyor…' : (editingId ? 'Güncelle' : 'Kaydet')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Customer Modal ────────────────────────────────────────────── */}
      {customerModalOpen && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setCustomerModalOpen(false)}>
          <div className={styles.modal} style={{ maxWidth: 580 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Yeni Müşteri Ekle</h2>
              <button className={styles.modalClose} onClick={() => setCustomerModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleAddCustomer} className={styles.formGrid2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Tür</label>
                <select className={styles.formSelect} value={newCust.type} onChange={e => setNewCust(c => ({ ...c, type: e.target.value }))}>
                  {['Hastane','Üniversite','Özel Lab.','Fabrika','Tedarikçi','Bayi','Müşteri','Diğer'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Firma Adı *</label>
                <input className={styles.formInput} required value={newCust.name || ''}
                  onChange={e => setNewCust(c => ({ ...c, name: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Yetkili Kişi</label>
                <input className={styles.formInput} value={newCust.authorizedPerson || ''}
                  onChange={e => setNewCust(c => ({ ...c, authorizedPerson: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Telefon</label>
                <input className={styles.formInput} value={newCust.phone || ''}
                  onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>E-posta</label>
                <input className={styles.formInput} type="email" value={newCust.email || ''}
                  onChange={e => setNewCust(c => ({ ...c, email: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Web Sitesi</label>
                <input className={styles.formInput} value={newCust.web || ''}
                  onChange={e => setNewCust(c => ({ ...c, web: e.target.value }))} />
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Adres</label>
                <input className={styles.formInput} value={newCust.address || ''}
                  onChange={e => setNewCust(c => ({ ...c, address: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Vergi Dairesi</label>
                <input className={styles.formInput} value={newCust.taxOffice || ''}
                  onChange={e => setNewCust(c => ({ ...c, taxOffice: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Vergi No</label>
                <input className={styles.formInput} value={newCust.taxNumber || ''}
                  onChange={e => setNewCust(c => ({ ...c, taxNumber: e.target.value }))} />
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Notlar</label>
                <textarea className={styles.formTextarea} value={newCust.notes || ''}
                  onChange={e => setNewCust(c => ({ ...c, notes: e.target.value }))} />
              </div>
              <div className={styles.formActions}>
                <button type="button" className={styles.btn} onClick={() => setCustomerModalOpen(false)}>İptal</button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
