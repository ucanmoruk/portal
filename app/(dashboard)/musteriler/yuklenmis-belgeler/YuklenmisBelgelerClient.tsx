"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { Edit3, Eye, Mail, Trash2, X } from "lucide-react";

type Belge = {
  ID: number;
  Tarih: string | null;
  RaporNo: string | number | null;
  NumuneTur: string | null;
  NumuneAd: string | null;
  FirmaAd: string | null;
  Proje: string | null;
  Yol: string | null;
};

const TUR_SECENEKLERI = ["Rapor", "Sertifika", "Claim", "ÜGDR", "Diğer"];

const fmtTarih = (t: string | null) => {
  if (!t) return "-";
  const [y, m, d] = t.split("-");
  return d ? `${d}.${m}.${y}` : t;
};

const parseMailList = (value: string) =>
  value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const iconButton = (tone: "neutral" | "accent" | "danger" = "neutral") => ({
  width: 30,
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 7,
  border: tone === "danger" ? "1px solid #ff3b3040" : "1px solid var(--color-border)",
  background: tone === "accent" ? "var(--color-accent-soft, #0071e312)" : "var(--color-surface)",
  color: tone === "danger" ? "#c00" : tone === "accent" ? "var(--color-accent)" : "var(--color-text-secondary)",
  cursor: "pointer",
} as const);

export default function YuklenmisBelgelerClient() {
  const [rows, setRows] = useState<Belge[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [silingId, setSilingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editTarget, setEditTarget] = useState<Belge | null>(null);
  const [editForm, setEditForm] = useState({ raporNo: "", numuneTur: "Rapor", numuneAd: "", firmaAd: "", proje: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [mailOpen, setMailOpen] = useState(false);
  const [mailForm, setMailForm] = useState({ to: "", cc: "", konu: "", mesaj: "" });
  const [mailSending, setMailSending] = useState(false);
  const [mailError, setMailError] = useState("");
  const [mailSuccess, setMailSuccess] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/musteriler/yuklenmis-belgeler?search=${encodeURIComponent(q)}&limit=100`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Liste alınamadı");
      setRows(Array.isArray(j.data) ? j.data : []);
      setTotal(j.total ?? 0);
      setSelectedIds((current) => {
        const next = new Set<number>();
        const rowIds = new Set((Array.isArray(j.data) ? j.data : []).map((item: Belge) => item.ID));
        current.forEach((id) => { if (rowIds.has(id)) next.add(id); });
        return next;
      });
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Liste alınamadı"));
      setRows([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(""); }, [load]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(search), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search, load]);

  const toggleRow = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((current) => current.size === rows.length ? new Set() : new Set(rows.map((row) => row.ID)));
  };

  const openEdit = (b: Belge) => {
    setEditTarget(b);
    setEditForm({
      raporNo: String(b.RaporNo ?? ""),
      numuneTur: b.NumuneTur || "Rapor",
      numuneAd: b.NumuneAd || "",
      firmaAd: b.FirmaAd || "",
      proje: b.Proje || "",
    });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    setEditError("");
    try {
      const r = await fetch(`/api/musteriler/yuklenmis-belgeler/${editTarget.ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Belge güncellenemedi");
      await load(search);
      setEditTarget(null);
    } catch (e: unknown) {
      setEditError(getErrorMessage(e, "Belge güncellenemedi"));
    } finally {
      setEditSaving(false);
    }
  };

  const sendMail = async () => {
    setMailSending(true);
    setMailError("");
    setMailSuccess("");
    try {
      const r = await fetch("/api/musteriler/yuklenmis-belgeler/mail-gonder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          to: parseMailList(mailForm.to),
          cc: parseMailList(mailForm.cc),
          konu: mailForm.konu,
          mesaj: mailForm.mesaj,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Mail gönderilemedi");
      setMailSuccess(`${j.gonderilen ?? selectedIds.size} PDF mail olarak gönderildi.`);
      setSelectedIds(new Set());
    } catch (e: unknown) {
      setMailError(getErrorMessage(e, "Mail gönderilemedi"));
    } finally {
      setMailSending(false);
    }
  };

  const sil = async (b: Belge) => {
    if (!window.confirm(`"${b.NumuneAd ?? b.RaporNo}" belgesini geri çekmek istiyor musunuz? Müşteri artık göremeyecek.`)) return;
    setSilingId(b.ID);
    try {
      const r = await fetch(`/api/musteriler/yuklenmis-belgeler/${b.ID}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Silinemedi");
      setRows((rs) => rs.filter((x) => x.ID !== b.ID));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(b.ID);
        return next;
      });
      setTotal((t) => Math.max(0, t - 1));
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Silinemedi"));
    } finally {
      setSilingId(null);
    }
  };

  const gridCols = "34px 90px 100px 105px minmax(190px,1.4fr) minmax(150px,1fr) minmax(120px,.8fr) 132px";
  const th = { fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-tertiary)" } as const;
  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rapor no, numune, tür, firma, proje ara..."
          style={{ flex: "1 1 300px", maxWidth: 420, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)", fontSize: "0.88rem" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-tertiary)" }}>
            {selectedIds.size ? `${selectedIds.size} seçili / ` : ""}{total} belge
          </span>
          <button
            type="button"
            onClick={() => { setMailOpen(true); setMailError(""); setMailSuccess(""); }}
            disabled={selectedIds.size === 0}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: selectedIds.size ? "var(--color-accent)" : "var(--color-surface)",
              color: selectedIds.size ? "#fff" : "var(--color-text-tertiary)",
              cursor: selectedIds.size ? "pointer" : "not-allowed",
              fontSize: "0.82rem",
              fontWeight: 600,
            }}
          >
            <Mail size={15} /> Seçili PDFleri Mail Gönder
          </button>
        </div>
      </div>

      {error && <div style={{ padding: "10px 14px", background: "#ff3b3010", color: "#c00", borderRadius: 8, fontSize: "0.85rem" }}>{error}</div>}

      <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden", overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10, padding: "10px 14px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border-light)", minWidth: 1030, ...th }}>
          <div>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Tüm belgeleri seç" />
          </div>
          <div>Tarih</div><div>Rapor No</div><div>Tür</div><div>Numune Adı</div><div>Firma</div><div>Proje</div><div style={{ textAlign: "right" }}>İşlem</div>
        </div>

        {loading ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.9rem" }}>Yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.9rem" }}>Henüz yüklenmiş belge yok.</div>
        ) : (
          rows.map((b) => (
            <div key={b.ID} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10, padding: "10px 14px", alignItems: "center", borderBottom: "1px solid var(--color-border-light)", minWidth: 1030, fontSize: "0.83rem" }}>
              <div>
                <input type="checkbox" checked={selectedIds.has(b.ID)} onChange={() => toggleRow(b.ID)} aria-label={`${b.RaporNo ?? b.ID} seç`} />
              </div>
              <div style={{ color: "var(--color-text-secondary)" }}>{fmtTarih(b.Tarih)}</div>
              <div style={{ fontWeight: 600 }}>{b.RaporNo ?? "-"}</div>
              <div>{b.NumuneTur ?? "-"}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.NumuneAd ?? ""}>{b.NumuneAd ?? "-"}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.FirmaAd ?? ""}>{b.FirmaAd ?? "-"}</div>
              <div style={{ color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.Proje ?? ""}>{b.Proje ?? "-"}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {b.Yol && (
                  <a href={b.Yol} target="_blank" rel="noopener noreferrer" title="Görüntüle" style={{ ...iconButton("accent"), textDecoration: "none" }}>
                    <Eye size={15} />
                  </a>
                )}
                <button type="button" onClick={() => openEdit(b)} title="Düzenle" style={iconButton("neutral")}>
                  <Edit3 size={15} />
                </button>
                <button type="button" onClick={() => sil(b)} disabled={silingId === b.ID} title="Geri çek" style={{ ...iconButton("danger"), cursor: silingId === b.ID ? "wait" : "pointer" }}>
                  {silingId === b.ID ? "..." : <Trash2 size={15} />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editTarget && (
        <Modal title="Belge Düzenle" onClose={() => !editSaving && setEditTarget(null)}>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={labelStyle}>Rapor No
              <input value={editForm.raporNo} onChange={(e) => setEditForm((f) => ({ ...f, raporNo: e.target.value }))} style={inputStyle} />
            </label>
            <label style={labelStyle}>Belge Türü
              <select value={editForm.numuneTur} onChange={(e) => setEditForm((f) => ({ ...f, numuneTur: e.target.value }))} style={inputStyle}>
                {TUR_SECENEKLERI.map((tur) => <option key={tur} value={tur}>{tur}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Numune Adı
              <input value={editForm.numuneAd} onChange={(e) => setEditForm((f) => ({ ...f, numuneAd: e.target.value }))} style={inputStyle} />
            </label>
            <label style={labelStyle}>Firma Adı
              <input value={editForm.firmaAd} onChange={(e) => setEditForm((f) => ({ ...f, firmaAd: e.target.value }))} style={inputStyle} />
            </label>
            <label style={labelStyle}>Proje
              <input value={editForm.proje} onChange={(e) => setEditForm((f) => ({ ...f, proje: e.target.value }))} style={inputStyle} />
            </label>
            {editError && <div style={errorStyle}>{editError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setEditTarget(null)} disabled={editSaving} style={secondaryButton}>Vazgeç</button>
              <button type="button" onClick={saveEdit} disabled={editSaving} style={primaryButton}>{editSaving ? "Kaydediliyor..." : "Kaydet"}</button>
            </div>
          </div>
        </Modal>
      )}

      {mailOpen && (
        <Modal title="Seçili PDFleri Mail Gönder" onClose={() => !mailSending && setMailOpen(false)}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ padding: 10, borderRadius: 8, background: "var(--color-surface)", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              {selectedIds.size} PDF ek olarak gönderilecek.
            </div>
            <label style={labelStyle}>Alıcılar
              <input value={mailForm.to} onChange={(e) => setMailForm((f) => ({ ...f, to: e.target.value }))} placeholder="mail@firma.com; ikinci@firma.com" style={inputStyle} />
            </label>
            <label style={labelStyle}>CC
              <input value={mailForm.cc} onChange={(e) => setMailForm((f) => ({ ...f, cc: e.target.value }))} placeholder="Opsiyonel" style={inputStyle} />
            </label>
            <label style={labelStyle}>Konu
              <input value={mailForm.konu} onChange={(e) => setMailForm((f) => ({ ...f, konu: e.target.value }))} placeholder="Boş bırakılırsa otomatik konu kullanılır" style={inputStyle} />
            </label>
            <label style={labelStyle}>Mesaj
              <textarea value={mailForm.mesaj} onChange={(e) => setMailForm((f) => ({ ...f, mesaj: e.target.value }))} rows={4} placeholder="Mail içeriğine eklenecek kısa mesaj" style={{ ...inputStyle, resize: "vertical" }} />
            </label>
            {mailError && <div style={errorStyle}>{mailError}</div>}
            {mailSuccess && <div style={{ ...errorStyle, color: "#157347", background: "#19875414" }}>{mailSuccess}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setMailOpen(false)} disabled={mailSending} style={secondaryButton}>Kapat</button>
              <button type="button" onClick={sendMail} disabled={mailSending || selectedIds.size === 0} style={primaryButton}>{mailSending ? "Gönderiliyor..." : "Mail Gönder"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15, 23, 42, 0.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflow: "auto", background: "var(--color-background, #fff)", borderRadius: 12, border: "1px solid var(--color-border)", boxShadow: "0 24px 70px rgba(15,23,42,.22)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border-light)" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} title="Kapat" style={iconButton("neutral")}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "grid",
  gap: 5,
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
} as const;

const inputStyle = {
  width: "100%",
  padding: "9px 10px",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-background, #fff)",
  color: "var(--color-text)",
  fontSize: "0.88rem",
  fontWeight: 400,
  boxSizing: "border-box",
} as const;

const primaryButton = {
  padding: "8px 13px",
  borderRadius: 8,
  border: "1px solid var(--color-accent)",
  background: "var(--color-accent)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const secondaryButton = {
  padding: "8px 13px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-secondary)",
  fontWeight: 600,
  cursor: "pointer",
} as const;

const errorStyle = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "#ff3b3010",
  color: "#c00",
  fontSize: "0.82rem",
} as const;
