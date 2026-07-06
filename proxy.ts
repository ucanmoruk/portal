import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATH_PREFIXES = [
  "/api/auth",
  "/api/musteriler",
  "/rapordogrulama",
  "/api/rapor-dogrula",
  "/_next/static",
  "/_next/image",
  "/favicon.ico",
  "/login",
];

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATH_PREFIXES.some((path) => pathname.startsWith(path)) ||
    /^\/api\/teklifler\/[^/]+\/onay(?:\/|$)/.test(pathname)
  );
}

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req });
  if (token) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Oturum suresi doldu. Lutfen tekrar giris yapin." },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Yalnizca giris yapilmis kullanicilarin erisebilecegi rotalar korunur.
     * API istekleri oturum yoksa HTML login sayfasi yerine JSON 401 doner.
     */
    "/((?!api/auth|api/musteriler|api/teklifler/[^/]+/onay|rapordogrulama|api/rapor-dogrula|_next/static|_next/image|favicon.ico|login).*)",
  ],
};
