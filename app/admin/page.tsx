import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin-panel";
import { isLegacyAdmin } from "@/lib/legacy-admin";
import { loadSessionView } from "@/lib/db-queries";
import { isSupabaseServiceConfigured, createServiceClient } from "@/lib/supabase/service";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!await isLegacyAdmin()) redirect("/login");
  if (!isSupabaseServiceConfigured()) return <div className="notice">Tambahkan SUPABASE_SECRET_KEY di environment server untuk menghubungkan fungsi admin.</div>;
  const supabase = createServiceClient();
  const [{ data: pendingPlayers }, sessionView] = await Promise.all([
    supabase.from("profiles").select("id,email,display_name,created_at,role,approval_status").eq("approval_status", "pending").order("created_at", { ascending: true }),
    loadSessionView(supabase),
  ]);
  return <AdminPanel pendingPlayers={(pendingPlayers ?? []) as Profile[]} activeSession={sessionView.session} activePlayerCount={sessionView.participants.filter((participant) => participant.left_at === null).length} />;
}
