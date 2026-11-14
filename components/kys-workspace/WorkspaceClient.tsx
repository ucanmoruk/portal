"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Plus, Printer, RotateCw, Search, X, ClipboardList } from "lucide-react";
import QRCode from "qrcode";
import table from "@/app/styles/table.module.css";
import s from "./Workspace.module.css";
import { WORKSPACES, WORKSPACE_GROUPS, recordLabel, standardUncertainty, type WorkspaceRecord, type WorkspaceAudit } from "@/lib/kysWorkspaceConfig";

const BASE = "/laboratuvar/kys/";
const dateText = (value?: string) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleString("tr-TR", value.length === 10 ? { dateStyle: "short" } : { dateStyle: "short", timeStyle: "short" }) : "—";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
export default function WorkspaceClient({ module, recordId, deviceId, embedded = false }: { module: string; recordId?: string; deviceId?: string; embedded?: boolean }) {
  const config = WORKSPACES[module];
  const searchParams = useSearchParams();
  const parentId = deviceId || searchParams.get("deviceId") || searchParams.get("meetingId") || searchParams.get("validationId") || "";
  const [rows, setRows] = useState<WorkspaceRecord[]>([]);
  const [relations, setRelations] = useState<Record<string, WorkspaceRecord[]>>({});
  const [history, setHistory] = useState<WorkspaceAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<WorkspaceRecord | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(config.status[0]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [qr, setQr] = useState("");
  const [children, setChildren] = useState<WorkspaceRecord[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/kys/workspace/${module}`, { signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      if (signal?.aborted) return;
      setRows(json.data); setRelations(json.relations); setCanEdit(json.canEdit); setCanApprove(json.canApprove);
      if (module === "cihaz-listesi" && !recordId) {
        const response = await fetch("/api/kys/workspace/kalibrasyon-kontrol", { signal });
        if (response.ok) { const body = await response.json(); setChildren(body.data); }
      }
      if (recordId) {
        const res = await fetch(`/api/kys/workspace/${module}/${recordId}`, { signal });
        const detail = await res.json(); if (!res.ok) throw new Error(detail.error);
        setHistory(detail.history);
        const childModules = module === "cihaz-listesi" ? ["kalibrasyon-kontrol", "cihaz-islemleri", "kalibrasyon-belirsizlikleri"] : module === "toplantilar" ? ["toplanti-kararlari"] : module === "yazilim-dogrulama" ? ["yazilim-testleri"] : [];
        const childRows = await Promise.all(childModules.map(async key => { const r = await fetch(`/api/kys/workspace/${key}`, { signal }); if (r.status === 403) return []; const body = await r.json(); if (!r.ok) throw new Error(body.error); return body.data as WorkspaceRecord[]; }));
        setChildren(childRows.flat().filter(r => [r.data.deviceId, r.data.meetingId, r.data.validationId].includes(recordId)));
      }
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Kayıtlar alınamadı."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [module, recordId]);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load]);
  const record = recordId ? rows.find(row => row.id === recordId) : null;
  useEffect(() => {
    if (!record || module !== "cihaz-listesi") return;
    let active = true;
    void QRCode.toDataURL(`${window.location.origin}${BASE}${module}/${record.id}`, { width: 200, margin: 1, errorCorrectionLevel: "M" }).then(url => { if (active) setQr(url); });
    return () => { active = false; };
  }, [record, module]);
  useEffect(() => {
    if (!editing) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, [editing]);
  function valueFor(row: WorkspaceRecord, key: string) {
    if (module === "cihaz-listesi" && ["calibrationDate", "nextCalibrationDate"].includes(key)) {
      const calibrations = children.filter(r => r.module === "kalibrasyon-kontrol" && r.data.kind === "Kalibrasyon" && r.data.deviceId === row.id && r.status === "Uygun").sort((a,b) => (b.data.performedAt || "").localeCompare(a.data.performedAt || ""));
      return dateText(calibrations[0]?.data[key === "calibrationDate" ? "performedAt" : "nextDate"]);
    }
    return row.data[key];
  }
  const columnTitle = (key: string) => config.fields.find(f => f.key === key)?.label || ({ calibrationDate: "Son kalibrasyon", nextCalibrationDate: "Sonraki kalibrasyon" } as Record<string,string>)[key] || key;
  const label = (key: string, value: string) => {
    const field = config.fields.find(f => f.key === key);
    if (field?.relation) return recordLabel(relations[field.relation]?.find(r => r.id === value) || { id: value, data: {} } as WorkspaceRecord);
    return field?.type === "date" ? dateText(value) : value || "—";
  };
  const visible = useMemo(() => rows.filter(row => (!parentId || [row.data.deviceId, row.data.meetingId, row.data.validationId].includes(parentId)) && (!statusFilter || row.status === statusFilter) && `${Object.values(row.data).join(" ")} ${row.status}`.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR"))), [rows, parentId, statusFilter, search]);
  const overdue = (row: WorkspaceRecord) => Boolean(row.data.dueDate && row.data.dueDate < today() && !["Uygun", "Uygun Değil", "Tamamlandı", "İptal", "Başarılı", "Başarısız", "Onaylandı", "Yayında"].includes(row.status));
  function openForm(row: WorkspaceRecord | "new") {
    const relationKey = config.fields.find(f => f.relation)?.key;
    setEditing(row); setForm(row === "new" ? relationKey && parentId ? { [relationKey]: parentId } : {} : { ...row.data }); setStatus(row === "new" ? config.status[0] : row.status); setFormError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (saving || !editing) return;
    setSaving(true); setFormError("");
    try {
      const res = await fetch(`/api/kys/workspace/${module}${editing === "new" ? "" : `/${editing.id}`}`, { method: editing === "new" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: form, status, version: editing === "new" ? 0 : editing.version }) });
      const result = await res.json(); if (!res.ok) throw new Error(result.error);
      setEditing(null); setSuccess("Kayıt kaydedildi."); await load();
    } catch (e) { setFormError(e instanceof Error ? e.message : "Kayıt kaydedilemedi."); }
    finally { setSaving(false); }
  }
  function exportCsv() {
    const columns = [...config.columns, "status", "updatedBy", "updatedAt"];
    const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""')}"`;
    const text = [columns.map(k => ({ status: "Durum", updatedBy: "Güncelleyen", updatedAt: "Güncelleme Tarihi" } as Record<string, string>)[k] || columnTitle(k)), ...visible.map(row => columns.map(k => k === "status" ? row.status : k === "updatedBy" ? row.updatedBy : k === "updatedAt" ? dateText(row.updatedAt) : label(k, valueFor(row, k))))].map(line => line.map(cell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `${module}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const group = WORKSPACE_GROUPS.find(g => g.modules.includes(module));
  return <div className={s.shell}>
    {!embedded && <nav className={s.nav} aria-label={group?.label}>{group?.modules.map(key => <Link key={key} href={BASE + key} aria-current={key === module ? "page" : undefined}>{WORKSPACES[key].title}</Link>)}</nav>}
    <div className={table.pageHeader}><div><h1 className={table.pageTitle}>{record ? recordLabel(record) : config.title}{!recordId && config.code && <span className={s.muted}> · {config.code}</span>}</h1><p className={table.pageSubtitle}>{record ? "Tüm değişiklikler kullanıcı ve tarih bilgisiyle izlenir." : config.description}</p></div></div>
    {error && <div className={s.error} role="alert">{error}</div>}
    {success && <div className={s.notice} role="status">{success}</div>}
    <div className={s.toolbar}><div className={s.controls}>{recordId ? <Link className={s.button} href={BASE + module}>Listeye dön</Link> : <><div className={table.searchBox}><Search size={15} aria-hidden="true" /><input className={table.searchInput} aria-label="Kayıtlarda ara" placeholder="Kod, ad veya sorumlu ara…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div><select className={s.input} aria-label="Durum filtresi" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}><option value="">Tüm durumlar</option>{config.status.map(v => <option key={v}>{v}</option>)}</select>{parentId && <Link className={s.button} href={BASE + module}>İlişki filtresini kaldır</Link>}</>}</div><div className={s.controls}><button className={s.button} disabled={loading} onClick={() => void load()}><RotateCw size={15} />Yenile</button><button className={s.button} onClick={() => window.print()}><Printer size={15} />Yazdır</button>{!recordId && <button className={s.button} onClick={exportCsv} disabled={loading}><Download size={15} />CSV indir</button>}{canEdit && <button className={`${s.button} ${s.primary}`} disabled={loading || Boolean(recordId && !record)} onClick={() => openForm(record || "new")}><Plus size={15} />{recordId ? "Düzenle" : "Yeni kayıt"}</button>}</div></div>
    {!recordId && <><div className={s.metrics}><div className={s.metric}><strong>{visible.length}</strong><span>Kayıt</span></div><div className={s.metric}><strong className={s.overdue}>{visible.filter(overdue).length}</strong><span>Termini geçen</span></div></div><div className={table.tableCard}><div className={table.tableWrapper}><table className={table.table}><thead><tr>{config.columns.map(k => <th key={k}>{columnTitle(k)}</th>)}<th>Durum</th><th>Güncelleyen</th><th>İşlem</th></tr></thead><tbody>{loading ? <tr><td colSpan={config.columns.length + 3}><div className={s.empty} role="status">Kayıtlar yükleniyor…</div></td></tr> : visible.length === 0 ? <tr><td colSpan={config.columns.length + 3}><div className={s.empty}><ClipboardList size={28} /><strong>Kayıt bulunamadı</strong><span>Yeni kayıt ekleyin veya filtrelerinizi değiştirin.</span></div></td></tr> : visible.slice((page - 1) * 25, page * 25).map(row => <tr key={row.id}>{config.columns.map((key, index) => <td key={key} style={{ maxWidth: 260, whiteSpace: "normal" }}>{index === 0 ? <Link href={`${BASE}${module}/${row.id}`} className={table.codeLink}>{label(key, valueFor(row, key))}</Link> : <span className={key === "dueDate" && overdue(row) ? s.overdue : ""}>{label(key, valueFor(row, key))}</span>}</td>)}<td><span className={s.pill}>{row.status}</span></td><td>{row.updatedBy}<div className={s.muted}>{dateText(row.updatedAt)}</div></td><td><Link className={s.button} href={`${BASE}${module}/${row.id}`}>{module === "cihaz-listesi" ? "Sicil kartı" : "Detay"}</Link></td></tr>)}</tbody></table></div><div className={table.pagination}><button className={table.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Önceki</button><span>{page} / {Math.max(1, Math.ceil(visible.length / 25))}</span><button className={table.pageBtn} disabled={page * 25 >= visible.length} onClick={() => setPage(p => p + 1)}>Sonraki</button></div></div></>}
    {record && <>
      <section className={s.card}><div className={s.toolbar}><h2 className={s.title}>{module === "cihaz-listesi" ? "Cihaz sicil kartı" : "Kayıt bilgileri"}</h2><span className={s.pill}>{record.status}</span></div><dl className={s.detail}>{config.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{label(field.key, record.data[field.key])}</dd></div>)}{module === "kalibrasyon-belirsizlikleri" && <div><dt>Standart belirsizlik (u = U/k)</dt><dd>{standardUncertainty(record)?.toLocaleString("tr-TR", { maximumSignificantDigits: 8 })} {record.data.unit}</dd></div>}<div><dt>Oluşturan</dt><dd>{record.createdBy} · {dateText(record.createdAt)}</dd></div><div><dt>Son güncelleyen</dt><dd>{record.updatedBy} · {dateText(record.updatedAt)}</dd></div></dl></section>
      {module === "cihaz-listesi" && <section className={`${s.card} ${s.section}`}><div className={s.toolbar}><h2 className={s.title}>QR kodlu cihaz etiketi</h2><Link className={s.button} href={`/cihaz-etiketi/${record.id}`} target="_blank">Yalnızca etiketi yazdır</Link></div><div className={s.label}>{qr && <Image src={qr} width={80} height={80} unoptimized alt={`${record.data.code} cihaz sicil kartına erişim QR kodu`} />}<div><strong>{record.data.code}</strong><div>{record.data.name}</div><small>{record.data.brand} {record.data.model} · SN: {record.data.serial || "—"}</small><small>{record.data.unit} · {record.status}</small><small>Son kalibrasyon: {dateText(children.filter(r => r.module === "kalibrasyon-kontrol" && r.data.kind === "Kalibrasyon" && r.status === "Uygun").sort((a,b) => (b.data.performedAt || "").localeCompare(a.data.performedAt || ""))[0]?.data.performedAt)}</small><small>Sonraki: {dateText(children.filter(r => r.module === "kalibrasyon-kontrol" && r.data.kind === "Kalibrasyon" && r.status === "Uygun").sort((a,b) => (b.data.performedAt || "").localeCompare(a.data.performedAt || ""))[0]?.data.nextDate)}</small></div></div><p className={s.muted}>QR kodu bu cihazın oturum korumalı sicil kartını açar. Yazdırırken etiket bölümünü seçebilirsiniz.</p></section>}
      {["cihaz-listesi", "toplantilar"].includes(module) && <section className={`${s.card} ${s.section}`}><h2 className={s.title}>İlişkili kayıtlar</h2><div className={s.links}>{(module === "cihaz-listesi" ? ["kalibrasyon-kontrol", "cihaz-islemleri", "kalibrasyon-belirsizlikleri"] : module === "toplantilar" ? ["toplanti-kararlari"] : ["yazilim-testleri"]).filter(key => key !== "kalibrasyon-belirsizlikleri").map(key => <Link className={s.button} key={key} href={`${BASE}${key}?${module === "cihaz-listesi" ? "deviceId" : module === "toplantilar" ? "meetingId" : "validationId"}=${record.id}`}>{WORKSPACES[key].title}</Link>)}</div>{children.length ? children.map(child => <div key={child.id}><Link href={`${BASE}${child.module}/${child.id}`}>{WORKSPACES[child.module].title} · {recordLabel(child)}</Link> <span className={s.pill}>{child.status}</span> <span className={s.muted}>{dateText(child.data.performedAt || child.data.dueDate)} · {child.updatedBy}</span></div>) : <p className={s.muted}>Henüz ilişkili kayıt yok.</p>}</section>}
      {module === "cihaz-listesi" && <section className={s.card}><WorkspaceClient module="kalibrasyon-belirsizlikleri" deviceId={record.id} embedded /></section>}
      <section className={s.card}><h2 className={s.title}>Değişiklik geçmişi</h2><ol className={s.history}>{history.map(entry => <li key={entry.id}><details><summary>{entry.action} · {entry.actor} · {dateText(entry.at)} · Sürüm {entry.after.version}</summary><ul>{config.fields.filter(f => entry.before?.data[f.key] !== entry.after.data[f.key]).map(f => <li key={f.key}><strong>{f.label}:</strong> {entry.before?.data[f.key] || "—"} → {entry.after.data[f.key] || "—"}</li>)}{entry.before?.status !== entry.after.status && <li><strong>Durum:</strong> {entry.before?.status || "—"} → {entry.after.status}</li>}</ul></details></li>)}</ol></section>
    </>}
    {recordId && !record && !loading && !error && <div className={s.empty}>Kayıt bulunamadı.</div>}
    {editing && <dialog ref={dialogRef} className={s.dialog} onCancel={e => { if (saving) e.preventDefault(); else setEditing(null); }} aria-labelledby="workspace-dialog-title"><div className={s.dialogHeader}><h2 className={s.title} id="workspace-dialog-title">{editing === "new" ? "Yeni kayıt" : "Kaydı düzenle"} · {config.title}</h2><button type="button" className={s.button} disabled={saving} aria-label="Kapat" onClick={() => setEditing(null)}><X size={16} /></button></div><form onSubmit={save} style={{ display: "contents" }}><div className={s.form}>{formError && <div className={`${s.error} ${s.wide}`} role="alert">{formError}</div>}{config.fields.map(field => <label className={`${s.field} ${field.type === "textarea" ? s.wide : ""}`} key={field.key}>{field.label}{field.required ? " *" : ""}{field.relation ? <select className={s.input} required={field.required} value={form[field.key] || ""} onChange={e => setForm(v => ({ ...v, [field.key]: e.target.value }))}><option value="">Seçiniz</option>{(relations[field.relation] || []).filter(r => field.key !== "calibrationId" || !form.deviceId || r.data.deviceId === form.deviceId).map(r => <option key={r.id} value={r.id}>{recordLabel(r)}</option>)}</select> : field.options ? <select className={s.input} required={field.required} value={form[field.key] || ""} onChange={e => setForm(v => ({ ...v, [field.key]: e.target.value }))}><option value="">Seçiniz</option>{field.options.map(o => <option key={o}>{o}</option>)}</select> : field.type === "textarea" ? <textarea className={s.input} required={field.required} value={form[field.key] || ""} onChange={e => setForm(v => ({ ...v, [field.key]: e.target.value }))} /> : <input className={s.input} type={field.type || "text"} step={field.type === "number" ? "any" : undefined} required={field.required} value={form[field.key] || ""} onChange={e => setForm(v => ({ ...v, [field.key]: e.target.value }))} />}{field.hint && <small>{field.hint}</small>}</label>)}<label className={s.field}>Durum<select className={s.input} value={status} onChange={e => setStatus(e.target.value)}>{config.status.map(v => <option key={v} disabled={["Onaylandı", "Yayında"].includes(v) && !canApprove}>{v}</option>)}</select></label></div><div className={s.footer}><button type="button" className={s.button} disabled={saving} onClick={() => setEditing(null)}>Vazgeç</button><button className={`${s.button} ${s.primary}`} disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button></div></form></dialog>}
  </div>;
}
