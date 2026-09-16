"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../../kys.module.css";
import { REQUEST_TRANSITIONS } from "@/lib/kysRequestRules";
import { useRouter } from "next/navigation";

type Birim = { id: number; ad: string };
type Detail = { talep: any; kalemler: any[]; kabuller: any[]; belgeler?: any[]; satinAlmaYetkisi?: boolean };
const numeric = (v:string) => Number(v.includes(",")?v.replace(/\./g,"").replace(",","."):v)||0;

const today = () => new Date().toISOString().slice(0, 10);

function dateFmt(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value).slice(0, 10);
}

export default function TalepDetayClient({ id }: { id: number }) {
  const router=useRouter();
  const [suppliers,setSuppliers]=useState<any[]>([]);
  const [correcting,setCorrecting]=useState<any|null>(null);
  const [belge,setBelge]=useState<File|null>(null);
  const [duzeltmeAciklamasi,setDuzeltmeAciklamasi]=useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [birimler, setBirimler] = useState<Birim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptItem, setAcceptItem] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    gelenMiktar: "",
    hedefBirimId: "",
    marka: "",
    lot: "",
    skt: "",
    kabulTarihi: today(),
    istenilenMiktardaGeldi: true,
    markaOzellikUygun: true,
    sktUygun: true,
    sertifikaGerekli: false,
    genelDegerlendirme: "",
    tedarikci: "",
    tedarikciId: "",
    satinAlmaTarihi: today(),
    birimFiyat: "",
    paraBirimi: "TRY",
    toplamTutar: "",
    faturaNo: "",
  });

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/kys/talepler/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Talep detayı alınamadı.");
      setDetail(json);
      if(json.satinAlmaYetkisi) {
        const supplierRes=await fetch("/api/kys/tedarikciler");const sj=await supplierRes.json();
        if(supplierRes.ok)setSuppliers(sj.data||[]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);
  useEffect(() => {
    fetch("/api/kys/birimler").then(r => r.json()).then(j => setBirimler(j.data || [])).catch(() => {});
  }, []);

  async function setStatus(durum: string) {
    if(saving)return;setSaving(true);
    setError("");
    try { const res = await fetch(`/api/kys/talepler/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durum }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Durum güncellenemedi.");
    fetchDetail();
    }catch(e:any){setError(e.message||"Durum güncellenemedi.");}finally{setSaving(false);}
  }

  function openAccept(item: any) {
    setCorrecting(null);setBelge(null);setDuzeltmeAciklamasi("");
    setAcceptItem(item);
    setForm({
      gelenMiktar: String(Math.max(Number(item.miktar || 0) - Number(item.kabulMiktari || 0), 0) || item.miktar || ""),
      hedefBirimId: "",
      marka: item.marka || "",
      lot: "",
      skt: "",
      kabulTarihi: today(),
      istenilenMiktardaGeldi: true,
      markaOzellikUygun: true,
      sktUygun: true,
      sertifikaGerekli: false,
      genelDegerlendirme: "",
      tedarikci: "",
      tedarikciId: "",
      satinAlmaTarihi: today(),
      birimFiyat: "",
      paraBirimi: "TRY",
      toplamTutar: "",
      faturaNo: "",
    });
    setFormError("");
  }

  function openCorrect(k:any){
    const item=detail?.kalemler.find(i=>i.id===k.kalemId);if(!item)return;
    openAccept(item);setCorrecting(k);
    setForm(f=>({...f,gelenMiktar:String(k.gelenMiktar),hedefBirimId:k.hedefBirimId?String(k.hedefBirimId):"",marka:k.marka||"",lot:k.lot||"",skt:k.skt||"",kabulTarihi:k.kabulTarihi||today(),
      istenilenMiktardaGeldi:k.istenilenMiktardaGeldi,markaOzellikUygun:k.markaOzellikUygun,sktUygun:k.sktUygun,sertifikaGerekli:k.sertifikaGerekli,genelDegerlendirme:k.genelDegerlendirme||"",
      tedarikci:k.tedarikci||"",tedarikciId:k.tedarikciId?String(k.tedarikciId):"",satinAlmaTarihi:k.satinAlmaTarihi||today(),birimFiyat:k.birimFiyat==null?"":String(k.birimFiyat),paraBirimi:k.paraBirimi||"TRY",toplamTutar:k.toplamTutar==null?"":String(k.toplamTutar),faturaNo:k.faturaNo||""}));
  }
  async function deleteRequest(){
    if(!confirm("Talep listeden kaldırılacak. Kabul edilmiş stok ve satın alma geçmişi korunacaktır. Devam edilsin mi?"))return;
    setSaving(true);try{const r=await fetch(`/api/kys/talepler/${id}`,{method:"DELETE"});const j=await r.json();if(!r.ok)throw new Error(j.error);router.push("/laboratuvar/kys/talep-listesi");}catch(e:any){setError(e.message);}finally{setSaving(false);}
  }

  async function accept() {
    if (!acceptItem || saving) return;
    setSaving(true);
    setFormError("");
    try {
      const payload={ ...form, kalemId: acceptItem.id, kabulId:correcting?.id, duzeltmeAciklamasi, toplamTutar:form.toplamTutar || (form.birimFiyat?String(numeric(form.birimFiyat)*numeric(form.gelenMiktar)):""), hedefBirimId: form.hedefBirimId ? Number(form.hedefBirimId) : null };
      const body=new FormData();body.append("payload",JSON.stringify(payload));if(belge)body.append("belge",belge);
      const res = await fetch(`/api/kys/talepler/${id}/kabul`, {
        method: correcting ? "PATCH" : "POST",
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kabul kaydedilemedi.");
      setAcceptItem(null);
      fetchDetail();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !detail) return <div className={styles.tableCard}><div className={styles.empty}>Yükleniyor...</div></div>;
  if (error && !detail) return <div className={styles.errorBanner}>{error}</div>;
  if (!detail) return null;

  return (
    <>
      {error && <div className={styles.errorBanner}>{error}</div>}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link href="/laboratuvar/kys/talep-listesi" className={styles.cancelBtn}>← Talep listesi</Link>
          <span className={kys.pill}>{detail.talep.talepNo}</span>
          <span className={kys.pill}>{detail.talep.durum}</span>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.cancelBtn} onClick={() => window.print()}>Yazdır</button>
          {REQUEST_TRANSITIONS[detail.talep.durum]?.includes("Onaylandı")&&<button disabled={saving} className={styles.cancelBtn} style={{background:"#e7f7ed",color:"#16713b",borderColor:"#a0d6b4"}} onClick={() => setStatus("Onaylandı")}>Onayla</button>}
          {REQUEST_TRANSITIONS[detail.talep.durum]?.includes("İşleme Alındı")&&<button disabled={saving} className={styles.cancelBtn} style={{background:"#e8f0ff",color:"#235ac0",borderColor:"#a7c1ee"}} onClick={() => setStatus("İşleme Alındı")}>İşleme al</button>}
          {REQUEST_TRANSITIONS[detail.talep.durum]?.includes("İptal")&&<button disabled={saving} className={styles.cancelBtn} style={{background:"#fff0ee",color:"#b42318",borderColor:"#efb2ab"}} onClick={() => setStatus("İptal")}>İptal</button>}
          <button disabled={saving} className={styles.cancelBtn} onClick={deleteRequest}>Talebi sil</button>
        </div>
      </div>

      <div className={styles.tableCard} style={{ padding: 16 }}>
        <div className={kys.detailGrid}>
          <div className={kys.detailItem}><div className={kys.detailLabel}>Talep türü</div><div className={kys.detailValue}>{detail.talep.talepTuru}</div></div>
          <div className={kys.detailItem}><div className={kys.detailLabel}>Oluşturan</div><div className={kys.detailValue}>{detail.talep.olusturanAd || "-"}</div></div>
          <div className={kys.detailItem}><div className={kys.detailLabel}>Tarih</div><div className={kys.detailValue}>{dateFmt(detail.talep.olusturmaTarihi)}</div></div>
          <div className={kys.detailItem}><div className={kys.detailLabel}>Not</div><div className={kys.detailValue}>{detail.talep.notlar || "-"}</div></div>
        </div>
        {detail.talep.teknikSartname && (
          <div className={kys.detailItem} style={{ marginTop: 12 }}>
            <div className={kys.detailLabel}>Teknik şartname</div>
            <div className={kys.detailValue} style={{ whiteSpace: "pre-wrap" }}>{detail.talep.teknikSartname}</div>
          </div>
        )}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead><tr><th>Kod</th><th>Malzeme</th><th>Miktar</th><th>Kabul</th><th>Marka</th><th>Not</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              {detail.kalemler.map(item => (
                <tr key={item.id}>
                  <td className={styles.tdMono}>{item.kod || item.stokKod || "-"}</td>
                  <td className={styles.tdName}>{item.malzemeAdi}</td>
                  <td>{item.miktar} {item.birim}</td>
                  <td>{item.kabulMiktari} {item.birim}</td>
                  <td>{item.marka || "-"}</td>
                  <td className={styles.tdAdres}>{item.kullaniciNotu || item.ozellik || "-"}</td>
                  <td><span className={kys.pill}>{item.durum}</span></td>
                  <td>{["İşleme Alındı","Kısmi Kabul"].includes(detail.talep.durum)&&item.durum!=="Tamamlandı"&&<button className={styles.editBtn} onClick={() => openAccept(item)}>Kabul et</button>}{item.durum==="Tamamlandı"&&<span className={kys.muted}>Kabul tamamlandı</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead><tr><th>Kabul tarihi</th><th>Kalem</th><th>Gelen miktar</th>{detail.satinAlmaYetkisi && <><th>Tedarikçi</th><th>Toplam satın alma tutarı</th></>}<th>Değerlendiren</th><th>Genel değerlendirme</th><th>Belge / Düzeltme</th></tr></thead>
            <tbody>
              {detail.kabuller.length === 0 ? <tr><td colSpan={detail.satinAlmaYetkisi ? 8 : 6}><div className={styles.empty}>Kabul kaydı yok.</div></td></tr> : detail.kabuller.map(k => {
                const item = detail.kalemler.find(i => i.id === k.kalemId);
                return <tr key={k.id}><td>{dateFmt(k.kabulTarihi)}</td><td>{item?.malzemeAdi || k.kalemId}</td><td>{k.gelenMiktar} {item?.birim}</td>{detail.satinAlmaYetkisi && <><td>{k.tedarikci || "-"}</td><td>{k.toplamTutar == null ? "Fiyat girilmedi" : `${Number(k.toplamTutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${k.paraBirimi || "TRY"}`}</td></>}<td>{k.degerlendirenAd || "-"}</td><td>{k.genelDegerlendirme || "-"}</td><td>{detail.belgeler?.filter(b=>Number(b.KabulID)===k.id).map(b=><a key={b.ID} href={`/api/kys/talepler/${id}/belgeler/${b.ID}`} target="_blank" rel="noopener noreferrer" style={{display:"block"}}>{b.DosyaAdi}</a>)}<button className={styles.editBtn} onClick={()=>openCorrect(k)}>Düzelt</button></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {acceptItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 820 }}>
            <div className={styles.modalHeader}><h2>{correcting?"Kabul düzeltme":"Talep kabul"} - {acceptItem.malzemeAdi}</h2><button disabled={saving} className={styles.modalClose} onClick={() => setAcceptItem(null)}>×</button></div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid3}>
                <div className={styles.formGroup}><label>Gelen miktar ({acceptItem.birim} — stok kartı birimi)</label><input inputMode="decimal" value={form.gelenMiktar} onChange={e => setForm(f => ({ ...f, gelenMiktar: e.target.value,toplamTutar:"" }))} /><span className={kys.muted}>Birim: {acceptItem.birim} (sabit)</span></div>
                <div className={styles.formGroup}><label>Kabul tarihi</label><input type="date" value={form.kabulTarihi} onChange={e => setForm(f => ({ ...f, kabulTarihi: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Depoya/Birime işle</label><select value={form.hedefBirimId} onChange={e => setForm(f => ({ ...f, hedefBirimId: e.target.value }))}><option value="">Seçiniz</option>{birimler.map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}</select></div>
                <div className={styles.formGroup}><label>Marka</label><input value={form.marka} onChange={e => setForm(f => ({ ...f, marka: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Lot</label><input value={form.lot} onChange={e => setForm(f => ({ ...f, lot: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>SKT</label><input type="date" value={form.skt} onChange={e => setForm(f => ({ ...f, skt: e.target.value }))} /></div>
                {detail.satinAlmaYetkisi && (
                  <div className={kys.purchaseSection}>
                    <div className={kys.purchaseSectionTitle}>Satın alma bilgileri</div>
                    <div className={styles.formGrid3}>
                      <div className={styles.formGroup}><label>Kimden satın alındı?</label><select value={form.tedarikciId} onChange={e => setForm(f => ({ ...f, tedarikciId: e.target.value }))}><option value="">{correcting?.tedarikci?`Mevcut: ${correcting.tedarikci}`:"Tedarikçi seçin"}</option>{correcting?.tedarikciId&&!suppliers.some(s=>s.ID===correcting.tedarikciId)&&<option value={correcting.tedarikciId}>{correcting.tedarikci} (pasif)</option>}{suppliers.map(s=><option key={s.ID} value={s.ID}>{s.Ad}</option>)}</select><Link href="/laboratuvar/kys/tedarikci-listesi" target="_blank">Tedarikçi listesi</Link></div>
                      <div className={styles.formGroup}><label>Satın alma tarihi</label><input type="date" value={form.satinAlmaTarihi} onChange={e => setForm(f => ({ ...f, satinAlmaTarihi: e.target.value }))} /></div>
                      <div className={styles.formGroup}><label>Fatura no</label><input value={form.faturaNo} onChange={e => setForm(f => ({ ...f, faturaNo: e.target.value }))} /></div>
                      <div className={styles.formGroup}><label>Birim fiyat</label><input inputMode="decimal" value={form.birimFiyat} onChange={e => setForm(f => ({ ...f, birimFiyat: e.target.value,toplamTutar:"" }))} /></div>
                      <div className={styles.formGroup}><label>Para birimi</label><select value={form.paraBirimi} onChange={e => setForm(f => ({ ...f, paraBirimi: e.target.value }))}><option>TRY</option><option>EUR</option><option>USD</option><option>GBP</option></select></div>
                      <div className={styles.formGroup}><label>Toplam tutar (birim fiyat × miktar)</label><input inputMode="decimal" value={form.toplamTutar || (form.birimFiyat?String(numeric(form.birimFiyat)*numeric(form.gelenMiktar)):"")} onChange={e => setForm(f => ({ ...f, toplamTutar: e.target.value }))} /></div>
                    </div>
                  </div>
                )}
                {[
                  ["İstenilen miktarda geldi mi?", "istenilenMiktardaGeldi"],
                  ["İstenilen marka ve özelliklerde geldi mi?", "markaOzellikUygun"],
                  ["Son kullanım tarihi uygun mu?", "sktUygun"],
                  ["Sertifika gerektiriyor mu?", "sertifikaGerekli"],
                ].map(([label, key]) => (
                  <label key={key} className={kys.pill}>
                    <input type="checkbox" checked={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
                <div className={`${styles.formGroup} ${styles.colSpan3}`}><label>Genel değerlendirme</label><textarea rows={3} value={form.genelDegerlendirme} onChange={e => setForm(f => ({ ...f, genelDegerlendirme: e.target.value }))} /></div>
                <div className={`${styles.formGroup} ${styles.colSpan3}`}><label>Belge yükle (isteğe bağlı, en fazla 10 MB)</label><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={e=>setBelge(e.target.files?.[0]||null)}/></div>
                {correcting&&<div className={`${styles.formGroup} ${styles.colSpan3}`}><label>Düzeltme açıklaması *</label><textarea required value={duzeltmeAciklamasi} onChange={e=>setDuzeltmeAciklamasi(e.target.value)}/><p>Stok miktarına yalnızca eski ve yeni miktar arasındaki fark yansıtılır.</p></div>}
              </div>
            </div>
            <div className={styles.modalFooter}><button disabled={saving} className={styles.cancelBtn} onClick={() => setAcceptItem(null)}>Vazgeç</button><button className={styles.saveBtn} disabled={saving||(!!correcting&&!duzeltmeAciklamasi.trim())} onClick={accept}>{saving ? "Kaydediliyor..." : correcting?"Düzeltmeyi kaydet":"Kabulü kaydet"}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
