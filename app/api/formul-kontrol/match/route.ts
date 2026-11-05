import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FormulaMatchInput, matchUgdFormula } from "@/lib/ugdFormulaMatch";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!await getServerSession(authOptions)) return Response.json({ error: "Yetkisiz" }, { status: 401 });
  try {
    const { items } = FormulaMatchInput.parse(await request.json());
    return Response.json(await matchUgdFormula(items));
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "Formül 1–250 bileşen içermeli; bileşen adlarını ve miktarlarını kontrol edin." : "Bileşen kataloğu okunamadı. Formülünüzü koruyarak tekrar deneyebilirsiniz." }, { status: error instanceof z.ZodError ? 400 : 503 });
  }
}
