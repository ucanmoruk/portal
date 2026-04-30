"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const formUsername = String(formData.get("username") || "").trim();
    const formPassword = String(formData.get("password") || "");

    if (!formUsername || !formPassword) {
      setError("Lütfen kullanıcı adı ve şifrenizi girin.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        username: formUsername,
        password: formPassword,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        setLoading(false);
      } else {
        router.refresh();
        router.push("/");
      }
    } catch {
      setError("Bir hata oluştu, lütfen tekrar deneyin.");
      setLoading(false);
    }
  };

  return (
    <form className={styles.formContainer} onSubmit={handleSubmit}>
      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.inputGroup}>
        <div className={styles.inputWrapper}>
          <input
            id="username"
            name="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Kullanıcı adı veya e-posta"
            required
            disabled={loading}
            autoComplete="username"
            autoFocus
          />
        </div>
      </div>

      <div className={styles.inputGroup}>
        <div className={styles.inputWrapper}>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Şifre"
            required
            disabled={loading}
            autoComplete="current-password"
          />
        </div>
      </div>

      <button
        type="submit"
        className={styles.submitButton}
        disabled={loading}
      >
        {loading ? <span className={styles.loader}></span> : "Giriş Yap →"}
      </button>
    </form>
  );
}
