"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UNIQUE_STATUSES, UNIQUE_CATEGORIES, type UniqueRequest } from "@/lib/uniqueTalepRules";
import { hydrateCrmOffer, type CrmOffer, type CrmService, type CrmPackage } from "@/lib/crmOffer";
import { uniqueMailSignatureHtml } from "@/lib/uniqueMailSignature";
import table from "@/app/styles/table.module.css";
import styles from "../spektrotek-talep/requests.module.css";
import ui from "./unique-talep.module.css";

type Firm = { ID: number; Ad: string };
async function jsonApi(url: string, body?: unknown) {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "İşlem tamamlanamadı."); return result;
}
export default function UniqueRequestDetail({ id }: { id: string }) {
  const [item, setItem] = useState<UniqueRequest | null>(null), [offer, setOffer] = useState<CrmOffer | null>(null);
  const [services, setServices] = useState<CrmService[]>([]), [packages, setPackages] = useState<CrmPackage[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [companySearch, setCompanySearch] = useState(""), [firms, setFirms] = useState<Firm[]>([]), [selectedCompany, setSelectedCompany] = useState("");
  const [serviceSearch, setServiceSearch] = useState(""), [selectedService, setSelectedService] = useState(""), [selectedPackage, setSelectedPackage] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await jsonApi(`/api/unique-talep/${id}`); setItem(result.item); setOffer(result.item.offer || { recipient: result.item.companyName || result.item.name, email: result.item.email, subject: result.item.subject,
        replySubject: `Re: ${result.item.subject}`, replyBody: "Sayın Yetkili,\n\nTalebiniz için teşekkür ederiz. Fiyat teklifimizi ekte bilgilerinize sunarız.\n\nİyi çalışmalar dilerim.", warnings: [], items: [] });
      setServices(result.services); setPackages(result.packages); setCompanySearch(result.item.companyName || result.item.name);
    } catch (e) { setError(e instanceof Error ? e.message : "Talep okunamadı."); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/teklifler/lookup?type=musteriler&q=${encodeURIComponent(companySearch)}`, { signal: controller.signal })
        .then(r => r.ok ? r.json() : Promise.reject(new Error("Firma listesi okunamadı.")))
        .then(result => setFirms(result.data || [])).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [companySearch]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!item || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await jsonApi(`/api/unique-talep/${id}`, { action, version: item.version, ...(action === "draft" || action === "quote" || action === "send" ? { offer } : {}), ...extra });
      setItem(result.item); if (result.item.offer && action !== "edit") setOffer(result.item.offer);
      setNotice(action === "send" ? "Yanıt ve PDF teklif gönderildi. Talep durumu Teklif Gönderildi olarak güncellendi." : action === "analyze" ? "Teklif ve yanıt taslağı hazır. Kapsamı ve fiyatları kontrol edin." : action === "quote" ? "Teklif, teklif listesine kaydedildi." : "Değişiklikler kaydedildi.");
    } catch (e) { setError(e instanceof Error ? e.message : "İşlem tamamlanamadı. Sayfayı yenileyerek durumu kontrol edin."); }
    finally { setBusy(false); }
  }
  async function createFirm() {
    if (!item || busy || !companySearch.trim()) return;
    setBusy(true); setError("");
    try {
      const result = await jsonApi("/api/firmalar", { Ad: companySearch.trim(), Email: item.email, Yetkili: item.name });
      const saved = await jsonApi(`/api/unique-talep/${id}`, { action: "edit", version: item.version, companyId: Number(result.id) });
      setItem(saved.item); setSelectedCompany(String(result.id)); setNotice("Firma oluşturuldu ve talebe eşleştirildi.");
    } catch (e) { setError(e instanceof Error ? e.message : "Firma eklenemedi."); }
    finally { setBusy(false); }
  }
  function addCatalog(serviceId?: number, packageId?: number) {
    if (!offer) return;
    const extra = hydrateCrmOffer({ recipient: offer.recipient, email: offer.email, subject: offer.subject, replySubject: "", replyBody: "", warnings: [], items: serviceId ? [{ serviceId, quantity: 1, products: [] }] : [], packages: packageId ? [{ packageId, quantity: 1, products: [] }] : [] }, services, packages);
    const groupSuffix = Date.now();
    setOffer({ ...offer, items: [...offer.items, ...extra.items.map(line => ({ ...line, packageGroup: line.packageGroup ? `${line.packageGroup}-${groupSuffix}` : null }))], warnings: [...offer.warnings, ...extra.warnings] });
  }
  if (!item || !offer) return <div className={table.page}><h1 className={table.pageTitle}>Unique Talep</h1>{error ? <p role="alert">{error}</p> : <p>Talep yükleniyor…</p>}<Link href="/iletisim/unique-talep">Talep listesine dön</Link></div>;
  const locked = busy || !!item.sentAt || ["Hazırlanıyor", "Gönderiliyor", "Belirsiz"].includes(item.mailState);
  const totals = offer.items.reduce<Record<string, number>>((acc, line) => { acc[line.currency] = (acc[line.currency] || 0) + line.quantity * line.price; return acc; }, {});
  return <div className={`${table.page} ${styles.page}`}>
    <div className={table.pageHeader}><div><h1 className={table.pageTitle}>Unique Talep #{item.id}</h1><p className={table.pageSubtitle}>{item.companyName || item.name} · {item.status}</p></div><div className={styles.actions}><Link className={styles.button} href="/iletisim/unique-talep">Talep listesi</Link><button className={styles.button} disabled={busy} onClick={() => void load()}>Kaydı yenile</button>{item.quoteId && <Link className={styles.button} target="_blank" href={`/teklif-print/${item.quoteId}`}>Teklifi önizle #{item.quoteId}</Link>}</div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {item.error && <p className={styles.error} role="alert">{item.error}</p>}
    <section className={`${styles.editor} ${ui.card}`} aria-label="E-posta gönderim kaydı">
      <h2>E-posta gönderim kaydı</h2>
      <p className={styles.muted}>Durum: <strong>{item.mailState}</strong> · Gönderen: info@uniqueanalyse.com</p>
      {item.mailLog?.length ? <div className={ui.stack}>{[...item.mailLog].reverse().map((entry, index) => <details key={`${entry.startedAt}-${index}`} open={index === 0}>
        <summary>{new Date(entry.startedAt).toLocaleString("tr-TR")} · {entry.state}</summary>
        <dl className={ui.mailLog}>
          <dt>Alıcı (To)</dt><dd>{entry.to}</dd><dt>Bilgi (CC)</dt><dd>{entry.cc || "Yok"}</dd>
          <dt>Konu</dt><dd>{entry.subject}</dd><dt>Ek</dt><dd>{entry.attachment}</dd>
          <dt>İşlemi başlatan kullanıcı</dt><dd>{entry.by}</dd>
          <dt>Tamamlanma zamanı</dt><dd>{entry.completedAt ? new Date(entry.completedAt).toLocaleString("tr-TR") : "Sonuç kaydı bekleniyor"}</dd>
          <dt>Sunucunun kabul ettiği adresler</dt><dd>{entry.accepted?.join(", ") || "Kayıt yok"}</dd>
          <dt>Sunucunun reddettiği adresler</dt><dd>{entry.rejected ? entry.rejected.join(", ") || "Yok" : "Kayıt yok"}</dd>
          <dt>Mesaj kimliği</dt><dd>{entry.messageId || "Kayıt yok"}</dd>
          <dt>SMTP yanıtı</dt><dd>{entry.response || "Kayıt yok"}</dd>
          {entry.errorCode && <><dt>Hata kodu</dt><dd>{entry.errorCode}</dd></>}
        </dl>
      </details>)}</div> : <p className={styles.muted}>{item.sentAt ? `Gönderim zamanı: ${new Date(item.sentAt).toLocaleString("tr-TR")}. Mesaj kimliği: ${item.sentMessageId || "Kayıt yok"}. Bu eski gönderim için To/CC ve SMTP yanıtı saklanmamış.` : "Henüz bir SMTP gönderim kaydı yok."}</p>}
      <p className={styles.muted}>SMTP kabulü, e-postanın alıcı tarafından okunduğu veya gelen kutusuna ulaştığı anlamına gelmez. Belirsiz sonuçlarda tekrar göndermeden önce posta sunucusu kayıtlarını kontrol edin.</p>
    </section>
    <div className={ui.grid}>
      <section className={`${styles.editor} ${ui.card}`}><h2>Gelen e-posta</h2><p><strong>{item.subject}</strong></p><p className={styles.muted}>{item.name} &lt;{item.email}&gt;<br />{new Date(item.date).toLocaleString("tr-TR")}</p><pre className={ui.mailText}>{item.text}</pre><p className={styles.muted}>{item.reason}</p>
        <fieldset className={styles.fields} disabled={busy || ["Hazırlanıyor", "Gönderiliyor", "Belirsiz"].includes(item.mailState)}><label>Sınıf<select value={item.category} onChange={e => void act("edit", { category: e.target.value })}>{UNIQUE_CATEGORIES.map(s => <option key={s}>{s}</option>)}</select></label><label>Durum<select value={item.status} onChange={e => void act("edit", { status: e.target.value })}>{UNIQUE_STATUSES.map(s => <option key={s}>{s}</option>)}</select></label><label className={styles.wide}><span><input type="checkbox" checked={item.potential} onChange={e => void act("edit", { potential: e.target.checked })} /> Potansiyel müşteri</span></label></fieldset>
      </section>
      <div className={ui.stack}>
        <section className={`${styles.editor} ${ui.card}`}><h2>Firma ekle / eşleştir</h2><p className={styles.muted}>{item.companyId ? `${item.companyName} · Firma #${item.companyId}` : "Teklif hazırlamak için müşteriyi mevcut firmayla eşleştirin veya yeni firma açın."}</p><fieldset className={styles.fields} disabled={locked || !!item.quoteId}><label className={styles.wide}>Firma adı / ara<input value={companySearch} onChange={e => { setCompanySearch(e.target.value); setSelectedCompany(""); }} /></label><label className={styles.wide}>Mevcut firma<select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}><option value="">Firma seçin</option>{firms.map(f => <option key={f.ID} value={f.ID}>{f.Ad}</option>)}</select></label><div className={`${styles.actions} ${styles.wide}`}><button className={styles.button} disabled={!selectedCompany} onClick={() => void act("edit", { companyId: Number(selectedCompany) })}>Eşleştir</button><button className={styles.button} disabled={!companySearch.trim()} onClick={() => void createFirm()}>Yeni firma oluştur</button></div></fieldset></section>
        <section className={`${styles.editor} ${ui.card}`}><div className={styles.actions}><h2>Teklif hazırlama</h2><button className={styles.primary} disabled={locked || !!item.quoteId} onClick={() => void act("analyze")}>{busy ? "İşleniyor…" : "Yapay zekâ ile hazırla"}</button></div><p className={styles.muted}>CRM Agent bilgi notları kullanılır. İlk fiyatlar hizmet listesinden gelir; göndermeden önce düzenleyebilirsiniz.</p>
          {offer.warnings.length > 0 && <ul className={ui.warnings}>{offer.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          <fieldset className={styles.fields} disabled={locked}><label className={styles.wide}>Teklif konusu<input maxLength={500} value={offer.subject} onChange={e => setOffer({ ...offer, subject: e.target.value })} /></label>
            <label>Hizmet ara<input value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} /></label><label>Hizmet<select value={selectedService} onChange={e => setSelectedService(e.target.value)}><option value="">Hizmet seçin</option>{services.filter(s => s.Ad.toLocaleLowerCase("tr").includes(serviceSearch.toLocaleLowerCase("tr"))).slice(0, 150).map(s => <option key={s.ID} value={s.ID}>{s.Ad} · {s.Fiyat ?? "Fiyat yok"} {s.ParaBirimi}</option>)}</select></label><button className={styles.button} disabled={!selectedService} onClick={() => addCatalog(Number(selectedService))}>Hizmeti ekle</button><span />
            <label>Paket<select value={selectedPackage} onChange={e => setSelectedPackage(e.target.value)}><option value="">Paket seçin</option>{packages.map(p => <option key={p.ID} value={p.ID}>{p.Ad}</option>)}</select></label><button className={styles.button} disabled={!selectedPackage} onClick={() => addCatalog(undefined, Number(selectedPackage))}>Paket başlığıyla ekle</button>
          </fieldset>
          <div className={ui.lines}><table className={ui.lineTable}><thead><tr><th>Hizmet / uygulanan parametre</th><th>Adet</th><th>Birim fiyat</th><th>İşlem</th></tr></thead><tbody>{offer.items.map((line, index) => <tr key={index}><td><strong>{line.name}</strong>{line.packageTitle && <small>{line.packageTitle}</small>}<small>{line.currency}</small><input className={ui.scopeInput} aria-label={`${line.name} kapsam`} placeholder="Ürün / kapsam" value={line.products?.join("; ") || ""} disabled={locked} onChange={e => setOffer({ ...offer, items: offer.items.map((l, i) => i === index ? { ...l, products: e.target.value.split(";").map(v => v.trim()).filter(Boolean) } : l) })} /></td><td><input aria-label={`${line.name} adet`} disabled={locked} type="number" min={1} step={1} value={line.quantity} onChange={e => setOffer({ ...offer, items: offer.items.map((l, i) => i === index ? { ...l, quantity: Number(e.target.value) } : l) })} /></td><td><input aria-label={`${line.name} fiyat`} disabled={locked} type="number" min={0} step="0.01" value={line.price} onChange={e => setOffer({ ...offer, items: offer.items.map((l, i) => i === index ? { ...l, price: Number(e.target.value) } : l) })} /></td><td><button className={styles.button} disabled={locked} onClick={() => setOffer({ ...offer, items: offer.items.filter((_, i) => i !== index) })}>Kaldır</button></td></tr>)}</tbody></table></div>
          <div className={ui.totals}>{Object.entries(totals).map(([currency, total]) => <p key={currency}>Ara toplam: <strong>{total.toLocaleString("tr-TR")} {currency}</strong> · KDV (%20) dahil: <strong>{(total * 1.2).toLocaleString("tr-TR")} {currency}</strong></p>)}</div>
        </section>
        <section className={`${styles.editor} ${ui.card}`}><h2>E-posta yanıtı</h2><fieldset className={styles.fields} disabled={locked}><label>Alıcı<input type="email" maxLength={320} value={offer.email} onChange={e => setOffer({ ...offer, email: e.target.value })} /></label><label>Konu<input maxLength={500} value={offer.replySubject || ""} onChange={e => setOffer({ ...offer, replySubject: e.target.value })} /></label><label className={styles.wide}>Mail açıklaması<textarea rows={12} maxLength={16000} value={offer.replyBody || ""} onChange={e => setOffer({ ...offer, replyBody: e.target.value })} /></label></fieldset><div className={ui.signature} aria-label="Oğuzhan Eker e-posta imzası" dangerouslySetInnerHTML={{ __html: uniqueMailSignatureHtml() }} /><p className={styles.muted}>Gönderen: info@uniqueanalyse.com. Yanıt metnine bu imza eklenir; teklif PDF dosyası olarak eklenir.</p><div className={styles.actions}><button className={styles.button} disabled={locked} onClick={() => void act("draft")}>Taslağı sakla</button><button className={styles.button} disabled={locked || !item.companyId || !offer.items.length} onClick={() => void act("quote")}>Teklif listesine kaydet</button><button className={styles.primary} disabled={locked || !item.companyId || !offer.items.length} onClick={() => void act("send")}>Yanıt ve PDF teklifi gönder</button></div>{item.sentAt && <p className={styles.notice}>Gönderildi: {new Date(item.sentAt).toLocaleString("tr-TR")}</p>}</section>
      </div>
    </div>
  </div>;
}
