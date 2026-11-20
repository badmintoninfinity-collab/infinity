insert into public.profiles (id, email, display_name, role, approval_status)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(u.email, 'Pemain'), '@', 1)
  ),
  'player',
  'pending'
from auth.users u
on conflict (id) do nothing;
