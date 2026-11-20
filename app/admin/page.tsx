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
  const [pendingPlayersResult, sessionView] = await Promise.all([
    supabase.from("profiles").select("id,email,display_name,created_at,role,approval_status").eq("approval_status", "pending").order("created_at", { ascending: true }),
    loadSessionView(supabase),
  ]);
  if (pendingPlayersResult.error) {
    const permissionError = pendingPlayersResult.error.code === "42501";
    return <section className="page-heading"><p className="eyebrow">PENGATURAN DATABASE</p><h1>Database Supabase belum siap</h1><p>{permissionError ? <>Role server belum memiliki izin membaca tabel aplikasi. Jalankan migrasi <code>supabase/migrations/202611200003_service_role_read_access.sql</code> di SQL Editor project Supabase, lalu muat ulang halaman ini.</> : <>Tabel pemain belum dapat dibaca. Jalankan semua migrasi di folder <code>supabase/migrations</code> pada SQL Editor project Supabase, lalu muat ulang halaman ini.</>}</p><div className="notice">Kode database: {pendingPlayersResult.error.code || "query_failed"}</div></section>;
  }
  return <AdminPanel pendingPlayers={(pendingPlayersResult.data ?? []) as Profile[]} activeSession={sessionView.session} activePlayerCount={sessionView.participants.filter((participant) => participant.left_at === null).length} />;
}
