# Malveon Tasks App — Technical Architecture & Feature Spec V2

**Prepared for:** Dev
**Prepared by:** Ladson (CEO)
**Date:** March 22, 2026
**Status:** Ready for development

---

## 1. Current Technical Architecture

### 1.1 Stack Overview

| Layer | Technology |
|---|---|
| App type | Progressive Web App (PWA) — installable on mobile and desktop |
| Frontend | Vanilla HTML, CSS, JavaScript (single-file, no framework) |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime) |
| Offline storage | localStorage + IndexedDB |
| File sync | File System Access API (Chrome/Edge desktop only) |
| Push notifications | Browser Notification API + Service Worker |
| Hosting | GitHub Pages |

### 1.2 File Structure

```
app/github-pages-deploy/
├── index.html        — App shell, auth UI, modal markup
├── app.js            — All logic (~1900 lines, single file)
├── style.css         — All styles (~1100 lines)
├── sw.js             — Service worker (PWA + background notifications)
├── manifest.json     — PWA manifest (icons, display, theme)
├── malveon-icon-192.png
└── malveon-icon-512.png
```

### 1.3 Database Schema (Supabase / PostgreSQL)

**Table: tasks**

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| text | text | Task title |
| category | text | today / daily-habits / this-week / before-pilot / waiting / someday / reminders / done |
| priority | text | high / medium / low |
| done | boolean | Completion state |
| notes | text | Task notes / context |
| daily | boolean | Resets every morning if true |
| completed_at | timestamptz | When marked done |
| sort_order | int | Manual ordering |
| subtasks | jsonb | Array of {text, done} |
| streak | int | Days in a row completed |
| last_streak_date | date | Last day streak was maintained |
| reminder_time | text | HH:MM format |
| updated_at | timestamptz | Last modified |

**Table: daily_logs**

| Column | Type | Notes |
|---|---|---|
| id | text | Date string used as ID (YYYY-MM-DD) |
| user_id | uuid | FK to auth.users |
| date | date | Log date |
| score | int | 0-10 day score |
| done_count | int | Tasks completed |
| total_count | int | Total tasks that day |
| energy | int | 1-5 self-rated energy |
| focus | int | 1-5 self-rated focus |
| execution | int | 1-5 self-rated execution |
| went_well | text | Night review: what went well |
| blocked | text | Night review: what blocked |
| different | text | Night review: what to do differently |
| tasks_snapshot | jsonb | Array of {text, done} for that day |
| updated_at | timestamptz | Last modified |

**Table: resources**

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| title | text | Resource title |
| type | text | link / note / template / checklist |
| content | text | URL or body text |
| pinned | boolean | Pinned to top of Playbook tab |
| streak | int | Usage streak |
| last_streak_date | date | Last used date |
| updated_at | timestamptz | Last modified |

### 1.4 Local Storage Keys

| Key | What it stores |
|---|---|
| malveon_tasks_v4 | Full task array (JSON) |
| malveon_daily_log | Daily log entries array (JSON) |
| malveon_resources | Resources/playbook entries (JSON) |
| malveon_sync_queue | Offline queue for failed Supabase writes |
| malveon_streak | Global streak {count, lastDate} |
| malveon_reminders | Reminder config |
| malveon_claude_notes | Messages from user to Claude |
| malveon_sound_settings | Notification sound prefs |
| malveon_notif_count | Badge count for Sync tab |
| malveon_deleted_tasks | Set of deleted task texts (prevents TASKS.md re-import from resurrecting them) |

### 1.5 Sync Architecture (Current)

```
App (browser)
    |
    |-- localStorage (offline-first, always reads here first)
    |
    |-- Supabase Realtime (live sync across devices when online)
    |        |-- tasks table
    |        |-- daily_logs table
    |        |-- resources table
    |
    |-- File System Access API (desktop only)
             |-- reads TASKS.md every 5 min (auto-import new tasks)
             |-- writes TASKS.md + daily-log.md on "Download Both"
             |-- Claude reads/writes these files in Cowork
```

**Offline queue:** If Supabase write fails (offline), changes are queued in localStorage and flushed when back online via `window.addEventListener('online', ...)`.

**Conflict resolution:** Last-write-wins based on `updated_at` timestamp.

### 1.6 Current Tabs

| Tab | What it shows |
|---|---|
| Today | Today's active tasks. Daily tasks reset here every morning. |
| Daily Habits | Persistent daily habits (separate from Today for clarity). |
| This Week | Weekly tasks — don't reset daily. |
| Before Pilot | Pre-launch checklist. |
| Waiting | Items blocked on someone else. |
| Someday | Backlog / maybe. |
| Reminders | Tasks with a specific reminder time. Shown separately. |
| Playbook | Resources tab — links, templates, references (stored in `resources` table). |
| Done | Completed tasks. |
| History | Daily log entries with score, energy, focus, execution, review notes. |
| Sync | Claude integration — copy API commands, download TASKS.md + daily-log.md, messages to Claude. |

### 1.7 Key Functions Reference

| Function | What it does |
|---|---|
| `syncFromSupabase()` | Full pull from Supabase, merges with local, handles orphans |
| `pushTaskToSupabase(t)` | Upserts single task to Supabase or queues if offline |
| `checkDayReset()` | On app open, if date changed: saves yesterday's snapshot, updates streaks, resets daily tasks |
| `autoSaveSnapshot()` | Called on every task change — updates today's daily log entry |
| `generateTasksMd()` | Generates TASKS.md markdown string from current tasks |
| `generateDailyLogMd()` | Generates daily-log.md markdown string from log history |
| `initWorkspaceSync()` | Connects to File System Access API folder handle, polls TASKS.md every 5 min |
| `startReminderChecker()` | Polls every minute for tasks with reminderTime matching current time |
| `getTaskTips(t)` | Returns contextual tip text for task detail view based on task text keywords |
| `queueChange(table, action, data)` | Adds failed write to offline queue |
| `processQueue()` | Flushes offline queue to Supabase when back online |

### 1.8 PWA / Notification Flow

1. Service worker registered on app start (`sw.js`)
2. Notification permission requested on first open
3. `startReminderChecker()` runs every 60 seconds
4. When current time matches a task's `reminderTime`: fires `showNotification()` with task text
5. Clicking notification opens the app

---

