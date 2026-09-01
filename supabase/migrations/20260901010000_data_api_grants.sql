-- The Supabase project keeps automatic Data API grants disabled. Grant only
-- the privileges the authenticated application and Edge Function need; RLS
-- remains the final authorization boundary for authenticated users.

grant usage on schema public to authenticated, service_role;

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;

grant select, insert, update, delete on public.publications to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update, delete on public.assets to authenticated;
grant select on public.completion_records to authenticated;

grant all privileges on public.profiles to service_role;
grant all privileges on public.publications to service_role;
grant all privileges on public.posts to service_role;
grant all privileges on public.assets to service_role;
grant all privileges on public.completion_records to service_role;

grant execute on function public.is_admin() to authenticated, service_role;

revoke all privileges on public.profiles from anon;
revoke all privileges on public.publications from anon;
revoke all privileges on public.posts from anon;
revoke all privileges on public.assets from anon;
revoke all privileges on public.completion_records from anon;
