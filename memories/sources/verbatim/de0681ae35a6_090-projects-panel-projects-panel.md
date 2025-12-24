---
title: 090-projects-panel-projects-panel
created: 2025-12-24T14:57:32Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: de0681ae35a6
original_path: content/999 Causal Map App/090 Projects Panel ((projects-panel)).md
---

<div class="user-guide-callout">
<strong>📁 What you can do here:</strong> Organize and manage all your research projects in one place. Create new projects, share them with collaborators, add descriptive tags, and control who can view or edit your work. You can also merge multiple projects together or archive old ones to keep your workspace tidy. See also the [File menu](../file-menu/) for more project management options.
</div>

### Project Management {#projects-panel-project-management}
- **New project** <i class="fas fa-plus"></i> - Create with name and description
- **Load project** <i class="fas fa-play"></i> - Open selected project
- **Edit project** - Click row to modify name, description, tags, sharing (or use [Edit project Modal](../edit-project-modal/))
- **Archive/Unarchive** <i class="fas fa-archive"></i> - Hide/show projects (archived projects are read-only and hidden from public view)
- **Read-only toggle** - Restrict editing even for owners/editors (independent of archive status)
- **Archive toggle** - Show/hide archived projects in the table

<!---

- Admins can view metadata of other projects but not load them
- After creating project with #new-project, notification says "Now upload sources (documents) into your new project" and opens #sources-management-panel
- Read-only button in Actions column loads project as view-only even for admins/owners/editors (same restrictions as viewer-only sharing, except admins/owners/editors can remove read-only status)

--->

#### Bulk Operations {#projects-panel-bulk-operations}
Select projects with checkboxes, then:
- **Delete** <i class="fas fa-trash"></i> - Remove projects and all data
- **Apply Tags** <i class="fas fa-tags"></i> - Add tags to selected projects
- **Remove Tags** <i class="fas fa-minus-circle"></i> - Remove tags
- **Toggle Archive** <i class="fas fa-archive"></i> - Archive/unarchive
- **Merge** <i class="fas fa-code-merge"></i> - Combine multiple projects into one

### Sharing and Permissions {#sharing-and-permissions}
- **Email-based collaboration** : add and remove colleagues' email addresses
- **Locked / Read-only permissions** for viewing without editing
- **Global sharing** <i class="fas fa-globe"></i> for public read-only access
- **Permission badges** next to project names
- **Admin only: admin panel** <i class="fas fa-users"></i> for user management

Note: In the Edit Project modal, the informational notice
"Your projects are public and can be viewed by anyone. Upgrade your subscription to keep them private."
is shown only to users who can edit the project (owner, editor, or admin). Viewers do not see this notice.

<!---

**Features:**
- Bootstrap modal dialogs for project creation and confirmations
- Duplicate share prevention with clear error messaging
- Email-based collaboration invites (simplified from user_id tracking)
- Read-only permission system with appropriate UI restrictions
- Admin panel with user management and system statistics

**Read-Only Permissions:**
- Read-only users can view projects, sources, links, and maps
- They can filter, sort, export, and create custom views without database changes
- They cannot create, edit, or delete projects, sources, or links
- UI elements are disabled based on current user permissions
- Global sharing button in Sharing modal makes projects available to all users as read-only

--->


### Versioning {#versioning}

The app automatically backs up your project, so you can restore earlier snapshots if you want.



- An automatic backup is made every 10 minutes if you have made changes.
- You can make a manual backup from the Project Info screen.
- You can use the Version dropdown menu in the Project Info screen to see all available backups with details.
- From here you can restore a backup, with a confirmation step before applying changes. 
- After restoring an earlier version, you can always go back to the latest version if you want, using the same dropdown menu.

This panel shows a dropdown list of times when you made changes to the mapfile in UTC/GMT. Along with the size of your file which can help you identify which timepoint you want to revert to. It can be easy to forget what time you made alterations to your file, so if you're likely to want to restore a previous map it is best to note the time so that you can easily return to it.

<!---

Note: Version lists are loaded lazily when the Version Management modal opens to reduce page-load requests. They refresh automatically after creating, restoring, or deleting a version.
**Automatic Backups:**
- Every 10 minutes, if the user has edit access (owner or editor)
- Only backs up if changes have been made since the last backup
- Stores complete project data (project metadata, sources, and links) to Supabase Storage
- Storage path: `versions/{project_name}/{project_name}_{timestamp}.json`

**Version Management UI:**
- **Project Edit Modal**: New "Project Versions" section shows:
  - Last backup timestamp
  - Manual "Create Backup Now" button
  - Dropdown to select and restore from available versions
  - Shows version details (date, time, number of links and sources)

**Version Restoration:**
- Before restoring, automatically creates a backup of the current state
- Completely replaces current project data with selected version
- Refreshes all UI components after restoration
- Confirmation dialog with clear warnings

**Storage Requirements:**
- Requires a **private** Supabase Storage bucket named `project-versions`
- Needs RLS (Row Level Security) policies to control access to version data
- The system automatically checks for bucket existence on startup
- Provides console warnings if bucket is not found

**Recommended Storage Setup:**
1. Create a **private** bucket named `project-versions` in Supabase Storage
2. Enable RLS on the bucket
3. Add RLS policies to allow authenticated users to:
   - Insert: `user_id = auth.uid()` (users can create their own versions)
   - Select: `user_id = auth.uid()` (users can read their own versions)
   - Delete: `user_id = auth.uid()` (users can delete their own versions)

**Technical Implementation:**
- `VersionManager` class handles all versioning logic
- Change tracking via event listeners (`linksUpdated`, `sourcesUpdated`, `projectDataUpdated`)
- Automatic timer-based backups with intelligent change detection
- Complete project state restoration with UI refresh

**Operations that trigger version backups (via event emission):**

*Sources:*
- Source metadata edits (title, filename)
- Source custom column updates
- Document uploads (PDF, DOCX, DOC, RTF, TXT)
- XLSX bulk source updates
- Bulk source deletion

*Links:*
- Link creation (manual coding, AI processing)
- Link updates and edits
- Link deletion
- Factor renames
- Factor deletion (single and bulk)
- CM3 project import

*Project:*
- Project metadata updates (description, tags, codebook)

--->
