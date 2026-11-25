"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { salesApi } from "./salesApi";
import s from "./sales.module.css";
export default function SalesAiSettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [provider, setProvider] = useState("anthropic"), [model, setModel] = useState(""), [key, setKey] = useState("");
  const [configured, setConfigured] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    void salesApi<{ provider: string; model: string; configured: boolean }>("/api/crm/sales/settings", undefined, controller.signal).then(result => { if (!controller.signal.aborted) { setProvider(result.provider); setModel(result.model); setConfigured(result.configured); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { await salesApi("/api/crm/sales/settings", { provider, model, apiKey: key }); setKey(""); await onSaved(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Kaydedilemedi."); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={s.dialog} style={{ maxWidth: 620 }} aria-labelledby="sales-ai-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><header className={s.dialogHeader}><h2 id="sales-ai-title">AI bağlantı ayarları</h2><button className={s.button} disabled={busy} onClick={onClose} aria-label="AI ayarlarını kapat"><X size={18} /></button></header><form className={s.dialogBody} onSubmit={save}>{error && <p role="alert" className={s.error}>{error}</p>}<p className={s.muted}>Bağlantı bilgilerini yalnız yönetici değiştirebilir. Kayıtlı API anahtarı bu ekrana geri gönderilmez. {configured ? "Bağlantı bilgileri mevcut; ilk taslak isteğinde sağlayıcı erişimi kontrol edilir." : "Taslak üretimi için bir sağlayıcı ve API anahtarı tanımlayın."}</p><div className={s.fields}><label className={s.wide}>Sağlayıcı<select value={provider} disabled={busy} onChange={e => { setProvider(e.target.value); setModel(""); setKey(""); }}><option value="anthropic">Claude (Anthropic)</option><option value="openai">OpenAI</option></select></label><label className={s.wide}>API anahtarı<input type="password" autoComplete="new-password" value={key} disabled={busy} maxLength={4096} onChange={e => setKey(e.target.value)} placeholder={configured ? "Değiştirmek istemiyorsanız boş bırakın" : "API anahtarınız"} /></label><label className={s.wide}>Model <span className={s.muted}>(isteğe bağlı)</span><input value={model} disabled={busy} maxLength={120} onChange={e => setModel(e.target.value)} placeholder="Varsayılan modeli kullan" /></label></div><div className={s.actions}><button className={s.primary} disabled={busy}>Ayarları kaydet</button><button type="button" className={s.button} disabled={busy} onClick={onClose}>Vazgeç</button></div><Link className={s.link} href="/iletisim/crm-agent/bilgi-kurallar">AI bilgi ve yazım kurallarını düzenle →</Link></form></dialog>;
}
