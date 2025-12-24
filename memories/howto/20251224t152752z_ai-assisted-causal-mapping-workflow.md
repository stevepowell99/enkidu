---
title: AI-assisted causal mapping workflow
created: 2025-12-24T15:27:52Z
tags: causal-mapping, AI, evaluation, workflow, methodology, canonical
importance: 2
source: sources_ingest
source_refs:
 - memories/sources/verbatim/d501ba36354c_a-workflow-for-collecting-and-understanding-stories-at-scale-summary-eval2025.md
 - memories/sources/verbatim/e05d461abb56_a-workflow-for-collecting-and-understanding-stories-at-scale-eval2025.md
original_paths:
 - memories/howto/20251224t152752z_ai-assisted-causal-mapping-workflow.md
 - memories/inbox/20251224t154328z_ai-assisted-causal-mapping-workflow.md (merged)
 - memories/howto/20251224t151142z_ai-assisted-causal-mapping-workflow-for-stories-at-scale.md (archived)
---

This canonical note consolidates the project-level summaries and inbox drafts about an AI-assisted causal mapping pipeline for extracting causal claims from narrative data. It is intended as the single reference for the workflow and its key caveats, with provenance recorded above.

Core idea
- An AI-assisted causal mapping pipeline ("causal QDA"): (1) AI interviewer to collect stories at scale; (2) automated extraction/autocoding of causal claims (cause → effect) with supporting quotes; (3) clustering/harmonisation of labels; (4) analysis via causal maps and targeted queries.

Key steps (end-to-end)
1. AI interviewer collects narrative accounts using a structured but open protocol. Monitor acceptability and bias.
2. Autocoding: LLM extracts candidate causal claims and supporting quotes; record provenance (source id, text span, confidence/metadata).
3. Post-processing: clustering/harmonisation of factor labels; human review of clusters and edge labels.
4. Analysis: build maps, run robustness checks (source counts, thread counts, max-flow/min-cut where appropriate), and produce interpretive summaries.

Performance & metrics reported
- Evaluate acceptability of AI interviewing, autocoding time/cost, recall/precision of extraction compared with human coders, and coverage of overview maps. Use these to triage human checks.

Interpretation & limits
- Use the pipeline to sketch causal landscapes and triage hypotheses rather than to adjudicate single high-stakes causal claims without human checks.
- Outputs depend on clustering choices and human decisions; strength of evidence is about provenance and corroboration, not model-derived magnitudes.
- Ethical and data-protection risks exist when using third-party LLM APIs; consider local models or secure processing where required.

Why canonicalise
- Multiple near-duplicate summaries and inbox drafts existed; this file merges the stable guidance and points readers to original verbatim sources for verification.

Merged notes
- Combined content from memories/inbox/20251224t154328z_ai-assisted-causal-mapping-workflow.md and memories/howto/20251224t151142z_ai-assisted-causal-mapping-workflow-for-stories-at-scale.md. The latter has been moved to memories/cleanup (archived) to preserve provenance of the draft.

Source provenance
- See source_refs above for the original draft summaries and verbatim ingests. For quotes and direct excerpts, consult the verbatim source files in memories/sources/verbatim/.
