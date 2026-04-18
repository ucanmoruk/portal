import { NextResponse } from "next/server";
import poolPromise from "@/lib/db";

// ── GET /api/lab/paketler/[id]/items ─────────────────────────────────────────
// NumuneX4 + StokAnalizListesi join
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id }  = await params;
  const { searchParams } = new URL(request.url);
  const q       = (searchParams.get("q") || "").trim();
  const page    = Math.max(1, parseInt(searchParams.get("sayfa") || "1"));
  const limit   = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "50")));
  const offset  = (page - 1) * limit;

  try {
    const pool = await poolPromise;
    const searchClause = q
      ? `AND (s.Kod LIKE @q OR s.Ad LIKE @q OR s.Matriks LIKE @q)`
      : "";

    const countRes = await pool.request()
      .input("listeId", parseInt(id))
      .input("q", `%${q}%`)
      .query(`
        SELECT COUNT(*) AS toplam
        FROM NumuneX4 x4
        JOIN StokAnalizListesi s ON s.ID = x4.AltAnalizID
        WHERE x4.ListeID = @listeId ${searchClause}
      `);

    const dataRes = await pool.request()
      .input("listeId", parseInt(id))
      .input("q",       `%${q}%`)
      .input("offset",  offset)
      .input("limit",   limit)
      .query(`
        SELECT
          x4.ID, x4.ListeID, x4.AltAnalizID,
          x4.LimitDeger, x4.LimitBirimi, ISNULL(x4.LimitDegerEn, '') AS LimitDegerEn,
          ISNULL(x4.LimitBirimiEn, '') AS LimitBirimiEn, ISNULL(x4.LOQ, '') AS LOQ,
          ISNULL(x4.LOQEn, '') AS LOQEn, x4.Notlar,
          s.Kod, s.Ad, s.Method, s.Matriks,
          s.Akreditasyon, s.Sure, s.Fiyat, s.ParaBirimi
        FROM NumuneX4 x4
        JOIN StokAnalizListesi s ON s.ID = x4.AltAnalizID
        WHERE x4.ListeID = @listeId ${searchClause}
        ORDER BY x4.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return NextResponse.json({
      data:   dataRes.recordset,
      toplam: countRes.recordset[0].toplam,
      sayfa:  page,
      limit,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── POST /api/lab/paketler/[id]/items — hizmet ekle ──────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body          = await request.json();
    const hizmetId      = parseInt(body.hizmetId);
    const limitDeger    = (body.limitDeger    || "").trim() || null;
    const limitBirimi   = (body.limitBirimi   || "").trim() || null;
    const limitDegerEn  = (body.limitDegerEn  || "").trim() || null;
    const limitBirimiEn = (body.limitBirimiEn || "").trim() || null;
    const loq           = (body.loq           || "").trim() || null;
    const loqEn         = (body.loqEn         || "").trim() || null;
    const notlar        = (body.notlar        || "").trim() || null;

    if (!hizmetId) {
      return NextResponse.json({ error: "HizmetID zorunludur." }, { status: 400 });
    }

    const pool = await poolPromise;

    // Aynı hizmet zaten listede mi?
    const existing = await pool.request()
      .input("listeId",  parseInt(id))
      .input("hizmetId", hizmetId)
      .query(`SELECT ID FROM NumuneX4 WHERE ListeID=@listeId AND AltAnalizID=@hizmetId`);

    if (existing.recordset.length > 0) {
      return NextResponse.json({ error: "Bu hizmet zaten listede mevcut." }, { status: 409 });
    }

    const result = await pool.request()
      .input("listeId",      parseInt(id))
      .input("hizmetId",     hizmetId)
      .input("limitDeger",   limitDeger)
      .input("limitBirimi",  limitBirimi)
      .input("limitDegerEn", limitDegerEn)
      .input("limitBirimiEn",limitBirimiEn)
      .input("loq",          loq)
      .input("loqEn",        loqEn)
      .input("notlar",       notlar)
      .query(`
        INSERT INTO NumuneX4
          (ListeID, AltAnalizID, LimitDeger, LimitBirimi, LimitDegerEn, LimitBirimiEn, LOQ, LOQEn, Notlar)
        OUTPUT INSERTED.ID
        VALUES
          (@listeId, @hizmetId, @limitDeger, @limitBirimi, @limitDegerEn, @limitBirimiEn, @loq, @loqEn, @notlar)
      `);

    return NextResponse.json({ id: result.recordset[0].ID }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE /api/lab/paketler/[id]/items — hizmet çıkar ───────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body   = await request.json();
    const itemId = parseInt(body.itemId);   // NumuneX4.ID

    if (!itemId) {
      return NextResponse.json({ error: "itemId zorunludur." }, { status: 400 });
    }

    const pool = await poolPromise;
    await pool.request()
      .input("itemId",  itemId)
      .input("listeId", parseInt(id))
      .query(`DELETE FROM NumuneX4 WHERE ID=@itemId AND ListeID=@listeId`);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── PATCH /api/lab/paketler/[id]/items — limit güncelle ──────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body          = await request.json();
    const itemId        = parseInt(body.itemId);
    const limitDeger    = (body.limitDeger    || "").trim() || null;
    const limitBirimi   = (body.limitBirimi   || "").trim() || null;
    const limitDegerEn  = (body.limitDegerEn  || "").trim() || null;
    const limitBirimiEn = (body.limitBirimiEn || "").trim() || null;
    const loq           = (body.loq           || "").trim() || null;
    const loqEn         = (body.loqEn         || "").trim() || null;
    const notlar        = (body.notlar        || "").trim() || null;

    const pool = await poolPromise;
    await pool.request()
      .input("itemId",        itemId)
      .input("listeId",       parseInt(id))
      .input("limitDeger",    limitDeger)
      .input("limitBirimi",   limitBirimi)
      .input("limitDegerEn",  limitDegerEn)
      .input("limitBirimiEn", limitBirimiEn)
      .input("loq",           loq)
      .input("loqEn",         loqEn)
      .input("notlar",        notlar)
      .query(`
        UPDATE NumuneX4
        SET LimitDeger=@limitDeger, LimitBirimi=@limitBirimi, LimitDegerEn=@limitDegerEn,
            LimitBirimiEn=@limitBirimiEn, LOQ=@loq, LOQEn=@loqEn, Notlar=@notlar
        WHERE ID=@itemId AND ListeID=@listeId
      `);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
