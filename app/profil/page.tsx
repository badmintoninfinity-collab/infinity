import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext } from "@/lib/auth-context";
import { isLegacyAdmin } from "@/lib/legacy-admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProfileStats = {
  sessions: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  shuttlecocks: number;
  recentMatches: Array<{
    id: string;
    sessionName: string;
    courtNumber: number;
    startedAt: string;
    shuttlecocks: number | null;
    result: "Menang" | "Kalah" | "Belum ada hasil";
  }>;
  error: boolean;
};

async function loadPlayerStats(supabase: SupabaseClient, playerId: string): Promise<ProfileStats> {
  const empty: ProfileStats = { sessions: 0, games: 0, wins: 0, losses: 0, winRate: 0, shuttlecocks: 0, recentMatches: [], error: false };
  const [participationResult, playerMatchesResult] = await Promise.all([
    supabase.from("session_participants").select("session_id", { count: "exact", head: true }).eq("player_id", playerId).not("checked_in_at", "is", null),
    supabase.from("match_players").select("match_id,team_number").eq("player_id", playerId),
  ]);
  if (participationResult.error || playerMatchesResult.error) return { ...empty, error: true };

  const sessions = participationResult.count ?? 0;
  const playerMatches = (playerMatchesResult.data ?? []) as Array<{ match_id: string; team_number: 1 | 2 }>;
  const matchIds = [...new Set(playerMatches.map((entry) => entry.match_id))];
  if (matchIds.length === 0) return { ...empty, sessions };

  const matchesResult = await supabase.from("matches")
    .select("id,session_id,court_number,started_at,shuttlecocks_used,winner_team")
    .in("id", matchIds)
    .order("started_at", { ascending: false })
    .limit(1000);
  if (matchesResult.error) return { ...empty, sessions, error: true };

  const matches = (matchesResult.data ?? []) as Array<{
    id: string;
    session_id: string;
    court_number: number;
    started_at: string;
    shuttlecocks_used: number | null;
    winner_team: 1 | 2 | null;
  }>;
  const teamByMatch = new Map(playerMatches.map((entry) => [entry.match_id, entry.team_number]));
  const wins = matches.filter((match) => match.winner_team !== null && teamByMatch.get(match.id) === match.winner_team).length;
  const losses = matches.filter((match) => match.winner_team !== null && teamByMatch.get(match.id) !== match.winner_team).length;
  const shuttlecocks = matches.reduce((total, match) => total + (match.shuttlecocks_used ?? 0), 0);
  const recent = matches.slice(0, 8);
  const sessionIds = [...new Set(recent.map((match) => match.session_id))];
  const sessionNamesResult = sessionIds.length
    ? await supabase.from("club_sessions").select("id,name").in("id", sessionIds)
    : { data: [], error: null };
  const sessionNames = new Map(((sessionNamesResult.data ?? []) as Array<{ id: string; name: string }>).map((session) => [session.id, session.name]));

  return {
    sessions,
    games: matches.length,
    wins,
    losses,
    winRate: wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0,
    shuttlecocks,
    recentMatches: recent.map((match) => ({
      id: match.id,
      sessionName: sessionNames.get(match.session_id) ?? "Sesi bermain",
      courtNumber: match.court_number,
      startedAt: match.started_at,
      shuttlecocks: match.shuttlecocks_used,
      result: match.winner_team === null ? "Belum ada hasil" : teamByMatch.get(match.id) === match.winner_team ? "Menang" : "Kalah",
    })),
    error: Boolean(sessionNamesResult.error),
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

export default async function ProfilePage() {
  const [legacyAdmin, { user, profile }] = await Promise.all([isLegacyAdmin(), getAuthContext()]);
  if (legacyAdmin) redirect("/");
  if (!user) redirect("/login");
  if (!profile) return <div className="notice">Informasi profil belum tersedia. Coba muat ulang halaman atau hubungi administrator.</div>;

  const isApproved = profile.approval_status === "approved";
  const stats = isApproved ? await loadPlayerStats(await createClient(), user.id) : null;
  const genderLabel = profile.gender === "L" ? "Pria" : profile.gender === "P" ? "Wanita" : "Belum diisi";
  const approvalLabel = profile.approval_status === "approved" ? "Aktif" : profile.approval_status === "pending" ? "Menunggu persetujuan" : "Tidak disetujui";

  return <>
    <div className="page-heading"><p className="eyebrow">AKUN PEMAIN</p><h1>Profil saya</h1><p>Informasi akun dan ringkasan permainanmu di Infinity Badminton.</p></div>

    <section className="surface profile-card">
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">{profile.display_name.slice(0, 1).toUpperCase()}</span>
        <div className="profile-identity-copy"><h2>{profile.display_name}</h2><span>{user.email ?? profile.email}</span></div>
        <span className={`profile-status ${profile.approval_status}`}>{approvalLabel}</span>
      </div>
      <div className="profile-details">
        <div><small>Email</small><strong>{user.email ?? profile.email}</strong></div>
        <div><small>Gender</small><strong><span className={`gender-badge${profile.gender === "L" ? " gender-male" : profile.gender === "P" ? " gender-female" : " gender-unknown"}`} aria-hidden="true">{profile.gender ?? "—"}</span>{genderLabel}</strong></div>
      </div>
    </section>

    {stats && <>
      <section className="surface">
        <div className="surface-heading"><div><h2>Statistik bermain</h2><p>Ringkasan dari sesi yang kamu ikuti.</p></div></div>
        {stats.error ? <p className="notice">Statistik belum bisa dimuat. Coba muat ulang halaman beberapa saat lagi.</p> : <div className="profile-stats-grid">
          <div><strong>{stats.sessions}</strong><span>Sesi diikuti</span></div>
          <div><strong>{stats.games}</strong><span>Permainan</span></div>
          <div><strong>{stats.wins}</strong><span>Menang</span></div>
          <div><strong>{stats.losses}</strong><span>Kalah</span></div>
          <div><strong>{stats.winRate}%</strong><span>Win rate</span></div>
          <div><strong>{stats.shuttlecocks}</strong><span>Shuttlecock dipakai</span></div>
        </div>}
      </section>

      <section className="surface">
        <div className="surface-heading"><div><h2>Riwayat permainan</h2><p>Permainan terakhirmu.</p></div></div>
        {stats.error ? <p className="hint">Riwayat belum tersedia saat ini.</p> : stats.recentMatches.length ? <ul className="profile-history">{stats.recentMatches.map((match) => (
          <li key={match.id}>
            <span className="profile-history-date">{formatDate(match.startedAt)}</span>
            <span className="profile-history-main"><strong>{match.sessionName}</strong><small>Lapangan {match.courtNumber}{match.shuttlecocks === null ? "" : ` · ${match.shuttlecocks} shuttlecock`}</small></span>
            <span className={`profile-result ${match.result === "Menang" ? "win" : match.result === "Kalah" ? "loss" : "undecided"}`}>{match.result}</span>
          </li>
        ))}</ul> : <div className="empty-state compact-empty"><strong>Belum ada permainan</strong><p>Riwayatmu akan muncul setelah admin mencatat hasil pertandingan.</p></div>}
      </section>
    </>}

    {!isApproved && <div className="notice">Statistik bermain akan tampil setelah akunmu disetujui administrator.</div>}

    <section className="surface profile-security">
      <div><h2>Keamanan akun</h2><p>Ganti kata sandi lewat tautan verifikasi email.</p></div>
      <Link className="button button-muted" href="/lupa-password">Ganti kata sandi</Link>
    </section>
  </>;
}
