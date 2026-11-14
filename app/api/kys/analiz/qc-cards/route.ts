import * as original from "@/app/api/eurolab/qc-cards/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function GET(request: import("next/server").NextRequest) { return uniqueAnalysisRoute(request, "eurolab.qc-kartlar", () => original.GET(request)); }
export async function POST(request: import("next/server").NextRequest) { return uniqueAnalysisRoute(request, "eurolab.qc-kartlar", () => original.POST(request)); }
export async function DELETE(request: import("next/server").NextRequest) { return uniqueAnalysisRoute(request, "eurolab.qc-kartlar", () => original.DELETE(request)); }
