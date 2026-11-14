import * as original from "@/app/api/eurolab/methods/import/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function GET(request: import("next/server").NextRequest) { return uniqueAnalysisRoute(request, "eurolab.metotlar", () => original.GET()); }
export async function POST(request: import("next/server").NextRequest) { return uniqueAnalysisRoute(request, "eurolab.metotlar", () => original.POST(request)); }
