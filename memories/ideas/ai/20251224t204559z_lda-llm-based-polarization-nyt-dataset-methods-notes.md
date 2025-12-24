---
id: 0c14966650bdeabea4412ce3
title: LDA + LLM-based polarization — NYT dataset & methods (notes)
created: 2025-12-24T20:45:59Z
tags: ideas, topic-modeling, LDA, dynamic-topic-models, polarization, LLMs, GPT-3.5, dataset, grounded-theory, methods, prompts, systems-change, references
importance: 2
source: sources_ingest
source_ref: memories/sources/verbatim/415f06a4fcde_20251224t204302z-ideas-part11.md
original_path: pasted/20251224t204302z_ideas_part11.md
source_set: ideas

source_set_context: things i am learning like social science etc
---

- Dataset: daily captures of NYT "Most emailed" and "Most shared on Facebook" lists from 2019-01-01 to 2021-05-30; 13,508 unique articles collected with metadata and full text.
- Topic modeling: used Latent Dirichlet Allocation (LDA) to recover topic distributions per article; dynamic topic models (Blei & Rafferty) referenced for temporally evolving corpora.
- Polarization measurement: used LLMs (GPT-3.5-turbo) to generate polarization scores (three types); LLM scores validated against human survey ratings as a scalability check.
- Key empirical note: articles shared on both email and Facebook were less polarized after the elections; the drop was larger for Facebook; overall no significant post-election increase in polarization for social shares vs email.
- Other methods & refs: highlights/metadata for managerial & organizational cognition chapter (Hodgkinson et al., 2017) and grounded theory intro (Vollstedt & Rezat, 2019) with notes on axial coding, theoretical sampling, and criteria for grounded theory quality.
- Practical note: Omnivore highlight on prompts for systems-change work — start high-level to avoid premature narrowing and explicitly request a systems-change/systems-dynamics perspective or a specific framework (e.g., Causal Layered Analysis).

Key quotes:
- "What prompts help me explore a systemic issue? Sometimes I like to start with very specific and deep prompts... I always start by asking for a systems change perspective." (Omnivore highlight)
- "A news article is considered politically polarizing if the content, text, and opinions expressed diverge away from the center and are closer to either of the extreme ends of the ideological spectrum." (definition note)

Source: pasted/20251224t204302z_ideas_part11.md

Why: Concise capture of a reusable dataset, the LDA→LLM workflow for measuring polarization, and supporting methodological refs & prompt guidance for future media/polarization research or systems-change facilitation.
