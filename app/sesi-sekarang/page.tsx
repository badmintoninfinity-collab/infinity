import { redirect } from "next/navigation";
import { SessionManager } from "@/components/session-manager";
import { getAuthContext } from "@/lib/auth-context";
import { isLegacyAdmin } from "@/lib/legacy-admin";
import { loadSessionView } from "@/lib/db-queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export default async function SessionPage() {
  const [legacyAdmin, auth] = await Promise.all([isLegacyAdmin(), getAuthContext()]);
  if (!legacyAdmin && !isSupabaseConfigured()) redirect("/login");
  if (!legacyAdmin && !auth.user) redirect("/login");
  if (!legacyAdmin && (!auth.profile || auth.profile.approval_status !== "approved")) return <section className="pending-card"><p className="eyebrow">SESI BERMAIN</p><h1>Akun menunggu persetujuan</h1><p>Setelah admin menyetujui akun pemainmu, kamu bisa melihat dan absen ke sesi yang sedang berlangsung.</p></section>;
  if (legacyAdmin && !isSupabaseServiceConfigured()) return <div className="notice">Tambahkan SUPABASE_SECRET_KEY di environment server untuk menghubungkan fungsi admin.</div>;
  const supabase = legacyAdmin ? createServiceClient() : await createClient();
  const view = await loadSessionView(supabase);
  return <SessionManager initialView={view} userId={legacyAdmin ? "legacy-admin" : auth.user!.id} isAdmin={legacyAdmin} />;
}
