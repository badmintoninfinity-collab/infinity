alter table public.club_sessions
  add column if not exists waitlist_alert_claimed_at timestamptz,
  add column if not exists waitlist_full_alerted_at timestamptz;

create table if not exists public.session_waitlist (
  session_id uuid not null references public.club_sessions(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  queued_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create index if not exists session_waitlist_fifo_idx
  on public.session_waitlist (session_id, queued_at, player_id);

alter table public.session_waitlist enable row level security;
revoke all on public.session_waitlist from public, anon, authenticated;
grant select on public.session_waitlist to authenticated, service_role;

drop policy if exists "approved members read session waitlist" on public.session_waitlist;
create policy "approved members read session waitlist"
  on public.session_waitlist for select to authenticated
  using ((select private.is_approved_user()));

create or replace function private.promote_session_waitlist(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.club_sessions%rowtype;
  v_present_count integer;
  v_open_spots integer;
  v_promoted integer := 0;
  v_waiter record;
  v_waiting_count integer;
begin
  select * into v_session
  from public.club_sessions
  where id = p_session_id;
  if not found or v_session.status <> 'active' then
    return 0;
  end if;

  select count(*) into v_present_count
  from public.session_participants
  where session_id = p_session_id and left_at is null;
  v_open_spots := greatest(0, v_session.court_count * 10 - v_present_count);

  if v_open_spots > 0 then
    for v_waiter in
      select player_id
      from public.session_waitlist
      where session_id = p_session_id
      order by queued_at asc, player_id asc
      limit v_open_spots
    loop
      insert into public.session_participants (session_id, player_id, joined_at, checked_in_at, left_at)
      values (p_session_id, v_waiter.player_id, now(), now(), null)
      on conflict (session_id, player_id) do update
        set joined_at = excluded.joined_at,
            checked_in_at = excluded.checked_in_at,
            left_at = null;

      delete from public.session_waitlist
      where session_id = p_session_id and player_id = v_waiter.player_id;
      v_promoted := v_promoted + 1;
    end loop;
  end if;

  select count(*) into v_waiting_count
  from public.session_waitlist
  where session_id = p_session_id;
  if v_waiting_count < 10 then
    update public.club_sessions
    set waitlist_alert_claimed_at = null,
        waitlist_full_alerted_at = null
    where id = p_session_id;
  end if;
  return v_promoted;
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

  perform private.promote_session_waitlist(p_session_id);
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

create or replace function public.join_session_waitlist(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.club_sessions%rowtype;
  v_player_id uuid := (select auth.uid());
  v_existing public.session_participants%rowtype;
  v_queue_entry public.session_waitlist%rowtype;
  v_present_count integer;
  v_waiting_count integer;
  v_position integer;
begin
  if not private.is_approved_user() then
    raise exception 'approved_account_required';
  end if;
  select * into v_session from public.club_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'active' then
    raise exception 'active_session_not_found';
  end if;

  perform private.promote_session_waitlist(p_session_id);
  select * into v_existing
  from public.session_participants
  where session_id = p_session_id and player_id = v_player_id;
  if found and v_existing.left_at is null then
    return jsonb_build_object('status', 'attending');
  end if;

  select * into v_queue_entry
  from public.session_waitlist
  where session_id = p_session_id and player_id = v_player_id;
  if found then
    select count(*) into v_position
    from public.session_waitlist
    where session_id = p_session_id
      and (queued_at < v_queue_entry.queued_at or (queued_at = v_queue_entry.queued_at and player_id <= v_player_id));
    select count(*) into v_waiting_count
    from public.session_waitlist
    where session_id = p_session_id;
    return jsonb_build_object(
      'status', 'waitlisted',
      'position', v_position,
      'waiting_count', v_waiting_count,
      'notify_leader', v_waiting_count = 10 and v_session.waitlist_full_alerted_at is null
    );
  end if;

  select count(*) into v_present_count
  from public.session_participants
  where session_id = p_session_id and left_at is null;
  if v_present_count < v_session.court_count * 10 then
    insert into public.session_participants (session_id, player_id, joined_at, checked_in_at, left_at)
    values (p_session_id, v_player_id, now(), now(), null)
    on conflict (session_id, player_id) do update
      set joined_at = now(), checked_in_at = now(), left_at = null;
    return jsonb_build_object('status', 'attending');
  end if;

  select count(*) into v_waiting_count
  from public.session_waitlist
  where session_id = p_session_id;
  if v_waiting_count >= 10 then
    raise exception 'waiting_list_full';
  end if;
  insert into public.session_waitlist (session_id, player_id, queued_at)
  values (p_session_id, v_player_id, now());

  select count(*) into v_position
  from public.session_waitlist
  where session_id = p_session_id
    and (queued_at < now() or (queued_at = now() and player_id <= v_player_id));
  select count(*) into v_waiting_count
  from public.session_waitlist
  where session_id = p_session_id;
  return jsonb_build_object(
    'status', 'waitlisted',
    'position', v_position,
    'waiting_count', v_waiting_count,
    'notify_leader', v_waiting_count = 10 and v_session.waitlist_full_alerted_at is null
  );
end;
$$;

create or replace function public.leave_session_waitlist(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_waiting_count integer;
begin
  if not private.is_approved_user() then
    raise exception 'approved_account_required';
  end if;
  perform 1 from public.club_sessions where id = p_session_id and status = 'active' for update;
  if not found then
    raise exception 'active_session_not_found';
  end if;
  delete from public.session_waitlist
  where session_id = p_session_id and player_id = (select auth.uid());
  if not found then
    raise exception 'active_waitlist_entry_not_found';
  end if;
  select count(*) into v_waiting_count
  from public.session_waitlist
  where session_id = p_session_id;
  if v_waiting_count < 10 then
    update public.club_sessions
    set waitlist_alert_claimed_at = null,
        waitlist_full_alerted_at = null
    where id = p_session_id;
  end if;
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
  perform private.promote_session_waitlist(p_session_id);
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
  perform private.promote_session_waitlist(p_session_id);
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
  perform private.promote_session_waitlist(p_session_id);
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
  delete from public.session_waitlist where session_id = p_session_id;
  update public.club_sessions
  set status = 'closed',
      closed_at = now(),
      waitlist_alert_claimed_at = null,
      waitlist_full_alerted_at = null
  where id = p_session_id and status = 'active';
  if not found then
    raise exception 'active_session_not_found';
  end if;
end;
$$;

create or replace function public.claim_waitlist_full_alert(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.club_sessions%rowtype;
  v_waiting_count integer;
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;
  select * into v_session from public.club_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'active' then
    return jsonb_build_object('claimed', false);
  end if;
  select count(*) into v_waiting_count
  from public.session_waitlist
  where session_id = p_session_id;
  if v_waiting_count < 10 or v_session.waitlist_full_alerted_at is not null then
    return jsonb_build_object('claimed', false);
  end if;
  if v_session.waitlist_alert_claimed_at is not null
    and v_session.waitlist_alert_claimed_at > now() - interval '2 minutes' then
    return jsonb_build_object('claimed', false);
  end if;

  update public.club_sessions
  set waitlist_alert_claimed_at = now()
  where id = p_session_id;
  return jsonb_build_object(
    'claimed', true,
    'session_name', v_session.name,
    'court_count', v_session.court_count,
    'waiting_count', v_waiting_count
  );
end;
$$;

create or replace function public.finish_waitlist_full_alert(p_session_id uuid, p_succeeded boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_required';
  end if;
  update public.club_sessions
  set waitlist_full_alerted_at = case when p_succeeded then now() else null end,
      waitlist_alert_claimed_at = null
  where id = p_session_id and status = 'active';
end;
$$;

revoke all on function private.promote_session_waitlist(uuid) from public, anon, authenticated;
revoke all on function public.check_in_to_session(uuid) from public, anon;
revoke all on function public.join_session_waitlist(uuid) from public, anon;
revoke all on function public.leave_session_waitlist(uuid) from public, anon;
revoke all on function public.leave_club_session(uuid) from public, anon;
revoke all on function public.admin_remove_player_from_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_session_capacity(uuid, integer) from public, anon, authenticated;
revoke all on function public.close_club_session(uuid) from public, anon, authenticated;
revoke all on function public.claim_waitlist_full_alert(uuid) from public, anon, authenticated;
revoke all on function public.finish_waitlist_full_alert(uuid, boolean) from public, anon, authenticated;

grant execute on function public.check_in_to_session(uuid) to authenticated;
grant execute on function public.join_session_waitlist(uuid) to authenticated;
grant execute on function public.leave_session_waitlist(uuid) to authenticated;
grant execute on function public.leave_club_session(uuid) to authenticated;
grant execute on function public.admin_remove_player_from_session(uuid, uuid) to service_role;
grant execute on function public.update_session_capacity(uuid, integer) to service_role;
grant execute on function public.close_club_session(uuid) to service_role;
grant execute on function public.claim_waitlist_full_alert(uuid) to service_role;
grant execute on function public.finish_waitlist_full_alert(uuid, boolean) to service_role;
