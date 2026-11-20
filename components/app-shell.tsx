"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ReactNode } from "react";

export function AppShell({ children, signedIn, isAdmin, legacyAdmin, email }: {
  children: ReactNode;
  signedIn: boolean;
  isAdmin: boolean;
  legacyAdmin: boolean;
  email?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navigation = signedIn ? [
    { href: "/", label: "Beranda", icon: "⌂" },
    { href: "/sesi-sekarang", label: "Sesi", icon: "◎" },
    ...(isAdmin ? [
      { href: "/leaderboard", label: "Leaderboard", icon: "♕" },
      { href: "/admin", label: "Admin", icon: "♙" },
    ] : []),
  ] : [];

  async function signOut() {
    if (legacyAdmin) await fetch("/api/admin-auth", { method: "DELETE" });
    else {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Infinity Badminton, beranda">
          <Image src="/logo.jpeg" alt="" width={46} height={46} priority />
          <span><strong>INFINITY</strong><small>BADMINTON CLUB</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="Navigasi utama">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? "nav-link selected" : "nav-link"}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-user">
          {signedIn ? <><span>{email}</span><button type="button" onClick={signOut}>Keluar</button></> : <Link href="/login">Masuk</Link>}
        </div>
      </header>
      <main className="main-content">{children}</main>
      {navigation.length > 0 && <nav className="mobile-nav" aria-label="Navigasi utama">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} className={pathname === item.href ? "mobile-nav-link selected" : "mobile-nav-link"} aria-current={pathname === item.href ? "page" : undefined}>
            <span aria-hidden="true">{item.icon}</span>
            <small>{item.label}</small>
          </Link>
        ))}
      </nav>}
    </div>
  );
}
