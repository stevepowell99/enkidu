---
id: e2a27a7c56bbc0573d8a1417
title: dplyr data-masking + assorted article highlights (2025-12-24)
created: 2025-12-24T20:46:54Z
tags: ideas, programming, dplyr, tidyselect, data-masking, highlights, film, music, politics, food
importance: 1
source: sources_ingest
source_ref: memories/sources/verbatim/50c791307593_20251224t204302z-ideas-part15.md
original_path: pasted/20251224t204302z_ideas_part15.md
source_set: ideas

source_set_context: things i am learning like social science etc
---

- dplyr / data-masking: two common indirection cases
  - If the variable is a function argument (a quosure/promise), use embracing: filter(df, {{ var }}).
  - If the env-variable is a character name, index .data with [[ ]]: summarise(df, mean = mean(.data[[var]])).
  - Note: .data is a special pronoun (not a data frame) that supports .data$x or .data[[var]] but not arbitrary data-frame operations.
- Programmatic names & dynamic dots
  - Use := to generate names programmatically.
  - If name is in env-variable, use glue syntax: name <- "susan"; tibble("{name}" := 2).
  - If name derives from a data argument, use embracing: tibble("{{x}}_2" := x * 2) inside a function.
- tidyselect DSL essentials
  - tidyselect lets you pick columns by position, helpers (starts_with, ends_with, last_col()), and predicates (where(is.numeric)).
  - When selecting with a character vector from the env, use all_of() (strict) or any_of() (lenient) to control missing-variable behavior.
- Other saved highlights (brief)
  - Film: Danis Tanović — visual trademark: close-ups/extreme close-ups, focus on hands; Cirkus Columbia and Death in Sarajevo noted.
  - Music/people: notes on Beatles/Clapton/George Harrison/Patty Boyd and songs Something, Layla, Wonderful Tonight.
  - Shere Hite: The Hite Report (1976) found many women orgasm via clitoral stimulation; faced strong backlash and renounced US citizenship.
  - Politics: David Edgerton on Conservatives abandoning transformative/decabonising capitalism — "party of rentiers for rentiers".
  - Food/history: Nicholas Saunders credited with changing British food culture and alternative/DIY publishing in 1970s.

Key quotes:
- "Note that .data is not a data frame; it’s a special construct, a pronoun, that allows you to access the current variables either directly, with .data$x or indirectly with .data[[var]]."
- "The Tory party is a party of rentiers for rentiers; its electorate is old and propertied." 

Source: pasted/20251224t204302z_ideas_part15.md

Why: Remember practical dplyr masking/selection patterns and retain salient article highlights for later reading or reference.
