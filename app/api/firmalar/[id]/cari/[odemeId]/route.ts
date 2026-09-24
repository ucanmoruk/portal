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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; odemeId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id, odemeId } = await params;
  const firmaId = Number(id);
  const paymentId = Number(odemeId);
  if (!Number.isInteger(firmaId) || firmaId <= 0 || !Number.isInteger(paymentId) || paymentId <= 0) {
    return Response.json({ error: "Geçersiz firma veya ödeme ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const tip = String(body.tip || "").trim();
    const tutar = toNumber(body.tutar);
    const paraBirimi = String(body.paraBirimi || "TRY").trim().toUpperCase() || "TRY";
    const tarih = String(body.tarih || "").trim();
    const odemeYeri = clean(body.odemeYeri);
    const aciklama = clean(body.aciklama);

    if (!CARI_TIPLER.has(tip)) return Response.json({ error: "Ödeme tipi geçersiz." }, { status: 400 });
    if (tutar <= 0) return Response.json({ error: "Ödeme tutarı sıfırdan büyük olmalı." }, { status: 400 });
    if (!tarih) return Response.json({ error: "Ödeme tarihi zorunludur." }, { status: 400 });

    const pool = await cosmoPool;
    const current = await pool.request()
      .input("OdemeID", paymentId)
      .input("FirmaID", firmaId)
      .query(`
        SELECT TOP 1 o.ID,
          ISNULL((SELECT SUM(d.Tutar) FROM FirmaCariOdemeDagitim d WHERE d.OdemeID=o.ID), 0) AS MahsupTutar
        FROM FirmaCariOdeme o
        WHERE o.ID=@OdemeID AND o.FirmaID=@FirmaID
      `);
    const payment = current.recordset?.[0];
    if (!payment) return Response.json({ error: "Manuel ödeme kaydı bulunamadı." }, { status: 404 });

    const allocated = Number(payment.MahsupTutar || 0);
    if (allocated > 0 && tip !== "Gelen Ödeme") {
      return Response.json({ error: "Mahsuplaştırılmış bir tahsilat giden ödemeye çevrilemez." }, { status: 400 });
    }
    if (tutar + 0.005 < allocated) {
      return Response.json({ error: `Tutar, mahsup edilmiş ${allocated.toFixed(2)} TRY tutarından düşük olamaz.` }, { status: 400 });
    }

    await pool.request()
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

    return Response.json({ success: true });
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Ödeme güncellenemedi." }, { status: 500 });
  }
}
