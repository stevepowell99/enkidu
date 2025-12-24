---
id: bf61a3554bba288ef17af53e
title: LLM engineering & alignment notes (prompts, RAG, agents)
created: 2025-12-24T20:52:18Z
tags: ideas, ai-alignment, prompting, RAG, embeddings, agents, evaluation, systems-thinking, topic-modeling, privacy
importance: 1
source: sources_ingest
source_ref: memories/sources/verbatim/89af2a089faa_20251224t204302z-ideas-part40.md
original_path: pasted/20251224t204302z_ideas_part40.md
source_set: ideas

source_set_context: things i am learning like social science etc
---

- Alignment: as models become superhuman, human supervision may fail; treat alignment as an empirical ML problem with experiments rather than pure thought experiments.
- Prompting & workflows: start simple, prefer decomposing complex tasks into small focused prompts/steps; multi-turn flows and structured intermediate outputs improve reliability.
- In-context learning: use n-shot examples (rule of thumb n ≥ 5; sometimes dozens) but beware over-anchoring and prompt bloat (2k+ token "frankenstein" prompts can worsen common-case performance).
- Testing & evaluation: create unit tests (≥3 criteria) from production samples; use LLM-as-judge with pairwise comparisons for more stable evals; use deterministic plan generation + structured execution to reduce agent nondeterminism.
- Retrieval vs fine-tuning: prefer RAG over fine-tuning for adding/updating knowledge; long context windows don't eliminate the need for selection and reasoning over relevant info.
- Embeddings & search: embeddings help semantic similarity but fail on precise keyword/id queries; BM25/keyword search still useful — "vector embeddings do not magically solve search."  Nearest-neighbor on naive embeddings can be noisy.
- Systems thinking: policy/structure feedback loops matter (Pierson's "policies carve rivers"); consider sociopolitical feedback when designing AI systems.

Key quotes:
- "Fundamentally, I think AI alignment is an ML problem."
- "Vector embeddings do not magically solve search."

Source: pasted/20251224t204302z_ideas_part40.md

Why: Condenses practical guidance and warnings for building reliable LLM systems and frames alignment as an empirical ML research problem.
