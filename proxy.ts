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
     */
    "/((?!api/auth|api/musteriler|_next/static|_next/image|favicon.ico|login).*)",
  ],
};
