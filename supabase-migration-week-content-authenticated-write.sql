-- Restrict week_content management to users with admin access (public.is_admin()).
-- Run in Supabase SQL Editor to remove broad authenticated-write access.

drop policy if exists "Admins can manage week_content" on public.week_content;
drop policy if exists "Authenticated can insert week_content" on public.week_content;
drop policy if exists "Authenticated can update week_content" on public.week_content;
drop policy if exists "Authenticated can delete week_content" on public.week_content;

create policy "Authenticated can insert week_content"
on public.week_content for insert
with check (public.is_admin());

create policy "Authenticated can update week_content"
on public.week_content for update
using (public.is_admin())
with check (public.is_admin());

create policy "Authenticated can delete week_content"
on public.week_content for delete
using (public.is_admin());
