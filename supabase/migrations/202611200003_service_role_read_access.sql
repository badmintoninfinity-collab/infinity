-- Admin pages use the server-only service role to read these application tables.
grant usage on schema public to service_role;

grant select on table
  public.profiles,
  public.club_sessions,
  public.session_participants,
  public.matches,
  public.match_players
to service_role;
