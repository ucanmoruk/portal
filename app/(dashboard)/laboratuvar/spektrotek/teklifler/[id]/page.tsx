'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Printer, Copy, Plus, Trash2, Search } from 'lucide-react';
import {
  getQuote, getQuoteItems, saveQuote, createRevision,
} from '@/lib/spektrotek/quoteActions';
import { getProducts } from '@/lib/spektrotek/productActions';
import { getExchangeRates } from '@/lib/spektrotek/exchangeRates';
import type { SktQuote, SktQuoteItem, SktProduct } from '@/lib/spektrotek/types';
import styles from '../../spektrotek.module.css';

interface ExtendedItem extends SktQuoteItem { note?: string }
type ItemValue = ExtendedItem[keyof ExtendedItem];

export default function TeklifDetay({ params }: { params: Promise<{ id: string }> }) {
  const { id: quoteId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPrint = searchParams.get('print') === 'true';
  const returnTo = searchParams.get('returnTo');
  const backHref = returnTo?.startsWith('/laboratuvar/spektrotek/teklif-detaylari')
    ? returnTo
    : '/laboratuvar/spektrotek/teklifler';

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

  const loadData = useCallback(async () => {
    await Promise.resolve();
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
  }, [quoteId]);

  useEffect(() => { void (async () => { await loadData(); })(); }, [loadData]);

  async function openProductModal() {
    setProdModalOpen(true);
    if (products.length > 0) return;
    setProdsLoading(true);
    const data = await getProducts({ page: 1, limit: 2000 });
    setProducts(data.products);
    setProdsLoading(false);
  }

  function addProduct(p: SktProduct) {
    const itemBase: Omit<ExtendedItem, 'id'> = {
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
    setItems(prev => [...prev, { ...itemBase, id: `tmp-${prev.length + 1}` }]);
    setProdModalOpen(false);
  }

  function changeItem(idx: number, field: keyof ExtendedItem, val: ItemValue) {
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
    const quoteDate = quote.date ? new Date(quote.date) : new Date();
    const validUntil = new Date(quoteDate);
    validUntil.setDate(validUntil.getDate() + 30);
    const terms = quote.notes?.trim() || '1. Ödeme yöntemimiz siparişte peşindir.\n2. Fatura tutarı, fatura tarihindeki TCMB döviz satış kurundan hesaplanır.\n3. Teslim süresi stok durumuna göre ayrıca teyit edilir.';

    return (
      <div style={{ minHeight: '100vh', background: '#eef2f7', padding: '24px 0', boxSizing: 'border-box' }}>
        <style>{`
          @page { size: A4; margin: 12mm; }
          @media print {
            html, body { background: #fff !important; }
            .no-print { display: none !important; }
            .print-shell { width: auto !important; min-height: auto !important; margin: 0 !important; box-shadow: none !important; border: none !important; }
            .print-bg { background: #fff !important; padding: 0 !important; }
            thead { display: table-header-group; }
            tr, .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          }
        `}</style>
        <div className="print-bg" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: 'white', color: '#172033', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11, lineHeight: 1.45, boxShadow: '0 18px 60px rgba(15, 23, 42, 0.16)', boxSizing: 'border-box' }}>
          <div className="print-shell" style={{ minHeight: '297mm', padding: '18mm 16mm 14mm', boxSizing: 'border-box', borderTop: '8px solid #12324a' }}>
            <header style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, alignItems: 'start', marginBottom: 24 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 6, background: '#12324a', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 800, letterSpacing: 0 }}>
                    ST
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#12324a', letterSpacing: 0 }}>Spektrotek</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Laboratuvar Cihazları ve Teknik Çözümler</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#475569', lineHeight: 1.65 }}>
                  Spektrotek Lab. Cihazları Paz. Pr. ve Dan. A.Ş.<br />
                  Atatürk Mah. Hadımköy Yolu Cad. No 10/7, Esenyurt / İstanbul<br />
                  info@spektrotek.com
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#12324a', marginBottom: 10 }}>Fiyat Teklifi</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <tbody>
                    {[
                      ['Teklif No', `#${quote.quoteNo}/${quote.rev ?? 0}`],
                      ['Tarih', quoteDate.toLocaleDateString('tr-TR')],
                      ['Geçerlilik', validUntil.toLocaleDateString('tr-TR')],
                      ['Sunan', quote.salesPersonName || '-'],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ padding: '3px 0', color: '#64748b' }}>{label}</td>
                        <td style={{ padding: '3px 0', fontWeight: 700, color: '#172033' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </header>

            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
              <div className="avoid-break" style={{ border: '1px solid #d8e0ea', borderRadius: 6, padding: 12, minHeight: 88 }}>
                <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Müşteri</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#12324a', marginBottom: 4 }}>{quote.customerName || '-'}</div>
                <div style={{ color: '#475569', whiteSpace: 'pre-wrap' }}>{quote.customerAddress || '-'}</div>
                {quote.customerEmail && <div style={{ color: '#475569', marginTop: 4 }}>{quote.customerEmail}</div>}
              </div>

              <div className="avoid-break" style={{ border: '1px solid #d8e0ea', borderRadius: 6, padding: 12, minHeight: 88 }}>
                <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Teklif Özeti</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px' }}>
                  <span style={{ color: '#64748b' }}>Para Birimi</span><b>{cur}</b>
                  <span style={{ color: '#64748b' }}>Durum</span><b>{quote.status || '-'}</b>
                  <span style={{ color: '#64748b' }}>Talep No</span><b>{quote.requestDisplayNo ? `#${quote.requestDisplayNo}` : '-'}</b>
                  <span style={{ color: '#64748b' }}>Kalem Sayısı</span><b>{items.length}</b>
                </div>
              </div>
            </section>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 10 }}>
              <thead>
                <tr style={{ background: '#12324a', color: 'white' }}>
                  {[
                    ['No', 'left'],
                    ['Kod', 'left'],
                    ['Açıklama', 'left'],
                    ['Miktar', 'center'],
                    ['B. Fiyat', 'right'],
                    ['KDV', 'right'],
                    ['Toplam', 'right'],
                  ].map(([label, align]) => (
                    <th key={label} style={{ padding: '8px 8px', textAlign: align as React.CSSProperties['textAlign'], fontWeight: 800, borderRight: '1px solid rgba(255,255,255,0.18)' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id || i} className="avoid-break" style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px', color: '#64748b', verticalAlign: 'top' }}>{i + 1}</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', color: '#475569', verticalAlign: 'top' }}>{it.productCode || '-'}</td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, color: '#172033' }}>{it.productName || it.description || '-'}</div>
                      {it.description && it.description !== it.productName && <div style={{ color: '#475569', marginTop: 2 }}>{it.description}</div>}
                      {it.note && <div style={{ color: '#b45309', fontSize: 9, marginTop: 4 }}>Not: {it.note}</div>}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{it.quantity} {it.unit}</td>
                    <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{fmt(it.price)} {cur}</td>
                    <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>%{it.vatRate ?? 0}</td>
                    <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'top', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmt(it.totalAmount || it.amount)} {cur}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <section className="avoid-break" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, alignItems: 'start', marginBottom: 22 }}>
              <div style={{ border: '1px solid #d8e0ea', borderRadius: 6, padding: 12 }}>
                <div style={{ color: '#12324a', fontWeight: 800, marginBottom: 6 }}>Teklif Şartları</div>
                <div style={{ color: '#475569', whiteSpace: 'pre-wrap', fontSize: 10 }}>{terms}</div>
                {rates && cur !== 'TRY' && (
                  <div style={{ marginTop: 10, color: '#64748b', fontSize: 9 }}>
                    Bilgi amaçlı kur: USD {rates.USD.toFixed(4)} TL · EUR {rates.EUR.toFixed(4)} TL · GBP {rates.GBP.toFixed(4)} TL
                  </div>
                )}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 8px', color: '#64748b', textAlign: 'right' }}>Ara Toplam</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt(subTotal)} {cur}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', color: '#64748b', textAlign: 'right' }}>KDV</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt(totalVat)} {cur}</td>
                  </tr>
                  {discountAmt > 0 && (
                    <tr>
                      <td style={{ padding: '6px 8px', color: '#b91c1c', textAlign: 'right' }}>İskonto</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>-{fmt(discountAmt)} {cur}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: '2px solid #12324a' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 800, textAlign: 'right', color: '#12324a' }}>Genel Toplam</td>
                    <td style={{ padding: '10px 8px', fontWeight: 900, textAlign: 'right', fontSize: 15, color: '#12324a' }}>{fmt(grandTotal)} {cur}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <footer className="avoid-break" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 24, paddingTop: 18, borderTop: '1px solid #d8e0ea' }}>
              <div style={{ color: '#64748b', fontSize: 9 }}>
                Bu teklif, belirtilen geçerlilik tarihi sonuna kadar geçerlidir. Sipariş onayı sonrasında teslim ve ödeme koşulları nihai olarak teyit edilir.
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ height: 34 }} />
                <div style={{ display: 'inline-block', minWidth: 180, borderTop: '1px solid #94a3b8', paddingTop: 6, color: '#12324a', fontWeight: 800 }}>
                  {quote.salesPersonName || 'Yetkili'}
                </div>
              </div>
            </footer>

            <div className="no-print" style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', gap: 8 }}>
              <button onClick={() => window.close()} style={{ padding: '10px 16px', background: '#fff', color: '#172033', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                Kapat
              </button>
              <button onClick={() => window.print()} style={{ padding: '10px 20px', background: '#0f6fbf', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 800 }}>
                Yazdır / PDF
              </button>
            </div>
          </div>
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
          <button className={styles.btn} onClick={() => router.push(backHref)}>
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
