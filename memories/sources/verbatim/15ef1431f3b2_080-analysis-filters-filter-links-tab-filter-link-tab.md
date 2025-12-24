---
title: 080-analysis-filters-filter-links-tab-filter-link-tab
created: 2025-12-24T14:57:04Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: 15ef1431f3b2
original_path: content/999 Causal Map App/080 Analysis Filters  Filter links tab ((filter-link-tab)).md
---

Do qualitative causal analyseis on the selected links by filtering or manipulating them.

<div class="user-guide-callout">
<strong>🔍 What you can do here:</strong> Apply filters to focus your analysis on specific aspects of your data. You can trace causal pathways, group similar concepts, filter by themes or demographics, and much more. Think of this as your analysis toolkit - combine different filters to explore your data from different angles.
</div>



### The Filter System: overview {#filter-system-overview}
Use filters to narrow down and/or transforme the links you want to study. Filters are applied in order, from top to bottom.

- **Default filter**: Factor Label Filter
- **Add Filter** <i class="fas fa-plus"></i> lets you insert filters at the start or between existing ones
- **Enable/Disable** toggles turn individual filters on or off
- **Remove** <i class="fas fa-times"></i> deletes a filter
- **Collapse** hides a filter's controls to save space
- **Clear All** <i class="fas fa-times"></i> resets to the Factor Label Filter


<!---
NEW: On each UI filter in the filter pipeline, add a five-pixel-height barand between 0 and 200px depending on the proportion: (# links remaining after the filter/ # links coming into the filter)
Add a tooltip giving the two actual numbers and explaining what the bar means

The filter pipeline processes data sequentially:
1. project filter applies to everything
2. Sources filter applies to links and outputs
3. Link filters apply to all outputs
4. Some tables have bypass toggles to skip link filters
5. Individual tables may have their own display filters

Only non-default, enabled filters are saved to URL. Disabled filters are ignored and shown dimmed.


***Smart Performance Caching***

The filter pipeline uses intelligent caching to dramatically improve performance:

**Filter Result Caching:**
- Expensive filters (`optimized-cluster`, `cluster`, `soft-recode`, `tribes`) cache their results
- Cache keys based on filter settings and input data hash
- Automatic cache invalidation when upstream data or settings change
- First run takes full time, subsequent parameter changes are near-instantaneous

**Embedding Caching:**
- Separate cache for embeddings independent of algorithm parameters
- Shared between filters (optimized clustering + soft recode reuse embeddings)
- Only re-fetches embeddings when input labels actually change
- Same clustering settings with different similarity thresholds reuse embeddings

**Performance Benefits:**
- 20s optimization → 5s for clustering parameter changes
- 0.1s for identical settings
- Quote-safe embedding fetching with batched processing
- Debug tools available via `window.filterCache` in browser console

**Quote Character Handling:**
- Two-tier fetching strategy for labels containing quotes/apostrophes
- Safe labels → Fast batch processing with `.in('text', batch)`
- Problematic labels → Individual queries with `.eq('text', label)`
- Comprehensive debugging and error handling for special characters
- Applies to both clustering and soft-recode filters for robust processing

--->


#### Hard vs Soft recoding

Most filters leave factor labels untouched, but these 'Transform filters' filters temporarily relabel factors:

- [Zoom](../zoom-filter/)
- [Collapse](../collapse-filtemove/)
- [Remove Brackets](../replace-brackets-filter/)
- [Soft Recode Plus](../soft-recode-plus/)
- [Auto Recode](../hierarchical-clustering-filter/)
- [Soft Relabel](../soft-relabel/)
- [Cluster](../clustering-filter/)

No filters actually change your original coding.

💡Tip: If you want to permanently rename or "hard recode" your factors, there are several ways to do that:
- [Search and replace factors](../factors-search-replace/)  
- [Search and replace links](../links-search-replace/)  

For example, after clustering (which may give labels like C11), click a factor on the map and rename it (e.g., "Wellbeing") to save the new name permanently.


### Zoom Filter <i class="fas fa-search-plus"></i> {#zoom-filter}

<div class="user-guide-callout">
<strong>🔍 What this does:</strong> Simplify complex factor labels by zooming to higher levels of a hierarchy. For example, turn "Health; Mental Health; Depression" into just "Health" (level 1) or "Health; Mental Health" (level 2). Perfect for getting a big-picture view of your data.
</div>

- **Radio buttons** for levels (None, 1-9). Combine with [Collapse Filter](../collapse-filter/) for label cleanup.
- **Level 1**: 
  - "foo; bar; baz" becomes "foo"
  - "foo; bar; baz" becomes "foo"
- **Level 2**: 
  - "foo; bar; baz" stays the same
  - "foo; bar; baz" becomes "foo; bar"
- **None**: No transformation

### Collapse Filter <i class="fas fa-compress"></i> {#collapse-filter}

<div class="user-guide-callout">
<strong>🏷️ What this does:</strong> Merge similar factors under one common label. Type or select multiple similar terms like "money", "income", "salary" and they'll all be replaced with the first term. Great for cleaning up data where the same concept is described in different ways.
</div>

Widgets:
- **Selectize dropdown** with existing labels where you can select one or more existing factor labels, or type parts of existing labels.
- **Matching options**: Start / Anywhere / Exact
- **Separate** toggle for individual replacements. When off, this filter replaces all matches with first search term. When on, a separate factor is created for each of the search terms.

### Remove Brackets Filter <i class="fas fa-brackets-curly"></i> {#replace-brackets-filter}

<div class="user-guide-callout">
<strong>🧹 What this does:</strong> Clean up your factor labels by removing text in brackets. For example, "Education (primary school)" becomes just "Education". Choose between removing content in round brackets ( ) or square brackets [ ].
</div>

- **Radio buttons**: Off / Round / Square brackets
- Removes all text within selected bracket type

If you want to remove both kinds of labels, simply create another `Replace brackets` filter beneath this one.


### Factor Label Filter <i class="fas fa-tag"></i> {#factor-label-filter}

<div class="user-guide-callout">
<strong>🎯 What this does:</strong> Show links connected to factors you care about (e.g. "Education"). Choose how many steps to look upstream (causes) and downstream (effects). 
</div>

Widgets:
- **Factor selector** with existing labels. By default shows only labels from links currently visible at this stage of the filter pipeline. Use the **Show All** toggle to display all factor labels from the entire project instead.
- **Steps Up** (0-5): How many levels upstream to include
- **Steps Down** (0-5): How many levels downstream to include
- **Source tracing toggle**: Retain only links which are part of complete paths which all belong to the same source
- **Highlight toggle** (default: on): Show/hide custom highlighting (⭐ star and magenta border) for matching factors
- **Matching**: Start / Anywhere / Exact. Matching is case-insensitive.

How to use:
1) Select one or more factors.  
2) Set Steps Up/Down to widen or narrow the neighbourhood.  
3) (Optional) Turn on Source tracing to require paths from a single source.  
4) (Optional) Turn off Highlight to hide the custom highlighting.
5) The map and tables update to show only links on those paths.

All the label and tag filters including exclude filters have three radio buttons below the selectize input called Match: Start (default), Anywhere or Exact to control how search terms match against labels/tags:

- **Start**: Match only at the beginning of text (default)
- **Anywhere**: Match anywhere within the text  
- **Exact**: Match the entire text exactly

Multiple search terms are treated as OR not AND. preserve and highlight factors matching ANY of the search terms.


Focused factors show with colored borders in the map and have a star added for easy identification (when Highlight toggle is on).

<!---


so a link is retained iff it is part of a path of length <= UP ending in any of the targetted factors, OR it is part of a path of length <= DOWN starting in any of the targetted factors,  (filter in terms of links, not factors, it is much simpler, and Do NOT also include additional crosslinks between factors retained by the above rule

- Selectize dropdown with existing labels plus new entry capability  
- Case-insensitive partial matching (e.g., "Health" matches "Health behaviour")
- Affects all right-panel outputs (map, factors, etc.)
- directly below the selectize put two radio group buttons 0-5 for Steps Up and Steps Down, defaults 1. If say Down =0, don't include links downstream of the matched factor(s). If up or down are > 1, match links the corresponding number of steps up/downstream. When tracing upwards, only include ancestors of ancestors, and similarly for down. i.e. When up >0 and down>0, do not include ancestors of descendents.  So in particular if we are looking for immediate ancestors of B, of which A is one, and there is also an arrow B->A we do NOT include this reverse arrow. 
- Highlight the matched / "focused" factors with a #7dccdd border (replacing any border colour defined by sentiment) 

The filters are prepopulated with all factor labels from the whole project. On reload, labels from the whole project are available, including fragments present in the URL even if not in the current filtered list.

The general principle: a link x->y is only included if it is part of a path of length max `upstream steps` which ends at any of the focused factors. OR if it is part of a path of length max `downstream steps` which STARTS at any of the focused factors. The key is to think about links, not factors. So there are no additional cross-links which are then added between "factors" which are part of these paths because in any case our algo works with the links table; factors are a byproduct of links.


Usually, when up=n and down =m, we only show a factor G if it is reachable from matched factor F in n steps upwards OR m steps downwards. 

The toggle Source tracing is a more conservative interpretation: when ON, when up =n, we only show a factor G if it is reachable from matched factor F in n steps upwards BY AT LEAST ONE SOURCE, i.e. there is at least one path to it in which all segments are attributed to the same source; or likewise for downwards. Find a fast algorithm for this. Also ensure that the factor and link labels in the map respect this. 
---> 



### Exclude Factor Label filter <i class="fas fa-ban"></i> {#exclude-factor-label-filter}

<div class="user-guide-callout">
<strong>🚫 What this does:</strong> Remove unwanted factors from your analysis. Type factors like "Unclear" or "Other" to hide them from your map and tables. Useful for cleaning up your data by removing vague or irrelevant categories.
</div>

- **Factor selector** for factors to exclude. By default shows only labels from links currently visible at this stage of the filter pipeline. Use the **Show All** toggle to display all factor labels from the entire project instead.
- **Matching options**: Start / Anywhere / Exact
- Multiple entries combined with AND logic
- If you want to exclude both/all of two or more entries, add another Exclude Factor Label filter.

### Path Tracing Filter <i class="fas fa-route"></i> {#path-tracing-filter}

<div class="user-guide-callout">
<strong>🛤️ What this does:</strong> Find causal pathways between two specific points. Set a starting factor (like "Poverty") and an ending factor (like "Poor Health") to see all the causal chains that connect them. Great for understanding how problems and solutions are linked.
</div>

- **From selector** for starting factors. By default shows only labels from links currently visible at this stage of the filter pipeline. Use the **Show All** toggle to display all factor labels from the entire project instead.
- **To selector** for ending factors (results visible in [Map](../map-panel/) and [Links](../links-panel/)). Uses the same label source as the From selector (controlled by the **Show All** toggle).
- **Matching options**: Start / Anywhere / Exact
- **Steps** (1-5): Maximum path length
- **Thread tracing toggle**: Require only paths within same source
- **Highlight toggle** (default: on): Show/hide custom highlighting (⭐ star/magenta border for From factors, 🎯 target/dark yellow border for To factors)
- **Only indirect links** (default: off): Remove all direct links from From to To (only makes sense when both From and To are non-empty)

<!---

The filter works similar to Factor Labels but finds paths between specific start and end points. When Thread tracing is enabled, it uses a conservative algorithm that loops through each source, constructs paths for each source, then combines results. Only edges that are part of valid paths are included in the final output.

the algorithm should be careful not to accidentally then add other links between factors which form part of these paths but which do not form part of paths as already defined:path tracing should only include edges which are themselves part of the paths we find. so if eg we are path tracing with empty From and To = foo, and both bar and baz have an edge to foo, and they also have an edge from bar to baz, this edge sould NOT appeare in the map beause it cannot be part of a one-step path to foo. 

Behavior: If fromLabels is specified but matches no factors, return empty (no paths FROM nothing). If toLabels is specified but matches no factors, return empty (no paths TO nothing). Backward search only occurs when fromLabels is not specified (empty = anything).

---> 


### Exclude self-loops Filter <i class="fas fa-tags"></i> {#exclude-self-loops-filter}

You can exclude self-loops from the maps, but that is more of a visual change. This is a real filter as part of the filter pipeline. For example, if you are using a filter like [Link Frequency](../link-frequency-filter/) that might be retaining link bundles which are actually self-loops, so you might get unexpected results if you use the map setting to remove the self-loops. So this filter is a better way. It simply removes all links which are self-loops from the links table.


### Link Tags Filter <i class="fas fa-tags"></i> {#link-tags-filter}

<div class="user-guide-callout">
<strong>🏷️ What this does:</strong> Filter your analysis by the tags you've added to links. Show only links tagged as "#important" or "#policy" to focus on specific themes or types of relationships you've identified.
</div>

- **Tag selector** with existing link tags from current project
- **Matching options**: Start / Anywhere / Exact





### Combine Opposites filter <i class="fas fa-exchange-alt"></i> {#combine-opposites-filter}

<div class="user-guide-callout">
<strong>🔄 What this does:</strong> Unify opposite factor labels by matching tag numbers. If you have pairs like `Foo [99]` and `Bar [~99]` (where `~99` indicates the opposite), this filter rewrites `Bar [~99]` as `Foo [99]` to combine them under one label. The `flipped_cause` and `flipped_effect` columns track which causes and effects were flipped.
</div>

**Toggle** – Turn the filter on/off.

**Strip tags from labels** (default: on) – When enabled, removes `[N]` and `[~N]` tag patterns from labels after combining opposites. This keeps labels clean while preserving the tracking information in the `flipped_cause` and `flipped_effect` columns.

Labels can be written in pairs like:
- `Foo [99]`
- `Bar [~99]`

where `Bar` represents the opposite of `Foo`. The square brackets are optional - you can use `Foo 99` and `Bar ~99` - but brackets make it easier to remove tags later using the [Replace Brackets filter](../replace-brackets-filter/).

If there are any such pairs, with matching integers, and the filter is switched on:

rewrite any Bar [~99] filters as Foo [00] and add new columns:
- `flipped_cause` column tracks which causes were flipped
- `flipped_effect` column tracks which effects were flipped

to the current augmented links table, so that if the label has been flipped, the value is True and otherwise False. 

Wire up the filter as part of the standard filter system with save/restore to URL etc.

Also, when calculating new links table, create new text columns:
- `source_count_with_opposites`
- `citation_count_with_opposites`

The embellished counts always show all variants with custom SVG icons (no total prefix). Four circle icons represent the flipped status:
- ▔ (unflipped/unflipped)
- ╲ (unflipped/flipped)  
- ╱	 (flipped/unflipped)
- ▁ (flipped/flipped)

So if a bundle has 12 citations where 5 are unflipped/unflipped, 2 have flipped cause and flipped effect, and 1 has flipped cause but non-flipped effect, the text is: `light-blue-circle5, dark-red-circle2, mixed-circle1`. If nothing were flipped, the label would just be `light-blue-circle12`.
Do the same with source counts too, counting the unique sources in each variant. 

When the filter is on, and source count or citation count is selected, the graphviz and graphviz maps change to use `source_count_with_opposites` or `citation_count_with_opposites` just for the labels. The edge width calculation remains driven by source count or citation count, as selected.

<!--
Technical implementation:
- Filter sets flipped_cause and flipped_effect boolean columns (not a single Flipped column)
- Bundling creates single bundles per cause-effect pair (not separate for flipped/unflipped)
- Custom SVG icons: inline SVG circles split vertically (light blue #6dc4c8 for unflipped, dark red #dc3545 for flipped)
- Icons: whole light blue (unflipped/unflipped), light blue left + dark red right (unflipped/flipped), dark red left + light blue right (flipped/unflipped), whole dark red (flipped/flipped)
- stripTags toggle (default: true) uses stripTags() helper to remove [N] and [~N] patterns after combining
- Embellished counts formatted as: "light-blue-circle5, mixed-circle1, dark-red-circle2" - always shows all variants with counts, no total prefix
- Graph labels use embellished counts when combine-opposites filter is active; edge width uses original counts
-->




### Exclude Link Tag filter <i class="fas fa-times-circle"></i> {#exclude-link-tag-filter}

<div class="user-guide-callout">
<strong>🚫 What this does:</strong> Remove specific types of links from your analysis. Exclude links tagged as "#uncertain" or "#duplicate" to focus on higher-quality data. Helpful for filtering out questionable or irrelevant causal claims.
</div>

- Same as Link Tag filter except *exclude* links containing these tags. Multiple entries are combined with AND, i.e. only exclude links where both entries match. (💡Tip: if you want to exclude both/all of two or more entries, add another filter).


<!---

The implementation uses a shared `generateMatchRadioButtons()` function for consistency across all filter types.

--->

### Exclude self-loops Filter <i class="fas fa-undo"></i> {#exclude-self-loops-filter}

You can exclude self-loops from the maps, but that is more of a visual change. This is a real filter as part of the filter pipeline. For example, if you are using a filter like [Link Frequency](../link-frequency-filter/) that might be retaining link bundles which are actually self-loops, so you might get unexpected results if you use the map setting to remove the self-loops. So this filter is a better way. It simply removes all links which are self-loops from the links table.

### Link Frequency Filter <i class="fas fa-chart-bar"></i> {#link-frequency-filter}

<div class="user-guide-callout">
<strong>📊 What this does:</strong> Focus on the most important causal relationships by filtering out rare ones. Choose "Top 10" to see only the most frequently mentioned connections, or set a minimum threshold like "at least 3 sources" to ensure reliability.
</div>

- **Slider** (1-100) for threshold
- **Type**: Top vs Minimum
- **Count by**: Sources vs Citations

Examples:
- **Minimum 6 Sources**: Only links mentioned by 6+ sources
- **Top 6**: Only the 6 most frequent link bundles


By default, setting the slider to 6 means we are selecting only links with at least 6 citations. 

If you switch to “Sources”, we are selecting only links with at least 6 sources.

If you switch to “Top” we are selecting only the top 6 links by citation count, etc.  The selection respects ties, so that if there are several links with the same count, either all of them or none of them will be selected. 


### Factor Frequency Filter <i class="fas fa-chart-bar"></i> {#factor-frequency-filter}

<div class="user-guide-callout">
<strong>📈 What this does:</strong> Similar to Link Frequency, but focuses on the most important factors (causes and effects). Show only the most frequently mentioned themes or concepts to identify the key issues in your data.
</div>

Same controls as [Link Frequency](../link-frequency-filter/) but applies to factors instead of links.

<!---

Selecting "top 10 factors" shows all factors in the top 10 that are connected to at least one other top 10 factor. You may get fewer than 10 factors if some aren't connected to others in the top group.

--->



### Source Groups filter <i class="fas fa-users"></i> {#source-groups-filter}

<div class="user-guide-callout">
<strong>👥 What this does:</strong> Filter your analysis by participant demographics or document characteristics. For example, show only responses from "women aged 25-35" or interviews from "urban areas." Perfect for comparing how different groups see causal relationships. This is very similar to the [Source Groups widget](../source-groups-sub-panel/) in the Sources sub-panel, but having it here too means you can add multiple source filters to the pipeline.
</div>

- provides 
  - a prepopulated dropdown called Field with all the metadata fields plus title and projectname 
  - another multi-selectzie called Value. Multiple values work as OR: either/any count as a match 
  - a previous/next button pair to cycle through values of the selected group
  - Example: Add two Source Groups filters in the pipeline to combine criteria (e.g., first filter Field = gender → Value = women, then another filter Field = region → Value = X) so you see links from women AND from region X.


### Everything Filter <i class="fas fa-filter"></i> {#everything-filter}

<div class="user-guide-callout">
<strong>👥 What this does:</strong> Filter your analysis by any characteristic of your links and their sources. Useful for anything not covered by the other filters, for example, 

- show only links with negative sentiment
- Show only links from one source

 Also shows source separators and their values, often used for common sections within multiple sources texts.
</div>

- **Field dropdown** with all fields in the links table
- **Value selector** filtered by selected field
- **Navigation buttons** to cycle through values
- **Clear button** to reset



<!---

Similar to the Source Groups filter but more general. The second dropdown is filtered to show only valid values for the selected field. Future versions may add max/min sliders for numeric fields.

---> 


### Soft Relabel Filter <i class="fas fa-filter"></i> {#soft-relabel-filter}

<div class="user-guide-callout">
<strong>👥 What this does:</strong> Temporarily relabel factors.
</div>

- **Old factor labels** listed on the left
- **New factor labels** editable, listed on the right
- **Load labels button** when pressed, adds into the Old labels list any current factor labels (in links as currently filtered) which are not yet listed in the Old labels list and adds the same Old label to the New column as default.
- **Clear button** to clear the New fields
- **Clear ALL button** to clear all rows

Effect: all factors exactly matching any of the labels in the Old list are relabelled with the corresponding labels from the New list. factors not listed are not relabelled but preserved. 

Many use cases:
- temporarily merge multiple factors into one
- you are using magnets and you can't really use the formulation you want because you want to maximise similarity with existing labels
  - eg you are using "floods" as a magnet but you really want it as a hierarchical factor like "environmental problems; floods" but you can t use that as a magnet.

Keyboard shortcuts (Win/Linux ⇄ macOS):

- Tab / Shift+Tab: move focus down/up between NEW cells
- Arrow Up/Down: move focus up/down between NEW cells
- Alt+Arrow Up/Down (mac: Option+Arrow): move the current row up/down
- Ctrl+Arrow Up/Down (mac: Cmd+Arrow): move the current row up/down
- Delete current row:
  - Shift+Delete (mac: Shift+Fn+Backspace) or
  - Ctrl+Shift+K (mac: Cmd+Shift+K)

Potentially, one NEW label might have multiple OLD labels. 

### Soft Recode Plus filter <i class="fas fa-magic"></i> {#soft-recode-plus}

<span class="badge bg-warning text-dark" style="margin-left:6px;">Requires AI subscription</span>

<div class="user-guide-callout">
<strong>🧲 What this does:</strong> Group messy factor labels under clearer names you choose (called "magnets"). Example magnets: `Improved health`, `Education programs`, `Income changes`. The filter finds the closest magnet for each label and replaces it.
</div>

#### Controls:
##### **Create Suggestions for Magnets** 

(collapsed by default):
Optional. Ask AI to propose clear names from your current labels. Insert adds them to your magnets box to review/edit.
  - **Number of clusters** – Choose how many groups to find for AI suggestions.
  - **Labelling prompt** - With the usual buttons to save and recall previous prompts 
  - **Insert** 


##### **Main panel** 
- NEW: **Only unmatched** – A new toggle which appears right at the top, before the Create Suggestions subpanel. default off. 
- **Magnets** – One magnet per line. Saved per project. Use Prev/Next to browse recent sets.
- **Similarity slider** – The raw labels are dropped if they are not at least this similar to at least one cluster.
- **Drop unmatched** – If on, remove links whose labels don't match any magnet. If off, keep them as they are.
- **Save** – Save magnets and apply the recode.
- **Remove hierarchy** – Strip any text before the final semicolon
- **Clear / Prev / Next** – Manage saved sets.
- **Recycle weakest magnets:** – A slider starting at 0 <!--, with mild logarithmic scaling of the slider-->, default is 0. If the slider is n >0, then we look at the cluster assignenments which would have been returned and find the n clusters which we are going to recycle. Reassign them to their nearest cluster, providing the similarity is still better than the similarity cutoff. This way we don't lose factors / links which are otherwise assigned to smaller clusters which may get excluded later on in the filter pipeline. When it is on zero, it makes no difference and we just use the solution based only on the magnets, similarity, and remove_hierarchy. The maximum value changes to match the total number of magnets.


#### Recoded columns

When you use Soft Recode Plus, the Links and Factors tables show special columns that track which labels have been recoded:
- **Links table**: Shows `_recoded_cause` and `_recoded_effect` columns (✓ for recoded, ✗ for not recoded)
- **Factors table**: Shows `_recoded` column (✓ if the factor appears at least once as recoded, ✗ otherwise)
- These columns only appear when Soft Recode Plus is active in your filter pipeline
- You can filter by these columns using the True/False dropdowns in the table headers

These columns track recoding from any filter that transforms labels: Soft Recode Plus, Zoom, Collapse, Remove Brackets, Soft Relabel, Cluster, Hierarchical Cluster, and Combine Opposites.

#### Process only unmatched NEW

the point of this is: what if I apply some (maybe standard) magnetisation and matches plenty of factors but there might be some important material left unmatched, not just noise. so i can use a PAIR of these filters. in the first one, I leave OFF its Discard Unmatched toggle and in the second filter switch ON its Only Unmatched filter. (if there is no preceding SRP filter with Discard Unmatched=OFF, this second SRP filter does nothing). 

So now, 
- the Create Suggestions (if used) optionally processes ONLY the UNMATCHED factor labels 
- the magnetisation (if labels are non-empty) works only on the unmatched factor labels. 
- the actual output of the second filter is now the union of both soft-recode processes, i.e. the original matches from the first and the new matches of the previously discarded material from the second.   
- the Discard Unmatched on this second filter works as usual: if it is OFF, then we also return all the still-unmatched labels. 

<!-- Technical details (for maintainers):
Only unmatched mode
- When enabled, finds the immediately preceding SRP filter with dropUnmatched=false.
- Gets links processed up to current filter via getLinksBeforeFilter().
- Separates links: matched (both cause/effect recoded) vs unmatched (at least one not recoded).
- Processing uses only unmatched links; matching uses original labels from _recoded metadata.
- Final merge: deduplicates by link.id, combines preceding matched + newly matched links.
- Create Suggestions also filters to unmatched links before clustering.

Recoded columns:
- Links table includes `_recoded_cause` and `_recoded_effect` boolean columns (only visible when SRP filter is active).
- Factors table includes `_recoded` boolean column (only visible when SRP filter is active).
- These columns track which labels have been transformed by any recoding filter (SRP, Zoom, Collapse, Remove Brackets, Soft Relabel, Cluster, Hierarchical Cluster, Optimized Cluster, Combine Opposites).
- A factor is marked as recoded if it appears at least once with `_recoded_cause=true` or `_recoded_effect=true` in any link.
-->

#### Meaning Space (2‑D embeddings)

Go to the [map formatting](../map-formatting-card/) and select Layout → Meaning Space to see a 2‑D scatter of your factors in “meaning space”.

- Magnets are shown with labels; raw factor labels are dots.
- Colour indicates the magnet group; magnet dot size represents group size.
- You can pan (drag) and zoom (mouse wheel and [zoom controls](../map-controls/)).
- Double-click on an empty part of the map to zoom in at that point.
- Tooltips on dots show the original (raw) labels and the magnet label.

<!-- Technical details (for maintainers):
Inputs
- The scatter is computed from the most recent Soft Recode Plus run: all normalized labels included in SRP and the normalized magnet set used.

Server RPC
- RPC: public.find_similar_labels_pgvector_with_embedding_check_mds2d
- Returns an extra key `mds2d`: array of rows with columns { type: 'magnet'|'raw', raw_label, x, y, label }.
- `label` is the final magnetised label; for magnet rows, `label == raw_label`.

Computation
- Distances use pgvector cosine distance (`<=>`).
- Classical MDS (double‑centering) with power‑iteration for top‑2 eigenpairs.
- Label normalization is applied before joining with `embeddings` to avoid silent misses.
- Performance: keep all magnets; evenly sample raw points to cap total ≈ 600. (Large projects stay responsive.)

Client
- The result is rendered as a plain SVG. Pan/zoom are local (no requery). Tooltips use the app’s TooltipManager (`data-tooltip`).
- If a previous MDS exists, switching Map Type uses the cached result; SRP invalidates the cache so the next view recomputes.
-->


#### Motivation for Remove Hierarchy

"Remove hierarchy", default off. if on, strip any text before a final semi-colon, if no semi-colon, do not change the text. 

```
something; another thing
```

is treated same as

```
another thing
```

.... but it continues to be treated as "something; another thing" in the rest of the filter pipeline.

<!--now, we have to keep a temporary record of the original magnets and then rematch the stripped versions back to the original unstripped versions at the end of the filter. The point of this is that I may want to group depression and anxiety together under mental health, like this

mental health; depression
mental health; anxiety

but that will change the magnetisation, I want to use "depression" internally as the magnet, but I want the resulting labels to show my hierarchical thinking, and so that I can later use the Zoom filter to group both of the two labels together under mental health.

caveat: we need to check for eg

foo;bar
baz;bar

in which case the remapping is impossible and we should show a standard notification and NOT strip these labels. 

-->
Quick workflow:

1) (Optional) Open Create Suggestions for Magnets panel → set Number of clusters and use Insert to get AI suggestions.  
2) Use these suggestions and/or edit them, paste or type your own magnets (one per line).  
3) Click Save.  

- Clusters your current labels (factors as currently filtered), ranks typical examples, and asks AI to suggest clear names.
- Returns suggested names into the magnets box; you can edit them before Save.


<!-- Technical notes:
- Embeddings are created or fetched server-side; keys are normalized consistently to avoid duplicates.
- Similarity is computed in the database via pgvector; large sets are batched.
- Magnets must have embeddings before matching: the RPC returns `needs_embeddings` (including `missing_labels`) if any are missing; the client performs a single batched ensure then retries.
- Magnet and factor embedding ensures run in batches to reduce latency; normalized keys are used everywhere.
- The legacy "Soft Recode" filter has been removed; use Soft Recode Plus instead.-->

See [tips on using the history](../tips-prompts/) to reuse both your labelling prompt and magnet sets.

**Motivation for "recycle weakest magnets"**: suppose you create 20 magnets, and then apply more filters like say a [link frequency filter](../link-frequency-filter/) so that you end up with say only 5 factors. If you then *remove* those factors from the magnets list which are *not* included in the final output, you will usually increase the coverage of your map (re-assigning raw labels which fit best with one of the "lost" labels but still fit well with one of the "surviving" labels). This is what the Recycle slider does: it recycles the specified number of smaller magnets and reassigns them to the larger magnets. So in the example, if you start off with 20 magnets but your final map only shows 5, try recycling say 10 or even 15 of the missing factors. 

Note that Recycle Weakest Magnets is applied BEFORE Drop Unmatched. 



### Clustering filter <i class="fas fa-project-diagram"></i> {#clustering-filter}

<span class="badge bg-warning text-dark" style="margin-left:6px;">Requires AI subscription</span>

<div class="user-guide-callout">
<strong>🎯 What this does:</strong> Automatically discover groups of similar factors in your data using machine learning. The system finds natural clusters of related concepts and labels them with cluster numbers. Great for exploratory analysis when you're not sure what causal themes exist.
</div>

- **Enable toggle** (starts disabled)
- **Number of clusters** (1-9)
- **Server-side processing** using `cluster_factors_pgvector` database function
- Uses k-means clustering on factor embeddings
- Labels clusters with numeric IDs

<!---

This filter uses server-side k-means clustering via PostgreSQL pgvector extension to group factors with similar meanings. The `cluster_factors_pgvector` database function uses an adaptive algorithm:

**≤3000 factors**: Direct clustering using optimized LATERAL JOINs for fast, accurate results
**3000-8000 factors**: Sampling-based clustering using 500 representative samples  
**8000-15000 factors**: Ultra-fast clustering using 100 samples with single-pass assignment
**>15000 factors**: Lightning-fast clustering using 50 samples with no iterations

The function automatically selects the optimal approach based on dataset size, with aggressive performance optimizations for massive datasets (8K-50K+ factors) ensuring sub-minute clustering times.

---> 

### Auto Recode filter <i class="fas fa-sitemap"></i> {#hierarchical-cluster-filter}

<div class="user-guide-callout">
<strong>🪜 What this does:</strong> Quickly turns your current set of labels (after any previous filters like Zoom) into a simple tree you can "roll up" or "open out". Pick a small number of clusters for a big‑picture view, then nudge the Balance and Similarity to tidy results. Designed for fast, practical exploration on real projects.
</div>

#### Motivation

Making sense of hundreds or thousands of factor labels is hard. 

You might use something like soft Recode Plus, but often you'll ask for 20 clusters to cover a wide range of meanings. Then after filtering out insignificant data, you end up with only 7 clusters — losing coverage. Ideally you'd go back and recreate just 7 clusters, but that gives different results. Frustrating!

The point of this Auto Recode filter: have your cake and eat it. Ask for an foldable/unfoldable hierarchical solution. When you move the slider to 15, you get the best solution for 15 clusters. Slide it to 3, you instantly get the best solution for 3 clusters.

#### Controls:
- **Enable toggle** (starts disabled)
- **Balance (0..1)**: 0 = prefer more distinct clusters; 1 = prefer more even sizes. Changing this can be slow because the tree has to be rebuilt
- **Number of clusters (K)**: 2–50. Unfolds the returned tree locally to K. This is fast unless you increase beyond 20.
- **Similarity ≥**: prune locally by similarity to the centre of each cluster.

NEW: **AI labelling prompt** with history controls. Use this to suggest clearer names for each cluster:
- Saved in the prompts table as type `hierarchical_label` (shared across projects; history shows current first then others).
- A Save button stores your prompt; it also auto-saves on blur and after the first tree build.
- When you raise K (unfold deeper), we call AI in parallel only for the two new child clusters introduced by each applied split, using up to 8 representative labels per child as context. For K clusters this is K−1 requests. Folding to fewer clusters does not call AI; existing AI labels or medoid representatives are used.
- If the prompt is blank, we show the medoid representatives for each cluster.
- If earlier splits already have AI labels (K > 1), we include a reference list of those labels so new labels avoid overlapping meanings.

<!-- Technical (AI prompt construction):
 - For each applied split, previously generated AI labels are collected from `filter._hclustAiLabels` for currently visible leaves (`chosenLeafIds`), excluding the two new child nodes.
 - If any exist, a JSON array titled "Reference cluster labels" is appended to the prompt so the model avoids semantic overlap.
 - Location: `webapp/js/filter-pipeline.js`, inside `applyHierarchicalClusterFilter`, when building `fullPrompt` for per‑split AI calls.
-->

NEW: **Seed labels (optional)** with history and strength:
- Provide up to K seed labels (one per line). Seeds softly influence split formation but are not included in the final tree (not nodes, not representatives).
- Saved in the prompts table as type `hierarchical_seeds` with standard history controls (Prev/Next/Dropdown/Save).
- Seed strength (0..1) adjusts influence; 0 is a no‑op (identical to no seeds). Changing strength or seeds triggers a single backend rebuild (like Balance). Changing K or Similarity does not re‑call the backend.

<!--
Backend (Postgres RPC + pgvector):
- Function: `public.hierarchical_cluster_factors_with_embedding_check(p_factor_labels text[], p_max_splits int, p_balance float8)`.
- Ensures embeddings; if missing, returns `{ status: "needs_embeddings", embedding_status: { … } }`.
- Builds a bisecting k‑means tree (k=2) using medoids; blended split score:
  - separation = similarity between child medoids, balance = 1 − |n0 − n1|/(n0+n1)
  - score = (1 − balance_param) × separation + balance_param × balance
  - balance interpretation: measures how even the two child sizes are. Range 0..1; 1.0 when the split is perfectly even (n0=n1), 0.0 when one side is empty. Equivalent form: `balance = 2 · min(n0, n1) / (n0 + n1)`.
- Normalizes assignment labels (handles 0/1/2) so splits do not collapse.
- Returns (no backend pruning):
  - `tree.nodes` (id, parent_id, depth, size, representative, stats.mean_similarity, stats.worst_similarity)
  - `tree.splits` (parent_id, left_id, right_id, separation, balance_score, blended_score)
  - `leaf_assignments` (label → leaf_id), `paths[label] = [{ node_id, similarity }]` (to ancestor medoids)

Seeds extension (server):
- Extend function signature to accept `p_seeds text[]`, `p_seed_weight float8`.
- Ensure seed embeddings exist; never include seeds in outputs.
- Soft influence: incorporate seeds either by a bounded score prior that rewards splits cohering seed neighborhoods, or by adding low-weight virtual points during splitting only. Must preserve no-op at weight = 0.

Representative examples per cluster:
- Up to 8 labels are chosen per cluster to show typical examples.
- Ranking uses a dynamic frequency-vs-similarity weighting based on cluster clumpiness:
  - Compute clumpiness using normalized HHI over in-cluster label frequencies: clumpiness = ((∑ p_i^2) − 1/m) / (1 − 1/m), where m is the number of distinct labels in the cluster and p_i is the share of label i.
  - Frequency weight = 0.5 × clumpiness (0..0.5); similarity weight = 1 − frequency weight.
  - Score = frequency_weight × p_i + similarity_weight × cosine_similarity_to_centroid.
- This means when all labels are low-frequency (flat distribution), ranking is driven almost entirely by similarity; when a few labels dominate, frequency contributes up to 50% of the score.

Frontend behavior:
- One server call when inputs change (links set, or Balance/Max Splits). K and Similarity work purely client‑side on cached payload.
- K unfolding: replay the first K−1 splits exactly as the backend created them (largest unsplit node first), yielding K leaves from the top of the tree.
- Relabelling: if an AI prompt is present, child labels for newly applied splits are requested in parallel and cached per node; final leaf labels prefer AI → `representative` → fallback `HCn`. Similarity ≥ prunes assignments locally; links where either side isn't assigned are dropped.
- Prompt history: stored under type `hierarchical_label` in `prompts`; history UI shows newest-first for the current project, then other accessible projects, with deduplication by text. Also mirrored into project metadata for back‑compat display.
- Console debug logs (`HCLUST ▶`) show payload summary, leaves, assignments, and link counts.

AI labelling technical notes (client + Edge Function):
- Per-node requests: one node per AI call to keep each request under edge TTFB limits while allowing the overall sequence to run for minutes.
- Model/region: Gemini 2.5 Pro via Edge Function `vertex-ai` (region `us-east5`) with JSON schema enforcement for mapping keys → strings.
- Reference list: when K>1, the prompt includes a JSON array of existing leaf labels (excluding the two new children) to avoid semantic overlap in new names.
- Busy indicator messages: emits `aiProcessingStart/Progress/Complete` as "building tree…", "contacting server…", "unfolding to K=…", and "Labelling clusters with AI (N requests)…".
- Error mapping: network/CORS/timeout messages are normalized for clearer user feedback (mapped in `applyHierarchicalClusterFilter`).

Where the SQL lives:
- The SQL is applied manually in Supabase (no migrations). Keep the reference file in the repo at `webapp/sql/hierarchical.sql`.
-->
How to use (quick):
- Add the filter and enable it. We build a quick draft tree from the labels you see now (respecting any filters above, like Zoom).
- Set **Balance** if you want more equal‑sized groups; the first build may take a moment on large projects (one server call).
- Use **K** to choose how many clusters to show. Changing K is instant (no extra server calls).
- Use **Similarity ≥** to drop weak matches. If either side of a link isn't matched, that link is hidden.

Notes:
- On very large projects, we automatically sample a representative set to build the tree, then assign the rest to the nearest cluster. This keeps things responsive while preserving the overall picture.
- 💡Tip: changing the number of factors should be instant if they are less than 20. Setting more than 20 can be slow. If you are going to want more than 20, set this number initially to the maximum number you are likely to want. You can then easily reduce it. Gradually decreasing the number is fine, but **gradually* increasing* it will be very slow.

A good prompt looks something like this:
> This is a list of many raw labels grouped into two different clusters, with their cluster IDs, together with a reference list of other labels. Return a list of two new labels, one for each cluster ID. Each label should capture the meaning of the whole cluster, using similar language to the original raw labels, but in such a way that the labels you create are distinct from one another in meaning. Try not to be too generic, try to be as concrete as you can. 
> Do NOT provide labels which include causal ideas, like "X through Y" or "X leading to Y" or "X results in Y" or "X improves Y" etc. Equally, don't include conjunctions in the title like "X and Y".
> The meaning of the labels you give me should ideally not overlap in meaning with one another or with the labels in the reference list.


### Optimized Cluster filter <i class="fas fa-bullseye"></i> {#optimized-cluster-filter}

<span class="badge bg-secondary text-white" style="margin-left:6px;">⚠️ DEPRECATED</span> <span class="badge bg-warning text-dark" style="margin-left:6px;">Requires AI subscription</span>

<div class="alert alert-warning" role="alert">
<strong>⚠️ This filter is deprecated.</strong> Its functionality has been merged into <a href="#soft-recode-plus">Soft Recode Plus</a>. The filter still works for backward compatibility with existing bookmarks/URLs, but new instances cannot be created. Use Soft Recode Plus instead for optimal clustering and recoding.
</div>

<div class="user-guide-callout">
<strong>🎯 What this does:</strong> Automatically finds the most optimal factor labels to use as centroids through genuine optimization. Unlike regular clustering that just groups similar items, this finds the best possible n≤N labels that maximize coverage with similarity ≥S. Perfect for discovering the most representative concepts in your data.
</div>

**Controls:**
- **Max Centroids (n)** - Maximum number of optimal centroids to find (2-50)
- **Similarity ≥** - Minimum similarity threshold for grouping labels (0-1)  
- **Timeout (s)** - Optimization time limit in seconds (5-60)
- **Drop unmatched** - Remove labels that don't meet similarity threshold
- **Real-time status** - Shows optimization progress and results

**How it works:**
1. Extracts all unique labels from your current data (1K-30K labels supported)
2. Runs iterative optimization with multiple strategies (random, frequency-based, diverse selection)
3. Uses hill-climbing optimization to find the best possible centroids
4. Shows coverage percentage and timing information
5. Returns recoded links table with optimal centroid labels

**Optimization Strategies:**
- **Random selection** - Tests random starting points
- **Frequency-based** - Prioritizes most connected labels  
- **Diverse selection** - Maximizes distance between centroids
- **Hybrid approach** - Combines best-so-far with random exploration

**Performance Features:**
- **Sampling strategy** for datasets >1000 labels (uses representative subset)
- **Early termination** when excellent coverage (≥95%) is achieved
- **Configurable timeout** prevents infinite optimization loops
- **Multiple iterations** with different starting strategies for robustness
- **Smart caching** - Embeddings cached separately from algorithm parameters for fast parameter changes
- **Quote-safe processing** - Handles labels with quotes, apostrophes, and special characters

**Technical Implementation:**
- Client-side optimization using cosine similarity on embeddings
- Hill-climbing algorithm with local search improvements  
- Genuine optimization problem solving (not just k-means clustering)
- Real-time UI feedback showing progress and final results
- Handles massive datasets efficiently through smart sampling
- **Original label preservation** - Stores original labels in `_recoded` metadata for map display
- **Chain compatibility** - Works seamlessly with zoom filter and other transformations

**Soft Recode Integration:**
- Optimized cluster results available as magnet source in Soft Recode filter
- AI can generate meaningful labels for optimal centroids
- Seamless workflow from optimization to AI-powered naming

This filter implements the optimization challenge described in the technical documentation: finding optimal centroids that maximize label coverage within similarity constraints. 


### Tribes filter <i class="fas fa-users"></i> {#tribes-filter}

<span class="badge bg-warning text-dark" style="margin-left:6px;">Requires AI subscription</span>

<div class="user-guide-callout">
<strong>🏛️ What this does:</strong> Group your sources (participants/documents) by how similarly they describe causal relationships. This reveals different "tribes" or perspectives in your data - for example, optimists vs. pessimists, or urban vs. rural viewpoints.
</div>

**Controls:**
- **Number of clusters** - Radio buttons: Off, 1-9
- **Similarity cutoff** - Slider: 0-1
- **Drop unmatched** - Toggle
- **Min cluster %** - Slider: 0-20% (prevents "1 big + many singletons" pattern) 
- **Counts (Report)** - For the Tribe Report tables: count by **Sources** (unique participants/documents) or **Citations** (links). Default: Sources.

<!---

**How it works:**
1. Creates sentiment-aware buckets (pos/neu/neg) for each cause→effect pair  
2. Applies TF-IDF weighting and clusters the resulting vectors
3. Small clusters below Min cluster % threshold are auto-merged into nearest large cluster
4. Returns tribe ID, similarity to centroid, and similarity rank columns
5. Can show maps for each tribe or most typical source in each tribe 

Tribe Report:
- The **View Tribe Report** button generates chi-square tables for categorical fields.
- The report’s **Counts (Report)** toggle controls whether those tables use **Sources** (unique `source_id`) or **Citations** (links).

The algorithm now builds **three sentiment-aware buckets** (pos / neu / neg) for every cause→effect pair, TF-IDF–weights them and clusters the resulting vectors.  
Extra control:

• **Min cluster % slider** (0-20 %).  Clusters smaller than this share of sources are auto-merged into the nearest large cluster, preventing the "1 big + many singletons" pattern.

For each source, the system forms a sparse matrix of cause × effect with sentiment in the cells (no-link is treated as missing, not zero). It clusters these matrices (k-means) into groups with similar matrices <!-- similarity metrics for sparse matrices may be specialized -->. 

It returns:
- `tribeId` (cluster ID)
- similarity to the centroid
- similarity rank
These are joined to the links table by source ID and appear as additional columns. If Drop unmatched is ON, links with similarity below the cutoff are removed.


We can then show maps for each tribe and/or for the most typical source in each tribe. we could also then create a typical story centred around the current factors, i.e. told in terms of our concepts. 

--->

### Custom Links Label <i class="fas fa-tag"></i> {#custom-links-label-filter}

<div class="user-guide-callout">
<strong>🏷️ What this does:</strong> Configure how link labels appear on your map based on any field in your data. Choose what information to display (like tribe memberships or custom attributes) and how to show it (counts, percentages, or statistical significance).
</div>

**Controls:**
- **Field** - Dropdown of available fields from your filtered data (typically shows custom fields like tribe ID)
- **Counts** - Choose whether to count **Sources** (unique participants/documents) or **Citations** (links)
- **Display mode** - Choose how to show the data:
  - **Tally** - Show counts for each value (e.g., "T1:4 T2:3")
  - **Percentage** - Show what % of each value's total links appear in this bundle (e.g., "T1:34% T2:22%")
  - **Chi-square** - Show bundle size, then which values are significantly over-represented (⬆) or under-represented (⬇) (e.g., "45 (T1⬆ T3⬇)")
  - **Chi-square (with counts)** - Also show the observed count for each significant value (e.g., "45 (T1 4⬆, T3 3⬇)")
  - **Chi-square (with counts/totals)** - Also show observed/total for each significant value (e.g., "45 (T1 4/5⬆, T3 3/6⬇)")

**To use:**
1. Add the Custom Links Label filter to your pipeline
2. Select a field (e.g., `custom_tribeId` after running the Tribes filter)
3. Choose a display mode
4. In Map Formatting, set Link Labels to "Custom Links label"

**Example use cases:**
- **After Tribes filter:** Show which tribes contribute to each connection (T1:5 T2:2 T3:1)
- **Significance testing:** Identify connections where certain tribes are surprisingly over/under-represented (T1↑ T3↓)
- **Custom attributes:** Display any custom field you've added to your data

<!---

**Technical details:**

This is a **non-filtering** filter - it doesn't change which links appear, only configures how they're labeled on the map.

**Display modes:**
All modes use the **Counts** toggle:
- **Citations**: each link counts as 1 observation
- **Sources**: each unique `source_id` counts as 1 observation (per value and per bundle)

1. **Tally:** For each value, show its count within the bundle (based on chosen Counts unit)
2. **Percentage:** For each value, calculates: (count in this bundle) / (total count of this value across all filtered links) × 100 (based on chosen Counts unit)
3. **Chi-square (no counts):** For each value, tests whether observed differs from expected (based on chosen Counts unit):
   - Expected = (bundle size) × (value total) / (grand total)
   - Chi-square contribution = (observed - expected)² / expected
   - Critical value for p < 0.05 with df=1 is 3.84
   - Format: `bundleSize (value⬆, value⬇)` (only significant values shown)
4. **Chi-square (with counts):** Same test, but format includes observed count: `bundleSize (value observed⬆, value observed⬇)`
5. **Chi-square (with counts/totals):** Same test, but format includes observed/total: `bundleSize (value observed/total⬆, value observed/total⬇)`

The filter populates its field dropdown from `currentFilteredLinks` (the output of the filter pipeline), so it sees all fields added by previous filters.
