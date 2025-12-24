---
title: 120-factors-panel-factors-panel
created: 2025-12-24T14:58:40Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: 050cef8ee210
original_path: content/999 Causal Map App/120 Factors Panel ((factors-panel)).md
---

<div class="user-guide-callout">
<strong>🏷️ What you can do here:</strong> See all the factors (causes and effects) in your data, ranked by how often they appear. Select multiple factors to rename them, merge similar ones, or delete unwanted entries. If you've added demographic data to your sources, you can also see statistical breakdowns showing which groups mention certain factors more often.
</div>

above both links and factors tables add a toggle "Use filters". If on (default) the table is filtered by the links filters. If off, we bypass this part of the pipeline and filter only by project and sources. 

The Factors panel displays all unique labels from the current filter pipeline.

**Table Features:**
- Columns include:
  - **Citation Count** – total number of citaions of this factor (as cause or effect)
  - **Source Count** – number of different sources mentioning this factor
  - **Citation Count: In** – number of citations of this factor as an effect of something
  - **Citation Count: Out** – number of citations of this factor as a cause of something
  - **Source Count: In** – number of sources mentioning this factor as an effect of something
  - **Source Count: Out** – number of sources mentioning this factor as a cause of something
- Sorted by citation count (descending order)
- Click-to-select (no checkbox column)
- Server-side pagination consistent with other tables
- Actions column with edit button to open factor edit modal

**Action Buttons:**
- <i class="fas fa-trash"></i> Delete: Remove selected factors
- <i class="fas fa-edit"></i> Relabel: Rename selected factors  
- <i class="fas fa-search"></i> Search/Replace: Find and replace text in factor names
- <i class="fas fa-compress-arrows-alt"></i> Merge: Combine multiple factors into one
- Buttons disabled until factors are selected
  - 💡Tip: Use [Search/replace](../factors-search-replace/) for quick, scoped relabeling.

Find out more about bulk delete and relabel of factors [here](../editing-and-deleting-multiple-factors/).  

### Bulk factor labels editor {#factors-relabel}

<!-- TECH: Similar to links table Print View toggle - leaves tabulator header intact but displays Ace Editor body -->
<!-- TECH: Uses Ace Editor for multi-cursor support, responds to tabulator sort/filter events -->
<!-- TECH: Tracks _recoded column to disable edits to recoded labels (they're protected and shown in italic) -->

The search/replace functions in the factors and links tables are useful, but what if you have thousands of factors to look at? You might prefer this bulk editor.

Toggle the **Bulk Edit** switch to edit multiple factor labels at once. The table header remains visible for sorting and filtering, while the table body is replaced with a line-by-line editor.

**Features:**
- **Multi-cursor editing**: Use `Alt+Click` or `Ctrl+Alt+Up/Down` to add multiple cursors
- **Find occurrences**: Use `Ctrl+Alt+Right` to add next occurrence, `Ctrl+Alt+Left` for previous
- **Select all matches**: Use `Ctrl+Shift+L` to select all occurrences of selected text
- **Line-by-line editing**: You can only edit existing labels - you cannot add, remove, or reorder lines
- **Recoded labels**: Labels that have been recoded (shown with yellow background) are read-only and cannot be edited
- **Sort and filter**: The editor automatically updates when you sort or filter the table (any unsaved edits are discarded)

**How it works:**
1. Toggle **Bulk Edit** on
2. Edit factor labels directly in the editor
3. Press **Save Changes** to apply your edits
4. A confirmation dialog shows which labels will change and how many links will be affected
5. After saving, the editor refreshes to show the updated labels

<!-- TECH: Changes are only saved when user presses Save button - no live updating -->
<!-- TECH: Editor content is refreshed when table sort/filter changes, discarding unsaved edits -->
<!-- TECH: Recoded labels are protected via change detection - edits are automatically reverted --> 

NEW: add a second column to this div so that the editor takes up 9/12 of the width. in the new column, provide some live info about the selected factor: source and citation counts, and a list of sources mentionoing it.

### Search/replace {#factors-search-replace}

Near the top is a row containing a search box. If you type something into it, 
- a replace box and a Replace button also appear. 
- the table is filtered to show only matching rows

The search is **case sensitive**.

You can then alter what you see in the Replace box:
- in the factor label column in the table, you see a preview of what the affected rows would look like; 
- if you delete all the text so the replace is empty, the preview shows the effect of deleting the search text from each label. 

Then when you are satisfied, check all the checkboxes where you want to update the labels as shown. If you want, select all rows using the checkbox at the top of the column. Note, if there are more hits than fit on this page of your table, you'll want to either treat each page separately or increase the page size with the Page Size selector. 

Finally, hit the Replace button to actually update the labels as shown in the rows you selected. What actually happens is that the Cause and Effect labels in all the currently selected links are changed. As you'd expect, this search/replace only affects the factors for the currently selected links: for example if you have only selected the first three sources, this update will not affect the links in the other sources.

<!-- Every time search field is updated, update the replace field to match. But obviously then allow manual changes to the replace field.
If search is non-empty, first filter the table to show only matching rows, select all rows in the lefthand checkbox column then do a fake preview search-replace on the factor label column in the table just before display (don't really replace text yet). (If replace is empty, preview deleting the search text from each label.) 

Then when user hits Replace, only the checkbox-selected rows (across all pages) are processed; unselected rows are ignored. A confirmation modal shows the total number of replacements, then the replacements are applied in the Cause and Effect fields <!-- to_label/from_label in DB , then the view refreshes  using linksUpdated -->.

### Demographic Breakdowns {#demographic-breakdowns}
- **Breakdown selector** - Choose custom columns to analyze by demographics
- **Count type** - Source count (default) or citation count
- **Display mode** - Counts (default) or % of baseline (cell as a percent of that breakdown group’s total across all factors)
- **Statistical testing** - Chi-squared analysis to identify significant patterns
  - See also [Statistical Significance Testing](../statistical-significance-testing/)

### Statistical Significance Testing {#statistical-significance-testing}
When you select exactly **one custom column** for breakdown, the factors table includes powerful chi-squared significance testing to identify factors that are preferentially mentioned by different groups.

**Show Differences dropdown** appears with threshold options:
- **Off** (default)
- **p < .1** (marginally significant)
- **p < .05** (significant) 
- **p < .01** (highly significant)
- **p < .005** (very highly significant)

**Visual indicators:**
- **Significant column** - Shows "Yes" (red highlight) or "No" 
- **Cell coloring** - Blue = mentioned more than expected, Orange = mentioned less than expected

**Ordinal testing (numeric breakdowns):**
- If the chosen breakdown is numeric-like (≥95% of non-missing values parse as numbers), an extra column **Ordinal Sig.** appears.
- It uses the Mantel linear-by-linear association (Cochran–Armitage trend) with ranks 1..k and the same 2×k totals as chi-squared.
- The existing **Significant** column (chi-squared) remains; you can compare both.
- The threshold from Show Differences applies to both tests.

<!---

With selected rows, merge button should open a modal which prints the names of the selected factors and their counts, and a text box prefilled with label which has highest citation count. choices: as courrently filltered or everywhere. pressing confirm relabels with the new name

With selected rows, rename button should open a modal which prints the names of the selected factors and their counts, and a search and a replace text box. choices: as courrently filltered or everywhere. allow wildcards so *asdf as search and foo as replace will replace all text up to and includingi asdf in the labels with foo. Show a preview of the changes. pressing confirm relabels with the new search/replaced names. 

We add a new selectize to the Factorst table with the names of all the custom columns in the links table as suggestions, but empty on init. 
We add a radiobutton with values source count (default) and citation count.
Suppose user selects gender which has say two values. Our aim is to add these two columns to the table, and the cells are (default) the number of sources with each gender who have a link to or from the label; or if count=citation, just the number of links attributed to each gender. 

good! put the new columns at the start of the table immediately after label. 
actually i wanted a selectize not a dropdown so we can also add another column like Age group and add this breakdown too, in parallel (not cross-product). Only suggest custom columns which have fewer than 10 values.

**Statistical Testing Implementation:**

**Example:** Analyzing gender differences in factor mentions

| Factor | Women | Men |
|--------|-------|-----|
| *... other factors ...* | | |
| **Number of mentions of "Income Support"** | **10** | **9** |
| *... other factors ...* | | |
| **Total mentions of any factor** | **60** | **10** |

Although women mentioned "Income Support" only slightly more often than men (10 vs 9), women altogether mentioned factors 6 times more often than men (60 vs 10). The chi-squared test asks:

> Is the ratio 10:9 significantly different from what we'd expect given the overall ratio 60:10?

The test creates a contingency table:

| Category | Women | Men |
|----------|-------|-----|
| **Mentions of "Income Support"** | **10** | **9** |
| **Mentions of other factors** | **50** | **1** |

**Citations vs Sources Mode:**
- **Citations mode**: Uses raw link counts (sensitive to people who make many claims)
- **Sources mode**: Uses unique source counts (less sensitive to outliers)

Sources mode is recommended when some participants contribute disproportionately many links.

**Visual Indicators:**
**Significant Column:**
- Displays **"Yes"** (red highlight) or **"No"** based on your p-value threshold
- **Header filter dropdown** lets you show only significant or non-significant factors
- Sortable by significance status

**Cell Coloring (for significant factors only):**
- **Blue cells**: Factor mentioned more than expected by this group
- **Orange cells**: Factor mentioned less than expected by this group  
- **Darker colors**: More extreme statistical differences
- **Light gray**: Normal coloring for non-significant factors

**Chi-Squared Residuals:**
For factors meeting your significance threshold, cell colors reflect standardized residuals:
- **Residual > 2**: Very strong effect (darkest colors)
- **Residual > 1.5**: Strong effect (medium colors)  
- **Residual > 1**: Moderate effect (light colors)
- **Residual ≤ 1**: Weak effect (very light colors)

**Statistical Validity Checks:**
Tests are automatically validated before displaying results:
- **Minimum observations**: ≥5 total observations required per factor/bundle
- **Expected frequency validation**: ≥50% of contingency table cells must have expected frequencies ≥1
- **Invalid tests** display "N/A" with explanatory tooltips (e.g., "Only 3 observations (minimum 5 required)")

This helps you quickly identify which demographic groups disproportionately mention specific factors in your data. 

---> 

in the factors table when factor-show-differences is on, we calculate chi-sq. but if over 95% of non-missing values in the column selected in #factor-custom-column-input can be interpreted as numeric, we should use an ordinal test instead, or apply an ordinal correction to make the chisq test more powerful 

Developer note: Percent mode divides each factor’s cell by the group total for that breakdown column. State keys: `factorDisplayMode`, `significanceThreshold`.
