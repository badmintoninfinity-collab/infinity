import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getAuthContext } from "@/lib/auth-context";
import { isLegacyAdmin } from "@/lib/legacy-admin";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infinity Badminton",
  description: "Informasi, sesi bermain, dan histori PB Infinity Badminton.",
  applicationName: "Infinity Badminton",
};

export const viewport: Viewport = {
  themeColor: "#a76038",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [{ user }, legacyAdmin] = await Promise.all([getAuthContext(), isLegacyAdmin()]);
  const isAdmin = legacyAdmin;
  const signedIn = Boolean(user) || legacyAdmin;
  return (
    <html lang="id">
      <body><AppShell signedIn={signedIn} isAdmin={isAdmin} legacyAdmin={legacyAdmin} email={legacyAdmin ? "Administrator" : user?.email}>{children}</AppShell></body>
    </html>
  );
}
