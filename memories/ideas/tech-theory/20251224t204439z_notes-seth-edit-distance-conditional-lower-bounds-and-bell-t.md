---
id: e75a0af2a8ebeb67bfc0d1e4
title: Notes: SETH, edit-distance conditional lower bounds, and Bell-test summary
created: 2025-12-24T20:44:39Z
tags: SETH, P-vs-NP, k-SAT, edit-distance, conditional-lower-bounds, algorithms, complexity, quantum, Bell-test
importance: 2
source: sources_ingest
source_ref: memories/sources/verbatim/a61bd9a82d81_20251224t204302z-ideas-part06.md
original_path: pasted/20251224t204302z_ideas_part06.md
source_set: ideas

source_set_context: things i am learning like social science etc
---

- SETH (Strong Exponential Time Hypothesis): a sharper conjecture than P≠NP that essentially says you cannot asymptotically beat exhaustive search for k-SAT.
- Researchers use SETH as a precise hardness assumption and reductions to derive airtight conditional lower bounds for other problems.
- Indyk & Bačkurs: used SETH to relate k-SAT hardness to edit-distance, arguing (conditional on SETH) there is no substantially faster algorithm for edit distance — with big practical implications for genome-scale tasks.
- These are not unconditional impossibility proofs; they are strong evidence connecting problems. Refuting SETH could follow from finding a faster algorithm for a connected problem (e.g., edit distance).
- Ryan Williams: attempts to refute SETH have produced valuable algorithmic and lower-bound advances — illustrating SETH's dual role as a working hypothesis and a research tool for mapping complexity.
- Also present in this file: notes on a Nature article reporting a near-loophole-free Bell test (quantum 'spookiness' confirmed), useful as a short reminder of that experimental result.

Key quotes:
- "It's like 'P not equal to NP' on turbochargers." — Scott Aaronson on SETH's sharpness.
- "A more accurate way of phrasing it would be that [our result] is strong evidence that the edit-distance problem doesn't have a more efficient algorithm than the one we already have." — Indyk (on conditional result).
- "If I want to refute SETH, I just have to solve edit distance faster." — Ryan Williams (flip of perspective).

Source: pasted/20251224t204302z_ideas_part06.md

Why: Captures a concise summary of how SETH provides precise conditional lower bounds (not proofs) linking NP-hardness to practical problems like edit distance, and notes a related quantum Bell-test article.
