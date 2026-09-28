import nodemailer from "nodemailer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import { laboratoryMailBrand, renderLaboratoryMail } from "@/lib/laboratuvarMailTemplate";
import { existsSync } from "node:fs";
import path from "node:path";

type MailRow = { tarih: string | null; vade: string | null; belgeNo: string; tur: string; durum: string; tutar: number; odenen: number; acik: number; aciklama: string };
const money = (value: unknown) => Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: unknown) => { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[3]}.${match[2]}.${match[1]}` : "-"; };
const addresses = (value: unknown) => String(value || "").split(/[;,]/).map(item => item.trim()).filter(Boolean);

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const body = await request.json();
    const mode = body.mode === "fatura" ? "fatura" : "firma";
    const firmaId = Number(body.firmaId || 0);
    const faturaId = Number(body.faturaId || 0);
    const to = addresses(body.to);
    const cc = addresses(body.cc);
    if (!to.length) return Response.json({ error: "Alıcı e-posta adresi zorunludur." }, { status: 400 });
    if (mode === "fatura" && !faturaId) return Response.json({ error: "Geçersiz fatura." }, { status: 400 });
    if (mode === "firma" && !firmaId) return Response.json({ error: "Geçersiz firma." }, { status: 400 });

    const pool = await cosmoPool;
    const statusExpr = `COALESCE(
      (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Fatura_ID=f.ID AND ISNULL(o.Odeme_Durumu,N'')<>N'Proforma' ORDER BY o.ID DESC),
      (SELECT TOP 1 o.Odeme_Durumu FROM Odeme o WHERE o.Evrak_No=f.ProformaNo AND o.Fatura_ID IS NULL AND ISNULL(o.Odeme_Durumu,N'')<>N'Proforma' ORDER BY o.ID DESC),
      N'Ödeme Bekliyor')`;
    const mahsupExpr = `ISNULL((SELECT SUM(d.Tutar) FROM FirmaCariOdemeDagitim d WHERE d.FaturaID=f.ID),0)`;
    const invoiceRequest = pool.request();
    if (mode === "fatura") invoiceRequest.input("faturaId", faturaId);
    else invoiceRequest.input("firmaId", firmaId);
    const invoiceResult = await invoiceRequest.query(`
      SELECT f.ID, f.Fatura_No AS FaturaNo, CONVERT(varchar(10),f.Tarih,23) AS Tarih, CONVERT(varchar(10),f.VadeTarihi,23) AS VadeTarihi,
        ISNULL(f.Toplam,0) AS Tutar, ISNULL(f.Odenen_Tutar,0) AS DirektOdenen, ${mahsupExpr} AS Mahsup,
        ${statusExpr} AS OdemeDurumu, ISNULL(f.Aciklama,'') AS Aciklama,
        f.FaturaFirmaID AS FirmaID, COALESCE(NULLIF(fr.Firma_Adi,''),NULLIF(f.FirmaAdManuel,''),'') AS FirmaAd,
        ISNULL(fr.Mail,'') AS FirmaEmail
      FROM Fatura f LEFT JOIN Firma fr ON fr.ID=f.FaturaFirmaID
      WHERE f.Durum='Aktif' AND ${mode === "fatura" ? "f.ID=@faturaId" : `(f.FaturaFirmaID=@firmaId OR (f.FaturaFirmaID IS NULL AND EXISTS (
        SELECT 1 FROM ProformaBaslik p WHERE p.SilindiMi=0 AND p.FirmaID=@firmaId AND p.EvrakNo=f.ProformaNo
      )))`}
      ORDER BY f.Tarih DESC, f.ID DESC`);
    if (mode === "fatura" && !invoiceResult.recordset.length) return Response.json({ error: "Fatura bulunamadı." }, { status: 404 });

    let firmaAd = String(invoiceResult.recordset[0]?.FirmaAd || body.firmaAd || "Müşteri");
    if (mode === "firma") {
      const firm = await pool.request().input("firmaId", firmaId).query("SELECT TOP 1 Firma_Adi AS FirmaAd,ISNULL(Mail,'') AS FirmaEmail FROM Firma WHERE ID=@firmaId");
      if (!firm.recordset.length) return Response.json({ error: "Firma bulunamadı." }, { status: 404 });
      firmaAd = String(firm.recordset[0].FirmaAd || firmaAd);
    }

    const rows: MailRow[] = invoiceResult.recordset.map((item: Record<string, unknown>) => {
      const tutar = Number(item.Tutar || 0); const odenen = Math.min(tutar, Number(item.DirektOdenen || 0) + Number(item.Mahsup || 0));
      const durum = String(item.OdemeDurumu || "Ödeme Bekliyor");
      return { tarih: String(item.Tarih || "") || null, vade: String(item.VadeTarihi || "") || null, belgeNo: String(item.FaturaNo || ""), tur: "Fatura", durum, tutar, odenen, acik: durum === "Ödendi" || durum === "İptal" ? 0 : Math.max(0, tutar - odenen), aciklama: String(item.Aciklama || "") };
    });

    if (mode === "firma") {
      const paymentResult = await pool.request().input("firmaId", firmaId).query(`SELECT CONVERT(varchar(10),Tarih,23) AS Tarih,ID,Tip,Tutar,ISNULL(ParaBirimi,'TRY') AS ParaBirimi,ISNULL(Aciklama,'') AS Aciklama FROM FirmaCariOdeme WHERE FirmaID=@firmaId ORDER BY Tarih DESC,ID DESC`);
      rows.push(...paymentResult.recordset.map((item: Record<string, unknown>) => ({ tarih: String(item.Tarih || "") || null, vade: null, belgeNo: `Ödeme #${item.ID}`, tur: "Ödeme", durum: String(item.Tip || "Ödeme"), tutar: Number(item.Tutar || 0), odenen: String(item.Tip) === "Gelen Ödeme" ? Number(item.Tutar || 0) : 0, acik: 0, aciklama: String(item.Aciklama || "") })));
      rows.sort((a, b) => String(b.tarih || "").localeCompare(String(a.tarih || "")));
    }

    const invoices = rows.filter(row => row.tur === "Fatura");
    const total = invoices.reduce((sum, row) => sum + row.tutar, 0);
    const paid = invoices.reduce((sum, row) => sum + row.odenen, 0);
    const open = invoices.reduce((sum, row) => sum + row.acik, 0);
    const cfg = await getAllSettings();
    const html = renderLaboratoryMail({
      brand: laboratoryMailBrand(cfg),
      title: mode === "fatura" ? "Fatura Bilgilendirmesi" : "Cari Hesap Ekstresi",
      message: String(body.message || ""),
      intro: `${firmaAd} için ${mode === "fatura" ? "fatura" : "güncel cari hesap"} bilgileri:`,
      headings: ["Tarih", "Vade", "Belge No", "Tür", "Durum", "Tutar", "Açık"],
      rows: rows.map(row => [date(row.tarih), date(row.vade), row.belgeNo, row.tur, row.durum, `${money(row.tutar)} TL`, row.tur === "Fatura" ? `${money(row.acik)} TL` : "-"]),
      summary: [{ label: "Fatura Toplamı", value: `${money(total)} TL` }, { label: "Ödenen", value: `${money(paid)} TL` }, { label: "Açık Bakiye", value: `${money(open)} TL` }],
      note: `Bu bildirim ${new Date().toLocaleDateString("tr-TR")} tarihindeki güncel kayıtlara göre hazırlanmıştır.`,
    });
    const host = (cfg.MAIL_HOST || process.env.MAIL_HOST || "").trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, ""); const user = (cfg.MAIL_USER || process.env.MAIL_USER || "").trim(); const pass = cfg.MAIL_PASS || process.env.MAIL_PASS || "";
    if (!host || !user || !pass) return Response.json({ error: "Mail ayarları yapılmamış. Admin → Ayarlar bölümünden SMTP bilgilerini girin." }, { status: 500 });
    const transporter = nodemailer.createTransport({ host, port: Number(cfg.MAIL_PORT || process.env.MAIL_PORT || 587), secure: (cfg.MAIL_SECURE ?? process.env.MAIL_SECURE ?? "false") === "true", auth: { user, pass } });
    const logoPath = path.join(process.cwd(), "public", "unique-logo.png");
    await transporter.sendMail({ from: cfg.MAIL_FROM || process.env.MAIL_FROM || user, to: to.join(", "), cc: cc.length ? cc.join(", ") : undefined, subject: String(body.subject || (mode === "fatura" ? "Fatura Bilgilendirmesi" : "Cari Hesap Ekstresi")), html, attachments: existsSync(logoPath) ? [{ filename: "unique-logo.png", path: logoPath, cid: "unique-logo" }] : [] });
    return Response.json({ success: true });
  } catch (cause) {
    console.error("[cari-mail]", cause);
    return Response.json({ error: cause instanceof Error ? cause.message : "E-posta gönderilemedi." }, { status: 500 });
  }
}
