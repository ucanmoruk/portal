import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erisim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (Number.isNaN(nkrIdNum)) return Response.json({ error: "Gecersiz ID" }, { status: 400 });

  try {
    const body = await request.json().catch(() => ({}));
    const format = String(body?.format || "").trim();
    const rawDurum = String(body?.durum || "Tamamlandı").trim();
    const durum = rawDurum === "Tamamlandi" ? "Tamamlandı" : rawDurum;
    const allowed = new Set(["Bekliyor", "Devam Ediyor", "Tamamlandı"]);

    if (!format) return Response.json({ error: "Rapor formati zorunlu" }, { status: 400 });
    if (!allowed.has(durum)) return Response.json({ error: "Gecersiz durum" }, { status: 400 });

    const pool = await poolPromise;

    await pool.request().query(`
      CREATE TABLE NKR_RaporDurumOverride (
        NkrID INT NOT NULL,
        RaporFormati NVARCHAR(100) NOT NULL,
        Durum NVARCHAR(50) NOT NULL,
        UpdatedAt DATETIME NOT NULL,
        PRIMARY KEY (NkrID, RaporFormati)
      )
    `).catch(() => undefined);

    await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .input("durum", durum)
      .query(`
        DELETE FROM NKR_RaporDurumOverride
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'));

        INSERT INTO NKR_RaporDurumOverride (NkrID, RaporFormati, Durum, UpdatedAt)
        VALUES (@nkrId, @format, @durum, GETDATE());
      `);

    return Response.json({ ok: true, durum });
  } catch (e: any) {
    return Response.json({ error: e.message || "Durum guncellenemedi" }, { status: 500 });
  }
}
