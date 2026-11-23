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
