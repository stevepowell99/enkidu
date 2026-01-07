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
- There also are a smallish but extensible number of high-level "preference cards" pages eg
  - User style preferences eg be succinct.....
  - User bio
  - Strategies for "dreaming" (see below)
- As much as possible, functionality is provided by soft coding via the hi level pages, IE user and Enkidu can change/adapt them on the fly
- Can be used offline just for standard search and recall, saving notes, etc. I will use it both on phone and computer. sync challenge is resttricted to consolidating any work done offline.
- Dreaming
  - This is something that happens in down time: Enkidu works fairly randomly through the pages, improving organisation primarily with tags, identifying near duplicates etc. also searches to make relevant updates to the preference cards so just gets increasingly delightful results over time. Also provide missing Summaries and adjust Title if necessary
  - Dreaming could use slower/cheaper API?
  - Dreaming prompt instructions are another Card.
  - When dreaming finished, add a page called a dream diary to summarise what was done, and if appropriate a preference Card called Tags Guide which explains the tagging system
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
    - Related pages list almost immediately loads , just may already see a relevant result, if not, user can optionally click checkbox on some of the related pages to add these to the payload, then just clicks request button and question is submitted to ai with additional payload of user preference cards etc, . Choice of models to use. 
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
  - `POST /api/chat`: calls Gemini + saves *each* user message and assistant reply as separate pages (same `thread_id`)
  - `GET /api/pages`: list + substring search (`q`) + filters (`tag`, `thread_id`)
  - `POST /api/pages`: create page
  - `GET/PUT/DELETE /api/page?id=...`: fetch/update/delete a page
  - `GET /api/tags`: returns distinct tags (from recent pages)
  - `GET /api/models`: lists available Gemini models for your API key (ListModels)
  - `GET /api/threads`: lists recent chat threads (dropdown labels are latest timestamps, desc)
- **Gemini model selection**
  - UI dropdown populated from `/api/models`
  - Default is `gemini-3-flash-preview` (when available)
- **Secret blocking**: refuses to save content that looks like a secret (simple heuristics)
- **Tag suggestions applied automatically**
  - If assistant replies end with `{\"enkidu_meta\":{...}}`, backend strips it from visible reply and applies:
    - `suggested_title` -> saved assistant page title
    - `suggested_tags` -> merged into saved assistant page tags (always includes `chat`)
    - `suggested_kv_tags` -> merged into saved assistant page kv_tags (forces `role: assistant`)
- **UI (Bootstrap, single page)**
  - Chat panel with Enter-to-send (Shift+Enter newline), thread dropdown, model dropdown
  - Recall panel with search, list, edit markdown, preview, save/delete
  - When recall search is empty, recall list auto-populates with “related pages” based on chatbox text (client-side token overlap)

## Open questions (decisions we have not made yet)

- **Auth**: keep `ENKIDU_ADMIN_TOKEN`, or switch to simplest email/password auth (Supabase Auth)? !!LEAVE IT
- **UI**: keep Bootstrap, or replace with a minimal custom light/dark theme? !!LEAVE IT
- **Schema**: add `summary`, `prev_page_id`, !!YES reminders, and/or a links table? !!NOT YET
- **Recall ranking**: what should the mixer be (time vs tags vs embeddings vs text similarity), and what presets? !!YES, make up some presets eg time only, tags only, text similarity only (we don't have embeds yet) and mixed.
- **Dreaming**: when/how it runs, what it’s allowed to change, and what is logged in “dream diary”. !!YEs but atm just manual run on click button. diary just logs a summary of pages affected and overview of what was done
- **Offline**: which features must work offline vs read-only vs none. !!NOT YET

## Next steps (practical increments)

1. **Preference cards**: define a few stable kinds (e.g. `style`, `bio`, `strategy`) and a system prompt page format. !! DO IT
2. **Recall “payload checkbox”**: allow selecting related pages to include in chat context explicitly. !! DO IT
3. **Embeddings**: decide in-browser vs server, storage strategy, and rollout order (below). !! NOT YET

## Next step: feasibility of in-browser embeddings

Yes, **in-browser embeddings are feasible** for a “personal” scale, but there are tradeoffs.

- **Feasible**:
  - Use an in-browser embedding model (WASM/WebGPU) to embed `content_md` locally.
  - Store vectors in **IndexedDB** for fast local similarity search (offline-capable).
  - Good for “show related pages as you type” without server cost.
- **Tradeoffs**:
  - Initial download/compute cost (especially on mobile).
  - Model quality is usually lower than server embeddings, but often “good enough” for recall.
  - If you want cross-device sync of vectors, you’ll eventually want server-side storage (e.g. Supabase + `pgvector`), which implies a schema change.
- **Suggested rollout** (minimal + reversible):
  - Start **client-only embeddings** + IndexedDB for recall similarity.
  - Keep server schema unchanged for now; later decide if/when to add `pgvector` for sync/search at scale.

## Requirements
- Node.js 18+

## Environment
Put these in `.env` (or real env vars). See `env.example`.
- `ENKIDU_ADMIN_TOKEN` (required; keep private)
- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required; server-side only; use Supabase \"secret\" key)
- `GEMINI_API_KEY` (required; server-side only)
- `GEMINI_MODEL` (optional; default `gemini-3-flash-preview`)


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

### App usage
- Open the site, paste your admin token into the top-right input, click **Save**.
- Chat is saved as pages tagged `chat` with `kv_tags.role` set to `user` / `assistant`.
- Recall lets you search and edit pages as markdown.

## Not implemented yet (kept as ideas)

- Clickable buttons / spaced repetition
- File upload + URL ingestion
- Graph view (Obsidian-style)
- Reminders
- Chrome extension