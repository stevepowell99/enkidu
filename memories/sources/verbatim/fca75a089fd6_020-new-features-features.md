---
title: 020-new-features-features
created: 2025-12-24T14:54:20Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: fca75a089fd6
original_path: content/999 Causal Map App/020 New features ((features)).md
---

The previous version of Causal Map, version 3, was already, as far as we know, the only software dedicated to causally coding causal claims within texts. Version 4 improves over Causal Map 3 in the following ways:

### Speed and stability {#speed-and-stability}
- Fast loading and editing
- Resilient to poor internet connectivity 
- Scalable to hundreds or thousands of concurrent users

### Uploading and organising data {#uploading-and-organising-data}
- Simplified data model to make it easier for you to import and manage your sources: we no longer break down source texts into separate statements. We treat each source text as one entire text. In cm4, there is no such thing as a statement.
- Easily create "Custom Columns" for each source (such as gender, location etc)
- Edit the data for your "Custom Columns" with a spreadsheet-like interface
- Complete management of all of your projects
- Simple upload of PDF or DOCX documents
- Tags to help you organise multiple projects
- Note that in cm3 we used to call projects "files"
- You can upload a project exported from cm3 as a new cm4 project

### Managing labels

- New, more powerful and easier to use bulk editing of labels in the [links table](../links-search-replace/) and the [factors table](../factors-search-replace/).

### Filtering and analysing {#filtering-and-analysing}
- Almost all the existing links filters from cm3 are available plus 
  - the option to include multiple versions of the same links filter, e.g. to narrow down a selection of links by different criteria successively
  - optional semantic filters like `cluster` and `soft recode` <span class="badge bg-info text-dark" style="margin-left:6px;">Require an AI subscription</span>
- Analyse data with new pivot tables and graphs

### Sharing and collaborating {#sharing-and-collaborating}
- Anonymous login option so that anyone can view your work without logging in
- URL-based state saving for bookmarking (the same URL always takes you back to the same view)

<span class="badge bg-info text-dark" style="margin-left:6px;">These features require a Team subscription</span>
- Real-time collaboration: Live updates when collaborators add links
- Interactive maps for live demonstrations

### Help system {#help-system-overview}
- Built-in help system
  - Help drawer with links to each section
  - Same contents used for separate Guide with links to each section

### AI Coding {#ai-coding-overview}
- Optional AI-powered state-of-the-art, paragraph by paragraph coding assistance. We call this "Human first, AI next".


### Causal Map 3 features which will probably *not* be implemented: {#cm3-features-not-implemented}
- Deep support for standard questions across multiple sources
- Special treatment for closed questions
- Ability to view the text of multiple sources at once.

<!---


TODO (Bugs and imminent features):
- BEFORE LAUNCH

SOON
- multi select on sources table fails but be careful
- chunking large texts
- roundtrip does not work with v large cells
- deploy pdf-processor via github, atm it is railway up
- PDF advanced import is not secure
- difference tables
- summary of metadata in writing
- research notes memos / logging
- And point out cm can be used for any network type
- does our RAG have a prequestion to make a relevant prompt?
- improve cluster filter performance so it does not timeout. analyse how soft recode plus breaks the task into separate RPC calls etc. 

**Roadmap:**

- where? to put text search so we can search for eg question_id and jump between even sources. inside source groups blue?
- Text search / semantic search
- Excluding boilerplate sections when coding
- Undo/redo
- Subscriptions using Paddle
- Region selection for databases and AI?
- Offline mode
- Replacing selectize.js with tomselect
- this app is for legacy reasons in a subdirectory /webapp but there is some code like for supabase in the root. That is not non-standard, we will keep it like that.

--->
