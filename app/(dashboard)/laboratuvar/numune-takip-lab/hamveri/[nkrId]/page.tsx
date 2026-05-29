import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import styles from "@/app/styles/table.module.css";
import Link from "next/link";

export const metadata = {
  title: "Numune Hamveri — ÜGD Portal",
};

interface PageProps {
  params: Promise<{ nkrId: string }>;
  searchParams?: Promise<{ format?: string }>;
}

async function fetchNumune(id: number) {
  try {
    const pool = await poolPromise;
    const r = await pool.request()
      .input("id", id)
      .query(`
        SELECT n.ID, n.Tarih, n.Evrak_No, n.RaporNo, n.Numune_Adi,
               ISNULL(f.Ad, '') AS FirmaAd
        FROM NKR n
        LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
        WHERE n.ID = @id AND n.Durum = 'Aktif'
      `);
    return r.recordset[0] ?? null;
  } catch {
    return null;
  }
}

export default async function NumuneHamveriPage({ params, searchParams }: PageProps) {
  await getServerSession(authOptions);

  const { nkrId } = await params;
  const sp = searchParams ? await searchParams : {};
  const format = sp.format || "";

  const id = parseInt(nkrId, 10);
  const numune = Number.isFinite(id) ? await fetchNumune(id) : null;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Numune Hamveri</h1>
          <p className={styles.pageSubtitle}>
            {numune
              ? `Rapor No: ${numune.RaporNo || "—"}  ·  ${numune.Numune_Adi || ""}`
              : `Kayıt bulunamadı (ID: ${nkrId})`}
            {format ? ` · ${format}` : ""}
          </p>
        </div>
        <Link href="/laboratuvar/numune-takip-lab" className={styles.editBtn}>
          ← Numune Takip'e dön
        </Link>
      </div>

      {numune && (
        <div className={styles.tableCard} style={{ padding: 20 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 8,
            fontSize: "0.85rem", marginBottom: 20,
          }}>
            <span style={{ color: "var(--color-text-secondary)" }}>Tarih</span>
            <span>{numune.Tarih ? String(numune.Tarih).slice(0, 10).split("-").reverse().join(".") : "—"}</span>
            <span style={{ color: "var(--color-text-secondary)" }}>Evrak No</span>
            <span>{numune.Evrak_No || "—"}</span>
            <span style={{ color: "var(--color-text-secondary)" }}>Rapor No</span>
            <span style={{ fontWeight: 600 }}>{numune.RaporNo || "—"}</span>
            <span style={{ color: "var(--color-text-secondary)" }}>Numune</span>
            <span>{numune.Numune_Adi || "—"}</span>
            <span style={{ color: "var(--color-text-secondary)" }}>Firma</span>
            <span>{numune.FirmaAd || "—"}</span>
            {format && (
              <>
                <span style={{ color: "var(--color-text-secondary)" }}>Rapor Formatı</span>
                <span>{format}</span>
              </>
            )}
          </div>

          <div style={{
            padding: "32px 24px", background: "var(--color-surface-2)",
            border: "1px dashed var(--color-border)", borderRadius: 12,
            textAlign: "center", color: "var(--color-text-tertiary)",
            fontSize: "0.9rem", lineHeight: 1.6,
          }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: 6, color: "var(--color-text-secondary)" }}>
              Hamveri formatı yakında tasarlanacak
            </div>
            Bu sayfa şimdilik boş. Numuneye ait hamveri raporu burada görüntülenecek
            ve PDF olarak indirilebilir olacak.
          </div>
        </div>
      )}
    </div>
  );
}
