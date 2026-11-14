import * as original from "@/app/api/eurolab/validations/[id]/protocol-docx/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function GET(request: import("next/server").NextRequest, context: Parameters<typeof original.GET>[1]) { return uniqueAnalysisRoute(request, "eurolab.validasyon", () => original.GET(request, context)); }
