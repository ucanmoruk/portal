import * as XLSX from "xlsx";
import { cosmoPool } from "@/lib/db";
import { getPortalUser } from "@/lib/portalYetki";
import { importChallengeSheet, isChallengeFormat } from "@/lib/challengeImport";
import { loadChallengeData, saveChallengeData } from "@/lib/challengeData";

export const runtime = "nodejs";
type Context = { params: Promise<{ nkrId: string }> };
const fail = (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Challenge verisi işlenemedi." }, { status: 400 });
async function access(context: Context, write: boolean) {
  const user = await getPortalUser();
  if (!user) return { error: Response.json({ error: "Yetkisiz erişim" }, { status: 401 }) };
  if (!(user.can("laboratuvar.numune-takip-lab") || user.can("laboratuvar.sonuc-giris") || (!write && user.can("laboratuvar.rapor-takip")))) return { error: Response.json({ error: "Sonuç giriş yetkiniz yok." }, { status: 403 }) };
  const id = Number((await context.params).nkrId);
  if (!Number.isSafeInteger(id) || id <= 0) return { error: fail(new Error("Geçersiz numune.")) };
  return { user, id };
}
export async function GET(request: Request, context: Context) {
  const auth = await access(context, false); if (auth.error) return auth.error;
  if (!isChallengeFormat(new URL(request.url).searchParams.get("format") || "")) return fail(new Error("Yalnızca Challenge formatında kullanılabilir."));
  try { return Response.json({ veri: await loadChallengeData(await cosmoPool, auth.id!) }); } catch (error) { return fail(error); }
}
// Preview only: Excel is parsed without saving results or sending for approval.
export async function POST(request: Request, context: Context) {
  const auth = await access(context, true); if (auth.error) return auth.error;
  try {
    const form = await request.formData();
    if (!isChallengeFormat(String(form.get("format") || ""))) throw new Error("Yalnızca Challenge formatında kullanılabilir.");
    const file = form.get("file");
    if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024) throw new Error("En fazla 10 MB boyutunda .xlsx dosyası seçin.");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellText: true, cellFormula: true });
    if (workbook.SheetNames.length > 50) throw new Error("Dosyada en fazla 50 çalışma sayfası olabilir.");
    const sheets = workbook.SheetNames.filter(name => !workbook.Workbook?.Sheets?.find(sheet => sheet.name === name)?.Hidden).map(name => {
      try { return { name, veri: importChallengeSheet(workbook.Sheets[name], file.name, name) }; }
      catch (error) { return { name, error: error instanceof Error ? error.message : "Sayfa okunamadı." }; }
    });
    if (!sheets.some(sheet => sheet.veri)) throw new Error(sheets[0]?.error || "Challenge formu bulunamadı.");
    return Response.json({ sheets });
  } catch (error) { return fail(error); }
}
export async function PUT(request: Request, context: Context) {
  const auth = await access(context, true); if (auth.error) return auth.error;
  try {
    const body = await request.json();
    if (!isChallengeFormat(String(body.format || ""))) throw new Error("Yalnızca Challenge formatında kullanılabilir.");
    if (typeof body.onayaGonder !== "boolean") throw new Error("Kayıt işlemi geçersiz.");
    return Response.json(await saveChallengeData(await cosmoPool, auth.id!, body.veri, auth.user!.userId, body.onayaGonder));
  } catch (error) { return fail(error); }
}
