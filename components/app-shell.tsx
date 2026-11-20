"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ReactNode } from "react";
import { MobileMascot } from "@/components/mobile-mascot";

function NavIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m3.5 10 8.5-7 8.5 7" /><path d="M5.5 9v11h13V9M9.5 20v-6h5v6" /></svg>;
  if (name === "session") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M8 2.5v3M16 2.5v3M4 8.5h16M12 9v11M4 14h16" /></svg>;
  if (name === "leaderboard") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M8 4h8v4a4 4 0 0 1-8 0V4ZM8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 12v5M8.5 20h7M10 17h4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1a5.5 5.5 0 0 1 11 0v1M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4v.6" /></svg>;
}

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
    { href: "/", label: "Beranda", icon: "home" },
    { href: "/sesi-sekarang", label: "Sesi", icon: "session" },
    ...(isAdmin ? [
      { href: "/leaderboard", label: "Leaderboard", icon: "leaderboard" },
      { href: "/admin", label: "Admin", icon: "admin" },
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
    <div className={navigation.length > 0 ? "site-shell has-navigation" : "site-shell"}>
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
          {signedIn ? isAdmin ? <button type="button" onClick={signOut}>Keluar</button> : <details className="account-menu">
            <summary aria-label="Buka menu akun">
              <span className="account-avatar" aria-hidden="true">{email?.slice(0, 1).toUpperCase() || "P"}</span>
              <span className="account-menu-label">Akun</span>
              <svg className="account-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </summary>
            <div className="account-dropdown">
              <span className="account-email">{email}</span>
              <Link href="/profil" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}>Profil saya</Link>
              <button type="button" onClick={signOut}>Keluar</button>
            </div>
          </details> : <Link href="/login">Masuk</Link>}
        </div>
      </header>
      <main className="main-content" key={pathname}>{children}</main>
      {navigation.length > 0 && <div className={isAdmin ? "mobile-nav-dock mobile-nav-dock-admin" : "mobile-nav-dock mobile-nav-dock-player"}>
        <MobileMascot />
        <nav className="mobile-nav" aria-label="Navigasi utama">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? "mobile-nav-link selected" : "mobile-nav-link"} aria-current={pathname === item.href ? "page" : undefined}>
              <span className="nav-icon"><NavIcon name={item.icon} /></span>
              <small>{item.label}</small>
            </Link>
          ))}
        </nav>
      </div>}
    </div>
  );
}
