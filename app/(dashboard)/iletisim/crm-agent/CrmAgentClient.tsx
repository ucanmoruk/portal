"use client";
import { useEffect, useState } from "react";
import styles from "@/app/styles/table.module.css";

type Firm = { ID: number; Ad: string };
type Message = { role: "user" | "assistant"; content: string };

export default function CrmAgentClient() {
  const [firms, setFirms] = useState<Firm[]>([]), [search, setSearch] = useState(""), [firmaId, setFirmaId] = useState("");
  const [question, setQuestion] = useState(""), [messages, setMessages] = useState<Message[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => { const timer = setTimeout(async () => { const response = await fetch(`/api/firmalar?search=${encodeURIComponent(search)}&limit=50&page=1&sortBy=ad&sortDir=asc`); if (response.ok) setFirms((await response.json()).data || []); }, 250); return () => clearTimeout(timer); }, [search]);
  const ask = async (preset?: string) => {
    const value = (preset || question).trim(); if (!value) return;
    setLoading(true); setError(""); const next = [...messages, { role: "user" as const, content: value }]; setMessages(next); setQuestion("");
    try { const response = await fetch("/api/crm-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: value, firmaId: firmaId || null, messages }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Yanıt alınamadı."); setMessages([...next, { role: "assistant", content: body.answer }]); }
    catch (err) { setError(err instanceof Error ? err.message : "Yanıt alınamadı."); }
    finally { setLoading(false); }
  };
  return <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: 16 }}>
    <aside className={styles.tableCard} style={{ padding: 16, alignSelf: "start" }}><div className={styles.formGroup}><label>Firma kapsamı</label><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Firma ara..." /><select value={firmaId} onChange={e => { setFirmaId(e.target.value); setMessages([]); }} style={{ marginTop: 8 }}><option value="">Tüm firmalar (genel analiz)</option>{firms.map(firm => <option key={firm.ID} value={firm.ID}>{firm.Ad}</option>)}</select></div><div style={{ marginTop: 18, display: "grid", gap: 7 }}><strong style={{ fontSize: 12 }}>Hazır sorular</strong>{["Bu hafta ödeme vadesi gelen firmalar ve faturalar hangileri?", "Ekim ayında görüşme planlanan firmalar hangileri?", "Takip bekleyen müşteri konularını özetle."].map(item => <button key={item} type="button" className={styles.cancelBtn} style={{ height: "auto", whiteSpace: "normal", textAlign: "left" }} onClick={() => void ask(item)}>{item}</button>)}</div></aside>
    <section className={styles.tableCard} style={{ minHeight: 570, display: "flex", flexDirection: "column" }}><div style={{ padding: 14, borderBottom: "1px solid var(--color-border-light)", fontSize: 12, color: "var(--color-text-tertiary)" }}>Kapsam: <strong>{firmaId ? firms.find(f => String(f.ID) === firmaId)?.Ad || "Seçili firma" : "Tüm firmalar"}</strong></div><div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", maxHeight: 520 }}>{messages.length === 0 && <div className={styles.empty}>Bir firma seçerek o firmaya özel sorun veya genel kapsamda analiz isteyin.</div>}{messages.map((message, index) => <div key={index} style={{ alignSelf: message.role === "user" ? "flex-end" : "flex-start", maxWidth: "84%", padding: "10px 12px", borderRadius: 12, whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: 13, background: message.role === "user" ? "var(--color-accent)" : "var(--color-surface-2)", color: message.role === "user" ? "#fff" : "var(--color-text-primary)" }}>{message.content}</div>)}{loading && <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>CRM Agent inceliyor...</div>}{error && <div className={styles.formError}>{error}</div>}</div><div style={{ padding: 14, borderTop: "1px solid var(--color-border-light)", display: "flex", gap: 8 }}><textarea rows={2} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }} placeholder="Müşteri, teklif, fatura veya görüşme planı hakkında sorun..." style={{ flex: 1, resize: "none", border: "1px solid var(--color-border)", borderRadius: 9, padding: 10, font: "inherit" }} /><button className={styles.saveBtn} disabled={loading || !question.trim()} onClick={() => void ask()}>Gönder</button></div></section>
  </div>;
}
