"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "@/app/styles/table.module.css";

interface ProformaRow {
  ID: number;
  ProformaNo: string;
  EvrakNo: string | null;
  TeklifID: number | null;
  Tarih: string;
  Durum: string;
  FirmaAd: string;
  GenelToplam: number | string;
  ParaBirimi?: string | null;
  DovizAlisKuru?: number | string | null;
  TlKarsiligi?: number | string | null;
  KalemSayisi: number | string;
  OdemeDurumu?: string | null;
}

const DURUMLAR = ["Taslak", "Gönderildi", "Onaylandı", "İptal"];

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value || 0);
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function upperTr(value?: string | null) {
  return value ? value.toLocaleUpperCase("tr-TR") : "";
}

function statusStyle(durum: string): React.CSSProperties {
  const stylesByStatus: Record<string, React.CSSProperties> = {
    Taslak: { background: "#f5f5f7", color: "#6e6e73", borderColor: "#d2d2d7" },
    Gönderildi: { background: "#e8f1ff", color: "#0055a8", borderColor: "#b8d7ff" },
    Onaylandı: { background: "#e6f6ee", color: "#1a7f4b", borderColor: "#b8e6ce" },
    Faturalaştı: { background: "#f3eaff", color: "#6b21a8", borderColor: "#d8bcf5" },
    "Ödeme Bekliyor": { background: "#fff4e5", color: "#b35309", borderColor: "#fbd9a8" },
    Ödendi: { background: "#e6f6ee", color: "#1a7f4b", borderColor: "#b8e6ce" },
    İptal: { background: "#fdecea", color: "#c0392b", borderColor: "#f5b8b0" },
  };
  return {
    ...(stylesByStatus[durum] || stylesByStatus.Taslak),
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 999,
    fontWeight: 700,
    minWidth: 126,
  };
}

export default function ProformaTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<ProformaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<any | null>(null);
  const [faturaTarget, setFaturaTarget] = useState<ProformaRow | null>(null);
  const [faturaForm, setFaturaForm] = useState({ faturaNo: "", faturaTarihi: "", tutar: "" });
  const [faturaSaving, setFaturaSaving] = useState(false);
  const [faturaError, setFaturaError] = useState("");

  useEffect(() => {
    const evrakNo = searchParams.get("evrakNo");
    const teklifId = searchParams.get("teklifId");
    if (!evrakNo) return;
    const qs = new URLSearchParams({ evrakNo });
    if (teklifId) qs.set("teklifId", teklifId);
    router.replace(`/musteriler/proforma-listesi/yeni?${qs.toString()}`);
  }, [router, searchParams]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/proformalar?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Proforma listesi alınamadı.");
      setRows(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, page, limit]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function openDetail(id: number) {
    const res = await fetch(`/api/proformalar/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Proforma açılamadı.");
      return;
    }
    setDetail(json.header);
  }

  async function updateStatus(row: ProformaRow, durum: string) {
    await fetch(`/api/proformalar/${row.ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durum }),
    });
    fetchRows();
  }

  function openFatura(row: ProformaRow) {
    setFaturaError("");
    const bugun = new Date().toISOString().slice(0, 10);
    setFaturaForm({
      faturaNo: "",
      faturaTarihi: bugun,
      tutar: String(Number(row.GenelToplam || 0).toFixed(2)),
    });
    setFaturaTarget(row);
  }

  async function submitFatura() {
    if (!faturaTarget) return;
    if (!faturaForm.faturaNo.trim()) { setFaturaError("Fatura no zorunludur."); return; }
    if (!faturaForm.faturaTarihi) { setFaturaError("Fatura tarihi zorunludur."); return; }
    setFaturaSaving(true);
    setFaturaError("");
    try {
      const res = await fetch(`/api/faturalar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proformaId: faturaTarget.ID,
          faturaNo: faturaForm.faturaNo.trim(),
          faturaTarihi: faturaForm.faturaTarihi,
          tutar: faturaForm.tutar,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Fatura oluşturulamadı.");
      setFaturaTarget(null);
      fetchRows();
    } catch (e: any) {
      setFaturaError(e.message);
    } finally {
      setFaturaSaving(false);
    }
  }

  async function sendMail() {
    if (!detail) return;
    const res = await fetch(`/api/proformalar/${detail.ID}/mail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: detail.FirmaEmail, subject: detail.ProformaNo }),
    });
    const json = await res.json().catch(() => ({}));
    alert(res.ok ? "Mail gönderim isteği oluşturuldu." : (json.error || "Mail gönderilemedi."));
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox} style={{ width: 320 }}>
            <input
              className={styles.searchInput}
              placeholder="Proforma, evrak no, firma..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <span className={styles.totalCount}>{total} kayıt</span>
        </div>
        <div className={styles.toolbarRight}>
          <select className={styles.pageSizeSelect} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
          <button className={styles.addBtn} onClick={() => router.push("/musteriler/proforma-listesi/yeni")}>Yeni Proforma</button>
        </div>
      </div>

      <div className={styles.tableCard}>
        {error && <div className={styles.errorBar}>{error}</div>}
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Proforma</th>
              <th>Evrak No</th>
              <th>Firma</th>
              <th>Tarih</th>
              <th>Durum</th>
              <th>Kalem</th>
              <th>Toplam</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className={styles.empty}>Yükleniyor...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className={styles.empty}>Henüz proforma oluşturulmamış.</td></tr>
            ) : rows.map(row => {
              // Fatura kesilmiş proforma → ödeme yaşam döngüsünü göster (Ödeme Bekliyor / Ödendi),
              // düzenleme ve tekrar faturalaştırma kapalı. Durum='Faturalaştı' VEYA Odeme tablosunda
              // ödeme kaydı varsa faturalaşmış kabul edilir (eski kayıtlara da dayanıklı).
              const odemeRaw = (row.OdemeDurumu || "").trim();
              const hasPayment = odemeRaw === "Ödeme Bekliyor" || odemeRaw === "Ödendi";
              const isInvoiced = row.Durum === "Faturalaştı" || hasPayment;
              const odemeLabel = odemeRaw === "Ödendi" ? "Ödendi" : "Ödeme Bekliyor";
              return (
              <tr key={row.ID}>
                <td className={styles.primaryCell}>{row.ProformaNo}</td>
                <td>{row.EvrakNo || "-"}</td>
                <td>{upperTr(row.FirmaAd) || "-"}</td>
                <td>{row.Tarih}</td>
                <td>
                  {isInvoiced ? (
                    <span className={styles.pageSizeSelect} style={{ ...statusStyle(odemeLabel), display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "default" }}>
                      {odemeLabel}
                    </span>
                  ) : (
                    <select value={row.Durum} onChange={e => updateStatus(row, e.target.value)} className={styles.pageSizeSelect} style={statusStyle(row.Durum)}>
                      {DURUMLAR.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                </td>
                <td>{row.KalemSayisi}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ fontWeight: 700 }}>{fmtMoney(row.GenelToplam)} {row.ParaBirimi || "TRY"}</div>
                  {row.TlKarsiligi != null && (
                    <div style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>
                      {fmtMoney(row.TlKarsiligi)} TL
                      {row.DovizAlisKuru != null ? ` · Alış ${fmtMoney(row.DovizAlisKuru)}` : ""}
                    </div>
                  )}
                </td>
                <td>
                  <div className={styles.actionBtns} style={{ justifyContent: "flex-end" }}>
                    <button
                      className={styles.editBtn}
                      onClick={() => router.push(`/musteriler/proforma-listesi/${row.ID}/duzenle`)}
                      disabled={isInvoiced}
                      title={isInvoiced ? "Faturalaşmış proforma düzenlenemez" : "Düzenle"}
                    >✏️</button>
                    <button className={styles.editBtn} onClick={() => openDetail(row.ID)} title="Önizleme">👁️</button>
                    <button
                      className={styles.editBtn}
                      onClick={() => openFatura(row)}
                      disabled={isInvoiced}
                      title={isInvoiced ? "Zaten faturalaştırıldı" : "Faturaya çevir"}
                    >🧾</button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Önceki</button>
          <span className={styles.pageInfo}>{page} / {totalPages}</span>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sonraki</button>
        </div>
      )}

      {detail && (
        <div style={overlayStyle}>
          <div style={modalStyle} id="proforma-print-area">
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{detail.ProformaNo}</h2>
                <p style={{ margin: "4px 0 0", color: "var(--color-text-secondary)" }}>
                  {upperTr(detail.FirmaAd)} {detail.EvrakNo ? `- Evrak ${detail.EvrakNo}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <a className={styles.cancelBtn} href={`/api/proforma-print/${detail.ID}/pdf?download=1`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>PDF İndir</a>
                <a className={styles.cancelBtn} href={`/proforma-print/${detail.ID}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Yeni Pencerede Aç</a>
                <button className={styles.cancelBtn} onClick={sendMail}>Mail Gönder</button>
                <button className={styles.saveBtn} onClick={() => setDetail(null)}>Kapat</button>
              </div>
            </div>
            <iframe
              title="Proforma önizleme"
              src={`/proforma-print/${detail.ID}?pdfMode=1`}
              style={{ width: "100%", height: "72vh", border: "1px solid var(--color-border-light)", borderRadius: 8, background: "#fff" }}
            />
          </div>
        </div>
      )}

      {faturaTarget && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, width: "min(460px, 100%)" }}>
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Faturaya Çevir</h2>
                <p style={{ margin: "4px 0 0", color: "var(--color-text-secondary)", fontSize: 13 }}>
                  {faturaTarget.ProformaNo} · {upperTr(faturaTarget.FirmaAd)}
                </p>
              </div>
            </div>
            {faturaError && <div className={styles.errorBar} style={{ marginBottom: 12 }}>{faturaError}</div>}
            <div style={{ display: "grid", gap: 12 }}>
              <label style={faturaLabelStyle}>
                Fatura No
                <input
                  className={styles.searchInput}
                  style={faturaInputStyle}
                  value={faturaForm.faturaNo}
                  onChange={e => setFaturaForm(f => ({ ...f, faturaNo: e.target.value }))}
                  placeholder="Örn. GIB2026000000123"
                  autoFocus
                />
              </label>
              <label style={faturaLabelStyle}>
                Fatura Tarihi
                <input
                  type="date"
                  className={styles.searchInput}
                  style={faturaInputStyle}
                  value={faturaForm.faturaTarihi}
                  onChange={e => setFaturaForm(f => ({ ...f, faturaTarihi: e.target.value }))}
                />
              </label>
              <label style={faturaLabelStyle}>
                Tutar (KDV Dahil)
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    step="0.01"
                    className={styles.searchInput}
                    style={faturaInputStyle}
                    value={faturaForm.tutar}
                    onChange={e => setFaturaForm(f => ({ ...f, tutar: e.target.value }))}
                  />
                  <span style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>{faturaTarget.ParaBirimi || "TRY"}</span>
                </div>
              </label>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                Fatura oluşturulunca ödeme durumu otomatik <strong>“Ödeme Bekliyor”</strong> olur ve
                numune takip ekranındaki ödeme aşaması güncellenir. Tahsilat sonrası Fatura Takip
                ekranından <strong>“Ödendi”</strong> yapabilirsiniz.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button className={styles.cancelBtn} onClick={() => setFaturaTarget(null)} disabled={faturaSaving}>Vazgeç</button>
              <button className={styles.saveBtn} onClick={submitFatura} disabled={faturaSaving}>
                {faturaSaving ? "Kaydediliyor..." : "Faturayı Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const faturaLabelStyle: React.CSSProperties = {
  display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)",
};

const faturaInputStyle: React.CSSProperties = {
  width: "100%", height: 38,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)",
  zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center",
  padding: "28px 16px", overflow: "auto",
};

const modalStyle: React.CSSProperties = {
  width: "min(1180px, 100%)", background: "var(--color-surface)", borderRadius: 8,
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)", padding: 20,
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  paddingBottom: 14, borderBottom: "1px solid var(--color-border-light)", marginBottom: 14,
  flexWrap: "wrap",
};
