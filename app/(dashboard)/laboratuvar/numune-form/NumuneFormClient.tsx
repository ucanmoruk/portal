"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/styles/table.module.css";
import nf from "./numune-form.module.css";
import Tab1Bilgiler from "./Tab1Bilgiler";
import Tab2Hizmetler from "./Tab2Hizmetler";
import Tab4Gecmis from "./Tab4Gecmis";
import type { LookupData, NkrFormData, HizmetRow } from "./numuneFormTypes";
import { emptyForm, emptyRaporMetinleri } from "./numuneFormTypes";

const TABS = ["Numune bilgileri", "Hizmetler", "Ürün geçmişi"] as const;

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

// UretimTarihi / SKT serbest TEXT alandır (DB: nvarchar(20)). Kullanıcının yazdığı
// değer olduğu gibi gönderilir — "2026-30", "Q4-2026", "Mar/2026" hepsi kabul edilir.
// Boş string null'a çevrilir, başka normalizasyon yapılmaz.
function passthroughText(v: string): string | null {
  return v && v.trim() ? v.trim() : null;
}

function mapApiToForm(
  nkr: Record<string, unknown>,
  detay: Record<string, unknown> | null,
  fotoPath: string | null,
  raporMetinleri?: Record<string, string> | null,
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
    RaporMetinleri: { ...emptyRaporMetinleri(), ...(raporMetinleri || {}) },
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

export default function NumuneFormClient({ recordId }: { recordId?: string }) {
  const router = useRouter();
  const [tab, setTab]       = useState(0);
  const [lookup, setLookup] = useState<LookupData>({ grupTurleri: [], rUGDTipler: [], paketler: [] });
  const [form, setForm]     = useState<NkrFormData>(() => emptyForm());
  const [hizmetler, setHizmetler] = useState<HizmetRow[]>([]);
  const [loadingNos, setLoadingNos] = useState(false);
  const [loadErr, setLoadErr]       = useState("");
  const [saving, setSaving]         = useState(false);
  const [saveErr, setSaveErr]       = useState("");
  const [editLock, setEditLock] = useState<{ locked: boolean; durum: string | null; raporFormati: string | null }>({
    locked: false,
    durum: null,
    raporFormati: null,
  });
  const [revizeOpen, setRevizeOpen] = useState(false);
  const [revizeSebep, setRevizeSebep] = useState("");
  const [revizeBusy, setRevizeBusy] = useState(false);
  const [revizeError, setRevizeError] = useState("");
  const savingRef = useRef(false);
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
        setForm(mapApiToForm(data.nkr, data.detay, data.fotoPath ?? null, data.raporMetinleri ?? null));
        setHizmetler(mapHizmetler(data.hizmetler || []));
        setEditLock(data.editLock || { locked: false, durum: null, raporFormati: null });
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
      UretimTarihi: passthroughText(form.UretimTarihi),
      SKT: passthroughText(form.SKT),
    },
    hizmetler: hizmetler.map(({ AnalizID, Termin, x3ID, Limit, Birim }) => ({
      AnalizID,
      Termin: Termin || null,
      x3ID,
      Limit: Limit || null,
      Birim: Birim || null,
    })),
    formul: [],
    raporMetinleri: form.RaporMetinleri,
  });

  const handleSave = async () => {
    if (savingRef.current) return;
    setSaveErr("");
    if (editLock.locked) {
      setSaveErr("Bu numune onaylı/yayınlanmış rapora bağlı olduğu için pasif. Değişiklik için Rapor Takip ekranından Revize Et ile açın.");
      return;
    }
    if (!form.Evrak_No.trim() || !form.RaporNo.trim() || !form.Numune_Adi.trim()) {
      setSaveErr("Evrak No, Rapor No ve Numune Adı zorunludur.");
      setTab(0);
      return;
    }
    const body = buildPayload();
    savingRef.current = true;
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
      savingRef.current = false;
      setSaving(false);
    }
  };

  const parseRev = (value?: string | null): number => {
    const n = parseInt(String(value ?? "0").trim(), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const revLabel = (kod: string, rev: number): string => `${kod}-${String(rev).padStart(2, "0")}`;

  const buildRevizeCumle = (kod: string, eskiRev: number, sebep: string): string => {
    const s = sebep.trim() || "......";
    return `${revLabel(kod, eskiRev)} numaralı rapor ${s} sebebi ile revize edilmiştir. ` +
      `${revLabel(kod, eskiRev)} numaralı rapor geçersizdir. Geçerli rapor numarası ${revLabel(kod, eskiRev + 1)}.`;
  };

  const openRevizeModal = () => {
    setRevizeSebep("");
    setRevizeError("");
    setRevizeOpen(true);
  };

  const handleRevizeSubmit = async () => {
    if (!effectiveId || !editLock.raporFormati || revizeBusy) return;
    const sebep = revizeSebep.trim();
    const raporKodu = form.RaporNo || String(effectiveId);
    const aciklama = sebep ? buildRevizeCumle(raporKodu, parseRev(form.Revno), sebep) : "";
    setRevizeBusy(true);
    setRevizeError("");
    try {
      const res = await fetch(`/api/rapor-takip/${effectiveId}/revize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: editLock.raporFormati, aciklama }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Rapor düzenlemeye açılamadı");
      setEditLock({ locked: false, durum: null, raporFormati: null });
      setRevizeOpen(false);
      setSaveErr(
        sebep
          ? "Rapor revize edildi ve numune düzenlemeye açıldı. Değişikliği kaydedebilirsiniz."
          : "Rapor onay alanına geri alındı ve numune düzenlemeye açıldı. Değişikliği kaydedebilirsiniz.",
      );
      router.refresh();
    } catch (e: unknown) {
      setRevizeError(e instanceof Error ? e.message : "Rapor düzenlemeye açılamadı");
    } finally {
      setRevizeBusy(false);
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
      {editLock.locked && (
        <div className={nf.lockedNotice}>
          {effectiveId && editLock.raporFormati && (
            <button
              type="button"
              className={nf.lockedNoticeBtn}
              onClick={openRevizeModal}
            >
              Düzeltmeye Aç
            </button>
          )}
          Bu numune {editLock.raporFormati ? <strong>{editLock.raporFormati}</strong> : "rapor"} formatında <strong>{editLock.durum || "Onaylandı"}</strong> olduğu için pasif.
          Düzenleme için Rapor Takip ekranında <strong>Revize Et</strong> ile kaydı tekrar açın.
        </div>
      )}

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

      <fieldset className={nf.readOnlyFieldset} disabled={editLock.locked}>
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
        {tab === 2 && <Tab4Gecmis recordId={recordId ?? null} />}
      </div>
      </fieldset>

      <footer className={nf.saveBar}>
        {isEdit && effectiveId != null && (
          <button
            type="button"
            className={styles.saveBtn}
            style={{ background: "var(--color-surface)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)", marginRight: 8 }}
            onClick={async () => {
              try {
                const r = await fetch(`/api/numune-form/barcode-data?ids=${effectiveId}`);
                const j = await r.json();
                if (!r.ok) throw new Error(j.error || "Barkod verisi alınamadı");
                const mod = await import("../yeni-numune/printBarcode");
                mod.printBarcodes(j.data || []);
              } catch (e: any) {
                setSaveErr(e.message || "Barkod yazdırılamadı");
              }
            }}
            disabled={saving}
            title="Bu numune için bölüme göre barkod yazdır"
          >
            🏷  Barkod Yazdır
          </button>
        )}
        <button type="button" className={styles.saveBtn} onClick={() => void handleSave()} disabled={saving || editLock.locked}>
          {saving ? "Kaydediliyor…" : isEdit ? "Güncelle" : "Kaydet"}
        </button>
      </footer>

      {revizeOpen && (
        <div
          onClick={() => !revizeBusy && setRevizeOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--color-surface)",
              borderRadius: 14,
              padding: 22,
              width: "100%",
              maxWidth: 560,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Raporu Düzeltmeye Aç</h3>
              <button
                type="button"
                onClick={() => !revizeBusy && setRevizeOpen(false)}
                style={{ border: "none", background: "transparent", fontSize: "1.3rem", cursor: revizeBusy ? "wait" : "pointer", color: "var(--color-text-secondary)", lineHeight: 1 }}
              >×</button>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              Rapor <strong>{form.RaporNo || effectiveId}</strong> · {editLock.raporFormati}
              {revizeSebep.trim()
                ? <> — Rev.{parseRev(form.Revno)} → <strong>Rev.{parseRev(form.Revno) + 1}</strong>. TR/EN bağlı formatlar birlikte açılır.</>
                : <> — Açıklama boş bırakılırsa Rev.{parseRev(form.Revno)} korunur; rapor onay alanına geri döner ve numune formu düzenlemeye açılır. TR/EN bağlı formatlar birlikte açılır.</>}
            </p>

            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
              Revize Sebebi <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>(boş bırakılırsa sadece düzenlemeye açılır)</span>
            </label>
            <textarea
              value={revizeSebep}
              onChange={e => setRevizeSebep(e.target.value)}
              disabled={revizeBusy}
              rows={2}
              placeholder="örn. firma adı / müşteri bilgisi düzeltmesi"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--color-border)", fontSize: "0.85rem", background: "var(--color-surface)", resize: "vertical", fontFamily: "inherit" }}
            />

            <div style={{ marginTop: 12, fontSize: "0.72rem", fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 4 }}>
              Açıklama:
            </div>
            <div style={{ fontSize: "0.82rem", lineHeight: 1.5, padding: "10px 12px", background: "var(--color-surface-2)", borderRadius: 8, color: "var(--color-text-primary)" }}>
              {revizeSebep.trim()
                ? buildRevizeCumle(form.RaporNo || String(effectiveId), parseRev(form.Revno), revizeSebep)
                : "Revizyon numarası ve revizyon açıklaması değişmeden, rapor onay alanına geri alınacak."}
            </div>

            {revizeError && (
              <div style={{ marginTop: 12, color: "#c00", fontSize: "0.8rem", padding: "8px 10px", background: "#ff3b3010", borderRadius: 7 }}>
                {revizeError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setRevizeOpen(false)}
                disabled={revizeBusy}
                style={{
                  padding: "8px 14px", borderRadius: 7, border: "1px solid var(--color-border)",
                  background: "transparent", color: "var(--color-text-secondary)",
                  fontSize: "0.85rem", fontWeight: 600, cursor: revizeBusy ? "wait" : "pointer",
                }}
              >Vazgeç</button>
              <button
                type="button"
                onClick={handleRevizeSubmit}
                disabled={revizeBusy}
                style={{
                  padding: "8px 14px", borderRadius: 7, border: "none",
                  background: "#c06800", color: "#fff",
                  fontSize: "0.85rem", fontWeight: 700,
                  cursor: revizeBusy ? "wait" : "pointer",
                }}
              >
                {revizeBusy ? "İşleniyor..." : (revizeSebep.trim() ? "Revize Et" : "Düzenlemeye Aç")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
