-- Enkidu: minimal Supabase schema (MVP)
-- Purpose: allow Netlify-hosted Enkidu to work without relying on the local filesystem.
-- Notes:
-- - Auth/RLS intentionally deferred (single-user via server-side service role key for now).
-- - Embeddings/pgvector intentionally deferred until you want semantic search in hosted.

-- -----------------------------
-- memories: main knowledge store
-- -----------------------------
create table if not exists public.memories (
  id bigserial primary key,
  -- Keep existing repo semantics: a "path-like" identifier (e.g. memories/inbox/....md)
  path text not null unique,
  title text,
  -- Store tags as text array (simple, queryable)
  tags text[] not null default '{}',
  content text not null default '',
  importance integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memories_path_idx on public.memories (path);
create index if not exists memories_created_at_idx on public.memories (created_at desc);

-- ---------------------------------
-- sources: optional source documents
-- ---------------------------------
create table if not exists public.sources (
  id bigserial primary key,
  path text not null unique,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sources_path_idx on public.sources (path);

-- ---------------------------------------------
-- session_events: replaces local recent.jsonl
-- ---------------------------------------------
create table if not exists public.session_events (
  id bigserial primary key,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists session_events_created_at_idx on public.session_events (created_at desc);


