---
title: 070-create-links-tab-create-link-tab
created: 2025-12-24T14:56:45Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: 765f1c17234e
original_path: content/999 Causal Map App/070 Create Links tab ((create-link-tab)).md
---

Qualitative causal mapping involves taking passages of text, e.g. from interviews or documents, and identifying sections which make causal claims. We highlight each of these sections and specify a causal factor at each end of each link (for example Lost job or Went hungry). This means creating a new factor or reusing an existing one. Usually we create these factors inductively as we code, and revise and review and consolidate them as part of the process, as with any other kind of qualitative content analysis. 


To code a causal link,

- With your mouse, highlight a piece of text within the statement which makes a causal claim. Your selection must remain within one statement and must not cross into another statement.
- Watch how that passage is copied for you into the "Quote" window. (Usually, you don't need to think about this window: you can edit the text if you really need to but it **has to remain an exact quote of one part of the text**.)
- Start to type the name of the influence factors at the**start** of the link(s) which you are going to make, in the first drop-down menu.
- If there is an existing factor which matches what you want, you can select it.
- Otherwise, you will create a new factor with the contents of what you have typed; finish what you have typed with a comma or a tab character if you want to continue to select or create another factor.
- If you want to create more than one link, you can select or create additional factors in the same box (as shown in the video below).
- When you have finished, press Enter.
- Repeat the process in the other box to specify the factors at the**end** of the link (or ends of the links).
- Press the green Save button which is now active.
- The link is created in the Map window.
- When you have finished coding one source, click the right arrow in the source navigator to code the next source.

### Source Text Viewer {#text-viewer-content}

<div class="user-guide-callout">
<strong>✨ What you can do here:</strong> Read your source documents and create causal links by highlighting text. When you highlight a passage that claims or implies that one thing influences or causes another, a popup lets you identify the cause and effect. 

This is where you do the core work of mapping out causal relationships from your source material, a process which we call *coding*</strong>
</div>

The text viewr shows full text from the selected source. If you have selected multiple sources, it shows the text from the first selected source. You can:
- Highlight sections to identify causal claims. Highlighting opens the causal link editor.
- Examine and edit existing highlights by clicking on them.


Inside the header, there is an info ℹ️ icon which toggles open/shut a panel beneath it which shows the values of the custom columns for the current source e.g. gender etc. 


<!--

ignore the help search highlighting, that is a different system, leave it alone. 
with the rest:
Highlight positions are stored once per link in start/end offsets links.text_start_offset / links.text_end_offset.

For AI highlighting, the model receives text from the Sources table (including line breaks). Returned `selected_text` may differ in how it represents line breaks. We locate canonical start and end offsets in the original text using a single method:
- Case-insensitive literal match first
- If no exact match, fuzzy match via a fuzzy-search library
- No additional strategies
The resulting start and end are absolute positions in the original, unchanged source text.

Then, to do the actual highlighting in textviewer, don't iterate but calculate in advance the positions of all the starts and ends of all the spans including spans which mark overlapping sections, BEFORE allowing for the fact that the actual html will ultimately also include br linebreaks and look like: <br>"some text"<br><br> etc. 
Then, produce the actual html with all the correct spans, <br>, etc. 

MANUAL HIGHLIGHTING:
Behaves the same. The `selected_text` contains no HTML. We first try exact match, then a single fuzzy match to determine and store start/end positions.  


'### Text search NOT YET IMPLEMENTED {#text-search-not-yet-implemented}

The magnifying glass next to "Source Text" opens a dropdown with a search box, a Search button, and Next/Previous buttons to jump through results. Next/Previous scrolls the viewer to each match.

-->

#### Navigation Controls {#navigation-controls}

Navigate sources:
- <i class="fas fa-chevron-left"></i> **Previous source**
- <i class="fas fa-chevron-right"></i> **Next source**

Navigate highlights within the current source:
- <i class="fas fa-fast-backward"></i> **First highlight in source**
- <i class="fas fa-step-backward"></i> **Previous highlight**
- <i class="fas fa-step-forward"></i> **Next highlight**
- <i class="fas fa-fast-forward"></i> **Last highlight in source** (useful if you haven't finished coding the whole text yet and want to see the last highlight)


Source selection is filtered through the sources selector dropdown. When multiple sources are loaded, the first source is displayed. The next/previous buttons cycle through sources by updating the sources selector to show the next/previous source. 

This is convenient because usually when coding you will want to view the [Map](../map-panel/) and [Links](../links-panel/) for the same source on the right. 

Clicking these buttons means that if you previously had a multiple selection, you now have only one. 

#### Dealing with long documents in the source text viewer {#long-documents-text-viewer}

For documents longer than ~30-40 pages, the text viewer automatically splits content into manageable chunks for better performance. Navigation controls appear in the "Source text" header:
- **Dropdown selector** - "Chunk 1 of 5" becomes clickable to jump to any chunk
- **Arrow buttons** - Navigate to previous/next chunk  
- **"Next chunk" button** - Appears at the end of each chunk (except the last)



### Visual Highlighting {#visual-highlighting}
Each section of coded text, each causal claim, is shown with a highlight. 

For overlapping or identical highlights with multiple links, overlaps are shown with varying color opacity. Clicking on multiple highlights shows a link selector for each section.
- Multiple highlights shown with varying color opacity
- Click on overlapping highlights to select specific links

### Link Editor screen {#causal-overlay}

<!--aka ("Causal Overlay") -->
Opens when you highlight text or click on existing links.

**Fields:**
- **Cause and Effect selectors** - Unified project-wide label list sorted by frequency
  - Both dropdowns use the same suggestions (combined causes+effects from the entire current project, not just the current source)
  - Large projects: switches to type-to-search mode (min 2 chars), returning up to 200 matches; top ~300 are preloaded for quick access
  - You can type new labels or select from the dropdown. You can type and select more than one cause and/or effect.
- **Quote field** - Editable text that gives the evidence for the causal claim. Also supports ellipses like this: `Actual quote [this text is ignored] quote continues blah blah.`
- **Chain toggle** - Defaults to unchecked on every fresh open/edit. If checked, saving keeps the overlay open and loads the previous Effect as the next Cause; if not checked, saving closes the overlay. The toggle remains checked only when the overlay stays open due to chaining.
- **Plain coding toggle** - Used when you want to record something which is not explicitly mentioned as a cause or an effect. Defaults to off. When on, 
  - the tag `#plain_coding` is added (if not already present) to the comma-separated list of tags.
  - Whenever the tag `#plain_coding` is present:
    - the toggle is switched to on 
    - the effect factor selector is forced to have the same contents as the cause factor 
    - the effect factor selector is disabled for the user 
- **Tags field** - Add tags to the link like `#hypothetical` or `check`
- **Favorite buttons** - Heart, exclamation, star toggles for marking important links or useful quotes. Later you can use these tags and favorites in filters.

**Actions:**
- **Save** - Create the link(s)
- **Delete** - Remove existing link
- **Cancel** - Close without saving


Links in Causal Map only have one cause and one effect. You can add multiple causes and/or effects to the boxes, and the system createsall combinations when saving. So if you put `unemployment` and `violence` in the Cause box, and `stress` and `worry` in the Effect box, the system will create four links.

<!---
The favorites buttons are stored in the metadata column and appear in the links table for searching and sorting.

--->

### About the factor label dropdown menus

By creating links, you also create the names of your factors.

In Causal Map, a factor*is*its label. Once you create a label, there is nothing else to add.

Factor names which contain semicolons **`;`** get special treatment as they separate the different parts of [🔖 Hierarchical factors](xx) .

After beginning to create links between factors, already-coded factors will appear in the dropdown menus in the to and from factor boxes. For added convenience. The most frequently coded factors will appear at the top of this list


### #doubtful? #hypothetical? Adding link tags

#### Link tags

Link tags are available as a special kind of memo when coding a link: you can use them to provide any kind of additional information.

![Untitled](../%EF%B8%8F%E2%83%A3%20Link%20hashtags%2050a789cc60ad4b1e9cad10b81c68e2a1/Untitled.png/)

There is no need to actually use a hash `#` at the start of a link tag, though you can if you want. Just use any unique single word which is easy to search and filter on, like #nutrition or nutrition# or nutrition–.

As usual in Causal Map, you can apply one or more tags, and you can either select existing tags or create new ones on the fly.

Later, you can filter the map (see  [✨ Transforms Filters: Include or exclude tags](%E2%9C%A8%20Transforms%20Filters%20Include%20or%20exclude%20hashtags%2052c71ae58ea74c628a790142f9b728f8.md)) to show only links containing or beginning or ending with specific hashtags (or parts of hashtags), and also for links which do*not*contain specific hashtags or parts of hashtags.

You can also use tags to narrow down your searches in [🔗 The Manage Links tab](%F0%9F%94%97%20The%20Manage%20Links%20tab%2070835b4b20664837870680b7151d4c6e.md).

You can display [tags on your map](../%EF%B8%8F%E2%83%A3%20Link%20tags%2050a789cc60ad4b1e9cad10b81c68e2a1.md/).

Conceptually, there are two kinds of tag.

#### Ordinary link tags

You can use any tag which does not begin with a `?` to record any other information about the link, e.g.:

- respondent doesn't like this connection
- respondent feels good about the outcome
- for you, the analyst, e.g.
    - respondent is answering a different question
    - to tag links you want to come back and review.

#### Weak tags

Weak tags are a special kind of tag. They are*caveats*. If you use weak tags, you should make sure that by default your maps do not include any link with a weak tag.

This is just a convention, it makes no difference to the Causal Map app. 

They begin with `?` and are used to mark any link which you are not sure is always valid across the global context for the whole global map, for example:

- **the causal connection** is only valid for a specific context, e.g.
    - the respondent says this is only true for their village, not for other villages e.g. `?village X`
    - a link is only projected for the future e.g. `?future`
- you are unsure about **the claim about the causal connection**
    - a link is only a hypothesis e.g. `?hypothetical`
    - you as the analyst are not confident in the claim e.g. `?doubtful`
    - the source themselves are not sure e.g. `?source seems unsure`
    - to add other qualifying information e.g. `?probably hearsay`
    - to mark the fact that a connection is **weak or non-existent**, e.g.
        - Respondent makes a substantive claim that X does *not* influence Y, e.g. `?zero influence`
        - Respondent makes a substantive claim that X only insignificantly influences Y, e.g. `?weak`


### AI Coding {#ai-card}


<span class="badge bg-warning text-dark" style="margin-left:6px;">Requires AI subscription</span>

- **Model dropdown** - Select AI model
- **Prompt box** - Enter coding instructions
- **Add source prompt** - Toggle, default ON
- **Response displays** - View AI responses and full JSON

Motivation for source prompt: it is just to describe the context/background info about each source. Not necessary e.g. where all the sources are from the same context which can be described in the main prompt. But important where some differ, e.g. mid-term reports or whatever. 

If Add Source Prompt is ON, then show a text area above #text-viewer-content with usual greenish Save button to edit the corresponding source prompt for the current source. 

Additional controls hidden behind gear icon (experimental):
- **Temperature slider** - Control randomness (default 0)

<!-- Note: AI Processing Region is now configured per-project in the Project Details modal (Edit project), not in the AI panel. This ensures consistent data residency for each project. -->

**Iterative Processing:**
If your prompt contains lines with `====` on their own, each section before and after the line is treated as a separate iteration. Line endings and surrounding spaces are tolerated (CRLF/whitespace OK). First iteration is normal; subsequent ones include the full prior conversation history (all previous User prompts and AI responses) to build on earlier results. Only the results of the last iteration are added to the links table; all iterations are logged in the responses panel.


**Workflow:**
- Select one (or more) sources to process using the sources dropdown
- Select "Skip coded sources" if you don't want to recode sources which have already been coded
- Toggle "Add source prompt" to append the new Source Prompt field before the beginning of the main prompt
- Click "Process Sources" button
- Confirmation dialog shows model, word count, and warnings
  - Pre‑modal quick estimates are time‑boxed (~2s). If the fetch is slow, the modal still appears and estimates may show as n/a. Heavy work only starts after you click Proceed. See `webapp/js/ai-manager.js` near `AI_DEBUG_QUICKSTATS_START`.
- AI processes sources in batches
- Results are also logged to the responses table on the right of the screen

[Tips on using the prompt history](../tips-prompts/)

- Timeouts: per‑iteration budget scales by model and iteration count (cap 540s total): Flash 120s/iteration; Pro 270s/iteration.
- Concurrency: Radio group labeled "Concurrency" (1–5) next to Region in AI settings. Default 1. Increase if you want faster processing but may risk 429/timeouts.
- Logging & Responses: each chunk inserts a pending row in `ai_logs` (status pending) and updates to success/error on completion; Responses tab auto‑refreshes as rows update.


<!---

The AI coding system:
- Uses Google Vertex AI API with proper backoff/retry
- Stores all prompts, responses, and metadata in ai_logs table
- Supports iterative prompts separated by ==== lines
- Processes sources sequentially for reliability
- Maps AI response fields: cause→cause, effect→effect, quote→selected_text
- Additional AI fields stored in metadata column
- Supports multiple AI providers (Google, Anthropic, Meta, Mistral, Cohere)
- Additional models require setup in Google Cloud Console

**Processing Flow:**
1. Sources processed one at a time for reliability
2. Confirmation dialog shows model name, statement count, word count, and warnings
3. For each source: deletes existing links → sends prompt + source text to AI → parses JSON response → inserts new links
4. Additional AI-provided fields stored in metadata
5. Quote field maps to selected_text in links table
6. All processing logged to ai_logs table with full audit trail

**Settings Persistence:**
- **AI Region**: Saved per-project in database metadata (see Project Details modal). Ensures consistent data residency compliance for each project.
- **AI Chunk Size**: Saved globally in localStorage as 'ai-chunk-size' (applies to all projects)
- **Add Source Prompt toggle**: Saved per-project in localStorage as 'ai-add-source-prompt:{projectName}'
- Settings restored automatically on page load
- Change events save settings immediately when dropdowns are modified
- Validation ensures only valid option values are restored


so it goes: 
job > batch > source > chunk > iteration


and each of those defines one call and response? So each job might have multiple batches, which have multiple sources, which have multiple chunks, which may have multiple iterations (and the iterations are a conversation where each builds on the last)
and only the final iteration result gets inserted as links table
and if the result IS a table, it gets a special section in the responses modal
and the iteration, batch, etc all get written to the logs table

--->
