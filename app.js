// ===================== CONFIG =====================
const SUPABASE_URL = 'https://yoxudugiigxwwkiublyt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveHVkdWdpaWd4d3draXVibHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODYxMjksImV4cCI6MjA4ODM2MjEyOX0.ZCCOMcV7a_AwPtsBVzNZ_r4H2lj1qfjS_eyl0nYrdNs';

const STORAGE_KEY = 'malveon_tasks_v4';
const HISTORY_KEY = 'malveon_daily_log';
const STREAK_KEY = 'malveon_streak';
const QUEUE_KEY = 'malveon_sync_queue';
const RESOURCES_KEY = 'malveon_resources';
const REMINDERS_KEY = 'malveon_reminders';
const CLAUDE_NOTES_KEY = 'malveon_claude_notes';
const SOUND_SETTINGS_KEY = 'malveon_sound_settings';
const NOTIF_COUNT_KEY = 'malveon_notif_count';
const DELETED_TASKS_KEY = 'malveon_deleted_tasks';

// Supabase client
let sb = null;
let currentUser = null;
let realtimeChannel = null;
let isSyncing = false;
let deletedTaskTexts = new Set();

try {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.log('Supabase init failed, running offline:', e);
}

function uid() { return Math.random().toString(36).substr(2, 9); }

function uuidv4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const defaultTasks = [
  { id: uid(), text: "Morning deep work block (DW1) completed", cat: "today", priority: "high", done: false, notes: "", daily: true },
  { id: uid(), text: "5 new outreach messages sent", cat: "today", priority: "high", done: false, notes: "", daily: true },
  { id: uid(), text: "Follow up on all pending replies", cat: "today", priority: "high", done: false, notes: "", daily: true },
  { id: uid(), text: "Update Outreach Tracker with today's activity", cat: "today", priority: "medium", done: false, notes: "", daily: true },
  { id: uid(), text: "30 min physical exercise", cat: "today", priority: "medium", done: false, notes: "", daily: true },
  { id: uid(), text: "3L water intake", cat: "today", priority: "medium", done: false, notes: "", daily: true },
  { id: uid(), text: "Night review: 3 bullets + score /10", cat: "today", priority: "high", done: false, notes: "", daily: true },

  { id: uid(), text: "Set up Calendly with 3 available slots", cat: "this-week", priority: "high", done: false, notes: "" },
  { id: uid(), text: "Find 10 LinkedIn prospects matching ICP", cat: "this-week", priority: "high", done: false, notes: "" },
  { id: uid(), text: "Send first batch of personalized DMs", cat: "this-week", priority: "high", done: false, notes: "" },
  { id: uid(), text: "Draft Malveon one-liner and test with 3 people", cat: "this-week", priority: "medium", done: false, notes: "" },
  { id: uid(), text: "Practice mock discovery call with Kavin", cat: "this-week", priority: "medium", done: false, notes: "" },
  { id: uid(), text: "Read 2 competitor product pages and note features", cat: "this-week", priority: "low", done: false, notes: "" },
  { id: uid(), text: "Weekly review and self-feedback", cat: "this-week", priority: "high", done: false, notes: "1. Wins (what shipped)\n2. Failures (what missed, why)\n3. Outreach numbers\n4. Health check\n5. Top 3 next week\n6. Stop doing one thing\n7. Start doing one thing\n8. Rate week /10 + write 1 paragraph self-feedback" },
  { id: uid(), text: "Review outreach tracker and update pipeline", cat: "this-week", priority: "medium", done: false, notes: "" },

  { id: uid(), text: "Create Malveon demo walkthrough", cat: "before-pilot", priority: "high", done: false, notes: "" },
  { id: uid(), text: "Pilot agreement template", cat: "before-pilot", priority: "high", done: false, notes: "$99/mo, 30-day, cancellation terms (simple 1-page)" },
  { id: uid(), text: "Set up payment method (Stripe or Razorpay)", cat: "before-pilot", priority: "medium", done: false, notes: "" },
  { id: uid(), text: "Define pilot success metrics", cat: "before-pilot", priority: "medium", done: false, notes: "" },
  { id: uid(), text: "Founders Agreement with Kavin", cat: "before-pilot", priority: "high", done: false, notes: "" },
  { id: uid(), text: "Incorporate Malveon", cat: "before-pilot", priority: "high", done: false, notes: "Talk to a CA. Covers entity registration." },
  { id: uid(), text: "IP Assignment Agreement", cat: "before-pilot", priority: "medium", done: false, notes: "" },
  { id: uid(), text: "Basic Terms of Service", cat: "before-pilot", priority: "medium", done: false, notes: "" },
  { id: uid(), text: "Basic Privacy Policy", cat: "before-pilot", priority: "medium", done: false, notes: "" },

  { id: uid(), text: "Kavin: demo build timeline confirmation", cat: "waiting", priority: "high", done: false, notes: "" },

  { id: uid(), text: "Create NDA template for pilot customers", cat: "someday", priority: "low", done: false, notes: "" },
  { id: uid(), text: "Record a 2-min Malveon demo video", cat: "someday", priority: "low", done: false, notes: "" },
  { id: uid(), text: "Build warm intro list from existing network", cat: "someday", priority: "low", done: false, notes: "" },
];

const catLabels = {
  'today': 'Today', 'daily-habits': 'Daily Habits', 'this-week': 'This Week', 'before-pilot': 'Before Pilot',
  'waiting': 'Waiting', 'someday': 'Someday', 'playbook': 'Playbook',
  'done': 'Done', 'history': 'History', 'sync': 'Sync'
};

let tasks = [];
let activeTab = 'today';
let editingId = null;
let dailyLog = [];
let resources = [];
let editingResourceId = null;

// ===================== AUTH =====================
async function authAction(type) {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Please enter email and password.';
    errEl.style.display = 'block';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    errEl.style.display = 'block';
    return;
  }

  try {
    let result;
    if (type === 'signup') {
      result = await sb.auth.signUp({ email, password });
    } else {
      result = await sb.auth.signInWithPassword({ email, password });
    }

    if (result.error) {
      errEl.textContent = result.error.message;
      errEl.style.display = 'block';
      return;
    }

    currentUser = result.data.user;
    if (type === 'signup') {
      errEl.textContent = 'Account created! Check your email to confirm, then sign in.';
      errEl.style.display = 'block';
      errEl.style.background = 'rgba(52,211,153,0.1)';
      errEl.style.color = 'var(--green)';
      return;
    }

    showMainApp();
  } catch (e) {
    errEl.textContent = 'Connection error. Try again.';
    errEl.style.display = 'block';
  }
}

function skipAuth() {
  currentUser = null;
  showMainApp();
}

async function signOut() {
  if (sb) {
    await sb.auth.signOut();
    if (realtimeChannel) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }
  currentUser = null;
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
}

function showMainApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  initApp();
}

// ===================== OFFLINE QUEUE =====================
function queueChange(table, action, data) {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  // Deduplicate: remove older entry for same id + table
  const filtered = queue.filter(q => !(q.table === table && q.data && q.data.id === data.id));
  filtered.push({ table, action, data, timestamp: new Date().toISOString() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

async function processQueue() {
  if (!currentUser || !sb) return;
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (queue.length === 0) return;

  const remaining = [];
  for (const item of queue) {
    try {
      if (item.action === 'upsert') {
        const { error } = await sb.from(item.table).upsert(item.data, { onConflict: 'id' });
        if (error) { remaining.push(item); console.log('Queue upsert error:', error); }
      } else if (item.action === 'delete') {
        const { error } = await sb.from(item.table).delete().eq('id', item.data.id);
        if (error) { remaining.push(item); console.log('Queue delete error:', error); }
      }
    } catch (err) {
      remaining.push(item);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}

window.addEventListener('online', () => {
  processQueue();
  if (currentUser) syncFromSupabase();
});

// ===================== SUPABASE SYNC =====================
function taskToRow(t) {
  return {
    id: t.id,
    user_id: currentUser.id,
    text: t.text,
    category: t.cat,
    priority: t.priority,
    done: t.done,
    notes: t.notes || '',
    daily: t.daily || false,
    completed_at: t.completedAt || null,
    sort_order: t.sortOrder || 0,
    subtasks: t.subtasks || [],
    streak: t.streak || 0,
    last_streak_date: t.lastStreakDate || null,
    reminder_time: t.reminderTime || null,
    updated_at: t.updatedAt || new Date().toISOString()
  };
}

function rowToTask(r) {
  return {
    id: r.id,
    text: r.text,
    cat: r.category,
    priority: r.priority,
    done: r.done,
    notes: r.notes || '',
    daily: r.daily || false,
    completedAt: r.completed_at,
    sortOrder: r.sort_order || 0,
    subtasks: r.subtasks || [],
    streak: r.streak || 0,
    lastStreakDate: r.last_streak_date || null,
    reminderTime: r.reminder_time || null,
    updatedAt: r.updated_at
  };
}

function logToRow(entry) {
  return {
    id: entry.id || entry.date,
    user_id: currentUser.id,
    date: entry.date,
    score: entry.score || 0,
    done_count: entry.done || 0,
    total_count: entry.total || 0,
    energy: entry.review ? entry.review.energy : null,
    focus: entry.review ? entry.review.focus : null,
    execution: entry.review ? entry.review.exec : null,
    went_well: entry.review ? entry.review.well : null,
    blocked: entry.review ? entry.review.blocked : null,
    different: entry.review ? entry.review.different : null,
    tasks_snapshot: entry.tasks || [],
    updated_at: entry.lastUpdated || new Date().toISOString()
  };
}

function rowToLog(r) {
  const entry = {
    id: r.id,
    date: r.date,
    score: r.score || 0,
    done: r.done_count || 0,
    total: r.total_count || 0,
    tasks: r.tasks_snapshot || [],
    lastUpdated: r.updated_at,
    review: null
  };
  if (r.energy !== null || r.focus !== null || r.execution !== null) {
    entry.review = {
      energy: r.energy, focus: r.focus, exec: r.execution,
      well: r.went_well || '', blocked: r.blocked || '', different: r.different || ''
    };
  }
  return entry;
}

async function pushTaskToSupabase(t) {
  if (!currentUser || !sb) return;
  t.updatedAt = new Date().toISOString();
  const row = taskToRow(t);
  if (navigator.onLine) {
    const { error } = await sb.from('tasks').upsert(row, { onConflict: 'id' });
    if (error) { console.log('Push task error:', error); queueChange('tasks', 'upsert', row); }
  } else {
    queueChange('tasks', 'upsert', row);
  }
}

function sanitizeTaskText(text) {
  if (!text) return text;
  let clean = text;
  const prioMatch = clean.match(/\|\s*priority:\s*(low|medium|high)/i);
  if (prioMatch) clean = clean.replace(prioMatch[0], '').trim();
  const dailyMatch = clean.match(/\|\s*daily:\s*(true|false)/i);
  if (dailyMatch) clean = clean.replace(dailyMatch[0], '').trim();
  // Strip leftover | remind:HH:MM (value is extracted separately in the migration)
  const remindMatch = clean.match(/\|\s*remind:\s*\d{1,2}:\d{2}/i);
  if (remindMatch) clean = clean.replace(remindMatch[0], '').trim();
  clean = clean.replace(/\|\s*$/, '').trim();
  clean = clean.replace(/^\*{1,2}|\*{1,2}$/g, '').replace(/^~~|~~$/g, '').trim();
  return clean;
}

async function deleteTaskFromSupabase(id) {
  if (!currentUser || !sb) return;

  // Track deleted text so auto-import from TASKS.md doesn't resurrect it
  const taskToDelete = tasks.find(t => t.id === id);
  if (taskToDelete) {
    const normalize = s => s.replace(/\*+/g, '').replace(/\|\s*remind:\s*\d{1,2}:\d{2}/gi, '').toLowerCase().trim();
    deletedTaskTexts.add(normalize(taskToDelete.text));
    localStorage.setItem(DELETED_TASKS_KEY, JSON.stringify(Array.from(deletedTaskTexts)));
  }

  if (navigator.onLine) {
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (error) queueChange('tasks', 'delete', { id });
  } else {
    queueChange('tasks', 'delete', { id });
  }
}

async function pushLogToSupabase(entry) {
  if (!currentUser || !sb) return;
  entry.lastUpdated = new Date().toISOString();
  if (!entry.id) entry.id = entry.date; // use date as id for logs
  const row = logToRow(entry);
  if (navigator.onLine) {
    const { error } = await sb.from('daily_logs').upsert(row, { onConflict: 'id' });
    if (error) { console.log('Push log error:', error); queueChange('daily_logs', 'upsert', row); }
  } else {
    queueChange('daily_logs', 'upsert', row);
  }
}

async function syncFromSupabase() {
  if (!currentUser || !sb || isSyncing) return;
  isSyncing = true;

  try {
    // Sync tasks
    const { data: remoteTasks, error: tErr } = await sb.from('tasks')
      .select('*').eq('user_id', currentUser.id);
    if (!tErr && remoteTasks) {
      // 1. Clean incoming data
      remoteTasks.forEach(r => {
        if (r.text) {
          if (!r.reminder_time) {
            const remindMatch = r.text.match(/\|\s*remind:\s*(\d{1,2}:\d{2})/i);
            if (remindMatch) r.reminder_time = remindMatch[1];
          }
          const cleanText = sanitizeTaskText(r.text);
          if (cleanText !== r.text) {
            r.text = cleanText;
            const updatePayload = { text: cleanText };
            if (r.reminder_time) updatePayload.reminder_time = r.reminder_time;
            sb.from('tasks').update(updatePayload).eq('id', r.id).then();
          }
        }
      });

      // 2. Identify local tasks that don't exist in Supabase anymore (orphans)
      const remoteIds = new Set(remoteTasks.map(r => r.id));
      const localOrphans = tasks.filter(t => !remoteIds.has(t.id));

      if (localOrphans.length > 0) {
        // If we have local orphans, AND we are online, check if these tasks were created *after* the last sync.
        // If they are older tasks that just vanished from the DB, it means they were deleted elsewhere!
        const tenMinutesAgo = new Date(Date.now() - 10 * 60000).toISOString();
        const staleOrphans = localOrphans.filter(t => t.updatedAt < tenMinutesAgo);

        if (staleOrphans.length > 0) {
          // Remove stale orphans locally
          const staleIds = new Set(staleOrphans.map(t => t.id));
          tasks = tasks.filter(t => !staleIds.has(t.id));
        }
      }

      // 3. Merge remaining local map and remote map
      const localMap = {};
      tasks.forEach(t => { localMap[t.id] = t; });

      const remoteMap = {};
      remoteTasks.forEach(r => {
        remoteMap[r.id] = r;
        const local = localMap[r.id];
        if (!local) {
          tasks.push(rowToTask(r));
        } else {
          const remoteTime = new Date(r.updated_at).getTime();
          const localTime = new Date(local.updatedAt || 0).getTime();
          if (remoteTime > localTime) {
            Object.assign(local, rowToTask(r));
          }
        }
      });

      // 4. Push genuinely new offline local tasks to remote
      const existingTexts = new Set();
      tasks.forEach(t => {
        if (remoteMap[t.id]) existingTexts.add(t.text.trim().toLowerCase());
      });

      const localOnlyToRemove = [];
      for (const t of tasks) {
        if (!remoteMap[t.id]) {
          const textKey = t.text.trim().toLowerCase();
          if (existingTexts.has(textKey)) {
            localOnlyToRemove.push(t.id);
          } else {
            existingTexts.add(textKey);
            t.updatedAt = t.updatedAt || new Date().toISOString();
            const row = taskToRow(t);
            await sb.from('tasks').upsert(row, { onConflict: 'id' }).then(({ error }) => {
              if (error) console.log('Migration push error:', error);
            });
          }
        }
      }

      if (localOnlyToRemove.length > 0) {
        tasks = tasks.filter(t => !localOnlyToRemove.includes(t.id));
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }

    // Sync daily logs
    const { data: remoteLogs, error: lErr } = await sb.from('daily_logs')
      .select('*').eq('user_id', currentUser.id);
    if (!lErr && remoteLogs) {
      const localLogMap = {};
      dailyLog.forEach(e => { localLogMap[e.date] = e; });

      remoteLogs.forEach(r => {
        const local = localLogMap[r.date];
        if (!local) {
          dailyLog.push(rowToLog(r));
        } else {
          const remoteTime = new Date(r.updated_at).getTime();
          const localTime = new Date(local.lastUpdated || 0).getTime();
          if (remoteTime > localTime) {
            Object.assign(local, rowToLog(r));
          }
          if (!local.id) local.id = r.id;
        }
      });

      // Push local-only logs
      for (const entry of dailyLog) {
        const hasRemote = remoteLogs.find(r => r.date === entry.date);
        if (!hasRemote) {
          entry.id = entry.id || entry.date;
          entry.lastUpdated = entry.lastUpdated || new Date().toISOString();
          const row = logToRow(entry);
          await sb.from('daily_logs').upsert(row, { onConflict: 'id' }).then(({ error }) => {
            if (error) console.log('Log migration error:', error);
          });
        }
      }

      localStorage.setItem(HISTORY_KEY, JSON.stringify(dailyLog));
    }

    // Sync resources
    const { data: remoteResources, error: rErr } = await sb.from('resources')
      .select('*').eq('user_id', currentUser.id);
    if (!rErr && remoteResources) {
      if (remoteResources.length === 0 && resources.length === 0) {
        // First login - seed default resources
        await seedDefaultResources();
      } else {
        const localResMap = {};
        resources.forEach(r => { localResMap[r.id] = r; });
        remoteResources.forEach(r => {
          const local = localResMap[r.id];
          if (!local) {
            resources.push(r);
          } else {
            const remoteTime = new Date(r.updated_at).getTime();
            const localTime = new Date(local.updated_at || 0).getTime();
            if (remoteTime > localTime) Object.assign(local, r);
          }
        });
        // Push local-only resources
        const remoteResMap = {};
        remoteResources.forEach(r => { remoteResMap[r.id] = r; });
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        for (const r of resources) {
          // Ensure ID is a valid UUID (resources table uses UUID primary key)
          if (!r.id || !uuidRegex.test(r.id)) {
            r.id = uuidv4();
            localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources));
          }
          if (!remoteResMap[r.id]) {
            r.user_id = currentUser.id;
            // Only push fields the DB table has
            const row = {
              id: r.id,
              user_id: r.user_id,
              title: r.title,
              type: r.type,
              content: r.content || '',
              pinned: r.pinned || false,
              sort_order: r.sort_order || 0,
              updated_at: r.updated_at || new Date().toISOString()
            };
            const { error: resErr } = await sb.from('resources').upsert(row, { onConflict: 'id' });
            if (resErr) console.log('Resource push error — id:', r.id, '| message:', resErr.message, '| details:', resErr.details, '| hint:', resErr.hint);
          }
        }
        localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources));
      }
    }

    // Process any queued offline changes
    await processQueue();

  } catch (e) {
    console.log('Sync error:', e);
  }

  isSyncing = false;
  renderTabs();
  renderView();
  updateProgress();
}

// ===================== REALTIME =====================
function setupRealtime() {
  if (!sb || !currentUser) return;

  realtimeChannel = sb.channel('db-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (isSyncing) return; // ignore during full sync
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (payload.new && payload.new.text) payload.new.text = sanitizeTaskText(payload.new.text);
          const remote = rowToTask(payload.new);
          const idx = tasks.findIndex(t => t.id === remote.id);
          if (idx >= 0) {
            const localTime = new Date(tasks[idx].updatedAt || 0).getTime();
            const remoteTime = new Date(payload.new.updated_at).getTime();
            if (remoteTime > localTime) {
              tasks[idx] = remote;
            }
          } else {
            tasks.push(remote);
          }
        } else if (payload.eventType === 'DELETE') {
          tasks = tasks.filter(t => t.id !== payload.old.id);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        renderTabs(); renderView(); updateProgress();
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'daily_logs', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (isSyncing) return;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const remote = rowToLog(payload.new);
          const idx = dailyLog.findIndex(e => e.date === remote.date);
          if (idx >= 0) {
            Object.assign(dailyLog[idx], remote);
          } else {
            dailyLog.push(remote);
          }
          localStorage.setItem(HISTORY_KEY, JSON.stringify(dailyLog));
          if (activeTab === 'history') renderView();
          checkReviewPrompt();
        }
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'resources', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (isSyncing) return;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const idx = resources.findIndex(r => r.id === payload.new.id);
          if (idx >= 0) resources[idx] = payload.new;
          else resources.push(payload.new);
        } else if (payload.eventType === 'DELETE') {
          resources = resources.filter(r => r.id !== payload.old.id);
        }
        localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources));
        if (activeTab === 'playbook') renderPlaybook();
      }
    )
    .subscribe((status) => {
      console.log('Realtime status:', status);
    });
}

// ===================== INIT =====================
async function initApp() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    tasks = JSON.parse(saved);

    // Silent Migration: Clean up any tasks loaded that were corrupted with Claude | priority / | remind: tags
    let migrated = false;
    tasks.forEach(t => {
      let originalText = t.text;

      // Extract reminderTime from text if not already set (handles old imported tasks)
      if (!t.reminderTime && t.text) {
        const remindMatch = t.text.match(/\|\s*remind:\s*(\d{1,2}:\d{2})/i);
        if (remindMatch) {
          t.reminderTime = remindMatch[1];
          t._needsMigrationPush = true;
          migrated = true;
        }
      }

      t.text = sanitizeTaskText(t.text);

      if (t.text !== originalText) {
        t.updatedAt = new Date().toISOString();
        t._needsMigrationPush = true;
        migrated = true;
      }
    });

    if (migrated) {
      save(); // Save cleaned tasks back to local storage
      if (currentUser && sb) {
        tasks.filter(t => t._needsMigrationPush).forEach(t => {
          delete t._needsMigrationPush;
          pushTaskToSupabase(t);
        });
      }
    }

  } else if (currentUser && sb) {
    // Signed in but no local data: start empty and let syncFromSupabase pull tasks
    tasks = [];
  } else {
    // Offline / not signed in and no saved data: seed defaults
    tasks = JSON.parse(JSON.stringify(defaultTasks));
  }

  dailyLog = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  resources = JSON.parse(localStorage.getItem(RESOURCES_KEY) || '[]');

  try {
    const deletedArr = JSON.parse(localStorage.getItem(DELETED_TASKS_KEY) || '[]');
    deletedTaskTexts = new Set(deletedArr);
  } catch (e) {
    deletedTaskTexts = new Set();
  }

  checkDayReset();
  updateDate();
  updateStreak();
  renderTabs();
  renderView();
  updateProgress();
  checkReviewPrompt();

  // If signed in, sync and setup realtime
  if (currentUser && sb) {
    await syncFromSupabase();
    setupRealtime();
  }

  // Start reminder checker
  startReminderChecker();

  // Init workspace folder auto-sync (desktop only)
  initWorkspaceSync();
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  autoSaveSnapshot();
}

function saveDailyLog() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(dailyLog));
}

// ===================== APP START =====================
async function startApp() {
  if (!sb) {
    // Supabase not available, go straight to app
    showMainApp();
    return;
  }

  // Check for existing session
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    showMainApp();
  } else {
    // Show auth screen
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
  }

  // Register service worker for PWA + mobile notifications
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration failed:', err);
    });
  }
}

// Listen for auth state changes
if (sb) {
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
    }
  });
}

// ===================== DATE HELPERS =====================
function todayStr() { return new Date().toISOString().split('T')[0]; }
function dayName(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return dayName(dateStr) + ', ' + months[d.getMonth()] + ' ' + d.getDate();
}

function updateDate() {
  const d = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  document.getElementById('dateDisplay').textContent = days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
}

// ===================== DAY RESET =====================
function checkDayReset() {
  const lastReset = localStorage.getItem(STORAGE_KEY + '_lastReset');
  const today = todayStr();
  if (lastReset !== today) {
    // Save yesterday's snapshot before reset
    if (lastReset) saveEndOfDaySnapshot(lastReset);

    // Update per-task streaks before resetting
    tasks.forEach(t => {
      if (t.daily && (t.cat === 'today' || t.cat === 'daily-habits')) {
        if (t.done) {
          // Was completed yesterday - increment streak
          t.streak = (t.streak || 0) + 1;
          t.lastStreakDate = lastReset || today;
        } else if (lastReset) {
          // Was NOT completed yesterday - break streak
          t.streak = 0;
        }
        // Reset for new day
        t.done = false;
        delete t.completedAt;
        t.updatedAt = new Date().toISOString();
        pushTaskToSupabase(t);
      }
    });
    localStorage.setItem(STORAGE_KEY + '_lastReset', today);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
}

// ===================== DAILY SNAPSHOT (auto) =====================
function autoSaveSnapshot() {
  const today = todayStr();
  const todayTasks = tasks.filter(t => t.cat === 'today');
  const done = todayTasks.filter(t => t.done).length;
  const total = todayTasks.length;
  const score = total > 0 ? Math.round(done / total * 10) : 0;

  let entry = dailyLog.find(e => e.date === today);
  if (!entry) {
    entry = { date: today, score: 0, done: 0, total: 0, tasks: [], review: null };
    dailyLog.push(entry);
  }
  entry.score = score;
  entry.done = done;
  entry.total = total;
  entry.tasks = todayTasks.map(t => ({ text: t.text, done: t.done }));
  entry.lastUpdated = new Date().toISOString();

  // Keep last 90 days
  if (dailyLog.length > 90) dailyLog = dailyLog.slice(-90);
  saveDailyLog();
  pushLogToSupabase(entry);
}

function saveEndOfDaySnapshot(dateStr) {
  let entry = dailyLog.find(e => e.date === dateStr);
  if (!entry) {
    const todayTasks = tasks.filter(t => t.cat === 'today');
    const done = todayTasks.filter(t => t.done).length;
    const total = todayTasks.length;
    entry = {
      date: dateStr,
      score: total > 0 ? Math.round(done / total * 10) : 0,
      done: done, total: total,
      tasks: todayTasks.map(t => ({ text: t.text, done: t.done })),
      review: null
    };
    dailyLog.push(entry);
    saveDailyLog();
  }
}

// ===================== STREAK =====================
function updateStreak() {
  let streak = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"count":0,"lastDate":""}');
  const el = document.getElementById('streakDisplay');
  el.innerHTML = streak.count > 0 ? streak.count + ' day streak' : '';
}

function recordDayComplete() {
  let streak = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"count":0,"lastDate":""}');
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (streak.lastDate === today) return;
  streak.count = (streak.lastDate === yesterday) ? streak.count + 1 : 1;
  streak.lastDate = today;
  localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  updateStreak();
}

// ===================== TABS =====================
function renderTabs() {
  const cats = ['today', 'daily-habits', 'this-week', 'before-pilot', 'waiting', 'someday', 'playbook', 'done', 'history', 'sync'];
  const el = document.getElementById('tabsContainer');
  el.innerHTML = cats.map(c => {
    let count = '';
    let extra = '';
    if (c === 'done') count = `<span class="count">${tasks.filter(t => t.done).length}</span>`;
    else if (c === 'history') extra = ' history-tab';
    else if (c === 'sync') {
      extra = ' sync-tab';
      const notifCount = getNotifCount();
      if (notifCount > 0) count = `<span class="count notif-badge">${notifCount}</span>`;
    }
    else if (c === 'playbook') { extra = ' playbook-tab'; count = `<span class="count">${resources.length}</span>`; }
    else count = `<span class="count">${tasks.filter(t => t.cat === c && !t.done).length}</span>`;
    return `<button class="tab${extra} ${c === activeTab ? 'active' : ''}" onclick="switchTab('${c}')">
      ${catLabels[c]}${count}
    </button>`;
  }).join('');
}

function switchTab(tab) {
  activeTab = tab;
  if (tab === 'sync') clearNotifCount();
  renderTabs();
  renderView();
  // Show FAB on task tabs and playbook, hide on history/sync
  document.getElementById('fabBtn').style.display = (tab === 'history' || tab === 'sync') ? 'none' : 'flex';
  // Show quick capture on task list tabs only
  const quickCap = document.getElementById('quickCapture');
  const showQuickCapture = ['today', 'daily-habits', 'this-week', 'before-pilot', 'waiting', 'someday'].includes(tab);
  quickCap.style.display = showQuickCapture ? 'flex' : 'none';
}

// ===================== RENDER VIEW =====================
function renderView() {
  const taskEl = document.getElementById('taskList');
  const syncEl = document.getElementById('syncSection');
  const playbookEl = document.getElementById('playbookSection');
  const reviewEl = document.getElementById('reviewPrompt');

  if (activeTab === 'history') {
    taskEl.innerHTML = '';
    syncEl.style.display = 'none';
    playbookEl.style.display = 'none';
    reviewEl.innerHTML = '';
    renderHistory(taskEl);
    return;
  }
  if (activeTab === 'sync') {
    taskEl.innerHTML = '';
    syncEl.style.display = 'block';
    playbookEl.style.display = 'none';
    reviewEl.innerHTML = '';
    renderSync();
    return;
  }
  if (activeTab === 'playbook') {
    taskEl.innerHTML = '';
    syncEl.style.display = 'none';
    playbookEl.style.display = 'block';
    reviewEl.innerHTML = '';
    renderPlaybook();
    return;
  }

  syncEl.style.display = 'none';
  playbookEl.style.display = 'none';
  renderTasks();
  checkReviewPrompt();
}

// ===================== RENDER TASKS =====================
function renderTasks() {
  const el = document.getElementById('taskList');
  let filtered;
  if (activeTab === 'done') {
    filtered = tasks.filter(t => t.done);
  } else {
    filtered = tasks.filter(t => t.cat === activeTab && !t.done);
  }

  if (filtered.length === 0) {
    el.innerHTML = `<div class="empty">${activeTab === 'done' ? 'No completed tasks yet.' : 'No tasks here. Tap + to add one.'}</div>`;
    return;
  }

  // Check for duplicates in this section
  const seen = new Set();
  let dupeCount = 0;
  filtered.forEach(t => {
    const key = t.text.trim().toLowerCase();
    if (seen.has(key)) dupeCount++;
    else seen.add(key);
  });

  let sectionActionsHtml = '';
  if (dupeCount > 0) {
    const sectionKey = activeTab === 'done' ? 'done' : activeTab;
    sectionActionsHtml = `<div class="section-actions">
      <button class="btn-remove-dupes" onclick="removeDuplicates('${sectionKey}')">
        <span class="icon">⊘</span> Remove ${dupeCount} duplicate${dupeCount > 1 ? 's' : ''}
      </button>
    </div>`;
  }

  const pOrder = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2));

  el.innerHTML = sectionActionsHtml + filtered.map(t => {
    const subs = t.subtasks || [];
    const subsDone = subs.filter(s => s.done).length;
    const subsTotal = subs.length;
    const streakVal = t.streak || 0;
    return `
    <div class="task-item ${t.done ? 'done' : ''}">
      <div class="checkbox ${t.done ? 'checked' : ''}" onclick="event.stopPropagation();toggleTask('${t.id}')"></div>
      <div class="task-content" onclick="openTaskDetail('${t.id}')">
        <div class="task-text">${esc(t.text)}</div>
        <div class="task-meta">
          <span class="tag priority-${t.priority}">${t.priority}</span>
          ${t.daily ? '<span class="tag category">daily</span>' : ''}
          ${t.notes ? '<span class="tag category">has details</span>' : ''}
          ${subsTotal > 0 ? `<span class="subtask-inline">${subsDone}/${subsTotal}</span>` : ''}
          ${t.daily && streakVal > 2 ? `<span class="streak-badge">${streakVal}d</span>` : ''}
        </div>
      </div>
      <button class="task-bell-btn ${t.reminderTime ? 'active' : ''}" onclick="event.stopPropagation(); toggleTaskReminder('${t.id}')" title="${t.reminderTime ? 'Reminder: ' + t.reminderTime : 'Add Reminder'}">
        ${t.reminderTime ? '&#128276; ' + t.reminderTime : '&#128276;'}
      </button>
    </div>`;
  }).join('') + '<div class="hint">Tap task to see details | Tap circle to complete</div>';
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ===================== REMOVE DUPLICATES =====================
function removeDuplicates(sectionKey) {
  let sectionTasks;
  if (sectionKey === 'done') {
    sectionTasks = tasks.filter(t => t.done);
  } else {
    sectionTasks = tasks.filter(t => t.cat === sectionKey && !t.done);
  }

  const seen = new Set();
  const idsToRemove = [];

  sectionTasks.forEach(t => {
    const key = t.text.trim().toLowerCase();
    if (seen.has(key)) {
      idsToRemove.push(t.id);
    } else {
      seen.add(key);
    }
  });

  if (idsToRemove.length === 0) return;

  // Remove from local array and sync deletions
  idsToRemove.forEach(id => {
    tasks = tasks.filter(t => t.id !== id);
    deleteTaskFromSupabase(id);
  });

  save();
  renderTabs();
  renderView();
  updateProgress();
}

// ===================== REVIEW PROMPT =====================
function checkReviewPrompt() {
  const el = document.getElementById('reviewPrompt');
  if (activeTab !== 'today' && activeTab !== 'daily-habits') { el.innerHTML = ''; return; }

  const todayTasks = tasks.filter(t => t.cat === 'today' || t.cat === 'daily-habits');
  const done = todayTasks.filter(t => t.done).length;
  const total = todayTasks.length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;

  const todayEntry = dailyLog.find(e => e.date === todayStr());
  const hasReview = todayEntry && todayEntry.review;

  if (pct >= 60 && !hasReview) {
    el.innerHTML = `<div class="review-prompt">
      <p>You have completed ${pct}% of today's tasks. Time for your daily self-review?</p>
      <button onclick="openReviewModal()">Write Review</button>
    </div>`;
  } else if (hasReview) {
    el.innerHTML = `<div class="review-prompt" style="border-color:var(--green);background:linear-gradient(135deg,#0f1f0f,#1a1a1a)">
      <p style="color:var(--green)">Today's review saved. Score: ${todayEntry.score}/10 | E:${todayEntry.review.energy} F:${todayEntry.review.focus} X:${todayEntry.review.exec}</p>
    </div>`;
  } else {
    el.innerHTML = '';
  }
}

// ===================== REVIEW MODAL =====================
function openReviewModal() {
  document.getElementById('reviewWell').value = '';
  document.getElementById('reviewBlock').value = '';
  document.getElementById('reviewDiff').value = '';
  document.getElementById('reviewEnergy').value = '3';
  document.getElementById('reviewFocus').value = '3';
  document.getElementById('reviewExec').value = '3';
  document.getElementById('reviewModal').classList.add('open');
}

function closeReviewModal() {
  document.getElementById('reviewModal').classList.remove('open');
}

function saveReview() {
  const review = {
    well: document.getElementById('reviewWell').value.trim(),
    blocked: document.getElementById('reviewBlock').value.trim(),
    different: document.getElementById('reviewDiff').value.trim(),
    energy: parseInt(document.getElementById('reviewEnergy').value),
    focus: parseInt(document.getElementById('reviewFocus').value),
    exec: parseInt(document.getElementById('reviewExec').value),
    timestamp: new Date().toISOString()
  };

  const today = todayStr();
  let entry = dailyLog.find(e => e.date === today);
  if (!entry) {
    entry = { date: today, score: 0, done: 0, total: 0, tasks: [], review: null };
    dailyLog.push(entry);
  }
  entry.review = review;
  saveDailyLog();
  autoSaveSnapshot();
  pushLogToSupabase(entry);
  closeReviewModal();
  checkReviewPrompt();
}

document.getElementById('reviewModal').addEventListener('click', function (e) {
  if (e.target === this) closeReviewModal();
});

// ===================== TOGGLE =====================
function toggleTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) t.completedAt = new Date().toISOString();
  else delete t.completedAt;
  t.updatedAt = new Date().toISOString();
  save();
  pushTaskToSupabase(t);
  renderTabs();
  renderTasks();
  updateProgress();
  checkReviewPrompt();

  const todayTasks = tasks.filter(x => x.cat === 'today');
  if (todayTasks.length > 0 && todayTasks.every(x => x.done)) recordDayComplete();
}
// ===================== REMINDERS =====================
function toggleTaskReminder(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  if (t.reminderTime) {
    if (confirm(`Clear reminder for "${t.text}" at ${t.reminderTime}?`)) {
      delete t.reminderTime;
      t.updatedAt = new Date().toISOString();
      save();
      pushTaskToSupabase(t);
      renderTasks();
    }
  } else {
    // Open a native time picker by dynamically creating an input
    const input = document.createElement('input');
    input.type = 'time';
    // If setting a time right now, default to next nearest hour
    const d = new Date();
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
    input.value = d.toTimeString().slice(0, 5);

    input.addEventListener('change', () => {
      if (input.value) {
        t.reminderTime = input.value;
        t.updatedAt = new Date().toISOString();
        save();
        pushTaskToSupabase(t);
        renderTasks();
      }
    });

    // Simulate click to open picker (works better on mobile than window.prompt)
    if ('showPicker' in HTMLInputElement.prototype) {
      try {
        // Need to append to DOM briefly for showPicker to work in some browsers
        input.style.position = 'absolute';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.showPicker();
        input.addEventListener('blur', () => input.remove());
      } catch (e) {
        // Fallback for browsers that block showPicker without strict user gesture
        const time = prompt("Enter reminder time (HH:MM):", input.value);
        if (time && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
          t.reminderTime = time;
          t.updatedAt = new Date().toISOString();
          save();
          pushTaskToSupabase(t);
          renderTasks();
        }
        if (input.parentNode) input.remove();
      }
    } else {
      const time = prompt("Enter reminder time (HH:MM):", input.value);
      if (time && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        t.reminderTime = time;
        t.updatedAt = new Date().toISOString();
        save();
        pushTaskToSupabase(t);
        renderTasks();
      }
    }
  }
}

function createQuickReminder() {
  const text = prompt("What do you want to be reminded about?");
  if (!text) return;

  const time = prompt("What time? (HH:MM format, 24-hour clock)");
  if (!time || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    alert("Invalid time format. Please use HH:MM (e.g., 14:30)");
    return;
  }

  const t = {
    id: 't_' + Date.now(),
    text: text.trim(),
    cat: activeTab === 'all' ? 'today' : activeTab, // default to current tab
    priority: 'medium',
    done: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reminderTime: time
  };

  tasks.push(t);
  save();
  pushTaskToSupabase(t);
  renderTabs();
  renderTasks();
  updateProgress();
  showNotification('Reminder Set', `Will remind you about "${t.text}" at ${time}`);
}
function updateProgress() {
  const total = tasks.filter(t => !t.daily || t.cat === 'today').length;
  const done = tasks.filter(t => t.done).length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = done + ' of ' + total + ' done';
  document.getElementById('progressPct').textContent = pct + '%';

  const todayTasks = tasks.filter(t => t.cat === 'today' || t.cat === 'daily-habits');
  const todayDone = todayTasks.filter(t => t.done).length;
  const score = todayTasks.length > 0 ? Math.round(todayDone / todayTasks.length * 10) : 0;
  document.getElementById('scoreNum').textContent = score;
}

// ===================== HISTORY TAB =====================
function renderHistory(el) {
  if (dailyLog.length === 0) {
    el.innerHTML = '<div class="empty">No history yet. Complete tasks and write reviews to build your log.</div>';
    return;
  }

  const sorted = [...dailyLog].sort((a, b) => b.date.localeCompare(a.date));
  let html = '';

  // Weekly summary for current week
  const thisWeek = sorted.filter(e => {
    const diff = (new Date() - new Date(e.date + 'T12:00:00')) / 86400000;
    return diff < 7;
  });
  if (thisWeek.length > 1) {
    const avgScore = Math.round(thisWeek.reduce((s, e) => s + (e.score || 0), 0) / thisWeek.length);
    const withReview = thisWeek.filter(e => e.review).length;
    const avgEnergy = thisWeek.filter(e => e.review).length > 0
      ? (thisWeek.filter(e => e.review).reduce((s, e) => s + e.review.energy, 0) / thisWeek.filter(e => e.review).length).toFixed(1)
      : '-';
    html += `<div class="history-week-summary">
      <h3>This Week (${thisWeek.length} days logged)</h3>
      <div class="history-stats">
        <div class="history-stat">Avg Score: <strong>${avgScore}/10</strong></div>
        <div class="history-stat">Reviews: <strong>${withReview}/${thisWeek.length}</strong></div>
        <div class="history-stat">Avg Energy: <strong>${avgEnergy}/5</strong></div>
      </div>
    </div>`;
  }

  sorted.forEach(entry => {
    const pct = entry.total > 0 ? Math.round(entry.done / entry.total * 100) : 0;
    const scoreColor = entry.score >= 7 ? 'var(--green)' : entry.score >= 4 ? 'var(--yellow)' : 'var(--red)';

    html += `<div class="history-card">
      <div class="history-date">${formatDate(entry.date)}</div>
      <div class="history-stats">
        <div class="history-stat">Score: <strong style="color:${scoreColor}">${entry.score}/10</strong></div>
        <div class="history-stat">Tasks: <strong>${entry.done}/${entry.total}</strong></div>
        ${entry.review ? `<div class="history-stat">E:<strong>${entry.review.energy}</strong> F:<strong>${entry.review.focus}</strong> X:<strong>${entry.review.exec}</strong></div>` : ''}
      </div>
      <div class="history-bar"><div class="history-bar-fill" style="width:${pct}%"></div></div>`;

    if (entry.review) {
      html += `<div class="history-review">`;
      if (entry.review.well) html += `<strong>Went well:</strong> ${esc(entry.review.well)}\n`;
      if (entry.review.blocked) html += `<strong>Blocked:</strong> ${esc(entry.review.blocked)}\n`;
      if (entry.review.different) html += `<strong>Tomorrow:</strong> ${esc(entry.review.different)}`;
      html += `</div>`;
    } else {
      html += `<div class="history-review" style="color:var(--red)">No review written</div>`;
    }
    html += `</div>`;
  });

  el.innerHTML = html;
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showSyncStatus(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
  }
}

async function copyClaudeApiUrl() {
  if (!sb || !currentUser) return;
  const { data: { session } } = await sb.auth.getSession();
  const token = session ? session.access_token : SUPABASE_ANON_KEY;
  const uid = currentUser.id;
  const base = SUPABASE_URL;
  const key = SUPABASE_ANON_KEY;

  const readCmd = `curl -s "${base}/rest/v1/tasks?select=*&user_id=eq.${uid}&order=updatedAt.desc" -H "apikey: ${key}" -H "Authorization: Bearer ${token}"`;
  const writeCmd = `curl -s -X PATCH "${base}/rest/v1/tasks?id=eq.TASK_ID" -H "apikey: ${key}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"done":true,"updatedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}'`;
  const addCmd = `curl -s -X POST "${base}/rest/v1/tasks" -H "apikey: ${key}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"id":"NEW_UUID","text":"Task text","cat":"today","done":false,"priority":2,"daily":false,"user_id":"${uid}","updatedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}'`;

  const expiry = session ? new Date(session.expires_at * 1000).toLocaleTimeString() : 'N/A';
  const full = `# Malveon Supabase API — Claude Two-Way Sync\n# Token valid until: ${expiry}\n\n## READ all tasks\n${readCmd}\n\n## MARK task done (replace TASK_ID)\n${writeCmd}\n\n## ADD new task (replace NEW_UUID with a real UUID)\n${addCmd}`;

  navigator.clipboard.writeText(full).then(() => showSyncStatus('claudeApiStatus'));

  // Also update the displayed snippet in-page
  const el = document.getElementById('claudeApiSnippet');
  if (el) {
    el.textContent = `READ: ${readCmd.slice(0, 80)}...\nToken expires: ${expiry}`;
    el.style.display = 'block';
  }
}

function copyClaudeSnapshot() {
  let text = `MALVEON SNAPSHOT - ${new Date().toLocaleDateString()}\n\n`;
  text += generateTasksMd();
  navigator.clipboard.writeText(text).then(() => showSyncStatus('claudeSnapStatus'));
}

async function forceSyncNow() {
  if (!currentUser || !sb) return;
  await syncFromSupabase();
  showSyncStatus('forceSyncStatus');
}

// ===================== GENERATE TASKS.MD =====================
function generateTasksMd() {
  let md = '# Tasks\n\n';
  md += `> Last synced from app: ${new Date().toLocaleString()}\n\n`;

  const todayEntry = dailyLog.find(e => e.date === todayStr());
  if (todayEntry) {
    md += `## Today's Status\n`;
    md += `- Score: ${todayEntry.score}/10\n`;
    md += `- Tasks completed: ${todayEntry.done}/${todayEntry.total}\n`;
    if (todayEntry.review) {
      md += `- Energy: ${todayEntry.review.energy}/5 | Focus: ${todayEntry.review.focus}/5 | Execution: ${todayEntry.review.exec}/5\n`;
      if (todayEntry.review.well) md += `- Went well: ${todayEntry.review.well}\n`;
      if (todayEntry.review.blocked) md += `- Blocked by: ${todayEntry.review.blocked}\n`;
      if (todayEntry.review.different) md += `- Tomorrow: ${todayEntry.review.different}\n`;
    }
    md += '\n';
  }

  // Active categories
  const cats = ['today', 'daily-habits', 'this-week', 'before-pilot', 'waiting', 'someday'];
  cats.forEach(cat => {
    const items = tasks.filter(t => t.cat === cat && !t.done);
    if (items.length === 0) return;
    md += `## ${catLabels[cat]}${cat === 'today' ? ' (Daily - resets each day)' : ''}\n\n`;
    items.forEach(t => {
      md += `- [ ] **${t.text}**${t.priority === 'high' ? ' [HIGH]' : ''}${t.daily ? ' [DAILY]' : ''}`;
      if (t.notes) md += ` -- ${t.notes.replace(/\n/g, ' ')}`;
      md += '\n';
    });
    md += '\n';
  });

  // Done
  const done = tasks.filter(t => t.done);
  if (done.length > 0) {
    md += `## Done\n\n`;
    done.forEach(t => {
      md += `- [x] ~~${t.text}~~${t.completedAt ? ' (' + t.completedAt.split('T')[0] + ')' : ''}\n`;
    });
    md += '\n';
  }

  // Active Playbook Resources
  if (resources.length > 0) {
    md += `## Active Playbook Resources\n\n`;
    const pinned = resources.filter(r => r.pinned);
    const unpinned = resources.filter(r => !r.pinned);
    [...pinned, ...unpinned].forEach(r => {
      md += `- ${r.title}${r.pinned ? ' (pinned)' : ''} [${r.type}]\n`;
    });
    md += '\n';
  }

  // Messages to Claude
  const claudeNotes = loadClaudeNotes();
  if (claudeNotes.length > 0) {
    md += `## Messages to Claude\n\n`;
    md += `<!-- Claude: Read these messages at the start of every session. Use them to update context, adjust tasks, and follow up. -->\n\n`;
    [...claudeNotes].reverse().forEach(n => {
      md += `> [${n.date} ${n.time}] ${n.text}\n`;
    });
    md += '\n';
  }

  return md;
}

// ===================== GENERATE DAILY LOG MD =====================
function generateDailyLogMd() {
  let md = '# Malveon Daily Log\n\n';
  md += `> Auto-generated from task app. Last export: ${new Date().toLocaleString()}\n`;
  md += `> Claude: Read this file to understand Ladson's progress patterns and adjust tasks accordingly.\n\n`;

  const sorted = [...dailyLog].sort((a, b) => b.date.localeCompare(a.date));

  // Summary stats
  const last7 = sorted.filter(e => (new Date() - new Date(e.date + 'T12:00:00')) / 86400000 < 7);
  const last30 = sorted.filter(e => (new Date() - new Date(e.date + 'T12:00:00')) / 86400000 < 30);

  md += `## Summary\n\n`;
  md += `- Total days logged: ${sorted.length}\n`;

  if (last7.length > 0) {
    const avg7 = (last7.reduce((s, e) => s + e.score, 0) / last7.length).toFixed(1);
    const reviews7 = last7.filter(e => e.review).length;
    md += `- Last 7 days: avg score ${avg7}/10, ${reviews7} reviews written\n`;
    if (last7.filter(e => e.review).length > 0) {
      const avgE = (last7.filter(e => e.review).reduce((s, e) => s + e.review.energy, 0) / last7.filter(e => e.review).length).toFixed(1);
      const avgF = (last7.filter(e => e.review).reduce((s, e) => s + e.review.focus, 0) / last7.filter(e => e.review).length).toFixed(1);
      const avgX = (last7.filter(e => e.review).reduce((s, e) => s + e.review.exec, 0) / last7.filter(e => e.review).length).toFixed(1);
      md += `- Last 7 days avg: Energy ${avgE}/5, Focus ${avgF}/5, Execution ${avgX}/5\n`;
    }
  }

  // Patterns for Claude
  md += `\n## Patterns for Claude\n\n`;
  const lowDays = sorted.filter(e => e.score <= 3);
  const highDays = sorted.filter(e => e.score >= 8);
  md += `- High performance days (8+/10): ${highDays.length}\n`;
  md += `- Low performance days (3-/10): ${lowDays.length}\n`;

  if (sorted.filter(e => e.review).length > 0) {
    const blockers = sorted.filter(e => e.review && e.review.blocked).map(e => e.review.blocked);
    if (blockers.length > 0) {
      md += `- Common blockers reported: ${blockers.slice(0, 5).join(' | ')}\n`;
    }
  }

  // Daily entries
  md += `\n## Daily Entries\n\n`;
  sorted.forEach(entry => {
    md += `### ${formatDate(entry.date)} (${entry.date})\n`;
    md += `- Score: ${entry.score}/10 | Tasks: ${entry.done}/${entry.total}\n`;
    if (entry.review) {
      md += `- Energy: ${entry.review.energy}/5 | Focus: ${entry.review.focus}/5 | Execution: ${entry.review.exec}/5\n`;
      if (entry.review.well) md += `- Well: ${entry.review.well}\n`;
      if (entry.review.blocked) md += `- Blocked: ${entry.review.blocked}\n`;
      if (entry.review.different) md += `- Tomorrow: ${entry.review.different}\n`;
    } else {
      md += `- No review written\n`;
    }
    if (entry.tasks && entry.tasks.length > 0) {
      entry.tasks.forEach(t => {
        md += `  - ${t.done ? '[x]' : '[ ]'} ${t.text}\n`;
      });
    }
    md += '\n';
  });

  return md;
}

// ===================== DOWNLOAD FUNCTIONS =====================
function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadTasksMd() {
  downloadFile('TASKS.md', generateTasksMd());
  localStorage.setItem(STORAGE_KEY + '_lastSync', new Date().toLocaleString());
  showSyncStatus('syncStatus');
}

function downloadDailyLog() {
  downloadFile('daily-log.md', generateDailyLogMd());
  localStorage.setItem(STORAGE_KEY + '_lastSync', new Date().toLocaleString());
  showSyncStatus('syncStatus');
}

function downloadBoth() {
  downloadFile('TASKS.md', generateTasksMd());
  setTimeout(() => downloadFile('daily-log.md', generateDailyLogMd()), 500);
  localStorage.setItem(STORAGE_KEY + '_lastSync', new Date().toLocaleString());
  showSyncStatus('syncStatus');
}

function showSyncStatus(id) {
  const el = document.getElementById(id);
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

// ===================== COPY FOR CLAUDE =====================
function copyForClaude() {
  const today = todayStr();
  const entry = dailyLog.find(e => e.date === today);
  const todayTasks = tasks.filter(t => t.cat === 'today');
  const done = todayTasks.filter(t => t.done).length;
  const total = todayTasks.length;

  let text = `MALVEON DAILY UPDATE - ${formatDate(today)}\n`;
  text += `Score: ${entry ? entry.score : (total > 0 ? Math.round(done / total * 10) : 0)}/10 | Tasks: ${done}/${total}\n`;

  todayTasks.forEach(t => { text += `${t.done ? '[DONE]' : '[  ]'} ${t.text}\n`; });

  if (entry && entry.review) {
    text += `\nEnergy: ${entry.review.energy}/5 | Focus: ${entry.review.focus}/5 | Execution: ${entry.review.exec}/5\n`;
    if (entry.review.well) text += `Went well: ${entry.review.well}\n`;
    if (entry.review.blocked) text += `Blocked: ${entry.review.blocked}\n`;
    if (entry.review.different) text += `Tomorrow: ${entry.review.different}\n`;
  }

  text += `\nI am Ladson, CEO of Malveon (engineering team intelligence platform). Based on this progress, what should I focus on next?`;

  navigator.clipboard.writeText(text).then(() => showSyncStatus('copyStatus'));
}

// ===================== ADD/EDIT MODAL =====================
function openAddModal() {
  // If on playbook tab, open resource modal instead
  if (activeTab === 'playbook') { openResourceModal(); return; }
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Task';
  document.getElementById('taskInput').value = '';
  document.getElementById('categoryInput').value = (activeTab === 'done' || activeTab === 'history' || activeTab === 'sync' || activeTab === 'playbook') ? 'today' : activeTab;
  document.getElementById('priorityInput').value = 'medium';
  document.getElementById('notesInput').value = '';
  document.getElementById('reminderInput').value = '';
  document.getElementById('modalActions').innerHTML = `
    <button class="btn-cancel" onclick="closeModal()">Cancel</button>
    <button class="btn-save" onclick="saveTask()">Add Task</button>`;
  document.getElementById('modal').classList.add('open');
  setTimeout(() => document.getElementById('taskInput').focus(), 100);
}

function editTask(e, id) {
  e.preventDefault();
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Task';
  document.getElementById('taskInput').value = t.text;
  document.getElementById('categoryInput').value = t.cat;
  document.getElementById('priorityInput').value = t.priority;
  document.getElementById('notesInput').value = t.notes || '';
  document.getElementById('reminderInput').value = t.reminderTime || '';
  document.getElementById('modalActions').innerHTML = `
    <button class="btn-delete" onclick="deleteTask('${id}')">Delete</button>
    <button class="btn-cancel" onclick="closeModal()">Cancel</button>
    <button class="btn-save" onclick="saveTask()">Save</button>`;
  document.getElementById('modal').classList.add('open');
}

function closeModal() { document.getElementById('modal').classList.remove('open'); editingId = null; }

function saveTask() {
  const text = document.getElementById('taskInput').value.trim();
  if (!text) return;
  const cat = document.getElementById('categoryInput').value;
  const priority = document.getElementById('priorityInput').value;
  const notes = document.getElementById('notesInput').value.trim();

  const reminderTime = document.getElementById('reminderInput').value || null;

  if (editingId) {
    const t = tasks.find(x => x.id === editingId);
    if (t) {
      t.text = text; t.cat = cat; t.priority = priority; t.notes = notes;
      t.reminderTime = reminderTime;
      t.updatedAt = new Date().toISOString();
      pushTaskToSupabase(t);
    }
  } else {
    const newTask = {
      id: uid(), text, cat, priority, done: false, notes, daily: cat === 'today',
      subtasks: [], streak: 0, lastStreakDate: null, reminderTime,
      updatedAt: new Date().toISOString()
    };
    tasks.push(newTask);
    pushTaskToSupabase(newTask);
  }
  save(); closeModal(); renderTabs(); renderView(); updateProgress();
}

function deleteTask(id) {
  if (confirm('Delete this task?')) {
    const taskToDelete = tasks.find(t => t.id === id);
    if (taskToDelete) {
      const normalize = s => s.replace(/\*+/g, '').replace(/\|\s*remind:\s*\d{1,2}:\d{2}/gi, '').toLowerCase().trim();
      deletedTaskTexts.add(normalize(taskToDelete.text));
      localStorage.setItem(DELETED_TASKS_KEY, JSON.stringify(Array.from(deletedTaskTexts)));
    }

    tasks = tasks.filter(t => t.id !== id);
    deleteTaskFromSupabase(id);
    save(); closeModal(); renderTabs(); renderView(); updateProgress();
  }
}

document.getElementById('modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

// ===================== TASK DETAIL PANEL =====================
function openTaskDetail(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  const panel = document.getElementById('detailPanel');
  const priorityColors = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--accent)' };
  const priorityBg = { high: 'rgba(248,113,113,0.15)', medium: 'rgba(251,191,36,0.15)', low: 'rgba(79,140,255,0.1)' };

  let html = `
    <div class="detail-header">
      <div class="detail-title">${esc(t.text)}</div>
      <button class="detail-close" onclick="closeTaskDetail()">&times;</button>
    </div>

    <div class="detail-tags">
      <span class="detail-tag" style="background:${priorityBg[t.priority]};color:${priorityColors[t.priority]}">${t.priority} priority</span>
      <span class="detail-tag" style="background:rgba(255,255,255,0.05);color:var(--text-dim)">${catLabels[t.cat]}</span>
      ${t.daily ? '<span class="detail-tag" style="background:rgba(79,140,255,0.1);color:var(--accent)">Repeats daily</span>' : ''}
    </div>

    <div class="detail-status ${t.done ? 'completed' : 'pending'}">
      <div class="detail-status-dot" style="background:${t.done ? 'var(--green)' : 'var(--accent)'}"></div>
      ${t.done ? 'Completed' + (t.completedAt ? ' on ' + t.completedAt.split('T')[0] : '') : 'Not completed yet'}
    </div>`;

  // Notes section
  if (t.notes) {
    html += `
    <div class="detail-section">
      <div class="detail-section-title">Notes / How to do this</div>
      <div class="detail-section-body">${esc(t.notes)}</div>
    </div>`;
  }

  // Subtasks section
  const subs = t.subtasks || [];
  if (subs.length > 0 || !t.done) {
    const subsDone = subs.filter(s => s.done).length;
    html += `
    <div class="detail-section">
      <div class="detail-section-title">Subtasks${subs.length > 0 ? ` (${subsDone}/${subs.length})` : ''}</div>`;

    if (subs.length > 0) {
      const subPct = Math.round(subsDone / subs.length * 100);
      html += `
      <div class="subtask-progress">
        <div class="subtask-progress-bar"><div class="subtask-progress-fill" style="width:${subPct}%"></div></div>
        <span>${subPct}%</span>
      </div>
      <div class="subtask-list">`;
      subs.forEach((s, i) => {
        html += `
        <div class="subtask-item">
          <div class="subtask-check ${s.done ? 'checked' : ''}" onclick="toggleSubtask('${t.id}',${i})"></div>
          <span class="subtask-text ${s.done ? 'done' : ''}">${esc(s.text)}</span>
        </div>`;
      });
      html += `</div>`;
    }

    html += `
      <div class="subtask-add">
        <input type="text" id="newSubtaskInput" placeholder="Add a step..." onkeydown="if(event.key==='Enter')addSubtask('${t.id}')">
        <button onclick="addSubtask('${t.id}')">+</button>
      </div>
    </div>`;
  }

  // Streak section for daily tasks
  if (t.daily) {
    const streakVal = t.streak || 0;
    const streakColor = streakVal > 0 ? 'var(--yellow)' : 'var(--red)';
    const streakBg = streakVal > 0 ? 'rgba(251,191,36,0.1)' : 'rgba(248,113,113,0.1)';
    const streakText = streakVal > 0 ? `${streakVal} day streak` : (t.lastStreakDate ? 'Streak broken - start again today!' : 'Complete daily to build streak');
    html += `
    <div class="detail-status" style="background:${streakBg};color:${streakColor}">
      <div class="detail-status-dot" style="background:${streakColor}"></div>
      ${streakText}
    </div>`;
  }

  // Reminder info
  if (t.reminderTime) {
    html += `
    <div class="detail-status" style="background:rgba(251,191,36,0.1);color:var(--yellow)">
      <div class="detail-status-dot" style="background:var(--yellow)"></div>
      Reminder set for ${t.reminderTime} daily
    </div>`;
  }

  // Context tips based on task content
  const tips = getTaskTips(t);
  if (tips) {
    html += `
    <div class="detail-section">
      <div class="detail-section-title">Quick Guide</div>
      <div class="detail-section-body">${tips}</div>
    </div>`;
  }

  html += `
    <div class="detail-actions">
      <button class="detail-btn-toggle ${t.done ? 'undo' : ''}" onclick="toggleFromDetail('${t.id}')">
        ${t.done ? 'Mark Undone' : 'Mark Done'}
      </button>
      <button class="detail-btn-edit" onclick="closeTaskDetail();editTask(event,'${t.id}')">Edit</button>
      <button class="detail-btn-delete" onclick="deleteFromDetail('${t.id}')">Delete</button>
    </div>`;

  panel.innerHTML = html;
  document.getElementById('detailOverlay').classList.add('open');
}

function closeTaskDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
}

function deleteFromDetail(id) {
  if (confirm('Delete this task? This cannot be undone.')) {
    const taskToDelete = tasks.find(t => t.id === id);
    if (taskToDelete) {
      const normalize = s => s.replace(/\*+/g, '').replace(/\|\s*remind:\s*\d{1,2}:\d{2}/gi, '').toLowerCase().trim();
      deletedTaskTexts.add(normalize(taskToDelete.text));
      localStorage.setItem(DELETED_TASKS_KEY, JSON.stringify(Array.from(deletedTaskTexts)));
    }

    tasks = tasks.filter(t => t.id !== id);
    deleteTaskFromSupabase(id);
    save(); closeTaskDetail(); renderTabs(); renderView(); updateProgress();
  }
}

function toggleFromDetail(id) {
  toggleTask(id);
  const t = tasks.find(x => x.id === id);
  if (t) openTaskDetail(id); // refresh the detail view
}

document.getElementById('detailOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeTaskDetail();
});

function getTaskTips(t) {
  const text = t.text.toLowerCase();

  if (text.includes('outreach') || text.includes('dm') || text.includes('message')) {
    return 'Open LinkedIn or email. Use your outreach templates from outreach/reference/.\nFocus on personalization - mention something specific about their company.\nTrack every message in your outreach tracker.';
  }
  if (text.includes('deep work') || text.includes('dw1') || text.includes('dw2')) {
    return 'Phone on airplane mode. Close all tabs except what you need.\nSet a timer for the full block.\nStart with the hardest task first - no warm-up tasks.';
  }
  if (text.includes('follow up') || text.includes('follow-up')) {
    return 'Check outreach tracker for pending replies.\nIf no response after 3 days, send a short bump message.\nKeep it casual: "Hey, just checking if you saw my last message"';
  }
  if (text.includes('tracker') || text.includes('update')) {
    return 'Open outreach/trackers/ in your workspace.\nLog: who you contacted, channel used, response status.\nMove warm leads to the next pipeline stage.';
  }
  if (text.includes('exercise') || text.includes('workout')) {
    return '30 minutes minimum. Even a brisk walk counts.\nNo phone during exercise - use it as a mental reset.\nConsistency > intensity.';
  }
  if (text.includes('review') || text.includes('self-review') || text.includes('night review')) {
    return 'Write 3 bullets: what went well, what blocked you, what to change.\nRate your day honestly out of 10.\nUse the Review button in the app when 60%+ tasks are done.';
  }
  if (text.includes('water') || text.includes('3l')) {
    return 'Keep a water bottle visible at your desk.\nDrink a full glass right after waking up.\nSet reminders if needed - hydration affects focus directly.';
  }
  if (text.includes('pitch') || text.includes('mock call') || text.includes('discovery')) {
    return 'Practice your one-liner until it flows naturally.\nRecord yourself and listen back.\nFocus on asking questions, not pitching features.';
  }
  if (text.includes('demo') || text.includes('walkthrough')) {
    return 'Keep it under 3 minutes. Show the core value fast.\nStart with the problem, then show the solution.\nEnd with a clear next step (pilot, call, etc).';
  }
  if (text.includes('linkedin') || text.includes('prospect')) {
    return 'Search for Engineering Managers, VPs of Engineering, CTOs.\nFilter by company size: 20-200 engineers.\nLook at their recent posts for personalization hooks.';
  }
  if (text.includes('calendly') || text.includes('slot')) {
    return 'Set up 3-4 time slots across different days.\nKeep meetings to 20-30 min max for discovery calls.\nAdd a brief description of what the call is about.';
  }
  if (text.includes('kavin') || text.includes('sync')) {
    return 'Prepare an agenda before the sync.\nFocus on: blockers, priorities for next 48 hours, demo progress.\nKeep it focused - aim for 30 min max.';
  }
  if (text.includes('competitor') || text.includes('product page')) {
    return 'Check: LinearB, Jellyfish, Sleuth, Swarmia, Haystack.\nNote their pricing, features, and positioning.\nFind gaps where Malveon does something different.';
  }
  if (text.includes('payment') || text.includes('stripe') || text.includes('razorpay')) {
    return 'Razorpay works best for Indian companies. Stripe for international.\nStart simple - just a payment link, no complex integration.\nYou can set this up in under an hour.';
  }
  if (text.includes('pilot') || text.includes('agreement')) {
    return 'Keep it to 1 page. Include: duration (4-8 weeks), price ($99/mo), what they get, success metrics.\nNo complex legal language needed at this stage.';
  }
  if (text.includes('english') || text.includes('practice')) {
    return 'Read one article aloud for 10 min.\nRecord a 2-min voice note explaining Malveon.\nListen to startup podcasts (Y Combinator, First Round Review).';
  }

  return null;
}

// ===================== NOTIFICATION COUNT =====================
function getNotifCount() {
  const saved = localStorage.getItem(NOTIF_COUNT_KEY);
  if (!saved) return 0;
  const data = JSON.parse(saved);
  if (data.date !== todayStr()) { localStorage.removeItem(NOTIF_COUNT_KEY); return 0; }
  return data.count || 0;
}

function incrementNotifCount() {
  const count = getNotifCount() + 1;
  localStorage.setItem(NOTIF_COUNT_KEY, JSON.stringify({ count, date: todayStr() }));
  updateAppBadge(count);
  renderTabs();
}

function clearNotifCount() {
  localStorage.removeItem(NOTIF_COUNT_KEY);
  updateAppBadge(0);
}

function updateAppBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(() => { });
    else navigator.clearAppBadge().catch(() => { });
  }
}

// ===================== CLAUDE NOTES =====================
function loadClaudeNotes() {
  const saved = localStorage.getItem(CLAUDE_NOTES_KEY);
  return saved ? JSON.parse(saved) : [];
}

function submitClaudeNote() {
  const input = document.getElementById('claudeNoteInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const notes = loadClaudeNotes();
  notes.unshift({ date: dateStr, time: timeStr, text });
  localStorage.setItem(CLAUDE_NOTES_KEY, JSON.stringify(notes));
  input.value = '';
  const status = document.getElementById('claudeNoteStatus');
  if (status) { status.style.display = 'block'; setTimeout(() => status.style.display = 'none', 2500); }
  renderClaudeNotesList();
}

function deleteClaudeNote(index) {
  const notes = loadClaudeNotes();
  notes.splice(index, 1);
  localStorage.setItem(CLAUDE_NOTES_KEY, JSON.stringify(notes));
  renderClaudeNotesList();
}

// ===================== REMINDER SOUND =====================
const DEFAULT_SOUND_SETTINGS = { enabled: true, volume: 70, type: 'chime' };

function loadSoundSettings() {
  const saved = localStorage.getItem(SOUND_SETTINGS_KEY);
  if (!saved) return { ...DEFAULT_SOUND_SETTINGS };
  return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(saved) };
}

function saveSoundSettings(s) {
  localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(s));
}

function updateSoundSetting(key, value) {
  const s = loadSoundSettings();
  s[key] = value;
  saveSoundSettings(s);
}

function playReminderSound(type) {
  const s = loadSoundSettings();
  if (!s.enabled) return;
  const soundType = type || s.type;
  const vol = Math.max(0, Math.min(1, (s.volume || 70) / 100));
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const schedule = (freq, startOffset, duration, waveType, peak) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = waveType || 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * peak, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    };

    if (soundType === 'chime') {
      // Three descending bell notes: warm and clear
      schedule(1047, 0.00, 0.55, 'sine', 0.40);  // C6
      schedule(880, 0.28, 0.55, 'sine', 0.35);  // A5
      schedule(698, 0.56, 0.70, 'sine', 0.30);  // F5
      setTimeout(() => ctx.close(), 2000);

    } else if (soundType === 'pulse') {
      // Short sharp triple pulse: urgent, cuts through noise
      schedule(1000, 0.00, 0.12, 'square', 0.18);
      schedule(1000, 0.18, 0.12, 'square', 0.18);
      schedule(1000, 0.36, 0.12, 'square', 0.18);
      setTimeout(() => ctx.close(), 1500);

    } else if (soundType === 'gentle') {
      // Single slow fade sine: minimal, barely-there nudge
      schedule(528, 0.00, 0.90, 'sine', 0.28);
      setTimeout(() => ctx.close(), 2000);
    }
  } catch (e) { /* silent fail if AudioContext is unavailable */ }
}

function testReminderSound() {
  playReminderSound(loadSoundSettings().type);
}

function renderSoundSettings() {
  const s = loadSoundSettings();
  return `
      <div class="sound-divider"></div>
      <div class="sound-section-label">Reminder Sound</div>
      <div class="reminder-row sound-toggle-row">
        <div class="reminder-label">Sound On<small>Play a tone when reminders fire</small></div>
        <label class="toggle-switch">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="updateSoundSetting('enabled', this.checked); renderSync()">
          <span class="toggle-slider"></span>
        </label>
      </div>
      ${s.enabled ? `
      <div class="reminder-row">
        <div class="reminder-label">Volume<small>${s.volume}%</small></div>
        <input type="range" class="sound-volume-slider" min="10" max="100" step="5" value="${s.volume}"
          oninput="this.previousElementSibling.querySelector('small').textContent = this.value + '%'"
          onchange="updateSoundSetting('volume', parseInt(this.value))">
      </div>
      <div class="reminder-row">
        <div class="reminder-label">Sound Type<small>Choose your alert tone</small></div>
        <select class="sound-type-select" onchange="updateSoundSetting('type', this.value)">
          <option value="chime"  ${s.type === 'chime' ? 'selected' : ''}>Chime</option>
          <option value="pulse"  ${s.type === 'pulse' ? 'selected' : ''}>Pulse</option>
          <option value="gentle" ${s.type === 'gentle' ? 'selected' : ''}>Gentle</option>
        </select>
      </div>
      <button class="sync-btn tertiary" style="margin-top:8px;width:100%" onclick="testReminderSound()">Test Sound</button>
      ` : ''}`;
}

function renderClaudeNotesList() {
  const el = document.getElementById('claudeNotesList');
  if (!el) return;
  const notes = loadClaudeNotes();
  if (notes.length === 0) {
    el.innerHTML = '<p class="claude-notes-empty">No messages yet. Claude will read anything you write here.</p>';
    return;
  }
  el.innerHTML = notes.map((n, i) => `
        <div class="claude-note-item">
          <div class="claude-note-meta">${n.date} ${n.time}</div>
          <div class="claude-note-text">${esc(n.text)}</div>
          <button class="claude-note-delete" onclick="deleteClaudeNote(${i})" title="Delete">✕</button>
        </div>`).join('');
}

async function requestNotifPermission() {
  if (!('Notification' in window)) {
    alert('Notifications are not supported in this browser.');
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    showNotification('Malveon Tasks', 'Notifications enabled! You will now get reminders for tasks where you set "Remind me at" times.');
    renderSync(); // refresh to show settings
  } else {
    alert('Notification permission was denied. You can change this in your browser settings.');
  }
}

function showNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const options = {
    body: body,
    icon: './malveon-icon-192.png',
    badge: './malveon-icon-192.png',
    tag: 'malveon-' + Date.now(),
    requireInteraction: false
  };

  // Primary: use ServiceWorker registration (works on mobile PWAs)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(title, options);
    }).catch(() => {
      // Fallback: direct Notification (desktop only)
      try { new Notification(title, options); } catch (e) { /* silent */ }
    });
  } else {
    // No service worker support: try direct Notification
    try { new Notification(title, options); } catch (e) { /* silent */ }
  }
}

function testNotification() {
  showNotification('Malveon Tasks - Test', 'Notifications are working! You will get reminders at your scheduled times.');
  showSyncStatus('testNotifStatus');
}

let reminderInterval = null;
let lastFiredMinute = '';

function startReminderChecker() {
  if (reminderInterval) clearInterval(reminderInterval);
  // Check every 30 seconds
  reminderInterval = setInterval(checkReminders, 30000);
  // Also check immediately
  checkReminders();
}

function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  // Prevent firing same minute twice
  if (currentTime === lastFiredMinute) return;

  let firedAny = false;

  // Check per-task reminders (today + daily habits)
  const todayTasks = tasks.filter(t => (t.cat === 'today' || t.cat === 'daily-habits') && !t.done && t.reminderTime);
  for (const t of todayTasks) {
    if (t.reminderTime === currentTime) {
      showNotification('Task Reminder', t.text);
      if (!firedAny) { playReminderSound(); firedAny = true; incrementNotifCount(); }
      lastFiredMinute = currentTime;
    }
  }
}

// ===================== QUICK CAPTURE =====================
function quickAdd() {
  const input = document.getElementById('quickCaptureInput');
  const text = input.value.trim();
  if (!text) return;
  const cat = activeTab;
  const newTask = {
    id: uid(), text, cat, priority: 'medium', done: false, notes: '',
    daily: cat === 'today', subtasks: [], streak: 0, lastStreakDate: null,
    updatedAt: new Date().toISOString()
  };
  tasks.push(newTask);
  pushTaskToSupabase(newTask);
  save();
  input.value = '';
  renderTabs(); renderTasks(); updateProgress();
}

// ===================== SUBTASK FUNCTIONS =====================
function toggleSubtask(taskId, subIndex) {
  const t = tasks.find(x => x.id === taskId);
  if (!t || !t.subtasks || !t.subtasks[subIndex]) return;
  t.subtasks[subIndex].done = !t.subtasks[subIndex].done;
  t.updatedAt = new Date().toISOString();
  save();
  pushTaskToSupabase(t);
  openTaskDetail(taskId); // refresh detail view
  renderTasks(); // update inline count
}

function addSubtask(taskId) {
  const input = document.getElementById('newSubtaskInput');
  const text = input.value.trim();
  if (!text) return;
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  if (!t.subtasks) t.subtasks = [];
  t.subtasks.push({ id: uid(), text, done: false });
  t.updatedAt = new Date().toISOString();
  save();
  pushTaskToSupabase(t);
  openTaskDetail(taskId); // refresh detail view
  renderTasks();
}

// ===================== PLAYBOOK / RESOURCES =====================
const defaultResources = [
  {
    title: 'Outreach Playbook',
    type: 'outreach-plan',
    pinned: true,
    content: 'Key outreach strategy for Malveon:\n\n1. TARGET: Engineering Managers, VPs Engineering, CTOs at companies with 20-200 engineers\n2. CHANNELS: LinkedIn DMs (primary), cold email (secondary), warm intros (highest conversion)\n3. APPROACH: Lead with the pain point, not the product\n4. CADENCE: 5 new outreach messages per day minimum\n5. FOLLOW-UP: 3-day, 7-day, 14-day sequence\n\nPersonalization hooks:\n- Recent engineering blog posts\n- Open engineering roles (signal of growth)\n- Tech stack mentions\n- Conference talks or podcast appearances\n\nOpener template: "Hey [Name], saw [specific thing]. We are building Malveon to help engineering teams like yours [specific value]. Would love 15 min to show you."'
  },
  {
    title: 'Positioning Guide',
    type: 'positioning',
    pinned: true,
    content: 'MALVEON POSITIONING\n\nOne-liner: "Malveon is the engineering team intelligence platform that turns scattered tool data into clear decisions."\n\nProblem: When engineering teams hit 20+ people, important context gets lost across Slack, Jira, GitHub, and 10+ tools. Decisions vanish in threads. Jira shows green but nothing ships. Incidents take 45+ min to triage.\n\nSolution: Malveon connects your engineering tools and surfaces the context that matters - so teams can make better decisions faster.\n\nKey differentiators:\n- Context layer (not just metrics)\n- Real-time intelligence (not dashboards)\n- Decision support (not surveillance)\n\nNOT: Developer productivity tool, time tracking, code review tool\nIS: Engineering team intelligence platform'
  },
  {
    title: 'Copy-Paste DM Templates',
    type: 'outreach-plan',
    pinned: true,
    content: 'COLD DM TEMPLATES\n\nTemplate 1 - Pain-first:\n"Hey [Name], quick question - when your engineering team hits a production issue, how long does it take to figure out what changed and who knows the context? We are building something to cut that from 45+ min to under 5. Would love your take."\n\nTemplate 2 - Curiosity:\n"Hey [Name], noticed [company] is growing the engineering team. At 20+ engineers, we have seen teams lose track of decisions made in Slack threads. Building Malveon to fix that. Open to a quick chat?"\n\nTemplate 3 - Value offer:\n"Hey [Name], we are offering 5 engineering teams a free pilot of Malveon - connects your existing tools and shows you where context is getting lost. Interested in being one of them?"\n\nFOLLOW-UP (Day 3):\n"Hey [Name], just checking if you caught my last message. Happy to share a 2-min demo video instead if that is easier."'
  },
  {
    title: 'Discovery Call Script',
    type: 'playbook',
    pinned: false,
    content: 'DISCOVERY CALL STRUCTURE (20 min)\n\n1. OPENER (2 min)\n- "Thanks for taking the time. I will keep this to 20 min."\n- "Before I show anything, I would love to understand your setup."\n\n2. QUALIFYING QUESTIONS (8 min)\n- How big is your engineering team?\n- What tools does your team use daily? (Slack, Jira, GitHub, etc.)\n- When there is a production issue, how do you figure out what changed?\n- How do engineering decisions get documented?\n- What is your biggest frustration with your current tooling?\n\n3. DEMO / VALUE PROP (5 min)\n- Map their pain to Malveon features\n- Show 1-2 specific scenarios from their answers\n\n4. NEXT STEPS (5 min)\n- "Would a 4-week pilot make sense?"\n- "We charge $99/month flat during pilot."\n- "What would success look like for you?"'
  },
  {
    title: "This Week's Priorities",
    type: 'reference',
    pinned: true,
    content: 'Update this every Monday with your top 5 priorities for the week.\n\n1. [Priority 1]\n2. [Priority 2]\n3. [Priority 3]\n4. [Priority 4]\n5. [Priority 5]\n\nKey metric to hit this week: ___\nBiggest risk this week: ___'
  },
  {
    title: 'Pilot Agreement Template',
    type: 'reference',
    pinned: false,
    content: 'MALVEON PILOT AGREEMENT\n\nDraft your 1-page pilot agreement here.\n\nInclude:\n- Duration: 4-8 weeks\n- Price: $99/month flat (pilot pricing)\n- What they get: Full Malveon access for their team\n- Success metrics: Agree upfront on what "working" means\n- Data: What data access is needed\n- Support: Direct Slack/email support from founders\n\nKeep it simple - no complex legal language at this stage.'
  }
];

async function seedDefaultResources() {
  if (!currentUser || !sb) return;
  resources = defaultResources.map(r => ({
    id: uuidv4(),
    user_id: currentUser.id,
    title: r.title,
    type: r.type,
    content: r.content || '',
    pinned: r.pinned || false,
    sort_order: 0,
    updated_at: new Date().toISOString()
  }));

  // Push each to Supabase
  for (const r of resources) {
    const { error } = await sb.from('resources').upsert(r, { onConflict: 'id' });
    if (error) console.log('Seed resource error — message:', error.message, '| details:', error.details, '| hint:', error.hint);
  }
  localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources));
}

function renderPlaybook() {
  const el = document.getElementById('playbookSection');
  if (resources.length === 0) {
    el.innerHTML = '<div class="empty">No resources yet. Tap + to add your first playbook resource.</div>';
    return;
  }

  // Sort: pinned first, then by sort_order
  const sorted = [...resources].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  const typeLabels = {
    'outreach-plan': 'Outreach',
    'ops': 'Operations',
    'positioning': 'Positioning',
    'playbook': 'Playbook',
    'reference': 'Reference'
  };

  el.innerHTML = sorted.map(r => `
    <div class="resource-card" onclick="toggleResourceExpand('${r.id}')">
      <div class="resource-card-header">
        ${r.pinned ? '<span class="resource-pin">&#9733;</span>' : ''}
        <span class="resource-card-title">${esc(r.title)}</span>
        <span class="resource-type-badge ${r.type}">${typeLabels[r.type] || r.type}</span>
      </div>
      <div class="resource-content" id="resContent-${r.id}">${esc(r.content || '')}</div>
      <div class="resource-actions" id="resActions-${r.id}" style="display:none">
        <button class="resource-btn-delete" onclick="event.stopPropagation();deleteResource('${r.id}')">Delete</button>
        <button class="resource-btn-edit" onclick="event.stopPropagation();editResource('${r.id}')">Edit</button>
      </div>
    </div>
  `).join('');
}

function toggleResourceExpand(id) {
  const content = document.getElementById('resContent-' + id);
  const actions = document.getElementById('resActions-' + id);
  if (content.classList.contains('open')) {
    content.classList.remove('open');
    actions.style.display = 'none';
  } else {
    content.classList.add('open');
    actions.style.display = 'flex';
  }
}

function openResourceModal() {
  editingResourceId = null;
  document.getElementById('resourceModalTitle').textContent = 'Add Resource';
  document.getElementById('resourceTitleInput').value = '';
  document.getElementById('resourceTypeInput').value = 'reference';
  document.getElementById('resourceContentInput').value = '';
  document.getElementById('resourcePinnedInput').checked = false;
  document.getElementById('resourceModalActions').innerHTML = `
    <button class="btn-cancel" onclick="closeResourceModal()">Cancel</button>
    <button class="btn-save" onclick="saveResource()">Add</button>`;
  document.getElementById('resourceModal').classList.add('open');
}

function editResource(id) {
  const r = resources.find(x => x.id === id);
  if (!r) return;
  editingResourceId = id;
  document.getElementById('resourceModalTitle').textContent = 'Edit Resource';
  document.getElementById('resourceTitleInput').value = r.title;
  document.getElementById('resourceTypeInput').value = r.type;
  document.getElementById('resourceContentInput').value = r.content || '';
  document.getElementById('resourcePinnedInput').checked = r.pinned || false;
  document.getElementById('resourceModalActions').innerHTML = `
    <button class="btn-delete" onclick="deleteResource('${id}');closeResourceModal()">Delete</button>
    <button class="btn-cancel" onclick="closeResourceModal()">Cancel</button>
    <button class="btn-save" onclick="saveResource()">Save</button>`;
  document.getElementById('resourceModal').classList.add('open');
}

function closeResourceModal() {
  document.getElementById('resourceModal').classList.remove('open');
  editingResourceId = null;
}

async function saveResource() {
  const title = document.getElementById('resourceTitleInput').value.trim();
  if (!title) return;
  const type = document.getElementById('resourceTypeInput').value;
  const content = document.getElementById('resourceContentInput').value.trim();
  const pinned = document.getElementById('resourcePinnedInput').checked;

  if (editingResourceId) {
    const r = resources.find(x => x.id === editingResourceId);
    if (r) {
      r.title = title; r.type = type; r.content = content; r.pinned = pinned;
      r.updated_at = new Date().toISOString();
      if (currentUser && sb && navigator.onLine) {
        await sb.from('resources').upsert(r, { onConflict: 'id' });
      } else if (currentUser) {
        queueChange('resources', 'upsert', r);
      }
    }
  } else {
    const newRes = {
      id: uuidv4(),
      user_id: currentUser ? currentUser.id : 'local',
      title, type, content, pinned,
      sort_order: resources.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    resources.push(newRes);
    if (currentUser && sb && navigator.onLine) {
      await sb.from('resources').upsert(newRes, { onConflict: 'id' });
    } else if (currentUser) {
      queueChange('resources', 'upsert', newRes);
    }
  }

  localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources));
  closeResourceModal();
  renderTabs();
  renderPlaybook();
}

async function deleteResource(id) {
  if (!confirm('Delete this resource?')) return;
  resources = resources.filter(r => r.id !== id);
  localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources));
  if (currentUser && sb && navigator.onLine) {
    await sb.from('resources').delete().eq('id', id);
  } else if (currentUser) {
    queueChange('resources', 'delete', { id });
  }
  renderTabs();
  renderPlaybook();
}

document.getElementById('resourceModal').addEventListener('click', function (e) {
  if (e.target === this) closeResourceModal();
});

// ===================== SYNC TAB RENDER =====================
function renderSync() {
  const el = document.getElementById('syncSection');
  if (activeTab !== 'sync') {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';

  const reminders = loadReminderSettings();

  // Determine if we show the Desktop-only Claude integration section.
  // We check for native File Access API support AND ensure the user isn't on a mobile device,
  // because mobile PWAs don't need local workspace folder connections.
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isSmallScreen = window.innerWidth <= 768;
  const hasFsSupport = ('showDirectoryPicker' in window) && !isMobile && !isSmallScreen;

  let html = '';

  // --- CLOUD SYNC & ACCOUNT ---
  const lastSync = localStorage.getItem(STORAGE_KEY + '_lastSync') || 'Never';
  const isOnline = navigator.onLine;

  html += '<div class="sync-group" id="cloudSyncGroup">\n';
  html += '  <div class="sync-section-title">Cloud Sync & Account</div>\n';

  if (currentUser) {
    html += `
    <div class="sync-card">
      <div class="sync-badge${isOnline ? '' : ' offline'}">
        <div class="dot ${isOnline ? 'live' : 'off'}"></div>
        ${isOnline ? 'Live sync active' : 'Offline - will sync when connected'}
      </div>
      <h3>Account</h3>
      <p>Signed-in as <strong>${esc(currentUser.email)}</strong></p>
      <button class="sync-btn tertiary" onclick="signOut()">Sign Out</button>
    </div>`;
  } else {
    html += `
    <div class="sync-card">
      <div class="sync-badge offline">
        <div class="dot off"></div>
        Offline mode - no cross-device sync
      </div>
      <h3>Sign in for Cloud Sync</h3>
      <p>Sync tasks across all devices securely.</p>
      <button class="sync-btn primary" onclick="signOut()">Sign In / Create Account</button>
    </div>`;
  }

  html += `
    <div class="sync-card">
      <div class="sync-stats">
        <div class="sync-stat">
          <div class="sync-stat-label">Last Sync</div>
          <div class="sync-stat-value">${lastSync}</div>
        </div>
        <div class="sync-stat">
          <div class="sync-stat-label">Local Version</div>
          <div class="sync-stat-value">v2.1.0</div>
        </div>
      </div>
    </div>

    <div class="sync-card">
      <h3>Manual Cloud Sync</h3>
      <p>Tasks sync automatically to Supabase. Use this to force a pull from the cloud.</p>
      <button class="sync-btn secondary" onclick="forceSyncNow()" ${!currentUser ? 'disabled style="opacity:0.5"' : ''}>Force Cloud Sync</button>
      <div id="forceSyncStatus" class="sync-status">Synced!</div>
    </div>
  </div>`;

  // --- APP SETTINGS ---
  html += '<div class="sync-group" id="settingsGroup">\n';
  html += '  <div class="sync-section-title">App Settings</div>\n';
  html += `
    <div class="sync-card notif-permission-card">
      <h3>Notifications</h3>
      <p>Enable notifications to receive smart nudges based on your task context, plus scheduled reminders for deep work blocks and night review.</p>
      <button class="sync-btn secondary" onclick="requestNotifPermission()" style="margin-bottom:8px">Enable Notifications</button><br>
      <button class="sync-btn tertiary" onclick="testNotification()">Test Notification</button>
      <div id="testNotifStatus" class="sync-status">Test sent! Check your device.</div>
    </div>`;

  if ('Notification' in window && Notification.permission === 'granted') {
    html += `
    <div class="sync-card">
      <h3>Active Task Reminders</h3>
      <p style="margin-bottom:12px; font-size: 13px; color: var(--text-muted)">You can set custom reminder times for any task by using the <strong>Remind me at</strong> input when creating or editing a task. Perfect for scheduling specific meetings or time blocks.</p>
      ${renderSoundSettings()}
    </div>`;
  }

  html += `
    <div class="sync-card">
      <h3>Remove Duplicates</h3>
      <p>Finds tasks with the same name and removes the extra copies. Keeps completed tasks over pending ones.</p>
      <button class="sync-btn remove" onclick="removeDuplicateTasks()">Remove Duplicates</button>
      <div id="dedupeStatus" class="sync-status"></div>
    </div>
    <div class="sync-card">
      <h3>Clear Default Tasks</h3>
      <p>Removes the original sample tasks that were loaded when you first opened the app. Use this if you have too many tasks from the initial setup.</p>
      <button class="sync-btn remove" onclick="clearDefaultTasks()">Clear Default Tasks</button>
      <div id="clearDefaultStatus" class="sync-status"></div>
    </div>
    <div class="sync-card">
      <h3>Force Sync with TASKS.md</h3>
      <p>Wipes all local tasks (and cloud) and cleanly re-imports exactly what is currently written in your TASKS.md file. Fixes zombie tasks.</p>
      <button class="sync-btn remove" onclick="forceSyncTasks()">Force Sync</button>
      <div id="forceSyncStatus" class="sync-status"></div>
    </div>`;

  html += '</div>';

  // --- MESSAGES TO CLAUDE ---
  const claudeNotes = loadClaudeNotes();
  html += '<div class="sync-group" id="claudeNotesGroup">';
  html += '  <div class="sync-section-title">Messages to Claude</div>';
  html += `
    <div class="sync-card claude-notes-card">
      <h3>Write to Claude</h3>
      <p class="claude-notes-hint">Inform Claude, leave a reminder, or update context. Claude reads this at the start of every session.</p>
      <textarea id="claudeNoteInput" class="claude-note-input" rows="3" placeholder="e.g. Kavin said demo will be ready March 25&#10;e.g. I feel low energy today, keep DW1 light&#10;e.g. Remind me to update the pitch before Saturday sync"></textarea>
      <button class="sync-btn primary claude-note-submit" onclick="submitClaudeNote()">Save Message</button>
      <div id="claudeNoteStatus" class="sync-status" style="display:none">Saved. Claude will read this next session.</div>
      <div id="claudeNotesList" class="claude-notes-list"></div>
    </div>`;
  html += '</div>';

  // --- DESKTOP INTEGRATION ---
  html += `<div class="sync-group" id="desktopSyncGroup" style="${hasFsSupport ? '' : 'display: none;'}">`;
  html += '  <div class="sync-section-title">Desktop Integration (Claude)</div>\n';

  if (workspaceDirHandle) {
    html += `
    <div class="sync-card workspace-card connected">
      <h3>✅ Workspace Connected</h3>
      <p>Auto-syncing with <strong>${esc(workspaceDirHandle.name)}</strong> every 5 mins. New tasks added there will appear here.</p>
      <button class="sync-btn secondary" onclick="manualSyncFromWorkspace()">Sync Now</button>
      <div id="workspaceStatus" class="sync-status" style="margin-top:12px;"></div>
    </div>`;
  } else {
    html += `
    <div class="sync-card workspace-card">
      <h3>Workspace Folder Auto-Sync</h3>
      <p>Connect your local Malveon folder on your desktop. The app will auto-import any new tasks added to TASKS.md every 5 mins.</p>
      <button class="sync-btn primary" onclick="connectWorkspaceFolder()">Connect Folder</button>
      <div id="workspaceStatus" class="sync-status" style="margin-top:12px;"></div>
    </div>`;
  }

  html += `
    <div class="sync-card">
      <h3>Import TASKS.md</h3>
      <p>Prefer manual? Select a TASKS.md file to import tasks.</p>
      <button class="sync-btn secondary" onclick="document.getElementById('importFileInput').click()">Select File</button>
      <input type="file" id="importFileInput" accept=".md" style="display:none" onchange="handleImportFile(event)">
      <div id="importStatus" class="sync-status">Tasks imported!</div>
    </div>

    <div class="sync-card">
      <h3>Export as Markdown</h3>
      <p>Download your current state as markdown files.</p>
      <button class="sync-btn secondary" style="margin-bottom:8px" onclick="downloadTasksMd()">Download TASKS.md</button><br>
      <button class="sync-btn tertiary" onclick="downloadDailyLog()">Download daily-log.md</button>
      <div id="syncStatus" class="sync-status">Files exported!</div>
    </div>

    <div class="sync-card">
      <h3>Claude Auto-Sync (2-way)</h3>
      <p>Tasks sync to Supabase in real-time. Copy commands below to give Claude direct read + write access.</p>
      ${currentUser ? `
        <button class="sync-btn primary" onclick="copyClaudeApiUrl()">Copy Full API Commands</button>
        <div class="sync-status" id="claudeApiStatus">Commands copied! Paste into Claude.</div>
        <pre id="claudeApiSnippet" style="display:none;margin-top:10px;font-size:10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;white-space:pre-wrap;word-break:break-all;color:var(--text-dim);text-align:left"></pre>
        <button class="sync-btn secondary" style="margin-top:8px" onclick="copyClaudeSnapshot()">Copy Snapshot (offline)</button>
        <div class="sync-status" id="claudeSnapStatus">Snapshot copied!</div>
        <p style="margin-top:8px;font-size:12px;color:var(--green)">Token tied to your session — refresh if Claude says 401.</p>
      ` : `<p style="color:var(--text-dim)">Sign in to enable Claude API sync.</p>`}
    </div>

    <div class="sync-card" style="text-align:left">
      <h3>How Sync Works</h3>
      <p style="text-align:left;line-height:1.6">
        ${currentUser ? '<strong style="color:var(--green)">Device sync:</strong> Tasks sync automatically across all your devices via Supabase Realtime.<br><br>' : ''}
        <strong style="color:var(--accent)">Claude 2-way API sync:</strong><br>
        1. Tap "Copy Full API Commands" above<br>
        2. Paste into Claude — it gets READ + WRITE + ADD commands<br>
        3. Claude can now read tasks live and push changes back directly<br>
        4. Token expires with your session — re-copy if Claude gets a 401<br><br>
        <strong style="color:var(--text-dim)">Manual sync (legacy):</strong><br>
        Download files and save to OneDrive folder for Claude to read
      </p>
    </div>
  </div>`; // end desktopSyncGroup

  el.innerHTML = html;
  renderClaudeNotesList();
}

// ===================== IMPORT FROM TASKS.MD =====================
function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const content = e.target.result;
    const parsed = parseTasksMd(content);

    if (parsed.length === 0) {
      alert('No tasks found in the file. Make sure it uses the standard TASKS.md format.');
      return;
    }

    // Count new vs existing
    // normalize strips bold markers AND leftover | remind:HH:MM so re-importing doesn't create duplicates
    const normalize = s => s.replace(/\*+/g, '').replace(/\|\s*remind:\s*\d{1,2}:\d{2}/gi, '').toLowerCase().trim();
    const existingTexts = tasks.map(t => normalize(t.text));
    const newTasks = parsed.filter(p => !existingTexts.includes(normalize(p.text)) && !deletedTaskTexts.has(normalize(p.text)));
    const existing = parsed.length - newTasks.length;

    if (newTasks.length === 0) {
      alert(`Found ${parsed.length} tasks, but all ${existing} already exist in your app.`);
      return;
    }

    if (!confirm(`Found ${parsed.length} tasks. ${newTasks.length} new, ${existing} already exist.\n\nImport ${newTasks.length} new tasks?`)) return;

    // Import new tasks
    newTasks.forEach(p => {
      const newTask = {
        id: uid(), text: p.text, cat: p.cat, priority: p.priority,
        done: p.done, notes: '', daily: p.daily,
        reminderTime: p.reminderTime || null,
        subtasks: [], streak: 0, lastStreakDate: null,
        updatedAt: new Date().toISOString()
      };
      tasks.push(newTask);
      pushTaskToSupabase(newTask);
    });

    save();
    renderTabs();
    renderView();
    updateProgress();
    showSyncStatus('importStatus');
  };
  reader.readAsText(file);
  // Reset input so same file can be selected again
  event.target.value = '';
}

function parseTasksMd(content) {
  const parsed = [];
  let currentCat = 'today';
  const catMap = {
    'today': 'today',
    'daily habits': 'daily-habits',
    'this week': 'this-week',
    'before pilot': 'before-pilot',
    'before first pilot': 'before-pilot',
    'waiting': 'waiting',
    'waiting on': 'waiting',
    'someday': 'someday',
    'done': 'done'
  };

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed.startsWith('## ')) {
      const header = trimmed.replace(/^## /, '').replace(/ \(.*\)/, '').toLowerCase().trim();
      if (catMap[header]) currentCat = catMap[header];
      continue;
    }

    // Parse task lines
    const todoMatch = trimmed.match(/^- \[([ x])\]\s+(.+?)\s*$/);
    if (todoMatch) {
      const isDone = todoMatch[1] === 'x';
      let text = todoMatch[2].replace(/^\*{1,2}|\*{1,2}$/g, '').replace(/^~~|~~$/g, '').trim();
      // Remove trailing date like (2026-03-06)
      text = text.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '').trim();

      // Extract markers
      let priority = 'medium';
      let daily = false;

      // Legacy/standard format
      if (text.includes('[HIGH]')) { priority = 'high'; text = text.replace('[HIGH]', '').trim(); }
      if (text.includes('[DAILY]')) { daily = true; text = text.replace('[DAILY]', '').trim(); }

      // Claude-generated table/pipe format matching: "| priority:high" or "| daily:true"
      const prioMatch = text.match(/\|\s*priority:\s*(low|medium|high)/i);
      if (prioMatch) {
        priority = prioMatch[1].toLowerCase();
        text = text.replace(prioMatch[0], '').trim();
      }

      const dailyMatch = text.match(/\|\s*daily:\s*(true|false)/i);
      if (dailyMatch) {
        daily = dailyMatch[1].toLowerCase() === 'true';
        text = text.replace(dailyMatch[0], '').trim();
      }

      // Extract reminder time (| remind:HH:MM) — must strip this before cleanup
      let reminderTime = null;
      const remindMatch = text.match(/\|\s*remind:\s*(\d{1,2}:\d{2})/i);
      if (remindMatch) {
        reminderTime = remindMatch[1];
        text = text.replace(remindMatch[0], '').trim();
      }

      // Cleanup trailing pipes that might get left behind
      text = text.replace(/\|\s*$/, '').trim();

      // Remove notes after --
      const notesSplit = text.split(' -- ');
      text = notesSplit[0].trim();

      // Clean up any trailing/leading markdown markers exposed after tags were removed
      text = text.replace(/^\*{1,2}|\*{1,2}$/g, '').replace(/^~~|~~$/g, '').trim();

      if (text) {
        parsed.push({ text, cat: currentCat, priority, done: isDone, daily, reminderTime });
      }
    }
  }
  return parsed;
}

// ===================== WORKSPACE AUTO-SYNC (File System Access API) =====================
let workspaceDirHandle = null;
let autoImportInterval = null;

// IndexedDB helpers for storing the directory handle across sessions
function openFsDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('malveon-fs', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

async function saveDirHandle(handle) {
  const db = await openFsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'workspace');
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function loadDirHandle() {
  try {
    const db = await openFsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('workspace');
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
  } catch (e) { return null; }
}

async function connectWorkspaceFolder() {
  if (!('showDirectoryPicker' in window)) {
    alert('Auto-sync requires Chrome or Edge on desktop. On mobile, use the "Import from TASKS.md" button instead.');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await saveDirHandle(handle);
    workspaceDirHandle = handle;
    const count = await autoImportFromWorkspace(handle);
    startAutoImport();
    renderSync();
    const statusEl = document.getElementById('workspaceStatus');
    if (statusEl) {
      statusEl.textContent = count > 0 ? `Connected! ${count} new tasks imported.` : 'Connected! Up to date.';
      statusEl.style.display = 'block';
      setTimeout(() => statusEl.style.display = 'none', 4000);
    }
  } catch (e) {
    if (e.name !== 'AbortError') alert('Could not connect to folder: ' + e.message);
  }
}

async function autoImportFromWorkspace(handle) {
  try {
    const fileHandle = await handle.getFileHandle('TASKS.md');
    const file = await fileHandle.getFile();
    const content = await file.text();
    const parsed = parseTasksMd(content);
    if (parsed.length === 0) return 0;

    // Normalize text: strip bold markers AND leftover | remind:HH:MM so re-importing won't create duplicates
    const normalize = s => s.replace(/\*+/g, '').replace(/\|\s*remind:\s*\d{1,2}:\d{2}/gi, '').toLowerCase().trim();

    // Map existing tasks by normalized text
    const existingTextsMap = {};
    tasks.forEach(t => existingTextsMap[normalize(t.text)] = t);

    let newCount = 0;
    let upCount = 0;

    parsed.forEach(p => {
      const normText = normalize(p.text);
      if (deletedTaskTexts.has(normText) || p.cat === 'done') return;

      const existingTask = existingTextsMap[normText];
      if (existingTask) {
        // Sync properties if they drift (e.g., categories changed in TASKS.md)
        let changed = false;
        if (existingTask.cat !== p.cat) { existingTask.cat = p.cat; changed = true; }
        if (existingTask.priority !== p.priority) { existingTask.priority = p.priority; changed = true; }
        if (existingTask.daily !== p.daily) { existingTask.daily = p.daily; changed = true; }
        if (existingTask.reminderTime !== p.reminderTime) { existingTask.reminderTime = p.reminderTime; changed = true; }

        if (changed) {
          existingTask.updatedAt = new Date().toISOString();
          pushTaskToSupabase(existingTask);
          upCount++;
        }
      } else {
        // Create genuinely new task
        const newTask = {
          id: uid(), text: p.text, cat: p.cat, priority: p.priority,
          done: false, notes: '', daily: p.daily,
          reminderTime: p.reminderTime || null,
          subtasks: [], streak: 0, lastStreakDate: null,
          updatedAt: new Date().toISOString()
        };
        tasks.push(newTask);
        pushTaskToSupabase(newTask);
        newCount++;
      }
    });

    if (newCount > 0 || upCount > 0) {
      save(); renderTabs(); renderView(); updateProgress();
    }
    return newCount + upCount;
  } catch (e) {
    console.log('Auto-import error:', e.message);
    return 0;
  }
}

async function autoImportPlaybookResources(workspaceDirHandle) {
  if (!workspaceDirHandle) return 0;
  const foldersToSync = ['ops', 'outreach'];
  let newCount = 0;

  for (const folderName of foldersToSync) {
    try {
      const folderHandle = await workspaceDirHandle.getDirectoryHandle(folderName);
      for await (const entry of folderHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
          try {
            const fileHandle = await folderHandle.getFileHandle(entry.name);
            const file = await fileHandle.getFile();
            const content = await file.text();

            const title = entry.name.replace('.md', '').replace(/-/g, ' ');
            const resTitle = title.charAt(0).toUpperCase() + title.slice(1);
            const resType = folderName === 'outreach' ? 'outreach-plan' : 'ops';

            const existingIdx = resources.findIndex(r => r.title === resTitle && r.type === resType);
            if (existingIdx >= 0) {
              // Update if content changed
              if (resources[existingIdx].content !== content) {
                resources[existingIdx].content = content;
                resources[existingIdx].updated_at = new Date().toISOString();
                if (currentUser && sb && navigator.onLine) {
                  await sb.from('resources').upsert(resources[existingIdx], { onConflict: 'id' });
                }
              }
            } else {
              // Create new resource
              const newRes = {
                id: uuidv4(),
                user_id: currentUser ? currentUser.id : 'local',
                title: resTitle,
                type: resType,
                content: content,
                pinned: false,
                sort_order: resources.length,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              resources.push(newRes);
              if (currentUser && sb && navigator.onLine) {
                await sb.from('resources').upsert(newRes, { onConflict: 'id' });
              }
              newCount++;
            }
          } catch (err) {
            console.log('Error reading playbook file:', entry.name, err);
          }
        }
      }
    } catch (err) {
      // Folder doesn't exist or no permission, ignore silently
    }
  }

  if (newCount > 0) {
    localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources));
    if (activeTab === 'playbook') renderPlaybook();
  }
  return newCount;
}

function startAutoImport() {
  if (autoImportInterval) clearInterval(autoImportInterval);
  autoImportInterval = setInterval(async () => {
    if (!workspaceDirHandle) return;
    const perm = await workspaceDirHandle.queryPermission({ mode: 'read' });
    if (perm === 'granted') {
      await autoImportFromWorkspace(workspaceDirHandle);
      await autoImportPlaybookResources(workspaceDirHandle);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

async function manualSyncFromWorkspace() {
  if (!workspaceDirHandle) { await connectWorkspaceFolder(); return; }
  try {
    let perm = await workspaceDirHandle.queryPermission({ mode: 'read' });
    if (perm === 'prompt') perm = await workspaceDirHandle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') { alert('Permission denied. Please reconnect the folder.'); return; }
    const count = await autoImportFromWorkspace(workspaceDirHandle);
    const resCount = await autoImportPlaybookResources(workspaceDirHandle);
    const statusEl = document.getElementById('workspaceStatus');
    if (statusEl) {
      statusEl.textContent = (count > 0 || resCount > 0) ? `${count} new tasks, ${resCount} new resources imported!` : 'Up to date - no new items.';
      statusEl.style.display = 'block';
      setTimeout(() => statusEl.style.display = 'none', 3000);
    }
    renderSync();
  } catch (e) { alert('Sync failed: ' + e.message); }
}

function removeDuplicateTasks() {
  const seen = new Map();
  const toDelete = [];

  // Group by normalized text (lowercase, trimmed)
  tasks.forEach(t => {
    const key = t.text.toLowerCase().trim();
    if (seen.has(key)) {
      // Keep the one that is done, or the earlier one — delete this one
      const existing = seen.get(key);
      if (!existing.done && t.done) {
        // This one is done, swap — delete the existing one instead
        toDelete.push(existing.id);
        seen.set(key, t);
      } else {
        toDelete.push(t.id);
      }
    } else {
      seen.set(key, t);
    }
  });

  if (toDelete.length === 0) {
    alert('No duplicates found. All tasks have unique names.');
    return;
  }

  if (!confirm(`Found ${toDelete.length} duplicate task${toDelete.length > 1 ? 's' : ''}. Remove them?`)) return;

  toDelete.forEach(id => {
    tasks = tasks.filter(t => t.id !== id);
    deleteTaskFromSupabase(id);
  });

  save(); renderTabs(); renderView(); updateProgress();

  const statusEl = document.getElementById('dedupeStatus');
  if (statusEl) {
    statusEl.textContent = `Removed ${toDelete.length} duplicate${toDelete.length > 1 ? 's' : ''}.`;
    statusEl.style.display = 'block';
    setTimeout(() => statusEl.style.display = 'none', 3000);
  }
}

function clearDefaultTasks() {
  // Default task texts from the original seed — used to identify and remove them
  const defaultTexts = new Set(defaultTasks.map(t => t.text.toLowerCase().trim()));
  const toDelete = tasks.filter(t => defaultTexts.has(t.text.toLowerCase().trim()));

  if (toDelete.length === 0) {
    alert('No default sample tasks found. Your tasks are already clean.');
    return;
  }

  if (!confirm(`Found ${toDelete.length} original sample task${toDelete.length > 1 ? 's' : ''} from the initial setup. Remove them?\n\nYour TASKS.md tasks will stay.`)) return;

  toDelete.forEach(t => {
    // Add to deleted list first so auto-import ignores them
    const normalize = s => s.replace(/\*+/g, '').replace(/\|\s*remind:\s*\d{1,2}:\d{2}/gi, '').toLowerCase().trim();
    deletedTaskTexts.add(normalize(t.text));
    localStorage.setItem(DELETED_TASKS_KEY, JSON.stringify(Array.from(deletedTaskTexts)));

    tasks = tasks.filter(x => x.id !== t.id);
    deleteTaskFromSupabase(t.id);
  });

  save(); renderTabs(); renderView(); updateProgress();

  const statusEl = document.getElementById('clearDefaultStatus');
  if (statusEl) {
    statusEl.textContent = `Removed ${toDelete.length} default task${toDelete.length > 1 ? 's' : ''}.`;
    statusEl.style.display = 'block';
    setTimeout(() => statusEl.style.display = 'none', 4000);
  }
}

async function forceSyncTasks() {
  if (!confirm('This will wipe all current tasks from the app and the cloud, then re-import them directly from TASKS.md.\n\nAre you sure you want to force sync?')) return;

  const statusEl = document.getElementById('forceSyncStatus');
  if (statusEl) {
    statusEl.textContent = 'Wiping tasks...';
    statusEl.style.display = 'block';
  }

  // Clear local arrays and storage first
  tasks = [];
  deletedTaskTexts.clear();
  localStorage.removeItem(DELETED_TASKS_KEY);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(QUEUE_KEY);

  // Wipe from Supabase
  if (currentUser && sb && navigator.onLine) {
    try {
      const { data, error } = await sb.from('tasks').select('id').eq('user_id', currentUser.id);
      if (!error && data) {
        for (const t of data) {
          await sb.from('tasks').delete().eq('id', t.id);
        }
      }
    } catch (e) { console.log('Wipe error', e); }
  }

  save(); // Save the empty state
  renderTabs(); renderView(); updateProgress();

  if (workspaceDirHandle) {
    if (statusEl) statusEl.textContent = 'Re-importing from TASKS.md...';
    await autoImportFromWorkspace(workspaceDirHandle);
    if (statusEl) {
      statusEl.textContent = 'Sync complete! Loaded tasks from file.';
      setTimeout(() => statusEl.style.display = 'none', 4000);
    }
  } else {
    alert('Tasks wiped. Please click "Connect Folder" above to re-import your TASKS.md file.');
    if (statusEl) statusEl.style.display = 'none';
  }
}

async function disconnectWorkspace() {
  workspaceDirHandle = null;
  if (autoImportInterval) { clearInterval(autoImportInterval); autoImportInterval = null; }
  const db = await openFsDb();
  const tx = db.transaction('handles', 'readwrite');
  tx.objectStore('handles').delete('workspace');
  renderSync();
}

async function initWorkspaceSync() {
  if (!('showDirectoryPicker' in window)) return;
  try {
    const handle = await loadDirHandle();
    if (!handle) return;
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'granted') {
      workspaceDirHandle = handle;
      startAutoImport();
      // Silent import on load
      await autoImportFromWorkspace(handle);
      await autoImportPlaybookResources(handle);
    } else if (perm === 'prompt') {
      workspaceDirHandle = handle; // store but don't auto-prompt
    }
  } catch (e) { console.log('Workspace sync init:', e.message); }
}

// ===================== PWA INSTALL =====================
// Install prompts removed - app installs via browser native prompt only

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => {
    console.log('Malveon Tasks SW registered');
  }).catch(err => console.log('SW registration failed:', err));
}

// ===================== START =====================
startApp();
