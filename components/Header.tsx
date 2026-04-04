"use client";

import { signOut, useSession } from "next-auth/react";
import styles from "./Header.module.css";

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {/* Sayfa başlığı slot - her sayfa kendi <title> kullanır */}
      </div>
      <div className={styles.right}>
        {session?.user ? (
          <div className={styles.userArea}>
            <div className={styles.userAvatar}>
              {(session.user.name || "K").charAt(0).toUpperCase()}
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{session.user.name || "Kullanıcı"}</span>
              {session.user.email && (
                <span className={styles.userEmail}>{session.user.email}</span>
              )}
            </div>
            <button
              className={styles.signOutBtn}
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Çıkış Yap"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.08a.75.75 0 1 0-1.004-1.11l-2.5 2.25a.75.75 0 0 0 0 1.11l2.5 2.25a.75.75 0 1 0 1.004-1.11l-1.048-1.08H18.25A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
              </svg>
              <span>Çıkış</span>
            </button>
          </div>
        ) : (
          <div className={styles.userArea} style={{ opacity: 0.5 }}>
            <span className={styles.userName}>Oturum açılmadı</span>
          </div>
        )}
      </div>
    </header>
  );
}
