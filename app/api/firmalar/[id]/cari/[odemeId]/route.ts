import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

const CARI_TIPLER = new Set(["Gelen Ödeme", "Giden Ödeme"]);

function toNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseIds(id: string, odemeId: string) {
  const firmaId = Number(id);
  const paymentId = Number(odemeId);
  return Number.isInteger(firmaId) && firmaId > 0 && Number.isInteger(paymentId) && paymentId > 0
    ? { firmaId, paymentId }
    : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; odemeId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const { id, odemeId } = await params;
  const parsed = parseIds(id, odemeId);
  if (!parsed) return Response.json({ error: "Geçersiz firma veya ödeme ID" }, { status: 400 });
  try {
    const pool = await cosmoPool;
    const paymentResult = await pool.request().input("FirmaID", parsed.firmaId).input("OdemeID", parsed.paymentId).query(`
      SELECT TOP 1 ID, Tip, Tutar, ParaBirimi, CONVERT(varchar(10), Tarih, 23) AS Tarih,
        ISNULL(OdemeYeri, '') AS OdemeYeri, ISNULL(Aciklama, '') AS Aciklama
      FROM FirmaCariOdeme WHERE ID=@OdemeID AND FirmaID=@FirmaID
    `);
    const payment = paymentResult.recordset?.[0];
    if (!payment) return Response.json({ error: "Manuel ödeme kaydı bulunamadı." }, { status: 404 });
    const allocations = await pool.request().input("OdemeID", parsed.paymentId).query(`
      SELECT FaturaID AS faturaId, Tutar AS tutar FROM FirmaCariOdemeDagitim WHERE OdemeID=@OdemeID ORDER BY ID
    `);
    return Response.json({
      id: Number(payment.ID), tip: payment.Tip, tutar: Number(payment.Tutar || 0),
      paraBirimi: payment.ParaBirimi || "TRY", tarih: payment.Tarih,
      odemeYeri: payment.OdemeYeri || "", aciklama: payment.Aciklama || "",
      dagitimlar: allocations.recordset || [],
    });
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Ödeme ayrıntıları alınamadı." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; odemeId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id, odemeId } = await params;
  const parsed = parseIds(id, odemeId);
  if (!parsed) {
    return Response.json({ error: "Geçersiz firma veya ödeme ID" }, { status: 400 });
  }
  const { firmaId, paymentId } = parsed;

  try {
    const body = await request.json();
    const tip = String(body.tip || "").trim();
    const tutar = toNumber(body.tutar);
    const paraBirimi = String(body.paraBirimi || "TRY").trim().toUpperCase() || "TRY";
    const tarih = String(body.tarih || "").trim();
    const odemeYeri = clean(body.odemeYeri);
    const aciklama = clean(body.aciklama);
    const dagitimlar = Array.isArray(body.dagitimlar)
      ? body.dagitimlar.map((item: { faturaId?: unknown; tutar?: unknown }) => ({ faturaId: Number(item.faturaId), tutar: toNumber(item.tutar) })).filter((item: { faturaId: number; tutar: number }) => Number.isInteger(item.faturaId) && item.faturaId > 0 && item.tutar > 0)
      : [];
    if (new Set(dagitimlar.map((item: { faturaId: number }) => item.faturaId)).size !== dagitimlar.length) {
      return Response.json({ error: "Aynı fatura birden fazla kez dağıtıma eklenemez." }, { status: 400 });
    }
    const dagitimToplami = dagitimlar.reduce((sum: number, item: { tutar: number }) => sum + item.tutar, 0);

    if (!CARI_TIPLER.has(tip)) return Response.json({ error: "Ödeme tipi geçersiz." }, { status: 400 });
    if (tutar <= 0) return Response.json({ error: "Ödeme tutarı sıfırdan büyük olmalı." }, { status: 400 });
    if (!tarih) return Response.json({ error: "Ödeme tarihi zorunludur." }, { status: 400 });
    if (dagitimlar.length && (tip !== "Gelen Ödeme" || !["TRY", "TL"].includes(paraBirimi))) return Response.json({ error: "Yalnızca TRY gelen ödemeleri faturalara mahsup edilebilir." }, { status: 400 });
    if (dagitimToplami > tutar + 0.005) return Response.json({ error: "Faturalara dağıtılan tutar, ödeme tutarını aşamaz." }, { status: 400 });

    const pool = await cosmoPool;
    const tx = await pool.transaction();
    await tx.begin();
    try {
    const current = await tx.request()
      .input("OdemeID", paymentId)
      .input("FirmaID", firmaId)
      .query(`
        SELECT TOP 1 o.ID,
          ISNULL((SELECT SUM(d.Tutar) FROM FirmaCariOdemeDagitim d WHERE d.OdemeID=o.ID), 0) AS MahsupTutar
        FROM FirmaCariOdeme o
        WHERE o.ID=@OdemeID AND o.FirmaID=@FirmaID
      `);
    const payment = current.recordset?.[0];
    if (!payment) {
      await tx.rollback();
      return Response.json({ error: "Manuel ödeme kaydı bulunamadı." }, { status: 404 });
    }

    const oldAllocationResult = await tx.request().input("OdemeID", paymentId).query("SELECT FaturaID FROM FirmaCariOdemeDagitim WHERE OdemeID=@OdemeID");
    const affectedInvoiceIds = new Set<number>((oldAllocationResult.recordset || []).map((row: { FaturaID: number }) => Number(row.FaturaID)));
    for (const item of dagitimlar) {
      affectedInvoiceIds.add(item.faturaId);
      const invoiceResult = await tx.request().input("FaturaID", item.faturaId).input("FirmaID", firmaId).input("OdemeID", paymentId).query(`
        SELECT TOP 1 f.ID, ISNULL(f.Toplam,0) AS Toplam, ISNULL(f.Odenen_Tutar,0) AS OdenenTutar,
          ISNULL((SELECT SUM(d.Tutar) FROM FirmaCariOdemeDagitim d WHERE d.FaturaID=f.ID AND d.OdemeID<>@OdemeID),0) AS DigerMahsup
        FROM Fatura f WHERE f.ID=@FaturaID AND f.Durum='Aktif' AND (
          f.FaturaFirmaID=@FirmaID OR (f.FaturaFirmaID IS NULL AND EXISTS (
            SELECT 1 FROM ProformaBaslik p WHERE p.SilindiMi=0 AND p.FirmaID=@FirmaID AND p.EvrakNo=f.ProformaNo
          ))
        )
      `);
      const invoice = invoiceResult.recordset?.[0];
      if (!invoice) throw new Error("Mahsup edilecek fatura bulunamadı veya bu firmaya ait değil.");
      const available = Math.max(0, Number(invoice.Toplam || 0) - Number(invoice.OdenenTutar || 0) - Number(invoice.DigerMahsup || 0));
      if (item.tutar > available + 0.005) throw new Error(`Fatura için girilen mahsup tutarı kullanılabilir ${available.toFixed(2)} TRY tutarını aşıyor.`);
    }

    await tx.request().input("OdemeID", paymentId).query("DELETE FROM FirmaCariOdemeDagitim WHERE OdemeID=@OdemeID");
    for (const item of dagitimlar) {
      await tx.request().input("OdemeID", paymentId).input("FaturaID", item.faturaId).input("Tutar", Number(item.tutar.toFixed(2))).query("INSERT INTO FirmaCariOdemeDagitim (OdemeID,FaturaID,Tutar) VALUES (@OdemeID,@FaturaID,@Tutar)");
    }

    await tx.request()
      .input("OdemeID", paymentId)
      .input("FirmaID", firmaId)
      .input("Tip", tip)
      .input("Tutar", Number(tutar.toFixed(2)))
      .input("ParaBirimi", paraBirimi)
      .input("Tarih", tarih)
      .input("OdemeYeri", odemeYeri)
      .input("Aciklama", aciklama)
      .query(`
        UPDATE FirmaCariOdeme
        SET Tip=@Tip, Tutar=@Tutar, ParaBirimi=@ParaBirimi, Tarih=@Tarih,
            OdemeYeri=@OdemeYeri, Aciklama=@Aciklama
        WHERE ID=@OdemeID AND FirmaID=@FirmaID
      `);

    for (const faturaId of affectedInvoiceIds) {
      const invoiceState = await tx.request().input("FaturaID", faturaId).query(`
        SELECT TOP 1 f.ProformaNo, ISNULL(f.Toplam,0) AS Toplam, ISNULL(f.Odenen_Tutar,0) AS OdenenTutar,
          ISNULL((SELECT SUM(d.Tutar) FROM FirmaCariOdemeDagitim d WHERE d.FaturaID=f.ID),0) AS Mahsup
        FROM Fatura f WHERE f.ID=@FaturaID
      `);
      const invoice = invoiceState.recordset?.[0];
      if (!invoice) continue;
      const paid = Number(invoice.OdenenTutar || 0) + Number(invoice.Mahsup || 0);
      const nextStatus = paid >= Number(invoice.Toplam || 0) - 0.005 ? "Ödendi" : paid > 0.005 ? "Kısmen Ödendi" : "Ödeme Bekliyor";
      await tx.request().input("EvrakNo", invoice.ProformaNo || null).input("OdemeDurumu", nextStatus).input("FaturaID", faturaId).query("INSERT INTO Odeme (Evrak_No,Odeme_Durumu,Fatura_ID,Tarih) VALUES (@EvrakNo,@OdemeDurumu,@FaturaID,GETDATE())");
    }

    await tx.commit();
    return Response.json({ success: true, mahsupEdilen: Number(dagitimToplami.toFixed(2)) });
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Ödeme güncellenemedi." }, { status: 500 });
  }
}
