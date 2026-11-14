"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Circle, Clock, Download, MinusCircle, Plus, Printer, RotateCw, Search, X, XCircle, ClipboardList } from "lucide-react";
import QRCode from "qrcode";
import table from "@/app/styles/table.module.css";
import s from "./Workspace.module.css";
import { WORKSPACES, WORKSPACE_GROUPS, recordLabel, standardUncertainty, type WorkspaceRecord, type WorkspaceAudit } from "@/lib/kysWorkspaceConfig";

const BASE = "/laboratuvar/kys/";
const dateText = (value?: string) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleString("tr-TR", value.length === 10 ? { dateStyle: "short" } : { dateStyle: "short", timeStyle: "short" }) : "—";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
type Tone = "ok" | "warn" | "bad" | "muted" | "info";
const STATUS_TONE: Record<string, Tone> = {
  "Uygun": "ok", "Başarılı": "ok", "Tamamlandı": "ok", "Onaylandı": "ok", "Yayında": "ok", "Kullanımda": "ok", "Gerçekleştirildi": "ok",
  "Devam Ediyor": "warn", "Şartlı Kullanım": "warn", "Test Ediliyor": "warn", "Değerlendiriliyor": "warn", "Doğrulanıyor": "warn", "Numune Bekleniyor": "warn", "Çalışılıyor": "warn", "Sonuç Bekleniyor": "warn", "Başvuruldu": "warn",
  "Uygun Değil": "bad", "Başarısız": "bad", "Kullanım Dışı": "bad", "Geçersiz": "bad",
  "İptal": "muted", "Arşiv": "muted", "Taslak": "muted",
};
const TONE_ICON = { ok: CheckCircle2, warn: Clock, bad: XCircle, muted: MinusCircle, info: Circle } as const;
// Durum rengi tek başına bilgi taşımaz: simge ve metin de gösterilir.
function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] || "info";
  const Icon = status === "Şartlı Kullanım" ? AlertTriangle : TONE_ICON[tone];
  return <span className={`${s.pill} ${s[tone]}`}><Icon size={12} aria-hidden="true" />{status}</span>;
}
const addDays = (isoDate: string, days: number) => { const d = new Date(`${isoDate}T12:00:00`); d.setDate(d.getDate() + days); return d.toLocaleDateString("sv-SE"); };
const pageNumbers = (page: number, total: number) => {
  const nums: (number | "...")[] = [];
  if (total <= 7) { for (let i = 1; i <= total; i++) nums.push(i); return nums; }
  nums.push(1);
  if (page > 3) nums.push("...");
  for (let i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) nums.push(i);
  if (page < total - 2) nums.push("...");
  nums.push(total);
  return nums;
};
const PAGE_SIZES = [10, 25, 50, 100];
export default function WorkspaceClient({ module, recordId, deviceId, embedded = false, intro }: { module: string; recordId?: string; deviceId?: string; embedded?: boolean; intro?: ReactNode }) {
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
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
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
  // Cihaz başına en son "Uygun" kalibrasyon kaydı (sicil kartı ve liste aynı kuralı kullanır).
  const latestCalibration = useMemo(() => {
    const map = new Map<string, WorkspaceRecord>();
    for (const r of children) {
      if (r.module !== "kalibrasyon-kontrol" || r.data.kind !== "Kalibrasyon" || r.status !== "Uygun") continue;
      const current = map.get(r.data.deviceId);
      if (!current || (r.data.performedAt || "") > (current.data.performedAt || "")) map.set(r.data.deviceId, r);
    }
    return map;
  }, [children]);
  // none: kaydı yok · overdue: tarihi geçti · soon: 30 gün içinde · ok · na: kalibrasyon gerekmiyor/arşiv
  function calibrationState(row: WorkspaceRecord): "none" | "overdue" | "soon" | "ok" | "na" {
    if (row.data.calibrationRequired === "Gerekli değil" || ["Arşiv", "Kullanım Dışı"].includes(row.status)) return "na";
    const next = latestCalibration.get(row.id)?.data.nextDate;
    if (!next) return "none";
    const now = today();
    return next < now ? "overdue" : next <= addDays(now, 30) ? "soon" : "ok";
  }
  function valueFor(row: WorkspaceRecord, key: string) {
    if (module === "cihaz-listesi" && ["calibrationDate", "nextCalibrationDate"].includes(key)) {
      return dateText(latestCalibration.get(row.id)?.data[key === "calibrationDate" ? "performedAt" : "nextDate"]);
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
  const sortValue = (row: WorkspaceRecord, key: string) => {
    if (key === "status") return row.status;
    if (module === "cihaz-listesi" && ["calibrationDate", "nextCalibrationDate"].includes(key)) return latestCalibration.get(row.id)?.data[key === "calibrationDate" ? "performedAt" : "nextDate"] || "";
    const field = config.fields.find(f => f.key === key);
    return field?.type === "date" || field?.type === "number" && !field.relation ? row.data[key] || "" : label(key, row.data[key]);
  };
  const sorted = useMemo(() => {
    if (!sort) return visible;
    const numeric = config.fields.find(f => f.key === sort.key)?.type === "number";
    return [...visible].sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
      if (!x && y) return 1;
      if (x && !y) return -1;
      return (numeric ? Number(x) - Number(y) : x.localeCompare(y, "tr-TR", { numeric: true })) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sort, relations, latestCalibration]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const deviceMetrics = useMemo(() => {
    if (module !== "cihaz-listesi") return null;
    const states = visible.map(calibrationState);
    return { overdue: states.filter(v => v === "overdue").length, soon: states.filter(v => v === "soon").length, none: states.filter(v => v === "none").length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, latestCalibration]);
  const toggleSort = (key: string) => { setSort(cur => !cur || cur.key !== key ? { key, dir: 1 } : cur.dir === 1 ? { key, dir: -1 } : null); setPage(1); };
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
    {intro}
    {error && <div className={s.error} role="alert">{error}</div>}
    {success && <div className={s.notice} role="status">{success}</div>}
    <div className={s.toolbar}><div className={s.controls}>{recordId ? <Link className={s.button} href={BASE + module}>Listeye dön</Link> : <><div className={table.searchBox}><Search size={15} aria-hidden="true" /><input className={table.searchInput} aria-label="Kayıtlarda ara" placeholder="Kod, ad veya sorumlu ara…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div><select className={s.input} aria-label="Durum filtresi" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}><option value="">Tüm durumlar</option>{config.status.map(v => <option key={v}>{v}</option>)}</select><select className={table.pageSizeSelect} aria-label="Sayfa boyutu" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{PAGE_SIZES.map(n => <option key={n} value={n}>{n} / sayfa</option>)}</select>{parentId &&<Link className={s.button} href={BASE + module}>İlişki filtresini kaldır</Link>}</>}</div><div className={s.controls}><button className={s.button} disabled={loading} onClick={() => void load()}><RotateCw size={15} />Yenile</button><button className={s.button} onClick={() => window.print()}><Printer size={15} />Yazdır</button>{!recordId && <button className={s.button} onClick={exportCsv} disabled={loading}><Download size={15} />CSV indir</button>}{canEdit && <button className={`${s.button} ${s.primary}`} disabled={loading || Boolean(recordId && !record)} onClick={() => openForm(record || "new")}><Plus size={15} />{recordId ? "Düzenle" : "Yeni kayıt"}</button>}</div></div>
    {!recordId && <><div className={s.metrics}><div className={s.metric}><strong>{visible.length}</strong><span>Kayıt</span></div>{deviceMetrics ? <><div className={s.metric}><strong className={deviceMetrics.overdue ? s.overdue : ""}>{deviceMetrics.overdue}</strong><span>Kalibrasyonu geçen</span></div><div className={s.metric}><strong className={deviceMetrics.soon ? s.soon : ""}>{deviceMetrics.soon}</strong><span>30 gün içinde</span></div><div className={s.metric}><strong>{deviceMetrics.none}</strong><span>Kalibrasyon kaydı yok</span></div></> : <div className={s.metric}><strong className={visible.filter(overdue).length ? s.overdue : ""}>{visible.filter(overdue).length}</strong><span>Termini geçen</span></div>}</div><div className={table.tableCard}><div className={table.tableWrapper}><table className={table.table}><thead><tr>{[...config.columns.map(k => [k, columnTitle(k)] as const), ["status", "Durum"] as const].map(([k, title]) => <th key={k} aria-sort={sort?.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}><button type="button" className={s.sortBtn} onClick={() => toggleSort(k)}>{title}{sort?.key === k && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}</button></th>)}<th>Güncelleyen</th><th>İşlem</th></tr></thead><tbody>{loading ? <tr><td colSpan={config.columns.length + 3}><div className={s.empty} role="status">Kayıtlar yükleniyor…</div></td></tr> : visible.length === 0 ? <tr><td colSpan={config.columns.length + 3}><div className={s.empty}><ClipboardList size={28} /><strong>Kayıt bulunamadı</strong><span>Yeni kayıt ekleyin veya filtrelerinizi değiştirin.</span></div></td></tr> : sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(row => <tr key={row.id}>{config.columns.map((key, index) => { const text = label(key, valueFor(row, key)); const calState = module === "cihaz-listesi" && key === "nextCalibrationDate" ? calibrationState(row) : "na"; return <td key={key} style={{ maxWidth: 260, whiteSpace: "normal" }}>{index === 0 ? <Link href={`${BASE}${module}/${row.id}`} className={table.codeLink}>{text}</Link> : key === "revision" ? <span className={s.ellipsis} title={text}>{text}</span> : <span className={(key === "dueDate" && overdue(row)) || calState === "overdue" ? s.overdue : calState === "soon" ? s.soon : ""}>{text}{calState === "overdue" && <small className={s.flag}> · Geçti</small>}{calState === "soon" && <small className={s.flag}> · Yaklaşıyor</small>}{calState === "none" && <small className={s.flag}> · Kayıt yok</small>}</span>}</td>; })}<td><StatusPill status={row.status} /></td><td>{row.updatedBy}<div className={s.muted}>{dateText(row.updatedAt)}</div></td><td><Link className={s.button} href={`${BASE}${module}/${row.id}`}>{module === "cihaz-listesi" ? "Sicil kartı" : "Detay"}</Link></td></tr>)}</tbody></table></div><div className={table.pagination}><button className={table.pageBtn} aria-label="Önceki sayfa" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</button>{pageNumbers(currentPage, totalPages).map((num, i) => num === "..." ? <span key={`dots-${i}`} className={table.pageDots}>...</span> : <button key={num} aria-current={num === currentPage ? "page" : undefined} className={`${table.pageBtn} ${num === currentPage ? table.pageBtnActive : ""}`} onClick={() => setPage(num)}>{num}</button>)}<button className={table.pageBtn} aria-label="Sonraki sayfa" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>›</button><span className={table.pageInfo}>Sayfa {currentPage} / {totalPages}</span></div></div></>}
    {record && <>
      <section className={s.card}><div className={s.toolbar}><h2 className={s.title}>{module === "cihaz-listesi" ? "Cihaz sicil kartı" : "Kayıt bilgileri"}</h2><StatusPill status={record.status} /></div><dl className={s.detail}>{config.fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{label(field.key, record.data[field.key])}</dd></div>)}{module === "kalibrasyon-belirsizlikleri" && <div><dt>Standart belirsizlik (u = U/k)</dt><dd>{standardUncertainty(record)?.toLocaleString("tr-TR", { maximumSignificantDigits: 8 })} {record.data.unit}</dd></div>}<div><dt>Oluşturan</dt><dd>{record.createdBy} · {dateText(record.createdAt)}</dd></div><div><dt>Son güncelleyen</dt><dd>{record.updatedBy} · {dateText(record.updatedAt)}</dd></div></dl></section>
      {module === "cihaz-listesi" && <section className={`${s.card} ${s.section}`}><div className={s.toolbar}><h2 className={s.title}>QR kodlu cihaz etiketi</h2><Link className={s.button} href={`/cihaz-etiketi/${record.id}`} target="_blank">Yalnızca etiketi yazdır</Link></div><div className={s.label}>{qr && <Image src={qr} width={80} height={80} unoptimized alt={`${record.data.code} cihaz sicil kartına erişim QR kodu`} />}<div><strong>{record.data.code}</strong><div>{record.data.name}</div><small>{record.data.brand} {record.data.model} · SN: {record.data.serial || "—"}</small><small>{record.data.unit} · {record.status}</small><small>Son kalibrasyon: {dateText(children.filter(r => r.module === "kalibrasyon-kontrol" && r.data.kind === "Kalibrasyon" && r.status === "Uygun").sort((a,b) => (b.data.performedAt || "").localeCompare(a.data.performedAt || ""))[0]?.data.performedAt)}</small><small>Sonraki: {dateText(children.filter(r => r.module === "kalibrasyon-kontrol" && r.data.kind === "Kalibrasyon" && r.status === "Uygun").sort((a,b) => (b.data.performedAt || "").localeCompare(a.data.performedAt || ""))[0]?.data.nextDate)}</small></div></div><p className={s.muted}>QR kodu bu cihazın oturum korumalı sicil kartını açar. Yazdırırken etiket bölümünü seçebilirsiniz.</p></section>}
      {["cihaz-listesi", "toplantilar"].includes(module) && <section className={`${s.card} ${s.section}`}><h2 className={s.title}>İlişkili kayıtlar</h2><div className={s.links}>{(module === "cihaz-listesi" ? ["kalibrasyon-kontrol", "cihaz-islemleri", "kalibrasyon-belirsizlikleri"] : module === "toplantilar" ? ["toplanti-kararlari"] : ["yazilim-testleri"]).map(key => <Link className={s.button} key={key} href={`${BASE}${key}?${module === "cihaz-listesi" ? "deviceId" : module === "toplantilar" ? "meetingId" : "validationId"}=${record.id}`}>{WORKSPACES[key].title}</Link>)}</div>{children.length ? children.map(child => <div key={child.id}><Link href={`${BASE}${child.module}/${child.id}`}>{WORKSPACES[child.module].title} · {recordLabel(child)}</Link> <StatusPill status={child.status} /><span className={s.muted}>{dateText(child.data.performedAt || child.data.dueDate)} · {child.updatedBy}</span></div>) : <p className={s.muted}>Henüz ilişkili kayıt yok.</p>}</section>}
      {module === "cihaz-listesi" && <section className={s.card}><WorkspaceClient module="kalibrasyon-belirsizlikleri" deviceId={record.id} embedded /></section>}
      <section className={s.card}><h2 className={s.title}>Değişiklik geçmişi</h2><ol className={s.history}>{history.map(entry => <li key={entry.id}><details><summary>{entry.action} · {entry.actor} · {dateText(entry.at)} · Sürüm {entry.after.version}</summary><ul>{config.fields.filter(f => entry.before?.data[f.key] !== entry.after.data[f.key]).map(f => <li key={f.key}><strong>{f.label}:</strong> {entry.before?.data[f.key] || "—"} → {entry.after.data[f.key] || "—"}</li>)}{entry.before?.status !== entry.after.status && <li><strong>Durum:</strong> {entry.before?.status || "—"} → {entry.after.status}</li>}</ul></details></li>)}</ol></section>
    </>}
    {recordId && !record && !loading && !error && <div className={s.empty}>Kayıt bulunamadı.</div>}
    {editing && <dialog ref={dialogRef} className={s.dialog} onCancel={e => { if (saving) e.preventDefault(); else setEditing(null); }} aria-labelledby="workspace-dialog-title"><div className={s.dialogHeader}><h2 className={s.title} id="workspace-dialog-title">{editing === "new" ? "Yeni kayıt" : "Kaydı düzenle"} · {config.title}</h2><button type="button" className={s.button} disabled={saving} aria-label="Kapat" onClick={() => setEditing(null)}><X size={16} /></button></div><form onSubmit={save} style={{ display: "contents" }}><div className={s.form}>{formError && <div className={`${s.error} ${s.wide}`} role="alert">{formError}</div>}{config.fields.map(field => <label className={`${s.field} ${field.type === "textarea" ? s.wide : ""}`} key={field.key}>{field.label}{field.required ? " *" : ""}{field.relation ? <select className={s.input} required={field.required} value={form[field.key] || ""} onChange={e => setForm(v => ({ ...v, [field.key]: e.target.value }))}><option value="">Seçiniz</option>{(relations[field.relation] || []).filter(r => field.key !== "calibrationId" || !form.deviceId || r.data.deviceId === form.deviceId).map(r => <option key={r.id} value={r.id}>{recordLabel(r)}</option>)}</select> : field.options ? <select className={s.input} required={field.required} value={form[field.key] || ""} onChange={e => setForm(v => ({ ...v, [field.key]: e.target.value }))}><option value="">Seçiniz</option>{field.options.map(o => <option key={o}>{o}</option>)}</select> : field.type === "textarea" ? <textarea className={s.input} required={field.required} value={form[field.key] || ""} onChange={e => setForm(v => ({ ...v, [field.key]: e.target.value }))} /> : <input className={s.input} type={field.type || "text"} step={field.type === "number" ? "any" : undefined} required={field.required} value={form[field.key] || ""} onChange={e => setForm(v => ({ ...v, [field.key]: e.target.value }))} />}{field.hint && <small>{field.hint}</small>}</label>)}<label className={s.field}>Durum<select className={s.input} value={status} onChange={e => setStatus(e.target.value)}>{config.status.map(v => <option key={v} disabled={["Onaylandı", "Yayında"].includes(v) && !canApprove}>{v}</option>)}</select></label></div><div className={s.footer}><button type="button" className={s.button} disabled={saving} onClick={() => setEditing(null)}>Vazgeç</button><button className={`${s.button} ${s.primary}`} disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button></div></form></dialog>}
  </div>;
}
