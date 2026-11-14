import * as original from "@/app/api/eurolab/methods/[id]/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function GET(request: import("next/server").NextRequest, context: Parameters<typeof original.GET>[1]) { return uniqueAnalysisRoute(request, "eurolab.metotlar", () => original.GET(request, context)); }
export async function PUT(request: import("next/server").NextRequest, context: Parameters<typeof original.PUT>[1]) { return uniqueAnalysisRoute(request, "eurolab.metotlar", () => original.PUT(request, context)); }
export async function DELETE(request: import("next/server").NextRequest, context: Parameters<typeof original.DELETE>[1]) { return uniqueAnalysisRoute(request, "eurolab.metotlar", () => original.DELETE(request, context)); }
