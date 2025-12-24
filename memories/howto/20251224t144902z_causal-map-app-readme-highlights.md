---
title: Causal Map App README highlights
id: 3e9d5fdd265f8ec77e98b536
created: 2025-12-24T14:49:02Z
tags: causal-map,help-system,anchors,internal-links,mermaid
importance: 2
source: sources_ingest
source_ref: memories/sources/verbatim/f697222d4fa7_readme.md
original_path: content/Trash-mine/README.md
---

- Purpose and structure: The README outlines the Causal Map App's help system, section anchors, internal vs external links, Mermaid diagrams, and how documentation content is structured across the app.
- Stable anchors and mapping: Use {#stable-id} for sections with contextual help; ensures anchors persist if heading text changes; update help-manager.js mapping to stable IDs.
- Link behavior: Internal links (starting with #) navigate inside the help/guide; external links open in new tabs; internal links get internal-help-link class; drawer navigation uses navigateToSectionById; standalone guide uses scrollToSection.
- Mermaid diagrams: Use mermaid code blocks; Mermaid.js v10.6.1 loaded; diagrams rendered via initializeMermaidDiagrams after content loads.
- Getting started and usage: Covers Getting Started section, sample projects like example-short-[username] and example-short, and how to access help and documentation.

Source: content/Trash-mine/README.md

Why: This memo captures core behavior and anchors used in the Causal Map app's help system for quick reference.
