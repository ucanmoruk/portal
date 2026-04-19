'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Trash2 } from 'lucide-react';
import { getProducts, addProduct, updateProduct, deleteProduct, getProductMetadata } from '@/lib/spektrotek/productActions';
import type { SktProduct } from '@/lib/spektrotek/types';
import styles from '../spektrotek.module.css';

export default function SpektrotekUrunler() {
  const [products, setProducts] = useState<SktProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const limit = 15;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<SktProduct>>({ currency: 'USD', unit: 'Adet', vat: 20, stock: 0 });

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 450);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    getProductMetadata().then(m => { setCategories(m.categories); setBrands(m.brands); });
  }, []);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    const res = await getProducts({ page, limit, search: debouncedSearch, category: categoryFilter || undefined, brand: brandFilter || undefined });
    setProducts(res.products);
    setTotal(res.totalCount);
    setLoading(false);
  }, [brandFilter, categoryFilter, debouncedSearch, page]);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ currency: 'USD', unit: 'Adet', vat: 20, stock: 0, name: '', code: '', category: '', brand: '', sellPrice: 0 });
    setModalOpen(true);
  }
  function openEdit(p: SktProduct) { setEditingId(p.id); setForm(p); setModalOpen(true); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) await updateProduct(editingId, form);
    else await addProduct(form);
    setModalOpen(false);
    load();
  }
  async function handleDelete(id: string) {
    if (!confirm('Ürünü pasife almak istiyor musunuz?')) return;
    await deleteProduct(id);
    load();
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Ürünler</h1>
          <p className={styles.subtitle}>Spektrotek ürün kataloğu</p>
        </div>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}><Plus size={15} /> Yeni Ürün</button>
      </div>

      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={15} color="var(--color-text-tertiary)" />
            <input className={styles.searchInput} placeholder="Ürün adı, kodu veya marka ara..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className={styles.filterSelect} value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}>
            <option value="">Tüm Kategoriler</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className={styles.filterSelect} value={brandFilter} onChange={e => { setBrandFilter(e.target.value); setPage(1); }}>
            <option value="">Tüm Markalar</option>
            {brands.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>

        <div className={styles.overflowX}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Kod</th>
                <th>Ürün Adı</th>
                <th>Kategori</th>
                <th>Marka</th>
                <th>Stok</th>
                <th>Fiyat</th>
                <th>KDV</th>
                <th style={{ width: 80 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>Yükleniyor…</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-tertiary)' }}>Ürün bulunamadı.</td></tr>
              ) : products.map(p => (
                <tr key={p.id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>{p.code}</td>
                  <td style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</td>
                  <td><span className={styles.badge} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>{p.category}</span></td>
                  <td style={{ fontSize: '0.8rem' }}>{p.brand}</td>
                  <td style={{ fontWeight: 600, color: p.stock === 0 ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>{p.stock} {p.unit}</td>
                  <td style={{ fontWeight: 600 }}>{p.sellPrice.toLocaleString('tr-TR')} {p.currency}</td>
                  <td style={{ fontSize: '0.8rem' }}>{p.vat != null ? `%${p.vat}` : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className={`${styles.btn} ${styles.btnSm}`} onClick={() => openEdit(p)}><Edit size={13} /></button>
                      <button className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`} onClick={() => handleDelete(p.id)}><Trash2 size={13} /></button>
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
              <h2 className={styles.modalTitle}>{editingId ? 'Ürünü Düzenle' : 'Yeni Ürün'}</h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSave} className={styles.formGrid2}>
              <div className={`${styles.formGroup} ${styles.fullSpan}`}>
                <label className={styles.formLabel}>Ürün Adı *</label>
                <input className={styles.formInput} required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ürün Kodu</label>
                <input className={styles.formInput} value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Marka</label>
                <input className={styles.formInput} value={form.brand || ''} onChange={e => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Kategori</label>
                <input className={styles.formInput} value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} list="skt-categories" />
                <datalist id="skt-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Stok</label>
                <input className={styles.formInput} type="number" value={form.stock ?? 0} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Birim</label>
                <input className={styles.formInput} value={form.unit || 'Adet'} onChange={e => setForm({ ...form, unit: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Satış Fiyatı</label>
                <input className={styles.formInput} type="number" step="0.01" value={form.sellPrice ?? 0} onChange={e => setForm({ ...form, sellPrice: Number(e.target.value) })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Para Birimi</label>
                <select className={styles.formSelect} value={form.currency || 'USD'} onChange={e => setForm({ ...form, currency: e.target.value })}>
                  {['USD','EUR','TRY','GBP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>KDV (%)</label>
                <input className={styles.formInput} type="number" value={form.vat ?? 20} onChange={e => setForm({ ...form, vat: Number(e.target.value) })} />
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
