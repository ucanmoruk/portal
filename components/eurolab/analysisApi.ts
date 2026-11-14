export function analysisApi(path: string) {
 return typeof window !== "undefined" && window.location.pathname.startsWith("/laboratuvar/kys/") ? path.replace("/api/eurolab/", "/api/kys/analiz/") : path;
}
