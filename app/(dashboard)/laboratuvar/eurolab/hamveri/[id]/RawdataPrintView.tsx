"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Edit, Printer } from "lucide-react";
import styles from "@/app/styles/table.module.css";

type TestDecision = "Bekliyor" | "Geçti" | "Kaldı" | "N/A";

type TestRow = {
  id: string;
  source: string;
  group: string;
  title: string;
  clause: string;
  method: string;
  reason: string;
};

type RecordRow = {
  measuredValue: string;
  decision: TestDecision;
  observation: string;
};

type RawdataDetail = {
  id: number;
  code: string;
  sample_name: string;
  standard: string;
  toy_category: string | null;
  age_group: string | null;
  status: string;
  product_data: {
    brand?: string;
    materials?: string[];
    purpose?: string;
    notes?: string;
  };
  test_data: {
    stats?: { total: number; passed: number; failed: number; na: number; waiting: number };
    selectedTests?: TestRow[];
    records?: Record<string, RecordRow>;
  };
  created_at: string | null;
  updated_at: string | null;
};

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleDateString("tr-TR") : "-";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function RawdataPrintView({ id }: { id: string }) {
  const [data, setData] = useState<RawdataDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/eurolab/rawdata/${id}`, { credentials: "same-origin" });
        const json: RawdataDetail & { error?: string } = await response.json();
        if (!response.ok) throw new Error(json.error || "Hamveri kaydı alınamadı.");
        if (alive) setData(json);
      } catch (err: unknown) {
        if (alive) setError(getErrorMessage(err, "Hamveri kaydı alınamadı."));
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();
    return () => {
      alive = false;
    };
  }, [id]);

  const tests = data?.test_data?.selectedTests || [];
  const records = data?.test_data?.records || {};
  const stats = data?.test_data?.stats;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/laboratuvar/eurolab/hamveri" className={styles.cancelBtn}>
          <ArrowLeft size={15} /> Listeye dön
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link href={`/laboratuvar/eurolab/hamveri/${id}/duzenle`} className={styles.cancelBtn}>
            <Edit size={15} /> Düzenle
          </Link>
          <button className={styles.addBtn} onClick={() => window.print()}>
            <Printer size={15} /> Yazdır
          </button>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {loading && <div className={styles.tableCard} style={{ padding: 20 }}>Hamveri kaydı yükleniyor...</div>}

      {data && (
        <div className={styles.tableCard} style={{ padding: 24 }}>
          <div className="border-b border-slate-200 pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">EN 71-1 Hamveri Formu</h2>
                <p className="mt-1 text-sm text-slate-500">{data.standard}</p>
              </div>
              <div className="text-right text-sm text-slate-600">
                <div className="font-mono font-semibold">{data.code}</div>
                <div>{formatDate(data.created_at)}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 py-5 md:grid-cols-3">
            <Info label="Ürün Adı" value={data.sample_name} />
            <Info label="Marka" value={data.product_data?.brand || "-"} />
            <Info label="Durum" value={data.status} />
            <Info label="Kategori" value={data.toy_category || "-"} />
            <Info label="Yaş Grubu" value={data.age_group || "-"} />
            <Info label="Kullanım Amacı" value={data.product_data?.purpose || "-"} />
            <Info label="Malzeme" value={(data.product_data?.materials || []).join(", ") || "-"} wide />
            <Info label="Not" value={data.product_data?.notes || "-"} wide />
          </div>

          {stats && (
            <div className="grid gap-3 border-y border-slate-200 py-4 sm:grid-cols-5">
              <Summary label="Toplam" value={stats.total} />
              <Summary label="Geçti" value={stats.passed} />
              <Summary label="Kaldı" value={stats.failed} />
              <Summary label="N/A" value={stats.na} />
              <Summary label="Bekliyor" value={stats.waiting} />
            </div>
          )}

          <div className="mt-5 overflow-x-auto">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Test</th>
                  <th style={{ width: 120 }}>Madde</th>
                  <th style={{ width: 150 }}>Yöntem</th>
                  <th style={{ width: 150 }}>Ölçülen Değer</th>
                  <th style={{ width: 110 }}>Karar</th>
                  <th>Hata Gözlemi</th>
                </tr>
              </thead>
              <tbody>
                {tests.length === 0 ? (
                  <tr><td colSpan={6}><div className={styles.empty}>Test kaydı bulunamadı.</div></td></tr>
                ) : tests.map(test => {
                  const record = records[test.id] || { measuredValue: "", decision: "Bekliyor", observation: "" };
                  return (
                    <tr key={test.id}>
                      <td>
                        <div className={styles.tdName}>{test.title}</div>
                        <div className={styles.tdSecondary}>{test.source} - {test.group}</div>
                      </td>
                      <td>{test.clause}</td>
                      <td>{test.method}</td>
                      <td>{record.measuredValue || "-"}</td>
                      <td>{record.decision}</td>
                      <td>{record.observation || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-3" : ""}>
      <div className="text-[0.72rem] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
