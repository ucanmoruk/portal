"use client";

import { useState } from "react";
import styles from "@/app/styles/table.module.css";

const EXAMPLES = [
  "2025'te en cok numune gonderen ama 2026'da hic numune gondermeyen firmalar hangileri?",
  "Bu ay en cok hangi 10 test calisilmis?",
  "AHMET SAID CELIKBILEK firmasindan 2026 yilinda kac numune gelmis?",
  "Son 12 ayda en yuksek ciroya sahip 10 firma hangileri?",
];

interface AssistantResult {
  answer: string;
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  note?: string;
}

function cell(value: unknown) {
  if (value == null || value === "") return "-";
  if (typeof value === "number") return value.toLocaleString("tr-TR");
  return String(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Soru yanitlanamadi.";
}

export default function VeriAsistaniClient() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AssistantResult | null>(null);

  async function ask(nextQuestion = question) {
    const q = nextQuestion.trim();
    if (!q) return;
    setQuestion(q);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/veri-asistani", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Soru yanitlanamadi.");
      setResult(json);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const columns = result?.rows?.[0] ? Object.keys(result.rows[0]) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className={styles.tableCard} style={{ padding: 18 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>Soru</span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="Ornek: 2025'te en cok numune gonderen ama 2026'da hic numune gondermeyen firmalar..."
            style={{
              width: "100%",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              padding: 12,
              resize: "vertical",
              fontFamily: "inherit",
              color: "var(--color-text-primary)",
              background: "var(--color-surface)",
            }}
          />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button className={styles.addBtn} type="button" onClick={() => ask()} disabled={loading || !question.trim()}>
            {loading ? "Sorgulaniyor..." : "Sor"}
          </button>
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
            Sadece SELECT sorgusu calisir; yazma komutlari engellenir.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => ask(example)}
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-surface-2)",
                color: "var(--color-text-secondary)",
                borderRadius: 999,
                padding: "7px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {error && <div className={styles.errorBar}>{error}</div>}

      {result && (
        <>
          <div className={styles.tableCard} style={{ padding: 18 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Cevap</h2>
            <p style={{ margin: "10px 0 0", color: "var(--color-text-primary)", lineHeight: 1.6 }}>
              {result.answer}
            </p>
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontWeight: 700 }}>
                Calistirilan SQL
              </summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, padding: 12, borderRadius: 8, background: "var(--color-surface-2)", overflowX: "auto" }}>
                {result.sql}
              </pre>
            </details>
          </div>

          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {columns.length === 0 ? <th>Sonuc</th> : columns.map((col) => <th key={col}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr><td className={styles.empty}>Kayit bulunamadi.</td></tr>
                ) : result.rows.map((row, idx) => (
                  <tr key={idx}>
                    {columns.map((col) => <td key={col}>{cell(row[col])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
