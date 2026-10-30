-- Supabase / Postgres schema for the All-in-One Personal Productivity app.
-- Every table carries a user_id. With accounts enabled (bottom of this file)
-- it defaults to auth.uid() and Row Level Security limits each user to their
-- own rows.
--
-- Apply via the Supabase SQL editor, then set VITE_SUPABASE_URL and
-- VITE_SUPABASE_ANON_KEY in your .env.

create extension if not exists "pgcrypto";

create table if not exists banks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  name text not null check (length(trim(name)) between 1 and 40),
  kind text not null default 'bank' check (kind in ('savings', 'bank', 'cash', 'ewallet')),
  color text not null default '#6fa9d6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  opening_balance numeric(16, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  from_bank_id uuid null references banks (id) on delete set null,
  to_bank_id uuid null references banks (id) on delete set null,
  amount numeric(16, 2) not null check (amount > 0),
  date date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (from_bank_id is distinct from to_bank_id or from_bank_id is null)
);

create table if not exists budget_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  name text not null check (length(trim(name)) between 1 and 40),
  color text not null default '#6faf5b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default 'wallet',
  monthly_budget numeric(14, 2) not null check (monthly_budget > 0),
  categories text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  category text not null,
  date date not null,
  note text not null default '',
  account_id uuid null references budget_accounts (id) on delete set null,
  bank_id uuid null references banks (id) on delete set null,
  created_at timestamptz not null default now()
);

-- For databases created before budget accounts and banks existed:
alter table transactions
  add column if not exists account_id uuid null references budget_accounts (id) on delete set null;
alter table transactions
  add column if not exists bank_id uuid null references banks (id) on delete set null;

create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  name text not null,
  frequency jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  habit_id uuid not null references habits (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  project_id uuid null references projects (id) on delete set null,
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  position double precision null,
  created_at timestamptz not null default now()
);

-- For databases created before manual ordering existed:
alter table tasks add column if not exists position double precision null;

create index if not exists idx_transactions_date on transactions (date desc);
create index if not exists idx_transactions_account on transactions (account_id);
create index if not exists idx_transactions_bank on transactions (bank_id);
create index if not exists idx_transfers_date on transfers (date desc);
create index if not exists idx_completions_habit on habit_completions (habit_id);
create index if not exists idx_tasks_project on tasks (project_id);
create index if not exists idx_tasks_status on tasks (status);

-- ===========================================================================
-- Accounts (EPIC 09): profiles, per-user rows, profile pictures.
-- Safe to re-run.
-- ===========================================================================

-- One profile per Supabase Auth user. Passwords live in auth.users (hashed by
-- Supabase); this table only holds what the app shows.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '' check (length(display_name) <= 40),
  avatar_url text null,          -- null = default cat avatar
  insight_image_url text null,   -- null = default cat on the Overview insight card
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
drop policy if exists "profiles: read own" on profiles;
create policy "profiles: read own" on profiles
  for select to authenticated using (auth.uid() = id);
drop policy if exists "profiles: insert own" on profiles;
create policy "profiles: insert own" on profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "profiles: update own" on profiles;
create policy "profiles: update own" on profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Users may edit only what the app lets them edit (not id, email or created_at).
revoke all on profiles from anon;
revoke insert, update, delete on profiles from authenticated;
grant select on profiles to authenticated;
grant insert (id, email, display_name) on profiles to authenticated;
grant update (display_name, avatar_url, insight_image_url, updated_at) on profiles to authenticated;

-- Create the profile row when someone signs up (email or Google/Apple/Facebook).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Every data row belongs to the signed-in user: user_id defaults to auth.uid()
-- (the app never sends it) and RLS hides everyone else's rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'banks', 'transfers', 'budget_accounts', 'transactions',
    'habits', 'habit_completions', 'projects', 'tasks'
  ] loop
    execute format('alter table %I alter column user_id set default auth.uid()', t);
    execute format('create index if not exists %I on %I (user_id)', 'idx_' || t || '_user', t);
    execute format('alter table %I enable row level security', t);
    -- Explicit grants: newer projects may not auto-expose new tables to the API.
    execute format('revoke all on table %I from anon', t);
    execute format('grant select, insert, update, delete on table %I to authenticated', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format(
      'create policy "own rows" on %I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end
$$;

-- Rows created before accounts existed have user_id = null and are now hidden.
-- To hand them to one account, run (replace the email):
--   do $$ declare uid uuid := (select id from auth.users where email = 'you@example.com');
--   begin
--     update banks set user_id = uid where user_id is null;
--     update transfers set user_id = uid where user_id is null;
--     update budget_accounts set user_id = uid where user_id is null;
--     update transactions set user_id = uid where user_id is null;
--     update habits set user_id = uid where user_id is null;
--     update habit_completions set user_id = uid where user_id is null;
--     update projects set user_id = uid where user_id is null;
--     update tasks set user_id = uid where user_id is null;
--   end $$;

-- Profile pictures and insight photos. Public read (URLs are unguessable),
-- writes limited to the user's own folder: profile-images/<user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "profile images: insert own" on storage.objects;
create policy "profile images: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "profile images: update own" on storage.objects;
create policy "profile images: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "profile images: delete own" on storage.objects;
create policy "profile images: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Make the API see the new tables right away.
notify pgrst, 'reload schema';
