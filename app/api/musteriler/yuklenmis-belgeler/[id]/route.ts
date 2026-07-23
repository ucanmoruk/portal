import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

const GECERLI_TUR = new Set(["Rapor", "Sertifika", "Claim", "ÜGDR", "Diğer"]);

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const idNum = parseInt(id, 10);
  if (!Number.isFinite(idNum)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const body = await request.json();
    const raporNo = cleanText(body.raporNo);
    const numuneTur = cleanText(body.numuneTur) || "Diğer";
    const numuneAd = cleanText(body.numuneAd);
    const firmaAd = cleanText(body.firmaAd);
    const proje = cleanText(body.proje);

    if (!GECERLI_TUR.has(numuneTur)) return Response.json({ error: "Belge türü geçersiz." }, { status: 400 });
    if (!numuneAd) return Response.json({ error: "Numune adı zorunludur." }, { status: 400 });

    const pool = await cosmoPool;
    const res = await pool.request()
      .input("id", idNum)
      .input("RaporNo", raporNo)
      .input("NumuneTur", numuneTur)
      .input("NumuneAd", numuneAd)
      .input("FirmaAd", firmaAd)
      .input("Proje", proje)
      .query(`
        UPDATE Rapor
        SET RaporNo = @RaporNo,
            NumuneTur = @NumuneTur,
            NumuneAd = @NumuneAd,
            FirmaAd = @FirmaAd,
            Proje = @Proje
        WHERE ID = @id AND Durum = 'Aktif' AND Yol LIKE 'http%'
      `);
    const affected = res.rowsAffected?.[0] ?? 0;
    if (!affected) return Response.json({ error: "Belge bulunamadı veya düzenlenemez." }, { status: 404 });

    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}

// DELETE /api/musteriler/yuklenmis-belgeler/[id]
// Soft-delete: Durum='Pasif' → belge müşteri portalı "Belgelerim"den kaybolur.
// DB kaydı ve FTP'deki dosya korunur (geri alınabilir).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const idNum = parseInt(id, 10);
  if (!Number.isFinite(idNum)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const pool = await cosmoPool;
    // Yalnızca bu araçla yüklenen (Yol http…) Aktif kayıtları geri çekebiliriz.
    const res = await pool.request()
      .input("id", idNum)
      .query(`
        UPDATE Rapor
        SET Durum = 'Pasif'
        WHERE ID = @id AND Durum = 'Aktif' AND Yol LIKE 'http%'
      `);
    const affected = res.rowsAffected?.[0] ?? 0;
    if (!affected) {
      return Response.json({ error: "Belge bulunamadı veya zaten geri çekilmiş." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
