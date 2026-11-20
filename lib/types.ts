export type UserRole = "player" | "admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  approval_status: ApprovalStatus;
  created_at: string;
};

export type ClubSession = {
  id: string;
  name: string;
  status: "active" | "closed";
  court_count: number;
  started_at: string;
  closed_at: string | null;
  created_by: string | null;
};

export type SessionParticipant = {
  session_id: string;
  player_id: string;
  joined_at: string;
  checked_in_at: string;
  left_at: string | null;
};

export type MatchRecord = {
  id: string;
  session_id: string;
  court_number: number;
  started_at: string;
  ended_at: string | null;
  shuttlecocks_used: number | null;
  winner_team: 1 | 2 | null;
  created_by: string | null;
};

export type MatchPlayer = {
  match_id: string;
  player_id: string;
  team_number: 1 | 2;
};

export type AuthContext = {
  user: { id: string; email?: string } | null;
  profile: Profile | null;
};

export type PlayerLeaderboardRow = {
  id: string;
  name: string;
  sessions: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
};
