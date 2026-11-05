export const runtime = "nodejs";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadLiveReport, saveLiveReport } from "@/lib/ugdLiveReportStore";
import { restoreLiveReportSections } from "@/lib/ugdLiveReport";
const keySchema = z.object({ source: z.enum(["lab", "ugd"]), recordId: z.coerce.number().int().positive(), language: z.enum(["tr", "en", "cpsr"]), profile: z.enum(["lab", "ugd"]) });
const saveSchema = keySchema.extend({ headHtml: z.string().max(2000000).default(""), bodyHtml: z.string().max(16000000).default(""), sections: z.array(z.object({ key: z.string().max(100), title: z.string().max(300), html: z.string().max(16000000) })).max(30).default([]) });
export async function GET(request: Request) {
  if (!await getServerSession(authOptions)) return Response.json({ error: "Yetkisiz" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams, source = params.get("source") || "ugd";
    const key = keySchema.parse({ source, recordId: params.get("recordId"), language: params.get("language") || "tr", profile: params.get("profile") || source });
    const item = await loadLiveReport(key);
    return Response.json({ item: item && params.get("compact") !== "1" ? { ...item, sections: restoreLiveReportSections(item.bodyHtml, item.sections) } : item }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof z.ZodError ? "Geçersiz rapor kaydı." : "Canlı rapor kaydı okunamadı." }, { status: error instanceof z.ZodError ? 400 : 500 }); }
}
export async function POST(request: Request) {
  if (!await getServerSession(authOptions)) return Response.json({ error: "Yetkisiz" }, { status: 401 });
  try {
    const body = await request.json(), source = body.source || "ugd";
    const input = saveSchema.parse({ ...body, source, profile: body.profile || source, language: body.language || "tr" });
    if (!(input.bodyHtml || input.sections.map(s => s.html).join("")).trim()) return Response.json({ error: "Kaydedilecek içerik bulunamadı." }, { status: 400 });
    await saveLiveReport(input, input.headHtml, input.sections, input.bodyHtml);
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof z.ZodError ? "Geçersiz rapor içeriği." : "Canlı rapor kaydedilemedi. Tekrar deneyin." }, { status: error instanceof z.ZodError ? 400 : 500 }); }
}
