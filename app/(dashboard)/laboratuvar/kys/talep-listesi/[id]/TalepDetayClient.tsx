"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";
import kys from "../../kys.module.css";
import { REQUEST_TRANSITIONS } from "@/lib/kysRequestRules";
import TalepEditModal from "../TalepEditModal";

type Birim = { id: number; ad: string };
type Detail = { talep: any; kalemler: any[]; kabuller: any[]; belgeler?: any[]; satinAlmaYetkisi?: boolean };
const today = () => new Date().toISOString().slice(0, 10);

function dateFmt(value?: string | null) {
  if (!value) return "-";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value).slice(0, 10);
}

export default function TalepDetayClient({ id }: { id: number }) {
  const [editing, setEditing] = useState(false);
  const [editingNumber, setEditingNumber] = useState(false);
  const [requestNumber, setRequestNumber] = useState("");
  const [numberError, setNumberError] = useState("");
  const [exporting, setExporting] = useState(false);
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
  });

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/kys/talepler/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Talep detayı alınamadı.");
      setDetail(json);
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
    });
    setFormError("");
  }

  async function saveNumber() {
    if (saving) return;
    setSaving(true); setNumberError("");
    try {
      const res = await fetch(`/api/kys/talepler/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ islem: "numara-duzenle", talepNo: requestNumber }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Numara güncellenemedi.");
      await fetchDetail(); setEditingNumber(false);
    } catch (e) { setNumberError(e instanceof Error ? e.message : "Numara güncellenemedi."); }
    finally { setSaving(false); }
  }

  async function exportExcel() {
    if (exporting || !detail) return;
    setExporting(true); setError("");
    try {
      const res = await fetch(`/api/kys/talepler/${id}/excel`);
      if (!res.ok) { const json = await res.json(); throw new Error(json.error || "Excel indirilemedi."); }
      const url = URL.createObjectURL(await res.blob());
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `Talep-${detail.talep.talepNo.replace(/[\\/:*?"<>|]/g, "-")}.xlsx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Excel indirilemedi."); }
    finally { setExporting(false); }
  }

  function openCorrect(k:any){
    const item=detail?.kalemler.find(i=>i.id===k.kalemId);if(!item)return;
    openAccept(item);setCorrecting(k);
    setForm(f=>({...f,gelenMiktar:String(k.gelenMiktar),hedefBirimId:k.hedefBirimId?String(k.hedefBirimId):"",marka:k.marka||"",lot:k.lot||"",skt:k.skt||"",kabulTarihi:k.kabulTarihi||today(),
      istenilenMiktardaGeldi:k.istenilenMiktardaGeldi,markaOzellikUygun:k.markaOzellikUygun,sktUygun:k.sktUygun,sertifikaGerekli:k.sertifikaGerekli,genelDegerlendirme:k.genelDegerlendirme||""}));
  }
  async function deleteAcceptance(k: any) {
    if (saving || !confirm(detail?.talep.seri === "Spektrotek" && detail.talep.talepTuru === "Sipariş" ? "Sipariş kabulü silinecek, teslim edilen miktar stoğa geri eklenecek. Devam edilsin mi?" : "Bu kabul ve bağlı satın alma kaydı silinecek, gelen miktar stoktan geri alınacak. Devam edilsin mi?")) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/kys/talepler/${id}/kabul`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kabulId: k.id }) });
      const json = await res.json(); if (!res.ok) throw new Error(json.error || "Kabul silinemedi.");
      await fetchDetail();
    } catch (e) { setError(e instanceof Error ? e.message : "Kabul silinemedi."); }
    finally { setSaving(false); }
  }

  async function accept() {
    if (!acceptItem || saving) return;
    setSaving(true);
    setFormError("");
    try {
      const payload={ ...form, kalemId: acceptItem.id, kabulId:correcting?.id, duzeltmeAciklamasi, hedefBirimId: form.hedefBirimId ? Number(form.hedefBirimId) : null };
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
          <button type="button" className={styles.cancelBtn} disabled={exporting || loading} onClick={exportExcel}>{exporting ? "Hazırlanıyor…" : "Excel’e aktar"}</button>
          {detail.talep.seri === "Spektrotek" && <button type="button" disabled={saving} className={styles.cancelBtn} onClick={() => {setRequestNumber(detail.talep.talepNo);setNumberError("");setEditingNumber(true);}}>Talep no düzenle</button>}
          {detail.talep.durum === "Onay Bekliyor" && !detail.talep.onayTarihi && <button type="button" disabled={saving || loading || editing} className={styles.addBtn} onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true" /> Talebi düzenle</button>}
          <Link className={styles.cancelBtn} href={`/kys-talep-yazdir/${id}`} target="_blank">Yazdır</Link>
          {REQUEST_TRANSITIONS[detail.talep.durum]?.includes("Onaylandı")&&<button disabled={saving} className={styles.cancelBtn} style={{background:"#e7f7ed",color:"#16713b",borderColor:"#a0d6b4"}} onClick={() => setStatus("Onaylandı")}>Onayla</button>}
          {REQUEST_TRANSITIONS[detail.talep.durum]?.includes("İşleme Alındı")&&<button disabled={saving} className={styles.cancelBtn} style={{background:"#e8f0ff",color:"#235ac0",borderColor:"#a7c1ee"}} onClick={() => setStatus("İşleme Alındı")}>İşleme al</button>}
          {REQUEST_TRANSITIONS[detail.talep.durum]?.includes("İptal")&&<button disabled={saving} className={styles.cancelBtn} style={{background:"#fff0ee",color:"#b42318",borderColor:"#efb2ab"}} onClick={() => setStatus("İptal")}>İptal</button>}
          {REQUEST_TRANSITIONS[detail.talep.durum]?.includes("Onay Bekliyor")&&<button type="button" disabled={saving} className={styles.cancelBtn} onClick={() => setStatus("Onay Bekliyor")}>Geri Gönder</button>}
        </div>
      </div>

      <div className={styles.tableCard} style={{ padding: 16 }}>
        <div className={kys.detailGrid}>
          <div className={kys.detailItem}><div className={kys.detailLabel}>{detail.talep.seri === "Spektrotek" ? "Firma adı" : "Talep türü"}</div><div className={kys.detailValue}>{detail.talep.seri === "Spektrotek" ? detail.talep.firmaAdi : detail.talep.talepTuru}</div></div>
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
                  <td>{["İşleme Alındı","Kısmi Kabul"].includes(detail.talep.durum)&&item.durum!=="Tamamlandı"&&<button type="button" className={styles.addBtn} onClick={() => openAccept(item)}>Kabul et</button>}{item.durum==="Tamamlandı"&&<span className={kys.muted}>Kabul tamamlandı</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={`${styles.table} ${kys.acceptanceTable}`}>
            <thead><tr><th>Kabul tarihi</th><th>Kalem</th><th>Gelen miktar</th>{detail.satinAlmaYetkisi && <><th>Tedarikçi</th><th>Toplam satın alma tutarı</th></>}<th>Değerlendiren</th><th>Genel değerlendirme</th><th>Belge / Düzeltme</th></tr></thead>
            <tbody>
              {detail.kabuller.length === 0 ? <tr><td colSpan={detail.satinAlmaYetkisi ? 8 : 6}><div className={styles.empty}>Kabul kaydı yok.</div></td></tr> : detail.kabuller.map(k => {
                const item = detail.kalemler.find(i => i.id === k.kalemId);
                return <tr key={k.id}><td>{dateFmt(k.kabulTarihi)}</td><td>{item?.malzemeAdi || k.kalemId}</td><td>{k.gelenMiktar} {item?.birim}</td>{detail.satinAlmaYetkisi && <><td>{k.tedarikci || "-"}</td><td>{k.toplamTutar == null ? "Fiyat girilmedi" : `${Number(k.toplamTutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${k.paraBirimi || "TRY"}`}</td></>}<td>{k.degerlendirenAd || "-"}</td><td>{k.genelDegerlendirme || "-"}</td><td>{detail.belgeler?.filter(b=>Number(b.KabulID)===k.id).map(b=><a key={b.ID} href={`/api/kys/talepler/${id}/belgeler/${b.ID}`} target="_blank" rel="noopener noreferrer" style={{display:"block"}}>{b.DosyaAdi}</a>)}<button className={`${styles.editBtn} ${kys.iconButton}`} title="Düzelt" aria-label={`${item?.malzemeAdi || k.kalemId} kabulünü düzelt`} onClick={()=>openCorrect(k)}><Pencil size={16} aria-hidden="true" /></button><button disabled={saving} className={`${styles.deleteBtn} ${kys.iconButton}`} title="Kabulü sil" aria-label={`${item?.malzemeAdi || k.kalemId} kabulünü sil`} onClick={() => deleteAcceptance(k)}><Trash2 size={15} aria-hidden="true" /></button></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <TalepEditModal id={id} onClose={() => setEditing(false)} onSaved={fetchDetail} initial={{
        seri: detail.talep.seri, firmaAdi: detail.talep.firmaAdi, talepTuru: detail.talep.talepTuru, notlar: detail.talep.notlar || "", teknikSartname: detail.talep.teknikSartname || "",
        kalemler: detail.kalemler.map(item => ({ stokId: item.stokId ? String(item.stokId) : "", kod: item.kod || "", malzemeAdi: item.malzemeAdi, miktar: String(item.miktar), birim: item.birim || "Adet", ozellik: item.ozellik || "", marka: item.marka || "", kullaniciNotu: item.kullaniciNotu || "" })),
      }} />}
      {editingNumber && <div className={styles.modalOverlay}><div className={styles.modal} style={{maxWidth:460}} role="dialog" aria-modal="true" aria-labelledby="request-number-title">
        <div className={styles.modalHeader}><h2 id="request-number-title">Talep numarasını düzenle</h2><button className={styles.modalClose} aria-label="Kapat" disabled={saving} onClick={()=>setEditingNumber(false)}>×</button></div>
        <div className={styles.modalBody}>{numberError && <div role="alert" className={styles.formError}>{numberError}</div>}<div className={styles.formGroup}><label htmlFor="request-number">Talep numarası</label><input id="request-number" maxLength={40} value={requestNumber} onChange={e=>setRequestNumber(e.target.value)} /></div></div>
        <div className={styles.modalFooter}><button disabled={saving} className={styles.cancelBtn} onClick={()=>setEditingNumber(false)}>Vazgeç</button><button disabled={saving || !requestNumber.trim()} className={styles.saveBtn} onClick={saveNumber}>{saving ? "Kaydediliyor…" : "Kaydet"}</button></div>
      </div></div>}
      {acceptItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 820 }}>
            <div className={styles.modalHeader}><h2>{correcting?"Kabul düzeltme":"Talep kabul"} - {acceptItem.malzemeAdi}</h2><button disabled={saving} className={styles.modalClose} onClick={() => setAcceptItem(null)}>×</button></div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.formGrid3}>
                <div className={kys.quantityWithUnit}><div className={styles.formGroup}><label htmlFor="accept-quantity">{detail.talep.seri === "Spektrotek" && detail.talep.talepTuru === "Sipariş" ? "Teslim edilen miktar" : "Gelen miktar"}</label><input id="accept-quantity" inputMode="decimal" value={form.gelenMiktar} onChange={e => setForm(f => ({ ...f, gelenMiktar: e.target.value,toplamTutar:"" }))} /></div><div className={styles.formGroup}><label htmlFor="accept-unit">Birim</label><input id="accept-unit" readOnly value={acceptItem.birim || "Adet"} aria-label="Stok kartı birimi (sabit)" /></div></div>
                <div className={styles.formGroup}><label>Kabul tarihi</label><input type="date" value={form.kabulTarihi} onChange={e => setForm(f => ({ ...f, kabulTarihi: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Depoya/Birime işle</label><select value={form.hedefBirimId} onChange={e => setForm(f => ({ ...f, hedefBirimId: e.target.value }))}><option value="">Seçiniz</option>{birimler.map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}</select></div>
                <div className={styles.formGroup}><label>Marka</label><input value={form.marka} onChange={e => setForm(f => ({ ...f, marka: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>Lot</label><input value={form.lot} onChange={e => setForm(f => ({ ...f, lot: e.target.value }))} /></div>
                <div className={styles.formGroup}><label>SKT</label><input type="date" value={form.skt} onChange={e => setForm(f => ({ ...f, skt: e.target.value }))} /></div>
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
                <div className={`${styles.formGroup} ${styles.colSpan3}`}><label>Belge yükle (isteğe bağlı, en fazla 10 MB)</label><input className={kys.fileInput} aria-label="Kabul belgesi seç" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={e=>setBelge(e.target.files?.[0]||null)}/></div>
                {correcting&&<div className={`${styles.formGroup} ${styles.colSpan3}`}><label>Düzeltme açıklaması *</label><textarea required value={duzeltmeAciklamasi} onChange={e=>setDuzeltmeAciklamasi(e.target.value)}/><small className={kys.formHint}>Stok miktarına yalnızca eski ve yeni miktar arasındaki fark yansıtılır.</small></div>}
              </div>
            </div>
            <div className={styles.modalFooter}><button disabled={saving} className={styles.cancelBtn} onClick={() => setAcceptItem(null)}>Vazgeç</button><button className={styles.saveBtn} disabled={saving||(!!correcting&&!duzeltmeAciklamasi.trim())} onClick={accept}>{saving ? "Kaydediliyor..." : correcting?"Düzeltmeyi kaydet":"Kabulü kaydet"}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
