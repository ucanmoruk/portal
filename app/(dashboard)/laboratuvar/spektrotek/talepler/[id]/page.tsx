'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Edit, Eye, Banknote } from 'lucide-react';
import {
  addRequestNote, getRequest, updateRequest, getUsers, getRequestNotes,
} from '@/lib/spektrotek/requestActions';
import { createQuoteFromRequest, getLatestQuoteIdByRequest } from '@/lib/spektrotek/quoteActions';
import type { RequestNote } from '@/lib/spektrotek/requestActions';
import type { SktRequest } from '@/lib/spektrotek/types';
import styles from '../../spektrotek.module.css';

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

export default function TalepDetay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [request, setRequest]   = useState<SktRequest | null>(null);
  const [notes, setNotes]       = useState<RequestNote[]>([]);
  const [users, setUsers]       = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [latestQuoteId, setLatestQuoteId] = useState<string | null>(null);

  const [editOpen, setEditOpen]   = useState(false);
  const [form, setForm]           = useState<Partial<SktRequest>>({});
  const [saving, setSaving]       = useState(false);
  const [newNote, setNewNote]     = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    const [req, usrs, qId] = await Promise.all([
      getRequest(id),
      getUsers(),
      getLatestQuoteIdByRequest(id),
    ]);
    if (req) {
      setRequest(req);
      setForm(req);
      const n = await getRequestNotes(req.dbId || id);
      setNotes(n);
    }
    setUsers(usrs);
    setLatestQuoteId(qId);
    setLoading(false);
  }, [id]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!request || saving) return;
    setSaving(true);
    await updateRequest(id, form);
    setSaving(false);
    setEditOpen(false);
    load();
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    const note = newNote.trim();
    if (!request || !note || addingNote) return;
    setAddingNote(true);
    const res = await addRequestNote(request.dbId || id, note);
    if (res.success) {
      setNewNote('');
      const nextNotes = await getRequestNotes(request.dbId || id);
      setNotes(nextNotes);
    } else {
      alert(res.error || 'Not kaydedilemedi.');
    }
    setAddingNote(false);
  }

  async function handleCreateQuote() {
    if (!request || !confirm(`#${id} nolu talep için teklif oluşturulsun mu?`)) return;
    const res = await createQuoteFromRequest(id);
    if (res.success && res.quoteId) {
      router.push(`/laboratuvar/spektrotek/teklifler/${res.quoteId}`);
    } else {
      alert('Teklif oluşturulamadı.');
    }
  }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Yükleniyor…</div>;
  if (!request) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-danger)' }}>Talep bulunamadı.</div>;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className={styles.btn} onClick={() => router.push('/laboratuvar/spektrotek/talepler')}>
            <ArrowLeft size={14} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={styles.priorityDot} style={{ background: priorityColor(request.priority) }} title={request.priority} />
            <div>
              <h1 className={styles.title}>Talep #{request.id}</h1>
              <p className={styles.subtitle}>{request.customerName}</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className={styles.badge} style={{ padding: '4px 12px', background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', alignSelf: 'center' }}>
            {request.status}
          </span>
          {latestQuoteId ? (
            <button className={`${styles.btn}`} style={{ color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}
              onClick={() => router.push(`/laboratuvar/spektrotek/teklifler/${latestQuoteId}`)} title="Teklifi Görüntüle">
              <Eye size={14} /> Teklif
            </button>
          ) : (
            <button className={`${styles.btn}`} onClick={handleCreateQuote} title="Teklif Oluştur">
              <Banknote size={14} /> Teklif Oluştur
            </button>
          )}
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setEditOpen(true)}>
            <Edit size={14} /> Düzenle
          </button>
        </div>
      </div>

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--color-border-light)' }}>Genel Bilgiler</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.85rem' }}>
            {([
              ['Tarih',       request.dateCreated ? new Date(request.dateCreated).toLocaleDateString('tr-TR') : '—'],
              ['Öncelik',     request.priority],
              ['İletişim',    request.contactType],
              ['Kategori',    request.category],
              ['Distribütör', request.distributor],
              ['Atanan',      request.assigneeName || '—'],
            ] as [string, string][]).map(([label, val]) => (
              <div key={label}>
                <div style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border-light)' }}>Konu / Açıklama</h3>
          <p style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.9rem' }}>{request.subject}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{request.description || '—'}</p>
        </div>
      </div>

      {/* Notes / Activity */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--color-border-light)' }}>Aktiviteler &amp; Notlar</h3>
        <form onSubmit={handleAddNote} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className={styles.formInput}
            style={{ flex: 1 }}
            placeholder="Yeni not ekle..."
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
          />
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} disabled={addingNote || !newNote.trim()}>
            <Plus size={13} /> Ekle
          </button>
        </form>
        {notes.length === 0 ? (
          <p className={styles.empty}>Henüz aktivite yok.</p>
        ) : (
          <ul className={styles.activityList}>
            {notes.map((n, i) => (
              <li key={n.id || i} className={styles.activityItem} style={{ borderBottom: i < notes.length - 1 ? '1px solid var(--color-border-light)' : 'none' }}>
                <div className={styles.activityDot} />
                <div className={styles.activityBody}>
                  <div className={styles.activityTop}>
                    <span className={styles.activityTitle}>{n.userName}</span>
                    <span className={styles.activityDate}>{n.date ? new Date(n.date).toLocaleDateString('tr-TR') : ''}</span>
                  </div>
                  <p className={styles.activitySubject}>{n.note}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setEditOpen(false)}>
          <div className={styles.modal} style={{ maxWidth: 640 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Talebi Düzenle</h2>
              <button className={styles.modalClose} onClick={() => setEditOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className={styles.formGrid2}>
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
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Distribütör</label>
                <select className={styles.formSelect} value={form.distributor} onChange={e => setForm(f => ({ ...f, distributor: e.target.value }))}>
                  <option>Knauer</option><option>Nanalysis</option><option>Advion</option>
                  <option>Peak</option><option>Axel Semrau</option><option>Sielc</option>
                  <option>VWR</option><option>Thermo</option><option>Diğer</option>
                </select>
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Atanan Kişi</label>
                <select className={styles.formSelect} value={form.assigneeId || ''} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
                  <option value="">Seçiniz...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Durum</label>
                <select className={styles.formSelect} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Konu</label>
                <input className={styles.formInput} value={form.subject || ''} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Açıklama</label>
                <textarea className={styles.formTextarea} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ minHeight: 80 }} />
              </div>
              <div className={styles.formActions}>
                <button type="button" className={styles.btn} onClick={() => setEditOpen(false)}>İptal</button>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
                  {saving ? 'Kaydediliyor…' : 'Güncelle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
