import LoginForm from "./login-form";
import styles from "./login.module.css";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Giriş Yap | Portal",
  description: "Portal yönetim sistemi giriş sayfası",
};

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/");
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.loginCard}>

        {/* Logo */}
        <div className={styles.logoArea}>
          <div className={styles.logoBox}>
            {/* Basit bir Grid/Portal ikonu */}
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z"/>
            </svg>
          </div>
        </div>

        {/* Başlık */}
        <div className={styles.loginHeader}>
          <h1>Portal&apos;a Giriş Yap</h1>
          <p>Devam etmek için hesabınızla oturum açın.</p>
        </div>

        {/* Form */}
        <LoginForm />

        {/* Footer */}
        <div className={styles.footer}>
          Tüm hakları saklıdır © {new Date().getFullYear()} Portal
        </div>
      </div>
    </div>
  );
}
