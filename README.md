# Enkidu (Node.js MVP)

Local-first file-based personal assistant (CLI + tiny Bootstrap UI).

## Requirements
- Node.js **18+** (uses built-in `fetch`)

## Setup

Put these in `.env` (or real env vars):
- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, default: `gpt-4o-mini`)
- `OPENAI_BASE_URL` (optional, default: `https://api.openai.com/v1`)

Note: the UI model dropdown shows **placeholder** prices (`$?/1M`) because I couldn't reliably fetch current pricing in this environment. You can still select any model id, and you can always type a custom model id.

## CLI commands

- Init folders + index:
  - `node enkidu.js init`

- Capture a memory note:
  - `node enkidu.js capture --title "..." --tags "tag1,tag2" --text "..."`

- Rebuild index:
  - `node enkidu.js index`

- Ask Enkidu something:
  - `node enkidu.js work "your prompt here"`

- Run dream (autonomous; writes a diary entry):
  - `node enkidu.js dream`

## UI

- Start local UI server:
  - `node enkidu.js serve --port 3000`

Then open `http://localhost:3000`.

### Dev auto-restart

- Auto-restart when `enkidu.js` or `instructions/*.md` changes:
  - `npm run serve:watch`

## Files
- `instructions/work.md`: editable instruction for `work`
- `instructions/dream.md`: editable instruction for `dream`
- `memories/`: source of truth
- `memories/diary/`: dream diary entries
- `memories/_index.json`: generated index (gitignored)
