create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'player' check (role in ('player', 'admin')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.club_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  court_count integer not null default 2 check (court_count between 1 and 20),
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references public.profiles(id)
);

create unique index if not exists one_active_club_session
  on public.club_sessions ((status))
  where status = 'active';

create table if not exists public.session_participants (
  session_id uuid not null references public.club_sessions(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  joined_at timestamptz not null default now(),
  checked_in_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (session_id, player_id)
);

create index if not exists session_participants_player_idx
  on public.session_participants (player_id, session_id);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.club_sessions(id) on delete cascade,
  court_number integer not null check (court_number between 1 and 20),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  shuttlecocks_used integer check (shuttlecocks_used between 0 and 999),
  winner_team smallint check (winner_team in (1, 2)),
  created_by uuid references public.profiles(id),
  check (
    (ended_at is null and shuttlecocks_used is null and winner_team is null)
    or
    (ended_at is not null and shuttlecocks_used is not null)
  )
);

create index if not exists matches_session_idx on public.matches (session_id, started_at desc);
create unique index if not exists one_active_match_per_court
  on public.matches (session_id, court_number)
  where ended_at is null;

create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  team_number smallint not null check (team_number in (1, 2)),
  primary key (match_id, player_id)
);

create index if not exists match_players_player_idx on public.match_players (player_id, match_id);

create or replace function private.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = (select auth.uid())
      and p.approval_status = 'approved'
      and u.email_confirmed_at is not null
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.role()) = 'service_role', false);
$$;

revoke all on function private.is_approved_user() from public;
revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_approved_user() to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'Pemain'), '@', 1))
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.club_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;

revoke all on public.profiles from public, anon, authenticated;
revoke all on public.club_sessions from public, anon, authenticated;
revoke all on public.session_participants from public, anon, authenticated;
revoke all on public.matches from public, anon, authenticated;
revoke all on public.match_players from public, anon, authenticated;

grant select on public.profiles, public.club_sessions, public.session_participants, public.matches, public.match_players to authenticated;

drop policy if exists "profiles are visible to approved members" on public.profiles;
create policy "profiles are visible to approved members"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or ((select private.is_approved_user()) and approval_status = 'approved')
  );

drop policy if exists "approved members read sessions" on public.club_sessions;
create policy "approved members read sessions"
  on public.club_sessions for select to authenticated
  using ((select private.is_approved_user()));

drop policy if exists "approved members read participants" on public.session_participants;
create policy "approved members read participants"
  on public.session_participants for select to authenticated
  using ((select private.is_approved_user()));

drop policy if exists "approved members read matches" on public.matches;
create policy "approved members read matches"
  on public.matches for select to authenticated
  using ((select private.is_approved_user()));

drop policy if exists "approved members read match players" on public.match_players;
create policy "approved members read match players"
  on public.match_players for select to authenticated
  using ((select private.is_approved_user()));

create or replace function public.review_player(p_player_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;
  if p_approve and not exists (
    select 1 from auth.users
    where id = p_player_id and email_confirmed_at is not null
  ) then
    raise exception 'player_email_not_confirmed';
  end if;
  update public.profiles
  set approval_status = case when p_approve then 'approved' else 'rejected' end
  where id = p_player_id and role = 'player';
  if not found then
    raise exception 'player_not_found';
  end if;
end;
$$;

create or replace function public.create_club_session(p_name text, p_court_count integer default 2)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;
  if p_court_count is null or p_court_count < 1 or p_court_count > 20 then
    raise exception 'court_count_must_be_1_to_20';
  end if;
  insert into public.club_sessions (name, court_count, created_by)
  values (
    coalesce(nullif(trim(p_name), ''), 'Sesi ' || to_char(now() at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI')),
    p_court_count,
    (select auth.uid())
  )
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'an_active_session_already_exists';
end;
$$;

create or replace function public.update_session_capacity(p_session_id uuid, p_court_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.club_sessions%rowtype;
  v_count integer;
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;
  if p_court_count is null or p_court_count < 1 or p_court_count > 20 then
    raise exception 'court_count_must_be_1_to_20';
  end if;
  select * into v_session from public.club_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'active' then
    raise exception 'active_session_not_found';
  end if;
  select count(*) into v_count
  from public.session_participants
  where session_id = p_session_id and left_at is null;
  if v_count > p_court_count * 10 then
    raise exception 'capacity_below_current_participants';
  end if;
  update public.club_sessions set court_count = p_court_count where id = p_session_id;
end;
$$;

create or replace function public.close_club_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.club_sessions%rowtype;
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;
  select * into v_session from public.club_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'active' then
    raise exception 'active_session_not_found';
  end if;
  if exists (select 1 from public.matches where session_id = p_session_id and ended_at is null) then
    raise exception 'finish_active_matches_first';
  end if;
  update public.club_sessions
  set status = 'closed', closed_at = now()
  where id = p_session_id and status = 'active';
  if not found then
    raise exception 'active_session_not_found';
  end if;
end;
$$;

create or replace function public.check_in_to_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.club_sessions%rowtype;
  v_existing public.session_participants%rowtype;
  v_count integer;
begin
  if not private.is_approved_user() then
    raise exception 'approved_account_required';
  end if;
  select * into v_session from public.club_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'active' then
    raise exception 'active_session_not_found';
  end if;
  select * into v_existing
  from public.session_participants
  where session_id = p_session_id and player_id = (select auth.uid());
  if found and v_existing.left_at is null then
    update public.session_participants
    set checked_in_at = now()
    where session_id = p_session_id and player_id = (select auth.uid());
    return;
  end if;
  select count(*) into v_count
  from public.session_participants
  where session_id = p_session_id and left_at is null;
  if v_count >= v_session.court_count * 10 then
    raise exception 'session_capacity_reached';
  end if;
  insert into public.session_participants (session_id, player_id, joined_at, checked_in_at, left_at)
  values (p_session_id, (select auth.uid()), now(), now(), null)
  on conflict (session_id, player_id) do update
    set joined_at = now(), checked_in_at = now(), left_at = null;
end;
$$;

create or replace function public.leave_club_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.club_sessions%rowtype;
begin
  if not private.is_approved_user() then
    raise exception 'approved_account_required';
  end if;
  select * into v_session from public.club_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'active' then
    raise exception 'active_session_not_found';
  end if;
  if exists (
    select 1
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.session_id = p_session_id
      and m.ended_at is null
      and mp.player_id = (select auth.uid())
  ) then
    raise exception 'finish_active_match_before_leaving';
  end if;
  update public.session_participants
  set left_at = now()
  where session_id = p_session_id
    and player_id = (select auth.uid())
    and left_at is null;
  if not found then
    raise exception 'active_participation_not_found';
  end if;
end;
$$;

create or replace function public.admin_remove_player_from_session(p_session_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.club_sessions%rowtype;
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;
  select * into v_session from public.club_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'active' then
    raise exception 'active_session_not_found';
  end if;
  if exists (
    select 1
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.session_id = p_session_id
      and m.ended_at is null
      and mp.player_id = p_player_id
  ) then
    raise exception 'finish_active_match_before_removal';
  end if;
  update public.session_participants
  set left_at = now()
  where session_id = p_session_id and player_id = p_player_id and left_at is null;
  if not found then
    raise exception 'active_participation_not_found';
  end if;
end;
$$;

create or replace function public.admin_start_match(p_session_id uuid, p_court_number integer, p_player_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.club_sessions%rowtype;
  v_match_id uuid;
  v_count integer;
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;
  select * into v_session from public.club_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'active' then
    raise exception 'active_session_not_found';
  end if;
  if p_court_number < 1 or p_court_number > v_session.court_count then
    raise exception 'court_number_out_of_range';
  end if;
  if p_player_ids is null or cardinality(p_player_ids) not in (2, 4) then
    raise exception 'choose_two_or_four_players';
  end if;
  select count(distinct player_id) into v_count from unnest(p_player_ids) as ids(player_id);
  if v_count <> cardinality(p_player_ids) then
    raise exception 'duplicate_player';
  end if;
  if exists (
    select 1
    from unnest(p_player_ids) as requested(player_id)
    left join public.session_participants sp
      on sp.session_id = p_session_id
      and sp.player_id = requested.player_id
      and sp.left_at is null
      and sp.checked_in_at is not null
    where sp.player_id is null
  ) then
    raise exception 'players_must_be_checked_in';
  end if;
  if exists (
    select 1
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
    where m.session_id = p_session_id
      and m.ended_at is null
      and mp.player_id = any(p_player_ids)
  ) then
    raise exception 'player_already_in_an_active_match';
  end if;
  insert into public.matches (session_id, court_number, created_by)
  values (p_session_id, p_court_number, (select auth.uid()))
  returning id into v_match_id;
  insert into public.match_players (match_id, player_id, team_number)
  select
    v_match_id,
    requested.player_id,
    case
      when cardinality(p_player_ids) = 2 and requested.position = 1 then 1
      when cardinality(p_player_ids) = 2 then 2
      when requested.position <= 2 then 1
      else 2
    end
  from unnest(p_player_ids) with ordinality as requested(player_id, position);
  return v_match_id;
exception
  when unique_violation then
    raise exception 'court_or_player_already_in_use';
end;
$$;

create or replace function public.admin_finish_match(p_match_id uuid, p_shuttlecocks_used integer, p_winner_team smallint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;
  if p_shuttlecocks_used is null or p_shuttlecocks_used < 0 or p_shuttlecocks_used > 999 then
    raise exception 'shuttlecock_count_must_be_0_to_999';
  end if;
  if p_winner_team is not null and p_winner_team not in (1, 2) then
    raise exception 'winner_team_must_be_1_or_2';
  end if;
  update public.matches
  set ended_at = now(), shuttlecocks_used = p_shuttlecocks_used, winner_team = p_winner_team
  where id = p_match_id and ended_at is null;
  if not found then
    raise exception 'active_match_not_found';
  end if;
end;
$$;

revoke all on function public.review_player(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_club_session(text, integer) from public, anon, authenticated;
revoke all on function public.update_session_capacity(uuid, integer) from public, anon, authenticated;
revoke all on function public.close_club_session(uuid) from public, anon, authenticated;
revoke all on function public.check_in_to_session(uuid) from public, anon;
revoke all on function public.leave_club_session(uuid) from public, anon;
revoke all on function public.admin_remove_player_from_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_start_match(uuid, integer, uuid[]) from public, anon, authenticated;
revoke all on function public.admin_finish_match(uuid, integer, smallint) from public, anon, authenticated;

grant execute on function public.review_player(uuid, boolean) to service_role;
grant execute on function public.create_club_session(text, integer) to service_role;
grant execute on function public.update_session_capacity(uuid, integer) to service_role;
grant execute on function public.close_club_session(uuid) to service_role;
grant execute on function public.check_in_to_session(uuid) to authenticated;
grant execute on function public.leave_club_session(uuid) to authenticated;
grant execute on function public.admin_remove_player_from_session(uuid, uuid) to service_role;
grant execute on function public.admin_start_match(uuid, integer, uuid[]) to service_role;
grant execute on function public.admin_finish_match(uuid, integer, smallint) to service_role;
