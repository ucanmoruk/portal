"use client";
import { Fragment, useState } from "react";
import type { CrmOffer } from "@/lib/crmOffer";
import ui from "./crm-agent.module.css";
import styles from "@/app/styles/table.module.css";

export default function CrmOfferEditor({ initial, draftId, firms }: { initial: CrmOffer; draftId: number; firms: { ID: number; Ad: string }[] }) {
  const [offer, setOffer] = useState(initial);
  const [tab, setTab] = useState<"offer" | "email">("offer");
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [savedId, setSavedId] = useState<number | null>(initial.savedId || null), [sent, setSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [newCustomerId, setNewCustomerId] = useState<number | null>(null);
  async function api(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "İşlem tamamlanamadı.");
    return result;
  }
  async function persist(id = savedId) {
    const response = await fetch("/api/crm-agent/drafts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draftId, offer: { ...offer, savedId: id } }) });
    if (!response.ok) throw new Error("Taslak değişiklikleri saklanamadı.");
  }
  async function saveDraft() {
    setBusy(true); setError(""); setNotice("");
    try { await persist(); setNotice("Taslak değişiklikleri saklandı."); }
    catch (e) { setError(e instanceof Error ? e.message : "Taslak saklanamadı."); }
    finally { setBusy(false); }
  }
  async function save(send: boolean) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!offer.recipient.trim() || !offer.items.length || offer.items.some(i => !Number.isFinite(i.price) || i.price < 0 || !Number.isInteger(i.quantity) || i.quantity < 1)) throw new Error("Alıcı adı, hizmet, geçerli adet ve fiyat giriniz.");
      if (send && !offer.replyBody?.trim()) throw new Error("Göndermeden önce e-posta yanıtını hazırlayın.");
      if (send && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(offer.email.trim())) throw new Error("Geçerli bir alıcı e-posta adresi giriniz.");
      let id = savedId;
      if (!id) {
        let musteriId = Number(customer) || newCustomerId;
        if (!musteriId) {
          const found = await fetch(`/api/teklifler/lookup?type=musteriler&q=${encodeURIComponent(offer.recipient.trim())}`).then(r => r.json());
          const matches = (found.data || []).filter((f: { Ad: string }) => f.Ad.trim().toLocaleLowerCase("tr") === offer.recipient.trim().toLocaleLowerCase("tr"));
          if (matches.length > 1) throw new Error("Aynı isimde birden fazla müşteri var; mevcut müşteri seçiniz.");
          if (matches.length === 1) musteriId = matches[0].ID;
          else { musteriId = (await api("/api/firmalar", { Ad: offer.recipient.trim(), Email: offer.email.trim() })).id; setNewCustomerId(musteriId); }
        }
        const result = await api("/api/teklifler", { musteriId, teklifKonusu: offer.subject, kisaAciklama: offer.subject, notlar: "CRM Agent taslağından oluşturuldu.", kdvOran: 20, satirlar: offer.items.map(i => ({ hizmetId: i.serviceId, hizmetAdi: i.name, adet: i.quantity, fiyat: i.price, paraBirimi: i.currency, metot: i.method, akreditasyon: i.accreditation, iskonto: 0, notlar: i.products?.join("; ").slice(0, 500) || "", paketGrup: i.packageGroup || null, paketAdi: i.packageTitle || null })) });
        id = result.id; setSavedId(id);
      }
      await persist(id);
      if (send) { await api(`/api/teklifler/${id}/mail`, { to: [offer.email.trim()], konu: offer.replySubject?.trim() || offer.subject, mesaj: offer.replyBody || "" }); setSent(true); }
    } catch (e) { setError(e instanceof Error ? e.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }
  const totals = offer.items.reduce<Record<string, number>>((acc, item) => { acc[item.currency] = (acc[item.currency] || 0) + item.quantity * item.price; return acc; }, {});
  async function copyReply() {
    setError("");
    try { await navigator.clipboard.writeText(`${offer.replySubject || offer.subject}\n\n${offer.replyBody || ""}`); setNotice("E-posta yanıtı kopyalandı."); }
    catch { setError("Kopyalanamadı. Yanıt metnini seçerek kopyalayabilirsiniz."); }
  }
  const money = (value: number, currency: string) => `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === "TRY" ? "TL" : currency}`;
  const fieldId = `crm-draft-${draftId}`;
  return <section className={styles.tableCard} aria-label="Teklif ve e-posta taslağı">
    <header className={ui.draftHeader}>
      <div><h2>Teklif ve e-posta taslağı</h2><p className={ui.muted}>Liste fiyatlarıyla hazırlandı. Kapsamı ve yanıtı kontrol ederek kaydedebilirsiniz.</p></div>
      <span className={ui.status}>{sent ? "Gönderildi" : savedId ? `Teklif #${savedId}` : `Taslak #${draftId}`}</span>
    </header>
    <div className={ui.tabs} role="tablist" aria-label="Taslak bölümleri">
      <button type="button" role="tab" id={`${fieldId}-offer-tab`} aria-selected={tab === "offer"} aria-controls={`${fieldId}-offer-panel`} className={styles.cancelBtn} onClick={() => setTab("offer")}>Teklif</button>
      <button type="button" role="tab" id={`${fieldId}-email-tab`} aria-selected={tab === "email"} aria-controls={`${fieldId}-email-panel`} className={styles.cancelBtn} onClick={() => setTab("email")}>E-posta yanıtı</button>
    </div>
    <div className={ui.draftBody}>
      {offer.warnings.length > 0 && <div className={ui.warning}><strong>Kontrol edilmesi gerekenler</strong><ul>{offer.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
      <div role="tabpanel" id={`${fieldId}-offer-panel`} aria-labelledby={`${fieldId}-offer-tab`} hidden={tab !== "offer"}>
        <fieldset disabled={busy || savedId !== null} className={ui.fields}>
          <div className={styles.formGroup}><label htmlFor={`${fieldId}-recipient`}>Firma / şahıs adı</label><input id={`${fieldId}-recipient`} value={offer.recipient} maxLength={255} onChange={e => { setOffer({ ...offer, recipient: e.target.value }); setCustomer(""); setNewCustomerId(null); }} /></div>
          <div className={styles.formGroup}><label htmlFor={`${fieldId}-customer`}>Mevcut müşteri</label><select id={`${fieldId}-customer`} value={customer} onChange={e => { const firm = firms.find(f => String(f.ID) === e.target.value); setCustomer(e.target.value); setNewCustomerId(null); if (firm) setOffer({ ...offer, recipient: firm.Ad }); }}><option value="">İsimle eşleştir / yeni müşteri oluştur</option>{firms.map(f => <option key={f.ID} value={f.ID}>{f.Ad}</option>)}</select></div>
          <p className={`${ui.muted} ${ui.wide}`}>İsim mevcut müşteriyle eşleştirilir; bulunamazsa bu firma/şahıs adına müşteri kaydı açılır.</p>
          <div className={`${styles.formGroup} ${ui.wide}`}><label htmlFor={`${fieldId}-subject`}>Teklif konusu</label><input id={`${fieldId}-subject`} value={offer.subject} maxLength={500} onChange={e => setOffer({ ...offer, subject: e.target.value })} /></div>
          <div className={`${ui.lineTable} ${ui.wide}`}><table className={styles.table}><thead><tr><th>Hizmet / kapsam</th><th>Adet</th><th>Birim fiyat</th><th>Birim</th><th>İşlem</th></tr></thead><tbody>{offer.items.map((item, index) => <Fragment key={index}>
            {item.packageGroup && item.packageGroup !== offer.items[index - 1]?.packageGroup && <tr className={ui.packageRow}><td colSpan={5}>{item.packageTitle} — Uygulanan parametreler</td></tr>}
            <tr><td className={ui.service}><strong>{item.name}</strong>{item.products?.length ? <small>{item.products.join(" · ")}</small> : null}{item.sampleRequirement && <small>Numune: {item.sampleRequirement}</small>}{item.duration && <small>Katalog süresi: {item.duration} gün</small>}</td>
              <td><div className={styles.formGroup}><input aria-label={`${item.name} adet`} type="number" min={1} step={1} value={item.quantity} onChange={e => setOffer({ ...offer, items: offer.items.map((i, n) => n === index ? { ...i, quantity: Number(e.target.value) } : i) })} /></div></td>
              <td><div className={styles.formGroup}><input aria-label={`${item.name} birim fiyat`} type="number" min={0} step="0.01" value={item.price} onChange={e => setOffer({ ...offer, items: offer.items.map((i, n) => n === index ? { ...i, price: Number(e.target.value) } : i) })} /></div></td><td>{item.currency === "TRY" ? "TL" : item.currency}</td><td><button className={styles.cancelBtn} type="button" onClick={() => setOffer({ ...offer, items: offer.items.filter((_, n) => n !== index) })}>Kaldır</button></td></tr>
          </Fragment>)}</tbody></table>{!offer.items.length && <p className={styles.empty}>Fiyatlandırılabilen hizmet bulunamadı. Kapsamı tamamlayıp tekrar analiz edebilirsiniz.</p>}</div>
        </fieldset>
        <div className={ui.totals}>{Object.entries(totals).map(([currency, total]) => <div className={ui.total} key={currency}><div><span>Ara toplam</span><strong>{money(total, currency)}</strong></div><div><span>KDV (%20)</span><span>{money(total * 0.2, currency)}</span></div><div><span>Genel toplam</span><strong>{money(total * 1.2, currency)}</strong></div></div>)}</div>
      </div>
      <div role="tabpanel" id={`${fieldId}-email-panel`} aria-labelledby={`${fieldId}-email-tab`} hidden={tab !== "email"}>
        <fieldset disabled={busy || sent} className={ui.fields}>
          <div className={styles.formGroup}><label htmlFor={`${fieldId}-email`}>Alıcı e-posta</label><input id={`${fieldId}-email`} type="email" value={offer.email} maxLength={320} placeholder="musteri@firma.com" onChange={e => setOffer({ ...offer, email: e.target.value })} /></div>
          <div className={styles.formGroup}><label htmlFor={`${fieldId}-reply-subject`}>E-posta konusu</label><input id={`${fieldId}-reply-subject`} value={offer.replySubject || ""} maxLength={500} placeholder={offer.subject} onChange={e => setOffer({ ...offer, replySubject: e.target.value })} /></div>
          <div className={`${styles.formGroup} ${ui.wide}`}><label htmlFor={`${fieldId}-reply-body`}>Müşteriye yanıt</label><textarea id={`${fieldId}-reply-body`} className={ui.emailBody} rows={16} maxLength={16000} value={offer.replyBody || ""} placeholder="Müşteriye iletilecek yanıtı buradan düzenleyin…" onChange={e => setOffer({ ...offer, replyBody: e.target.value })} /></div>
          <p className={`${ui.muted} ${ui.wide}`}>Bu yanıt teklif tablosuyla birlikte gönderilir. Fiyat değişikliklerini teklif sekmesinden yapabilirsiniz.</p>
        </fieldset>
      </div>
    </div>
    {error && <p role="alert" className={`${styles.formError} ${ui.notice}`}>{error}</p>}
    {notice && <p role="status" className={ui.notice}>{notice}</p>}
    <footer className={ui.actions}>
      <button type="button" className={styles.cancelBtn} disabled={!offer.replyBody?.trim()} onClick={() => void copyReply()}>Yanıtı kopyala</button>
      <button type="button" className={styles.cancelBtn} disabled={busy} onClick={() => void saveDraft()}>Taslağı sakla</button>
      {savedId && <><a className={styles.cancelBtn} href="/musteriler/teklif-listesi">Teklif listesi</a><a className={styles.cancelBtn} href={`/teklif-print/${savedId}`} target="_blank" rel="noreferrer">Önizle</a></>}
      {!sent && <><button type="button" className={styles.cancelBtn} disabled={busy || !!savedId || !offer.items.length} onClick={() => void save(false)}>Teklif listesine kaydet</button><button type="button" className={styles.saveBtn} disabled={busy || !offer.items.length} onClick={() => { if (!offer.email || !offer.replyBody) setTab("email"); void save(true); }}>{busy ? "İşleniyor…" : "Teklif ve yanıtı gönder"}</button></>}
    </footer>
  </section>;
}
