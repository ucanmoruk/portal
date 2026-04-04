import { NextResponse } from "next/server";
import poolPromise from "@/lib/db";

// ── GET /api/lab/paketler/[id] ────────────────────────────────────────────────
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const pool   = await poolPromise;
    const result = await pool.request()
      .input("id", parseInt(id))
      .query(`
        SELECT x3.ID, x3.ListeAdi, x3.Aciklama, COUNT(x4.ID) AS HizmetSayisi
        FROM NumuneX3 x3
        LEFT JOIN NumuneX4 x4 ON x4.ListeID = x3.ID
        WHERE x3.ID = @id AND x3.Durum = 'Aktif'
        GROUP BY x3.ID, x3.ListeAdi, x3.Aciklama
      `);
    if (!result.recordset[0])
      return NextResponse.json({ error: "Bulunamadı." }, { status: 404 });
    return NextResponse.json(result.recordset[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── PUT /api/lab/paketler/[id] ────────────────────────────────────────────────
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body     = await request.json();
    const listeAdi = (body.listeAdi || "").trim();
    const aciklama = (body.aciklama || "").trim();

    if (!listeAdi)
      return NextResponse.json({ error: "Liste adı zorunludur." }, { status: 400 });

    const pool = await poolPromise;
    await pool.request()
      .input("id",       parseInt(id))
      .input("listeAdi", listeAdi)
      .input("aciklama", aciklama || null)
      .query(`UPDATE NumuneX3 SET ListeAdi=@listeAdi, Aciklama=@aciklama WHERE ID=@id`);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE /api/lab/paketler/[id] → soft delete ───────────────────────────────
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input("id", parseInt(id))
      .query(`UPDATE NumuneX3 SET Durum='Pasif' WHERE ID=@id`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
