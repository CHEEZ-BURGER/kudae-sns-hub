alter table public.profiles add column if not exists username text;

update public.profiles as profile
set username = coalesce(nullif(auth_user.raw_user_meta_data ->> 'username', ''), split_part(auth_user.email, '@', 1))
from auth.users as auth_user
where auth_user.id = profile.id and profile.username is null;

create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

do $$ begin
  alter table public.profiles add constraint profiles_username_format
    check (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
exception when duplicate_object then null;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  next_username text;
begin
  next_username := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)));
  insert into public.profiles (id, email, username)
  values (new.id, new.email, next_username)
  on conflict (id) do update set email = excluded.email, username = excluded.username;
  return new;
end;
$$;
