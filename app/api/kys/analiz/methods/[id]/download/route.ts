import * as original from "@/app/api/eurolab/methods/[id]/download/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function POST(request: import("next/server").NextRequest, context: Parameters<typeof original.POST>[1]) { return uniqueAnalysisRoute(request, "eurolab.metotlar", () => original.POST(request, context)); }
