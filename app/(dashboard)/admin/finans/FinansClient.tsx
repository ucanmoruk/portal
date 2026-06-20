"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./finans.module.css";

type Company = {
  id: number;
  name: string;
  status: string;
};

type Entry = {
  id: number;
  companyId: number | null;
  companyName: string;
  kind: string;
  title: string;
  amount: number;
  paidAmount: number | null;
  currency: string;
  dueDate: string;
  installmentNo: number | null;
  installmentTotal: number | null;
  recurrence: string;
  autoPayment: boolean;
  reminderDate: string | null;
  reminderTime: string | null;
  status: string;
  paidDate: string | null;
  notes: string;
};

type Payment = {
  id: number;
  entryId: number;
  amount: number;
  paidDate: string;
  note: string;
  createdAt: string | null;
};

type EntryForm = Omit<Entry, "id">;
type DisplayEntry = Entry & {
  occurrenceKey: string;
  sourceId: number;
  occurrenceNo: number | null;
  isVirtual: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);
const futureMonthOffsets = [0, 1, 2, 3, 5];

const emptyForm = (): EntryForm => ({
  companyId: null,
  companyName: "",
  kind: "borc",
  title: "",
  amount: 0,
  paidAmount: null,
  currency: "TRY",
  dueDate: today(),
  installmentNo: null,
  installmentTotal: null,
  recurrence: "none",
  autoPayment: false,
  reminderDate: null,
  reminderTime: "",
  status: "bekliyor",
  paidDate: null,
  notes: "",
});

const kindLabels: Record<string, string> = {
  kredi: "Kredi",
  borc: "Borç",
  taksit: "Taksit",
  gider: "Gider",
  gelir: "Gelir",
  kira: "Kira",
  fatura: "Fatura",
  personel: "Personel",
  abonelik: "Abonelik",
};

const kindColors: Record<string, string> = {
  kredi: "#2563eb",
  borc: "#7c3aed",
  taksit: "#0891b2",
  gider: "#ea580c",
  gelir: "#16a34a",
  kira: "#db2777",
  fatura: "#ca8a04",
  personel: "#0f766e",
  abonelik: "#4f46e5",
};

const statusLabels: Record<string, string> = {
  bekliyor: "Ödeme Bekliyor",
  yaklasiyor: "Yaklaşıyor",
  gecikti: "Gecikti",
  kismi: "Kismi Odendi",
  odendi: "Ödendi",
};

const recurrenceLabels: Record<string, string> = {
  none: "Tek seferlik",
  monthly: "Aylık",
  quarterly: "3 aylık",
  yearly: "Yıllık",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${new Intl.NumberFormat("tr-TR").format(value || 0)} ${currency}`;
  }
}

function daysUntil(date: string) {
  const target = new Date(`${date}T00:00:00`);
  const now = new Date(`${today()}T00:00:00`);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function dateStatus(entry: Pick<Entry, "dueDate" | "status">) {
  if (entry.status === "odendi") return "odendi";
  if (entry.status === "kismi") return "kismi";
  const days = daysUntil(entry.dueDate);
  if (days < 0) return "gecikti";
  if (days <= 7) return "yaklasiyor";
  return "bekliyor";
}

function monthStart(offset = 0) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(offset: number) {
  const date = monthStart(offset);
  const name = date.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  if (offset === 0) return `Bu ay (${name})`;
  if (offset === 1) return `Önümüzdeki ay (${name})`;
  return `${offset} ay sonra (${name})`;
}

function entryMonthKey(entry: Entry) {
  return entry.dueDate.slice(0, 7);
}

function companyAccent(id: string | number) {
  const palette = [
    "#0f766e",
    "#2563eb",
    "#7c3aed",
    "#db2777",
    "#ea580c",
    "#16a34a",
    "#0891b2",
  ];
  const text = String(id);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash + text.charCodeAt(i) * (i + 1)) % palette.length;
  return palette[hash];
}

function addMonths(dateText: string, monthOffset: number) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setMonth(date.getMonth() + monthOffset);
  return date.toISOString().slice(0, 10);
}

function installmentSignature(entry: Entry) {
  return [
    entry.companyId || entry.companyName || "no-company",
    entry.kind,
    entry.title.trim().toLocaleLowerCase("tr-TR"),
    entry.installmentTotal || 0,
  ].join("|");
}

function expandInstallments(entries: Entry[]): DisplayEntry[] {
  const concreteByInstallment = new Map<string, Entry>();
  const baseBySeries = new Map<string, Entry>();

  for (const entry of entries) {
    const total = Number(entry.installmentTotal || 0);
    const no = Number(entry.installmentNo || 1);
    if (total > 1) {
      const signature = installmentSignature(entry);
      concreteByInstallment.set(`${signature}|${no}`, entry);
      const currentBase = baseBySeries.get(signature);
      const currentNo = Number(currentBase?.installmentNo || 1);
      if (!currentBase || no < currentNo || (no === currentNo && entry.dueDate < currentBase.dueDate)) {
        baseBySeries.set(signature, entry);
      }
    }
  }

  const expanded: DisplayEntry[] = [];
  const handledSeries = new Set<string>();

  for (const entry of entries) {
    const total = Number(entry.installmentTotal || 0);
    if (total <= 1) {
      expanded.push({
        ...entry,
        occurrenceKey: `entry-${entry.id}`,
        sourceId: entry.id,
        occurrenceNo: null,
        isVirtual: false,
      });
      continue;
    }

    const signature = installmentSignature(entry);
    if (handledSeries.has(signature)) continue;
    handledSeries.add(signature);

    const base = baseBySeries.get(signature) || entry;
    const baseNo = Number(base.installmentNo || 1);
    for (let no = 1; no <= total; no++) {
      const concrete = concreteByInstallment.get(`${signature}|${no}`);
      const item = concrete || base;
      expanded.push({
        ...item,
        id: concrete?.id || base.id,
        dueDate: concrete?.dueDate || addMonths(base.dueDate, no - baseNo),
        installmentNo: no,
        installmentTotal: total,
        status: concrete?.status || "bekliyor",
        paidDate: concrete?.paidDate || null,
        occurrenceKey: `${signature}|${no}`,
        sourceId: base.id,
        occurrenceNo: no,
        isVirtual: !concrete,
      });
    }
  }

  return expanded.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, "tr"));
}

export default function FinansClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [form, setForm] = useState<EntryForm>(() => emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("open");
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<string>("all");
  const [selectedKind, setSelectedKind] = useState<string>("all");
  const [inlineAmounts, setInlineAmounts] = useState<Record<string, string>>({});
  const [inlinePaidDates, setInlinePaidDates] = useState<Record<string, string>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finans", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Veri alınamadı.");
      setCompanies(data.companies || []);
      setEntries(data.entries || []);
      setPayments(data.payments || []);
    } catch (err: unknown) {
      setError(errorMessage(err, "Veri alınamadı."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const displayEntries = useMemo(() => expandInstallments(entries), [entries]);

  const paymentsByEntryId = useMemo(() => {
    const buckets = new Map<number, Payment[]>();
    for (const payment of payments) {
      const list = buckets.get(payment.entryId) || [];
      list.push(payment);
      buckets.set(payment.entryId, list);
    }
    return buckets;
  }, [payments]);

  const paymentsForEntry = useCallback((entry: DisplayEntry) => {
    if (entry.isVirtual) return [];
    return paymentsByEntryId.get(entry.id) || [];
  }, [paymentsByEntryId]);

  const paidTotalForEntry = useCallback((entry: DisplayEntry) => {
    const rowPayments = paymentsForEntry(entry);
    const ledgerTotal = rowPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    if (ledgerTotal > 0) return ledgerTotal;
    if (entry.isVirtual) return 0;
    return Number(entry.paidAmount || 0);
  }, [paymentsForEntry]);

  const remainingForEntry = useCallback(
    (entry: DisplayEntry) => Math.max(Number(entry.amount || 0) - paidTotalForEntry(entry), 0),
    [paidTotalForEntry],
  );

  const statusForEntry = useCallback((entry: DisplayEntry) => {
    const paid = paidTotalForEntry(entry);
    if (paid >= Number(entry.amount || 0) && paid > 0) return "odendi";
    if (paid > 0 || entry.status === "kismi") return "kismi";
    return dateStatus(entry);
  }, [paidTotalForEntry]);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return displayEntries.filter((entry) => {
      const status = statusForEntry(entry);
      if (selectedCompany === "none" && entry.companyId) return false;
      if (selectedCompany !== "all" && selectedCompany !== "none" && String(entry.companyId) !== selectedCompany) return false;
      if (selectedStatus === "open" && status === "odendi") return false;
      if (selectedStatus !== "all" && selectedStatus !== "open" && status !== selectedStatus) return false;
      if (selectedMonthOffset !== "all" && entryMonthKey(entry) !== monthKey(monthStart(Number(selectedMonthOffset)))) return false;
      if (selectedKind !== "all" && entry.kind !== selectedKind) return false;
      if (!q) return true;
      return [entry.title, entry.companyName, entry.notes, kindLabels[entry.kind]]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q);
    });
  }, [displayEntries, query, selectedCompany, selectedKind, selectedMonthOffset, selectedStatus, statusForEntry]);

  const companyBuckets = useMemo(() => {
    const buckets = companies.map((company) => {
      const items = displayEntries.filter(
        (entry) => entry.companyId === company.id && statusForEntry(entry) !== "odendi",
      );
      return {
        id: String(company.id),
        name: company.name,
        count: items.length,
        total: items.reduce((sum, entry) => sum + remainingForEntry(entry), 0),
      };
    });
    const noCompanyItems = displayEntries.filter(
      (entry) => !entry.companyId && statusForEntry(entry) !== "odendi",
    );
    if (noCompanyItems.length) {
      buckets.push({
        id: "none",
        name: "Firmasız",
        count: noCompanyItems.length,
        total: noCompanyItems.reduce((sum, entry) => sum + remainingForEntry(entry), 0),
      });
    }
    return buckets;
  }, [companies, displayEntries, remainingForEntry, statusForEntry]);

  const monthBuckets = useMemo(() => {
    return futureMonthOffsets.map((offset) => {
      const key = monthKey(monthStart(offset));
      const items = displayEntries.filter((entry) => {
        if (selectedCompany === "none" && entry.companyId) return false;
        if (selectedCompany !== "all" && selectedCompany !== "none" && String(entry.companyId) !== selectedCompany) return false;
        return statusForEntry(entry) !== "odendi" && entryMonthKey(entry) === key;
      });
      return {
        offset,
        key,
        label: monthLabel(offset),
        count: items.length,
        total: items.reduce((sum, entry) => sum + remainingForEntry(entry), 0),
      };
    });
  }, [displayEntries, remainingForEntry, selectedCompany, statusForEntry]);

  const openEntryCount = useMemo(
    () => displayEntries.filter((entry) => statusForEntry(entry) !== "odendi").length,
    [displayEntries, statusForEntry],
  );

  const openTotal = useMemo(
    () => displayEntries
      .filter((entry) => statusForEntry(entry) !== "odendi" && entry.kind !== "gelir")
      .reduce((sum, entry) => sum + remainingForEntry(entry), 0),
    [displayEntries, remainingForEntry, statusForEntry],
  );

  const updateForm = (patch: Partial<EntryForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const onCompanyChange = (value: string) => {
    const company = companies.find((item) => String(item.id) === value);
    updateForm({
      companyId: company ? company.id : null,
      companyName: company ? company.name : "",
    });
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const submitEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const method = editingId ? "PATCH" : "POST";
      const url = editingId ? `/api/admin/finans/${editingId}` : "/api/admin/finans";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kayıt kaydedilemedi.");
      setEntries((prev) => {
        if (editingId) return prev.map((entry) => (entry.id === editingId ? data.entry : entry));
        return [data.entry, ...prev];
      });
      resetForm();
    } catch (err: unknown) {
      setError(errorMessage(err, "Kayıt kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const submitCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = companyName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finans/firmalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Firma eklenemedi.");
      setCompanies((prev) => [...prev, data.company].sort((a, b) => a.name.localeCompare(b.name, "tr")));
      setCompanyName("");
      updateForm({ companyId: data.company.id, companyName: data.company.name });
    } catch (err: unknown) {
      setError(errorMessage(err, "Firma eklenemedi."));
    } finally {
      setSaving(false);
    }
  };

  const editEntry = (entry: Entry) => {
    setEditingId(entry.id);
    setForm({
      companyId: entry.companyId,
      companyName: entry.companyName,
      kind: entry.kind,
      title: entry.title,
      amount: entry.amount,
      paidAmount: entry.paidAmount,
      currency: entry.currency,
      dueDate: entry.dueDate,
      installmentNo: entry.installmentNo,
      installmentTotal: entry.installmentTotal,
      recurrence: entry.recurrence,
      autoPayment: entry.autoPayment,
      reminderDate: entry.reminderDate,
      reminderTime: entry.reminderTime || "",
      status: entry.status,
      paidDate: entry.paidDate,
      notes: entry.notes,
    });
  };

  const createConcreteEntry = async (entry: DisplayEntry) => {
    const res = await fetch("/api/admin/finans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: entry.companyId,
        companyName: entry.companyName,
        kind: entry.kind,
        title: entry.title,
        amount: entry.amount,
        paidAmount: null,
        currency: entry.currency,
        dueDate: entry.dueDate,
        installmentNo: entry.installmentNo,
        installmentTotal: entry.installmentTotal,
        recurrence: entry.recurrence,
        autoPayment: entry.autoPayment,
        reminderDate: entry.reminderDate,
        reminderTime: entry.reminderTime,
        status: "bekliyor",
        paidDate: null,
        notes: entry.notes,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Kayit olusturulamadi.");
    setEntries((prev) => [...prev, data.entry]);
    return data.entry as Entry;
  };

  const addPayment = async (entry: DisplayEntry, amountOverride?: number) => {
    const remaining = remainingForEntry(entry);
    const nextAmount = Number.isFinite(amountOverride) && amountOverride && amountOverride > 0
      ? amountOverride
      : remaining || entry.amount;
    const nextPaidDate = inlinePaidDates[entry.occurrenceKey] || today();
    setSaving(true);
    try {
      const concrete = entry.isVirtual ? await createConcreteEntry(entry) : entry;
      const res = await fetch(`/api/admin/finans/${concrete.id}/odemeler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: nextAmount,
          paidDate: nextPaidDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Odeme eklenemedi.");
      setEntries((prev) => {
        const exists = prev.some((item) => item.id === data.entry.id);
        if (!exists) return [...prev, data.entry];
        return prev.map((item) => (item.id === data.entry.id ? data.entry : item));
      });
      setPayments((prev) => [...prev, data.payment]);
      setInlineAmounts((prev) => {
        const nextAmounts = { ...prev };
        delete nextAmounts[entry.occurrenceKey];
        return nextAmounts;
      });
      setInlinePaidDates((prev) => {
        const nextDates = { ...prev };
        delete nextDates[entry.occurrenceKey];
        return nextDates;
      });
    } catch (err: unknown) {
      setError(errorMessage(err, "Odeme eklenemedi."));
    } finally {
      setSaving(false);
    }
  };

  const quickPayEntry = (entry: DisplayEntry) => {
    const raw = inlineAmounts[entry.occurrenceKey]?.trim();
    const amount = raw ? Number(raw.replace(",", ".")) : remainingForEntry(entry);
    addPayment(entry, amount);
  };

  const deleteEntry = async (entry: Entry) => {
    if (!confirm(`${entry.title} kaydı silinsin mi?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/finans/${entry.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kayıt silinemedi.");
      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
      setPayments((prev) => prev.filter((payment) => payment.entryId !== entry.id));
    } catch (err: unknown) {
      setError(errorMessage(err, "Kayıt silinemedi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Admin</span>
          <h1>Finans</h1>
          <p>Kredi, borç, taksit ve firma bazlı ödeme akışını tek ekrandan takip edin.</p>
        </div>
        <button className={styles.secondaryButton} onClick={load} disabled={loading || saving}>
          Yenile
        </button>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.companyStrip}>
        <button
          className={`${styles.companyChip} ${selectedCompany === "all" ? styles.companyChipActive : ""}`}
          onClick={() => setSelectedCompany("all")}
          style={{ "--company-color": "#0071e3" } as React.CSSProperties}
          type="button"
        >
          <span>Tüm firmalar</span>
          <strong>{money(openEntryCount ? openTotal : 0, "TRY")}</strong>
          <em>{openEntryCount} açık ödeme</em>
        </button>
        {companyBuckets.map((bucket) => (
          <button
            className={`${styles.companyChip} ${selectedCompany === bucket.id ? styles.companyChipActive : ""}`}
            key={bucket.id}
            onClick={() => setSelectedCompany(bucket.id)}
            style={{ "--company-color": companyAccent(bucket.id) } as React.CSSProperties}
            type="button"
          >
            <span>{bucket.name}</span>
            <strong>{money(bucket.total, "TRY")}</strong>
            <em>{bucket.count} açık ödeme</em>
          </button>
        ))}
      </section>

      <section className={styles.monthStrip}>
        <button
          className={`${styles.monthChip} ${selectedMonthOffset === "all" ? styles.monthChipActive : ""}`}
          onClick={() => setSelectedMonthOffset("all")}
          type="button"
        >
          <span>Tüm aylar</span>
          <strong>{openEntryCount} açık kayıt</strong>
        </button>
        {monthBuckets.map((bucket) => (
          <button
            className={`${styles.monthChip} ${selectedMonthOffset === String(bucket.offset) ? styles.monthChipActive : ""}`}
            key={bucket.key}
            onClick={() => setSelectedMonthOffset(String(bucket.offset))}
            type="button"
          >
            <span>{bucket.label}</span>
            <strong>{money(bucket.total, "TRY")}</strong>
            <em>{bucket.count} açık ödeme</em>
          </button>
        ))}
      </section>

      <div className={styles.workspace}>
        <main className={styles.listPanel}>
          <div className={styles.toolbar}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Başlık, firma veya not ara"
              className={styles.search}
            />
            <select value={selectedCompany} onChange={(event) => setSelectedCompany(event.target.value)}>
              <option value="all">Tüm firmalar</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
              <option value="none">Firmasız</option>
            </select>
            <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
              <option value="open">Açıklar</option>
              <option value="all">Tümü</option>
              <option value="yaklasiyor">Yaklaşıyor</option>
              <option value="gecikti">Gecikti</option>
              <option value="kismi">Kismi Odendi</option>
              <option value="odendi">Ödendi</option>
            </select>
            <select value={selectedKind} onChange={(event) => setSelectedKind(event.target.value)}>
              <option value="all">Tum kayit tipleri</option>
              {Object.entries(kindLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.empty}>Finans kayıtları yükleniyor...</div>
            ) : filteredEntries.length === 0 ? (
              <div className={styles.empty}>Bu filtrelere uygun kayıt yok.</div>
            ) : (
              <div className={styles.paymentList}>
                {filteredEntries.map((entry) => {
                  const status = statusForEntry(entry);
                  const paidTotal = paidTotalForEntry(entry);
                  const remaining = remainingForEntry(entry);
                  const rowPayments = paymentsForEntry(entry);
                  const paidPercent = entry.amount > 0 ? Math.min(100, Math.round((paidTotal / entry.amount) * 100)) : 0;
                  const legacyPayment = !entry.isVirtual && rowPayments.length === 0 && paidTotal > 0
                    ? [{ id: 0, entryId: entry.id, amount: paidTotal, paidDate: entry.paidDate || entry.dueDate, note: "Eski odeme kaydi", createdAt: null }]
                    : [];
                  const paymentHistory = [...rowPayments, ...legacyPayment];
                  const expanded = Boolean(expandedRows[entry.occurrenceKey]);
                  return (
                    <article className={styles.paymentItem} key={entry.occurrenceKey}>
                      <div className={styles.paymentRow}>
                        <div className={styles.paymentMain}>
                          <div className={styles.paymentTitleLine}>
                            <strong>{entry.title}</strong>
                            <span className={`${styles.status} ${styles[`status_${status}`]}`}>
                              {statusLabels[status]}
                            </span>
                          </div>
                          <div className={styles.paymentMeta}>
                            <span>{entry.companyName || "Firmasiz"}</span>
                            <span
                              className={styles.kindPill}
                              style={{ "--kind-color": kindColors[entry.kind] || "#64748b" } as React.CSSProperties}
                            >
                              {kindLabels[entry.kind] || entry.kind}
                            </span>
                            <span>Vade: {new Date(`${entry.dueDate}T00:00:00`).toLocaleDateString("tr-TR")}</span>
                            {entry.installmentTotal ? <span>{entry.installmentNo || 1}/{entry.installmentTotal} taksit</span> : null}
                            {entry.autoPayment ? <span>Otomatik</span> : null}
                          </div>
                        </div>

                        <div
                          className={styles.paymentBalance}
                          style={{ "--paid-percent": `${paidPercent}%` } as React.CSSProperties}
                        >
                          <div className={styles.balanceTop}>
                            <span>Kalan</span>
                            <strong>{money(remaining, entry.currency)}</strong>
                          </div>
                          <div className={styles.balanceSub}>
                            <span>Planlanan {money(entry.amount, entry.currency)}</span>
                            <span>Odenen {money(paidTotal, entry.currency)}</span>
                          </div>
                          <div className={styles.progressTrack}>
                            <span />
                          </div>
                        </div>

                        <div className={styles.actions}>
                          <button
                            className={status === "odendi" ? styles.ghostAction : styles.primaryAction}
                            onClick={() => setExpandedRows((prev) => ({ ...prev, [entry.occurrenceKey]: !expanded }))}
                            disabled={saving}
                            type="button"
                          >
                            {expanded ? "Kapat" : status === "odendi" ? "Hareketler" : "Odeme"}
                          </button>
                          {!entry.isVirtual && (
                            <>
                              <button className={styles.ghostAction} onClick={() => editEntry(entry)} disabled={saving}>Duzenle</button>
                              <button className={styles.ghostAction} onClick={() => deleteEntry(entry)} disabled={saving}>Sil</button>
                            </>
                          )}
                        </div>
                      </div>
                      {expanded && (
                        <div className={styles.paymentDetail}>
                          <div className={styles.paymentPayCard}>
                            <div>
                              <strong>Odeme ekle</strong>
                              <span>Kismi odeme girersen kalan tutar otomatik guncellenir.</span>
                            </div>
                            {status !== "odendi" ? (
                              <div className={styles.payInline}>
                                <input
                                  className={styles.inlineAmount}
                                  inputMode="decimal"
                                  placeholder={`Kalan: ${money(remaining, entry.currency)}`}
                                  value={inlineAmounts[entry.occurrenceKey] ?? ""}
                                  onChange={(event) => setInlineAmounts((prev) => ({ ...prev, [entry.occurrenceKey]: event.target.value }))}
                                />
                                <input
                                  className={styles.inlineDate}
                                  type="date"
                                  value={inlinePaidDates[entry.occurrenceKey] ?? today()}
                                  onChange={(event) => setInlinePaidDates((prev) => ({ ...prev, [entry.occurrenceKey]: event.target.value }))}
                                  title="Odeme tarihi"
                                />
                                <button onClick={() => quickPayEntry(entry)} disabled={saving} type="button">Ekle</button>
                              </div>
                            ) : (
                              <span className={styles.paidDoneText}>Bu kaydin plani tamamlandi.</span>
                            )}
                          </div>
                          <div className={styles.paymentHistory}>
                            <div className={styles.historyTitle}>
                              <strong>Odeme hareketleri</strong>
                              <span>{paymentHistory.length} hareket</span>
                            </div>
                            {paymentHistory.length === 0 ? (
                              <span>Henuz hareket yok.</span>
                            ) : paymentHistory.map((payment) => (
                              <div className={styles.paymentMovement} key={payment.id || `legacy-${entry.occurrenceKey}`}>
                                <span>{new Date(`${payment.paidDate}T00:00:00`).toLocaleDateString("tr-TR")}</span>
                                <strong>{money(payment.amount, entry.currency)}</strong>
                                {payment.note && <em>{payment.note}</em>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        <aside className={styles.sidePanel}>
          <form className={styles.companyForm} onSubmit={submitCompany}>
            <label>Firma ekle</label>
            <div className={styles.inlineForm}>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Örn. Root Kozmetik"
              />
              <button type="submit" disabled={saving}>Ekle</button>
            </div>
          </form>

          <form className={styles.form} onSubmit={submitEntry}>
            <div className={styles.formTitle}>
              <h2>{editingId ? "Kaydı düzenle" : "Yeni kayıt"}</h2>
              {editingId && <button type="button" onClick={resetForm}>Vazgeç</button>}
            </div>

            <label>
              Firma
              <select value={form.companyId || ""} onChange={(event) => onCompanyChange(event.target.value)}>
                <option value="">Firma seçin</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>

            <label>
              Kayıt tipi
              <select value={form.kind} onChange={(event) => updateForm({ kind: event.target.value })}>
                <option value="borc">Borç</option>
                <option value="kredi">Kredi</option>
                <option value="taksit">Taksit</option>
                <option value="gider">Gider</option>
                <option value="gelir">Gelir</option>
                <option value="kira">Kira</option>
                <option value="fatura">Fatura</option>
                <option value="personel">Personel</option>
                <option value="abonelik">Abonelik</option>
              </select>
            </label>

            <label>
              Başlık
              <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} required />
            </label>

            <div className={styles.twoCol}>
              <label>
                Tutar
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount || ""}
                  onChange={(event) => updateForm({ amount: Number(event.target.value) })}
                  required
                />
              </label>
              <label>
                Para birimi
                <select value={form.currency} onChange={(event) => updateForm({ currency: event.target.value })}>
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
            </div>

            <div className={styles.twoCol}>
              <label>
                Vade
                <input type="date" value={form.dueDate} onChange={(event) => updateForm({ dueDate: event.target.value })} required />
              </label>
              <label>
                Tekrar
                <select value={form.recurrence} onChange={(event) => updateForm({ recurrence: event.target.value })}>
                  {Object.entries(recurrenceLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.twoCol}>
              <label>
                Taksit no
                <input
                  type="number"
                  min="1"
                  value={form.installmentNo || ""}
                  onChange={(event) => updateForm({ installmentNo: event.target.value ? Number(event.target.value) : null })}
                />
              </label>
              <label>
                Toplam taksit
                <input
                  type="number"
                  min="1"
                  value={form.installmentTotal || ""}
                  onChange={(event) => updateForm({ installmentTotal: event.target.value ? Number(event.target.value) : null })}
                />
              </label>
            </div>

            <div className={styles.twoCol}>
              <label>
                Bildirim tarihi
                <input
                  type="date"
                  value={form.reminderDate || ""}
                  onChange={(event) => updateForm({ reminderDate: event.target.value || null })}
                />
              </label>
              <label>
                Bildirim saati
                <input
                  type="time"
                  value={form.reminderTime || ""}
                  onChange={(event) => updateForm({ reminderTime: event.target.value })}
                />
              </label>
            </div>

            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={form.autoPayment}
                onChange={(event) => updateForm({ autoPayment: event.target.checked })}
              />
              Otomatik ödeme
            </label>

            <label>
              Notlar
              <textarea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} rows={3} />
            </label>

            <button className={styles.primaryButton} type="submit" disabled={saving}>
              {saving ? "Kaydediliyor..." : editingId ? "Kaydı güncelle" : "Kaydı ekle"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
