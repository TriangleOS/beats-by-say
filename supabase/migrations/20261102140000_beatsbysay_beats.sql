-- Beats by Say on the shared Triangle OS project. Only saved beats live here; the artist name is kept
-- in the user's own sign-in metadata. Safe to run twice (the deploy workflow re-runs every migration).
create table if not exists public.beatsbysay_beats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  prompt text not null default '' check (char_length(prompt) <= 2000),
  bpm integer not null default 90,
  music_key text not null default '',
  mood text not null default '',
  description text not null default '',
  spec jsonb not null check (pg_column_size(spec) <= 32768),
  created_at timestamptz not null default now()
);
create index if not exists beatsbysay_beats_user_idx on public.beatsbysay_beats (user_id, created_at desc);

alter table public.beatsbysay_beats enable row level security;
revoke all on public.beatsbysay_beats from anon;
grant select, insert, update, delete on public.beatsbysay_beats to authenticated;
grant all on public.beatsbysay_beats to service_role;

drop policy if exists "beatsbysay owners read" on public.beatsbysay_beats;
create policy "beatsbysay owners read" on public.beatsbysay_beats
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "beatsbysay owners insert" on public.beatsbysay_beats;
create policy "beatsbysay owners insert" on public.beatsbysay_beats
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "beatsbysay owners update" on public.beatsbysay_beats;
create policy "beatsbysay owners update" on public.beatsbysay_beats
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "beatsbysay owners delete" on public.beatsbysay_beats;
create policy "beatsbysay owners delete" on public.beatsbysay_beats
  for delete to authenticated using (auth.uid() = user_id);
