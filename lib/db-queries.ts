import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClubSession,
  MatchPlayer,
  MatchRecord,
  PlayerLeaderboardRow,
  Profile,
  SessionParticipant,
  SessionWaitlistEntry,
} from "@/lib/types";

export type SessionView = {
  session: ClubSession | null;
  players: Pick<Profile, "id" | "display_name">[];
  participants: SessionParticipant[];
  waitingList: SessionWaitlistEntry[];
  matches: MatchRecord[];
  matchPlayers: MatchPlayer[];
};

export async function loadHomeData(supabase: SupabaseClient) {
  const [sessionsResult, matchesResult, participantsResult, playersResult, matchPlayersResult] = await Promise.all([
    supabase.from("club_sessions").select("*").order("started_at", { ascending: false }).limit(100),
    supabase.from("matches").select("*").order("started_at", { ascending: false }).limit(1000),
    supabase.from("session_participants").select("session_id,player_id,checked_in_at,left_at").not("checked_in_at", "is", null),
    supabase.from("profiles").select("id,display_name,gender").eq("approval_status", "approved"),
    supabase.from("match_players").select("match_id,player_id,team_number"),
  ]);

  return {
    sessions: (sessionsResult.data ?? []) as ClubSession[],
    matches: (matchesResult.data ?? []) as MatchRecord[],
    participants: participantsResult.data ?? [],
    players: playersResult.data ?? [],
    matchPlayers: (matchPlayersResult.data ?? []) as MatchPlayer[],
    error: sessionsResult.error || matchesResult.error || participantsResult.error || playersResult.error || matchPlayersResult.error,
  };
}

export async function loadSessionView(supabase: SupabaseClient): Promise<SessionView> {
  const { data: sessionData, error: sessionError } = await supabase
    .from("club_sessions")
    .select("*")
    .eq("status", "active")
    .maybeSingle();
  if (sessionError || !sessionData) {
    return { session: null, players: [], participants: [], waitingList: [], matches: [], matchPlayers: [] };
  }

  const session = sessionData as ClubSession;
  const [participantResult, profilesResult, matchesResult, waitingListResult] = await Promise.all([
    supabase.from("session_participants").select("*").eq("session_id", session.id),
    supabase.from("profiles").select("id,display_name").eq("approval_status", "approved"),
    supabase.from("matches").select("*").eq("session_id", session.id).order("started_at", { ascending: false }),
    supabase.from("session_waitlist").select("*").eq("session_id", session.id).order("queued_at", { ascending: true }).order("player_id", { ascending: true }),
  ]);
  const matches = (matchesResult.data ?? []) as MatchRecord[];
  const matchIds = matches.map((match) => match.id);
  let matchPlayers: MatchPlayer[] = [];
  if (matchIds.length) {
    const { data } = await supabase.from("match_players").select("*").in("match_id", matchIds);
    matchPlayers = (data ?? []) as MatchPlayer[];
  }
  return {
    session,
    players: (profilesResult.data ?? []) as Pick<Profile, "id" | "display_name">[],
    participants: (participantResult.data ?? []) as SessionParticipant[],
    waitingList: (waitingListResult.data ?? []) as SessionWaitlistEntry[],
    matches,
    matchPlayers,
  };
}

export async function buildLeaderboard(supabase: SupabaseClient): Promise<PlayerLeaderboardRow[]> {
  const data = await loadHomeData(supabase);
  const checkedInSessions = new Map<string, Set<string>>();
  data.participants.forEach((participant: { session_id: string; player_id: string }) => {
    if (!checkedInSessions.has(participant.player_id)) checkedInSessions.set(participant.player_id, new Set());
    checkedInSessions.get(participant.player_id)?.add(participant.session_id);
  });

  const matchIds = new Map<string, MatchRecord>();
  data.matches.forEach((match) => matchIds.set(match.id, match));
  const players = new Map<string, { games: number; wins: number; losses: number }>();
  data.players.forEach((player: { id: string }) => players.set(player.id, { games: 0, wins: 0, losses: 0 }));

  data.matchPlayers.forEach((entry) => {
    const stats = players.get(entry.player_id);
    const match = matchIds.get(entry.match_id);
    if (!stats || !match) return;
    stats.games += 1;
    if (match.winner_team === null) return;
    if (entry.team_number === match.winner_team) stats.wins += 1;
    else stats.losses += 1;
  });

  return data.players.map((player: { id: string; display_name: string; gender: "L" | "P" | null }) => {
    const stats = players.get(player.id) ?? { games: 0, wins: 0, losses: 0 };
    const decidedGames = stats.wins + stats.losses;
    return {
      id: player.id,
      name: player.display_name,
      gender: player.gender,
      sessions: checkedInSessions.get(player.id)?.size ?? 0,
      games: stats.games,
      wins: stats.wins,
      losses: stats.losses,
      winRate: decidedGames ? Math.round((stats.wins / decidedGames) * 100) : 0,
    };
  }).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name, "id"));
}
