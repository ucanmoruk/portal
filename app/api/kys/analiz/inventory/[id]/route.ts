import * as original from "@/app/api/eurolab/inventory/[id]/route";
import { uniqueAnalysisRoute } from "@/lib/uniqueAnalysisRoute";
export async function PUT(request: import("next/server").NextRequest, context: Parameters<typeof original.PUT>[1]) { return uniqueAnalysisRoute(request, "eurolab.validasyon", () => original.PUT(request, context)); }
export async function DELETE(request: import("next/server").NextRequest, context: Parameters<typeof original.DELETE>[1]) { return uniqueAnalysisRoute(request, "eurolab.validasyon", () => original.DELETE(request, context)); }
