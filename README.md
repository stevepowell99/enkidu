# Enkidu (local-first assistant)

Single-file Node app (`enkidu.js`) + file-based memory store (`memories/`) + editable prompts (`instructions/`).

## Concept (from `enkidu.md`)
- **Goal**: a personal assistant with a file-based memory architecture (inspired by Letta/MemGPT-style ideas).
- **System instruction**: enforced by Cursor project rules (not editable by Enkidu).
- **Soft architecture**: keep “what dreaming means” in editable text instructions where possible (`instructions/*.md`), not hard-coded behavior.
- **Operations**:
  - **work**: answer requests using system instruction + work instruction + retrieved context
  - **dream**: reorganise/update memory + (optionally) update instructions
  - **restructure**: improve the instruction/memory architecture to get better context selection
- **Future (not implemented yet)**: background autonomy, Gmail/Drive/tools, cloud hosting (Netlify+Supabase style)

## Requirements
- Node.js 18+

## Environment
Put these in `.env` (or real env vars):
- `OPENAI_API_KEY` (required)
- `OPENAI_BASE_URL` (optional, default `https://api.openai.com/v1`)
- `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
- `OPENAI_EMBEDDING_MODEL` (optional, default `text-embedding-3-small`)

## Commands
- `node enkidu.js serve --port 3000` (UI)
- `npm run serve:watch` (UI dev restart; watches `enkidu.js` + `instructions/*.md`)
- `node enkidu.js work "..."` (CLI work)
- `node enkidu.js capture --title "..." --tags "a,b" --text "..."` (manual memory note)
- `node enkidu.js dream --model gpt-5-mini` (autonomous memory re-org + diary; model optional)
- `node enkidu.js embed` (rebuild/update memory embeddings cache; normally automatic)

## Core architecture (terse)

### Memory store (writable)
- `memories/inbox|people|projects|howto/*.md`: curated memory notes
  - front matter supports: `title`, `created`, `tags`, `importance: 0..3`, `source`, etc
- `memories/sessions/recent.jsonl`: rolling session log (episodic memory)
- `memories/diary/*.md`: dream diary entries

### Generated caches (gitignored)
- `memories/_index.json`: index of memory notes (paths + metadata + preview + importance)
- `memories/_embeddings.json`: embeddings cache for memory notes (hash + vector per note)
- `memories/_source_embeddings.json`: embeddings cache for stored verbatim sources

### Instructions (soft architecture)
- `instructions/work.md`: system prompt for `work` (also defines `===WEB_FETCH===` + `===CAPTURE===`)
- `instructions/dream.md`: system prompt for `dream` (can edit `memories/` + `instructions/`, not code)
- `instructions/sources.md`: system prompt for ingesting a source file into a curated memory note

## Work pipeline (heuristic-first)
1. **Heuristic router** decides whether to include recency and whether to do AI query expansion.
2. **Recency** (if needed): include recent turns from `memories/sessions/recent.jsonl`.
3. **Retrieval**:
   - embeddings retrieval over `memories/` (weighted by `importance`)
   - optional AI query expansion for vague prompts
4. **Sources retrieval** (if ingested): embeddings retrieval over `memories/sources/verbatim/`.
   - default excerpt size: 4k chars
   - if prompt asks for “verbatim / quote / full text”: include up to 20k chars
5. **Answer call** → response + `===CAPTURE=== ...` (auto-capture writes to inbox and updates embeddings)

UI shows:
- “Used memories” (and their importance)
- “Used sources”

## Dream
- Dream can modify only `memories/` and `instructions/`.
- It cannot edit `enkidu.js` or the generated caches.
- After dream edits, embeddings are refreshed incrementally (hash-based).

## Sources (ingest)
UI “Sources (ingest)”:
- select a folder of `.md` files (subfolders allowed)
- click **Ingest**
- server writes:
  - verbatim store: `memories/sources/verbatim/*.md` (read-only)
  - curated memory notes filed to `memories/{inbox,people,projects,howto}/`
  - source embeddings for later retrieval
