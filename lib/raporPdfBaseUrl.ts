import { loadDotenvOnce } from "@/lib/loadDotenv";

function cleanBaseUrl(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return "";
  }
}

function requestHeader(request: Request, name: string): string {
  return request.headers.get(name) || "";
}

export function getRaporPdfBaseUrl(request: Request): string {
  loadDotenvOnce();

  const configured = cleanBaseUrl(
    process.env.RAPOR_PDF_BASE_URL ||
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL,
  );
  if (configured) return configured;

  const forwardedHost = requestHeader(request, "x-forwarded-host");
  const host = forwardedHost || requestHeader(request, "host");
  if (host) {
    const proto = requestHeader(request, "x-forwarded-proto") || "https";
    const fromHost = cleanBaseUrl(`${proto}://${host}`);
    if (fromHost) return fromHost;
  }

  return cleanBaseUrl(request.url) || new URL(request.url).origin;
}
