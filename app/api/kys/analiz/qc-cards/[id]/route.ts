import * as original from "@/app/api/eurolab/qc-cards/[id]/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function GET(request: import("next/server").NextRequest, context: Parameters<typeof original.GET>[1]) { return uniqueAnalysisRoute(request, "eurolab.qc-kartlar", () => original.GET(request, context)); }
export async function POST(request: import("next/server").NextRequest, context: Parameters<typeof original.POST>[1]) { return uniqueAnalysisRoute(request, "eurolab.qc-kartlar", () => original.POST(request, context)); }
export async function PATCH(request: import("next/server").NextRequest, context: Parameters<typeof original.PATCH>[1]) { return uniqueAnalysisRoute(request, "eurolab.qc-kartlar", () => original.PATCH(request, context)); }
export async function DELETE(request: import("next/server").NextRequest, context: Parameters<typeof original.DELETE>[1]) { return uniqueAnalysisRoute(request, "eurolab.qc-kartlar", () => original.DELETE(request, context)); }
