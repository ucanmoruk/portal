export const runtime = "nodejs";

import { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import poolPromise from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import { verifyTeklifApprovalToken } from "@/lib/teklifApprovalToken";

type TeklifOnayRow = {
  ID: number;
  TeklifNo: number | null;
  RevNo: number;
  TeklifDurum: string;
  Tarih: string;
  MusteriAd: string;
  MusteriEmail: string;
  MusteriYetkili: string;
};

function escHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function teklifLabel(no: number | null, rev: number) {
  if (!no) return "-";
  const yy = String(no).slice(0, 2);
  const seq = String(no).slice(2).padStart(4, "0");
  return rev > 0 ? `${yy}${seq}/${rev}` : `${yy}${seq}`;
}

async function getTeklif(id: string) {
  const pool = await poolPromise;
  const res = await pool.request()
    .input("ID", Number(id))
    .query(`
      SELECT
        t.ID, t.TeklifNo, t.RevNo, ISNULL(t.TeklifDurum, '') AS TeklifDurum,
        FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
        ISNULL(m.Ad, '') AS MusteriAd,
        ISNULL(m.Email, '') AS MusteriEmail,
        ISNULL(m.Yetkili, '') AS MusteriYetkili
      FROM TeklifX1 t
      LEFT JOIN RootTedarikci m ON m.ID = t.MusteriID
      WHERE t.ID = @ID
    `);
  return res.recordset[0] as TeklifOnayRow | undefined;
}

const isPostgres = Boolean(process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL);

async function ensureLogTable() {
  const pool = await poolPromise;
  if (isPostgres) {
    // Postgres: native syntax. lib/db.ts translator MSSQL "IF NOT EXISTS ... CREATE TABLE"
    // pattern'ini noop olarak skip ediyor; bu yüzden PG için ayrı yazıyoruz.
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS TeklifOnayLog (
        ID SERIAL PRIMARY KEY,
        TeklifID INTEGER NOT NULL,
        TeklifNo VARCHAR(50) NULL,
        Aksiyon VARCHAR(20) NOT NULL,
        Aciklama TEXT NULL,
        IpAdresi VARCHAR(100) NULL,
        UserAgent VARCHAR(500) NULL,
        MusteriAd VARCHAR(255) NULL,
        MusteriEmail VARCHAR(255) NULL,
        MusteriYetkili VARCHAR(255) NULL,
        kullaniciid INTEGER NULL,
        kullaniciad VARCHAR(255) NULL,
        Tarih TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    return;
  }
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TeklifOnayLog]') AND type in (N'U'))
    BEGIN
      CREATE TABLE [dbo].[TeklifOnayLog] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [TeklifID] INT NOT NULL,
        [TeklifNo] NVARCHAR(50) NULL,
        [Aksiyon] NVARCHAR(20) NOT NULL,
        [Aciklama] NVARCHAR(MAX) NULL,
        [IpAdresi] NVARCHAR(100) NULL,
        [UserAgent] NVARCHAR(500) NULL,
        [MusteriAd] NVARCHAR(255) NULL,
        [MusteriEmail] NVARCHAR(255) NULL,
        [MusteriYetkili] NVARCHAR(255) NULL,
        [KullaniciID] INT NULL,
        [KullaniciAd] NVARCHAR(255) NULL,
        [Tarih] DATETIME NOT NULL DEFAULT GETDATE()
      )
    END
  `);
}

function clientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "";
  return req.headers.get("x-real-ip") || "";
}

async function writeLog(req: NextRequest, teklif: TeklifOnayRow, action: "Onaylandı" | "Reddedildi", aciklama: string) {
  await ensureLogTable();
  const pool = await poolPromise;
  await pool.request()
    .input("TeklifID", teklif.ID)
    .input("TeklifNo", teklifLabel(teklif.TeklifNo, teklif.RevNo))
    .input("Aksiyon", action)
    .input("Aciklama", aciklama || null)
    .input("IpAdresi", clientIp(req) || null)
    .input("UserAgent", req.headers.get("user-agent") || null)
    .input("MusteriAd", teklif.MusteriAd || null)
    .input("MusteriEmail", teklif.MusteriEmail || null)
    .input("MusteriYetkili", teklif.MusteriYetkili || null)
    .query(`
      INSERT INTO TeklifOnayLog
        (TeklifID, TeklifNo, Aksiyon, Aciklama, IpAdresi, UserAgent, MusteriAd, MusteriEmail, MusteriYetkili)
      VALUES
        (@TeklifID, @TeklifNo, @Aksiyon, @Aciklama, @IpAdresi, @UserAgent, @MusteriAd, @MusteriEmail, @MusteriYetkili)
    `);
}

function page(title: string, content: string, status = 200) {
  return new Response(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&display=swap" rel="stylesheet">
  <title>${escHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f5f7; color: #1d1d1f; font-family: 'JetBrains Mono','Cascadia Mono',Consolas,'Courier New',monospace; font-size: 12px; line-height: 1.55; }
    main { min-height: 100vh; padding: 28px 14px; display: flex; align-items: center; justify-content: center; }
    .page { width: 760px; max-width: 100%; background: #fff; padding: 46px 42px 34px; box-shadow: 0 14px 42px rgba(0,0,0,.10); }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-bottom: 28px; border-bottom: 1px solid #d6dee8; }
    .logo { height: 45px; width: auto; display: block; }
    .title { font-size: 21px; font-weight: 900; letter-spacing: .8px; padding-top: 13px; text-align: right; }
    .meta { width: 100%; border-collapse: collapse; margin: 22px 0 26px; }
    .meta td { padding: 4px 0; vertical-align: top; }
    .label { font-weight: 800; width: 130px; }
    .box { border: 2px solid #4A46E5; padding: 16px 18px; margin: 20px 0 22px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; margin-top: 22px; }
    button { width: 100%; border: 0; border-radius: 6px; padding: 12px 16px; font: inherit; font-weight: 800; cursor: pointer; }
    .approve { background: #4A46E5; color: #fff; }
    .reject { background: #fff; color: #b42318; border: 1.5px solid #d92d20; }
    textarea { width: 100%; min-height: 96px; resize: vertical; border: 1px solid #cfd6e4; border-radius: 6px; padding: 10px; font: inherit; margin-bottom: 10px; }
    .hint { color: #6e6e73; font-size: 10.5px; margin: 8px 0 0; }
    .footer { display: flex; justify-content: space-between; gap: 14px; margin-top: 34px; padding-top: 16px; border-top: 1px solid #d6dee8; color: #6e6e73; font-size: 9px; }
    @media (max-width: 640px) {
      .page { padding: 30px 22px; }
      .header, .footer { display: block; }
      .title { text-align: left; padding-top: 22px; }
      .actions { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main><section class="page">${content}</section></main>
</body>
</html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function invalidLinkPage() {
  return page("Gecersiz baglanti", `
    <div class="header">
      <img class="logo" src="/unique-logo.png" alt="Unique">
      <div class="title">TEKLİF ONAYI</div>
    </div>
    <div class="box">
      <h1 style="margin:0 0 8px;font-size:18px;color:#b42318;">Bağlantı geçersiz veya süresi dolmuş</h1>
      <p style="margin:0;">Güvenlik nedeniyle teklif bilgileri yalnızca size gönderilen onay bağlantısı ile görüntülenebilir.</p>
    </div>
  `, 403);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || Number.isNaN(Number(id))) return page("Gecersiz teklif", "<h1>Gecersiz teklif baglantisi.</h1>", 400);

  const token = req.nextUrl.searchParams.get("token");
  if (!verifyTeklifApprovalToken(token, id)) return invalidLinkPage();

  const teklif = await getTeklif(id);
  if (!teklif) return page("Teklif bulunamadi", "<h1>Teklif bulunamadi.</h1>", 404);

  const no = teklifLabel(teklif.TeklifNo, teklif.RevNo);
  return page("Teklif Onayi", `
    <div class="header">
      <img class="logo" src="/unique-logo.png" alt="Unique">
      <div class="title">TEKLİF ONAYI</div>
    </div>
    <table class="meta">
      <tr><td class="label">Referans No:</td><td>${escHtml(no)}</td><td style="text-align:right;">${escHtml(teklif.Tarih || "-")}</td></tr>
    </table>
    <div style="font-weight:800;margin-bottom:8px;">Sayin,</div>
    <div style="font-weight:900;">${escHtml(teklif.MusteriAd || "-")}</div>
    ${teklif.MusteriYetkili ? `<div>${escHtml(teklif.MusteriYetkili)}</div>` : ""}
    <div class="box">
      <div><strong>Firma:</strong> ${escHtml(teklif.MusteriAd || "-")}</div>
      <div><strong>Yetkili:</strong> ${escHtml(teklif.MusteriYetkili || "-")}</div>
      <div><strong>Durum:</strong> ${escHtml(teklif.TeklifDurum || "-")}</div>
    </div>
    <p>Bu teklif icin onay verebilir veya revizyon/red talebinizi aciklama ile iletebilirsiniz.</p>
    <div class="actions">
      <form method="POST">
        <input type="hidden" name="token" value="${escHtml(token)}">
        <input type="hidden" name="action" value="approve">
        <button class="approve" type="submit">ONAYLIYORUM</button>
      </form>
      <form method="POST">
        <input type="hidden" name="token" value="${escHtml(token)}">
        <input type="hidden" name="action" value="reject">
        <textarea name="aciklama" placeholder="Red / revizyon aciklamasi" required></textarea>
        <button class="reject" type="submit">RED / REVIZYON TALEBI</button>
      </form>
    </div>
    <p class="hint">Bu islem IP, tarih ve firma bilgisi ile kayit altina alinir.</p>
    <div class="footer"><span>info@uniqueanalyse.com</span><span>F.01.PR.03 - Yayin Tarihi: 27.09.2023</span><span>Sayfa: 1 / 1</span></div>
  `);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || Number.isNaN(Number(id))) return page("Gecersiz teklif", "<h1>Gecersiz teklif baglantisi.</h1>", 400);

  const form = await req.formData();
  const token = String(form.get("token") || "");
  if (!verifyTeklifApprovalToken(token, id)) return invalidLinkPage();

  const action = String(form.get("action") || "approve") === "reject" ? "reject" : "approve";
  const aciklama = String(form.get("aciklama") || "").trim();
  const teklif = await getTeklif(id);
  if (!teklif) return page("Teklif bulunamadi", "<h1>Teklif bulunamadi.</h1>", 404);

  const cfg = await getAllSettings();
  const mailHost = cfg.MAIL_HOST || process.env.MAIL_HOST || "";
  const mailPort = parseInt(cfg.MAIL_PORT || process.env.MAIL_PORT || "587", 10);
  const mailSecure = (cfg.MAIL_SECURE ?? process.env.MAIL_SECURE ?? "false") === "true";
  const mailUser = cfg.MAIL_USER || process.env.MAIL_USER || "";
  const mailPass = cfg.MAIL_PASS || process.env.MAIL_PASS || "";
  const mailFrom = cfg.MAIL_FROM || process.env.MAIL_FROM || mailUser;
  const sirketEmail = cfg.SIRKET_EMAIL || process.env.SIRKET_EMAIL || mailFrom;
  const no = teklifLabel(teklif.TeklifNo, teklif.RevNo);
  const nextStatus = action === "reject" ? "Reddedildi" : "Onaylandı";

  const pool = await poolPromise;
  await pool.request()
    .input("ID", Number(id))
    .input("TeklifDurum", nextStatus)
    .query("UPDATE TeklifX1 SET TeklifDurum = @TeklifDurum WHERE ID = @ID");

  await writeLog(req, teklif, nextStatus as "Onaylandı" | "Reddedildi", aciklama);

  if (mailHost && mailUser && mailPass && sirketEmail) {
    const transporter = nodemailer.createTransport({
      host: mailHost,
      port: mailPort,
      secure: mailSecure,
      auth: { user: mailUser, pass: mailPass },
    });

    const isReject = action === "reject";
    await transporter.sendMail({
      from: mailFrom,
      to: sirketEmail,
      replyTo: teklif.MusteriEmail || undefined,
      subject: `${isReject ? "Teklif Red / Revizyon Talebi" : "Teklif Onayı"} - ${no}`,
      text: `${isReject ? "Teklif icin red/revizyon talebi iletildi." : "Teklifinizi onaylıyorum."}\n\nTeklif: ${no}\nFirma: ${teklif.MusteriAd}\nYetkili: ${teklif.MusteriYetkili}\nE-posta: ${teklif.MusteriEmail}${aciklama ? `\nAciklama: ${aciklama}` : ""}`,
      html: `
        <p><strong>${isReject ? "Teklif icin red/revizyon talebi iletildi." : "Teklifinizi onaylıyorum."}</strong></p>
        <p><strong>Teklif:</strong> ${escHtml(no)}</p>
        <p><strong>Firma:</strong> ${escHtml(teklif.MusteriAd)}</p>
        <p><strong>Yetkili:</strong> ${escHtml(teklif.MusteriYetkili)}</p>
        <p><strong>E-posta:</strong> ${escHtml(teklif.MusteriEmail)}</p>
        ${aciklama ? `<p><strong>Açıklama:</strong><br>${escHtml(aciklama).replace(/\n/g, "<br>")}</p>` : ""}
      `,
    });
  }

  const okTitle = action === "reject" ? "Talep alindi" : "Teklif onaylandı";
  const color = action === "reject" ? "#b42318" : "#15803d";
  const message = action === "reject"
    ? "Red / revizyon talebiniz kayit altına alındı ve bize iletildi."
    : "Teşekkür ederiz. Teklif onayınız kayıt altına alındı ve bize iletildi.";

  return page(okTitle, `
    <div class="header">
      <img class="logo" src="/unique-logo.png" alt="Unique">
      <div class="title">TEKLİF ONAYI</div>
    </div>
    <div class="box">
      <h1 style="margin:0 0 8px;font-size:18px;color:${color};">${escHtml(okTitle)}</h1>
      <p style="margin:0;"><strong>${escHtml(no)}</strong> referanslı teklif icin işleminiz tamamlandı.</p>
      <p style="margin:12px 0 0;">${escHtml(message)}</p>
      ${aciklama ? `<p style="margin:12px 0 0;"><strong>Açıklama:</strong><br>${escHtml(aciklama).replace(/\n/g, "<br>")}</p>` : ""}
    </div>
  `);
}
