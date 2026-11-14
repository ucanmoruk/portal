"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./Workspace.module.css";

// KYS sayfaları arasında WorkspaceClient ile aynı görünümde sekme gezinmesi.
export default function GroupNav({ label, items }: { label: string; items: { href: string; title: string }[] }) {
  const pathname = usePathname();
  if (items.length < 2) return null;
  return <nav className={s.nav} aria-label={label} style={{ marginBottom: 18 }}>{items.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}>{item.title}</Link>)}</nav>;
}
