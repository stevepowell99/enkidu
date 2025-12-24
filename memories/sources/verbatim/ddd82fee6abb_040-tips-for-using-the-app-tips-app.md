---
title: 040-tips-for-using-the-app-tips-app
created: 2025-12-24T14:55:17Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: ddd82fee6abb
original_path: content/999 Causal Map App/040 Tips for using the app ((tips-app)).md
---

### Tips for Using the Dropdown Menus {#tips-dropdowns}

There are many dropdown menus throughout the app. 

- Most dropdowns allow multiple selections: you can select more than one thing at once
- Most dropdowns allow you to type and create new entries which are not already in the list. 
  - Type part of a word and click "Create new..." to add new items
  - Press Enter to complete selections
- Pressing Tab always moves you to the next field (doesn't complete selection). See also [Search/replace](../factors-search-replace/) for bulk editing patterns.



#### Edit an item

- **Backspace editing**: Position cursor after an existing selection and press backspace to edit it

Click to the right of the item, then press backspace to edit the label, and press tab to complete. 

![](https://live.staticflickr.com/65535/53300744438_69cc2478ac_o.gif)

#### Delete the first and subsequent items using the keyboard

Click after the last item, use the left arrow on your keyboard to go back to previous items, then press Delete on your keyboard to delete items after the cursor.

![](https://live.staticflickr.com/65535/53300507671_5e07b43240_o.gif)


### Tips for Using Tables {#tips-tables}

Most tables include:
- **Checkboxes** ☑️ for selecting multiple rows
- **Bulk action buttons** when you have selected one or more rows (edit, delete)
- **Action buttons** within individual rows to apply actions (edit, delete etc) just to that row
- **Sorting** by clicking column headers
- **Filtering** using the filter row below headers
- **Pagination** with 10/25/50/100 items per page
- **Re-ordering columns** by dragging the column headers


### Tips for Using Prompts and other text windows {#tips-prompts}

<span class="badge bg-info text-dark" style="margin-left:6px;">Require an AI subscription</span>

When you use text windows, your texts are automatically saved so you can reuse them later.

**Text history is available in:**
- **AI Coding** (Process Sources tab)
- **AI Answers** (Answers tab) 
- **Map Vignettes** (Vignettes tab)
- **Soft Recode filters** (both label prompts and magnet lists)
- **Auto Recode filter** 

**How to use text history:**
- **Dropdown menu**: Shows your previous prompts with project name and date/time
- **< and > buttons**: Navigate between newer and older prompts
- **Text area**: Shows the selected prompt and lets you edit it
- **Expand button**: Optionally dit your text in a larger, more convenient text editor with multiple cursors, search/replace etc.
- **Trigger button**: Runs the AI with your current prompt and saves it to history

**How prompts are organized:**
- Your current project's prompts appear first (most recent at top)
- Then prompts from other projects you can access
- Each prompt shows when it was last used
- Duplicate prompts are automatically removed

**Using the controls:**
- Select any prompt from the dropdown to load it
- Use < and > buttons to move through your text history
- Edit the prompt in the text area as needed
- Click the action button (Process, Ask, Generate, etc.) to run it

Your most recent prompt automatically appears when you open each AI feature. 

Tip: Any lines beginning with // in your prompt will be recorded in the history etc but not actually sent to the AI. You can use this to make notes e.g. at the top of your prompt: "//Sarah's version with tweaked summary"

<!---
#### ai coding prompts
Trigger:  Process Sources

####  auto labelling 
#dev-soft-recode-next-prompt
Trigger: Insert button

#### Magnets widgets 
(#dev-soft-recode-prev-magnets-filter etc) Trigger: Save button

#### AI answers
Trigger: ##rag-submit-btn
#### Map Vignettes (here we need two sets of widgets, remove the old one. )




Timestamps come from project metadata (metadata.aiPromptsTimes[prompt]), not local storage. If you see only "—" for older prompts, that means those prompts don't have a stored last-used timestamp yet in the DB. Once you use/save a prompt, its timestamp is written to metadata and will appear thereafter.

Pressing Process Sources upserts the prompt with new timestamp to the db. 

--->
