import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import nodemailer from "nodemailer";
import { getAllSettings } from "@/lib/settings";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const pool = await poolPromise;
  const headerRes = await pool.request()
    .input("id", Number(id))
    .query(`
      SELECT p.*, ISNULL(f.Ad, '') AS FirmaAd, ISNULL(f.Email, '') AS FirmaEmail
      FROM ProformaX1 p
      LEFT JOIN RootTedarikci f ON f.ID = p.FirmaID
      WHERE p.ID = @id AND p.SilindiMi = 0
    `);

  if (!headerRes.recordset.length) return Response.json({ error: "Proforma bulunamadı." }, { status: 404 });
  const h = headerRes.recordset[0];
  const to: string[] = Array.isArray(body.to) ? body.to : (body.to ? [body.to] : [h.FirmaEmail].filter(Boolean));
  if (to.length === 0) return Response.json({ error: "Alıcı e-posta bulunamadı." }, { status: 400 });

  const lineRes = await pool.request()
    .input("id", Number(id))
    .query(`SELECT * FROM ProformaX2 WHERE ProformaID = @id ORDER BY ID`);

  const cfg = await getAllSettings();
  const mailHost = cfg.MAIL_HOST || process.env.MAIL_HOST || "";
  const mailPort = parseInt(cfg.MAIL_PORT || process.env.MAIL_PORT || "587");
  const mailSecure = (cfg.MAIL_SECURE ?? process.env.MAIL_SECURE ?? "false") === "true";
  const mailUser = cfg.MAIL_USER || process.env.MAIL_USER || "";
  const mailPass = cfg.MAIL_PASS || process.env.MAIL_PASS || "";
  const mailFrom = cfg.MAIL_FROM || process.env.MAIL_FROM || mailUser;

  if (!mailHost || !mailUser || !mailPass) {
    return Response.json({ error: "Mail ayarları yapılmamış. Admin → Ayarlar bölümünden SMTP bilgilerini girin." }, { status: 500 });
  }

  const rows = lineRes.recordset.map((line: any) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(line.HizmetAdi)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(line.RaporNoListesi || "")}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${fmt(line.Adet)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${fmt(line.BirimFiyat)} ${esc(line.ParaBirimi)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${fmt(line.Tutar)}</td>
    </tr>
  `).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1d1d1f;">
      <h2 style="margin:0 0 8px;">${esc(h.ProformaNo)}</h2>
      <p style="margin:0 0 16px;">${esc(h.FirmaAd)} ${h.EvrakNo ? `- Evrak ${esc(h.EvrakNo)}` : ""}</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f7;">
            <th style="padding:8px;text-align:left;">Hizmet</th>
            <th style="padding:8px;text-align:left;">Raporlar</th>
            <th style="padding:8px;text-align:right;">Adet</th>
            <th style="padding:8px;text-align:right;">Birim</th>
            <th style="padding:8px;text-align:right;">Tutar</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="text-align:right;font-size:16px;"><strong>Genel Toplam: ${fmt(h.GenelToplam)} TRY</strong></p>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    host: mailHost,
    port: mailPort,
    secure: mailSecure,
    auth: { user: mailUser, pass: mailPass },
  });

  await transporter.sendMail({
    from: mailFrom,
    to: to.join(", "),
    subject: body.subject || `Proforma - ${h.ProformaNo}`,
    html,
  });

  await pool.request()
    .input("id", Number(id))
    .query(`UPDATE ProformaX1 SET Durum = 'Gönderildi' WHERE ID = @id AND Durum = 'Taslak'`);

  return Response.json({ success: true });
}

function fmt(value: any) {
  const n = Number(value || 0);
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
