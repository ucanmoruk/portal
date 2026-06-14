import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cosmoPool } from "@/lib/db";
import Link from "next/link";
import styles from "@/app/styles/table.module.css";

export const metadata = { title: "Talep Detayı" };

interface TalepHeader {
  ID: number;
  TalepNo: number | null;
  DisTalepKodu: string | null;
  TalepNoLabel: string;
  IcTakipNo: string;
  Tarih: string;
  FirmaKodu: string;
  Durum: string;
  Tur: string;
  Sozlesme: string;
  Olusturan: string;
  FirmaAd: string;
  RaporFirma: string;
  RaporAdres: string;
  RaporYetkili: string;
  RaporIletisim: string;
  RaporMail: string;
  Karar: string;
  Dil: string;
  Iade: string;
  UreticiFirma: string;
  Note: string;
  FaturaFirma: string;
  FaturaAdres: string;
  VergiDairesi: string;
  VergiNo: string;
  FaturaMail: string;
}

interface NumuneRow {
  ID: number;
  Numune: string;
  Ozellik: string;
  Analiz: string;
  Metot: string;
}

const DURUM_COLORS: Record<string, { color: string; bg: string }> = {
  "Yeni Talep":        { color: "#9a6700", bg: "#fff3cd" },
  "Numune Bekleniyor": { color: "#9a6700", bg: "#fff3cd" },
  "Analiz Aşamasında": { color: "#0071e3", bg: "#e8f0fe" },
  "Raporlandı":        { color: "#1a7f4b", bg: "#e6f6ee" },
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

export default async function TalepDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const nid = Number(id);
  if (!Number.isFinite(nid)) {
    return <div className={styles.page}><div style={{ padding: 40 }}>Geçersiz talep ID.</div></div>;
  }

  const pool = await cosmoPool;
  const [headerRes, numuneRes] = await Promise.all([
    pool.request().input("id", nid).query(`
      SELECT
        t.ID,
        t.TalepNo,
        t.DisTalepKodu,
        COALESCE(t.DisTalepKodu, N'26' + CAST(t.TalepNo AS NVARCHAR(20))) AS TalepNoLabel,
        N'26' + CAST(t.TalepNo AS NVARCHAR(20)) AS IcTakipNo,
        FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
        t.FirmaKodu,
        t.Durum,
        t.Tur,
        ISNULL(t.Sozlesme, '')   AS Sozlesme,
        ISNULL(t.Olusturan, '')  AS Olusturan,
        ISNULL(f.Firma_Adi, '')  AS FirmaAd,
        ISNULL(r.Firma, '')      AS RaporFirma,
        ISNULL(r.Adres, '')      AS RaporAdres,
        ISNULL(r.Yetkili, '')    AS RaporYetkili,
        ISNULL(r.Iletisim, '')   AS RaporIletisim,
        ISNULL(r.Mail, '')       AS RaporMail,
        ISNULL(r.Karar, '')      AS Karar,
        ISNULL(r.Dil, '')        AS Dil,
        ISNULL(r.Iade, '')       AS Iade,
        ISNULL(r.UreticiFirma,'') AS UreticiFirma,
        ISNULL(r.Note, '')       AS Note,
        ISNULL(fa.Firma, '')         AS FaturaFirma,
        ISNULL(fa.Adres, '')         AS FaturaAdres,
        ISNULL(fa.VergiDairesi, '')  AS VergiDairesi,
        ISNULL(fa.VergiNo, '')       AS VergiNo,
        ISNULL(fa.Mail, '')          AS FaturaMail
      FROM dbo.Talep t
      LEFT JOIN dbo.Firma          f  ON f.Kod = t.FirmaKodu
      LEFT JOIN dbo.TalepRaporlama r  ON r.TalepID = t.ID
      LEFT JOIN dbo.TalepFatura    fa ON fa.TalepID = t.ID
      WHERE t.ID = @id
    `),
    pool.request().input("id", nid).query(`
      SELECT ID,
             ISNULL(Numune, '')  AS Numune,
             ISNULL(Ozellik, '') AS Ozellik,
             ISNULL(Analiz, '')  AS Analiz,
             ISNULL(Metot, '')   AS Metot
      FROM dbo.TalepNumune
      WHERE TalepID = @id
      ORDER BY ID
    `),
  ]);

  const h = headerRes.recordset[0] as TalepHeader | undefined;
  if (!h) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Talep bulunamadı</h1>
        </div>
        <Link href="/musteriler/analiz-talepleri" style={{ color: "var(--color-accent)" }}>← Listeye dön</Link>
      </div>
    );
  }

  // Destek talepleri için ayrı detay sayfası kullanılır (konuşma alanı içerir).
  // Eski URL ile gelinirse oraya yönlendir.
  if (h.Tur === "Destek") {
    redirect(`/musteriler/destek-talepleri/${nid}`);
  }

  const numuneler = numuneRes.recordset as NumuneRow[];
  const durumCfg = DURUM_COLORS[h.Durum] ?? { color: "#6e6e73", bg: "#f5f5f7" };
  const backUrl = "/musteriler/analiz-talepleri";

  return (
    <div className={styles.page}>
      {/* Üst başlık */}
      <div className={styles.pageHeader} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <Link href={backUrl} style={{ color: "var(--color-accent)", fontSize: 13, textDecoration: "none" }}>← Listeye dön</Link>
          <h1 className={styles.pageTitle} style={{ marginTop: 6, fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)" }}>
            {h.TalepNoLabel}
          </h1>
          <p className={styles.pageSubtitle} style={{ fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)" }}>
            İç takip: <strong>{h.IcTakipNo}</strong> · {h.Tur} · {h.Tarih}
          </p>
        </div>
        <span style={{
          background: durumCfg.bg, color: durumCfg.color,
          borderRadius: 20, padding: "5px 14px",
          fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
        }}>{h.Durum}</span>
      </div>

      {/* İçerik */}
      <Section title="TALEP BİLGİLERİ">
        <Field label="Talep No (dış)"   value={h.TalepNoLabel} />
        <Field label="İç Takip No"      value={h.IcTakipNo} />
        <Field label="Tarih"            value={h.Tarih} />
        <Field label="Tür"              value={h.Tur} />
        <Field label="Durum"            value={h.Durum} />
        <Field label="Firma Kodu"       value={h.FirmaKodu} />
        <Field label="Firma Adı"        value={h.FirmaAd} />
        <Field label="Sözleşme"         value={h.Sozlesme} />
        <Field label="Oluşturan"        value={h.Olusturan} />
      </Section>

      <Section title="RAPORLAMA BİLGİLERİ">
        <Field label="Firma"            value={h.RaporFirma} />
        <Field label="Adres"            value={h.RaporAdres} />
        <Field label="Yetkili"          value={h.RaporYetkili} />
        <Field label="İletişim"         value={h.RaporIletisim} />
        <Field label="Rapor gönderilecek mail adresi" value={h.RaporMail} />
        <Field label="Üretici Firma"    value={h.UreticiFirma} />
        <Field label="Karar"            value={h.Karar} />
        <Field label="Rapor Dili"       value={h.Dil} />
        <Field label="Numune İade"      value={h.Iade} />
        <Field label="Not"              value={h.Note} />
      </Section>

      <Section title="FATURA BİLGİLERİ">
        <Field label="Firma"            value={h.FaturaFirma} />
        <Field label="Adres"            value={h.FaturaAdres} />
        <Field label="Vergi Dairesi"    value={h.VergiDairesi} />
        <Field label="Vergi No"         value={h.VergiNo} />
        <Field label="E-posta"          value={h.FaturaMail} />
      </Section>

      <Section title={`NUMUNELER (${numuneler.length})`}>
        {numuneler.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
            Numune kaydı bulunmuyor.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--color-bg-elevated, #fafafa)", textAlign: "left" }}>
                  <th style={{ padding: "8px 10px", fontWeight: 600, borderBottom: "2px solid var(--color-border)" }}>Numune</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, borderBottom: "2px solid var(--color-border)" }}>Özellik</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, borderBottom: "2px solid var(--color-border)" }}>Analiz</th>
                  <th style={{ padding: "8px 10px", fontWeight: 600, borderBottom: "2px solid var(--color-border)" }}>Metot</th>
                </tr>
              </thead>
              <tbody>
                {numuneler.map(n => (
                  <tr key={n.ID}>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border-light)" }}>{n.Numune || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border-light)", color: "var(--color-text-secondary)" }}>{n.Ozellik || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border-light)" }}>{n.Analiz || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border-light)", color: "var(--color-text-secondary)" }}>{n.Metot || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
