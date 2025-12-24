---
title: AI-assisted causal mapping validation: goals, data and procedure
id: bc84563d8ea60685b07b0f1a
created: 2025-12-24T15:44:08Z
tags: causal-mapping, AI, evaluation, QA
importance: 2
source: sources_ingest
source_ref: memories/sources/verbatim/f1df281b5e2d_ai-assisted-causal-mapping-summary-validation.md
original_path: 000 Articles/AI-assisted causal mapping -- Summary (validation).md


source_set_context: our publications on causal mapping and summaries of them
---

- Goals: Test whether an "untrained LLM" can "identify and label causal claims" in qualitative interview “stories” well enough to be useful, compared with “human expert coding” (a criterion study).
- Core framing: causal mapping vs systems modelling. In causal mapping, an edge means there is evidence that X influences Y / a stakeholder claims X influences Y; outputs are a repository of evidence with provenance.
- Data reference: Corpus from a QuIP evaluation (2019) of an “Agriculture and Nutrition Programme”; 3 sources, 163 statements, ~15 A4 pages; used as a criterion study.
- Extraction procedure: via the Causal Map web app using GPT‑4.0; temperature set to 0 for reproducibility; aim to produce an exhaustive, transparent list of claims with verbatim quotes; exclusions: ignore hypotheticals/wishes; per-claim output: statement ID + quote + influence factor + consequence factor.
- Validation variants: Variant 1 — open coding ("radical zero-shot"); no codebook; multi-pass prompting; Variant 2 — codebook-assisted ("closed-ish"); adds a partial codebook; hierarchical labels.
- Metrics: Precision (four criteria) and Recall (proxy); Variant 1: 180 links; perfect composite score (8/8) for 84% of links; Variant 2: 172 links; perfect (8/8) for 87% of links.
- Utility and scope: maps broadly similar at top level; AI and human overview maps are broadly similar; suitable for mapping how people think and building auditable evidence sets; not for high-stakes adjudication without checking.
- Risks: small sample; potential batching/inconsistency; not ground truth due to granularity; imprint caution on coding decisions.
- Source: Source: 000 Articles/AI-assisted causal mapping -- Summary (validation).md

Why: Shows how AI-assisted causal mapping performs relative to human coding, outlining data, methods, and limitations for reuse.
