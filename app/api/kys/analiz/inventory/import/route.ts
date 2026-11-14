import * as original from "@/app/api/eurolab/inventory/import/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function GET(request: import("next/server").NextRequest) { return uniqueAnalysisRoute(request, "eurolab.validasyon", () => original.GET()); }
export async function POST(request: import("next/server").NextRequest) { return uniqueAnalysisRoute(request, "eurolab.validasyon", () => original.POST(request)); }
