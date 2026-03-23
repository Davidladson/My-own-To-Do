# Malveon Tasks PWA — V3 Implementation Plan

**Project:** Malveon Tasks PWA — V3 Feature Upgrade
**IDE:** Antigravity Agentic IDE
**Dev:** Kavin
**Date:** March 23, 2026
**Base files:**
- `app/app.js` — main app (6200+ lines, Vanilla JS)
- `app/index.html` — 574 lines, all modals defined here
- `app/style.css` — 2367 lines
- `app/sw.js` — Service Worker
- `app/supabase-setup.sql` — Supabase schema
- `TASKS.md` — task data source (parsed by app on sync)

---

## Current State

The app is a fully working Vanilla JS PWA with Supabase backend. V2 is deployed and live.

**What V3 adds:** 23 identified gaps across task management, analytics, CRM automation, and operational reliability.
**What stays unchanged:** Auth flow, syncFromSupabase(), pushTaskToSupabase(), offline queue, day reset, streak tracking, TASKS.md/daily-log.md File System Access API export, Claude sync, Service Worker, Supabase config.

**Tech stack:** Vanilla JS (no framework), Supabase (PostgreSQL + Auth + Realtime), Chart.js CDN, localStorage, IndexedDB, File System Access API, Service Worker, Browser Push API.

---

## Supabase Config (do not change)

```
URL: https://yoxudugiigxwwkiublyt.supabase.co
User ID: eecbfb6c-51b0-48d7-927f-420ff91c15d6
Tables (existing): tasks, daily_logs, resources, prospects, pilots, insights, decisions, delegations, recurring_tasks
```

---

## Phase 0 — Database & Schema Foundation

> Zero UI dependencies. Must be completed before all other phases.
> All SQL runs in Supabase SQL Editor. Update `app/supabase-setup.sql` to match.

---

### 0.1 — Add `domain` column to tasks table

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS domain TEXT DEFAULT 'General';
```

Valid values: `'Legal'`, `'Finance'`, `'Banking'`, `'Sales'`, `'Product'`, `'Operations'`, `'Marketing'`, `'HR'`, `'Fundraising'`, `'Gov Schemes'`, `'International'`, `'Customer Success'`, `'General'`

**app.js changes:**
- Add `domain: 'General'` to task object schema in `createTask()` and `defaultTasks` entries
- Add `domain` to Supabase upsert payload in `pushTaskToSupabase()`
- Add `domain` to task object when reading from Supabase in `syncFromSupabase()`

---

### 0.2 — Add `due_date` column to tasks table

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date TEXT DEFAULT NULL;
```

Format: `'YYYY-MM-DD'` or `null`. Do not use timestamp — date string only.

**app.js changes:**
- Add `due_date: null` to task schema
- Add to Supabase upsert payload
- Add to sync read

---

### 0.3 — Add `status` column to tasks table

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'not-started';
```

Valid values: `'not-started'`, `'in-progress'`, `'blocked'`, `'done'`

Note: `done` here mirrors the existing `done: true` boolean. Keep both fields — `done` (bool) is used for task completion tracking, `status` is used for in-progress/blocked visibility. When `done: true`, always set `status: 'done'` simultaneously.

**app.js changes:**
- Add `status: 'not-started'` to task schema
- Add to Supabase upsert payload
- Add to sync read
- In `completeTask()`: also set `status = 'done'`
- In `uncompleteTask()`: also set `status = 'not-started'`

---

### 0.4 — Add `phase` column to tasks table

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT NULL;
```

Valid values: `'Y1'`, `'Y2'`, `'Y3'`, `'Y4'`, `'Y5'`, `null`
Only relevant for `cat = 'someday'` tasks.

**app.js changes:** Add `phase: null` to task schema, upsert, and sync read.

---

### 0.5 — Add `owner` column to tasks table

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT 'Ladson';
```

Valid values: `'Ladson'`, `'Kavin'`, `'Both'`, `'CA'`

**app.js changes:** Add `owner: 'Ladson'` to task schema, upsert, and sync read.

---

### 0.6 — Add `dependencies` column to tasks table

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]'::jsonb;
```

Format: array of task UUIDs — `["uuid-1", "uuid-2"]`

**app.js changes:** Add `dependencies: []` to task schema, upsert, and sync read.

---

### 0.7 — Add `okr_id` column to tasks table

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS okr_id TEXT DEFAULT NULL;
```

References OKR identifier from the OKR tracker (localStorage). Text key, not a foreign key.

**app.js changes:** Add `okr_id: null` to task schema, upsert, and sync read.

---

### 0.8 — Create `outreach_logs` table

```sql
CREATE TABLE IF NOT EXISTS outreach_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  prospects_found INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  calls_booked INTEGER DEFAULT 0,
  linkedin_comments INTEGER DEFAULT 0,
  x_replies INTEGER DEFAULT 0,
  reddit_comments INTEGER DEFAULT 0,
  warm_leads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE outreach_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own outreach logs" ON outreach_logs
  FOR ALL USING (auth.uid() = user_id);
```

**app.js changes:**
- Add `outreach_logs` array variable (like `tasks`, `prospects`)
- Add `syncOutreachLogs()` — reads from Supabase, sorted by date desc
- Add `saveOutreachLog(dateStr, data)` — upsert by date
- Add `getOutreachLog(dateStr)` — returns log for a specific date or null

---

### 0.9 — Create `expenses` table

```sql
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  amount_inr DECIMAL(12,2) DEFAULT 0,
  amount_usd DECIMAL(12,2) DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own expenses" ON expenses
  FOR ALL USING (auth.uid() = user_id);
```

Valid categories: `'Legal'`, `'Finance'`, `'Infrastructure'`, `'Tools'`, `'Marketing'`, `'Operations'`, `'Personal'`, `'General'`

**app.js changes:**
- Add `expenses` array variable
- Add `syncExpenses()`, `saveExpense(data)`, `deleteExpense(id)`

---

### 0.10 — Create `milestones` table

```sql
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_date TEXT,
  achieved_date TEXT DEFAULT NULL,
  target_value DECIMAL(12,2) DEFAULT 0,
  current_value DECIMAL(12,2) DEFAULT 0,
  unit TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own milestones" ON milestones
  FOR ALL USING (auth.uid() = user_id);
```

**app.js changes:**
- Add `milestones` array variable
- Add `syncMilestones()`, `saveMilestone(data)`, `updateMilestoneProgress(id, currentValue)`, `seedDefaultMilestones()`
- Default milestones to seed on first login:
  ```
  1. First paying pilot customer — target: $99 MRR — target date: 2026-07-31
  2. $1,000 MRR — target: 1000 — target date: 2026-09-30
  3. $4,000 MRR — target: 4000 — target date: 2026-12-31
  4. 10 paying customers — target: 10 — target date: 2026-12-31
  5. Pvt Ltd incorporated — target: 1 — target date: 2026-04-30
  6. YC W2027 application submitted — target: 1 — target date: 2026-10-31
  ```

---

### 0.11 — Update `supabase-setup.sql`

Add all new SQL from 0.1–0.10 to `app/supabase-setup.sql`. Keep existing tables intact at the top. Add new tables and ALTER statements in a clearly marked `-- V3 additions` section at the bottom.

---

### 0.12 — Update task schema in app.js

Find the `createTask()` function and the task object structure. Add all new fields with defaults:

```js
// New fields to add to every task object
domain: 'General',
due_date: null,
status: 'not-started',
phase: null,
owner: 'Ladson',
dependencies: [],
okr_id: null,
```

Also update `defaultTasks` entries to include these fields (use defaults for all existing entries).

---

## Phase 1 — Core Task Enhancements

> Depends on Phase 0. Each item in this phase is independent of the others within the phase.

---

### 1.1 — Quick Capture / Inbox

**What it does:** 1-tap task creation without needing category or priority. Drops task into an "Inbox" bucket for triage later.

**Files:** `app/index.html`, `app/app.js`, `app/style.css`

**index.html changes:**
- Add floating quick-add button (fixed position, bottom-right, above bottom nav):
  ```html
  <button id="quickAddBtn" class="quick-add-fab" onclick="openQuickCapture()">+</button>
  ```
- Add quick capture modal (minimal — just text + save):
  ```html
  <div id="quickCaptureModal" class="modal-overlay" onclick="if(event.target===this)closeQuickCapture()">
    <div class="modal-card quick-capture-card">
      <input id="quickCaptureInput" type="text" placeholder="Capture a task..." />
      <button onclick="saveQuickCapture()">Save to Inbox</button>
      <button onclick="closeQuickCapture()">Cancel</button>
    </div>
  </div>
  ```
- Add "Inbox" tab to Tasks section top nav

**app.js changes:**
- Add `'inbox'` to `catLabels`: `'inbox': 'Inbox'`
- Add `'inbox'` to `SECTIONS.tasks` array (after 'today', before 'daily-habits')
- `openQuickCapture()`: shows modal, focuses input, sets up Enter key listener
- `closeQuickCapture()`: hides modal, clears input
- `saveQuickCapture()`: creates task with `{ text: input.value, cat: 'inbox', priority: 'medium', status: 'not-started', done: false }`, saves to Supabase, closes modal, shows toast "Saved to Inbox"
- `renderInbox()`: renders inbox tasks with "Move to..." action button on each card
- `moveFromInbox(taskId, targetCat)`: updates task cat, re-renders

**style.css changes:**
- `.quick-add-fab`: fixed, bottom-right, circular, z-index above nav, brand color background
- `.quick-capture-card`: smaller modal, centered, minimal padding

**Escape key handler:** Add `'quickCaptureModal'` to the existing Escape key modalMap array in app.js

---

### 1.2 — Search Functionality

**What it does:** Keyword search across all tasks — text and notes fields.

**Files:** `app/index.html`, `app/app.js`, `app/style.css`

**index.html changes:**
- Add search bar to Tasks section header (between section title and tab bar):
  ```html
  <div class="search-bar-wrap">
    <input id="taskSearchInput" type="search" placeholder="Search tasks..." oninput="filterTasksBySearch()" />
  </div>
  ```

**app.js changes:**
- `let taskSearchQuery = ''`
- `filterTasksBySearch()`: reads `taskSearchInput.value.toLowerCase()`, sets `taskSearchQuery`, calls `renderCurrentTab()`
- In all render functions (`renderToday()`, `renderSomeday()`, `renderBeforePilot()`, etc.): if `taskSearchQuery` is non-empty, filter the task array before rendering:
  ```js
  if (taskSearchQuery) {
    tasksToRender = tasksToRender.filter(t =>
      t.text.toLowerCase().includes(taskSearchQuery) ||
      (t.notes || '').toLowerCase().includes(taskSearchQuery)
    );
  }
  ```
- Show result count: "X tasks found" when search is active
- Clear button inside input: `onclick="clearSearch()"`

**style.css changes:**
- `.search-bar-wrap`: full width, padding, subtle background
- Highlight matching text in results (optional, use `<mark>` tag wrapper)

---

### 1.3 — Bulk Task Actions

**What it does:** Select multiple tasks and apply an action to all of them.

**Files:** `app/index.html`, `app/app.js`, `app/style.css`

**app.js changes:**
- `let bulkSelectMode = false`
- `let selectedTaskIds = new Set()`
- `toggleBulkMode()`: toggles `bulkSelectMode`, re-renders current tab, shows/hides bulk action bar
- `toggleTaskSelect(taskId)`: adds/removes from `selectedTaskIds`, updates checkbox UI
- In task card render: when `bulkSelectMode`, show checkbox on left of card
- Bulk action bar (fixed bottom, above nav, replaces normal view controls when active):
  - "Move to [category dropdown]" — calls `bulkMoveTasks(cat)`
  - "Mark Done" — calls `bulkMarkDone()`
  - "Delete" — calls `bulkDelete()` with confirmation
  - "Cancel" — exits bulk mode, clears selection
- `bulkMoveTasks(cat)`: loops `selectedTaskIds`, updates `cat` for each, pushes to Supabase, re-renders
- `bulkMarkDone()`: loops, sets `done: true` and `status: 'done'` for each, pushes to Supabase
- `bulkDelete()`: confirmation dialog, then deletes from array and Supabase
- Add "Select" button to task list header to enter bulk mode

**index.html changes:**
- Add bulk action bar div (hidden by default):
  ```html
  <div id="bulkActionBar" class="bulk-action-bar" style="display:none">
    <span id="bulkCount">0 selected</span>
    <select id="bulkMoveTarget">...</select>
    <button onclick="bulkMoveTasks(document.getElementById('bulkMoveTarget').value)">Move</button>
    <button onclick="bulkMarkDone()">Done</button>
    <button onclick="bulkDelete()">Delete</button>
    <button onclick="toggleBulkMode()">Cancel</button>
  </div>
  ```

---

### 1.4 — Domain Tagging UI

> Depends on 0.1

**What it does:** Add domain label to tasks. Filter tasks by domain in before-pilot and someday views.

**Files:** `app/index.html`, `app/app.js`, `app/style.css`

**app.js changes:**
- Add domain colors map:
  ```js
  const domainColors = {
    'Legal': '#7c3aed', 'Finance': '#059669', 'Banking': '#0284c7',
    'Sales': '#d97706', 'Product': '#2563eb', 'Operations': '#64748b',
    'Marketing': '#db2777', 'HR': '#0891b2', 'Fundraising': '#7c2d12',
    'Gov Schemes': '#15803d', 'International': '#1d4ed8',
    'Customer Success': '#0d9488', 'General': '#6b7280'
  };
  ```
- In task card HTML: add domain badge `<span class="domain-badge" style="background:${domainColors[t.domain]}">${t.domain}</span>`
- In task create/edit modal: add domain dropdown (13 options)
- Add domain filter chips bar above task list in before-pilot, someday, inbox tabs:
  ```js
  function renderDomainFilters(activeDomain) {
    // renders clickable chips for each domain present in current tab's tasks
  }
  ```
- `let activeDomainFilter = null`
- `setDomainFilter(domain)`: sets `activeDomainFilter`, re-renders
- In render functions: filter by `activeDomainFilter` if set

**style.css changes:**
- `.domain-badge`: small pill, white text, 11px font, inline-block, border-radius 4px

---

### 1.5 — Target Date UI

> Depends on 0.2

**What it does:** Add due date to tasks. Visual indicators for overdue/upcoming tasks.

**Files:** `app/index.html`, `app/app.js`, `app/style.css`

**app.js changes:**
- In task create/edit modal: add date input `<input type="date" id="taskDueDateInput" />`
- In task card render: if `due_date` exists:
  - Show date label below task text
  - Calculate days diff: `Math.ceil((new Date(due_date) - new Date(todayStr())) / 86400000)`
  - If diff < 0: red "Overdue" label
  - If diff === 0: orange "Today" label
  - If diff <= 7: yellow "In X days" label
  - Else: grey date label
- Add sort option to task list header: "Sort by due date"
- `sortTasksByDueDate(tasks)`: sorts null due_dates to bottom, then ascending by date

**style.css changes:**
- `.due-label-overdue`: red text, small font
- `.due-label-today`: orange text
- `.due-label-soon`: yellow/amber text
- `.due-label-normal`: grey text

---

### 1.6 — Task Status UI

> Depends on 0.3

**What it does:** Show and set task status (Not Started / In Progress / Blocked / Done).

**Files:** `app/index.html`, `app/app.js`, `app/style.css`

**app.js changes:**
- Status color/icon map:
  ```js
  const statusConfig = {
    'not-started': { color: '#9ca3af', icon: '○', label: 'Not Started' },
    'in-progress': { color: '#3b82f6', icon: '◑', label: 'In Progress' },
    'blocked':     { color: '#ef4444', icon: '⊗', label: 'Blocked' },
    'done':        { color: '#10b981', icon: '✓', label: 'Done' }
  };
  ```
- In task card: add status dot before task text using `statusConfig[t.status].icon`
- In task create/edit modal: add status dropdown
- Add "Blocked reason" text field that appears when status = 'blocked'
- Status filter dropdown in task list header: "All / In Progress / Blocked"
- `filterTasksByStatus(status)`: filters visible tasks
- In `completeTask()`: set `status = 'done'` alongside `done = true`

**style.css changes:**
- `.status-dot`: 10px circle, inline, margin-right 6px

---

### 1.7 — Year / Phase Labels on Someday

> Depends on 0.4

**What it does:** Group Someday tasks by year/phase (Y1 through Y5).

**Files:** `app/app.js`, `app/style.css`

**app.js changes:**
- In task create/edit modal when `cat === 'someday'`: show phase selector dropdown (Y1/Y2/Y3/Y4/Y5/null)
- In `renderSomeday()`: group tasks by phase, render with phase section headers:
  ```
  Y1 (2026) — 42 tasks
  Y2 (2027) — 15 tasks
  ...
  No Phase — X tasks
  ```
- Each phase group is collapsible (toggle open/closed)
- Phase label badge on task card in someday view

**style.css changes:**
- `.phase-group-header`: styled section divider with phase label + count
- `.phase-badge`: small pill badge on task card

---

### 1.8 — Owner Field on Tasks

> Depends on 0.5

**What it does:** Tag tasks by owner (Ladson/Kavin/Both/CA). Filter by owner.

**Files:** `app/app.js`, `app/index.html`

**app.js changes:**
- In task create/edit modal: add owner dropdown (Ladson / Kavin / Both / CA), default Ladson
- In task card: show owner initial badge if not 'Ladson' (i.e., show 'K', 'B', 'CA' badges as a signal)
- Owner filter in task list header: "All / Mine / Kavin's / CA"
- `filterTasksByOwner(owner)`: filters current view

---

### 1.9 — P0 / P1 / P2 Priority Display

> No schema dependency (reuses existing `priority` field)

**What it does:** Remap high/medium/low display to P0/P1/P2 in task cards and modals.

**app.js changes:**
- Add display mapping:
  ```js
  const priorityDisplay = { 'high': 'P0', 'medium': 'P1', 'low': 'P2' };
  const priorityColors  = { 'high': '#ef4444', 'medium': '#f59e0b', 'low': '#6b7280' };
  ```
- Update task card HTML to show priority badge as "P0"/"P1"/"P2" instead of "High"/"Medium"/"Low"
- Task create/edit modal: change priority labels to "P0 Critical / P1 Important / P2 Standard"
- No data change — values remain 'high'/'medium'/'low' in DB

---

## Phase 2 — Views & Navigation

> Depends on Phase 1 data model changes. Items within this phase are independent of each other.

---

### 2.1 — Domain View

> Depends on 1.4 (domain tagging)

**What it does:** 12-domain task browser. Shows task counts per domain. Tap to filter.

**Files:** `app/app.js`, `app/index.html`, `app/style.css`

**app.js changes:**
- Add `'domains'` to `SECTIONS.tasks` array (new tab)
- `renderDomainView()`: renders 12 domain cards in a 2-column grid
- Each card shows:
  - Domain name + icon
  - Total tasks count
  - Breakdown: Not Started / In Progress / Blocked
  - Color strip from `domainColors`
- Tapping a domain card: sets `activeDomainFilter = domain` and switches to before-pilot or all-tasks view with filter applied
- Summary bar at top: total tasks across all domains, overall completion %

**index.html changes:**
- Add `Domains` tab button to Tasks section top nav

---

### 2.2 — Kavin View

> Depends on 1.8 (owner field)

**What it does:** Filter all tasks by owner = Kavin. Dedicated "Kavin's Tasks" view.

**app.js changes:**
- Add `'kavin'` tab to Tasks section or as a filter toggle (not a full new section)
- `renderKavinView()`: renders all tasks where `owner === 'Kavin'` or `owner === 'Both'`, grouped by category
- Shows total Kavin task count in tab badge
- Tap task to edit/update status from Kavin's view

---

### 2.3 — Calendar View

> Depends on 1.5 (target dates)

**What it does:** Monthly grid of tasks plotted by due date.

**Files:** `app/app.js`, `app/index.html`, `app/style.css`

**app.js changes:**
- Add `'calendar'` to `SECTIONS.tasks` tabs
- `renderCalendarView()`:
  - Renders current month grid (7 columns, rows of weeks)
  - Each day cell shows dot indicators for tasks due that day (color = domain color or priority color)
  - Month navigation: prev/next month chevrons
  - Today highlighted
- `openDayTasks(dateStr)`: shows modal or side panel with all tasks due on that date
- Tasks with no due_date shown in "No date" section below calendar

**style.css changes:**
- `.calendar-grid`: 7-column CSS grid
- `.calendar-day`: min-height 60px, border, overflow hidden
- `.calendar-dot`: 6px circle, inline-block
- `.calendar-day-today`: highlighted border/background

---

### 2.4 — Task Dependency View

> Depends on 0.6 (dependencies column)

**What it does:** Mark tasks as dependent on other tasks. Blocked indicator when dependencies are incomplete.

**app.js changes:**
- In task detail modal: add "Depends on" section
  - Lists current dependencies (by task text)
  - "+ Add dependency" opens task search to select a task
  - Each dependency shows: task text, status dot, remove button
- In task card: if task has incomplete dependencies → show "⊗ Blocked by X tasks" indicator
- `checkDependencyStatus(task)`: returns true if all dependency tasks are done
- Auto-set status to 'blocked' if dependency tasks are not done (show warning, don't force)
- `removeDependency(taskId, depId)`: updates dependencies array, saves to Supabase

---

### 2.5 — OKR–Task Linkage

> Depends on 0.7 (okr_id column) and existing OKR tracker

**What it does:** Link tasks to OKRs. Show progress per OKR based on linked task completion.

**app.js changes:**
- In task create/edit modal: add "Links to OKR" dropdown (populated from current OKRs in localStorage)
- In OKR tracker render (`renderOkrV2()`):
  - For each OKR: count linked tasks + count completed linked tasks
  - Show progress bar: `completed / total` linked tasks
  - Show task list inline (collapsed by default, expandable)
- `getLinkedTasks(okrId)`: returns all tasks where `okr_id === okrId`
- `getOkrProgress(okrId)`: returns `{ total, completed, percentage }`

---

### 2.6 — Custom Compliance Items

> No Phase 1 dependency

**What it does:** Add custom deadlines to the Compliance Calendar (e.g. advance tax, DPIIT renewal).

**Files:** `app/app.js`, `app/index.html`, `app/style.css`

**app.js changes:**
- Store custom compliance items in localStorage key `malveon_custom_compliance` (array)
- Schema: `{ id, title, freq ('monthly'/'quarterly'/'annual'/'one-time'), day, month, date ('YYYY-MM-DD' for one-time), desc, penalty, lastDoneDate }`
- In `renderCompliance()`: merge `COMPLIANCE_METADATA` with custom items, sort by due date
- Add "+ Add Custom" button to compliance view header
- `openCustomComplianceModal()`: form with fields for all schema properties
- `saveCustomCompliance(data)`: add to localStorage array, re-render
- `deleteCustomCompliance(id)`: remove from array, re-render
- Custom items show differently styled (e.g. outline instead of filled card) so they're distinguishable from built-in items

---

## Phase 3 — Analytics & Intelligence

> Depends on Phase 0 new tables and Phase 1 data model. Items within this phase are independent.

---

### 3.1 — Outreach Analytics Dashboard

> Depends on 0.8 (outreach_logs table) and evening scheduled task writing to it

**What it does:** Dedicated analytics view for outreach activity — messages sent, reply rate, pipeline funnel.

**Files:** `app/app.js`, `app/style.css`

**app.js changes:**
- Add `'outreach'` tab to Analytics section
- `renderOutreachAnalytics()`:

  **Summary row (4 cards):**
  - Today's messages sent (from today's outreach_log)
  - 7-day reply rate: `(sum replies / sum messages_sent) * 100`
  - Calls booked this week
  - Active warm leads count (from prospects table where status = 'warm')

  **Outreach activity chart (Chart.js bar chart, last 30 days):**
  - X axis: dates
  - Bar 1: messages sent (blue)
  - Bar 2: replies received (green)
  - Data from `outreach_logs` table sorted by date

  **Pipeline funnel:**
  - Prospects (total) → Warm (replied) → Calls booked → Pilots
  - Horizontal bar/funnel visual showing conversion at each stage
  - Data from `prospects` table counts by status

  **Today's log card:**
  - Shows today's outreach_log entry (or "No data yet — evening task will update this")

- `syncOutreachLogs()`: fetches last 30 days from Supabase outreach_logs table

**style.css changes:**
- `.outreach-summary-grid`: 2x2 grid of metric cards
- `.funnel-bar`: horizontal bar, percentage-based width

---

### 3.2 — Milestone Tracker

> Depends on 0.10 (milestones table)

**What it does:** Track progress toward key Malveon milestones (first pilot, $1K MRR, YC application, etc.).

**app.js changes:**
- Add `'milestones'` tab to Ops section
- `renderMilestones()`:
  - Header: next upcoming milestone (nearest target_date not yet achieved)
  - List of all milestones sorted by target_date
  - Each milestone card:
    - Title + category badge
    - Progress bar: `current_value / target_value * 100` percent
    - Target date + days remaining (or "Achieved [date]" if done)
    - Quick-update button: opens inline input to update current_value
  - Achieved milestones shown in a separate collapsed "Achieved" section with green checkmarks
- `updateMilestoneProgress(id, value)`: saves current_value to Supabase, re-renders
- `achieveMilestone(id)`: sets achieved_date to today, saves to Supabase
- `seedDefaultMilestones()`: runs on first login if milestones table is empty (seeds 6 default milestones from 0.10)

---

### 3.3 — Expense / Runway Tracker

> Depends on 0.9 (expenses table)

**What it does:** Log all company expenses. Auto-calculate monthly burn rate and runway.

**app.js changes:**
- Add `'finances'` tab to Ops section
- `renderFinances()`:

  **Runway calculator (top card):**
  - "Cash on hand (₹)" — editable input stored in localStorage
  - "Monthly burn" — auto-calculated from expenses (avg of last 3 months)
  - "Runway" = cash / monthly burn = "X months"
  - MRR input (manual for now) stored in localStorage

  **Expense log table:**
  - Columns: Date | Description | Category | Amount (INR) | Amount (USD)
  - Sorted by date desc, paginated (20 per page)
  - Category filter chips above table

  **Monthly summary:**
  - Bar chart (Chart.js) — monthly spend by category (last 6 months)

- `openAddExpenseModal()`: form with date, description, category, INR amount, USD amount, notes
- `saveExpense(data)`: generates UUID, saves to Supabase, re-renders
- `deleteExpense(id)`: removes from Supabase, re-renders
- `calculateMonthlyBurn()`: groups expenses by month, returns average of last 3 months (INR)
- `calculateRunway(cash, burn)`: returns months as float, display as "X months Y weeks"

**index.html changes:**
- Add expense modal with form fields

---

### 3.4 — Weekly Review Auto-Pull

> Depends on Phase 1 task status + 0.8 (outreach_logs)

**What it does:** Pre-fill the 6-step Weekly Review with real data instead of blanks.

**app.js changes in `openWeeklyReviewModal()`:**

- Step 1 (Wins): auto-populate textarea with this week's completed tasks:
  ```js
  const thisWeekDone = tasks.filter(t => t.done && t.updatedAt >= mondayStr);
  step1DefaultText = thisWeekDone.map(t => `- ${t.text}`).join('\n');
  ```

- Step 3 (Outreach Numbers): auto-populate from this week's `outreach_logs`:
  ```js
  const weekLogs = outreach_logs.filter(l => l.date >= mondayStr);
  const totals = weekLogs.reduce((acc, l) => { /* sum each field */ }, {});
  step3DefaultText = `Sent: ${totals.messages_sent}\nReplies: ${totals.replies_received}\nCalls: ${totals.calls_booked}`;
  ```

- Step 5 (Next Week OKRs): pre-fill with current week's OKRs as a starting point

- Show "Auto-filled from your data" label when pre-filled. User can edit freely before saving.

---

### 3.5 — OKR Progress Visualization

> Depends on 2.5 (OKR–task linkage)

**What it does:** Show completion percentage per OKR based on linked tasks.

**app.js changes in `renderOkrV2()`:**
- For each OKR: call `getOkrProgress(okrId)` and render progress bar
- Color coding: green ≥70%, yellow 30-69%, red <30%
- Show "X/Y tasks done" label next to progress bar
- Collapsed task list per OKR (expandable chevron)

---

## Phase 4 — Sync & Automation

> Depends on Phase 3 completion. Heavier engineering tasks.

---

### 4.1 — TASKS.md Two-Way Auto-Sync

**What it does:** When TASKS.md is modified (by Claude/scheduled tasks), app detects the change and re-parses automatically.

**app.js changes:**
- In `initFileSystemAccess()`: after getting the file handle, start a polling watcher:
  ```js
  async function watchTasksFile(fileHandle) {
    let lastModified = 0;
    setInterval(async () => {
      const file = await fileHandle.getFile();
      if (file.lastModified > lastModified) {
        lastModified = file.lastModified;
        await importFromTasksMd(); // existing function
        showToast('TASKS.md updated — synced', 'success');
      }
    }, 30000); // poll every 30 seconds
  }
  ```
- Note: File System Access API does not support native file watching. Use polling with 30-second interval.
- Only polls when app is in foreground (use `document.visibilityState === 'visible'` check)
- Show sync indicator in Sync tab: "Last auto-sync: X min ago"

---

### 4.2 — CRM Auto-Populate from daily-staging.md

> Depends on 4.1 (File System Access API pattern)

**What it does:** Morning scheduled task writes new prospects to daily-staging.md. App reads and imports them to CRM Pipeline.

**app.js changes:**
- `importProspectsFromStagingFile()`:
  - Reads `outreach/trackers/daily-staging.md` via File System Access API (request handle separately from TASKS.md handle)
  - Parses the `## 5 New ICP Prospects` section (Markdown table)
  - For each prospect: check if already in `prospects` array (by name+company match)
  - If new: add to prospects with status='Cold', source='morning-task', created_at=today
  - Push to Supabase
  - Show toast: "X new prospects imported from morning prep"
- Add "Import from morning prep" button in CRM Pipeline header (manual trigger)
- Auto-trigger after `watchTasksFile` detects daily-staging.md change (if handle acquired)

---

### 4.3 — daily-staging.md Archival

> No app changes needed. Update scheduled tasks only.

**Evening scheduled task change:**
- Before writing today's content to daily-staging.md, move entries older than 7 days to `outreach/trackers/archive/daily-staging-[YYYY-MM].md`
- Keep current daily-staging.md to only current day + tomorrow queue

---

### 4.4 — Session Handoff Structure

**What it does:** Claude writes a structured session summary to TASKS.md at session end. Next session reads it.

**TASKS.md format change:**
- Add `## Session Notes` section (below `## Messages to Claude`)
- Format:
  ```
  ## Session Notes
  > [YYYY-MM-DD] Decisions made: X. Tasks added: X. Key context: [1 sentence].
  ```
- Claude writes here at end of sessions involving task/data changes
- Morning scheduled task reads `## Session Notes` and includes last 3 entries in daily briefing

---

## Phase 5 — Reliability & Notifications

> Mostly independent of Phases 3-4. Can be developed in parallel.

---

### 5.1 — Email Fallback for Critical Reminders

**What it does:** When a reminder fires and the app is not in focus, send an email fallback.

**Implementation:**
- Create Supabase Edge Function: `send-reminder-email`
  - Input: `{ task_text, reminder_time, user_email }`
  - Uses Resend API (resend.com — free tier: 3,000 emails/month)
  - Plain text email: "Reminder: [task_text] — scheduled for [reminder_time]"
- In `reminderChecker()` (existing function in app.js):
  - When reminder fires: check `document.visibilityState`
  - If not visible (app in background): call Supabase Edge Function to send email
  - If visible: show in-app notification as before
- Only applies to tasks with `priority === 'high'` (P0) to avoid email noise
- User setting in Sync tab: "Email fallback for P0 reminders" (toggle, stores email in localStorage)

---

### 5.2 — Session Token Auto-Refresh

**What it does:** Auto-refresh Supabase session token. Eliminate manual copy step for Claude writes.

**app.js changes in `renderSync()`:**
- Add "Auto-refresh" status indicator: shows token age (e.g. "Token: 45 min ago — valid")
- Add `refreshAndCopyToken()` function:
  ```js
  async function refreshAndCopyToken() {
    const { data } = await sb.auth.refreshSession();
    if (data?.session) {
      // auto-copy fresh session token to clipboard
      navigator.clipboard.writeText(data.session.access_token);
      showSyncStatus('tokenRefreshStatus');
    }
  }
  ```
- Replace current "Copy Full API Commands" button with "Copy Fresh Token" that calls `refreshAndCopyToken()`
- Show "Token expires in: Xh Xm" countdown in Sync tab
- Auto-refresh token in background every 50 minutes (Supabase tokens expire at 60 min by default):
  ```js
  setInterval(async () => {
    if (sb) await sb.auth.refreshSession();
  }, 50 * 60 * 1000);
  ```

---

### 5.3 — Scheduled Task Failure Alerts

**What it does:** Detect when a scheduled task hasn't run and notify Ladson.

**Implementation:**
- Morning and evening tasks write a heartbeat entry to `outreach/trackers/task-heartbeat.json`:
  ```json
  {
    "morning": { "lastRun": "2026-03-23T07:03:00", "status": "success" },
    "evening": { "lastRun": "2026-03-22T19:07:00", "status": "success" }
  }
  ```
- In app.js `startApp()`: on app load, read heartbeat file (if File System Access API available)
  - If `morning.lastRun` is yesterday or older: show warning banner "Morning task hasn't run today"
  - If `evening.lastRun` is yesterday or older: show warning banner "Evening task hasn't run since [date]"
- Warning banner: yellow, dismissible, links to scheduled tasks view

---

## Todo List by Phase

### Phase 0 — Database & Schema Foundation
- [ ] 0.1 Add `domain` column to tasks table + update app.js schema
- [ ] 0.2 Add `due_date` column to tasks table + update app.js schema
- [ ] 0.3 Add `status` column to tasks table + update app.js schema + wire to completeTask()
- [ ] 0.4 Add `phase` column to tasks table + update app.js schema
- [ ] 0.5 Add `owner` column to tasks table + update app.js schema
- [ ] 0.6 Add `dependencies` column to tasks table + update app.js schema
- [ ] 0.7 Add `okr_id` column to tasks table + update app.js schema
- [ ] 0.8 Create `outreach_logs` table with RLS + add sync/save functions to app.js
- [ ] 0.9 Create `expenses` table with RLS + add sync/save/delete functions to app.js
- [ ] 0.10 Create `milestones` table with RLS + add sync/save/seed functions to app.js
- [ ] 0.11 Update `supabase-setup.sql` with all V3 additions
- [ ] 0.12 Update all app.js task schema references (createTask, defaultTasks, upsert, sync)

### Phase 1 — Core Task Enhancements
- [ ] 1.1 Quick Capture / Inbox — FAB button + minimal modal + inbox tab + move-to action
- [ ] 1.2 Search — search bar + keyword filter across all task render functions
- [ ] 1.3 Bulk Actions — select mode + checkboxes + bulk action bar (move/done/delete)
- [ ] 1.4 Domain Tagging — dropdown in modal + badge on card + filter chips (requires 0.1)
- [ ] 1.5 Target Date — date picker in modal + overdue/upcoming indicators on card (requires 0.2)
- [ ] 1.6 Task Status — status dropdown in modal + status dot on card + filter (requires 0.3)
- [ ] 1.7 Phase Labels — phase selector for someday + grouped render by Y1/Y2... (requires 0.4)
- [ ] 1.8 Owner Field — owner dropdown in modal + owner badge + owner filter (requires 0.5)
- [ ] 1.9 P0/P1/P2 Priority Display — remap high/medium/low display labels and colors

### Phase 2 — Views & Navigation
- [ ] 2.1 Domain View — 12-domain card grid tab in Tasks section (requires 1.4)
- [ ] 2.2 Kavin View — owner filter tab showing Kavin + Both tasks (requires 1.8)
- [ ] 2.3 Calendar View — monthly grid with due-date task dots (requires 1.5)
- [ ] 2.4 Task Dependency View — "Depends on" section in task detail modal (requires 0.6)
- [ ] 2.5 OKR–Task Linkage — okr_id dropdown in modal + progress in OKR tracker (requires 0.7)
- [ ] 2.6 Custom Compliance Items — add/edit/delete custom deadline items (requires nothing in Phase 1)

### Phase 3 — Analytics & Intelligence
- [ ] 3.1 Outreach Analytics — new Analytics tab with charts, funnel, daily log (requires 0.8)
- [ ] 3.2 Milestone Tracker — new Ops tab with progress bars + seed default milestones (requires 0.10)
- [ ] 3.3 Expense / Runway Tracker — new Ops tab with expense log + runway calc (requires 0.9)
- [ ] 3.4 Weekly Review Auto-Pull — pre-fill review steps from completed tasks + outreach_logs (requires 1.6 + 0.8)
- [ ] 3.5 OKR Progress Visualization — progress bars in OKR tracker from linked tasks (requires 2.5)

### Phase 4 — Sync & Automation
- [ ] 4.1 TASKS.md Auto-Sync Watcher — 30s polling via File System Access API + toast notification
- [ ] 4.2 CRM Auto-Populate — parse daily-staging.md + import new prospects to Pipeline (requires 4.1)
- [ ] 4.3 daily-staging.md Archival — update evening scheduled task (no app changes)
- [ ] 4.4 Session Handoff Structure — add `## Session Notes` section to TASKS.md format

### Phase 5 — Reliability & Notifications
- [ ] 5.1 Email Fallback for Reminders — Supabase Edge Function + Resend API + background detection
- [ ] 5.2 Session Token Auto-Refresh — background refresh every 50 min + "Copy Fresh Token" button
- [ ] 5.3 Scheduled Task Failure Alerts — heartbeat file + warning banner on app load

---

## File Change Summary

| File | Phases touching it |
|------|--------------------|
| `app/supabase-setup.sql` | 0.1–0.11 |
| `app/app.js` | 0.1–0.12, 1.1–1.9, 2.1–2.6, 3.1–3.5, 4.1–4.2, 5.2–5.3 |
| `app/index.html` | 1.1, 1.3, 1.5, 1.6, 2.3, 3.3 |
| `app/style.css` | 1.1–1.7, 2.3, 3.1 |
| `app/sw.js` | 5.1 (push notification handling) |
| `TASKS.md` (format) | 4.4 |
| Scheduled tasks (external) | 4.3, 5.3 |

---

