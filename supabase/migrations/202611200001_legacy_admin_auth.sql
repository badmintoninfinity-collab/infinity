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

alter table public.club_sessions alter column created_by drop not null;
alter table public.matches alter column created_by drop not null;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.role()) = 'service_role', false);
$$;

revoke all on function public.review_player(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_club_session(text, integer) from public, anon, authenticated;
revoke all on function public.update_session_capacity(uuid, integer) from public, anon, authenticated;
revoke all on function public.close_club_session(uuid) from public, anon, authenticated;
revoke all on function public.admin_remove_player_from_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_start_match(uuid, integer, uuid[]) from public, anon, authenticated;
revoke all on function public.admin_finish_match(uuid, integer, smallint) from public, anon, authenticated;

grant execute on function public.review_player(uuid, boolean) to service_role;
grant execute on function public.create_club_session(text, integer) to service_role;
grant execute on function public.update_session_capacity(uuid, integer) to service_role;
grant execute on function public.close_club_session(uuid) to service_role;
grant execute on function public.admin_remove_player_from_session(uuid, uuid) to service_role;
grant execute on function public.admin_start_match(uuid, integer, uuid[]) to service_role;
grant execute on function public.admin_finish_match(uuid, integer, smallint) to service_role;
