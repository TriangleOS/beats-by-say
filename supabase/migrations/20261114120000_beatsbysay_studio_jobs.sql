-- Studio engine jobs (recorded-quality audio from the external music model). One row per paid task, so
-- the server can cap each artist's daily use and only let them poll their own tasks. Artists can read
-- and add their own rows but never change or delete them, so the daily cap can't be reset.
-- Safe to run twice.
create table if not exists public.beatsbysay_studio_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null unique check (char_length(task_id) <= 200),
  kind text not null check (kind in ('generate', 'stems')),
  parent_task_id text check (char_length(parent_task_id) <= 200),
  prompt text not null default '' check (char_length(prompt) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists beatsbysay_studio_jobs_user_idx
  on public.beatsbysay_studio_jobs (user_id, kind, created_at desc);

alter table public.beatsbysay_studio_jobs enable row level security;
revoke all on public.beatsbysay_studio_jobs from anon;
revoke update, delete on public.beatsbysay_studio_jobs from authenticated;
grant select, insert on public.beatsbysay_studio_jobs to authenticated;
grant all on public.beatsbysay_studio_jobs to service_role;

drop policy if exists "beatsbysay studio jobs read" on public.beatsbysay_studio_jobs;
create policy "beatsbysay studio jobs read" on public.beatsbysay_studio_jobs
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "beatsbysay studio jobs insert" on public.beatsbysay_studio_jobs;
create policy "beatsbysay studio jobs insert" on public.beatsbysay_studio_jobs
  for insert to authenticated with check (auth.uid() = user_id);
