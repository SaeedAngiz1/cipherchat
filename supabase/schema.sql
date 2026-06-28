-- supabase/schema.sql
-- Run this in the Supabase SQL editor (or via `supabase db push`) to
-- provision the tables that the Supabase adapter in src/db.ts expects.
--
-- For the demo we disable RLS; production must add per-user and per-group
-- row-level policies so users only see their own data.

create table if not exists public.users (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
create index if not exists users_username_idx on public.users ((data->>'username'));

create table if not exists public.groups (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
create index if not exists groups_code_idx on public.groups ((data->>'code'));
create index if not exists groups_memberids_gin on public.groups using gin ((data->'memberIds'));

create table if not exists public.messages (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);
create index if not exists messages_group_idx on public.messages ((data->>'groupId'));
create index if not exists messages_dm_idx on public.messages ((data->>'toUserId'));

create table if not exists public.keypairs (
  user_id text primary key,
  data jsonb not null
);

create table if not exists public.group_keys (
  group_id text not null,
  user_id text not null,
  data jsonb not null,
  primary key (group_id, user_id)
);

alter table public.users disable row level security;
alter table public.groups disable row level security;
alter table public.messages disable row level security;
alter table public.keypairs disable row level security;
alter table public.group_keys disable row level security;
