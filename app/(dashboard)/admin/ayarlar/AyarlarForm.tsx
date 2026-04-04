"use client";

import { useState } from "react";
import styles from "@/app/styles/table.module.css";

interface Props {
  initial: Record<string, string>;
}

const GROUPS = [
  {
    title: "Şirket Bilgileri",
    fields: [
      { key: "SIRKET_ADI",   label: "Şirket Adı",     type: "text",     placeholder: "UNIQUE ANALİZ BELGELENDİRME..." },
      { key: "SIRKET_ADRES", label: "Şirket Adresi",  type: "text",     placeholder: "Adres..." },
      { key: "SIRKET_WEB",   label: "Web Sitesi",     type: "text",     placeholder: "www.sirket.com" },
      { key: "SIRKET_EMAIL", label: "Şirket E-posta", type: "text",     placeholder: "info@sirket.com" },
      { key: "DOKUMAN_NO",   label: "Doküman No",     type: "text",     placeholder: "F.01.PR.03" },
      { key: "YAYIN_TARIHI", label: "Yayın Tarihi",   type: "text",     placeholder: "27.09.2023" },
    ],
  },
  {
    title: "Mail Ayarları (SMTP)",
    fields: [
      { key: "MAIL_HOST",   label: "SMTP Sunucu",  type: "text",     placeholder: "smtp.gmail.com" },
      { key: "MAIL_PORT",   label: "Port",          type: "text",     placeholder: "587" },
      { key: "MAIL_SECURE", label: "SSL/TLS",       type: "select",   options: [{ v: "false", l: "STARTTLS (587)" }, { v: "true", l: "SSL (465)" }] },
      { key: "MAIL_USER",   label: "Kullanıcı Adı", type: "text",     placeholder: "user@gmail.com" },
      { key: "MAIL_PASS",   label: "Şifre / App Password", type: "password", placeholder: "••••••••" },
      { key: "MAIL_FROM",   label: "Gönderen (From)", type: "text",   placeholder: "ÜGD Portal <info@sirket.com>" },
    ],
  },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  border: "1px solid var(--color-border)", borderRadius: 8,
  fontSize: 14, background: "var(--color-surface)",
  color: "var(--color-text-primary)", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.04em",
  color: "var(--color-text-secondary)", marginBottom: 5,
};

export default function AyarlarForm({ initial }: Props) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [ok,     setOk]     = useState(false);
  const [err,    setErr]     = useState("");

  function set(key: string, val: string) {
    setValues(p => ({ ...p, [key]: val }));
    setOk(false);
  }

  async function handleSave() {
    setSaving(true); setErr(""); setOk(false);
    try {
      const r = await fetch("/api/admin/ayarlar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Kayıt başarısız."); return; }
      setOk(true);
    } catch { setErr("Sunucu hatası."); }
    finally   { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18, color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
            {group.title}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
            {group.fields.map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                {f.type === "select" ? (
                  <select style={inputStyle} value={values[f.key] ?? ""} onChange={e => set(f.key, e.target.value)}>
                    {f.options!.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                ) : (
                  <input
                    style={inputStyle}
                    type={f.type}
                    placeholder={f.placeholder}
                    value={values[f.key] ?? ""}
                    onChange={e => set(f.key, e.target.value)}
                    autoComplete={f.type === "password" ? "new-password" : "off"}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? <span className={styles.loader} /> : "Kaydet"}
        </button>
        {ok  && <span style={{ color: "var(--color-success)", fontSize: 14, fontWeight: 600 }}>✓ Kaydedildi</span>}
        {err && <span style={{ color: "var(--color-danger)",  fontSize: 14 }}>{err}</span>}
      </div>
    </div>
  );
}
