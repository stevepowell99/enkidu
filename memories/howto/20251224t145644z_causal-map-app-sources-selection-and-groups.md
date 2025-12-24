---
title: Causal Map App: Sources selection and groups
created: 2025-12-24T14:56:44Z
tags: sources,ui,filters,links-pipeline,grouping
importance: 1
source: sources_ingest
source_ref: memories/sources/verbatim/89552ac3e10d_060-sources-bar-sourcesheader.md
original_path: content/999 Causal Map App/060 Sources Bar ((sourcesHeader)).md
---

- Allows selecting one or more source documents within the current project to focus analysis.
- The Create Links panel shows the text of the selected sources; only their links are fetched in the Links Pipeline.
- The Sources Dropdown lists all source IDs, supports search, and defaults to the first source when loading a project; an empty selection means all sources.
- Ordering is alphabetical by source title (leading 'Source ' stripped), with fallback to ID if title is missing.
- The Source Groups sub-panel lets you filter by metadata fields using a Field dropdown and a Value multi-select, for example by demographics or document characteristics.
- Deterministic sampling controls exist (e.g., Random 5/10), with the same results if re-clicked due to seeded behavior; there is also a Clear button.
- The dropdown acts as a loader that loads corresponding sources into the Sources selector and into the links pipeline; this is not a saved/restored filter in the URL. A similar filter exists in Analysis Filters.

Source: content/999 Causal Map App/060 Sources Bar ((sourcesHeader)).md

Why: Captures how to select and group sources for focused, repeatable causal analysis in the app.
