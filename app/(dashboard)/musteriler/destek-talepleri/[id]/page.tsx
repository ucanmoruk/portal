import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cosmoPool } from "@/lib/db";
import Link from "next/link";
import styles from "@/app/styles/table.module.css";
import TalepKonusma from "./TalepKonusma";

export const metadata = { title: "Destek Talebi" };

interface DestekHeader {
  ID: number;
  TalepNoLabel: string;
  IcTakipNo: string;
  Tarih: string;
  FirmaKodu: string;
  Durum: string;
  Tur: string;
  Sozlesme: string;
  Olusturan: string;
  FirmaAd: string;
}

const DURUM_COLORS: Record<string, { color: string; bg: string }> = {
  "Yeni Talep":        { color: "#9a6700", bg: "#fff3cd" },
  "Müşteri Yanıtı":    { color: "#9a6700", bg: "#fff3cd" },
  "Cevaplandı":        { color: "#0071e3", bg: "#e8f0fe" },
  "Kapandı":           { color: "#1a7f4b", bg: "#e6f6ee" },
  "Pasif":             { color: "#6e6e73", bg: "#f5f5f7" },
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const v = (value ?? "").toString().trim();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--color-border-light)" }}>
      <div style={{ color: "var(--color-text-tertiary)", fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{v || <em style={{ color: "var(--color-text-tertiary)" }}>—</em>}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--color-surface)", border: "1px solid var(--color-border-light)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12, letterSpacing: 0.2 }}>{title}</h2>
      {children}
    </section>
  );
}

export default async function DestekTalebiDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const nid = Number(id);
  if (!Number.isFinite(nid)) {
    return <div className={styles.page}><div style={{ padding: 40 }}>Geçersiz talep ID.</div></div>;
  }

  const pool = await cosmoPool;
  const headerRes = await pool.request().input("id", nid).query(`
    SELECT
      t.ID,
      COALESCE(t.DisTalepKodu, N'26' + CAST(t.TalepNo AS NVARCHAR(20))) AS TalepNoLabel,
      N'26' + CAST(t.TalepNo AS NVARCHAR(20)) AS IcTakipNo,
      FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
      t.FirmaKodu,
      ISNULL(t.Durum, '')      AS Durum,
      ISNULL(t.Tur, '')        AS Tur,
      ISNULL(t.Sozlesme, '')   AS Sozlesme,
      ISNULL(t.Olusturan, '')  AS Olusturan,
      ISNULL(f.Firma_Adi, '')  AS FirmaAd
    FROM dbo.Talep t
    LEFT JOIN dbo.Firma f ON f.Kod = t.FirmaKodu
    WHERE t.ID = @id
  `);

  const h = headerRes.recordset[0] as DestekHeader | undefined;
  if (!h) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Destek talebi bulunamadı</h1>
        </div>
        <Link href="/musteriler/destek-talepleri" style={{ color: "var(--color-accent)" }}>← Listeye dön</Link>
      </div>
    );
  }

  // Tür kontrolü: analiz talebi yanlışlıkla bu sayfaya gelirse uygun sayfaya yönlendir
  if (h.Tur && h.Tur !== "Destek") {
    redirect(`/musteriler/talepler/${nid}`);
  }

  const durumCfg = DURUM_COLORS[h.Durum] ?? { color: "#6e6e73", bg: "#f5f5f7" };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <Link href="/musteriler/destek-talepleri" style={{ color: "var(--color-accent)", fontSize: 13, textDecoration: "none" }}>← Listeye dön</Link>
          <h1 className={styles.pageTitle} style={{ marginTop: 6, fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)" }}>
            {h.TalepNoLabel}
          </h1>
          <p className={styles.pageSubtitle} style={{ fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)" }}>
            İç takip: <strong>{h.IcTakipNo}</strong> · Destek Talebi · {h.Tarih}
          </p>
        </div>
        <span style={{
          background: durumCfg.bg, color: durumCfg.color,
          borderRadius: 20, padding: "5px 14px",
          fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
        }}>{h.Durum || "—"}</span>
      </div>

      <Section title="TALEP BİLGİLERİ">
        <Field label="Talep No (dış)" value={h.TalepNoLabel} />
        <Field label="İç Takip No"    value={h.IcTakipNo} />
        <Field label="Tarih"          value={h.Tarih} />
        <Field label="Tür"            value="Destek" />
        <Field label="Durum"          value={h.Durum} />
        <Field label="Firma Kodu"     value={h.FirmaKodu} />
        <Field label="Firma Adı"      value={h.FirmaAd} />
      </Section>

      <TalepKonusma talepId={nid} />
    </div>
  );
}
