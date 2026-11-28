create extension if not exists pgcrypto;

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  google_sub  text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists runs (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  wins        smallint not null check (wins between 0 and 82),
  losses      smallint not null check (losses between 0 and 82 and wins + losses = 82),
  po_wins     smallint not null check (po_wins between 0 and 16),
  champion    boolean not null,
  result      text not null check (char_length(result) <= 60),
  hard        boolean not null,
  era_from    smallint not null check (era_from between 1950 and 2100),
  era_to      smallint not null check (era_to between 1950 and 2100 and era_to >= era_from),
  era_label   text not null check (char_length(era_label) <= 30),
  score       integer not null check (score between 0 and 5000),
  roster      jsonb not null,
  achievements jsonb not null
);
create index if not exists runs_user_created on runs(user_id, created_at desc);
create index if not exists runs_score on runs(score desc);

-- Server-driven drafts: the secret never leaves the server, so a client cannot predict or choose its rolls.
create table if not exists drafts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  sim_version text not null,
  secret      text not null,
  hard        boolean not null,
  era_from    smallint not null check (era_from between 1950 and 2100),
  era_to      smallint not null check (era_to between 1950 and 2100 and era_to >= era_from),
  spins       smallint not null default 0,
  skips       smallint not null default 0 check (skips between 0 and 2),
  cur_team    text,
  picks       jsonb not null default '[]'::jsonb,
  season_seed bigint,
  status      text not null default 'open' check (status in ('open', 'drafted', 'submitted', 'void')),
  attempts    smallint not null default 0
);
create index if not exists drafts_user_created on drafts(user_id, created_at desc);

-- A run is only verified when the server replayed the season itself. Older runs stay in the player's history but
-- never reach the leaderboard.
alter table runs add column if not exists draft_id    uuid unique references drafts(id) on delete set null;
alter table runs add column if not exists verified    boolean not null default false;
alter table runs add column if not exists sim_version text;
alter table runs add column if not exists log         jsonb;

-- Competitions: 'nba' (82 games) and 'el' (EuroLeague, 38 games). Run once; safe to repeat.
alter table drafts add column if not exists comp text not null default 'nba' check (comp in ('nba', 'el'));
alter table runs   add column if not exists comp text not null default 'nba' check (comp in ('nba', 'el'));
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'runs'::regclass and contype = 'c'
     and (pg_get_constraintdef(oid) like '%wins%' or pg_get_constraintdef(oid) like '%losses%') and conname not like 'runs_comp%' loop
    execute format('alter table runs drop constraint %I', c.conname);
  end loop;
end $$;
alter table runs drop constraint if exists runs_games_check;
alter table runs add constraint runs_games_check check (wins >= 0 and losses >= 0 and po_wins between 0 and 16 and wins + losses = case comp when 'el' then 38 else 82 end);
create index if not exists runs_comp_score on runs(comp, score desc);

-- Progression: XP and coins are only ever added by the server from a verified season; cosmetics are appearance only.
alter table users add column if not exists xp       integer not null default 0 check (xp >= 0);
alter table users add column if not exists coins    integer not null default 0 check (coins >= 0);
alter table users add column if not exists equipped jsonb   not null default '{}'::jsonb;
alter table runs  add column if not exists xp       integer not null default 0;
create table if not exists user_items (
  user_id uuid not null references users(id) on delete cascade,
  item    text not null check (char_length(item) <= 40),
  bought_at timestamptz not null default now(),
  primary key (user_id, item)
);

-- One bonus re-spin per draft, earned by watching a rewarded ad (the client asks, the server counts it).
alter table drafts add column if not exists bonus smallint not null default 0 check (bonus between 0 and 1);
alter table drafts drop constraint if exists drafts_skips_check;
alter table drafts add constraint drafts_skips_check check (skips between 0 and 3);
