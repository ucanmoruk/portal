import * as original from "@/app/api/eurolab/validations/[id]/excel-import/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function POST(request: import("next/server").NextRequest, context: Parameters<typeof original.POST>[1]) { return uniqueAnalysisRoute(request, "eurolab.validasyon", () => original.POST(request, context)); }
