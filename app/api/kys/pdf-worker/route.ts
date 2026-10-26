import { readFile } from "node:fs/promises";
import path from "node:path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!await getServerSession(authOptions)) return new Response("Yetkisiz erişim", { status: 401 });
  const asset = new URL(request.url).searchParams.get("asset") === "engine" ? "pdf.mjs" : "pdf.worker.min.mjs";
  const worker = await readFile(path.join(process.cwd(), "node_modules/pdfjs-dist/build", asset));
  return new Response(new Uint8Array(worker), { headers: {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  } });
}
