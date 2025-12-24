---
title: 100-sources-panel-sources-panel
created: 2025-12-24T14:57:53Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: 42a11eec6057
original_path: content/999 Causal Map App/100 Sources Panel ((sources-panel)).md
---

<div class="user-guide-callout">
<strong>📚 What you can do here:</strong> Upload your research documents (PDFs, Word docs) and organize them with custom metadata like participant demographics or interview dates by adding and editing **custom columns**. This is your document library and metadata manager.
</div>

### Upload & Setup <i class="fas fa-upload"></i> {#sources-upload-tab}

#### Upload Source Texts <i class="fas fa-upload"></i> {#upload-documents}
- **Click to select** one or more PDFs or DOCX or RTF files
- **Optionally split large documents into multiple sources** using separator patterns
- **Confirmation dialog** shows projectname→ID mapping
  - On completion, the app automatically: 
    - selects the sources via [Sources Dropdown](../sources-dropdown/) 
    - switches to the [Create Links](../create-link-tab/) sub-tab and loads the first source's text into it
    - on the right, switches to Sources panel with and the View & Edit subpanel

##### Splitting documents into multiple sources with source separators

This feature helps you split individual documents you upload into multiple sources. These separators are *hard*: you use them just once, on uploading one or more documents, to produce multiple sources. 


- In the Confirm Upload screen, there is a Sources Separator text box
- Text lines matching special "regex" patterns separate into multiple sources. So if you have sections marked with "Source Number 12", "Source Number 13" etc, just put "Source Number.*" in the box. 
- This will produce multiple sources with "Source Number 12" etc as source_id
- Live preview of new source IDs with count
- User can leave blank for normal upload

<!---

**project Upload Process:**
- Simple document dropzone for PDF or DOCX or RTF projects
- If no title in project metadata, use filename
- Before uploading, show confirmation modal

**ID Generation:**
- If filenames ≤8 characters, keep sanitized filenames as IDs
- Otherwise create unique IDs keeping as much original filename as possible
- Don't use generic X001, X002 - use first 8 chars, dig deeper if duplicates
- Show table of filename→ID mapping in modal

**Multi-source Upload:**
- In Confirm Upload dialog, offer Sources Delimiter textArea
- Text lines matching regex patterns separate into multiple sources
- Entire matched text (shortened) becomes source_id
- Live preview of new source IDs with count
- User can leave blank for normal upload

NEW: improve ID generation. 
1) remove the preview ID table from Confirm UPload modal
2) generate 2-part IDs: nnnnnn-TTTTTT, e.g. 000124-BARCAM. The first part is just a consequetive padded number. check existing IDs to ensure these are unique and continue from previous max number. So we only need to find the previous max nnnnnn from existing IDs. the second part does this only with the uploaded batch without reference to existing sources: basically just take the first 6 chars from filename. However if this means that any subset of the strings are duplicates, with this subset, window along to take chars 2-7. If any of these are still duplicates, take the remaining subset and take chars 3-8, etc. repeat until all are unique or we run out of chars, in which case take the original chars. It do esn'treally matter if they are not unique because the first, numeric, part is unique. But they can be useful mnemonics for the user. As this only involves looking up the max nnnnnn in existing sources is should be super fast.


--->

#### Section Separators {#document-delimiters}

This feature helps you split existing source texts into sections. These separators are *soft*: they don't permanently change the file and you can add or remove one or more separators on the fly. 

- **Two-line expandable textArea** for one or more (regex) patterns
- **Section header detection** within imported texts
- **Special styling** for matching rows in text viewer
- **Links created in the different sections can be filtered using the [Everything Filter](../everything-filter/)**. So you can do things like "Show me all the causal claims (links) only in answers to Question 7".

- Into the box, you type special "regex" patterns to create sections withing source texts. So if you have sections marked with "Section Number 12", "Section Number 13" etc, just put "Section Number.*" in the box. 
- This will highlight the sections and create fields like "Section Number 12" etc as section ID.


<!---

**Delimiter Storage:**
- Store in project metadata (jsonb) column as "delimiters" containing multiple regex strings
- Dynamic, can be updated at will
- Example delimiter: "question_id.*"

**Text Viewer Integration:**
- When displaying texts, style any row matching regex with special heading style
- When user saves delimiters, refresh textviewer

**Sections Creation:**
- List preserved globally, refreshed on loading new project or saving delimiters
- Extra "Initial Text" section = text before first delimiter in any source
- For any link, determine which section its quote/selected_text begins in
- This becomes new dynamic field in links table
- Everything Filter retains only links whose quotes begin in given section(s)

--->


### Sample Check {#sources-aggregate-tab}

You want a table showing your sample: gender * region?

Use this simple customisable table to check your sample according to any [custom columns](../custom-columns/) you have defined.

- See also: [Statistics Panel](../pivot-panel/) and [Analysis Filters](../filter-link-tab/).

#### Custom Column Analysis {#custom-column-analysis}
- **Aggregate by** multi-select for cross-tabulation
- **1 column**: Simple count table

- **2 columns**: Cross-tabulation table
- **Maximum 10 values** per column for analysis
- **URL state preserved** for bookmarking

<!---

✅ **IMPLEMENTED**: Aggregation analysis (no statistical tests, only aggregation)

**Aggregation Controls:**
- **"Aggregate by" multi-select**: Choose up to 2 custom columns for cross-tabulation analysis

**How It Works:**
- Select 1 column: Creates simple 1-dimensional table showing source counts for each value (each row) with no other columns
- Select 2 columns: Creates cross-tabulation table with first column as rows, second as columns  

**Data Processing:**
- Each source contributes 1 to the aggregation category it belongs to
- Only custom columns with fewer than 10 distinct values are available for aggregation

**URL State Integration:**
- Aggregation column selections preserved in URLs for bookmarking and sharing
- All controls restore state when returning to bookmarked analysis

--->


### View & Edit Your Sources {#sources-table-tab}
- See also: [Tips for all tables](../table-editing-features/) and [Custom columns](../custom-columns/).




#### Sources Table <i class="fas fa-table"></i> {#sources-table}
- NEW column **Source Prompt** -  this new column shows the first few characters of any text in this field. It can be edited as usual with the existing pencil icon/ edit button in each row. 
- **Checkbox selection** for analysis pipeline
- **Row editing** with keyboard navigation
- **Custom columns** for metadata
- **Uncoded column** - Shows true/false for sources with no links; filterable to find uncoded sources
- **Fullscreen mode** available

<!---

**Default behavior:**
- Opens to Sources Table if file has sources
- Opens to "Upload Text" if file has no sources

**Sources table behavior:**
- Behaves like Projects table
- Checkbox only for select/multiselect
- Row click opens modal to view all details including custom fields (editable)
- Has Load Source button like projects table which loads/adds source into dropdown
- Uses same CSS styling as projects table including checkbox
- Has fullscreen button

---> 

#### Table Editing Features {#table-editing-features}
- **Range selection** - Click and drag
- **Copy/paste** - Ctrl+C, Ctrl+V
- **Arrow key navigation**
- **Delete/Backspace** to clear cells
- **Column/row selection** - Click headers
- **Double-click editing**

<!---

**Source Table Features:**
- Custom columns widget for adding/removing JSON-encoded metadata fields
- Direct cell editing with keyboard navigation (arrow keys for up/down/left/right)
- Row selection to filter the analysis pipeline
- Selection state preserved in URL for bookmarking

**Source Selection:**
- Click/unclick table rows to select sources
- Selection affects the filter pipeline feeding right-panel outputs
- Multiple source selection supported

**Editing Features:**
- Range selection: Click and drag to select multiple cells
- Copy/paste: Use Ctrl+C and Ctrl+V with selected ranges
- Navigation: Arrow keys to move between cells
- Keyboard shortcuts: Shift+arrows to expand selection, Ctrl+arrows for jump navigation
- Clear cells: Delete or Backspace to clear selected range
- Column/row selection: Click headers to select entire columns/rows
- Double-click editing: Double-click cells to edit (single-click for selection)

**Clipboard copy/paste (definitive):**
- Uses Tabulator v6 range selection and clipboard modules
- Copies/pastes only the currently selected contiguous cell range (not whole rows)
- Headers and non-editable columns are excluded from clipboard
- Paste applies values into the selected range; out-of-range data is ignored

Config (summarised):
```js
// Sources Tabulator (v6)
clipboard: true,
clipboardCopyConfig: {
  columnHeaders: false,
  columnGroups: false,
  rowGroups: false,
  columnCalcs: false,
  dataTree: false,
  formatCells: false,
},
clipboardCopyRowRange: "range",
clipboardCopyColumnRange: "range",
clipboardPasteParser: "range",
clipboardPasteAction: "range",

selectableRange: 1,                 // single contiguous range
selectableRangeColumns: true,
selectableRangeRows: true,
selectableRollingSelection: false,
```

Persistence flow:
- Tabulator writes pasted values into cells immediately
- `cellEdited` persists single edits
- `clipboardPasted` persists range pastes in a batched per-row update
- During a batch paste, `cellEdited` persistence is temporarily suppressed to avoid races
- Persisted fields: `title` and any column with field name `custom_*` (mapped to metadata.custom_columns)

Usage notes:
- Drag to select a block → Ctrl+C → click start cell → Ctrl+V
- Table must have focus (click once before pasting)
- Row checkbox selection does not affect clipboard; only the highlighted cell range is copied
- Blank pasted cells clear corresponding `custom_*` values

--->

#### Custom Columns {#custom-columns}
- **Manage Columns** <i class="fas fa-columns"></i> opens a modal to add and remove multiple columns at once
- **Toggle visibility** <i class="fas fa-eye"></i>
- **Double-click a cell in a custom column to edit it** or via source edit modal
- **Copy and paste** selections with ctrl-C, ctrl-V.
- **These columns are available elsewhere in the app, e.g.**
  - In the [Source Groups filter](../source-groups-filter/)
  - In the [Everything filter](../everything-filter/)
  - In the [Sample Check table](../sources-aggregate-tab/)

<!---

**Custom Column System:**
- Each project has its own custom columns. Columns do not propagate across projects.
- Detection comes from that project's `sources.metadata.custom_columns` and from `projects.metadata.custom_columns` to ensure empty columns persist.
- Columns persist across sessions: selections are saved to `projects.metadata.custom_columns` and merged with detected keys on load.
- Factors/Sources breakdown options are built only from the current project's enriched links (`DataService.getEnrichedLinks(projectName, selectedSources)`).
- When importing cm3/xlsx, custom columns are imported per-project as before.
- Columns usually differ between projects
- `#toggle-custom-columns-btn` shows/hides columns from UI
- Can manually update data in table
- Available to Source Groups filter in Filter Links panel
- Edit button in each row 

**Round-trip Excel Support:**
- When downloading as xlsx, break out single metadata column into constituent multiple columns
- When uploading basic xlsx (not cm3 format), read nonstandard columns back into single metadata column
- Enables user round-tripping

--->
