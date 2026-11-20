alter table public.profiles
  add column if not exists gender text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_gender_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_gender_check
      check (gender is null or gender in ('L', 'P'));
  end if;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gender text;
begin
  v_gender := new.raw_user_meta_data ->> 'gender';
  if v_gender is null or v_gender not in ('L', 'P') then
    raise exception 'gender_required';
  end if;

  insert into public.profiles (id, email, display_name, gender)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'Pemain'), '@', 1)),
    v_gender
  );
  return new;
end;
$$;
