// Public sayfa — auth gerektirmez. QR koddan ulaşılır.
// Token'ın geçerliliğini /api/rapor-dogrula/[token] ile sorgular.

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface DogrulaResult {
  valid: boolean;
  durum?: string;
  raporNo?: string;
  numuneAd?: string;
  firmaAd?: string;
  raporFormati?: string;
  raporTarihi?: string;
  onayTarihi?: string;
  yayinTarihi?: string;
  onaylayanAd?: string | null;
  error?: string;
}

async function fetchDogrula(token: string, baseUrl: string): Promise<DogrulaResult> {
  try {
    const r = await fetch(`${baseUrl}/api/rapor-dogrula/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    return await r.json();
  } catch {
    return { valid: false, error: "Sunucu erişilemedi" };
  }
}

function formatDt(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(s).slice(0, 19);
    return d.toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" });
  } catch { return String(s); }
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const v = String(s);
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return v.slice(0, 10);
}

export default async function RaporDogrulaPage({ params }: PageProps) {
  const { token } = await params;
  // Server-side fetch — origin gerek. Headers'den al.
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  const baseUrl = `${proto}://${host}`;

  const data = await fetchDogrula(token, baseUrl);

  return (
    <html lang="tr">
      <head>
        <title>Rapor Doğrulama — ÜGD Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          :root { color-scheme: light; }
          body {
            margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
            background: #f5f5f7; color: #1d1d1f; min-height: 100vh;
          }
          .wrap { max-width: 640px; margin: 0 auto; padding: 32px 18px; }
          .card { background: #fff; border-radius: 18px; padding: 28px 24px; box-shadow: 0 6px 24px rgba(0,0,0,0.06); }
          h1 { margin: 0 0 4px; font-size: 1.35rem; }
          .sub { color: #6e6e73; font-size: 0.9rem; margin: 0 0 18px; }
          .badge {
            display: inline-flex; align-items: center; gap: 7px;
            padding: 7px 14px; border-radius: 999px;
            font-weight: 700; font-size: 0.85rem;
          }
          .badge.valid    { background: #34c75920; color: #248a3d; }
          .badge.publish  { background: #0071e320; color: #0055a8; }
          .badge.invalid  { background: #ff3b3020; color: #c00; }
          .row { display: grid; grid-template-columns: 130px 1fr; row-gap: 10px; margin-top: 18px; font-size: 0.92rem; }
          .row .k { color: #6e6e73; }
          .row .v { font-weight: 500; }
          .footer { margin-top: 22px; padding-top: 14px; border-top: 1px solid #e5e5ea; font-size: 0.78rem; color: #6e6e73; text-align: center; }
          .token { font-family: "Courier New", monospace; font-size: 0.75rem; word-break: break-all; color: #8e8e93; }
        `}</style>
      </head>
      <body>
        <div className="wrap">
          <div className="card">
            <h1>Rapor Doğrulama</h1>
            <p className="sub">Karekod ile sorgulanan rapor</p>

            {!data.valid ? (
              <>
                <div className="badge invalid">✕ Geçersiz Rapor</div>
                <p style={{ marginTop: 14, color: "#6e6e73", fontSize: "0.9rem" }}>
                  Bu karekod için kayıtlı bir rapor bulunamadı. Rapor iptal edilmiş veya geri çekilmiş olabilir.
                </p>
                {data.error && (
                  <p style={{ marginTop: 10, color: "#c00", fontSize: "0.8rem" }}>{data.error}</p>
                )}
              </>
            ) : (
              <>
                {data.durum === "Yayınlandı"
                  ? <div className="badge publish">✓ Onaylı &amp; Yayınlanmış Rapor</div>
                  : <div className="badge valid">✓ Onaylı Rapor</div>
                }

                <div className="row">
                  <span className="k">Rapor No</span>
                  <span className="v">{data.raporNo || "—"}</span>
                  <span className="k">Numune</span>
                  <span className="v">{data.numuneAd || "—"}</span>
                  <span className="k">Firma</span>
                  <span className="v">{data.firmaAd || "—"}</span>
                  <span className="k">Rapor Formatı</span>
                  <span className="v">{data.raporFormati || "—"}</span>
                  <span className="k">Rapor Tarihi</span>
                  <span className="v">{formatDate(data.raporTarihi)}</span>
                  <span className="k">Onay Tarihi</span>
                  <span className="v">{formatDt(data.onayTarihi)}</span>
                  {data.onaylayanAd && (
                    <>
                      <span className="k">Onaylayan</span>
                      <span className="v">{data.onaylayanAd}</span>
                    </>
                  )}
                  {data.yayinTarihi && (
                    <>
                      <span className="k">Yayın Tarihi</span>
                      <span className="v">{formatDt(data.yayinTarihi)}</span>
                    </>
                  )}
                </div>
              </>
            )}

            <div className="footer">
              <div>ÜGD Portal · Rapor Doğrulama Servisi</div>
              <div className="token" style={{ marginTop: 6 }}>{token}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
