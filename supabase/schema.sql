-- Enkidu v0 schema (Supabase Postgres)
-- Purpose: store all content as "pages" (rows), with lightweight threading support.

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- Core table: pages
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Optional: group pages into a conversation/thread
  thread_id uuid null,

  -- Optional: simple threading link (forward pointer)
  next_page_id uuid null references public.pages(id) on delete set null,

  -- Optional: short human label (shown in recall list)
  title text null,

  -- Markdown source of the page (the canonical content)
  content_md text not null,

  -- Simple tags and key-value tags for soft-coded behaviors
  tags text[] not null default '{}'::text[],
  kv_tags jsonb not null default '{}'::jsonb
);

-- Keep updated_at fresh on updates
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pages_set_updated_at on public.pages;
create trigger trg_pages_set_updated_at
before update on public.pages
for each row
execute function public.set_updated_at();

-- Minimal indexes for speed (keep it small)
create index if not exists pages_created_at_idx on public.pages (created_at desc);
create index if not exists pages_thread_created_at_idx on public.pages (thread_id, created_at desc);
create index if not exists pages_tags_gin_idx on public.pages using gin (tags);
create index if not exists pages_kv_tags_gin_idx on public.pages using gin (kv_tags);

-- Full-text search on content (simple, no generated columns)
create index if not exists pages_content_fts_idx
on public.pages using gin (to_tsvector('english', content_md));


