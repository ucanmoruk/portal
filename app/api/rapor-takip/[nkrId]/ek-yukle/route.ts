import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { isRaporFtpConfigured, uploadRaporPdfToFtp } from "@/lib/raporPdfUpload";
import { getRaporEk, setRaporEk, deleteRaporEk } from "@/lib/raporEk";

export const runtime = "nodejs";
export const maxDuration = 120;

function genToken(): string {
  return randomBytes(18).toString("base64url");
}

function parse(request: NextRequest, id: string) {
  const nkrIdNum = parseInt(id, 10);
  const format = (request.nextUrl.searchParams.get("format") || "").trim();
  return { nkrIdNum, format, ok: Number.isFinite(nkrIdNum) && !!format };
}

// GET  ?format=…  → mevcut Ek-1 (varsa)
export async function GET(request: NextRequest, { params }: { params: Promise<{ nkrId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const { nkrId } = await params;
  const { nkrIdNum, format, ok } = parse(request, nkrId);
  if (!ok) return Response.json({ error: "Geçersiz istek" }, { status: 400 });
  const pool = await cosmoPool;
  const ek = await getRaporEk(pool, nkrIdNum, format);
  return Response.json({ ek });
}

// POST ?format=…  FormData: file (PDF) → FTP + kayıt
export async function POST(request: NextRequest, { params }: { params: Promise<{ nkrId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const userId = ((session.user as any)?.userId ?? null) as number | null;

  const { nkrId } = await params;
  const { nkrIdNum, format, ok } = parse(request, nkrId);
  if (!ok) return Response.json({ error: "Geçersiz istek" }, { status: 400 });

  if (!isRaporFtpConfigured()) {
    return Response.json({ error: "FTP yapılandırılmadı (RAPOR_FTP_* eksik)." }, { status: 503 });
  }

  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Geçersiz form." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Dosya yok." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return Response.json({ error: "Ek-1 yalnızca PDF olabilir." }, { status: 400 });
  }

  try {
    const token = genToken();
    const up = await uploadRaporPdfToFtp({ pdfBuffer: buf, token });
    const pool = await cosmoPool;
    await setRaporEk(pool, nkrIdNum, format, up.publicUrl, token, userId);
    return Response.json({ ok: true, ek: { ekUrl: up.publicUrl, ekToken: token } });
  } catch (e: any) {
    const d = e instanceof Error ? e.message : "Bilinmeyen hata";
    return Response.json({ error: `Ek-1 yüklenemedi: ${d.slice(0, 300)}` }, { status: 502 });
  }
}

// DELETE ?format=…  → Ek-1 kaydını sil (FTP dosyası kalır)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ nkrId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const { nkrId } = await params;
  const { nkrIdNum, format, ok } = parse(request, nkrId);
  if (!ok) return Response.json({ error: "Geçersiz istek" }, { status: 400 });
  const pool = await cosmoPool;
  await deleteRaporEk(pool, nkrIdNum, format);
  return Response.json({ ok: true });
}
