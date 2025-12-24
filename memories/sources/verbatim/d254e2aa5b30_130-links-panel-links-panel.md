---
title: 130-links-panel-links-panel
created: 2025-12-24T14:59:06Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: d254e2aa5b30
original_path: content/999 Causal Map App/130 Links Panel ((links-panel)).md
---

<div class="user-guide-callout">
<strong>🔗 What you can do here:</strong> View and manage all your causal links in a spreadsheet-like table. You can sort, filter, and edit individual links, view the quotes like a printed page, or export your data to Excel. Each row shows one causal relationship with its source quote and any additional details you've added. Great for detailed review and bulk editing of your causal map data.
</div>

### Links Table {#links-table}

**Links Table Features:**
- Standard column filters, sorting <i class="fas fa-sort text-muted"></i>, and pagination
- Sentiment column with numeric values (-1 to 1) and blue/white/red conditional formatting (blue = higher, red = lower, white = mid-range relative to the current view)
- **Citation Count** – total number of links in each bundle (cause >> effect pair), with muted green → white conditional formatting (darker green = more links in that bundle relative to the current view)
- **Source Count** – number of different sources contributing links to each bundle, with the same muted green → white conditional formatting
- Checkbox selection for bulk operations
- Edit functionality opens causal overlay for link modification
- Action button to open coding in the Sources pane and scroll to the corresponding highlight <!-- opens textViewer -->
- <i class="fas fa-times"></i> Clear Table Filters option
  - 💡Tip: For label changes, prefer [Factors Search/replace](../factors-search-replace/) when working on labels across bundles.

**Link Editing:**
- Single link click opens editor popup
- Multiple link selection opens chooser interface
- Consistent with coding panel behavior

### Links Utilities {#links-controls-row2}

- Download as Excel
- Take a screenshot and copy it to clipboard
- Clear any filters at the top of the table columns
- Bulk delete any selected rows in the table

### Row Grouping and Print View {#links-controls-row1}

- **Group by selector** - Choose one or more columns to group rows by values. This applies both the the links table and Print View.

**Useful Columns:**
- **Bundle** - Shows "cause >> effect" pairs
- **Original Bundle** - If you have used filters which transform the links, like Zoom or Soft Recode, use this to also view the original causes and effects


#### Print View <i class="fas fa-quote"></i> {#quotes-widget}

The purpose Print View is to make it easy to explore and read actual quotes from the currently filtered links. What it does is show, instead of the contents of the Tabulator table, a printed version of the same information, leaving the table headers and filters in place. The toggle switches between table contents view and print view. 

This view prints out the quotes from each row in the table, grouped by the Group By columns formatted as nested headings, and we suppress repeated headings until they change. 

We also reveal two more toggles: 

- Show Details: Print the values of all the extra columns such as tags and any [Custom Columns](../custom-columns/)
- Context: for each quote we add an additional three sentences at each side, highlighting the actual quotes. 

You can manually sort the texts using to the sorting widgets in the tabulator headers, as far as allowed by the nested headers.

### Search/replace {#links-search-replace}


This works exactly the same as [search/replace in the factors table](../factors-search-replace/), except that it works on the Cause label and/or the Effect label.

Near the top is a row containing a search box. If you type something into it, 
- a replace box and a Replace button also appear. 
- the table is filtered to show only matching rows.

The search is **case sensitive**.

You can then alter what you see in the Replace box:
- in the label columns in the table, you see a preview of what the affected rows text so the would look like; 
- if you delete all the replace text so it is empty, the preview shows the effect of deleting the search text from each label. 

Then when you are satisfied, check all the checkboxes where you want to update the labels as shown. If you want, select all rows using the checkbox at the top of the column. Note, if there are more hits than fit on this page of your table, you'll want to either treat each page separately or increase the page size with the Page Size selector. 

Finally, hit the Replace button to actually update the labels as shown in the rows you selected. As you'd expect, this search/replace only affects the factors for the currently selected links: for example if you have only selected the first three sources, this update will not affect the links in the other sources.


 <!--
Below the grouping controls row is a row containing a search textinput and a replace textinput and a Replace btn. 
Every time search field is updated, update the replace field to match. But obviously then allow manual changes to the replace field.

This works exactly the same as search/replace in the factors table, so we can maybe wrap and reuse that code, EXCEPT if search is non-empty, first filter the table to show only rows matching the search text in **Cause OR Effect** column, then do a fake preview search-replace on those two columns in the table just before display (don't really replace text yet). (If replace is empty, preview deleting the search text from each label.) 

Then when user hits Replace, only the checkbox-selected rows (across all pages) are processed; unselected rows are ignored. A confirmation modal shows the total number of replacements, then the replacements are applied in the Cause and Effect fields to_label/from_label in DB , then the view refreshes -- using linksUpdated -->.

<!---

not yet working ### Statistical Significance Testing for Links {#links-statistical-significance}
The links table includes the same chi-squared significance testing as the [factors table](../statistical-significance-testing/) but operates on **link bundles** (cause >> effect pairs) instead of individual factors.

**Key differences:**
- **Unit of analysis**: Link bundles instead of factors
- **Bundling**: Links grouped by "cause >> effect" pairs using current filtered labels
- **Example bundle**: All links from "Economic Support" → "Education Access" become one bundle


extra columns: bundle, source count and citation count. Bundle is just the concatenation cause >> effect. source count and links count are number of unique sources / links in the bundle. 

**NOT IMPLEMENTED Summarising features:**

First we add:
- `group by rows` selectize (not multi-select) with default "No grouping". this is populated with all table columns which have fewer than 10 levels. 
- "group by columns" selectize (not multi-select) with default "No grouping". this is populated with all table columns which have fewer than 10 levels. 
- aggregation dropdown with just the values "count unique" (default) and "count".

As usual, the col names in these selectors are populated with the columns of the current links table.

When such a grouper is selected:
- remove action buttons and checkbox and source count and citation count columns

If col grouper is active, show the levels of that colum as columns. if row grouper is None, that really means the default, hidden linkID is providing the rows. If row grouper is active, i.e. not None, the rows show the levels of the row grouper.  
when either grouper is active, cells show the result of the selected aggregation function. 

**Statistical Testing Implementation:**

**Key Differences from Factors Table:**
- **Unit of analysis**: Link bundles instead of factors
- **Bundling**: Links are automatically grouped by "cause >> effect" pairs using current filtered labels
- **Breakdown controls**: Located next to "Breakdown by" selectize instead of factors controls
- **URL state keys**: `linksBreakdown`, `linksCountType`, `linksSigThreshold` (vs factor equivalents)

**How Bundling Works:**
Links are grouped into bundles using **current filtered labels** (after soft recode, etc.), so bundles reflect processed data rather than raw labels. Each bundle represents all links sharing the same cause >> effect relationship.

**Example bundle**: All links from "Economic Support" → "Education Access" become one bundle for statistical analysis, regardless of slight variations in original coding.

For complete methodology, visual indicators, and interpretation guidance, see the [Statistical Significance Testing](../statistical-significance-testing/) section above - all concepts apply identically to link bundles. 

--->
