import { type NextRequest } from "next/server";
import { getTcmbForexBuying, normalizeParaBirimi } from "@/lib/tcmbRates";

export async function GET(request: NextRequest) {
  const currency = normalizeParaBirimi(request.nextUrl.searchParams.get("currency"));
  if (!currency || currency === "TRY") {
    return Response.json({ currency: "TRY", rate: null });
  }
  const rate = await getTcmbForexBuying(currency);
  if (!rate) {
    return Response.json({ error: "Kur bulunamadı.", currency }, { status: 404 });
  }
  return Response.json({ currency, rate: rate.forexBuying, name: rate.name });
}
