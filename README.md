# Enkidu (personalised assistant)

Minimal Netlify app (static Bootstrap UI + Netlify Functions)

> Fundamental principle: we are trying to build a genuinely useful personal assistant that can learn, adapt, and improve its behaviour. The most important thing is how the system improves its own work organisation over time without hard-coding too much.

## Concept 

Enkidu

- This app is a General purpose ai assistant for both personal and professional use
- It replaces all my chat bots, knowledge base, spaced repetition system....
- I will be the only user.
- It will use my Gemini API keys
- Data is saved in "pages" which are rows in a SQL table.
- We will use pgsql at supabase. The app will be pushed to GitHub and from there hosted at netlify. 
- Any pages trying to save text containing highentropy secrets will fail with a warning
- 
- Basically 2 parts to the UI: a standard chat bot (which also restores from history) and a "recall" panel to find and display past pages
- There also are a smallish but extensible number of high-level **base pages** (they are just normal pages distinguished by tags) e.g.
  - `*system` (system prompt)
  - `*style` / `*bio` / `*strategy` / `*lesson` (preference base pages)
  - `*dream-prompt` (dreaming instructions)
  - `*split-prompt` (instructions for splitting content into multiple pages)
- As much as possible, functionality is provided by soft-coding via these base pages, i.e. user and Enkidu can change/adapt them on the fly
- Can be used offline just for standard search and recall, saving notes, etc. I will use it both on phone and computer. sync challenge is resttricted to consolidating any work done offline.
- Dreaming
  - This is something that happens in down time: Enkidu works fairly randomly through the pages, improving organisation primarily with tags, identifying near duplicates etc. also searches to make relevant updates to preference base pages so just gets increasingly delightful results over time. Also provide missing Summaries and adjust Title if necessary
  - Dreaming could use slower/cheaper API?
  - Dreaming prompt instructions are a base page (`*dream-prompt`).
  - When dreaming finished, add a page called a dream diary to summarise what was done, and if appropriate a base page called Tags Guide which explains the tagging system
  - 
- Recall panel
  - A large editable field containing the markdown source of the page in edit mode, and html in read mode. Not yet sure UX wise how this is related to the last chat box, eg they could be shared between the two panels, ie the editable field is also the last message in the chat conversation,? Maybe it's best if they remain separate but by default mirror one another. But when user uses search etc to put other pages on focus, this is not mirrored in the chat box. Make a suggestion.
    - User can directly create new pages here
    - Supports sanitised mermaid diagrams, and json or CSV tables
  - A list of closely related pages according to timestamp, tags, thread (prev/next in conversatioin if applicable), embedding similarity, possibly fuzzy text similarity, plus an easy way to change the relative importance of these criteria like a sound mixer with presets
  - Optionally a graph view like Obsidian
  - A search box which then filters the related pages list by the same criteria
  - Next/previous buttons to page through the pages list, or directly click on pages on the list to load them
  - Additional file browser to upload and parse multiple pdfs, folders of markdowns etc and add them as multiple new pages with appropriate tag metadata . Plus ability to add single web URLs which can be similarly parsed, stripping navigation etc text
-  Usage examples
  - User types a question into chat box 
    - Related pages list almost immediately loads , just may already see a relevant result, if not, user can optionally click checkbox on some of the related pages to add these to the payload, then just clicks request button and question is submitted to ai with additional payload of base pages etc, . Choice of models to use. 
    - Request is added as a page
    - Response returned and displayed and added as a page. Previous page id is added.
    - Conversation continues
  - User just types remind me about x at ten am tomorrow (reminder functionality)
  - User uses file browser to directly add new pages
  - User uses file browser or url to add documents to a chat payload 
  - (spaced repetition functionality) user says create flashcards from all the pdfs I added today. Enkidu creates them (in a separate table?) and tests user during quiz time. User can say, quiz me with today's cards but only French, etc
  - Is in-browser local AI good enough to be able to parse instructions like show me the notes I made yesterday about x? Or update those pages, adding the tag Y?
    - I would rather not use dumb regex for this. But perhaps we can have a list of day fifty such canonical commands and a local LLM can see if the entered text matches any of them close enough?
- Finally, make a minimal chrome browser extension for side loading only, not chrome web store 
  - Right click a webpage or link to add add a new page 
  - Optional sidebar does pages related to this page via embeddings and/or text similarity
  
## What is implemented (v0 today)

- **Storage**: Supabase Postgres `public.pages` table (see `supabase/schema.sql`)
  - Fields: `title`, `content_md`, `tags`, `kv_tags`, `thread_id`, `next_page_id`, timestamps
- **Auth**: single shared token `ENKIDU_ADMIN_TOKEN` (Bearer token on every `/api/*` call)
- **Netlify Functions API** (see `netlify/functions/`)
  - `POST /api/chat`: calls Gemini + runs a simple **agent loop** and saves chat under a `thread_id`
    - **New threads (current default)**: stored as **one page per thread** (a growing transcript). Each user/assistant turn is appended to that page (`kv_tags.thread_format="transcript_v1"`). UI parses it into bubbles.
    - **Legacy threads (until backfill)**: stored as many pages (one per bubble) sharing the same `thread_id`.
    - **Context payload**: UI can select pages (checkboxes in Recall list) and send them as `context_page_ids` to be injected into the system instruction for that chat request
    - **Soft-coded system prompt**: system prompt comes from the most recent `*system` base page
    - **Prompt cards excluded from normal chat injection**: `*dream-prompt` / `*split-prompt`
    - **Optional page splitting**: if the assistant reply ends with `{\"enkidu_meta\":{...}}` containing `new_pages`, the backend creates those pages silently
    - **Optional web search grounding**: UI toggle “Web search” sends `use_web_search: true` which enables the agent tool `web_search` (Gemini `google_search` grounding)
    - **Agent loop (tool use)**:
      - The model must respond with a JSON envelope `{\"enkidu_agent\":{...}}` of type:
        - `plan` (a short plan bubble)
        - `tool_call` (one tool invocation)
        - `final` (final answer)
      - The server executes allowlisted tools and feeds the result back to the model, iterating up to a small cap.
      - Note: in transcript-mode threads we currently store only user/assistant turns in the transcript page (we do not persist per-step tool bubbles).
    - **Agent allowlisted tools** (no raw SQL):
      - `search_pages`: substring search + filters over `public.pages`
      - `related_pages`: semantic vector search using pgvector (`rpc/match_pages`) from a query string
      - `related_to_page`: semantic vector search using pgvector from an existing page id
      - `related_to_most_recent_page`: semantic vector search using pgvector from the most recent page (optional filters)
      - `get_page`: fetch one page by id
      - `create_page`: create a page (writes DB)
      - `update_page`: update a page by id (writes DB; allowed fields only)
      - `delete_page`: delete a page (writes DB)
      - `web_search`: (only when `use_web_search: true`) uses Gemini `google_search` grounding and returns a concise markdown answer
  - `GET /api/pages`: list + substring search (`q`) + filters (`tag`, `thread_id`)
  - `POST /api/pages`: create page
  - `GET/PUT/DELETE /api/page?id=...`: fetch/update/delete a page
  - `GET /api/tags`: returns distinct tags (from recent pages)
  - `GET /api/models`: lists available Gemini models for your API key (ListModels)
  - `GET /api/threads`: lists recent chat threads (dropdown labels are latest activity timestamps, desc)
  - `POST /api/dream`: manual Dream run (UI button) that updates some recent pages (titles/tags/kv_tags) per the `*dream-prompt` base page, then writes a `*dream-diary` page summarising changes
- **Gemini model selection**
  - UI dropdown populated from `/api/models`
  - Default is `gemini-3-flash-preview` (when available)
- **Secret blocking**: refuses to save content that looks like a secret (simple heuristics)
- **Base pages (soft-coded prompts/preferences)**
  - All are just normal pages; behaviour is driven by tags:
    - `*system` (system prompt; most recent wins)
    - `*style`, `*bio`, `*strategy`, `*lesson` (preference base pages; a few recent are concatenated)
    - `*dream-prompt` (dreaming instructions; used by `/api/dream`)
    - `*split-prompt` (reserved for future “split into pages” UX; currently excluded from normal chat injection)
- **Behavioral tags + KV tags (current)**
  - **Plain tags that change behaviour**
    - `*chat`: marks chat message pages; used for thread listing + UI thread reload/related-by-default.
    - `*system`: base page for the system prompt; most recent wins; excluded from Dream candidates.
    - `*style`, `*bio`, `*strategy`, `*habits`, `*preference`, `*lesson`: preference base pages injected into chat (recent few concatenated). `*preference` is also excluded from Dream candidates.
    - `*dream-prompt`: Dream instructions page used by `POST /api/dream`; excluded from normal chat injection and from Dream candidates.
    - `*split-prompt`: reserved for future “split into pages” UX; excluded from normal chat injection.
    - `*dream-diary`: pages written by Dreaming to summarise what changed; excluded from Dream candidates.
  - **Kind tags (convention)**
    - These are mutually-exclusive “what is this page” tags: `*chat | *note | *preference | *bio | *strategy | *task | *decision | *question`.
    - Chat bubbles are always tagged `*chat` (the backend strips other kind tags from `enkidu_meta.suggested_tags` on chat messages to avoid mixing kinds).
  - **KV tags that change behaviour**
    - `role`: `"user"` / `"assistant"`; used to reconstruct chat roles for Gemini + used by UI to filter chat history.
    - `thread_title`: used to label threads in the thread dropdown (preferred over page `title` when present).
    - `source`: set to `"assistant"` on pages created via `enkidu_meta.new_pages` (stored; not otherwise used yet).
    - `kind` / `updated`: written on Dream diary pages as `{ kind: "dream", updated: <n> }` (stored; not otherwise used yet).
  - **Model footer meta that changes behaviour**
    - If the assistant reply ends with a JSON footer containing `enkidu_meta`, the backend consumes:
      - `suggested_title`, `suggested_tags`, `suggested_kv_tags`, `suggested_thread_title`
      - `new_pages` (array of pages to create, each with `title`, `content_md`, `tags`, `kv_tags`)
- **Tag suggestions applied automatically (assistant -> backend)**
  - If assistant replies end with `{\"enkidu_meta\":{...}}`, backend strips it from visible reply and applies:
    - `suggested_title` -> saved assistant page title
    - `suggested_tags` -> merged into saved assistant page tags (always includes `*chat`)
    - `suggested_kv_tags` -> merged into saved assistant page kv_tags (forces `role: assistant`)
- **UI (Bootstrap, single page)**
  - Chat panel with Enter-to-send (Shift+Enter newline), thread dropdown, model dropdown
  - Recall list rows have a **payload checkbox** (selected pages are included in the next chat request)
  - Recall panel with search, list, edit markdown, preview, save/delete
  - When recall search is empty, recall list auto-populates with “related pages” based on chatbox text (client-side token overlap), with presets: Mixed / Time only / Tags only / Text only
  - Quick-create buttons for base pages: System / Style / Bio / Strategy / Dream prompt / Split prompt
  - Keyboard shortcuts (only when focus is NOT in a text box):
    - `Del` (or `y`): delete current page and any checked Related/Payload pages
    - `x`: toggle payload checkbox for the current page (in the visible Related list)
    - `j`: focus/open next page in the visible Related list
    - `k`: focus/open previous page in the visible Related list
    - `/`: focus chat input
    - `t`: focus tag filter
    - `n`: new thread
    - `w`: toggle web search on/off
    - (removed) `r`: Live related toggle was removed (use the Chat “Search” button to refresh Recall/Related)

## Open questions (decisions we have not made yet)

- **Auth**: keep `ENKIDU_ADMIN_TOKEN`, or switch to simplest email/password auth (Supabase Auth)? !!LEAVE IT
- **UI**: keep Bootstrap, or replace with a minimal custom light/dark theme? !!LEAVE IT
- **Schema**: add `summary`, `prev_page_id`, !!YES reminders, and/or a links table? !!NOT YET
- **Recall ranking**: current presets exist, but the scoring is still very rough (token overlap + tag overlap + slight recency). Decide if/when to change the weights/heuristics.
- **Dreaming**: it’s manual (button) and writes a `*dream-diary` page; decide the stable JSON output format for the dream model (updates + summary) and the allowed mutation scope (tags only vs titles vs kv_tags).
- **Offline**: which features must work offline vs read-only vs none. !!NOT YET

## Next steps (practical increments)

1. **Base pages (formalise)**: define the stable tags + minimal templates for `*system`, `*style`, `*bio`, `*strategy`, `*dream-prompt`, `*split-prompt` (what each should contain, and what it is allowed to do).
2. **Dreaming prompt content**: write a good `*dream-prompt` base page so Dreaming produces reliable JSON updates and a useful diary summary.
3. **Split prompt UX**: decide how you want to invoke “split into pages” (button? chat instruction?), and wire it to actually use the `*split-prompt` base page.
4. **Embeddings (server-side pgvector)**: implemented. On every page create/update, the backend generates a Gemini embedding and stores it in `public.pages.embedding` (pgvector).
   - Schema: `supabase/schema.sql` enables `vector` and adds `embedding vector(768)` + `embedding_model` + `embedding_updated_at`.
   - Backend: Netlify functions write embeddings on every insert/update that touches `public.pages`.
   - Existing pages: run `POST /api/backfill-embeddings?limit=25` repeatedly until it reports fewer than `limit` updated.
   - Background backfill: `netlify/functions/backfill-embeddings-cron.js` runs every 15 minutes and embeds up to `ENKIDU_EMBEDDING_BACKFILL_LIMIT` pages (default 25).

## Requirements
- Node.js 18+

## Environment
Put these in `.env` (or real env vars). See `env.example`.
- `ENKIDU_ADMIN_TOKEN` (required; keep private)
- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required; server-side only; use Supabase \"secret\" key)
- `GEMINI_API_KEY` (required; server-side only)
- `GEMINI_MODEL` (optional; default `gemini-3-flash-preview`)
- `GEMINI_EMBED_MODEL` (optional; default `text-embedding-004`)


## Local development (single mode: UI + API same-origin)

The simplest reliable local mode is **one Node server** that runs the API (Express) and serves the UI (`public/`) from the same origin.

### Setup (PowerShell)
```powershell
# Create local env file (do NOT commit real values)
Copy-Item env.example .env

# Edit .env and set:
# ENKIDU_ADMIN_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (and optionally GEMINI_MODEL/GEMINI_EMBED_MODEL)
notepad .env
```

### Run
```powershell
npm start
```

Then open `http://localhost:8080` and paste the same admin token into the UI.

### Run on a different port
```powershell
$env:PORT=9999; npm start
```

Then open `http://localhost:9999`.

### Optional: Netlify CLI mode (not recommended)

You *can* run `netlify dev`, but `lambda-local` has a hard ~30s timeout per function and you will hit it with slow Gemini calls. Prefer `npm start` for local work.

## Definitive request routing map (UI → API)

The UI (in `public/app.js`) always calls API paths like `/api/chat`, `/api/pages`, etc. Where those calls go depends on the **API base** setting in the UI:

- **API base blank** (default): calls go to the **same origin** as the UI (relative `/api/...`).
  - If the UI is served by Netlify (production) this hits Netlify redirects → Netlify Functions.
  - If the UI is served locally by `npm start` (recommended) this hits Express → the same handlers under `netlify/functions/`.
  - If the UI is served by `netlify dev` (local, optional) this hits lambda-local → Netlify Functions.
- **API base set** (e.g. your Cloud Run URL): calls go to that **API origin** (cross-origin), e.g. `https://<service>-<hash>-<region>.a.run.app/api/...`.

Concretely:

- **Netlify-hosted UI + Netlify Functions API (default “all on Netlify”)**
  - Browser → `https://<your-netlify-site>/api/...`
  - `netlify.toml` redirects `/api/*` → `/.netlify/functions/:splat`
  - Netlify Function runs (`netlify/functions/*.js`)
- **Netlify-hosted UI + Cloud Run API (recommended to avoid serverless timeouts)**
  - In the UI top bar, set **API base** to your Cloud Run origin and click **Save**
  - Browser → `https://<cloud-run-origin>/api/...`
  - Cloud Run runs `server/index.js` (Express) which forwards to the same handlers under `netlify/functions/`
  - You must set `ENKIDU_CORS_ORIGIN` to allow the UI origin(s)

## Hosting (Netlify + Supabase) (git-push deploy)

### Supabase
- Create a new Supabase project.
- Run `supabase/schema.sql` in Supabase SQL editor (creates `public.pages`).

### Netlify
- Import the GitHub repo in Netlify.
- Ensure `netlify.toml` is present (it routes `/api/*` to functions).
- Set Netlify environment variables:
  - `ENKIDU_ADMIN_TOKEN`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL` (optional)

app is deployed at https://enkidu-agent.netlify.app/  

## Alternative hosting: Cloud Run (API-only) + Netlify (UI)

If you hit local dev / serverless time limits (LLM calls can be slow), you can run the same API on Google Cloud Run.

- **UI**: keep hosting `public/` on Netlify (static).
- **API**: deploy the Node server in `server/index.js` to Cloud Run.

### Critical UI setting (Cloud Run)
If your UI is on Netlify (or `netlify dev`) and your API is on Cloud Run, you **must** set the UI top-bar field:

- **API base** = `https://<your-cloud-run-service>.a.run.app`

(If you leave it blank, the UI will keep calling same-origin `/api/...` which routes to Netlify Functions / lambda-local instead of Cloud Run.)

### Env vars (Cloud Run)
Set the same env vars you use for Netlify Functions:
- `ENKIDU_ADMIN_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional)
- `GEMINI_EMBED_MODEL` (optional)

For cross-origin calls from the Netlify UI to Cloud Run, set:
- `ENKIDU_CORS_ORIGIN` to your UI origin (or `*`). You can also use a comma-separated allowlist, e.g. `http://localhost:8888,https://enkidu-agent.netlify.app`.


### App usage
- Open the site, paste your admin token into the top-right input, click **Save**.
- Chat is saved as pages tagged `*chat` with `kv_tags.role` set to `user` / `assistant`.
- Recall lets you search and edit pages as markdown.

## Not implemented yet (kept as ideas)

- Clickable buttons / spaced repetition
- File upload + URL ingestion
- Graph view (Obsidian-style)
- Reminders
- Chrome extension

## Additional Scripts

These live under `scripts/` and are optional helpers for one-off ingestion tasks.

### Import Zotero BibTeX (.bib) into pages (upsert)

File: `scripts/import_zotero_bib_to_pages.py`

**What it does**
- **1 page per BibTeX entry**
- Uses `kv_tags.source="zotero"` + `kv_tags.zotero_citekey="<citekey>"` to identify items.
- Reruns **upsert**:
  - creates new pages for new citekeys
  - updates existing pages only when the BibTeX record changed (`kv_tags.zotero_source_hash`)

**Required environment variables**
- `ENKIDU_BASE_URL` (**API origin**, not “the UI site”), e.g.:
  - Netlify Functions API: `https://enkidu-agent.netlify.app`
  - Cloud Run API: `https://<your-cloud-run-service>.a.run.app`
- `ENKIDU_ADMIN_TOKEN` (same token you paste into the UI)

**Optional environment variables**
- `ENKIDU_ALLOW_SECRETS="1"` (passes `x-enkidu-allow-secrets: 1`)
- `ENKIDU_SKIP_EMBEDDINGS="1"` (passes `x-enkidu-skip-embeddings: 1` to speed up large imports/updates)
  - If you do this, you can backfill embeddings later via `POST /api/backfill-embeddings?limit=25` (repeat until done).

**Usage (PowerShell)**

```powershell
$env:ENKIDU_BASE_URL="https://enkidu-agent.netlify.app"
$env:ENKIDU_ADMIN_TOKEN="YOUR_ADMIN_TOKEN"
python scripts/import_zotero_bib_to_pages.py "C:/Users/Zoom/Zotero-cm/My Library.bib"
```

**Start fresh (dangerous)**

```powershell
python scripts/import_zotero_bib_to_pages.py --purge-existing "C:/Users/Zoom/Zotero-cm/My Library.bib"
```

### Clean Raindrop HTML export (remove extra consecutive link rows)

File: `scripts/clean_raindrop_export_links.py`

**Purpose**
- Raindrop exports are Netscape-bookmark HTML.
- Sometimes you’ll see multiple consecutive `<DT><A ...>` link rows where you expect a single link followed by `<DD><blockquote ...>` note rows.
- This script keeps **only the last** link row in any such consecutive run immediately before the following note block.

**Usage (PowerShell)**

```powershell
python scripts/clean_raindrop_export_links.py "C:/Users/Zoom/Downloads/raindrop_export.html"
```

**Output**
- Writes a sibling file: `raindrop_export_cleaned.html` (same folder as the input).

### Import cleaned Raindrop HTML into `public.pages` (one page per link)

File: `scripts/import_raindrop_html_to_pages.mjs`

**What gets created**
- **1 page per link** (`<DT><A ...>Title</A>`)
- Page **Title** = the link title
- Page **Markdown** (`content_md`) =
  - the markdown link to the URL
  - followed by **all** `<DD><blockquote ...>` note blocks under that link, concatenated with blank lines
- Page `kv_tags` always includes:
  - `source: "raindrop"`
  - `spaced_repetition: 5`

**Required environment variables**
- `ENKIDU_BASE_URL` (your deployed site or local dev URL), e.g. `https://enkidu-agent.netlify.app`
- `ENKIDU_ADMIN_TOKEN` (same token you paste into the UI)

**Optional environment variables**
- `ENKIDU_ALLOW_SECRETS="1"`
  - Sends request header `x-enkidu-allow-secrets: 1` so the backend will allow content that trips the secret heuristics (use carefully).

**Usage (PowerShell)**

```powershell
$env:ENKIDU_BASE_URL="https://enkidu-agent.netlify.app"
$env:ENKIDU_ADMIN_TOKEN="YOUR_ADMIN_TOKEN"
$env:ENKIDU_ALLOW_SECRETS="1"
node scripts/import_raindrop_html_to_pages.mjs "C:/Users/Zoom/Downloads/raindrop_export_cleaned.html"
```

**De-duping on rerun**
- The importer sets `kv_tags.raindrop_import_id` deterministically from the URL + concatenated note text, and skips anything already imported.
- If you imported *before* this `raindrop_import_id` existed, reruns may create duplicates for those older rows; easiest fix is to delete the old Raindrop-imported pages in Recall (filter by KV tags `source=raindrop`) and re-import.