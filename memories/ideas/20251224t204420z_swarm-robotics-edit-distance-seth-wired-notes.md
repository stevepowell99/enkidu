---
id: 13cf627ee024bf03184f583e
title: Swarm robotics & edit-distance/SETH (Wired notes)
created: 2025-12-24T20:44:20Z
tags: ideas, collective-behavior, swarm-robotics, Boids, complexity-theory, SETH, edit-distance
importance: 1
source: sources_ingest
source_ref: memories/sources/verbatim/bf084a7fda21_20251224t204302z-ideas-part05.md
original_path: pasted/20251224t204302z_ideas_part05.md
source_set: ideas

source_set_context: things i am learning like social science etc
---

- Lab demo of "Beluga" underwater robots used to test collective-behavior models: swimming robots meant to follow simple local rules to perform tasks (track gradients, avoid redundancy).
- Major practical obstacles: delayed responses, hull asymmetries and messy real-world engineering that break simple-simulation rules.
- Research context: attempts to make physical quadcopters and UAVs flock using only neighbor info (Vicsek) or network theory + Boids; applications include autonomous cars (collision avoidance).
- Couzin's vision: instrument animals (Kinect/IR aviaries, miniature sensors on birds) to combine neural/physiological data with group movement to study real-group decision mechanisms.
- Separate piece: MIT paper proving current best edit-distance algorithm optimal contingent on SETH (strong exponential time hypothesis).
- Key implication: the impossibility result depends on SETH (unproven), so claims of finality are premature; misinterpretation could harm future funding and research directions.

Key quotes:
- "If we just apply the simple rules developed by us and Iain, it doesn’t work. They tend to overshoot their mark, because they do not slow down enough." — Tamás Vicsek
- "We could then really understand how these animals gain information from each other, communicate, and make decisions." — Iain Couzin

Source: pasted/20251224t204302z_ideas_part05.md

Why: Captures practical limits of simple collective models and a conditional theoretical limitation (SETH) that both shape future research choices and funding priorities.
