"use client";

import { useEffect, useId, useState } from "react";
import styles from "../spektrotek-talep/requests.module.css";
import ui from "./unique-talep.module.css";

export type UniqueCompanyOption = { id: number; name: string; email: string; contact: string };
type Props = { value: string; companyId: number | null; disabled: boolean; onChange: (name: string) => void; onSelect: (company: UniqueCompanyOption) => void; onManual: () => void };
export default function UniqueCompanyPicker({ value, companyId, disabled, onChange, onSelect, onManual }: Props) {
  const inputId = useId(), listId = `${inputId}-results`;
  const [result, setResult] = useState<{ query: string; items: UniqueCompanyOption[]; loading: boolean; error: string }>({ query: "", items: [], loading: false, error: "" });
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [manualChoice, setManualChoice] = useState(false), [retry, setRetry] = useState(0);
  const query = value.trim(), matches = result.query === query ? result.items : [];
  const show = open && !companyId && !manualChoice && query.length >= 2 && !disabled;
  useEffect(() => {
    if (companyId || manualChoice || query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResult({ query, items: [], loading: true, error: "" });
      fetch(`/api/unique-talep/companies?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" })
        .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body.data as UniqueCompanyOption[]; })
        .then(items => { if (!controller.signal.aborted) { setResult({ query, items, loading: false, error: "" }); setActive(0); } })
        .catch(error => { if (!controller.signal.aborted) setResult({ query, items: [], loading: false, error: error instanceof Error ? error.message : "Firmalar aranamadı." }); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, companyId, manualChoice, retry]);
  function choose(company?: UniqueCompanyOption) {
    setOpen(false);
    if (company) onSelect(company); else { setManualChoice(true); onManual(); }
  }
  return <div className={ui.companyPicker} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <label htmlFor={inputId}>Firma / müşteri adı</label>
    <input id={inputId} autoFocus autoComplete="off" required maxLength={300} role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={show ? listId : undefined} aria-activedescendant={show ? `${listId}-${Math.min(active, matches.length)}` : undefined} disabled={disabled} value={value}
      onFocus={() => setOpen(true)} onChange={event => { setOpen(true); setManualChoice(false); setActive(0); onChange(event.target.value); }}
      onKeyDown={event => {
        if (event.key === "Escape") { setOpen(false); return; }
        if (!show) { if (event.key === "ArrowDown" && query.length >= 2) { event.preventDefault(); setOpen(true); } return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(current => (current + (event.key === "ArrowDown" ? 1 : -1) + matches.length + 1) % (matches.length + 1)); }
        if (event.key === "Enter") { event.preventDefault(); choose(matches[Math.min(active, matches.length)]); }
      }} />
    {companyId ? <div className={ui.companyHint}><span>Kayıtlı firma seçildi · #{companyId}</span><button type="button" className={styles.button} disabled={disabled} onClick={() => { setManualChoice(true); onManual(); }}>Seçimi kaldır</button></div> : <small className={styles.muted}>{manualChoice ? "Bu adla manuel devam ediliyor; yeni müşteri kaydı açılmaz." : "En az 2 harf yazın; kayıtlı firmayı seçin veya manuel devam edin."}</small>}
    {show && <div className={ui.companyResults}>
      {result.query !== query || result.loading ? <p className={styles.muted} role="status">Firmalar aranıyor…</p> : result.error ? <p className={styles.muted} role="status">{result.error} <button type="button" className={styles.button} onClick={() => setRetry(v => v + 1)}>Yeniden ara</button></p> : !matches.length ? <p className={styles.muted} role="status">Kayıtlı firma bulunamadı.</p> : null}
      <div id={listId} role="listbox" aria-label="Kayıtlı firmalar">
        {matches.map((company, index) => <button id={`${listId}-${index}`} type="button" role="option" aria-selected={active === index} tabIndex={-1} key={company.id} onClick={() => choose(company)}><strong>{company.name}</strong><small>{[company.contact, company.email].filter(Boolean).join(" · ") || "İletişim bilgisi yok"}</small></button>)}
        <button id={`${listId}-${matches.length}`} type="button" role="option" aria-selected={active === matches.length} tabIndex={-1} onClick={() => choose()}>“{query}” adıyla manuel devam et</button>
      </div>
    </div>}
  </div>;
}
