---
title: 110-map-panel-map-panel
created: 2025-12-24T14:58:14Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: fd6458824b2d
original_path: content/999 Causal Map App/110 Map Panel ((map-panel)).md
---

<div class="user-guide-callout">
<strong>🗺️ What you can do here:</strong> See your causal relationships as an interactive network map. Drag nodes around, click on links to edit them, and use the controls to customize how the map looks. You can even drag one factor onto another to quickly create new links. This is where your data comes to life visually.
</div>

### Map Controls <i class="fas fa-sliders-h"></i> {#map-controls}
- **Jump to factor** - Type-to-search dropdown to quickly find and select factors on the map. Type to filter options, then press Enter to select all matching factors. Supports multiple selections.
- <i class="fas fa-redo"></i> **Refresh layout** - Return the map to its original state before zoooming, moving etc.
- <i class="fas fa-camera"></i> **Copy image to clipboard** - Get a very high-quality image copied straight into your clipboard which you can paste in a report or presentation.
- <i class="fas fa-clipboard"></i> **Copy legend**
- **Zoom in/out** controls
- **Double-click** anywhere on the map background to zoom in to that point

### Map Legend <i class="fas fa-list"></i> {#map-legend}
Discrete text legend showing:
- projectname and included sources
- Citation coverage percentage
- Visual encoding explanations (link sizes, colors, numbers)
- Applied filters summary
  - 💡Tip: Click [Copy legend](../map-controls/) to copy this text to clipboard.
  - You can drag the legend box to reposition it on the map.

<!---

Legend only reports filters that differ from default values. Always ignores text filters with blank fields and path tracing with both fields blank.

Legend format example:
- projectname: foo. Sources included: FX-1, FX-2, FY-3.
- Citation coverage 17%: 135 citations shown out of 786 total for filtered sources
- Link sizes: citation count. Numbers on links: source count. Numbers on factors: source count. Factor sizes: citation count
- Factor colours: outcomeness
- Filters applied: Tracing paths, matching anywhere, 4 steps from `Increased knowledge` (purple borders) to anywhere. Zooming to level 1. Top 10 factors by citation count.

--->

### Map Formatting <i class="fas fa-sliders-h"></i> {#map-formatting-card}

#### Customisable formatting (Things you can tweak)

**Layout:** change how the map is laid out and how you interact with it. 
- Interactive and most of the other layouts are good while you are conducting your research. They are fast and you can [interact](../interactive-features/) with the results -- moving factors around, clicking to edit, etc.
- Print/Graphviz layout is best for static images e.g. for reports and journal articles. 
- Direction: For Interactive and Print/Graphviz layouts, choose LR (left-to-right, default), TB (top-to-bottom), or BT (bottom-to-top). 

**Factor Labels:** (you can see the same data in the [Factors Panel](../factors-panel/))
- Source count (default)
- Citation count
- Sentiment (mean incoming edge sentiment, -1..+1)
- None

**Link Label Font Sizes** 
**Link Widths:** Citation count (default) Source count,  None
**Link Colour:** Default link line colour (applies to Interactive and Print/Graphviz layouts). When sentiment is neutral (0), this colour is also used for arrowheads and node borders.
**Link Labels:** 
- **Source count** (default)
- **Citation count**
- **Sentiment** (mean edge sentiment, -1..+1)
- **Custom Links label** - Use configuration from Custom Links Label filter
- **Unique Sources** - Alphabetical list
- **All Sources** - Complete list with repeats
- **Unique Tags** - Alphabetical list
- **All Tags** - Complete list with repeats
 - **None** - Show no labels on links

**Factor Colors:**
- **Outcomeness** (default) - Based on in-degree ratio
- **Source count**
- **Citation count**
- **None**

**Factor Sizes:**
- **Citation count** (default) - Font size scales with citation count
- **Source count** - Font size scales with source count
- **None** - All factors use uniform size (increased by 50% for visibility)

**Self-loops:**
- **Show toggle** (default: on)



<!---

**Factor Count Display (#factor-count-type):**
Control to display count at end of each factor label in brackets. If set to source count (default), label becomes "foo label (nn)" showing nn sources mentioned this factor.

**Link Label Options (#link-label-type):**
- Source count (default)
- Citation count 
- Sentiment: Mean sentiment for the bundle (-1 to +1)
- Custom Links label: Uses field and display mode from Custom Links Label filter
- Unique Sources: List unique source IDs in alphabetical order 
- All Sources: List ALL source IDs in order eg M1 M1 M2 M3 M4 M4 M4 etc
- Unique Tags: List unique link tags in alphabetical order eg #hypothetical suspicious
- All Tags: List ALL link tags in order eg #hypothetical #hypothetical suspicious

**Factor Color Options:**
Colors factor backgrounds:
- outcomeness (default, current formatter)
- source count
- citation count
- none

**Self-loops Display:**
Toggle next to #link-label-type "Show self-loops" controls whether to show self-loops from foo to foo.  Default TRUE.

--->


#### Fixed visual appearance (things you can't tweak) {#visual-appearance}

**Link Styling:**
- Arrowheads colored by mean sentiment (neutral uses Link Colour)
- Color scale: muted blue (+1) → grey (0) → muted red (-1)
- Bezier curved edges with bundling

**Factor Styling:**
- Size scaled by node degree (with bounds)
- Border color reflects mean incoming edge sentiment
- Matched factors show dashed colored borders

<!---

**Link Appearance:**
- Arrowheads colored by mean sentiment of bundled edges
- Color scale: muted blue (+1) → grey (0) → muted red (-1)
- Bezier curved edges with bundling for clarity

**Node Appearance:**
- Size scaled by node degree (with min/max bounds)
- Border color reflects mean incoming edge sentiment
- Missing sentiment values treated as zero for calculations
- Factor background colour varies from white to mid-pale green according to "outcomeness" (in-degree/degree)
- If factors are matched by labels filter or path tracing filter, borders are dashed with special colour

--->



### Interactive Features {#interactive-features}

These work for all layouts except Print/Graphviz layout (which is mostly for static export, but does support clicking nodes/links now).

- **Drag factors** to temporarily reposition them
- **Drag factor to factor** to create new links
- **Shift+drag** for box selection of multiple factors (opens edit modal)
- **Ctrl+drag** for box selection of multiple factors (direct selection, no modal)
- **Click a link** to edit.
- **Click a factor** to edit; shift-click or ctrl-click to add to selection without opening modal.

#### Editing and deleting (multiple) factors
- Select factor(s) by clicking a factor, shift-click or ctrl-click to add more, or shift+drag/ctrl+drag a box around multiple factors, then:
  - Move selected factors together
  - Delete matching factors everywhere or in current view only
  - Rename matching factors everywhere or in current view only

**What does "everywhere or in current view only" mean?**
- **everywhere**: all links containing factors with exactly the selected labels will be deleted
- **in current view only**: all links containing factors with exactly the selected labels (and matching the current filters, i.e. those you can see in the current map) will be deleted


💡Tip: By control-clicking or shift-clicking multiple factors you can easily rename several at once, e.g. you can merge multiple factors as a single factor.


### Grid layout

Factors containing a tag of the form `(N.M)` or `(N,M)` anywhere in the label (where N and M are integers) are positioned on a grid layout. The grid coordinate tags are automatically stripped from displayed labels.

**Grid layout toggle:** Enable/disable grid layout in Map Formatting. Defaults to enabled. Disabled automatically when no grid tags are present.

**Interactive Layout:**
- Grid-tagged factors are positioned at their grid coordinates and locked in place
- Other factors with no grid tag are positioned freely within the grid bounds
- Grid bounds: from smallest x -1 to largest x +1, and smallest y -1 to largest y +1

**Print/Graphviz Layout:**
- Grid-tagged factors anchor the initial and final ranks:
  - Factors with minimum rank coordinate (first number) are anchored at `rank=min` (initial rank)
  - Factors with maximum rank coordinate are anchored at `rank=max` (final rank)
- This improves layout stability while allowing Graphviz to position other nodes optimally
- Grid coordinate tags are stripped from labels in the output

**Grid coordinates respect layout direction:**
- **First number (N)** always maps to the rank direction (main flow direction)
- **Second number (M)** always maps to the perpendicular direction
- **BT (Bottom-Top)**: First number = y (rank), y starts at bottom (flip y), second = x
- **TB (Top-Bottom)**: First number = y (rank), y starts at top (normal), second = x
- **LR (Left-Right)**: First number = x (rank), x starts at left (normal), second = y, y starts at top
- **RL (Right-Left)**: First number = x (rank), x starts at right (flip x), second = y, y starts at top

<!---

**Graph Layout:**
- Left-to-right orientation using Cytoscape
- Clickable links open editor or chooser modal
- Visual feedback during selection
- Edge handles for drag-and-drop link creation

**Link Interactions:**
- Clicking on link opens modal with selector to choose specific link to edit
- Causal overlay for editing (from map and links table) has button to open sources panel and textviewer, scrolling to relevant highlight

**Factor Interactions:**
- Factor click opens modal with options:
- Delete factor everywhere (all projects)
  - Delete factor in current filters only
- Rename factor everywhere (all projects)  
- Rename factor in current filters only
- Shift + drag to select multiple factors, then move by clicking and dragging one selected factor
- Box selection: Hold Shift and drag to select multiple nodes, opens same modal as single node selection
- Box selection: Hold Ctrl and drag to select multiple nodes directly without opening modal

**Creation Mode:**
- Drag-and-drop one factor towards another creates new links (using cytoscape "edge handles")
- Causal overlay opens with prefilled cause and effect boxes
- Editable selected_text field prefilled with "manual"
- Toggle between creation mode and normal mode

--->


### Vignettes <i class="fas fa-pen"></i> {#vignette-card}

<div class="user-guide-callout">
<strong>📝 What you can do here:</strong> Generate AI-powered narrative summaries of your causal maps. Choose between a "whole map" summary that covers all the relationships, or a "typical source" story that focuses on one representative case. Perfect for creating reports or explaining your findings in plain language.
</div>

**How to use:**
1. Select your **model** and **region** settings
2. Choose **Whole Map** or **Typical Source** 
3. Enter or edit your **prompt** (use the navigation buttons to browse previous prompts)
4. Click **Write Vignette** to generate

**Whole Map**: Creates a summary of all relationships in your current map view. the app provides the following data which is appended to the prompt:
- The overall map (same as you can see) including factor frequencies and bundled causal links with average sentiment
- Up to 5 "typical sources" that tell the most common stories within the current map, with their quotes and metadata including source ID, Title and Filename.

**Typical Source**: Focuses on the single most representative source, showing individual links with quotes and sentiment.

**Output format**: Results are displayed as markdown with support for:
- Headers, bold, italic text
- Bulleted and numbered lists
- Callouts/quotes (using `>`)
- Code blocks

You can edit your prompt to change the tone, audience, or focus before generating. See the [tips on using prompt history](../tips-prompts/) for more details.

<!---

**Technical Implementation:**

**Whole Map Payload:**
- Node frequencies and average effect sentiment
- Bundled edges with frequencies and average sentiment
- Typical sources selection: identifies up to 5 sources with "the most typical stories" using a weighted score combining:
  - Number of bundles where the source is represented in at least one link
  - Source count of the bundles they are represented in (weighted by bundle frequency)
- Typical sources JSON includes:
  - Source IDs with custom metadata columns (title, filename, and any custom columns)
  - For each source: list of bundles they participate in (cause, effect)
  - Within each bundle: actual links including metadata (ai_sentiment, ai_foo, etc.)
  - If more than 5 links per source per bundle, samples 5 randomly
- Data appended to main map JSON with markdown heading "# Data for typical sources"
- Warning message appended: "Important: do not make anything up. If you don't have all the data you need to carry out the rest of this prompt, say so!"

**Typical Source Payload:**
- Selection normalizes link count by text length (per 1000 characters) to avoid bias towards longer sources
- Selection includes a 50% weight based on the proportion of bundles the source covers
- Includes the full source text (content or text field from sources table)
- Includes individual links with quotes (which are extracts from the full text) and sentiment plus node frequencies

**UI Components:**
- Model dropdown (saved per-project to localStorage)
- Region selection
- Prompt textArea with previous/next buttons and dropdown (saves to prompts table)
- Thinking budget slider (for supported models)
- Write Vignette button sends to AI service, returns markdown result
- Status indicator with spinner during generation

**Default Prompts:**
- Whole map: "This is parts of stories told by several respondents. write a) a local-newspaper style heading (markdown h2) summarising the stories, then a three-sentence summary in simple, straightforward language illustrated with key quotes, and then a one-paragraph more technical summary like in a social science blog, also illustrated with quotes. Note the sentiment field gives the sentiment of the effect of the causal link, from -1 to +1. Note the node labels may not be quite appropriate especially in terms of sentiment / valence so don't get too misled by them."

- Typical source: "This is a typical respondent telling their story. The full source text is provided, and the link quotes are verbatim extracts from that text. write a) a local-newspaper style heading (markdown h2) summarising the story, then a three-sentence summary in simple, straightforward language illustrated with key quotes, and then a one-paragraph more technical summary like in a social science blog, also illustrated with quotes. Note the sentiment field gives the sentiment of the effect of the causal link, from -1 to +1. Note the node labels may not be quite appropriate especially in terms of sentiment / valence so you should definitely mention them if you can but don't worry if they don't fit, find other words instead."

**Markdown Rendering:**
- Custom converter handles callouts (`>`), lists, headers, code blocks, bold/italic
- Callouts styled with left border and background (same font size as body text)
- Lists properly wrapped in `<ul>`/`<ol>` tags
- HTML escaping uses placeholder system to protect generated tags

--->
