"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import nf from "./numune-form.module.css";
import Tab1Bilgiler from "./Tab1Bilgiler";
import Tab2Hizmetler from "./Tab2Hizmetler";
import Tab3Formul from "./Tab3Formul";
import Tab4Gecmis from "./Tab4Gecmis";
import type { LookupData, NkrFormData, HizmetRow, FormulRow } from "./numuneFormTypes";
import { emptyForm } from "./numuneFormTypes";

const TABS = ["Numune bilgileri", "Hizmetler", "Ürün formülü", "Ürün geçmişi"] as const;

async function uploadFoto(nkrId: number, file: File) {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch(`/api/numune-form/${nkrId}/foto`, { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Foto yüklenemedi");
  return data.path as string;
}

function dat(v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v);
  return s.includes("T") ? s.split("T")[0]! : s.slice(0, 10);
}

function d(v: unknown): string {
  return v == null ? "" : String(v);
}

function di(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePartialDate(v: string): string | null {
  if (!v) return null;
  const parts = v.split("-");
  if (parts.length === 1) return `${parts[0]}-01-01`;     // year only
  if (parts.length === 2) return `${parts[0]}-${parts[1]}-01`; // year+month
  return v; // full date
}

function mapApiToForm(
  nkr: Record<string, unknown>,
  detay: Record<string, unknown> | null,
  fotoPath: string | null
): NkrFormData {
  return {
    Tarih: dat(nkr.Tarih),
    Barkod: d(nkr.Barkod),
    Teklif_No: d(nkr.Teklif_No),
    Talep_No: d(nkr.Talep_No),
    Evrak_No: d(nkr.Evrak_No),
    RaporNo: d(nkr.RaporNo),
    Revno: d(nkr.Revno) || "0",
    Grup: d(nkr.Grup),
    Tur: d(nkr.Tur),
    Karar: d(nkr.Karar),
    Dil: d(nkr.Dil),
    Firma_ID: di(nkr.Firma_ID),
    FirmaAd: d(nkr.FirmaAd),
    ProjeID: detay ? di(detay.ProjeID) : null,
    ProjeAd: detay ? d(detay.ProjeAd) : "",
    Numune_Adi: d(nkr.Numune_Adi),
    Numune_Adi_En: d(nkr.Numune_Adi_En),
    Miktar: detay && detay.Miktar != null ? String(detay.Miktar) : "",
    Birim: detay ? d(detay.Birim) : "",
    TesteMiktar: nkr.TesteMiktar != null ? String(nkr.TesteMiktar) : "",
    TesteMiktarBirim: d(nkr.TesteMiktarBirim),
    SeriNo: detay ? d(detay.SeriNo) : "",
    UretimTarihi: detay ? dat(detay.UretimTarihi) : "",
    SKT: detay ? dat(detay.SKT) : "",
    Aciklama: d(nkr.Aciklama),
    Urun_Tipi: d(nkr.Urun_Tipi),
    UGDTip_Kategori: d(nkr.UGDTip_Kategori),
    UGDTip_ID: di(nkr.UGDTip_ID),
    Hedef_Grup: d(nkr.Hedef_Grup) || "Yetişkinler",
    FotoFile: null,
    FotoPreview: "",
    FotoPath: fotoPath || "",
  };
}

function mapHizmetler(rows: Record<string, unknown>[]): HizmetRow[] {
  return rows.map((h, i) => ({
    key: `x-${h.ID ?? i}`,
    AnalizID: Number(h.AnalizID),
    Termin: h.Termin ? dat(h.Termin) : "",
    x3ID: h.x3ID != null && h.x3ID !== "" ? Number(h.x3ID) : null,
    Kod: d(h.Kod),
    Ad: d(h.Ad),
    Metot: d(h.Metot),
    Sure: h.Sure != null && h.Sure !== "" ? Number(h.Sure) : null,
    Limit: d(h.Limit) || undefined,
    Birim: d(h.Birim) || undefined,
  }));
}

function mapFormul(rows: Record<string, unknown>[]): FormulRow[] {
  return rows.map((f, i) => ({
    key: `g-${f.ID ?? i}`,
    HammaddeID: di(f.HammaddeID),
    INCIName: d(f.INCIName),
    Miktar: f.Miktar != null ? String(f.Miktar) : "",
    DaP: f.DaP != null ? String(f.DaP) : "",
    Noael: f.Noael != null ? String(f.Noael) : "",
  }));
}

export default function NumuneFormClient({ recordId }: { recordId?: string }) {
  const router = useRouter();
  const [tab, setTab]       = useState(0);
  const [lookup, setLookup] = useState<LookupData>({ grupTurleri: [], rUGDTipler: [], paketler: [] });
  const [form, setForm]     = useState<NkrFormData>(() => emptyForm());
  const [hizmetler, setHizmetler] = useState<HizmetRow[]>([]);
  const [formul, setFormul] = useState<FormulRow[]>([]);
  const [loadingNos, setLoadingNos] = useState(false);
  const [loadErr, setLoadErr]       = useState("");
  const [saving, setSaving]         = useState(false);
  const [saveErr, setSaveErr]       = useState("");
  // Yeni kayıtta ilk kaydet sonrası tab kilidi kalkar
  const [tab1Saved, setTab1Saved]   = useState(false);
  const [createdId, setCreatedId]   = useState<number | null>(null);

  const effectiveId: number | null = recordId ? parseInt(recordId, 10) : createdId;
  const isEdit    = !!effectiveId;
  const tabsUnlocked = isEdit || tab1Saved;

  useEffect(() => {
    fetch("/api/numune-form/lookup")
      .then(r => r.json())
      .then((data: LookupData) => {
        if (data.grupTurleri) setLookup(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!recordId) return;
    let cancelled = false;
    setLoadErr("");
    fetch(`/api/numune-form/${recordId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (!data.nkr) {
          setLoadErr(data.error || "Kayıt bulunamadı");
          return;
        }
        setForm(mapApiToForm(data.nkr, data.detay, data.fotoPath ?? null));
        setHizmetler(mapHizmetler(data.hizmetler || []));
        setFormul(mapFormul(data.formul || []));
      })
      .catch(() => { if (!cancelled) setLoadErr("Yüklenemedi"); });
    return () => { cancelled = true; };
  }, [recordId]);

  useEffect(() => {
    if (isEdit || !form.Grup) return;
    let cancelled = false;
    (async () => {
      setLoadingNos(true);
      try {
        const r = await fetch(`/api/numune-form/next-no?grup=${encodeURIComponent(form.Grup)}`);
        const j = await r.json();
        if (cancelled || !r.ok) return;
        setForm(f => ({ ...f, Evrak_No: j.evrakNo, RaporNo: j.raporNo }));
      } finally {
        if (!cancelled) setLoadingNos(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form.Grup, isEdit]);

  const patchForm = useCallback((u: Partial<NkrFormData>) => {
    setForm(f => ({ ...f, ...u }));
  }, []);

  const buildPayload = () => ({
    nkr: {
      Tarih: form.Tarih || null,
      Barkod: form.Barkod || null,
      Teklif_No: form.Teklif_No || null,
      Talep_No: form.Talep_No || null,
      Evrak_No: form.Evrak_No.trim(),
      RaporNo: form.RaporNo.trim(),
      Revno: form.Revno,
      Grup: form.Grup || null,
      Tur: form.Tur || null,
      Karar: form.Karar || null,
      Dil: form.Dil || null,
      Firma_ID: form.Firma_ID,
      Aciklama: form.Aciklama || null,
      Numune_Adi: form.Numune_Adi.trim(),
      Numune_Adi_En: form.Numune_Adi_En || null,
      Urun_Tipi: form.Urun_Tipi || null,
      UGDTip_ID: form.UGDTip_ID,
      Hedef_Grup: form.Hedef_Grup || null,
      TesteMiktar: form.TesteMiktar || null,
      TesteMiktarBirim: form.TesteMiktarBirim || null,
    },
    detay: {
      ProjeID: form.ProjeID,
      Miktar: form.Miktar || null,
      Birim: form.Birim || null,
      SeriNo: form.SeriNo || null,
      UretimTarihi: normalizePartialDate(form.UretimTarihi),
      SKT: normalizePartialDate(form.SKT),
    },
    hizmetler: hizmetler.map(({ AnalizID, Termin, x3ID, Limit, Birim }) => ({
      AnalizID,
      Termin: Termin || null,
      x3ID,
      Limit: Limit || null,
      Birim: Birim || null,
    })),
    formul: formul.map(f => ({
      HammaddeID: f.HammaddeID,
      INCIName: f.INCIName || null,
      Miktar: f.Miktar || null,
      DaP: f.DaP || null,
      Noael: f.Noael || null,
    })),
  });

  const handleSave = async () => {
    setSaveErr("");
    if (!form.Evrak_No.trim() || !form.RaporNo.trim() || !form.Numune_Adi.trim()) {
      setSaveErr("Evrak No, Rapor No ve Numune Adı zorunludur.");
      setTab(0);
      return;
    }
    const body = buildPayload();
    setSaving(true);
    try {
      if (isEdit) {
        const res = await fetch(`/api/numune-form/${effectiveId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Güncellenemedi");
        if (form.FotoFile) {
          const pathStr = await uploadFoto(effectiveId!, form.FotoFile);
          setForm(f => ({ ...f, FotoFile: null, FotoPreview: "", FotoPath: pathStr }));
        }
        router.refresh();
        // Yeni kayıt akışında (URL'deki ID değil, createdId varsa) PUT sonrası "ekle?" sor
        if (!recordId && createdId) {
          const addMore = window.confirm(
            "Kayıt güncellendi. Aynı evrak ve firma bilgileriyle yeni ürün (yeni rapor no) eklemek ister misiniz?"
          );
          if (addMore) {
            const nr = await fetch(`/api/numune-form/next-no?grup=${encodeURIComponent(form.Grup || "Özel")}`);
            const j = await nr.json();
            setForm(f => ({
              ...emptyForm(),
              Tarih: f.Tarih,
              Teklif_No: f.Teklif_No,
              Talep_No: f.Talep_No,
              Evrak_No: f.Evrak_No,
              RaporNo: nr.ok ? j.raporNo : "",
              Revno: "0",
              Grup: f.Grup,
              Tur: f.Tur,
              Karar: f.Karar,
              Dil: f.Dil,
              Firma_ID: f.Firma_ID,
              FirmaAd: f.FirmaAd,
              ProjeID: f.ProjeID,
              ProjeAd: f.ProjeAd,
              Barkod: f.Barkod,
              Hedef_Grup: f.Hedef_Grup,
            }));
            setHizmetler([]);
            setFormul([]);
            setCreatedId(null);
            setTab1Saved(false);
            setTab(0);
            window.history.replaceState(null, "", "/laboratuvar/numune-form");
          }
        }
      } else {
        const res = await fetch("/api/numune-form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kaydedilemedi");
        const newId = data.id as number;
        if (form.FotoFile) {
          await uploadFoto(newId, form.FotoFile);
        }
        // Numune bilgileri kaydedildi; URL'yi güncelle ve Hizmetler sekmesine geç
        setCreatedId(newId);
        setTab1Saved(true);
        window.history.replaceState(null, "", `/laboratuvar/numune-form/${newId}`);
        setTab(1); // Hizmetler sekmesine otomatik geç
      }
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Hata");
    } finally {
      setSaving(false);
    }
  };

  if (loadErr) {
    return (
      <div className={styles.page}>
        <div className={nf.err}>{loadErr}</div>
        <Link href="/laboratuvar/numune-takip" className={nf.backLink}>← Numune kabul listesine dön</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={nf.toolbar}>
        <div className={nf.titleBlock}>
          <h1>{isEdit ? `Numune — ${form.RaporNo || recordId}` : "Yeni numune"}</h1>
          <p>Detaylı kayıt — sekmeler arasında gezinin; kayıt için alttaki Kaydet’i kullanın.</p>
        </div>
        <div className={nf.actions}>
          <Link href="/laboratuvar/numune-takip" className={nf.backLink}>← Listeye dön</Link>
        </div>
      </div>

      {saveErr && <div className={nf.err}>{saveErr}</div>}

      <div className={nf.tabs}>
        {TABS.map((label, i) => {
          const locked = i > 0 && !tabsUnlocked;
          return (
            <button
              key={label}
              type="button"
              className={`${nf.tab} ${tab === i ? nf.tabActive : ""} ${locked ? nf.tabLocked : ""}`}
              title={locked ? "Önce Numune Bilgileri'ni kaydedin" : undefined}
              onClick={() => {
                if (locked) {
                  setSaveErr('Diğer sekmelere geçmek için önce "Numune Bilgileri"ni kaydedin.');
                  setTab(0);
                  return;
                }
                setSaveErr("");
                setTab(i);
              }}
            >
              {label}
              {locked && <span aria-hidden style={{ marginLeft: 5, opacity: 0.5 }}>🔒</span>}
            </button>
          );
        })}
      </div>

      <div className={nf.panel}>
        {tab === 0 && (
          <Tab1Bilgiler
            form={form}
            onChange={patchForm}
            lookup={lookup}
            loadingNos={loadingNos}
          />
        )}
        {tab === 1 && (
          <Tab2Hizmetler tarih={form.Tarih} rows={hizmetler} onChange={setHizmetler} />
        )}
        {tab === 2 && <Tab3Formul rows={formul} onChange={setFormul} form={form} onFormChange={patchForm} lookup={lookup} />}
        {tab === 3 && <Tab4Gecmis recordId={recordId ?? null} />}
      </div>

      <footer className={nf.saveBar}>
        <button type="button" className={styles.saveBtn} onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Kaydediliyor…" : isEdit ? "Güncelle" : "Kaydet"}
        </button>
      </footer>
    </div>
  );
}
