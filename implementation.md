# Malveon Tasks App — Implementation Plan V2

**Project:** Malveon Tasks PWA — full rebuild based on wireframe V2
**IDE:** Antigravity Agentic IDE
**Dev:** Kavin
**Date:** March 22, 2026
**Reference files(C:\Users\Snoba\OneDrive\Ladson with Malveon\app\reference):**
- `malveon-tasks-app-spec.md` — technical architecture + feature spec
- `malveon_tasks_full_wireframe_v2.html` — UI wireframe (all screens)
- `malveon-style.css` — design system / CSS tokens
- `app/github-pages-deploy/app.js` — current app (1900 lines, preserve all Supabase logic)

---

## Project Context

The current app is a working Vanilla JS PWA with Supabase backend. This rebuild keeps the entire data layer and sync architecture intact but redesigns the UI and adds 9 new features. Do not rewrite the Supabase sync logic, offline queue, day reset, or streak tracking — these work correctly.

**What changes:** UI shell, navigation, visual design, new tabs, new Supabase tables.
**What stays:** Auth, syncFromSupabase(), pushTaskToSupabase(), offline queue, reminder checker, TASKS.md/daily-log.md export, Claude sync.

---

## Critical Pre-Build Fix: CSS Variable Conflict

The wireframe HTML uses `var(--color-background-primary)`, `var(--color-text-secondary)`, `var(--color-border-tertiary)` etc.
The stylesheet `malveon-style.css` defines them as `--bg-primary`, `--text-secondary`, `--border-tertiary` etc.

**Resolution — use the stylesheet naming convention. Update ALL wireframe inline styles to match:**

| Wireframe variable | Correct variable (from stylesheet) |
|---|---|
| `--color-background-primary` | `--bg-primary` |
| `--color-background-secondary` | `--bg-secondary` |
| `--color-background-warning` | `--bg-warning` |
| `--color-background-danger` | `--bg-danger` |
| `--color-background-success` | `--bg-success` |
| `--color-background-info` | `--bg-info` |
| `--color-text-primary` | `--text-primary` |
| `--color-text-secondary` | `--text-secondary` |
| `--color-text-warning` | `--text-warning` |
| `--color-text-danger` | `--text-danger` |
| `--color-text-success` | `--text-success` |
| `--color-text-info` | `--text-info` |
| `--color-border-tertiary` | `--border-tertiary` |
| `--color-border-secondary` | `--border-secondary` |
| `--border-radius-md` | `--radius-md` |
| `--border-radius-lg` | `--radius-lg` |
| `--font-sans` | `--font-sans` ✓ same |

Brand color throughout: `#534AB7` (malveon-purple-600). Replace all current `#4f8cff` (old blue) references.

---

## New Supabase Tables (run before any UI work)

```sql
-- Table: prospects (Pipeline / CRM)
create table prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  company text not null,
  title text,
  linkedin_url text,
  email text,
  status text default 'new',
  -- values: new | contacted | replied | discovery | demo | pilot | won | lost
  last_contact_date date,
  next_followup_date date,
  source text default 'linkedin',
  -- values: linkedin | x | warm-intro | other
  notes text,
  updated_at timestamptz default now()
);
alter table prospects enable row level security;
create policy "user_prospects" on prospects for all using (auth.uid() = user_id);

-- Table: pilots (Pilot Customer Tracker)
create table pilots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  company text not null,
  contact_name text not null,
  contact_email text,
  start_date date,
  success_metric text,
  health text default 'green',
  -- values: green | yellow | red
  onboarding_status text default 'not-started',
  -- values: not-started | payment-received | kickoff-done | integrations-live | active
  last_checkin_date date,
  next_checkin_date date,
  mrr_usd int default 99,
  notes text,
  updated_at timestamptz default now()
);
alter table pilots enable row level security;
create policy "user_pilots" on pilots for all using (auth.uid() = user_id);

-- Table: insights (Customer Quotes / Discovery call log)
create table insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null default current_date,
  contact_name text,
  company text,
  quote text not null,
  theme text default 'other',
  -- values: incident-triage | context-loss | jira-gap | hiring | onboarding | other
  source text default 'discovery-call',
  -- values: discovery-call | dm-reply | x-post | linkedin-comment | email | other
  updated_at timestamptz default now()
);
alter table insights enable row level security;
create policy "user_insights" on insights for all using (auth.uid() = user_id);

-- Table: decisions (Decision Log)
create table decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null default current_date,
  decision text not null,
  reason text,
  decided_by text default 'Ladson',
  -- values: Ladson | Ladson + Kavin | Kavin
  domain text default 'ops',
  -- values: legal | finance | product | sales | ops | hr | fundraising
  updated_at timestamptz default now()
);
alter table decisions enable row level security;
create policy "user_decisions" on decisions for all using (auth.uid() = user_id);

-- Table: delegations (Delegation Tracker)
create table delegations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  task text not null,
  assigned_to text not null,
  -- e.g. "Kavin", "Riya (CA)", "Contractor"
  assigned_date date not null default current_date,
  due_date date,
  status text default 'not-started',
  -- values: not-started | in-progress | done | cancelled
  notes text,
  updated_at timestamptz default now()
);
alter table delegations enable row level security;
create policy "user_delegations" on delegations for all using (auth.uid() = user_id);

-- Table: recurring_tasks (Recurring / auto-generated tasks)
create table recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  frequency text not null,
  -- values: daily | weekly | biweekly | monthly | quarterly | annual | event-based
  days_of_week text[],
  -- for weekly: ['Mon','Wed'], for daily: null
  day_of_month int,
  -- for monthly: 1, 15, etc.
  month_of_year int,
  -- for annual: 0=Jan...11=Dec
  event_trigger text,
  -- for event-based: e.g. "30d after AGM"
  target_cat text default 'today',
  -- which task category to auto-generate into
  priority text default 'medium',
  active boolean default true,
  last_generated_date date,
  next_run_date date,
  updated_at timestamptz default now()
);
alter table recurring_tasks enable row level security;
create policy "user_recurring" on recurring_tasks for all using (auth.uid() = user_id);
```

---

## LocalStorage Keys — New Additions

| Key | What it stores |
|---|---|
| `malveon_compliance` | Array of compliance item states (lastDoneDate, notes) |
| `malveon_weekly_okr` | Current week OKR {weekStart, one, bonus1, bonus2, oneDone, bonus1Done, bonus2Done} |
| `malveon_focus_sessions` | Array of {taskId, date, minutes} for focus time accumulation |
| `malveon_nav_section` | Last active bottom nav section (tasks/ops/crm/analytics) |

---

## Architecture Decisions

- **Single app.js** — keep all logic in one file. No build system. File will grow to ~3500 lines — that is acceptable.
- **No framework** — vanilla JS only. No React, Vue, or Svelte.
- **CSS file** — all styles in the new `malveon-style.css`. Remove all inline styles from HTML except wireframe-specific layout.
- **Chart.js** for analytics: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>` added to index.html.
- **Supabase** remains unchanged. New tables follow same RLS pattern.
- **Mobile first** — max-width 480px, designed for 375px. Desktop gets same layout centered.

---

---

# TODO LIST — Phased Implementation

> Tasks are ordered 0-dependency first within each phase.
> Each phase depends on all previous phases unless noted.
> Items marked `[DB]` require Supabase. Items marked `[LS]` use localStorage only.

---

## Phase 0: Environment & Schema Setup
*No dependencies. Do this before touching any UI.*

- [ ] Run all 6 new `CREATE TABLE` SQL statements in Supabase dashboard
- [ ] Verify RLS policies are active on all 6 new tables (test with anon key — should return empty, not error)
- [ ] Update `supabase-setup.sql` file with all new table definitions
- [ ] Replace all `#4f8cff` (old blue) references in `style.css` with `#534AB7` (malveon-purple-600)
- [ ] Resolve CSS variable naming conflict — update wireframe variable names to match `malveon-style.css` conventions (full mapping in Critical Pre-Build Fix section above)
- [ ] Add Chart.js CDN script tag to `index.html` above closing `</head>`
- [ ] Add 5 new localStorage keys as constants at top of `app.js` (COMPLIANCE_KEY, OKR_KEY, FOCUS_KEY, NAV_KEY, DELEGATIONS_KEY)
- [ ] Declare 5 new in-memory state variables: `prospects = []`, `pilots = []`, `insights = []`, `decisions = []`, `delegations = []`

---

## Phase 1: Design System
*Depends on: Phase 0*

- [ ] Import `malveon-style.css` as the primary stylesheet in `index.html` (replace existing `style.css` link or merge)
- [ ] Verify all CSS tokens render correctly in both light and dark mode — test in Chrome DevTools
- [ ] Define reusable CSS classes for: `.card` (replaces `.cd`), `.badge` (replaces `.tb`), `.section-label` (replaces `.sl`), `.task-row` (replaces `.tr`), `.task-check` (replaces `.tc`), `.metric-card` (replaces `.mc`)
- [ ] Define status dot classes: `.dot-green`, `.dot-yellow`, `.dot-red` (replace `.sg`, `.sy`, `.sr`)
- [ ] Define chip/filter classes: `.chip`, `.chip.active` (replace `.ch`, `.ch.a`)
- [ ] Define FAB button class: `.fab` — positioned absolute, 42px, purple-600 background
- [ ] Verify font rendering: `--font-sans` applied to body, correct size scale (9px min / 15px max)

---

## Phase 2: App Shell & Bottom Navigation
*Depends on: Phase 1*

- [ ] Redesign `index.html` — replace single `#tabs` bar with new 2-layer navigation: top tab bar (section-specific tabs) + bottom nav bar (4 sections)
- [ ] Build bottom nav HTML structure: 4 items — Tasks (☑), Ops (⚙), CRM (☆), Analytics (◈)
- [ ] Build bottom nav JS: `let activeSection = localStorage.getItem(NAV_KEY) || 'tasks'`
- [ ] Implement `switchSection(section)` — updates activeSection, persists to localStorage, updates bottom nav active state, updates top tab bar, renders first tab of new section
- [ ] Define tab arrays per section in `app.js`:
  ```js
  const SECTIONS = {
    tasks: ['Today','Habits','This Week','Recurring','Reminders','Done'],
    ops:   ['Compliance','OKR','Decisions','Delegation','Review','Playbook'],
    crm:   ['Pipeline','Pilots','Insights'],
    analytics: ['History','Velocity','Domains','Workload','Sync']
  }
  ```
- [ ] Implement `renderBottomNav()` — renders 4 nav items with icon + label, highlights active section, shows red dot on Ops if any compliance item is overdue
- [ ] Implement `renderTopTabs()` — renders section-specific tabs as horizontal scrollable row, highlights active tab
- [ ] Implement `switchTab(tabName)` — updates `activeTab`, calls `renderScreen()`
- [ ] Implement `renderScreen()` — dispatcher that calls the correct `render*()` function based on `activeSection + activeTab`
- [ ] Redesign header: left = Malveon "M" logo square (26px, purple-600) + page title text; right = notification bell (with red dot if count > 0) + user avatar circle (initials "L")
- [ ] Update `initApp()` to call `renderBottomNav()`, `renderTopTabs()`, `renderScreen()` in that order
- [ ] Preserve existing `updateProgress()`, `updateStreak()`, `checkReviewPrompt()` calls in `initApp()`

---

## Phase 3: Task Data Layer & Core Components
*Depends on: Phase 2*

- [ ] Build `taskRow(task)` component function — returns HTML string for a single task row: checkbox div + task text + optional "blocked" badge + optional dep label + priority badge
- [ ] Build `taskRowWithTimer(task)` component — same as taskRow but includes circular focus timer SVG (only shown when task is in progress)
- [ ] Build `metricCard(label, value, color)` component — returns `.metric-card` HTML
- [ ] Build `sectionLabel(text)` component — returns `.section-label` HTML
- [ ] Build `card(content, options)` component — returns `.card` HTML with optional left border accent color
- [ ] Build `priorityBadge(priority)` component — returns badge with correct color class (ph/pm/pl)
- [ ] Update `openAddModal()` — add new categories to `<select>`: recurring, compliance (read-only), pilot
- [ ] Update `toggleTask(id)` — preserve existing logic, add: if task has a running focus timer, stop timer and save session duration to `malveon_focus_sessions`
- [ ] Update `openTaskDetail(id)` — preserve existing logic, update visual to use new card/chip components
- [ ] Update `deleteTask(id)` — preserve existing Supabase delete + deletedTaskTexts logic unchanged
- [ ] Implement `rowToProspect(r)` and `prospectToRow(p)` mapping functions for Supabase sync
- [ ] Implement `rowToPilot(r)` and `pilotToRow(p)` mapping functions
- [ ] Implement `rowToInsight(r)` and `insightToRow(i)` mapping functions
- [ ] Implement `rowToDecision(r)` and `decisionToRow(d)` mapping functions
- [ ] Implement `rowToDelegation(r)` and `delegationToRow(d)` mapping functions
- [ ] Add new tables to `syncFromSupabase()` — after existing tasks/logs/resources sync, pull prospects, pilots, insights, decisions, delegations from Supabase and merge into in-memory arrays
- [ ] Add `pushProspectToSupabase(p)`, `pushPilotToSupabase(p)`, `pushInsightToSupabase(i)`, `pushDecisionToSupabase(d)`, `pushDelegationToSupabase(d)` functions — same pattern as `pushTaskToSupabase()`
- [ ] Add new tables to `setupRealtime()` — subscribe to changes on all 5 new tables

---

## Phase 4: Tasks — Today Screen
*Depends on: Phase 3*

- [ ] Implement `renderToday()` function — main screen renderer
- [ ] Build Smart Suggestions panel: calls `generateSuggestions()`, renders a purple-bordered card at top of screen if suggestions exist
- [ ] Implement `generateSuggestions()` — returns array of suggestion strings by checking: (1) any compliance item overdue or due within 3 days, (2) any prospect with next_followup_date <= today, (3) any task stuck in Today for 5+ days without being done — max 3 suggestions shown
- [ ] Build stats row: 3 metric cards — Done (X/Y), Streak (Nd green), Focus (0:00 with "tap task to start" label)
- [ ] Build priority-grouped task list: sections High / Medium / Low, each section only shown if tasks exist
- [ ] Implement `startFocusTimer(taskId)` — sets `activeFocusTaskId`, starts 1-second interval updating timer display, highlights active task row with secondary background
- [ ] Implement `stopFocusTimer()` — clears interval, saves elapsed minutes to `malveon_focus_sessions` localStorage array, clears `activeFocusTaskId`
- [ ] Build focus timer SVG ring component: 22px circle, purple stroke, `stroke-dashoffset` calculated from elapsed %, displays MM:SS in center text
- [ ] Update `updateProgress()` — update stat card "Done" count on every task toggle
- [ ] Implement workload warning card: if count of today's undone tasks > 7, show amber-bordered card: "X tasks today. Consider deferring some."
- [ ] `renderToday()` must preserve: day reset logic, daily habit separation, quick capture bar behavior

---

## Phase 5: Tasks — Habits Tab
*Depends on: Phase 3*

- [ ] Implement `renderHabits()` function
- [ ] Build stats row: 3 metric cards — Today (done/total), Best Streak, Avg/week (calculated from dailyLog)
- [ ] Build habit list: renders all tasks where `daily === true`, shows streak count (green if > 0, gray if 0), green checkbox when done
- [ ] Calculate `bestStreak` — iterate dailyLog, find max streak value across all habit tasks
- [ ] Calculate `avgPerWeek` — from dailyLog, count days where at least one daily was completed, divide by weeks elapsed
- [ ] Habit rows do NOT show priority badges — habits are order-only (morning sequence)
- [ ] Implement day reset for habits: habits where `cat === 'daily-habits'` reset `done = false` each morning (already exists in `checkDayReset()` — verify it covers `daily-habits` category)

---

## Phase 6: Tasks — This Week Tab + OKR Block
*Depends on: Phase 3*

- [ ] Implement `renderThisWeek()` function
- [ ] Load OKR from localStorage: `const okr = JSON.parse(localStorage.getItem(OKR_KEY) || 'null')`
- [ ] Build ONE THING card: purple left-border card showing ONE THING title, progress bar (% of linked tasks done), bonus goals with status
- [ ] Implement `calcOkrProgress()` — filters tasks where `cat === 'this-week'` and done === true, returns percentage
- [ ] Build workload warning card: if `this-week` tasks count > 8, show amber warning: "X tasks this week. Your average is N/week. Consider deferring."
- [ ] Implement `calculateWeeklyAverage()` — from dailyLog, compute average tasks completed per week over last 4 weeks
- [ ] Build linked tasks list: shows all `this-week` tasks grouped under ONE THING
- [ ] Implement `openOkrModal()` — modal with 3 inputs: ONE THING, Bonus 1, Bonus 2. Save button writes to `OKR_KEY` localStorage with `weekStart = getMondayOfCurrentWeek()`
- [ ] Add "Edit OKR" button to ONE THING card header
- [ ] Implement `getMondayOfCurrentWeek()` — returns YYYY-MM-DD string for most recent Monday
- [ ] On Sunday: if OKR not set for this week, show nudge banner: "Set your 3 OKRs for the week" with "Set now" button
- [ ] Auto-clear OKR on new week: in `checkDayReset()`, if today is Monday and `okr.weekStart !== getMondayOfCurrentWeek()`, archive old OKR to dailyLog entry and clear OKR_KEY

---

## Phase 7: Tasks — Recurring Tab
*Depends on: Phase 3*
*Note: No dependency on Phase 4, 5, or 6 — can be built in parallel.*

- [ ] Implement `renderRecurring()` function
- [ ] Build recurring task card: green/gray active dot + title + frequency badge (`.rec-tag` purple chip) + "Next: date" subtitle
- [ ] Load recurring tasks: from `recurring_tasks` Supabase table (in-memory array after sync)
- [ ] Group recurring list by frequency: Weekly / Monthly / Quarterly / Event-triggered
- [ ] Implement `openAddRecurringModal()` — FAB opens modal with fields: title, frequency (dropdown), days of week (multi-select for weekly), day of month (for monthly), priority, active toggle
- [ ] Implement `saveRecurringTask(data)` — saves to Supabase `recurring_tasks` table + in-memory array
- [ ] Implement `toggleRecurringActive(id)` — flips `active` boolean, pushes update to Supabase
- [ ] Implement `generateRecurringTasks()` — called in `checkDayReset()` daily: for each active recurring task where `next_run_date <= today`, create a new task in the correct category, update `last_generated_date` and `next_run_date`
- [ ] Implement `calcNextRunDate(recurringTask)` — returns next YYYY-MM-DD based on frequency type
- [ ] Event-triggered recurring tasks (AOC-4, MGT-7) — shown in Recurring tab but only generate when manually triggered via a "Set trigger date" button

---

## Phase 8: Tasks — Reminders + Done Tabs
*Depends on: Phase 3*
*Note: No dependency on Phases 4-7 — can be built in parallel.*

- [ ] Implement `renderReminders()` function — groups tasks with reminderTime into Today / Tomorrow / This Week sections based on time value
- [ ] Build reminder row: time label (left, fixed width 56px) + task text + priority badge
- [ ] Sort reminder rows chronologically within each section
- [ ] Implement `renderDone()` function
- [ ] Build done stats row: 3 metric cards — Today (count), This Week (count), Focus Time (accumulated from `malveon_focus_sessions` for today)
- [ ] Implement `getTodayFocusTime()` — reads `malveon_focus_sessions`, filters by today's date, sums minutes, returns "Xh Ym" format
- [ ] Build done task row: green checkbox (checked) + strikethrough text + optional note in italic gray + time-ago label (right)
- [ ] `renderDone()` shows `completedAt` formatted as "2h ago", "Yesterday", or date string

---

## Phase 9: Ops — Compliance Tab
*Depends on: Phase 2*
*Note: No dependency on Phases 3-8 — can be built independently.*

- [ ] Define hardcoded `COMPLIANCE_ITEMS` array in `app.js` — 12 items as specified in feature spec (gstr1, gstr3b, tds-payment, tds-return-q2/q3/q4/q1, agm, aoc4, mgt7, lut, dpiit)
- [ ] Implement `loadComplianceState()` — reads `malveon_compliance` localStorage, merges with hardcoded items (user's lastDoneDate and notes layered on top)
- [ ] Implement `saveComplianceState(items)` — writes only user-editable fields (lastDoneDate, notes) to localStorage
- [ ] Implement `calcComplianceDueDate(item)` — returns next due date as YYYY-MM-DD string based on frequency and current date
- [ ] Implement `calcComplianceStatus(item)` — returns 'red' (overdue or due today), 'yellow' (due within 6 days), 'green' (7+ days)
- [ ] Implement `renderCompliance()` function
- [ ] Build compliance stats row: 3 metric cards — Overdue (red), Due Soon (amber), Clear (green)
- [ ] Group compliance items by status: Overdue section / Due This Month section / Upcoming section / Annual section
- [ ] Build compliance card: status dot + label + due date string + days remaining / overdue label (colored) — tap to expand
- [ ] Expanded compliance card shows: description, penalty text, notes input field, "Mark Done" button
- [ ] Implement `markComplianceDone(id)` — sets `lastDoneDate = today`, recalculates `next_run_date`, saves state
- [ ] Implement `getComplianceOverdueCount()` — returns count of red items — used by `renderBottomNav()` for Ops badge

---

## Phase 10: Ops — OKR Tab
*Depends on: Phase 6 (OKR data) + Phase 2*

- [ ] Implement `renderOkrTab()` function — separate from the OKR block in This Week
- [ ] Build current week OKR card: same as Phase 6 ONE THING card, full width, with progress bar
- [ ] Build past weeks history list: reads archived OKRs from dailyLog entries, renders with fading opacity (most recent = 0.7, older = decreasing)
- [ ] Past week card shows: date range, ONE THING title, progress bar (completed %, color: green if 100%, amber if 50-99%, red if <50%)
- [ ] "Set OKR" button opens `openOkrModal()` (reuse from Phase 6)

---

## Phase 11: Ops — Decisions Tab
*Depends on: Phase 3 (Supabase data layer)*

- [ ] Implement `renderDecisions()` function
- [ ] Build search input at top of screen — filters `decisions[]` array in-memory on input event
- [ ] Build decision card: date (top left) + decided-by (top right) + decision text (bold) + reason text (gray)
- [ ] Domain badge on each card: colored chip matching domain (legal=blue, finance=amber, product=purple, sales=teal, ops=gray)
- [ ] Implement `openAddDecisionModal()` — FAB opens modal: decision text (input), reason (textarea), domain (select), decided by (select), date (date input, default today)
- [ ] Implement `saveDecision(data)` — adds to `decisions[]`, pushes to Supabase, re-renders
- [ ] Decisions sort newest first by default
- [ ] Implement `searchDecisions(query)` — filters by decision text + domain, case-insensitive

---

## Phase 12: Ops — Delegation Tab
*Depends on: Phase 3 (Supabase data layer)*
*Note: No dependency on Phase 11 — can be built in parallel.*

- [ ] Implement `renderDelegation()` function
- [ ] Build stats row: 2 metric cards — Active (count where status !== done/cancelled), Overdue (count where due_date < today and status !== done)
- [ ] Build delegation card: assignee avatar circle (initials from name, 28px) + task text + "Assigned to X" subtitle + assigned date + due date + status label (colored) + "overdue" red badge if applicable
- [ ] Group by status: Needs Attention (overdue in-progress) / In Progress / Completed
- [ ] Implement `openAddDelegationModal()` — modal: task text, assigned to (text input), assigned date (today), due date, status (dropdown)
- [ ] Implement `saveDelegation(data)` — adds to `delegations[]`, pushes to Supabase, re-renders
- [ ] Implement `updateDelegationStatus(id, status)` — tap status chip on card to cycle through: not-started → in-progress → done
- [ ] Implement `getDelegationOverdueCount()` — returns count of items where due_date < today and status not done — used for potential badge

---

## Phase 13: Ops — Weekly Review Tab
*Depends on: Phases 6 (OKR), 9 (Compliance), 12 (Delegation)*

- [ ] Implement `renderReview()` function
- [ ] Build intro text: "Sunday weekly review — walk through each step to close the week and plan the next one."
- [ ] Define `REVIEW_STEPS` array: 6 steps with title, description, estimated minutes
  ```js
  [
    { title: 'Archive completed OKRs', desc: 'Review this week\'s ONE THING and bonus goals. Mark final status and archive.', mins: 2 },
    { title: 'Set next week\'s ONE THING', desc: 'Apply the one thing test. Which single OKR moves Malveon most?', mins: 3 },
    { title: 'Review pipeline health', desc: 'Check warm leads, overdue follow-ups, and next actions.', mins: 2 },
    { title: 'Scan compliance calendar', desc: 'Check for anything due in the next 14 days.', mins: 1 },
    { title: 'Clear stale tasks', desc: 'Remove or defer tasks stuck for 7+ days.', mins: 2 },
    { title: 'Delegation check-in', desc: 'Review all active delegations. Any overdue?', mins: 2 }
  ]
  ```
- [ ] Track `reviewCurrentStep` in localStorage (`malveon_review_step`)
- [ ] Build step cards with progressive opacity: current step full opacity + green left border, future steps fading (0.6, 0.5, 0.4, 0.35, 0.3)
- [ ] "Start Review" button on current step → increments step, opens relevant tab for that step (e.g. step 2 opens OKR modal, step 3 opens Pipeline)
- [ ] Total time estimate footer: sum of all step minutes
- [ ] Reset `reviewCurrentStep` to 0 every Monday morning in `checkDayReset()`

---

## Phase 14: Ops — Playbook Tab
*Depends on: Phase 3 (resources data layer — already exists)*
*Note: This is a visual redesign of the existing Playbook tab. Logic is mostly preserved.*

- [ ] Implement `renderPlaybook()` function — visual redesign using new card/chip components
- [ ] Build filter chips: All / Links / Templates / Checklists / Notes
- [ ] Build resource card: type badge (colored by type) + title + "pinned" label if pinned
- [ ] Type badge colors: link=blue, template=purple, checklist=teal, note=amber
- [ ] Preserve existing `openResourceModal()`, `saveResource()`, `deleteResource()` logic
- [ ] Pin/unpin tap on "pinned" label — toggle `pinned` boolean, re-sort (pinned first)

---

## Phase 15: CRM — Pipeline Tab
*Depends on: Phase 3 (prospects data layer)*

- [ ] Implement `renderPipeline()` function
- [ ] Build status filter chips: All / New / Contacted / Discovery / Pilot / Won — filters `prospects[]` in-memory
- [ ] Implement `getProspectsNeedingFollowup()` — returns prospects where `next_followup_date <= today` and status not won/lost
- [ ] If follow-up needed: show "Needs Follow-up (N)" section at top before status filter chips
- [ ] Build prospect card: avatar circle (initials, 28px) + name + title · company subtitle + status badge + last contact date + next follow-up date + health dot
- [ ] Status badge colors: New=purple, Contacted=blue, Replied=amber, Discovery=teal, Pilot=purple, Won=teal, Lost=gray
- [ ] Health dot: green if next_followup_date >= today+4, yellow if 1-3 days, red if overdue
- [ ] Tap prospect card → opens prospect detail sheet with all fields + notes + LinkedIn URL button + edit button + "Change status" dropdown
- [ ] Implement `openAddProspectModal()` — FAB opens modal: name, company, title, LinkedIn URL, email, source (dropdown), notes
- [ ] Implement `saveProspect(data)` — adds to `prospects[]`, pushes to Supabase, re-renders
- [ ] Implement `updateProspectStatus(id, status)` — updates status + auto-calculates next_followup_date based on cadence:
  - contacted: next_followup = last_contact + 4 days
  - follow-up 1 sent: next_followup = last_contact + 5 days
  - follow-up 2 sent: next_followup = last_contact + 5 days

---

## Phase 16: CRM — Pilots Tab
*Depends on: Phase 15 (CRM section established)*

- [ ] Implement `renderPilots()` function
- [ ] Empty state: if `pilots.length === 0`, show "No pilots yet. Close your first deal to start tracking." with a "Add pilot" button
- [ ] Build pilot card: company name (bold) + contact name + health dot (green/yellow/red) + onboarding status badge + "Last check-in: X days ago" + red alert if health === red OR last_checkin > 14 days ago
- [ ] Build onboarding checklist inside each expanded pilot card: 7 items (payment received, welcome email, kickoff call, Slack integration, Jira integration, GitHub integration, Day 7 check-in, Day 14 check-in, Day 30 review)
- [ ] Checklist item tap → updates `onboarding_status` field in Supabase
- [ ] Health dot tap → cycles green → yellow → red → green, saves to Supabase
- [ ] Implement `openAddPilotModal()` — FAB opens modal: company, contact name, contact email, start date, success metric (what they agreed to achieve), MRR (default 99)
- [ ] Implement `savePilot(data)` — adds to `pilots[]`, pushes to Supabase, re-renders
- [ ] Implement `getDayssinceCheckin(pilot)` — returns number of days since last_checkin_date

---

## Phase 17: CRM — Insights Tab
*Depends on: Phase 3 (insights data layer)*
*Note: No dependency on Phases 15-16 — can be built in parallel.*

- [ ] Implement `renderInsights()` function
- [ ] Build theme filter chips: All / Incident Triage / Context Loss / Jira Gap / Other
- [ ] Build insight card: quote text in quotes (italic) + contact + company subtitle + theme badge + date + source label
- [ ] Theme badge colors: incident-triage=red, context-loss=amber, jira-gap=yellow, hiring=blue, other=gray
- [ ] Sort: newest first
- [ ] Tap to expand: shows full quote without truncation
- [ ] Implement `openAddInsightModal()` — modal: quote (textarea, required), contact name, company, theme (dropdown), source (dropdown), date (default today)
- [ ] Implement `saveInsight(data)` — adds to `insights[]`, pushes to Supabase, re-renders

---

## Phase 18: Analytics — History Tab + Charts
*Depends on: Phase 3 (dailyLog data), Phase 1 (Chart.js loaded)*

- [ ] Implement `renderHistory()` function — full redesign of existing history view
- [ ] Build 3 charts at top of screen (Chart.js, max height 180px each):
  - Line chart: daily score /10, last 14 days, blue (#534AB7) line
  - Line chart: energy (red) / focus (blue) / execution (green), last 14 days, scale 0-5
  - Bar chart: task completion % (done/total * 100), last 14 days, purple bars
- [ ] Guard: if `dailyLog.length < 3`, show "Not enough data yet. Keep logging your nights." instead of charts
- [ ] Below charts: existing history card list (preserve current card rendering logic)
- [ ] History card redesign: date header + score stat + tasks stat + energy/focus/exec row + progress bar + review text (well/blocked/tomorrow)
- [ ] Add "This Week" summary stats block above card list: avg score, reviews written, avg energy/focus/exec

---

## Phase 19: Analytics — Velocity, Domains, Workload, Sync Tabs
*Depends on: Phase 18*

- [ ] Implement `renderVelocity()` function
  - Weekly task completion trend: bar chart, last 8 weeks
  - Average daily score trend: line chart, last 30 days
  - Streak calendar: 30-day grid, green = any tasks done, gray = no tasks
- [ ] Implement `renderDomains()` function
  - Domain-grouped view of ALL active tasks across ALL categories
  - Keyword matcher (from spec) assigns each task to one of 12 CEO domains
  - Each domain is a collapsible section with task count badge
  - Unmatched tasks go to "General"
- [ ] Implement `renderWorkload()` function
  - Tasks by category: bar chart showing count per category
  - Tasks added vs completed this week: 2-bar comparison chart
  - Overdue items summary (tasks stuck for 7+ days)
- [ ] Redesign `renderSync()` function (existing functionality, new visual)
  - Section: Claude API — "Copy Session Token Commands" button (existing `copyClaudeApiUrl()`)
  - Section: Files — "Download TASKS.md", "Download daily-log.md", "Download Both" buttons
  - Add new button: "Copy Evening Check-in API" — copies pre-filled curl for writing daily log entry
  - Section: Status — last synced timestamp, online/offline indicator, queue length
  - Section: Messages to Claude — existing claude notes input (preserve `submitClaudeNote()`)
  - Section: Workspace folder — existing File System Access API folder picker (preserve `initWorkspaceSync()`)

---

## Phase 20: Smart Suggestions Engine
*Depends on: Phases 4 (Today screen), 9 (Compliance), 15 (Pipeline)*

- [ ] Implement `generateSuggestions()` fully:
  - Check `COMPLIANCE_ITEMS` for status === 'red' → suggestion: "X is overdue — add to today?"
  - Check `prospects` for `next_followup_date <= today` → suggestion: "Follow up with NAME — last contact N days ago"
  - Check `tasks` for items in `cat === 'today'` created 5+ days ago and not done → suggestion: "TASK stuck N days — move to someday or drop?"
  - Max 3 suggestions. Priority: compliance > pipeline > stale tasks
- [ ] Each suggestion has a "+" button → tapping it executes the suggested action (add compliance task to today / open prospect / delete or move stale task)
- [ ] Suggestions only show if there are 1+ items — hide the panel if empty
- [ ] Re-compute suggestions on: `syncFromSupabase()` complete, task toggle, compliance mark done

---

## Phase 21: Focus Timer Full Implementation
*Depends on: Phase 4 (Today screen with timer placeholder)*

- [ ] Implement `startFocusTimer(taskId)` with full state:
  ```js
  let focusTimer = { taskId: null, startTime: null, intervalId: null, elapsed: 0 }
  ```
- [ ] Timer survives tab switches within same section (state in memory, not DOM)
- [ ] Timer does NOT survive app reload (that is acceptable)
- [ ] On `stopFocusTimer()`: append `{taskId, date: todayStr(), minutes: Math.round(elapsed/60)}` to `malveon_focus_sessions` localStorage array
- [ ] Active timer: highlight task row with `--bg-secondary` background, show elapsed time in circular SVG
- [ ] Only one timer can run at a time — starting a new timer stops the current one
- [ ] Tapping the circular timer SVG stops the timer
- [ ] Focus time accumulates in Done tab stats and metric card on Today screen

---

## Phase 22: Notifications & Service Worker
*Depends on: Phases 8 (Reminders), 9 (Compliance)*

- [ ] Update `sw.js` — add background sync support for offline queue flush
- [ ] Update `startReminderChecker()` — preserve existing per-minute check, add compliance deadline check: 7 days before due date, fire notification: "GSTR-1 due in 7 days (Apr 11)"
- [ ] Add compliance notification IDs to avoid duplicate firing — use localStorage key `malveon_compliance_notified` as Set of "item_id_date" strings
- [ ] Preserve existing `showNotification()`, `incrementNotifCount()`, `updateAppBadge()` logic
- [ ] Update notification click handler: route to correct tab based on notification type (compliance → Ops/Compliance, reminder → Tasks/Reminders)
- [ ] Test: permission request flow on first install, notification firing, badge count, sound settings

---

## Phase 23: TASKS.md & Daily Log Sync (Claude Integration)
*Depends on: Phase 19 (Sync tab)*

- [ ] Update `generateTasksMd()` — preserve existing format exactly (app parser in TASKS.md depends on this format)
- [ ] Update `generateDailyLogMd()` — preserve existing format
- [ ] Add "Copy Evening Check-in API" button to Sync tab:
  - Generates a pre-filled `curl -X POST` command targeting `daily_logs` table
  - Pre-fills: user_id, date (today), empty score/went_well/blocked/different fields for Claude to fill in
  - Copy to clipboard on tap
- [ ] Implement "Auto-write to workspace" flow — if workspace folder is connected (File System Access API), after completing night review in app, auto-write daily-log.md without requiring manual "Download Both" tap
- [ ] Update `initWorkspaceSync()` — on folder connect, also write TASKS.md once immediately (not just on import)

---

## Phase 24: Polish, Empty States & Edge Cases
*Depends on: All functional phases*

- [ ] Empty states for every new tab: Pipeline (no prospects yet), Pilots (no pilots), Insights (no quotes logged), Decisions (no decisions logged), Delegation (no delegations), Recurring (no recurring tasks)
- [ ] Error states: failed Supabase push → show non-blocking toast "Saved offline, will sync when connected"
- [ ] Offline indicator: persistent banner at top when `navigator.onLine === false`
- [ ] Loading state: skeleton loader for tabs that require Supabase data before rendering
- [ ] Light/dark mode: verify all new screens in both modes using `prefers-color-scheme`
- [ ] Mobile scroll: ensure all tab screens scroll correctly, FAB doesn't overlap last item (add `height: 56px` spacer before FAB)
- [ ] Keyboard: close all modals on Escape key
- [ ] Tap outside modal overlay to close — add `overlay.addEventListener('click', e => { if (e.target === overlay) closeModal() })`
- [ ] Long text truncation: task text > 2 lines shows ellipsis in list, full text in detail view
- [ ] Performance: `renderScreen()` only calls the active tab renderer — no unnecessary DOM updates for hidden tabs

---

## Phase 25: QA & Deploy
*Depends on: All phases*

- [ ] Test full sync cycle: create task on mobile → appears on desktop, mark done on desktop → reflects on mobile
- [ ] Test offline: disable network, add task, re-enable network → verify sync queue flushes
- [ ] Test day reset: manually set `lastReset` to yesterday in localStorage → verify daily tasks reset, streaks update
- [ ] Test compliance: manually set a compliance item's `lastDoneDate` to 40 days ago → verify it shows as overdue
- [ ] Test Pipeline follow-up cadence: set a prospect's `next_followup_date` to yesterday → verify it surfaces in Needs Follow-up
- [ ] Test OKR weekly reset: manually set `weekStart` to last Monday → verify it resets on simulated day change
- [ ] Test recurring task generation: set a recurring task's `next_run_date` to yesterday → verify it creates a new task on app open
- [ ] Test Focus Timer: start timer, switch tab, return → timer still running
- [ ] Test notifications: trigger a reminder, compliance alert, verify notification fires and routes correctly
- [ ] Lighthouse PWA audit: score 90+ on Performance, Accessibility, Best Practices, PWA
- [ ] GitHub Pages deploy: push to `main` branch of `Davidladson/My-own-To-Do`, verify live URL works
- [ ] Test install flow: install PWA on Android Chrome, verify icon, splash, standalone mode

---

## Summary: Build Order for Antigravity IDE

```
Phase 0  →  Phase 1  →  Phase 2  →  Phase 3
                                       |
          ┌────────────────────────────┤
          ↓                            ↓
     [Tasks Section]            [Independent]
     Phase 4 → Phase 5          Phase 9 (Compliance)
     Phase 6 → Phase 7          Phase 11 (Pipeline)
     Phase 8                    Phase 12 → Phase 16
                                Phase 13 (Insights)
                                Phase 17
          ↓
     Phase 10 (OKR Tab)    ←  Phase 6
     Phase 13 (Delegation) ←  Phase 3
     Phase 14 (Review)     ←  Phases 6, 9, 12
     Phase 15 (Pipeline)   ←  Phase 3
     Phase 18 (History)    ←  Phase 3
     Phase 19 (Velocity+)  ←  Phase 18
          ↓
     Phase 20 (Suggestions) ← Phases 4, 9, 15
     Phase 21 (Focus Timer) ← Phase 4
     Phase 22 (Notifs)      ← Phases 8, 9
     Phase 23 (Claude Sync) ← Phase 19
          ↓
     Phase 24 (Polish)
     Phase 25 (QA + Deploy)
```

**Total tasks across all phases: ~140 discrete tasks**
**Estimated phases that can be parallelized: Phase 9, 11, 13 can run alongside Phases 4-8**
