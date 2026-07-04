-- ============================================================
-- Consensus Sleep Diary - Supabase schema
-- Paste this whole file into: Supabase Dashboard > SQL Editor > Run
-- ============================================================

-- 1. Profiles: one row per user, created automatically on signup
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'patient' check (role in ('patient','doctor')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Diary entries: raw CSD answers, one row per patient per morning
create table if not exists public.entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  q1 text, q2 text, q3 text, q4 text, q5 text,
  q6 text, q7 text, q8 int, q9 text,
  want_wake text,   -- "what time did you want to wake up?" (supplementary)
  oob_min text,     -- minutes out of bed during the night (asked when WASO > 20)
  submitted_at timestamptz default now(),
  unique (user_id, date)
);

-- 3. Wellbeing notes
create table if not exists public.notes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- 4. Row Level Security: patients only see their own data;
--    the doctor (role='doctor') can read everything.
alter table public.profiles enable row level security;
alter table public.entries  enable row level security;
alter table public.notes    enable row level security;

create or replace function public.is_doctor()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'doctor') $$;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for select using (id = auth.uid() or public.is_doctor());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid());

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "doctor reads entries" on public.entries;
create policy "doctor reads entries" on public.entries
  for select using (public.is_doctor());

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "doctor reads notes" on public.notes;
create policy "doctor reads notes" on public.notes
  for select using (public.is_doctor());

-- 5. AFTER Dr. Papatheodosiou logs into the app once, run this
--    (with her real email) to make her the doctor:
-- update public.profiles set role = 'doctor' where email = 'persa@example.com';
