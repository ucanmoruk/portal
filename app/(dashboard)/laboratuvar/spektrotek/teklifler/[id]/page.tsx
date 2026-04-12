'use client';

import { use, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Printer, Copy, Plus, Trash2, Search } from 'lucide-react';
import {
  getQuote, getQuoteItems, saveQuote, createRevision, updateQuoteStatus,
} from '@/lib/spektrotek/quoteActions';
import { getProducts } from '@/lib/spektrotek/productActions';
import { getExchangeRates } from '@/lib/spektrotek/exchangeRates';
import type { SktQuote, SktQuoteItem, SktProduct } from '@/lib/spektrotek/types';
import styles from '../../spektrotek.module.css';

interface ExtendedItem extends SktQuoteItem { note?: string }

export default function TeklifDetay({ params }: { params: Promise<{ id: string }> }) {
  const { id: quoteId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPrint = searchParams.get('print') === 'true';

  const [quote, setQuote]   = useState<SktQuote | null>(null);
  const [items, setItems]   = useState<ExtendedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // product picker modal
  const [prodModalOpen, setProdModalOpen]   = useState(false);
  const [products, setProducts]             = useState<SktProduct[]>([]);
  const [prodSearch, setProdSearch]         = useState('');
  const [prodsLoading, setProdsLoading]     = useState(false);

  // exchange rates (for display)
  const [rates, setRates] = useState<{ USD: number; EUR: number; GBP: number } | null>(null);

  // discount
  const [discountAmt, setDiscountAmt] = useState(0);

  useEffect(() => { loadData(); }, [quoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    const [q, i] = await Promise.all([getQuote(quoteId), getQuoteItems(quoteId)]);
    setQuote(q);
    const mapped: ExtendedItem[] = i.map(item => {
      const parts = (item.description || '').split('\nNot: ');
      return { ...item, description: parts[0], note: parts[1] || '' };
    });
    setItems(mapped);
    if (q?.discount) setDiscountAmt(q.discount);
    getExchangeRates().then(setRates).catch(() => {});
    setLoading(false);
  }

  async function openProductModal() {
    setProdModalOpen(true);
    if (products.length > 0) return;
    setProdsLoading(true);
    const data = await getProducts({ page: 1, limit: 2000 });
    setProducts(data.products);
    setProdsLoading(false);
  }

  function addProduct(p: SktProduct) {
    const item: ExtendedItem = {
      id: 'tmp-' + Date.now(),
      quoteId,
      productId: parseInt(p.id),
      productCode: p.code,
      productName: p.name,
      description: p.name,
      brand: p.brand,
      quantity: 1,
      unit: p.unit,
      price: p.sellPrice,
      vatRate: p.vat ?? 20,
      amount: p.sellPrice,
      vatAmount: p.sellPrice * ((p.vat ?? 20) / 100),
      totalAmount: p.sellPrice * (1 + (p.vat ?? 20) / 100),
      note: '',
    };
    setItems(prev => [...prev, item]);
    setProdModalOpen(false);
  }

  function changeItem(idx: number, field: keyof ExtendedItem, val: any) {
    const next = [...items];
    const it = { ...next[idx], [field]: val };
    if (['quantity', 'price', 'vatRate'].includes(field as string)) {
      const qty   = field === 'quantity' ? Number(val) : it.quantity;
      const price = field === 'price'    ? Number(val) : it.price;
      const vat   = field === 'vatRate'  ? Number(val) : it.vatRate;
      it.amount      = qty * price;
      it.vatAmount   = it.amount * (vat / 100);
      it.totalAmount = it.amount + it.vatAmount;
    }
    next[idx] = it;
    setItems(next);
  }

  // totals
  const subTotal   = items.reduce((s, i) => s + (i.amount || 0), 0);
  const totalVat   = items.reduce((s, i) => s + (i.vatAmount || 0), 0);
  const grandTotal = items.reduce((s, i) => s + (i.totalAmount || 0), 0) - discountAmt;

  async function handleSave() {
    if (!quote || saving) return;
    setSaving(true);
    const toSave = items.map(it => ({
      ...it,
      description: it.description + (it.note?.trim() ? `\nNot: ${it.note}` : ''),
    }));
    const res = await saveQuote(quoteId, { ...quote, amount: grandTotal, discount: discountAmt }, toSave);
    setSaving(false);
    if (res.success) loadData(); else alert('Kaydetme hatası.');
  }

  async function handleRevision() {
    if (!quote || !confirm('Bu teklifin yeni bir revizyonunu oluşturmak istiyor musunuz?')) return;
    setSaving(true);
    const res = await createRevision(quoteId);
    setSaving(false);
    if (res.success && res.newQuoteId) router.push(`/laboratuvar/spektrotek/teklifler/${res.newQuoteId}`);
    else alert('Revizyon oluşturulamadı.');
  }

  const isEditable = quote?.status === 'Hazırlanıyor';
  const cur = quote?.currency || 'USD';
  const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2 });

  const filteredProducts = products.filter(p =>
    !prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase()) || p.code?.toLowerCase().includes(prodSearch.toLowerCase())
  );

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Yükleniyor…</div>;
  if (!quote)  return <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-danger)' }}>Teklif bulunamadı.</div>;

  // ── Print view ────────────────────────────────────────────────────────────
  if (isPrint) {
    return (
      <div style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: 'white', fontFamily: 'system-ui,sans-serif', fontSize: 11, color: '#2C3E50', padding: '40px 50px', boxSizing: 'border-box' }}>
        <style>{`@media print { .no-print { display: none !important; } }`}</style>
        <div style={{ height: 8, background: '#2C3E50', margin: '-40px -50px 32px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.6 }}>Spektrotek Lab. Cihazları Paz. Pr. ve Dan. A.Ş.<br />Atatürk Mah. Hadımköy Yolu Cad. No 10/7, Esenyurt / İstanbul<br />info@spektrotek.com</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Fiyat Teklifi</div>
            <div style={{ fontSize: 10, lineHeight: 1.8 }}>
              <div><b>Tarih:</b> {new Date(quote.date).toLocaleDateString('tr-TR')}</div>
              <div><b>Teklif No:</b> #{quote.quoteNo}/{quote.rev ?? 0}</div>
              <div><b>Sunan:</b> {quote.salesPersonName}</div>
              <div><b>Geçerlilik:</b> 30 Gün</div>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Sayın</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{quote.customerName}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>{quote.customerAddress}</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#2C3E50', color: 'white' }}>
              {['No','Kod','Açıklama','Miktar','B.Fiyat','Toplam'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Toplam' || h === 'B.Fiyat' ? 'right' : 'left', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 10px' }}>{i + 1}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>{it.productCode || '—'}</td>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600 }}>{it.productName}</div>
                  {it.description && it.description !== it.productName && <div>{it.description}</div>}
                  {it.note && <div style={{ color: '#d76527', fontStyle: 'italic', fontSize: 10 }}>Not: {it.note}</div>}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>{it.quantity} {it.unit}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(it.price)} {cur}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(it.amount)} {cur}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <table style={{ width: 280, fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '4px 8px', color: '#64748b', textAlign: 'right' }}>Ara Toplam:</td><td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(subTotal)} {cur}</td></tr>
              {discountAmt > 0 && <tr><td style={{ padding: '4px 8px', color: '#ef4444', textAlign: 'right' }}>İskonto:</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#ef4444' }}>-{fmt(discountAmt)} {cur}</td></tr>}
              <tr><td style={{ padding: '4px 8px', color: '#64748b', textAlign: 'right' }}>KDV:</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#64748b' }}>{fmt(totalVat)} {cur}</td></tr>
              <tr style={{ borderTop: '2px solid #2C3E50' }}>
                <td style={{ padding: '8px', fontWeight: 700, textAlign: 'right', fontSize: 12 }}>Genel Toplam:</td>
                <td style={{ padding: '8px', fontWeight: 800, textAlign: 'right', fontSize: 14 }}>{fmt(grandTotal)} {cur}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {quote.notes && (
          <div style={{ marginTop: 24, fontSize: 10, color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <b style={{ color: '#2C3E50', display: 'block', marginBottom: 4 }}>TEKLİF ŞARTLARI</b>
            <div style={{ whiteSpace: 'pre-wrap' }}>{quote.notes}</div>
          </div>
        )}
        <div className="no-print" style={{ position: 'fixed', bottom: 24, right: 24 }}>
          <button onClick={() => window.print()} style={{ padding: '10px 20px', background: '#0071e3', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            Yazdır / PDF
          </button>
        </div>
      </div>
    );
  }

  // ── Normal view ───────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className={styles.btn} onClick={() => router.push('/laboratuvar/spektrotek/teklifler')}>
            <ArrowLeft size={14} />
          </button>
          <div>
            <h1 className={styles.title}>Teklif #{quote.quoteNo}/{quote.rev ?? 0}</h1>
            <p className={styles.subtitle}>{quote.customerName}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className={styles.badge} style={{ padding: '4px 12px', background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', alignSelf: 'center' }}>
            {quote.status}
          </span>
          <button className={styles.btn} onClick={() => window.open(`?print=true`, '_blank')}><Printer size={14} /> Önizle</button>
          {isEditable ? (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={saving}>
              <Save size={14} /> {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          ) : (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleRevision} disabled={saving}>
              <Copy size={14} /> {saving ? 'İşleniyor…' : 'Revize Et'}
            </button>
          )}
        </div>
      </div>

      {/* Info row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--color-border-light)' }}>Teklif Bilgileri</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.85rem' }}>
            <div>
              <div style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Tarih</div>
              <div>{new Date(quote.date).toLocaleDateString('tr-TR')}</div>
            </div>
            <div>
              <div style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Para Birimi</div>
              <select
                className={styles.filterSelect}
                value={quote.currency || 'USD'}
                disabled={!isEditable}
                onChange={e => setQuote({ ...quote, currency: e.target.value })}
                style={{ padding: '2px 6px', fontSize: '0.85rem' }}
              >
                {['USD','EUR','TRY','GBP'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Plasiyer</div>
              <div>{quote.salesPersonName}</div>
            </div>
            <div>
              <div style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>İlgili Talep</div>
              <a href={`/laboratuvar/spektrotek/talepler/${quote.requestDisplayNo}`} style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>
                #{quote.requestDisplayNo}
              </a>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ color: 'var(--color-text-tertiary)', marginBottom: 4, fontSize: '0.85rem' }}>Notlar</div>
            <textarea
              className={styles.formTextarea}
              value={quote.notes || ''}
              disabled={!isEditable}
              onChange={e => setQuote({ ...quote, notes: e.target.value })}
              style={{ width: '100%', minHeight: 60, fontSize: '0.85rem' }}
            />
          </div>
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--color-border-light)' }}>TCMB Kurlar</h3>
          {rates ? (
            <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['USD','EUR','GBP'] as const).map(k => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{rates[k].toFixed(4)} ₺</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8rem', textAlign: 'center', padding: 16 }}>Yükleniyor…</div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Ürünler / Hizmetler</h3>
          {isEditable && (
            <button className={`${styles.btn} ${styles.btnSm}`} onClick={openProductModal}>
              <Plus size={13} /> Ürün Ekle
            </button>
          )}
        </div>
        <div className={styles.overflowX}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Kod</th>
                <th>Açıklama</th>
                <th style={{ width: 70 }}>Miktar</th>
                <th style={{ width: 55 }}>Birim</th>
                <th style={{ width: 100, textAlign: 'right' }}>B.Fiyat</th>
                <th style={{ width: 60, textAlign: 'right' }}>KDV%</th>
                <th style={{ width: 100, textAlign: 'right' }}>Toplam</th>
                {isEditable && <th style={{ width: 36 }}></th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={isEditable ? 8 : 7} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>Henüz ürün eklenmemiş.</td></tr>
              ) : items.map((it, idx) => (
                <tr key={it.id}>
                  <td style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{it.productCode || '—'}</td>
                  <td>
                    <input
                      disabled={!isEditable}
                      value={it.description || ''}
                      onChange={e => changeItem(idx, 'description', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '0.85rem' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>Not:</span>
                      <input
                        disabled={!isEditable}
                        value={it.note || ''}
                        onChange={e => changeItem(idx, 'note', e.target.value)}
                        style={{ width: '100%', border: 'none', background: isEditable ? 'var(--color-surface-2)' : 'transparent', fontSize: '0.75rem', padding: '1px 4px', borderRadius: 2, outline: 'none' }}
                        placeholder="..."
                      />
                    </div>
                  </td>
                  <td>
                    <input type="number" disabled={!isEditable} value={it.quantity}
                      onChange={e => changeItem(idx, 'quantity', e.target.value)}
                      style={{ width: '100%', padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: '0.85rem', textAlign: 'center' }} />
                  </td>
                  <td>
                    <input disabled={!isEditable} value={it.unit}
                      onChange={e => changeItem(idx, 'unit', e.target.value)}
                      style={{ width: '100%', padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: '0.85rem' }} />
                  </td>
                  <td>
                    <input type="number" disabled={!isEditable} value={it.price} step="0.01"
                      onChange={e => changeItem(idx, 'price', e.target.value)}
                      style={{ width: '100%', padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: '0.85rem', textAlign: 'right' }} />
                  </td>
                  <td>
                    <input type="number" disabled={!isEditable} value={it.vatRate ?? 0}
                      onChange={e => changeItem(idx, 'vatRate', e.target.value)}
                      style={{ width: '100%', padding: '2px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: '0.85rem', textAlign: 'right' }} />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>{fmt(it.totalAmount)}</td>
                  {isEditable && (
                    <td>
                      <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: 4 }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <div style={{ width: 280, fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--color-text-secondary)' }}>
              <span>Ara Toplam:</span><span style={{ fontWeight: 600 }}>{fmt(subTotal)} {cur}</span>
            </div>
            {isEditable && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>İskonto:</span>
                <input type="number" value={discountAmt} step="0.01" onChange={e => setDiscountAmt(Number(e.target.value))}
                  style={{ width: 100, padding: '2px 6px', border: '1px solid var(--color-border)', borderRadius: 4, textAlign: 'right', fontSize: '0.85rem' }} />
              </div>
            )}
            {!isEditable && discountAmt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--color-danger)' }}>
                <span>İskonto:</span><span>-{fmt(discountAmt)} {cur}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--color-text-secondary)' }}>
              <span>KDV:</span><span>{fmt(totalVat)} {cur}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid var(--color-border)', marginTop: 4, fontWeight: 800, fontSize: '1rem' }}>
              <span>Genel Toplam:</span><span>{fmt(grandTotal)} {cur}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Product Picker Modal */}
      {prodModalOpen && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setProdModalOpen(false)}>
          <div className={styles.modal} style={{ maxWidth: 680 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Ürün Seç</h2>
              <button className={styles.modalClose} onClick={() => setProdModalOpen(false)}>×</button>
            </div>
            <div className={styles.searchBox} style={{ marginBottom: 12 }}>
              <Search size={14} color="var(--color-text-tertiary)" />
              <input className={styles.searchInput} placeholder="Ürün adı veya kodu..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} autoFocus />
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {prodsLoading ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-tertiary)' }}>Yükleniyor…</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>Kod</th><th>Ürün Adı</th><th>Marka</th><th style={{ textAlign: 'right' }}>Fiyat</th><th style={{ width: 36 }}></th></tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>Ürün bulunamadı.</td></tr>
                    ) : filteredProducts.slice(0, 100).map(p => (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => addProduct(p)}>
                        <td style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{p.code}</td>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td style={{ fontSize: '0.8rem' }}>{p.brand}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.sellPrice.toLocaleString('tr-TR')} {p.currency}</td>
                        <td>
                          <button className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`} onClick={e => { e.stopPropagation(); addProduct(p); }}>
                            <Plus size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
