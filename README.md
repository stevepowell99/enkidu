# Enkidu (personalised assistant)

Minimal Netlify app (static Bootstrap UI + Netlify Functions)

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
- Pages have creation date, tags, key-value tags, unique IDs, and also a field to store ID of "next" page in a conversation.
- There also are a smallish but extensible number of high-level pages eg
  - User style preferences eg be succinct.....
  - User bio
  - Strategies for "dreaming" (see below)
- As much as possible, functionality is provided by soft coding via the hi level pages, IE user and Enkidu can change/adapt them on the fly
- If we think this will work well enough, we will create embeddings for each page using current best in-browser system. Not sure whether to have a parallel system of full embeddings from a large eg gemini model too
- Can be used offline just for standard search and recall, saving notes, etc. I will use it both on phone and computer. sync challenge is resttricted to consolidating any work done offline.
- Dreaming
  - This is something that happens in down time: Enkidu works fairly randomly through the pages, improving organisation primarily with tags, identifying near duplicates etc
- Recall panel
  - A large editable field containing the markdown source of the page in edit mode, and html in read mode. 
    - User can directly create new pages here
  - A list of closely related pages according to timestamp, tags, thread (prev/next

## Requirements
- Node.js 18+

## Environment
Put these in `.env` (or real env vars). See `env.example`.
- `ENKIDU_ADMIN_TOKEN` (required; keep private)
- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required; server-side only; use Supabase \"secret\" key)
- `GEMINI_API_KEY` (required; server-side only)
- `GEMINI_MODEL` (optional; default `gemini-1.5-flash`)


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



## Clickable buttons
Any text Enkidu outputs in the format `[alphaNoSpaces]` becomes a clickable button. Click it to send that text as your next message.

Examples: `[A]` `[Yes]` `[Tell-me-more]` `[Next]`

## Spaced repetition

Uses clickable buttons for testing:

1. **High-importance memories** (`importance: 2-3`) are automatically included for testing.
2. **Optional**: manually tag memories with `spaced-rep: 1-3`.
3. **Ask for a quiz** — "test me", "give me a question", etc.
4. **Click your answer** — Enkidu outputs `[A]` `[B]` `[C]` `[D]` `[E]` as clickable buttons.
5. **Automatic priority**:
   - Correct → priority -1 (ask less often)
   - Wrong → priority +1 (ask more often)
6. **Follow-up questions welcome** — fully conversational after answering.



The system picks questions with weighted randomness: high-priority items are tested more frequently. Dream will auto-tag high-importance notes with `spaced-rep: 3` going forward.