import * as original from "@/app/api/eurolab/methods/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function GET(request: import("next/server").NextRequest) { return uniqueAnalysisRoute(request, "eurolab.metotlar", () => original.GET(request)); }
export async function POST(request: import("next/server").NextRequest) { return uniqueAnalysisRoute(request, "eurolab.metotlar", () => original.POST(request)); }
