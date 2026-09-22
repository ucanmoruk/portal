"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import styles from "./Header.module.css";
import { useSidebar } from "./SidebarProvider";

export default function Header() {
  const { data: session } = useSession();
  const { toggle } = useSidebar();
  const [notifications,setNotifications]=useState<{count:number;items:Array<{id:number;etiket:string;baslik:string;olusturanAd:string}>}>({count:0,items:[]});
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const loadNotifications=useCallback(async()=>{try{const response=await fetch("/api/kys/iletisim/bildirimler");if(response.ok)setNotifications(await response.json());}catch{/* Bildirim hatası üst menüyü engellemez. */}},[]);
  const markNotification=useCallback(async(id?:number)=>{await fetch("/api/kys/iletisim",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(id?{islem:"okundu",id}:{islem:"tumunu-okundu"})});await loadNotifications();},[loadNotifications]);
  useEffect(()=>{if(!session?.user)return;const initial=setTimeout(()=>void loadNotifications(),0);const timer=setInterval(()=>void loadNotifications(),30000);return()=>{clearTimeout(initial);clearInterval(timer);};},[session?.user,loadNotifications]);

  return (
    <header className={styles.header} data-dashboard-header>
      <div className={styles.left}>
        <button className={styles.hamburger} onClick={toggle} aria-label="Menüyü aç/kapat">
          <span /><span /><span />
        </button>
      </div>
      <div className={styles.right}>
        {session?.user ? (
          <div className={styles.userArea}>
            <div className={styles.notificationWrap}>
              <button className={styles.notificationButton} aria-label={`${notifications.count} okunmamış bildirim`} onClick={()=>setNotificationsOpen(value=>!value)}>
                <Bell size={17}/>{notifications.count>0&&<span>{notifications.count>99?"99+":notifications.count}</span>}
              </button>
              {notificationsOpen&&<div className={styles.notificationPanel}><header><strong>Bildirimler</strong>{notifications.count>0&&<button onClick={()=>void markNotification()}>Tümünü okundu yap</button>}</header>{notifications.items.length===0?<p>Yeni bildiriminiz yok.</p>:notifications.items.map(item=><div className={styles.notificationItem} key={`${item.etiket}-${item.id}`}><Link href="/laboratuvar/kys/iletisim" onClick={()=>setNotificationsOpen(false)}><small>{item.etiket}</small><strong>{item.baslik}</strong><span>{item.olusturanAd}</span></Link><button onClick={()=>void markNotification(item.id)} title="Okundu işaretle">✓</button></div>)}<Link className={styles.notificationAll} href="/laboratuvar/kys/iletisim" onClick={()=>setNotificationsOpen(false)}>İç iletişimi görüntüle</Link></div>}
            </div>
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
