"use client";
import { analysisApi } from "@/components/eurolab/analysisApi";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Trash2, UploadCloud } from "lucide-react";
import styles from "@/app/styles/table.module.css";
import { en71StandardTestOptions } from "../yeni/En71RawDataFlow";

type InstructionRow = {
  id: number;
  standard: string;
  test_id: string | null;
  clause: string;
  method: string;
  title: string | null;
  file_name: string;
  file_size: number;
  file_url: string | null;
  updated_at: string | null;
};

type ClauseOption = {
  value: string;
  label: string;
  relatedTests: string[];
};

const emptyForm = {
  standard: "EN 71-1:2026",
  clause: "",
  title: "",
};

const numberPattern = /\d+(?:\.\d+)*/g;

const range = (prefix: number, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => `${prefix}.${start + index}`);

const standardClauseNumbers = [
  ...range(4, 1, 23),
  ...range(5, 1, 9),
  "6",
  ...range(7, 1, 16),
  ...range(8, 1, 41),
];

const normalizeClause = (value: string) => {
  const number = value.match(numberPattern)?.[0] || value;
  return number.trim();
};

const clauseSort = (left: string, right: string) => {
  const leftParts = left.split(".").map(part => Number(part));
  const rightParts = right.split(".").map(part => Number(part));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return left.localeCompare(right, "tr-TR", { numeric: true });
};

const buildClauseOptions = (): ClauseOption[] => {
  const map = new Map<string, Set<string>>();

  standardClauseNumbers.forEach(clause => {
    if (!map.has(clause)) map.set(clause, new Set<string>());
  });

  en71StandardTestOptions.forEach(test => {
    [test.clause, test.method].forEach(value => {
      const matches = value.match(numberPattern) || [];
      matches.forEach(match => {
        const key = normalizeClause(match);
        if (!map.has(key)) map.set(key, new Set<string>());
        map.get(key)?.add(test.title);
      });
    });
  });

  return Array.from(map.entries())
    .sort(([left], [right]) => clauseSort(left, right))
    .map(([value, related]) => ({
      value,
      label: `Madde ${value}`,
      relatedTests: Array.from(related),
    }));
};

const clauseOptions = buildClauseOptions();

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleDateString("tr-TR") : "-";

const formatSize = (size: number) => {
  if (!size) return "-";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function RawdataInstructionManager() {
  const [rows, setRows] = useState<InstructionRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedClause = useMemo(
    () => clauseOptions.find(option => option.value === form.clause),
    [form.clause],
  );

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(analysisApi(`/api/eurolab/rawdata-instructions?standard=${encodeURIComponent(form.standard)}`), { credentials: "same-origin" });
      const json: InstructionRow[] & { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error || "Talimat listesi alınamadı.");
      setRows(Array.isArray(json) ? json : []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Talimat listesi alınamadı."));
    } finally {
      setLoading(false);
    }
  }, [form.standard]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleClauseChange = (clause: string) => {
    const option = clauseOptions.find(item => item.value === clause);
    setForm(current => ({
      ...current,
      clause,
      title: option ? option.label : "",
    }));
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.clause) {
      setError("Madde seçimi zorunludur.");
      return;
    }
    if (!file) {
      setError("PDF dosyası seçilmelidir.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("standard", form.standard);
      body.append("test_id", "");
      body.append("clause", form.clause);
      body.append("method", "Madde bazlı");
      body.append("title", form.title || `Madde ${form.clause}`);
      body.append("file", file);

      const res = await fetch(analysisApi("/api/eurolab/rawdata-instructions"), {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const json: InstructionRow & { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error || "Talimat PDF kaydedilemedi.");

      setMessage("Talimat PDF kaydedildi ve maddeyle eşleştirildi.");
      setForm(emptyForm);
      setFile(null);
      const input = document.getElementById("instruction-pdf-file") as HTMLInputElement | null;
      if (input) input.value = "";
      fetchRows();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Talimat PDF kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: InstructionRow) => {
    if (!window.confirm(`${row.clause} eşleştirmesi silinsin mi?`)) return;
    setDeletingId(row.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(analysisApi(`/api/eurolab/rawdata-instructions/${row.id}`), {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json: { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error || "Talimat silinemedi.");
      setMessage("Talimat eşleştirmesi silindi.");
      fetchRows();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Talimat silinemedi."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/laboratuvar/eurolab/hamveri" className={styles.cancelBtn}>
          <ArrowLeft size={15} /> Hamveri listesine dön
        </Link>
      </div>

      <form onSubmit={handleSubmit} className={styles.tableCard} style={{ padding: 18 }}>
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr_1.4fr]">
          <label className="block">
            <span className="mb-2 block text-[0.72rem] font-bold uppercase tracking-wide text-slate-500">Standart</span>
            <input className="field-input" value={form.standard} onChange={event => setForm(current => ({ ...current, standard: event.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[0.72rem] font-bold uppercase tracking-wide text-slate-500">Madde</span>
            <select className="field-input" value={form.clause} onChange={event => handleClauseChange(event.target.value)} required>
              <option value="">Madde seçin</option>
              {clauseOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[0.72rem] font-bold uppercase tracking-wide text-slate-500">PDF</span>
            <input id="instruction-pdf-file" className="field-input" type="file" accept="application/pdf,.pdf" onChange={handleFile} required />
          </label>
        </div>

        {selectedClause && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 text-sm text-slate-700" style={{ padding: "10px 12px" }}>
            <strong>{selectedClause.label}</strong>
            <span className="ml-2 text-slate-500">
              İlgili testler: {selectedClause.relatedTests.slice(0, 4).join(", ")}
              {selectedClause.relatedTests.length > 4 ? "..." : ""}
            </span>
          </div>
        )}

        <label className="mt-4 block">
          <span className="mb-2 block text-[0.72rem] font-bold uppercase tracking-wide text-slate-500">Başlık / Açıklama</span>
          <input className="field-input" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Örn. Madde 4.1 analiz talimatı" />
        </label>

        {error && <div className={styles.errorBar} style={{ marginTop: 14 }}>{error}</div>}
        {message && <div className={styles.formError} style={{ background: "#ecfdf5", color: "#047857", marginTop: 14 }}>{message}</div>}

        <div className="mt-4 flex justify-end">
          <button className={styles.addBtn} disabled={saving} type="submit">
            <UploadCloud size={16} /> {saving ? "Kaydediliyor..." : "PDF Yükle ve Eşleştir"}
          </button>
        </div>
      </form>

      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>Madde</th>
                <th>Başlık</th>
                <th style={{ width: 220 }}>PDF</th>
                <th style={{ width: 120 }}>FTP</th>
                <th style={{ width: 100 }}>Boyut</th>
                <th style={{ width: 120 }}>Güncelleme</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>{Array.from({ length: 7 }).map((__, cell) => <td key={cell}><div className={styles.skeleton} /></td>)}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={7}><div className={styles.empty}>Henüz PDF talimat eşleştirmesi yok.</div></td></tr>
              ) : rows.map(row => (
                <tr key={row.id}>
                  <td className={styles.tdMono}>Madde {normalizeClause(row.clause)}</td>
                  <td>
                    <div className={styles.tdName}>{row.title || "-"}</div>
                    {row.test_id && <div className={styles.tdSecondary}>{row.test_id}</div>}
                  </td>
                  <td>
                    <a className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline" href={analysisApi(`/api/eurolab/rawdata-instructions/${row.id}/file`)} target="_blank" rel="noopener noreferrer">
                      {row.file_name} <ExternalLink size={13} />
                    </a>
                  </td>
                  <td>
                    {row.file_url ? (
                      <a className="font-semibold text-blue-700 hover:underline" href={row.file_url} target="_blank" rel="noopener noreferrer">Aç</a>
                    ) : "-"}
                  </td>
                  <td>{formatSize(row.file_size)}</td>
                  <td>{formatDate(row.updated_at)}</td>
                  <td>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(row)} disabled={deletingId === row.id} title="Sil">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .field-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #f8fafc;
          color: #0f172a;
          font-size: 0.86rem;
          padding: 10px 12px;
          outline: none;
        }
        .field-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
          background: #ffffff;
        }
      `}</style>
    </div>
  );
}
