create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  issue_number text not null,
  title text not null,
  share_token text not null unique,
  share_token_hash text not null unique,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid not null references auth.users(id),
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index publications_share_token_hash_idx on public.publications (share_token_hash);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications(id) on delete cascade,
  title text not null,
  body text not null default '',
  article_url text,
  credits text,
  group_name text not null default '',
  match_confidence numeric(4,3),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index posts_publication_position_idx on public.posts (publication_id, position);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  width integer,
  height integer,
  original_path text not null,
  optimized_path text,
  thumbnail_path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index assets_post_position_idx on public.assets (post_id, position);

create table public.completion_records (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  platform text not null check (platform in ('Instagram','Facebook','X')),
  assignee text not null check (char_length(assignee) between 1 and 60),
  completed_at timestamptz not null default now(),
  unique (post_id, platform)
);

alter table public.profiles enable row level security;
alter table public.publications enable row level security;
alter table public.posts enable row level security;
alter table public.assets enable row level security;
alter table public.completion_records enable row level security;

create policy "profile owner can read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage publications" on public.publications for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage posts" on public.posts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage assets" on public.assets for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read completions" on public.completion_records for select to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sns-assets', 'sns-assets', false, 52428800, array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml'])
on conflict (id) do update set public = false;

create policy "admins upload sns assets" on storage.objects for insert to authenticated
with check (bucket_id = 'sns-assets' and public.is_admin());
create policy "admins read sns assets" on storage.objects for select to authenticated
using (bucket_id = 'sns-assets' and public.is_admin());
create policy "admins update sns assets" on storage.objects for update to authenticated
using (bucket_id = 'sns-assets' and public.is_admin()) with check (bucket_id = 'sns-assets' and public.is_admin());
create policy "admins delete sns assets" on storage.objects for delete to authenticated
using (bucket_id = 'sns-assets' and public.is_admin());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger publications_touch_updated_at before update on public.publications for each row execute procedure public.touch_updated_at();
