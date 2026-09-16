"use client";
import { useEffect, useRef, useState } from "react";
import { CHALLENGE_ASSESSMENTS, type ChallengeAssessment, type ChallengeData } from "@/lib/challengeImport";
import styles from "./challengeImport.module.css";

type SheetPreview = { name: string; veri?: Omit<ChallengeData, "assessment">; error?: string };
export default function ChallengeImportPanel({ nkrId, format, onSaved }: { nkrId: number; format: string; onSaved: (data: ChallengeData) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<SheetPreview[]>([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<Omit<ChallengeData, "assessment"> | null>(null);
  const [assessment, setAssessment] = useState<ChallengeAssessment | "">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const actionInProgress = useRef(false);
  const url = `/api/rapor-takip/${nkrId}/challenge`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${url}?format=${encodeURIComponent(format)}`, { signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then(result => { if (result.veri) { setData(result.veri); setAssessment(result.veri.assessment); } })
      .catch(error => { if (error.name !== "AbortError") setError(error.message || "Kayıtlı sonuçlar alınamadı."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, format]);
  async function importFile(file?: File) {
    if (!file || actionInProgress.current) return;
    actionInProgress.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024) throw new Error("En fazla 10 MB boyutunda .xlsx dosyası seçin.");
      const body = new FormData(); body.append("file", file); body.append("format", format);
      const response = await fetch(url, { method: "POST", body });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Excel okunamadı.");
      const previews: SheetPreview[] = result.sheets;
      setSheets(previews); setAssessment("");
      if (previews.length === 1 && previews[0].veri) { setSelected(previews[0].name); setData(previews[0].veri); }
      else { setSelected(""); setData(null); }
    } catch (error) { setError(error instanceof Error ? error.message : "Excel okunamadı."); }
    finally { actionInProgress.current = false; setBusy(false); if (input.current) input.current.value = ""; }
  }
  function selectSheet(name: string) {
    setSelected(name); setError(""); setNotice(""); setAssessment("");
    const sheet = sheets.find(sheet => sheet.name === name);
    setData(sheet?.veri || null); if (sheet?.error) setError(sheet.error);
  }
  async function save(submit: boolean) {
    if (!data || !assessment || actionInProgress.current) return;
    actionInProgress.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const veri: ChallengeData = { ...data, assessment };
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, veri, onayaGonder: submit }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Sonuçlar kaydedilemedi.");
      setNotice(submit ? "Challenge sonuçları kaydedildi ve onaya gönderildi." : "Challenge sonuçları kaydedildi.");
      onSaved(veri);
    } catch (error) { setError(error instanceof Error ? error.message : "Sonuçlar kaydedilemedi."); }
    finally { actionInProgress.current = false; setBusy(false); }
  }
  return <section className={styles.panel} aria-label="Challenge Excel sonuçları">
    <div className={styles.header}><div><h3>Challenge sonuçları · Excel içe aktar</h3><p>Dosyayı ve çalışma sayfasını seçin; sonuçları kontrol ederek değerlendirme girin.</p></div></div>
    <fieldset disabled={busy || loading} className={styles.controls}>
      <label>Excel formatı<select aria-label="Challenge Excel formatı" defaultValue="F.06.PR.19"><option value="F.06.PR.19">F.06.PR.19 · Challenge Testi Analiz Detay Formu R.01</option></select></label>
      <button className={styles.primary} type="button" onClick={() => input.current?.click()}>{busy ? "İşleniyor…" : "Excel içe aktar"}</button>
      <input ref={input} className={styles.hidden} type="file" accept=".xlsx" aria-label="Challenge Excel dosyası seç" onChange={event => void importFile(event.target.files?.[0])} />
      {sheets.length > 1 && <label>Çalışma sayfası<select value={selected} onChange={event => selectSheet(event.target.value)}><option value="">Sayfa seçin</option>{sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}</select></label>}
    </fieldset>
    {loading && <p role="status">Kayıtlı sonuçlar yükleniyor…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {data && <>
      <p className={styles.source}>{data.sourceFile} · Sayfa: {data.sourceSheet}</p>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th rowSpan={2}>Mikroorganizma</th><th rowSpan={2}>İnokülasyon</th><th colSpan={4}>Numune sayımı</th><th colSpan={3}>Düşüş (Log)</th></tr><tr>{["0. Gün", "7. Gün", "14. Gün", "28. Gün", "7. Gün", "14. Gün", "28. Gün"].map((heading, index) => <th key={index}>{heading}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.organism}><th scope="row">{row.organism}</th>{[row.inoculation, ...row.counts, ...row.reductions].map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table></div>
      <div className={styles.actions}><label>Değerlendirme<select disabled={busy} value={assessment} onChange={event => setAssessment(event.target.value as ChallengeAssessment | "")}><option value="">Seçiniz</option>{CHALLENGE_ASSESSMENTS.map(value => <option key={value}>{value}</option>)}</select></label><button type="button" disabled={busy || !assessment} onClick={() => void save(false)}>Kaydet</button><button type="button" className={styles.primary} disabled={busy || !assessment} onClick={() => void save(true)}>Kaydet ve onaya gönder</button></div>
    </>}
  </section>;
}
