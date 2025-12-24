---
title: AI-assisted causal mapping: validation and workflow
created: 2025-12-24T15:28:15Z
tags: causal-mapping, AI, NLP, qualitative-data, provenance, evaluation
importance: 2
source: sources_ingest
source_ref: memories/sources/verbatim/f1df281b5e2d_ai-assisted-causal-mapping-summary-validation.md
original_path: 000 Articles/AI-assisted causal mapping -- Summary (validation).md


source_set_context: our publications on causal mapping and summaries of them
---

- Goal: evaluate whether an untrained LLM can identify and label causal claims in qualitative interview stories as useful, compared with human expert coding; focus is on validity/usefulness of causal-claim extraction.
- Core framing: causal mapping vs systems modelling. In causal mapping, an edge signals evidence that X influences Y or a stakeholder claims X influences Y; output is a repository of evidence with provenance, not a predictive model.
- Naive coding definition: avoids philosophical detail; codes undifferentiated causal influence; no effect size; no causal inference; no separate polarity field; coding is where a causal claim exists and what it influences.
- Data/criterion: QuIP evaluation (2019) of an Agriculture and Nutrition Programme; dataset hand-coded by experts; validation subset: 3 sources, 163 statements, ~15 A4 pages.
- Extraction procedure: implemented via the Causal Map web app using GPT-4.0; temperature 0; generate exhaustive, transparent list of claims with verbatim quotes; synthesis by causal mapping algorithms later; exclusions: ignore hypotheticals/wishes; output per claim: statement ID + quote + influence factor + consequence factor.
- Validation variants: Variant 1 open coding (radical zero-shot) with no codebook; multi-pass prompting; Variant 2 codebook-assisted (closed-ish) with partial codebook and hierarchical labels.
- Metrics, results, and utility: Precision (four criteria) for human-rated endpoints; Variant 1: 180 links; 84% perfect (8/8); Variant 2: 172 links; 87% perfect (8/8); Recall proxy due to lack of true ground truth; utility: overview maps broadly similar when aggregated; scope/risks: small sample, single dataset; labeling decisions vary; not suitable for high-stakes adjudication without checks.
- Source: 000 Articles/AI-assisted causal mapping -- Summary (validation).md

Why: Documents a reproducible AI-assisted causal-mapping workflow and its validation results, enabling reuse in future methodological notes.
