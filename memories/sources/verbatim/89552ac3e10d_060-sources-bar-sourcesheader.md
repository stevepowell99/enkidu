---
title: 060-sources-bar-sourcesheader
created: 2025-12-24T14:56:21Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: 89552ac3e10d
original_path: content/999 Causal Map App/060 Sources Bar ((sourcesHeader)).md
---

<div class="user-guide-callout">
<strong>📄 What you can do here:</strong> Choose which source documents (e.g. interviews or reports) from your current project you want to focus on. You can select one or more sources. Use this to narrow your analysis to specific interviews, reports, or other source materials. 
- The text of the selected source is shown below in the Create Links panel.
- Selecting these sources also fetches only their links and no others, starting off the [Links Pipeline](../links-pipeline/): only the links from the currently selected sources are available for further filtering, and are finally shown in the output tabs.
</div>

### Sources Dropdown {#sources-dropdown}
- Contains IDs of all sources in current project
- Select one or more sources
- Search by typing

**Default behavior when switching projects:**
- When you load a project via the **Project Dropdown** or **Projects Panel**, and nothing else specifies which sources to load, the app auto-selects the **first source** so the Source Text Viewer shows something immediately.
- When loading from a **URL/bookmark**, we do **not** change the sources selection. An empty Sources selection means **all sources** (by design).
<!-->
- Ordering: alphabetically by source title (with any leading "Source " stripped),
  falling back to ID when title is missing. Next/Previous navigation uses the same order.
 
 - Opening behavior: if a source is currently selected, opening the dropdown will
   start at the next source after the current one (wrap-around at end). If no
   source is selected (empty dropdown), it starts at the first source.

 - The dropdown does not auto-open when sources are updated; it only opens on
   explicit user interaction (click/focus).

-->   

### Source Groups sub-panel{#source-groups-sub-panel}


<div class="user-guide-callout">
<strong><i class="fas fa-layer-group"></i> What this does:</strong> Filter your analysis by participant demographics or document characteristics, using the [custom columns](../custom-columns/) you have defined for your project. For example, show only responses from "women aged 25-35" or interviews from "urban areas." Perfect for comparing how different groups see causal relationships. 
</div>


**Controls**:  
- a pre-populated dropdown called **Field** listing metadata fields plus title and projectname  
- a multi-select **Value** dropdown (filtered by Field)  
- optionally sampling buttons for deterministic subsets:  
  - **Random 5** – loads five random sources from the whole project (also, Random 10, Random 20 etc) 
  - **Random 5/Group** – after choosing a Field, loads up to five random sources *for each value of that Field*.
- **Clear** button  

The sampling buttons ake a random selection but in such a way that <!--use a seeded deterministic algorithm-->the same sources will be chosen if you click the same button again.

The second, "Value" dropdown is filtered to show only valid values for the selected field. Previous/next buttons cycle through values of the selected group. 

The effect is to retain only links where the selected custom column has the selected values.

This dropdown is  NOT a filter and it does NOT get saved/restored in URL. It is a loader: when we click it, the app automatically loads corresponding sources into the sources selector. These sources then DO form part of the links pipeline and ARE restored from the URL.

There is a similar filter in the [Analysis Filters](../filter-link-tab/).
