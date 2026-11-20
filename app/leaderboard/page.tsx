import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { buildLeaderboard } from "@/lib/db-queries";
import { isLegacyAdmin } from "@/lib/legacy-admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [legacyAdmin, { user, profile }] = await Promise.all([isLegacyAdmin(), getAuthContext()]);
  if (!legacyAdmin && !isSupabaseConfigured()) redirect("/login");
  if (!legacyAdmin && !user) redirect("/login");
  if (!legacyAdmin && (!profile || profile.approval_status !== "approved")) redirect("/");
  if (legacyAdmin && !isSupabaseServiceConfigured()) return <div className="notice">Tambahkan SUPABASE_SECRET_KEY di environment server untuk melihat leaderboard.</div>;
  const supabase = legacyAdmin ? createServiceClient() : await createClient();
  const rows = await buildLeaderboard(supabase);
  return <>
    <div className="page-heading"><p className="eyebrow">STATISTIK PEMAIN</p><h1>Leaderboard</h1><p>Jumlah sesi, permainan, kemenangan, kekalahan, dan persentase menang tercatat dari sesi dan hasil yang disimpan admin.</p></div>
    <div className="leaderboard-summary"><div><strong>{rows.length}</strong><span>pemain aktif</span></div><div><strong>{rows.reduce((sum, row) => sum + row.games, 0)}</strong><span>permainan tercatat</span></div><div><strong>{rows.reduce((sum, row) => sum + row.wins, 0)}</strong><span>kemenangan</span></div></div>
    <section className="surface player-stats leaderboard-table"><table><thead><tr><th>#</th><th>Pemain</th><th>Sesi diikuti</th><th>Main</th><th>Menang</th><th>Kalah</th><th>Win rate</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}><td><b className={`rank-badge ${index < 3 ? "top-rank" : ""}`}>{index + 1}</b></td><td><span className="rank-name">{row.name}</span></td><td>{row.sessions}</td><td>{row.games}</td><td>{row.wins}</td><td>{row.losses}</td><td><strong>{row.winRate}%</strong></td></tr>)}</tbody></table></section>
    <p className="hint">Win rate dihitung dari pertandingan dengan pemenang yang dicatat. Permainan tanpa hasil tetap masuk ke jumlah main.</p>
  </>;
}
