import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    /*
     * Yalnızca giriş yapılmışsa erişilebilecek rotaları belirler
     * api/auth, statik dosyalar ve login sayfası hariç tüm projedeki rotalar korumaya alınır
     * rapordogrulama + api/rapor-dogrula → public rapor doğrulama (QR ile herkes erişebilir)
     */
    "/((?!api/auth|api/musteriler|api/teklifler/[^/]+/onay|rapordogrulama|api/rapor-dogrula|_next/static|_next/image|favicon.ico|login).*)",
  ],
};
