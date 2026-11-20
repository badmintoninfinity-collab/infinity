import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLeaderboard, loadHomeData } from "@/lib/db-queries";
import { getAuthContext } from "@/lib/auth-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isLegacyAdmin } from "@/lib/legacy-admin";
import { createServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import type { ClubSession, MatchRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

export default async function HomePage() {
  const [{ user, profile }, legacyAdmin] = await Promise.all([getAuthContext(), isLegacyAdmin()]);
  if (!legacyAdmin && !isSupabaseConfigured()) redirect("/login");
  if (!user && !legacyAdmin) redirect("/login");
  if (!legacyAdmin && !profile) return <div className="notice">Profil pemain belum tersedia. Coba keluar lalu masuk kembali.</div>;
  if (!legacyAdmin && profile?.approval_status !== "approved") {
    return <section className="pending-card"><span className="pending-icon">⌛</span><p className="eyebrow">AKUN PEMAIN</p><h1>{profile?.approval_status === "pending" ? "Menunggu persetujuan admin" : "Pendaftaran belum disetujui"}</h1><p>{profile?.approval_status === "pending" ? "Akunmu sudah tercatat. Admin PB perlu menyetujuinya sebelum kamu dapat absen di sesi." : "Silakan hubungi admin PB jika kamu merasa ini sebuah kesalahan."}</p></section>;
  }

  if (legacyAdmin && !isSupabaseServiceConfigured()) return <div className="notice">Tambahkan SUPABASE_SECRET_KEY di environment server untuk menghubungkan data admin.</div>;
  const supabase = legacyAdmin ? createServiceClient() : await createClient();
  const [data, leaderboard] = await Promise.all([loadHomeData(supabase), buildLeaderboard(supabase)]);
  const sessions = data.sessions;
  const matches = data.matches;
  const participants = data.participants as { session_id: string; player_id: string; left_at: string | null }[];
  const activeSession = sessions.find((session) => session.status === "active") as ClubSession | undefined;
  const totalShuttles = matches.reduce((sum, match) => sum + (match.shuttlecocks_used ?? 0), 0);
  const playerStats = profile ? leaderboard.find((row) => row.id === profile.id) : null;
  const recentSessions = sessions.filter((session) => session.status === "closed").slice(0, 5);
  const playerNames = new Map(data.players.map((player: { id: string; display_name: string }) => [player.id, player.display_name]));
  const matchesFor = (sessionId: string) => matches.filter((match: MatchRecord) => match.session_id === sessionId);
  const mySessions = profile ? participants.filter((participant) => participant.player_id === profile.id).length : null;

  return <>
    <section className="home-hero">
      <div className="hero-copy"><p className="eyebrow">PB BADMINTON · KOMUNITAS KITA</p><h1>Tempat bertemu,<br />bergerak, dan bermain.</h1><p>Informasi sesi dan catatan permainan Infinity Badminton.</p><Link className="button button-light" href="/sesi-sekarang">{activeSession ? "Lihat sesi sekarang" : "Lihat sesi bermain"} <span aria-hidden="true">→</span></Link></div>
      <div className="hero-mark"><Image src="/logo.jpeg" alt="Logo Infinity Badminton" width={300} height={164} priority /></div>
    </section>

    <section className="home-stats" aria-label="Statistik pemain">
      <article className="stat-card"><span>{legacyAdmin ? "Pemain terdaftar" : "Sesi yang diikuti"}</span><strong>{legacyAdmin ? data.players.length : mySessions}</strong></article>
      <article className="stat-card"><span>{legacyAdmin ? "Total permainan" : "Permainan"}</span><strong>{legacyAdmin ? matches.length : playerStats?.games ?? 0}</strong></article>
      <article className="stat-card"><span>{legacyAdmin ? "Shuttlecock terpakai" : "Win rate"}</span><strong>{legacyAdmin ? totalShuttles : `${playerStats?.winRate ?? 0}%`}</strong></article>
    </section>

    <section className="section-block">
      <div className="section-heading"><div><p className="eyebrow">{activeSession ? "SEDANG BERLANGSUNG" : "INFO PB"}</p><h2>{activeSession?.name ?? "Sesi bermain"}</h2></div><Link className="text-link" href="/sesi-sekarang">{activeSession ? "Absen / lihat sesi →" : "Buka sesi →"}</Link></div>
      {activeSession ? <div className="active-home-card"><span className="live-label">AKTIF</span><div><strong>{activeSession.court_count} lapangan</strong><span>{activeSession.court_count * 10} tempat tersedia · {participants.filter((participant) => participant.session_id === activeSession.id && participant.left_at === null).length} pemain sudah absen</span></div></div> : <div className="empty-state"><span className="empty-symbol" aria-hidden="true">🏸</span><strong>Belum ada sesi aktif</strong><p>Admin akan membuka sesi bermain berikutnya.</p></div>}
    </section>

    <section className="section-block">
      <div className="section-heading"><div><p className="eyebrow">CATATAN TERBARU</p><h2>Histori sesi bermain</h2></div></div>
      {recentSessions.length ? <div className="session-history">{recentSessions.map((session) => {
        const sessionMatches = matchesFor(session.id);
        const sessionPlayers = new Set(participants.filter((participant) => participant.session_id === session.id).map((participant) => participant.player_id));
        const shuttlecocks = sessionMatches.reduce((sum, match) => sum + (match.shuttlecocks_used ?? 0), 0);
        return <article className="history-card" key={session.id}><div className="history-date"><strong>{new Intl.DateTimeFormat("id-ID", { day: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(session.closed_at ?? session.started_at))}</strong><small>{new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(new Date(session.closed_at ?? session.started_at))}</small></div><div className="history-info"><strong>{session.name}</strong><span>{formatDate(session.closed_at ?? session.started_at)}</span><small>{sessionPlayers.size} pemain · {sessionMatches.length} permainan · {shuttlecocks} shuttlecock</small><small>{[...sessionPlayers].slice(0, 4).map((id) => playerNames.get(id)).filter(Boolean).join(", ")}{sessionPlayers.size > 4 ? ` +${sessionPlayers.size - 4}` : ""}</small></div><span className="history-chevron" aria-hidden="true">›</span></article>;
      })}</div> : <div className="empty-state"><span className="empty-symbol" aria-hidden="true">🏸</span><strong>Belum ada histori sesi</strong><p>Riwayat sesi yang sudah ditutup akan muncul di sini.</p></div>}
    </section>

    <section className="section-block">
      <div className="section-heading"><div><p className="eyebrow">PEMAIN PALING AKTIF</p><h2>Leaderboard</h2></div><Link className="text-link" href="/leaderboard">Lihat semua →</Link></div>
      <div className="surface player-stats"><table><thead><tr><th>Pemain</th><th>Sesi</th><th>Main</th><th>Menang</th><th>Win rate</th></tr></thead><tbody>{leaderboard.slice(0, 5).map((row, index) => <tr key={row.id}><td><span className="rank-name"><b>{index + 1}</b>{row.name}</span></td><td>{row.sessions}</td><td>{row.games}</td><td>{row.wins}</td><td>{row.winRate}%</td></tr>)}</tbody></table></div>
    </section>

    <section className="about-card"><div className="about-icon" aria-hidden="true">∞</div><div><p className="eyebrow">TENTANG PB</p><h2>Infinity Badminton</h2><p>Ruang untuk berolahraga, menjaga kebersamaan, dan menikmati permainan badminton.</p></div></section>
  </>;
}
