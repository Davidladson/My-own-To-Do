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
const COMPLIANCE_KEY = 'malveon_compliance';
const OKR_KEY = 'malveon_weekly_okr';
const FOCUS_KEY = 'malveon_focus_sessions';
const NAV_KEY = 'malveon_nav_section';
const DELEGATIONS_KEY = 'malveon_delegations';

// Supabase client
let sb = null;
let currentUser = null;
let lastAutoSync = null;
let modalDependencies = []; // Track dependencies in the active modal
let realtimeChannel = null;
let isSyncing = false;
let deletedTaskTexts = new Set();
let workspaceDirHandle = null;

// V2 Focus state
let activeFocusTaskId = null;
let focusInterval = null;
let timerSeconds = 0;

// V2 in-memory state
let prospects = [];
let pilots = [];
let insights = [];
let decisions = [];
let delegations = [];
let recurringTasks = [];

// V3 Data arrays
let outreach_logs = [];
let expenses = [];
let milestones = [];

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
  // Today — non-daily (specific tasks for the current work cycle)
  { id: uid(), text: "DW1 - Demo script first draft (06:40-07:30)", cat: "today", priority: "high", done: false, daily: false, reminderTime: "06:40", notes: "Open a doc. Write the 3 screens (~500 words). Do not stop to edit. Ugly draft is the goal. This is the ONE THING this week." },
  { id: uid(), text: "English practice - walk to college (60-sec pitch)", cat: "today", priority: "high", done: false, daily: false, reminderTime: "08:25", notes: "Monday: Speak the Malveon pitch out loud, continuously, the entire walk. No notes." },
  { id: uid(), text: "Cyber lab - approve outreach drafts (13:10-13:25)", cat: "today", priority: "high", done: false, daily: false, reminderTime: "13:10", notes: "15 min only. Open LinkedIn. Review the 5 messages drafted by morning task. Approve, tweak names/companies, hit send. Update tracker. Done." },
  { id: uid(), text: "Cyber lab - demo script (13:25-15:50)", cat: "today", priority: "high", done: false, daily: false, reminderTime: "13:25", notes: "~2 hours. Continue from DW1 draft. 3 screens: (1) Incident view - all context in one place, (2) Decision trail - what was decided and why, (3) Team pulse - who owns what. ~500 words total. Do not design. Just write what each screen shows and why it matters to an EM." },
  { id: uid(), text: "Follow up all warm leads", cat: "today", priority: "high", done: false, daily: true, reminderTime: "13:15", notes: "Check Outreach Tracker for Status = Warm. If 24+ hours without reply, send follow-up." },
  { id: uid(), text: "Reply to 3 X posts", cat: "today", priority: "medium", done: false, daily: true, reminderTime: "18:00", notes: "Search: \"Jira doesn't reflect reality\" OR \"engineering tool fatigue\". Reply to 3 posts with 5+ likes." },
  { id: uid(), text: "Flex Work - Kavin sync + outreach follow-ups (19:00-20:00)", cat: "today", priority: "high", done: false, daily: false, reminderTime: "19:00", notes: "Sync with Kavin: demo script status, build date. Review any LinkedIn replies. Log outreach tracker." },
  { id: uid(), text: "Night review - 3 bullets + score /10", cat: "today", priority: "high", done: false, daily: true, reminderTime: "21:30", notes: "WIN, LEARNING, TOMORROW. Send Kavin accountability ping." },

  // Daily Habits
  { id: uid(), text: "Wake ritual - no phone first 15 min", cat: "daily-habits", priority: "high", done: false, daily: true, reminderTime: "06:30", notes: "Sit up immediately. Phone stays face down. Say one sentence: \"Today I will [intention word].\"" },
  { id: uid(), text: "5 min morning stretch", cat: "daily-habits", priority: "medium", done: false, daily: true, reminderTime: "06:32", notes: "Neck rolls, shoulder rolls, spinal twist, quad stretch, wrist circles. No mat needed." },
  { id: uid(), text: "Write 3 gratitude lines", cat: "daily-habits", priority: "medium", done: false, daily: true, reminderTime: "06:38", notes: "3 SPECIFIC things. Not \"family.\" Something like: \"Kavin built the auth module without being asked.\"" },
  { id: uid(), text: "Morning intention - write ONE word", cat: "daily-habits", priority: "medium", done: false, daily: true, reminderTime: "06:40", notes: "Examples: \"sharp\", \"bold\", \"steady\", \"fast\", \"calm\". Keep visible during morning work." },
  { id: uid(), text: "Eat protein breakfast", cat: "daily-habits", priority: "high", done: false, daily: true, reminderTime: "07:30", notes: "2+ eggs or protein option from mess. Eat in under 10 min. 1 glass water." },
  { id: uid(), text: "English practice - college walk (10 min)", cat: "daily-habits", priority: "high", done: false, daily: true, reminderTime: "08:25", notes: "Speak OUT LOUD continuously during walk. Mon: 60-sec pitch. Tue: Explain yesterday. Wed: Describe Malveon. Thu: Customer pain. Fri: Week summary." },
  { id: uid(), text: "Eat lunch at college mess", cat: "daily-habits", priority: "high", done: false, daily: true, reminderTime: "12:30", notes: "Do not skip because you are in flow. Back at cyber lab by 13:10." },
  { id: uid(), text: "Drink water - 8 glasses across the day", cat: "daily-habits", priority: "medium", done: false, daily: true, reminderTime: "06:00", notes: "Set 8 alarms: 06:00, 08:00, 10:30, 12:30, 15:00, 17:00, 19:30, 22:00." },
  { id: uid(), text: "30 min exercise", cat: "daily-habits", priority: "high", done: false, daily: true, reminderTime: "17:15", notes: "HIGH: 30 min run. MEDIUM: Push-ups, squats, plank, jumping jacks. LOW: 30 min walk." },
  { id: uid(), text: "English practice - evening (30 min)", cat: "daily-habits", priority: "high", done: false, daily: true, reminderTime: "20:15", notes: "Mon/Wed: Record pitching 5 min, play back. Tue/Thu: Explain a technical decision. Fri: 3-min week update." },
  { id: uid(), text: "Dinner before 20:15", cat: "daily-habits", priority: "high", done: false, daily: true, reminderTime: "19:35", notes: "Stop work at 19:30. Full meal." },
  { id: uid(), text: "Read 10 pages", cat: "daily-habits", priority: "medium", done: false, daily: true, reminderTime: "22:00", notes: "Book on desk, not phone. Current: The Mom Test." },
  { id: uid(), text: "Sleep by 23:00", cat: "daily-habits", priority: "high", done: false, daily: true, reminderTime: "22:30", notes: "22:30 stop screens. Phone across room. Lights off 23:00." },

  // This Week (Mar 23 - Mar 29)
  { id: uid(), text: "Write Malveon demo script", cat: "this-week", priority: "high", done: false, daily: false, notes: "3 screens, ~500 words, 5-min demo. Share with Kavin by Tuesday 8pm. This is the ONE THING for the week." },
  { id: uid(), text: "Send demo script to Kavin", cat: "this-week", priority: "high", done: false, daily: false, reminderTime: "20:00", notes: "Share Google Doc with Kavin after completing demo script. Get his feedback by Thursday." },
  { id: uid(), text: "Discovery call prep (Wednesday Power Block)", cat: "this-week", priority: "high", done: false, daily: false, reminderTime: "18:00", notes: "Practice all 5 discovery questions from memory. Record yourself. Questions: team size + structure, incident walkthrough, Jira vs reality, context after senior engineer leaves, biggest frustration." },
  { id: uid(), text: "Mock discovery call with Kavin (Thursday)", cat: "this-week", priority: "high", done: false, daily: false, reminderTime: "18:00", notes: "30 min mock call. Kavin plays engineering lead. Ask 5 questions. Do not pitch. Ladson listens." },
  { id: uid(), text: "Pitch practice in English (Thursday morning)", cat: "this-week", priority: "medium", done: false, daily: false, reminderTime: "06:40", notes: "Record 30-second pitch 3 times without notes." },
  { id: uid(), text: "Send 5 LinkedIn outreach messages (Mon + Wed)", cat: "this-week", priority: "high", done: false, daily: false, notes: "Use morning-prep task drafts. Review, approve, send. Update Outreach Tracker after each send." },
  { id: uid(), text: "Update outreach tracker fully (Friday)", cat: "this-week", priority: "high", done: false, daily: false, reminderTime: "07:15", notes: "Verify all rows. Calculate weekly numbers: sent, replies, calls booked, reply rate %." },

  // Before First Pilot
  { id: uid(), text: "Draft founders agreement with Kavin", cat: "before-pilot", priority: "high", done: false, daily: false, notes: "Equity split (60/40), roles, 4-year vesting with 1-year cliff, IP ownership, decision authority, exit clause. Do this before incorporation. Cost: Rs. 5,000-10,000 for a lawyer." },
  { id: uid(), text: "Talk to CA about Pvt Ltd incorporation", cat: "before-pilot", priority: "high", done: false, daily: false, notes: "Structure confirmed: Private Limited Company. Ask CA about: DSC, DIN, SPICe+ filing, registered office address. Get timeline and cost estimate." },
  { id: uid(), text: "Create pilot agreement template", cat: "before-pilot", priority: "high", done: false, daily: false, notes: "$99/month, 30-day termination notice, data handling clause, liability cap (3 months fees). Save to malveon/admin/." },
  { id: uid(), text: "Set up Razorpay + Stripe", cat: "before-pilot", priority: "high", done: false, daily: false, notes: "Razorpay for Indian customers. Stripe India for international. Both need company PAN + GSTIN (post-incorporation)." },
  { id: uid(), text: "Define pilot success metrics", cat: "before-pilot", priority: "medium", done: false, daily: false, notes: "3 specific metrics. Share with pilot customer before Day 1." },
  { id: uid(), text: "Add ToS and Privacy Policy to website", cat: "before-pilot", priority: "medium", done: false, daily: false, notes: "Use termly.io. Host on GitHub Pages. Add links to Calendly and demo request form." },
  { id: uid(), text: "File DPIIT Startup India registration", cat: "before-pilot", priority: "medium", done: false, daily: false, notes: "Apply at startupindia.gov.in after incorporation. Free. 3-year tax holiday + trademark fee rebate." },

  // Waiting On
  { id: uid(), text: "Kavin: demo build date", cat: "waiting", priority: "high", done: false, daily: false, reminderTime: "07:15", notes: "Waiting since Mar 6 (16 days). Ping today (Sunday). Need hard date to plan April demo target." },

  // Someday
  { id: uid(), text: "Record 2-min Malveon demo video", cat: "someday", priority: "medium", done: false, daily: false, notes: "" },
  { id: uid(), text: "Build warm intro list from network", cat: "someday", priority: "medium", done: false, daily: false, notes: "" },
  { id: uid(), text: "Update LinkedIn bio", cat: "someday", priority: "low", done: false, daily: false, notes: "" },
  { id: uid(), text: "Pin tweet on X", cat: "someday", priority: "low", done: false, daily: false, notes: "" },
  { id: uid(), text: "Read Never Split the Difference", cat: "someday", priority: "medium", done: false, daily: false, notes: "" },
  { id: uid(), text: "Build consistent 30-min workout routine", cat: "someday", priority: "medium", done: false, daily: false, notes: "" },
  { id: uid(), text: "Start a 3-sentence daily journal", cat: "someday", priority: "low", done: false, daily: false, notes: "" },
  { id: uid(), text: "Apply for AWS Activate credits ($100K)", cat: "someday", priority: "medium", done: false, daily: false, notes: "Apply at aws.amazon.com/activate after incorporation. Covers hosting for pilot period." },
];

const catLabels = {
  'inbox': 'Inbox', 'today': 'Today', 'daily-habits': 'Daily Habits', 'this-week': 'This Week', 'before-pilot': 'Before Pilot',
  'waiting': 'Waiting', 'someday': 'Someday', 'playbook': 'Playbook',
  'done': 'Done', 'history': 'History', 'sync': 'Sync', 'reminders': 'Reminders'
};

const COMPLIANCE_METADATA = [
  { id: 'gstr1', title: 'GSTR-1', freq: 'monthly', day: 11, desc: 'Sales return listing all outward supplies.', penalty: '₹50/day' },
  { id: 'gstr3b', title: 'GSTR-3B', freq: 'monthly', day: 20, desc: 'Summary return for tax payment.', penalty: '₹50/day + interest' },
  { id: 'tds-pay', title: 'TDS Payment', freq: 'monthly', day: 7, desc: 'Deposit of tax deducted at source.', penalty: '1.5% interest/month' },
  { id: 'tds-q1', title: 'TDS Return Q1', freq: 'quarterly', month: 6, day: 31, desc: 'Quarterly statement for Apr-Jun.', penalty: '₹200/day' },
  { id: 'tds-q2', title: 'TDS Return Q2', freq: 'quarterly', month: 9, day: 31, desc: 'Quarterly statement for Jul-Sep.', penalty: '₹200/day' },
  { id: 'tds-q3', title: 'TDS Return Q3', freq: 'quarterly', month: 0, day: 31, desc: 'Quarterly statement for Oct-Dec.', penalty: '₹200/day' }, // Jan 31
  { id: 'tds-q4', title: 'TDS Return Q4', freq: 'quarterly', month: 4, day: 31, desc: 'Quarterly statement for Jan-Mar.', penalty: '₹200/day' }, // May 31
  { id: 'agm', title: 'Annual Meeting', freq: 'annual', month: 8, day: 30, desc: 'Mandatory annual meeting of shareholders.', penalty: 'Heavy fines' },
  { id: 'aoc4', title: 'AOC-4', freq: 'annual', month: 9, day: 29, desc: 'Filing of financial statements with ROC.', penalty: '₹100/day' },
  { id: 'mgt7', title: 'MGT-7', freq: 'annual', month: 10, day: 28, desc: 'Annual return filing with ROC.', penalty: '₹100/day' },
  { id: 'lut', title: 'LUT Renewal', freq: 'annual', month: 2, day: 31, desc: 'Letter of Undertaking for export without tax.', penalty: 'Tax on exports' },
  { id: 'dpiit', title: 'DPIIT Self-Cert', freq: 'annual', month: 3, day: 30, desc: 'Startup India self-certification.', penalty: 'Loss of tax benefits' }
];

function calcComplianceDueDate(item, lastDoneDate) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  if (item.freq === 'monthly') {
    let d = new Date(year, month, item.day || 31);
    if (d.getMonth() !== month) d = new Date(year, month + 1, 0); 
    const dStr = d.toISOString().split('T')[0];
    
    if (lastDoneDate && lastDoneDate >= dStr) {
      let nextMonth = month + 1;
      let nextYear = year;
      if (nextMonth > 11) { nextMonth = 0; nextYear++; }
      let next = new Date(nextYear, nextMonth, item.day || 31);
      if (next.getMonth() !== nextMonth) next = new Date(nextYear, nextMonth + 1, 0);
      return next.toISOString().split('T')[0];
    }
    return dStr;
  }

  if (item.freq === 'quarterly' || item.freq === 'annual') {
    let d = new Date(year, item.month, item.day || 31);
    if (d.getMonth() !== item.month) d = new Date(year, item.month + 1, 0);
    const dStr = d.toISOString().split('T')[0];

    if (lastDoneDate && lastDoneDate >= dStr) {
      let next = new Date(year + 1, item.month, item.day || 31);
      if (next.getMonth() !== item.month) next = new Date(year + 1, item.month + 1, 0);
      return next.toISOString().split('T')[0];
    }
    return dStr;
  }
  return '';
}

function getComplianceStatus(dueDate, lastDoneDate) {
  const today = todayStr();
  if (lastDoneDate && lastDoneDate >= dueDate) return 'green';
  
  const due = new Date(dueDate);
  const now = new Date(today);
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  
  if (diff < 0) return 'red';
  if (diff <= 7) return 'yellow';
  return 'green';
}

function getComplianceOverdueCount() {
  let count = 0;
  try {
    const userState = JSON.parse(localStorage.getItem(COMPLIANCE_KEY) || '{}');
    COMPLIANCE_METADATA.forEach(m => {
      const dueDate = calcComplianceDueDate(m);
      if (getComplianceStatus(dueDate, userState[m.id]?.lastDoneDate) === 'red') count++;
    });
  } catch(e) {}
  return count;
}


let tasks = [];
let activeTab = 'today';
let editingId = null;
let dailyLog = [];
let resources = [];
let editingResourceId = null;

// ===================== V3 SYNC & SAVE =====================
async function syncOutreachLogs() {
  if (!currentUser || !sb) return;
  const { data, error } = await sb.from('outreach_logs').select('*').eq('user_id', currentUser.id).order('date', { ascending: false });
  if (!error && data) outreach_logs = data;
}
async function saveOutreachLog(dateStr, data) {
  if (!currentUser || !sb) return;
  const row = { user_id: currentUser.id, date: dateStr, ...data, updated_at: new Date().toISOString() };
  if (navigator.onLine) {
    const { error } = await sb.from('outreach_logs').upsert(row, { onConflict: 'user_id, date' });
    if (error) queueChange('outreach_logs', 'upsert', row);
  } else { queueChange('outreach_logs', 'upsert', row); }
}
function getOutreachLog(dateStr) { return outreach_logs.find(l => l.date === dateStr) || null; }

async function syncExpenses() {
  if (!currentUser || !sb) return;
  const { data, error } = await sb.from('expenses').select('*').eq('user_id', currentUser.id).order('date', { ascending: false });
  if (!error && data) expenses = data;
}
async function saveExpense(data) {
  if (!currentUser || !sb) return;
  const row = { id: data.id || uuidv4(), user_id: currentUser.id, ...data };
  if (navigator.onLine) {
    const { error } = await sb.from('expenses').upsert(row, { onConflict: 'id' });
    if (error) queueChange('expenses', 'upsert', row);
  } else { queueChange('expenses', 'upsert', row); }
}
async function deleteExpense(id) {
  if (!currentUser || !sb) return;
  expenses = expenses.filter(e => e.id !== id);
  if (navigator.onLine) {
    const { error } = await sb.from('expenses').delete().eq('id', id);
    if (error) queueChange('expenses', 'delete', { id });
  } else { queueChange('expenses', 'delete', { id }); }
}

async function syncMilestones() {
  if (!currentUser || !sb) return;
  const { data, error } = await sb.from('milestones').select('*').eq('user_id', currentUser.id).order('sort_order', { ascending: true });
  if (!error && data) {
    milestones = data;
    if (milestones.length === 0) seedDefaultMilestones();
  }
}
async function saveMilestone(data) {
  if (!currentUser || !sb) return;
  const row = { id: data.id || uuidv4(), user_id: currentUser.id, ...data };
  if (navigator.onLine) {
    const { error } = await sb.from('milestones').upsert(row, { onConflict: 'id' });
    if (error) queueChange('milestones', 'upsert', row);
  } else { queueChange('milestones', 'upsert', row); }
}
async function updateMilestoneProgress(id, currentValue) {
  const m = milestones.find(x => x.id === id);
  if (m) {
    m.current_value = currentValue;
    if (m.current_value >= m.target_value) m.achieved_date = new Date().toISOString().split('T')[0];
    await saveMilestone(m);
  }
}
function seedDefaultMilestones() {
  const defaults = [
    { title: 'First paying pilot customer', target_date: '2026-07-31', target_value: 99, current_value: 0, unit: 'MRR', category: 'Revenue', sort_order: 1 },
    { title: '$1,000 MRR', target_date: '2026-09-30', target_value: 1000, current_value: 0, unit: 'MRR', category: 'Revenue', sort_order: 2 },
    { title: '$4,000 MRR', target_date: '2026-12-31', target_value: 4000, current_value: 0, unit: 'MRR', category: 'Revenue', sort_order: 3 },
    { title: '10 paying customers', target_date: '2026-12-31', target_value: 10, current_value: 0, unit: 'Customers', category: 'Revenue', sort_order: 4 },
    { title: 'Pvt Ltd incorporated', target_date: '2026-04-30', target_value: 1, current_value: 0, unit: 'Status', category: 'General', sort_order: 5 },
    { title: 'YC W2027 application submitted', target_date: '2026-10-31', target_value: 1, current_value: 0, unit: 'Status', category: 'General', sort_order: 6 }
  ];
  defaults.forEach(d => saveMilestone(d));
}

// ===================== V2 NAVIGATION STATE =====================
let activeSection = localStorage.getItem(NAV_KEY) || 'tasks';
let activeTopTab = null; // set per section

const SECTIONS = {
  tasks: ['Inbox', 'Today', 'Habits', 'This Week', 'Recurring', 'Calendar', 'Domains', 'Kavin', 'Reminders', 'Done'],
  ops: ['Compliance', 'OKR', 'Milestones', 'Decisions', 'Delegation', 'Review', 'Playbook'],
  crm: ['Pipeline', 'Pilots', 'Insights'],
  analytics: ['Outreach', 'Runway', 'History', 'Velocity', 'Workload', 'Sync']
};

// Map V2 top tab names back to legacy activeTab values for backward compat
const TAB_TO_LEGACY = {
  'Inbox': 'inbox', 'Today': 'today', 'Habits': 'daily-habits', 'This Week': 'this-week',
  'Recurring': 'recurring', 'Reminders': 'reminders', 'Calendar': 'calendar', 'Domains': 'domains', 'Kavin': 'kavin', 'Done': 'done',
  'Compliance': 'compliance', 'OKR': 'okr', 'Milestones': 'milestones', 'Decisions': 'decisions',
  'Delegation': 'delegation', 'Review': 'review', 'Playbook': 'playbook',
  'Pipeline': 'pipeline', 'Pilots': 'pilots', 'Insights': 'insights',
  'Outreach': 'outreach', 'Runway': 'runway', 'History': 'history', 'Velocity': 'velocity',
  'Workload': 'workload', 'Sync': 'sync'
};

function switchSection(section) {
  activeSection = section;
  localStorage.setItem(NAV_KEY, section);
  activeTopTab = SECTIONS[section][0];
  renderBottomNav();
  renderTopTabs();
  renderScreen();
}

function switchTab(tabName) {
  // Handle both V2 top-tab names and legacy tab names
  if (SECTIONS[activeSection] && SECTIONS[activeSection].includes(tabName)) {
    activeTopTab = tabName;
  }
  const legacyTab = TAB_TO_LEGACY[tabName] || tabName;
  activeTab = legacyTab;
  if (legacyTab === 'sync') clearNotifCount();
  renderTopTabs();
  renderScreen();
  // FAB visibility
  const fabBtn = document.getElementById('fabBtn');
  if (fabBtn) fabBtn.style.display = (['history', 'velocity', 'domains', 'workload', 'sync', 'review'].includes(legacyTab)) ? 'none' : 'flex';
  // Quick capture visibility
  const quickCap = document.getElementById('quickCapture');
  const showQuick = ['inbox', 'today', 'daily-habits', 'this-week', 'before-pilot', 'waiting', 'someday', 'reminders'].includes(legacyTab);
  if (quickCap) quickCap.style.display = showQuick ? 'flex' : 'none';

  // V3 components visibility
  const v3Tb = document.getElementById('v3Toolbar');
  if (v3Tb) v3Tb.style.display = (activeSection === 'tasks') ? 'flex' : 'none';
  const quickAddFab = document.getElementById('quickAddFab');
  if (quickAddFab) quickAddFab.style.display = (activeSection === 'tasks') ? 'flex' : 'none';
}

function renderBottomNav() {
  const items = document.querySelectorAll('.bottom-nav-item');
  items.forEach(item => {
    item.classList.toggle('active', item.dataset.section === activeSection);
  });
  // Ops alert dot (overdue compliance)
  const opsDot = document.getElementById('opsAlertDot');
  if (opsDot) {
    const hasOverdue = typeof getComplianceOverdueCount === 'function' ? getComplianceOverdueCount() > 0 : false;
    opsDot.style.display = hasOverdue ? 'block' : 'none';
  }
}

function renderTopTabs() {
  const el = document.getElementById('tabsContainer');
  if (!el) return;
  const tabs = SECTIONS[activeSection] || [];
  if (!activeTopTab || !tabs.includes(activeTopTab)) activeTopTab = tabs[0];
  el.innerHTML = tabs.map(t => {
    const isActive = t === activeTopTab;
    let count = '';
    const legacy = TAB_TO_LEGACY[t];
    if (legacy === 'done') count = `<span class="count">${tasks.filter(x => x.done).length}</span>`;
    else if (legacy === 'sync') {
      const nc = typeof getNotifCount === 'function' ? getNotifCount() : 0;
      if (nc > 0) count = `<span class="count notif-badge">${nc}</span>`;
    }
    else if (legacy === 'reminders') count = `<span class="count">${tasks.filter(x => !x.done && (x.cat === 'reminders' || x.reminderTime)).length}</span>`;
    else if (legacy === 'playbook') count = `<span class="count">${resources.length}</span>`;
    else if (['today', 'daily-habits', 'this-week'].includes(legacy)) count = `<span class="count">${tasks.filter(x => x.cat === legacy && !x.done).length}</span>`;
    return `<button class="tab ${isActive ? 'active' : ''}" onclick="switchTab('${t}')">${t}${count}</button>`;
  }).join('');
}

function renderScreen() {
  updateNotifBadge();
  const legacy = TAB_TO_LEGACY[activeTopTab] || activeTopTab;
  
  // Phase 4: V2 Today Screen Routing
  if (legacy === 'today') {
    activeTab = 'today';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderToday();
    return;
  }

  // Phase 5: V2 Habits Screen
  if (legacy === 'daily-habits') {
    activeTab = 'daily-habits';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderHabits();
    return;
  }

  // Phase 6: V2 This Week Screen
  if (legacy === 'this-week') {
    activeTab = 'this-week';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderThisWeek();
    return;
  }

  // Phase 2: V3 Domains Screen
  if (legacy === 'domains') {
    activeTab = 'domains';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderDomainView();
    return;
  }

  // Phase 2: V3 Kavin Screen
  if (legacy === 'kavin') {
    activeTab = 'kavin';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderKavinView();
    return;
  }

  // Phase 2: V3 Calendar Screen
  if (legacy === 'calendar') {
    activeTab = 'calendar';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderCalendarView();
    return;
  }

  // Phase 7: V2 Recurring Screen
  if (legacy === 'recurring') {
    activeTab = 'recurring';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderRecurring();
    return;
  }

  // Phase 9: V2 Compliance Screen
  if (legacy === 'compliance') {
    activeTab = 'compliance';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderCompliance();
    return;
  }

  // Phase 10: V2 OKR Screen
  if (legacy === 'okr') {
    activeTab = 'okr';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderOkrTab();
    return;
  }

  // Phase 15: CRM Pipeline
  if (legacy === 'pipeline') {
    activeTab = 'pipeline';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderPipeline();
    return;
  }

  // Phase 16: CRM Pilots
  if (legacy === 'pilots') {
    activeTab = 'pilots';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderPilots();
    return;
  }

  // Phase 17: CRM Insights
  if (legacy === 'insights') {
    activeTab = 'insights';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderInsights();
    return;
  }



  // Phase 8: V2 Reminders Screen
  if (legacy === 'reminders') {
    activeTab = 'reminders';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderReminders();
    return;
  }

  // Phase 8: V2 Done Screen
  if (legacy === 'done') {
    activeTab = 'done';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderDone();
    return;
  }

  // Legacy rendering: call existing renderView for task tabs that already work
  const legacyTabs = ['before-pilot', 'waiting', 'someday'];
  if (legacyTabs.includes(legacy)) {
    activeTab = legacy;
    const v2 = document.getElementById('v2Content');
    if (v2) v2.innerHTML = '';
    renderView();
    return;
  }
  // Existing special renderers (sync still uses legacy)
  if (legacy === 'sync' && typeof renderSync === 'function') { activeTab = 'sync'; renderView(); return; }

  // Phase 18: V2 History Screen
  if (legacy === 'history') {
    activeTab = 'history';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderHistoryV2();
    return;
  }

  // Phase 18: V2 Velocity Screen
  if (legacy === 'velocity') {
    activeTab = 'velocity';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderVelocity();
    return;
  }

  // Phase 3.1: Outreach Analytics
  if (legacy === 'outreach') {
    activeTab = 'outreach';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderOutreachAnalytics();
    return;
  }

  // Phase 3.3: Runway Component
  if (legacy === 'runway') {
    activeTab = 'runway';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderRunway();
    return;
  }

  // Phase 3.2: Milestone Tracker
  if (legacy === 'milestones') {
    activeTab = 'milestones';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderMilestones();
    return;
  }

  // Phase 19: V2 Domains Screen
  if (legacy === 'domains') {
    activeTab = 'domains';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderDomains();
    return;
  }

  // Phase 19: V2 Workload Screen
  if (legacy === 'workload') {
    activeTab = 'workload';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderWorkload();
    return;
  }

  // Phase 11: V2 Decisions Screen
  if (legacy === 'decisions') {
    activeTab = 'decisions';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderDecisionsV2();
    return;
  }

  // Phase 12: V2 Delegation Screen
  if (legacy === 'delegation') {
    activeTab = 'delegation';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderDelegationV2();
    return;
  }

  // Phase 13: V2 Review Screen
  if (legacy === 'review') {
    activeTab = 'review';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderReviewV2();
    return;
  }

  // Phase 14: V2 Playbook Screen
  if (legacy === 'playbook') {
    activeTab = 'playbook';
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    renderPlaybookV2();
    return;
  }
  
  // V2 renderers placeholder
  const v2 = document.getElementById('v2Content');
  if (v2) {
    document.getElementById('taskList').innerHTML = '';
    document.getElementById('syncSection').style.display = 'none';
    document.getElementById('playbookSection').style.display = 'none';
    document.getElementById('remindersSection').style.display = 'none';
    document.getElementById('reviewPrompt').innerHTML = '';
    v2.innerHTML = `<div class="v2-empty"><div class="v2-empty-icon">🚧</div><div class="v2-empty-text">${activeTopTab} — coming soon</div></div>`;
  }
}

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
    domain: t.domain || 'General',
    due_date: t.dueDate || null,
    status: t.status || 'not-started',
    phase: t.phase || null,
    owner: t.owner || 'Ladson',
    dependencies: t.dependencies || [],
    okr_id: t.okrId || null,
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
    domain: r.domain || 'General',
    dueDate: r.due_date || null,
    status: r.status || 'not-started',
    phase: r.phase || null,
    owner: r.owner || 'Ladson',
    dependencies: r.dependencies || [],
    okrId: r.okr_id || null,
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

// ===================== V2 COMPONENT BUILDERS =====================

function v2TaskRow(task) {
  const doneClass = task.done ? ' done' : '';
  const checkClass = task.done ? ' checked' : '';
  const priClass = task.priority ? ` ${task.priority}-left` : '';
  const priBadge = priorityBadge(task.priority);
  const subtaskInfo = (task.subtasks && task.subtasks.length > 0) ?
    `<span class="subtask-inline">${task.subtasks.filter(s => s.done).length}/${task.subtasks.length} sub</span>` : '';
  const reminderTag = task.reminderTime ? `<span class="rec-tag">⏰ ${task.reminderTime}</span>` : '';
  return `<div class="v2-task-row${doneClass}${priClass}" data-id="${task.id}" onclick="openTaskDetail('${task.id}')">
    <div class="v2-task-check${checkClass}" onclick="event.stopPropagation();toggleTask('${task.id}')"></div>
    <div class="v2-task-content">
      <div class="v2-task-text">${task.text}</div>
      <div class="v2-task-meta">${priBadge}${subtaskInfo}${reminderTag}</div>
    </div>
  </div>`;
}

function v2TaskRowWithTimer(task) {
  const doneClass = task.done ? ' done' : '';
  const checkClass = task.done ? ' checked' : '';
  const priClass = task.priority ? ` ${task.priority}-left` : '';
  const priBadge = priorityBadge(task.priority);
  const subtaskInfo = (task.subtasks && task.subtasks.length > 0) ?
    `<span class="subtask-inline">${task.subtasks.filter(s => s.done).length}/${task.subtasks.length} sub</span>` : '';
  const reminderTag = task.reminderTime ? `<span class="rec-tag">⏰ ${task.reminderTime}</span>` : '';
  
  const isFocus = activeFocusTaskId === task.id;
  const focusClass = isFocus ? ' active-focus' : '';
  
  let timerHtml = '';
  if (isFocus) {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    // Simple SVG ring
    timerHtml = `
      <div class="focus-timer-ring" onclick="event.stopPropagation();stopFocusTimer()">
        <svg viewBox="0 0 36 36"><path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/><path class="circle" stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/></svg>
        <div class="time-text">${timeStr}</div>
      </div>`;
  }

  return `<div class="v2-task-row${doneClass}${focusClass}${priClass}" data-id="${task.id}" onclick="isFocus ? null : openTaskDetail('${task.id}')">
    <div class="v2-task-check${checkClass}" onclick="event.stopPropagation();toggleTask('${task.id}')"></div>
    <div class="v2-task-content" ${!isFocus ? `onclick="startFocusTimer('${task.id}')"` : ''}>
      <div class="v2-task-text">${task.text}</div>
      <div class="v2-task-meta">${priBadge}${subtaskInfo}${reminderTag}</div>
    </div>
    ${timerHtml}
  </div>`;
}

function metricCard(label, value, colorClass) {
  const cls = colorClass ? ` ${colorClass}` : '';
  return `<div class="metric-card"><div class="metric-card-value${cls}">${value}</div><div class="metric-card-label">${label}</div></div>`;
}

function sectionLabel(text) {
  return `<div class="section-label">${text}</div>`;
}

function v2Card(content, opts = {}) {
  const border = opts.borderColor ? ` ${opts.borderColor}-left` : '';
  const clickAttr = opts.onclick ? ` onclick="${opts.onclick}"` : '';
  return `<div class="v2-card${border}"${clickAttr}>${content}</div>`;
}

function priorityBadge(priority) {
  if (!priority) return '';
  const cls = priority === 'high' ? 'high' : priority === 'medium' ? 'medium' : 'low';
  return `<span class="badge ${cls}">${priority}</span>`;
}

function statusDot(color) {
  return `<span class="dot-${color}"></span>`;
}

function showToast(msg, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ===================== V2 DATA LAYER — ROW MAPPINGS =====================

function prospectToRow(p) {
  return {
    id: p.id, user_id: currentUser.id,
    name: p.name, company: p.company, title: p.title || null,
    linkedin_url: p.linkedinUrl || null, email: p.email || null,
    status: p.status || 'new',
    last_contact_date: p.lastContactDate || null,
    next_followup_date: p.nextFollowupDate || null,
    source: p.source || 'linkedin', notes: p.notes || null,
    updated_at: p.updatedAt || new Date().toISOString()
  };
}

function recurringToRow(rt) {
  return {
    id: rt.id, user_id: currentUser.id,
    title: rt.title, frequency: rt.frequency,
    days_of_week: rt.daysOfWeek || [], day_of_month: rt.dayOfMonth || null,
    month_of_year: rt.monthOfYear || null, event_trigger: rt.eventTrigger || null,
    target_cat: rt.targetCat || 'today', priority: rt.priority || 'medium',
    active: rt.active !== false, last_generated_date: rt.lastGeneratedDate || null,
    next_run_date: rt.nextRunDate || null,
    updated_at: rt.updatedAt || new Date().toISOString()
  };
}

function rowToRecurring(r) {
  return {
    id: r.id, title: r.title, frequency: r.frequency,
    daysOfWeek: r.days_of_week || [], dayOfMonth: r.day_of_month,
    monthOfYear: r.month_of_year, eventTrigger: r.event_trigger,
    targetCat: r.target_cat || 'today', priority: r.priority || 'medium',
    active: r.active !== false, lastGeneratedDate: r.last_generated_date,
    nextRunDate: r.next_run_date, updatedAt: r.updated_at
  };
}

function rowToProspect(r) {
  return {
    id: r.id, name: r.name, company: r.company, title: r.title,
    linkedinUrl: r.linkedin_url, email: r.email,
    status: r.status || 'new',
    lastContactDate: r.last_contact_date,
    nextFollowupDate: r.next_followup_date,
    source: r.source || 'linkedin', notes: r.notes,
    updatedAt: r.updated_at
  };
}

function pilotToRow(p) {
  return {
    id: p.id, user_id: currentUser.id,
    company: p.company, contact_name: p.contactName,
    contact_email: p.contactEmail || null,
    start_date: p.startDate || null,
    success_metric: p.successMetric || null,
    health: p.health || 'green',
    onboarding_status: p.onboardingStatus || 'not-started',
    last_checkin_date: p.lastCheckinDate || null,
    next_checkin_date: p.nextCheckinDate || null,
    mrr_usd: p.mrrUsd || 99, notes: p.notes || null,
    updated_at: p.updatedAt || new Date().toISOString()
  };
}

function rowToPilot(r) {
  return {
    id: r.id, company: r.company, contactName: r.contact_name,
    contactEmail: r.contact_email,
    startDate: r.start_date, successMetric: r.success_metric,
    health: r.health || 'green',
    onboardingStatus: r.onboarding_status || 'not-started',
    lastCheckinDate: r.last_checkin_date,
    nextCheckinDate: r.next_checkin_date,
    mrrUsd: r.mrr_usd || 99, notes: r.notes,
    updatedAt: r.updated_at
  };
}

function insightToRow(i) {
  return {
    id: i.id, user_id: currentUser.id,
    date: i.date || new Date().toISOString().slice(0, 10),
    contact_name: i.contactName || null, company: i.company || null,
    quote: i.quote, theme: i.theme || 'other',
    source: i.source || 'discovery-call',
    updated_at: i.updatedAt || new Date().toISOString()
  };
}

function rowToInsight(r) {
  return {
    id: r.id, date: r.date,
    contactName: r.contact_name, company: r.company,
    quote: r.quote, theme: r.theme || 'other',
    source: r.source || 'discovery-call',
    updatedAt: r.updated_at
  };
}

function decisionToRow(d) {
  return {
    id: d.id, user_id: currentUser.id,
    date: d.date || new Date().toISOString().slice(0, 10),
    decision: d.decision, reason: d.reason || null,
    decided_by: d.decidedBy || 'Ladson',
    domain: d.domain || 'ops',
    updated_at: d.updatedAt || new Date().toISOString()
  };
}

function rowToDecision(r) {
  return {
    id: r.id, date: r.date,
    decision: r.decision, reason: r.reason,
    decidedBy: r.decided_by || 'Ladson',
    domain: r.domain || 'ops',
    updatedAt: r.updated_at
  };
}

function delegationToRow(d) {
  return {
    id: d.id, user_id: currentUser.id,
    task: d.task, assigned_to: d.assignedTo,
    assigned_date: d.assignedDate || new Date().toISOString().slice(0, 10),
    due_date: d.dueDate || null,
    status: d.status || 'not-started',
    notes: d.notes || null,
    updated_at: d.updatedAt || new Date().toISOString()
  };
}

function rowToDelegation(r) {
  return {
    id: r.id, task: r.task, assignedTo: r.assigned_to,
    assignedDate: r.assigned_date,
    dueDate: r.due_date,
    status: r.status || 'not-started',
    notes: r.notes,
    updatedAt: r.updated_at
  };
}

// ===================== V2 PUSH TO SUPABASE =====================

async function pushProspectToSupabase(p) {
  if (!currentUser || !sb) return;
  p.updatedAt = new Date().toISOString();
  const row = prospectToRow(p);
  if (navigator.onLine) {
    const { error } = await sb.from('prospects').upsert(row, { onConflict: 'id' });
    if (error) { console.log('Push prospect error:', error); queueChange('prospects', 'upsert', row); }
  } else { queueChange('prospects', 'upsert', row); }
}

async function pushPilotToSupabase(p) {
  if (!currentUser || !sb) return;
  p.updatedAt = new Date().toISOString();
  const row = pilotToRow(p);
  if (navigator.onLine) {
    const { error } = await sb.from('pilots').upsert(row, { onConflict: 'id' });
    if (error) { console.log('Push pilot error:', error); queueChange('pilots', 'upsert', row); }
  } else { queueChange('pilots', 'upsert', row); }
}

async function pushInsightToSupabase(i) {
  if (!currentUser || !sb) return;
  i.updatedAt = new Date().toISOString();
  const row = insightToRow(i);
  if (navigator.onLine) {
    const { error } = await sb.from('insights').upsert(row, { onConflict: 'id' });
    if (error) { console.log('Push insight error:', error); queueChange('insights', 'upsert', row); }
  } else { queueChange('insights', 'upsert', row); }
}

async function pushDecisionToSupabase(d) {
  if (!currentUser || !sb) return;
  d.updatedAt = new Date().toISOString();
  const row = decisionToRow(d);
  if (navigator.onLine) {
    const { error } = await sb.from('decisions').upsert(row, { onConflict: 'id' });
    if (error) { console.log('Push decision error:', error); queueChange('decisions', 'upsert', row); }
  } else { queueChange('decisions', 'upsert', row); }
}

async function pushDelegationToSupabase(d) {
  if (!currentUser || !sb) return;
  d.updatedAt = new Date().toISOString();
  const row = delegationToRow(d);
  if (navigator.onLine) {
    const { error } = await sb.from('delegations').upsert(row, { onConflict: 'id' });
    if (error) { console.log('Push delegation error:', error); queueChange('delegations', 'upsert', row); }
  } else { queueChange('delegations', 'upsert', row); }
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

    // V2: Sync new tables
    const v2Tables = [
      { table: 'prospects', get: () => prospects, set: v => prospects = v, toLocal: rowToProspect },
      { table: 'pilots', get: () => pilots, set: v => pilots = v, toLocal: rowToPilot },
      { table: 'insights', get: () => insights, set: v => insights = v, toLocal: rowToInsight },
      { table: 'decisions', get: () => decisions, set: v => decisions = v, toLocal: rowToDecision },
      { table: 'delegations', get: () => delegations, set: v => delegations = v, toLocal: rowToDelegation },
      { table: 'recurring_tasks', get: () => recurringTasks, set: v => recurringTasks = v, toLocal: rowToRecurring }
    ];
    for (const { table, get, set, toLocal } of v2Tables) {
      try {
        const { data, error } = await sb.from(table).select('*').eq('user_id', currentUser.id);
        if (!error && data) {
          const localMap = {};
          get().forEach(item => { localMap[item.id] = item; });
          const merged = [];
          data.forEach(r => {
            const remote = toLocal(r);
            const local = localMap[remote.id];
            if (local) {
              merged.push(new Date(remote.updatedAt) > new Date(local.updatedAt || 0) ? remote : local);
              delete localMap[remote.id];
            } else {
              merged.push(remote);
            }
          });
          Object.values(localMap).forEach(item => merged.push(item));
          set(merged);
        }
      } catch (e) { console.log(`Sync ${table} error:`, e); }
    }

    // Process any queued offline changes
    await processQueue();

  } catch (e) {
    console.log('Sync error:', e);
  }

  // V3 Syncs
  await syncOutreachLogs();
  await syncExpenses();
  await syncMilestones();

  isSyncing = false;
  renderTopTabs();
  renderScreen();
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
        renderTopTabs(); renderScreen(); updateProgress();
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
    // V2 realtime: prospects
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'prospects', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (isSyncing) return;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const remote = rowToProspect(payload.new);
          const idx = prospects.findIndex(p => p.id === remote.id);
          if (idx >= 0) prospects[idx] = remote; else prospects.push(remote);
        } else if (payload.eventType === 'DELETE') {
          prospects = prospects.filter(p => p.id !== payload.old.id);
        }
        if (activeSection === 'crm') { renderTopTabs(); renderScreen(); }
      }
    )
    // V2 realtime: pilots
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'pilots', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (isSyncing) return;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const remote = rowToPilot(payload.new);
          const idx = pilots.findIndex(p => p.id === remote.id);
          if (idx >= 0) pilots[idx] = remote; else pilots.push(remote);
        } else if (payload.eventType === 'DELETE') {
          pilots = pilots.filter(p => p.id !== payload.old.id);
        }
        if (activeSection === 'crm') { renderTopTabs(); renderScreen(); }
      }
    )
    // V2 realtime: insights
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'insights', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (isSyncing) return;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const remote = rowToInsight(payload.new);
          const idx = insights.findIndex(i => i.id === remote.id);
          if (idx >= 0) insights[idx] = remote; else insights.push(remote);
        } else if (payload.eventType === 'DELETE') {
          insights = insights.filter(i => i.id !== payload.old.id);
        }
        if (activeSection === 'crm') { renderTopTabs(); renderScreen(); }
      }
    )
    // V2 realtime: decisions
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'decisions', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (isSyncing) return;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const remote = rowToDecision(payload.new);
          const idx = decisions.findIndex(d => d.id === remote.id);
          if (idx >= 0) decisions[idx] = remote; else decisions.push(remote);
        } else if (payload.eventType === 'DELETE') {
          decisions = decisions.filter(d => d.id !== payload.old.id);
        }
        if (activeSection === 'ops') { renderTopTabs(); renderScreen(); }
      }
    )
    // V2 realtime: delegations
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'delegations', filter: `user_id=eq.${currentUser.id}` },
      (payload) => {
        if (isSyncing) return;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const remote = rowToDelegation(payload.new);
          const idx = delegations.findIndex(d => d.id === remote.id);
          if (idx >= 0) delegations[idx] = remote; else delegations.push(remote);
        } else if (payload.eventType === 'DELETE') {
          delegations = delegations.filter(d => d.id !== payload.old.id);
        }
        if (activeSection === 'ops') { renderTopTabs(); renderScreen(); }
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
  decisions = JSON.parse(localStorage.getItem('malveon_decisions') || '[]');
  delegations = JSON.parse(localStorage.getItem(DELEGATIONS_KEY) || '[]');

  try {
    const deletedArr = JSON.parse(localStorage.getItem(DELETED_TASKS_KEY) || '[]');
    deletedTaskTexts = new Set(deletedArr);
  } catch (e) {
    deletedTaskTexts = new Set();
  }

  checkDayReset();
  updateDate();
  updateStreak();

  // V2 navigation init
  activeTopTab = SECTIONS[activeSection] ? SECTIONS[activeSection][0] : 'Today';
  document.body.classList.add('v2-active');
  renderBottomNav();
  renderTopTabs();
  renderScreen();
  updateProgress();
  checkReviewPrompt();

  // Offline banner
  const offlineBanner = document.getElementById('offlineBanner');
  if (offlineBanner) {
    offlineBanner.classList.toggle('show', !navigator.onLine);
    window.addEventListener('online', () => offlineBanner.classList.remove('show'));
    window.addEventListener('offline', () => offlineBanner.classList.add('show'));
  }

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
  // Phase 5.3: Check heartbeat before anything else
  if (workspaceDirHandle) checkTaskHeartbeat();

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

    // Generate Recurring Tasks
    generateRecurringTasks(today);

    // Auto-clear / Archive OKR on new week (Monday)
    const okrStr = localStorage.getItem(OKR_KEY);
    if (okrStr) {
      const okr = JSON.parse(okrStr);
      const currentMonday = getMondayOfCurrentWeek();
      if (okr.weekStart !== currentMonday && new Date().getDay() === 1) {
        let entry = dailyLog.find(e => e.date === lastReset || e.date === today);
        if (entry) {
          entry.okr = okr;
          saveDailyLog();
        }
        localStorage.removeItem(OKR_KEY);
      }
    }

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

// ===================== TABS (V2 wrappers — delegates to renderTopTabs/renderScreen) =====================
function renderTabs() {
  renderBottomNav();
  renderTopTabs();
}

// Legacy switchTab kept as alias — new switchTab in V2 block handles everything



// ===================== RENDER VIEW =====================
function renderView() {
  const taskEl = document.getElementById('taskList');
  const syncEl = document.getElementById('syncSection');
  const playbookEl = document.getElementById('playbookSection');
  const remindersEl = document.getElementById('remindersSection');
  const reviewEl = document.getElementById('reviewPrompt');

  if (activeTab === 'history') {
    taskEl.innerHTML = '';
    syncEl.style.display = 'none';
    playbookEl.style.display = 'none';
    remindersEl.style.display = 'none';
    reviewEl.innerHTML = '';
    renderHistory(taskEl);
    return;
  }
  if (activeTab === 'sync') {
    taskEl.innerHTML = '';
    syncEl.style.display = 'block';
    playbookEl.style.display = 'none';
    remindersEl.style.display = 'none';
    reviewEl.innerHTML = '';
    renderSync();
    return;
  }
  if (activeTab === 'playbook') {
    taskEl.innerHTML = '';
    syncEl.style.display = 'none';
    playbookEl.style.display = 'block';
    remindersEl.style.display = 'none';
    reviewEl.innerHTML = '';
    renderPlaybook();
    return;
  }
  if (activeTab === 'reminders') {
    taskEl.innerHTML = '';
    syncEl.style.display = 'none';
    playbookEl.style.display = 'none';
    remindersEl.style.display = 'block';
    reviewEl.innerHTML = '';
    renderReminders();
    return;
  }

  syncEl.style.display = 'none';
  playbookEl.style.display = 'none';
  renderTasks();
  checkReviewPrompt();
}

// ===================== V2 TODAY SCREEN =====================
function getAllAlerts() {
  const alerts = [];
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Prospect follow-ups
  const dueProspects = prospects.filter(p => p.next_followup_date && p.next_followup_date <= todayStr);
  if (dueProspects.length > 0) {
    alerts.push({ type: 'crm', text: `You have ${dueProspects.length} prospect follow-up${dueProspects.length > 1 ? 's' : ''} due or overdue.` });
  }

  // 2. Compliance Action Required
  const overdueCompliance = tasks.filter(t => t.cat === 'compliance' && !t.done && calcComplianceDueDate(t).isOverdue);
  if (overdueCompliance.length > 0) {
    alerts.push({ type: 'urgent', text: `Urgent: ${overdueCompliance.length} compliance item${overdueCompliance.length > 1 ? 's' : ''} overdue.` });
  }

  // 3. Blocked Delegations
  const blockedDelegations = delegations.filter(d => d.status === 'blocked');
  if (blockedDelegations.length > 0) {
    alerts.push({ type: 'warning', text: `${blockedDelegations.length} delegated task${blockedDelegations.length > 1 ? 's' : ''} currently blocked.` });
  }

  // 4. Stuck tasks in Today
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
  const stuckTasks = tasks.filter(t => t.cat === 'today' && !t.done && t.updatedAt && t.updatedAt < fiveDaysAgo);
  if (stuckTasks.length > 0) {
    alerts.push({ type: 'info', text: `You have ${stuckTasks.length} task${stuckTasks.length > 1 ? 's' : ''} stalled in Today for 5+ days.` });
  }

  // 5. Daily Review Prompt (if >60% done and past 4 PM)
  const todayTasks = tasks.filter(t => t.cat === 'today');
  const doneToday = todayTasks.filter(t => t.done).length;
  const pct = todayTasks.length ? doneToday / todayTasks.length : 0;
  const hour = new Date().getHours();
  const todayEntry = dailyLog.find(e => e.date === todayStr);
  const hasReview = todayEntry && todayEntry.review;
  
  if (pct >= 0.6 && hour >= 16 && !hasReview) {
    alerts.push({ type: 'success', text: `Great progress today! Ready to write your Daily Review?` });
  }

  return alerts;
}

function updateNotifBadge() {
  const dot = document.getElementById('notifDot');
  if (!dot) return;
  const count = getAllAlerts().length;
  dot.style.display = count > 0 ? 'block' : 'none';
}

function generateSuggestions() {
  return getAllAlerts().map(a => a.text).slice(0, 3);
}

function openNotifModal() {
  const alerts = getAllAlerts();
  const listEl = document.getElementById('notifList');
  if (!listEl) return;
  
  if (alerts.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:20px 0; color:var(--text-dim); font-size:14px;">No active alerts at the moment. You're all caught up! ✨</div>`;
  } else {
    // Map types to colors
    const colors = {
      'crm': 'var(--teal-400)',
      'urgent': 'var(--red-400)',
      'warning': 'var(--amber-400)',
      'info': 'var(--blue-400)',
      'success': 'var(--green-400)'
    };
    
    listEl.innerHTML = alerts.map(a => `
      <div style="background:var(--bg-secondary); border-left:3px solid ${colors[a.type] || 'var(--accent)'}; padding:12px; border-radius:8px; font-size:13px; line-height:1.5; color:var(--text);">
        ${esc(a.text)}
      </div>
    `).join('');
  }
  
  document.getElementById('notifModal').classList.add('open');
}

function closeNotifModal() {
  document.getElementById('notifModal').classList.remove('open');
}

function startFocusTimer(taskId) {
  if (activeFocusTaskId) stopFocusTimer();
  activeFocusTaskId = taskId;
  timerSeconds = 0;
  focusInterval = setInterval(() => {
    timerSeconds++;
    if (activeTab === 'today') renderToday();
  }, 1000);
  renderToday();
}

function stopFocusTimer() {
  if (!activeFocusTaskId) return;
  clearInterval(focusInterval);
  const minutes = Math.floor(timerSeconds / 60);
  if (minutes > 0) {
    try {
      const focusData = JSON.parse(localStorage.getItem(FOCUS_KEY) || '[]');
      const todayStr = new Date().toISOString().split('T')[0];
      focusData.push({ taskId: activeFocusTaskId, date: todayStr, minutes });
      localStorage.setItem(FOCUS_KEY, JSON.stringify(focusData));

      // Backup: Save total focus minutes onto task and push to Supabase
      const task = tasks.find(t => t.id === activeFocusTaskId);
      if (task) {
        task.focusMins = (task.focusMins || 0) + minutes;
        task.updatedAt = new Date().toISOString();
        save();
        pushTaskToSupabase(task);
      }
    } catch (e) {
      console.error('Failed to save focus data', e);
    }
  }
  activeFocusTaskId = null;
  timerSeconds = 0;
  if (activeTab === 'today') renderToday();
}

function renderToday() {
  let html = '';
  const todayTasks = tasks.filter(t => t.cat === 'today');
  
  // Smart Suggestions
  const suggestions = generateSuggestions();
  if (suggestions.length > 0) {
    let sugHtml = `<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Smart Suggestions</div>`;
    suggestions.forEach(s => {
      sugHtml += `<div style="display:flex;gap:12px;margin-bottom:8px;">
        <span style="font-size:16px;">💡</span>
        <span style="font-size:13px;color:var(--text);line-height:1.4;">${s}</span>
      </div>`;
    });
    html += v2Card(sugHtml, { borderColor: 'teal' });
  }

  // Stats Row
  const doneCount = todayTasks.filter(t => t.done).length;
  
  let maxStreak = 0;
  tasks.filter(t => t.daily).forEach(t => { if ((t.streak || 0) > maxStreak) maxStreak = t.streak; });

  let focusMins = 0;
  try {
    const focusData = JSON.parse(localStorage.getItem(FOCUS_KEY) || '[]');
    const todayStr = new Date().toISOString().split('T')[0];
    focusData.forEach(f => { if (f.date === todayStr) focusMins += f.minutes; });
  } catch(e) {}
  if (activeFocusTaskId) focusMins += Math.floor(timerSeconds / 60);
  
  const focusStr = focusMins > 0 ? `${Math.floor(focusMins/60)}h ${focusMins%60}m` : '0:00';
  const focusLabel = activeFocusTaskId ? 'Focusing...' : 'Tap task to start';

  html += `<div class="metric-cards-row" style="margin-bottom:24px;">
    ${metricCard('Done', `${doneCount}/${todayTasks.length}`, doneCount === todayTasks.length && todayTasks.length > 0 ? 'green' : '')}
    ${metricCard('Streak', `${maxStreak}d`, maxStreak > 0 ? 'green' : '')}
    ${metricCard(focusLabel, focusStr, activeFocusTaskId ? 'teal' : '')}
  </div>`;

  // Priority-grouped Task List
  const pending = todayTasks.filter(t => !t.done);
  const pOrder = { high: 0, medium: 1, low: 2 };
  pending.sort((a, b) => (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2));

  const highs = pending.filter(t => t.priority === 'high');
  const meds = pending.filter(t => t.priority === 'medium');
  const lows = pending.filter(t => t.priority === 'low' || !t.priority);

  if (highs.length > 0) {
    html += sectionLabel('High Priority');
    highs.forEach(t => html += v2TaskRowWithTimer(t));
  }
  if (meds.length > 0) {
    html += sectionLabel('Medium Priority');
    meds.forEach(t => html += v2TaskRowWithTimer(t));
  }
  if (lows.length > 0) {
    html += sectionLabel('Low Priority');
    lows.forEach(t => html += v2TaskRowWithTimer(t));
  }

  if (pending.length === 0) {
    html += `<div class="v2-empty" style="margin-top:40px;">
      <div class="v2-empty-icon">🏖️</div>
      <div class="v2-empty-text">All caught up for today.</div>
      <button class="btn-save" style="margin-top:16px;width:auto;" onclick="openAddModal()">Add task</button>
    </div>`;
  }

  const v2 = document.getElementById('v2Content');
  if (v2) v2.innerHTML = html;
}

// ===================== V2 HABITS SCREEN =====================
function renderHabits() {
  const habits = tasks.filter(t => t.daily);
  const doneCount = habits.filter(t => t.done).length;
  const totalCount = habits.length;

  // Best Streak
  let bestStreak = 0;
  habits.forEach(t => { if ((t.streak || 0) > bestStreak) bestStreak = t.streak; });

  // Avg per week
  let avgPerWeek = 0;
  if (dailyLog.length > 0) {
    const firstDate = new Date(dailyLog[0].date);
    let weeksElapsed = (new Date() - firstDate) / (86400000 * 7);
    if (weeksElapsed < 1) weeksElapsed = 1;

    let activeDays = 0;
    dailyLog.forEach(log => {
      if (log.done > 0) activeDays++;
    });
    avgPerWeek = (activeDays / weeksElapsed).toFixed(1);
  }

  let html = `<div class="metric-cards-row" style="margin-bottom:24px;">
    ${metricCard('Today', `${doneCount}/${totalCount}`, doneCount === totalCount && totalCount > 0 ? 'green' : '')}
    ${metricCard('Best Streak', `${bestStreak}d`, bestStreak > 0 ? 'green' : '')}
    ${metricCard('Avg/Week', `${avgPerWeek}d`, '')}
  </div>`;

  html += sectionLabel('Daily Routine');

  // Order habits chronologically or by ID (original order was kept implicitly, here just loop)
  habits.forEach(t => {
    const streakVal = t.streak || 0;
    const streakColor = streakVal > 0 ? 'var(--green)' : 'var(--text-dim)';
    
    html += `
    <div class="v2-task-row ${t.done ? 'done' : ''}" data-id="${t.id}" onclick="openTaskDetail('${t.id}')">
      <div class="v2-task-check ${t.done ? 'checked' : ''}" onclick="event.stopPropagation(); toggleTask('${t.id}')"></div>
      <div class="v2-task-content" style="flex: 1;">
        <div class="v2-task-text" style="margin-bottom: 2px;">${esc(t.text)}</div>
        <div class="v2-task-meta" style="margin-top: 4px;">
          <span style="color:${streakColor};font-size:12px;font-weight:500;display:flex;align-items:center;gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg> ${streakVal}d
          </span>
        </div>
      </div>
    </div>`;
  });

  if (habits.length === 0) {
    html += `<div class="v2-empty" style="margin-top:40px;">
      <div class="v2-empty-icon">🔄</div>
      <div class="v2-empty-text">No daily habits configured.</div>
      <button class="btn-save" style="margin-top:16px;width:auto;" onclick="openAddModal()">Add Habit</button>
    </div>`;
  }

  const v2 = document.getElementById('v2Content');
  if (v2) v2.innerHTML = html;
}

// ===================== V2 THIS WEEK SCREEN =====================
function getMondayOfCurrentWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function calcOkrProgress() {
  const twTasks = tasks.filter(t => t.cat === 'this-week');
  const done = twTasks.filter(t => t.done).length;
  const total = twTasks.length;
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function calculateWeeklyAverage() {
  if (dailyLog.length === 0) return 0;
  const now = new Date();
  const cutoff = new Date(now.getTime() - 28 * 86400000);
  const recentLogs = dailyLog.filter(l => new Date(l.date) >= cutoff);
  let totalTasksDone = 0;
  recentLogs.forEach(l => totalTasksDone += l.done);
  
  const firstDate = new Date(dailyLog[0].date);
  let daysInLog = (now - firstDate) / 86400000;
  if (daysInLog > 28) daysInLog = 28;
  if (daysInLog < 1) daysInLog = 1;
  const weeks = daysInLog / 7;
  return Math.round(totalTasksDone / weeks);
}

function calcOkrProgressPercent(okr) {
  if (!okr) return 0;
  let score = 0;
  if (okr.oneDone) score += 50;
  if (okr.bonus1 && okr.bonus1Done) score += 25;
  if (okr.bonus2 && okr.bonus2Done) score += 25;
  return score;
}

function getOkrHistory() {
  const history = [];
  dailyLog.forEach(entry => {
    if (entry.okr) history.push(entry.okr);
  });
  return history.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));
}


function toggleOkrValue(key) {
  let okr = JSON.parse(localStorage.getItem(OKR_KEY));
  if (okr) {
    okr[key] = !okr[key];
    localStorage.setItem(OKR_KEY, JSON.stringify(okr));
    if (activeTab === 'this-week') renderThisWeek();
    else if (activeTab === 'okr') renderOkrTab();
  }
}


function openOkrModal() {
  const okr = JSON.parse(localStorage.getItem(OKR_KEY) || 'null');
  document.getElementById('okrOneInput').value = okr ? (okr.one || '') : '';
  document.getElementById('okrBonus1Input').value = okr ? (okr.bonus1 || '') : '';
  document.getElementById('okrBonus2Input').value = okr ? (okr.bonus2 || '') : '';
  document.getElementById('okrModal').classList.add('open');
}

function closeOkrModal() {
  document.getElementById('okrModal').classList.remove('open');
}

function saveOkr() {
  const one = document.getElementById('okrOneInput').value.trim();
  const b1 = document.getElementById('okrBonus1Input').value.trim();
  const b2 = document.getElementById('okrBonus2Input').value.trim();
  
  if (!one && !b1 && !b2) {
    localStorage.removeItem(OKR_KEY);
  } else {
    let okr = JSON.parse(localStorage.getItem(OKR_KEY) || '{}');
    okr.one = one;
    okr.bonus1 = b1;
    okr.bonus2 = b2;
    okr.weekStart = okr.weekStart || getMondayOfCurrentWeek();
    okr.oneDone = okr.oneDone || false;
    okr.bonus1Done = okr.bonus1Done || false;
    okr.bonus2Done = okr.bonus2Done || false;
    localStorage.setItem(OKR_KEY, JSON.stringify(okr));
  }
  closeOkrModal();
  if (activeTab === 'this-week') renderThisWeek();
  else if (activeTab === 'okr') renderOkrTab();
}


function renderThisWeek() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;
  
  const okrStr = localStorage.getItem(OKR_KEY);
  let html = '';

  // ONE THING Card
  if (okrStr) {
    const okr = JSON.parse(okrStr);
    const progress = calcOkrProgress();
    
    const renderGoal = (key, text, isDone) => {
      if (!text) return '';
      return `
        <div style="display:flex; align-items:flex-start; margin-top:8px; gap:12px; cursor:pointer;" onclick="toggleOkrValue('${key}')">
          <div class="v2-task-check ${isDone ? 'checked' : ''}"></div>
          <div style="${isDone ? 'text-decoration:line-through;color:var(--text-dim)' : 'color:var(--text);font-weight:500;font-size:14px;'} margin-top:4px;">
            ${esc(text)}
          </div>
        </div>
      `;
    };

    html += `
    <div class="card" style="border-left: 4px solid var(--teal-600); margin-bottom: 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:11px; font-weight:700; color:var(--teal-400); letter-spacing:1px; text-transform:uppercase;">THE ONE THING</div>
        <button onclick="openOkrModal()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit
        </button>
      </div>
      
      ${renderGoal('oneDone', okr.one, okr.oneDone)}
      
      <div style="margin-top:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-dim); margin-bottom:4px;">
          <span>Linked Tasks Progress</span>
          <span>${progress}%</span>
        </div>
        <div style="height:4px; background:var(--bg-layer-2); border-radius:2px; overflow:hidden;">
          <div style="height:100%; width:${progress}%; background:var(--teal-600); transition: width 0.3s ease;"></div>
        </div>
      </div>
      
      ${okr.bonus1 || okr.bonus2 ? `<div style="font-size:11px; font-weight:700; color:var(--text-dim); margin-top:16px; margin-bottom:8px; text-transform:uppercase;">BONUS GOALS</div>` : ''}
      ${renderGoal('bonus1Done', okr.bonus1, okr.bonus1Done)}
      ${renderGoal('bonus2Done', okr.bonus2, okr.bonus2Done)}
    </div>`;
  } else {
    // Missing OKR banner
    html += `
    <div class="card" style="border-left: 4px solid var(--amber); margin-bottom: 24px; background: rgba(245, 166, 35, 0.05);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:600; color:var(--amber); margin-bottom:4px;">No OKRs set for this week</div>
          <div style="font-size:13px; color:var(--text-dim);">Set your 3 OKRs to focus your week.</div>
        </div>
        <button class="btn-save" style="background:var(--amber); width:auto; font-size:13px;" onclick="openOkrModal()">Set Now</button>
      </div>
    </div>`;
  }

  // Tasks List
  const twTasks = tasks.filter(t => t.cat === 'this-week');
  
  if (twTasks.length > 8) {
    const avg = calculateWeeklyAverage();
    html += `
    <div class="card" style="border-left: 4px solid var(--orange); margin-bottom: 24px; display:flex; gap:12px; align-items:flex-start;">
      <div style="font-size:16px; margin-top:2px;">⚠️</div>
      <div>
        <div style="font-weight:600; font-size:13px;">High Workload Warning</div>
        <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">${twTasks.length} tasks this week. Your average is ${avg}/week. Consider deferring some tasks.</div>
      </div>
    </div>`;
  }

  html += sectionLabel('This Week\'s Backlog');

  if (twTasks.length === 0) {
    html += `<div class="v2-empty" style="margin-top:24px;">
      <div class="v2-empty-icon">🎯</div>
      <div class="v2-empty-text">No tasks planned for this week.</div>
    </div>`;
  } else {
    twTasks.forEach(t => {
      let badgeClass = 'pl';
      let badgeText = 'Low';
      if (t.priority === 'high') { badgeClass = 'ph'; badgeText = 'High'; }
      if (t.priority === 'medium') { badgeClass = 'pm'; badgeText = 'Medium'; }
      const priorityBadge = `<div class="badge ${badgeClass}">${badgeText}</div>`;

      html += `
      <div class="v2-task-row ${t.done ? 'done' : ''}" data-id="${t.id}" onclick="openTaskDetail('${t.id}')">
        <div class="v2-task-check ${t.done ? 'checked' : ''}" onclick="event.stopPropagation(); toggleTask('${t.id}')"></div>
        <div class="v2-task-content" style="flex: 1;">
          <div class="v2-task-text" style="margin-bottom: 2px;">${esc(t.text)}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
            ${priorityBadge}
          </div>
        </div>
      </div>`;
    });
  }

  v2.innerHTML = html;
}

// ===================== V2 RECURRING SCREEN =====================
function calcNextRunDate(rt, fromDateStr = new Date().toISOString().split('T')[0]) {
  if (rt.frequency === 'event-based') return null;
  const from = new Date(fromDateStr);
  let next = new Date(from);
  
  if (rt.frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (rt.frequency === 'weekly') {
    let currentDay = next.getDay();
    let dows = (rt.daysOfWeek || [1]).map(Number).sort();
    if (dows.length === 0) dows = [1];
    
    let daysToAdd = 7;
    for (let d of dows) {
      if (d > currentDay) { daysToAdd = d - currentDay; break; }
    }
    if (daysToAdd === 7) {
      daysToAdd = (7 - currentDay) + dows[0]; // Wrap to next week
    }
    next.setDate(next.getDate() + daysToAdd);
  } else if (rt.frequency === 'biweekly') {
    next.setDate(next.getDate() + 14);
  } else if (rt.frequency === 'monthly') {
    let targetDay = rt.dayOfMonth || 1;
    next.setMonth(next.getMonth() + 1);
    next.setDate(targetDay);
  } else if (rt.frequency === 'quarterly') {
    next.setMonth(next.getMonth() + 3);
  } else if (rt.frequency === 'annual') {
    next.setFullYear(next.getFullYear() + 1);
  }
  return next.toISOString().split('T')[0];
}

function generateRecurringTasks(todayStr) {
  let changed = false;
  recurringTasks.forEach(rt => {
    if (!rt.active || rt.frequency === 'event-based') return;
    
    // Set initial nextRunDate if missing
    if (!rt.nextRunDate) {
      rt.nextRunDate = calcNextRunDate(rt, todayStr);
      changed = true;
    }
    
    // Generate if due
    if (rt.nextRunDate <= todayStr && rt.lastGeneratedDate !== todayStr) {
      const newTask = {
        id: uid(), text: rt.title, cat: rt.targetCat || 'today',
        priority: rt.priority || 'medium', done: false, notes: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      if (rt.frequency === 'daily') newTask.daily = true;
      tasks.push(newTask);
      pushTaskToSupabase(newTask);
      
      rt.lastGeneratedDate = todayStr;
      rt.nextRunDate = calcNextRunDate(rt, rt.nextRunDate);
      rt.updatedAt = new Date().toISOString();
      changed = true;
    }
  });
  
  if (changed) {
    localStorage.setItem('v2_recurringTasks', JSON.stringify(recurringTasks));
    if (navigator.onLine && sb && currentUser) {
      recurringTasks.forEach(rt => {
        sb.from('recurring_tasks').upsert(recurringToRow(rt), {onConflict: 'id'}).then();
      });
    }
  }
}

function toggleRecurringOptions() {
  const freq = document.getElementById('recurringFrequencyInput').value;
  document.getElementById('weeklyOptions').style.display = (freq === 'weekly') ? 'block' : 'none';
  document.getElementById('monthlyOptions').style.display = (freq === 'monthly' || freq === 'quarterly' || freq === 'annual') ? 'block' : 'none';
}

function openAddRecurringModal(id = null) {
  if (id) {
    const rt = recurringTasks.find(r => r.id === id);
    if (!rt) return;
    document.getElementById('recurringModalTitle').textContent = 'Edit Recurring Task';
    document.getElementById('recurringIdInput').value = rt.id;
    document.getElementById('recurringTitleInput').value = rt.title;
    document.getElementById('recurringFrequencyInput').value = rt.frequency;
    document.getElementById('recurringDaysInput').value = rt.daysOfWeek ? rt.daysOfWeek.join(',') : '';
    document.getElementById('recurringDayOfMonthInput').value = rt.dayOfMonth || '';
    document.getElementById('recurringPriorityInput').value = rt.priority || 'medium';
    document.getElementById('recurringTargetInput').value = rt.targetCat || 'today';
    document.getElementById('recurringActiveInput').checked = rt.active;
  } else {
    document.getElementById('recurringModalTitle').textContent = 'Add Recurring Task';
    document.getElementById('recurringIdInput').value = '';
    document.getElementById('recurringTitleInput').value = '';
    document.getElementById('recurringFrequencyInput').value = 'weekly';
    document.getElementById('recurringDaysInput').value = '1';
    document.getElementById('recurringDayOfMonthInput').value = '';
    document.getElementById('recurringPriorityInput').value = 'medium';
    document.getElementById('recurringTargetInput').value = 'today';
    document.getElementById('recurringActiveInput').checked = true;
  }
  toggleRecurringOptions();
  document.getElementById('addRecurringModal').classList.add('open');
}

function closeAddRecurringModal() {
  document.getElementById('addRecurringModal').classList.remove('open');
}

function saveRecurringTask() {
  const idStr = document.getElementById('recurringIdInput').value;
  const title = document.getElementById('recurringTitleInput').value.trim();
  if (!title) return alert('Description is required');
  
  const frequency = document.getElementById('recurringFrequencyInput').value;
  const targetCat = document.getElementById('recurringTargetInput').value;
  const priority = document.getElementById('recurringPriorityInput').value;
  const active = document.getElementById('recurringActiveInput').checked;
  const daysOfWeek = document.getElementById('recurringDaysInput').value.split(',').map(s => s.trim()).filter(Boolean);
  const dayOfMonth = parseInt(document.getElementById('recurringDayOfMonthInput').value) || null;
  
  let rt;
  if (idStr) {
    rt = recurringTasks.find(r => r.id === idStr);
    if (!rt) return;
    rt.title = title; rt.frequency = frequency; rt.targetCat = targetCat;
    rt.priority = priority; rt.active = active;
    rt.daysOfWeek = daysOfWeek; rt.dayOfMonth = dayOfMonth;
    rt.updatedAt = new Date().toISOString();
    // recalc next run date just in case
    if (active) rt.nextRunDate = calcNextRunDate(rt, new Date().toISOString().split('T')[0]);
  } else {
    rt = {
      id: uid(), title, frequency, targetCat, priority, active,
      daysOfWeek, dayOfMonth, monthOfYear: null, eventTrigger: null,
      lastGeneratedDate: null, 
      updatedAt: new Date().toISOString()
    };
    if (active) rt.nextRunDate = calcNextRunDate(rt, new Date().toISOString().split('T')[0]);
    recurringTasks.push(rt);
  }
  
  localStorage.setItem('v2_recurringTasks', JSON.stringify(recurringTasks));
  if (navigator.onLine && sb && currentUser) {
    sb.from('recurring_tasks').upsert(recurringToRow(rt), {onConflict: 'id'}).then();
  }
  
  closeAddRecurringModal();
  renderRecurring();
}

function toggleRecurringActive(e, id) {
  e.stopPropagation();
  let rt = recurringTasks.find(r => r.id === id);
  if (rt) {
    rt.active = !rt.active;
    rt.updatedAt = new Date().toISOString();
    if (rt.active) rt.nextRunDate = calcNextRunDate(rt, new Date().toISOString().split('T')[0]);
    localStorage.setItem('v2_recurringTasks', JSON.stringify(recurringTasks));
    if (navigator.onLine && sb && currentUser) {
      sb.from('recurring_tasks').upsert(recurringToRow(rt), {onConflict: 'id'}).then();
    }
    renderRecurring();
  }
}

function forceTriggerRecurring(e, id) {
  e.stopPropagation();
  let rt = recurringTasks.find(r => r.id === id);
  if (rt) {
    const newTask = {
      id: uid(), text: rt.title, cat: rt.targetCat || 'today',
      priority: rt.priority || 'medium', done: false, notes: 'Manually triggered',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    tasks.push(newTask);
    pushTaskToSupabase(newTask);
    alert('Task generated in ' + (catLabels[rt.targetCat] || 'target list'));
  }
}

function renderRecurring() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="margin:0; font-size:18px;">Recurring Tasks</h2>
      <button class="btn-primary" style="padding:4px 12px; font-size:13px;" onclick="openAddRecurringModal()">+ Add</button>
    </div>
  `;

  if (recurringTasks.length === 0) {
    html += `<div class="v2-empty" style="margin-top:40px;">
      <div class="v2-empty-icon">🔁</div>
      <div class="v2-empty-text">No recurring tasks set up yet.</div>
    </div>`;
    v2.innerHTML = html;
    return;
  }

  // Group by Frequency
  const grouped = {
    'Daily / Weekly': recurringTasks.filter(r => r.frequency === 'daily' || r.frequency === 'weekly' || r.frequency === 'biweekly'),
    'Monthly / Quarterly': recurringTasks.filter(r => r.frequency === 'monthly' || r.frequency === 'quarterly'),
    'Annual': recurringTasks.filter(r => r.frequency === 'annual'),
    'Event-Triggered': recurringTasks.filter(r => r.frequency === 'event-based')
  };

  for (const [groupName, groupTasks] of Object.entries(grouped)) {
    if (groupTasks.length === 0) continue;
    
    html += sectionLabel(groupName);
    
    groupTasks.forEach(rt => {
      const activeColor = rt.active ? 'var(--green)' : 'var(--text-dim)';
      const nextDateLabel = rt.frequency === 'event-based' ? 'Trigger manually' : (rt.nextRunDate ? `Next: ${new Date(rt.nextRunDate).toLocaleDateString()}` : 'Not scheduled');
      
      html += `
      <div class="v2-task-row" data-id="${rt.id}" onclick="openAddRecurringModal('${rt.id}')">
        <div class="v2-task-check" style="border-color:${activeColor};" onclick="toggleRecurringActive(event, '${rt.id}')">
          <div style="width:12px; height:12px; border-radius:50%; background:${activeColor}; opacity:${rt.active?1:0.3}; margin:auto;"></div>
        </div>
        <div class="v2-task-content" style="flex:1;">
          <div class="v2-task-text" style="color: ${rt.active ? 'var(--text)' : 'var(--text-dim)'};">${esc(rt.title)}</div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
            <div class="badge" style="background:var(--teal-transparent); color:var(--teal-400); font-weight:500; font-size:10px;">
              ${rt.frequency.toUpperCase()}
            </div>
            <div style="font-size:11px; color:var(--text-dim);">
              ${nextDateLabel}
            </div>
          </div>
        </div>
        ${rt.frequency === 'event-based' ? `
        <button onclick="forceTriggerRecurring(event, '${rt.id}')" style="background:var(--bg-layer-2); border:none; color:var(--text); padding:6px 10px; border-radius:4px; font-size:11px; cursor:pointer; flex-shrink: 0;">
          Trigger Now
        </button>` : ''}
      </div>`;
    });
  }

  v2.innerHTML = html;
}

// ===================== V2 COMPLIANCE SCREEN =====================
function markComplianceDone(id) {
  try {
    const userState = JSON.parse(localStorage.getItem(COMPLIANCE_KEY) || '{}');
    if (!userState[id]) userState[id] = {};
    userState[id].lastDoneDate = todayStr();
    localStorage.setItem(COMPLIANCE_KEY, JSON.stringify(userState));
    
    // Refresh
    renderCompliance();
    renderBottomNav();
  } catch (e) {
  }
}

// ===================== CUSTOM COMPLIANCE =====================
const CUSTOM_COMPLIANCE_KEY = 'malveon_custom_compliance';

function openCustomComplianceModal() {
  document.getElementById('ccTitleInput').value = '';
  document.getElementById('ccFreqInput').value = 'monthly';
  document.getElementById('ccMonthInput').value = '';
  document.getElementById('ccDayInput').value = '';
  document.getElementById('ccDescInput').value = '';
  toggleCcFreq();
  document.getElementById('customComplianceModal').classList.add('open');
}

function closeCustomComplianceModal() {
  document.getElementById('customComplianceModal').classList.remove('open');
}

function toggleCcFreq() {
  const freq = document.getElementById('ccFreqInput').value;
  document.getElementById('ccMonthGroup').style.display = (freq === 'annual' || freq === 'quarterly') ? 'block' : 'none';
}

function saveCustomCompliance() {
  const title = document.getElementById('ccTitleInput').value.trim();
  const freq = document.getElementById('ccFreqInput').value;
  const month = parseInt(document.getElementById('ccMonthInput').value, 10);
  const day = parseInt(document.getElementById('ccDayInput').value, 10);
  const desc = document.getElementById('ccDescInput').value.trim();

  if (!title || !day) return;
  
  const newItem = {
    id: 'cc_' + Date.now(),
    title, freq, desc, penalty: 'Custom',
    day: day
  };
  if (freq === 'annual' || freq === 'quarterly') {
    if (isNaN(month)) return;
    newItem.month = month - 1;
  }

  const customItems = JSON.parse(localStorage.getItem(CUSTOM_COMPLIANCE_KEY) || '[]');
  customItems.push(newItem);
  localStorage.setItem(CUSTOM_COMPLIANCE_KEY, JSON.stringify(customItems));
  
  closeCustomComplianceModal();
  renderCompliance();
}

function renderCompliance() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  let userState = {};
  try { userState = JSON.parse(localStorage.getItem(COMPLIANCE_KEY) || '{}'); } catch(e) {}

  const customItems = JSON.parse(localStorage.getItem(CUSTOM_COMPLIANCE_KEY) || '[]');
  const allMeta = [...COMPLIANCE_METADATA, ...customItems];

  const items = allMeta.map(m => {
    const lastDone = userState[m.id]?.lastDoneDate;
    const dueDate = calcComplianceDueDate(m, lastDone);
    const status = getComplianceStatus(dueDate, lastDone);
    
    // Date math for days remaining
    const due = new Date(dueDate);
    const now = new Date(todayStr());
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    
    return { ...m, dueDate, status, diff, lastDoneDate: lastDone };
  });

  // Metrics
  const redCount = items.filter(i => i.status === 'red').length;
  const yellowCount = items.filter(i => i.status === 'yellow').length;
  const greenCount = items.filter(i => i.status === 'green').length;
  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="margin:0; font-size:18px;">Compliance Ops</h2>
      <button onclick="openCustomComplianceModal()" style="background:var(--teal-400); color:white; border:none; padding:6px 12px; border-radius:12px; font-size:12px; font-weight:600; cursor:pointer;">+ Add Custom</button>
    </div>
    <div class="metric-cards-row" style="margin-bottom:24px;">
      ${metricCard('Overdue', redCount, redCount > 0 ? 'red' : '')}
      ${metricCard('Due Soon', yellowCount, yellowCount > 0 ? 'amber' : '')}
      ${metricCard('Clear', greenCount, 'green')}
    </div>
  `;

  // Grouping
  const overdue = items.filter(i => i.status === 'red');
  const thisMonth = items.filter(i => i.status !== 'red' && i.dueDate.startsWith(todayStr().substring(0, 7)));
  const upcoming = items.filter(i => i.status !== 'red' && !i.dueDate.startsWith(todayStr().substring(0, 7)) && i.freq !== 'annual');
  const annualBound = items.filter(i => i.status !== 'red' && !i.dueDate.startsWith(todayStr().substring(0, 7)) && i.freq === 'annual');

  const renderList = (list, title) => {
    if (list.length === 0) return '';
    let s = sectionLabel(title);
    list.forEach(i => {
      let statusColor = 'var(--green-400)';
      let statusText = i.diff === 0 ? 'Due Today' : (i.diff > 0 ? `In ${i.diff} days` : `${Math.abs(i.diff)}d overdue`);
      if (i.status === 'red') statusColor = 'var(--red-400)';
      if (i.status === 'yellow') statusColor = 'var(--amber-400)';
      if (i.status === 'green' && i.lastDoneDate >= i.dueDate) {
          statusText = 'Completed';
          statusColor = 'var(--green-400)';
      }

      const showButton = i.status !== 'green' || !i.lastDoneDate || i.lastDoneDate < i.dueDate;

      s += `
      <div class="v2-task-card" style="margin-bottom:12px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:8px; height:8px; border-radius:50%; background:${statusColor};"></div>
            <div style="font-weight:700; font-size:15px; color:var(--text);">${i.title}</div>
          </div>
          <div style="font-size:12px; font-weight:600; color:${statusColor};">${statusText}</div>
        </div>
        <div style="font-size:13px; color:var(--text-dim); line-height:1.4; margin-bottom:12px;">${i.desc}</div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Due: ${i.dueDate}</div>
          ${showButton ? 
            `<button onclick="markComplianceDone('${i.id}')" style="background:rgba(83, 74, 183, 0.1); color:var(--teal-400); border:none; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">Mark Done</button>` :
            `<div style="font-size:11px; color:var(--green-400); font-weight:600;">✅ Done</div>`
          }
        </div>
      </div>`;
    });
    return s;
  };

  html += renderList(overdue, 'Overdue');
  html += renderList(thisMonth, 'Due This Month');
  html += renderList(upcoming, 'Upcoming');
  html += renderList(annualBound, 'Annual & Renewals');

  v2.innerHTML = html;
}

// ===================== V2 OKR SCREEN =====================
function renderOkrTasks(okrName) {
  if (!okrName) return '';
  const linked = tasks.filter(t => t.okrId === okrName);
  if (linked.length === 0) return '';
  const done = linked.filter(t => t.done).length;
  const pct = Math.round((done / linked.length) * 100);
  let s = `
    <div style="margin-top:16px; background:rgba(0,0,0,0.1); border-radius:8px; padding:12px;">
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:8px;">
        <span style="color:var(--text); font-weight:600;">Linked Tasks</span>
        <span style="color:var(--text-muted);">${done}/${linked.length} (${pct}%)</span>
      </div>
      <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden; margin-bottom:12px;">
        <div style="width:${pct}%; height:100%; background:var(--accent);"></div>
      </div>
      <details>
        <summary style="font-size:12px; color:var(--teal-400); cursor:pointer; font-weight:600; outline:none;">Show ${linked.length} tasks</summary>
        <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
          ${linked.map(t => `<div style="font-size:13px; display:flex; gap:8px; color:${t.done ? 'var(--text-muted)' : 'var(--text)'}; text-decoration:${t.done ? 'line-through' : 'none'}; cursor:pointer;" onclick="openTaskDetail('${t.id}')">
            ${statusDot(t.done ? 'green' : 'yellow')} ${esc(t.text)}
          </div>`).join('')}
        </div>
      </details>
    </div>
  `;
  return s;
}

function renderOkrTab() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const currentOkr = JSON.parse(localStorage.getItem(OKR_KEY) || 'null');
  const history = getOkrHistory();
  
  let html = `
    <div style="margin-bottom:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div style="font-weight:800; font-size:18px; color:var(--text);">Current Objective</div>
        <button onclick="openOkrModal()" style="background:var(--teal-400); color:white; border:none; padding:6px 14px; border-radius:12px; font-size:12px; font-weight:600; cursor:pointer;">Set OKR</button>
      </div>
  `;

  if (currentOkr) {
    const progress = calcOkrProgressPercent(currentOkr);
    const color = progress === 100 ? 'var(--green-400)' : (progress >= 50 ? 'var(--amber-400)' : 'var(--red-400)');
    
    html += `
      <div class="v2-card accent-left" style="padding:20px; margin-bottom:32px;">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Week of ${currentOkr.weekStart}</div>
        <div style="font-size:20px; font-weight:800; color:var(--text); margin-bottom:16px;">${currentOkr.one}</div>
        
        <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden; margin-bottom:8px;">
          <div style="width:${progress}%; height:100%; background:${color}; box-shadow:0 0 10px ${color}44; transition: width 0.3s ease;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:12px; font-weight:600; color:${color};">${progress}% Complete</div>
          <div style="display:flex; gap:12px;">
            ${currentOkr.bonus1 ? `<div style="font-size:11px; color:${currentOkr.bonus1Done ? 'var(--green-400)' : 'var(--text-muted)'}; font-weight:600;" title="${esc(currentOkr.bonus1)}">Bonus 1 ${currentOkr.bonus1Done ? '✓' : '○'}</div>` : ''}
            ${currentOkr.bonus2 ? `<div style="font-size:11px; color:${currentOkr.bonus2Done ? 'var(--green-400)' : 'var(--text-muted)'}; font-weight:600;" title="${esc(currentOkr.bonus2)}">Bonus 2 ${currentOkr.bonus2Done ? '✓' : '○'}</div>` : ''}
          </div>
        </div>
        ${renderOkrTasks(currentOkr.one)}
        ${renderOkrTasks(currentOkr.bonus1)}
        ${renderOkrTasks(currentOkr.bonus2)}
      </div>
    `;
  } else {
    html += `
      <div class="v2-empty" style="padding:40px 20px;">
        <div style="font-size:32px; margin-bottom:12px;">🎯</div>
        <div style="font-weight:700; color:var(--text);">No OKR set for this week</div>
        <div style="font-size:13px; color:var(--text-dim); margin-bottom:20px;">Define your One Thing to drive focus.</div>
      </div>
    `;
  }

  if (history.length > 0) {
    html += sectionLabel('Performance History');
    history.forEach((okr, index) => {
      const progress = calcOkrProgressPercent(okr);
      const color = progress === 100 ? 'var(--green-400)' : (progress >= 50 ? 'var(--amber-400)' : 'var(--red-400)');
      const opacity = Math.max(0.35, 0.8 - (index * 0.15));
      
      html += `
        <div class="v2-card" style="padding:16px; margin-bottom:12px; opacity:${opacity};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div style="font-size:11px; font-weight:600; color:var(--text-muted);">${okr.weekStart}</div>
            <div style="font-size:11px; font-weight:800; color:${color};">${progress}%</div>
          </div>
          <div style="font-size:14px; font-weight:700; color:var(--text); margin-bottom:10px;">${okr.one}</div>
          <div style="height:3px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden;">
            <div style="width:${progress}%; height:100%; background:${color};"></div>
          </div>
          ${renderOkrTasks(okr.one)}
        </div>
      `;
    });
  }

  html += `</div>`;
  v2.innerHTML = html;
}

// ===================== V2 CRM: PIPELINE =====================
function calcProspectHealth(p) {
  if (!p.nextFollowupDate) return 'var(--text-muted)';
  const diff = (new Date(p.nextFollowupDate) - new Date()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'var(--red-400)';
  if (diff <= 3) return 'var(--amber-400)';
  return 'var(--green-400)';
}

function renderPipeline(filter = 'all') {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const filtered = filter === 'all' ? prospects : prospects.filter(p => p.status === filter);
  const overdue = prospects.filter(p => {
      if (p.status === 'won' || p.status === 'lost') return false;
      return p.nextFollowupDate && new Date(p.nextFollowupDate) <= new Date();
  });

  let html = `
    <div style="margin-bottom:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2 style="margin:0; font-size:18px;">Sales Pipeline</h2>
        <div style="display:flex; gap:8px;">
          <button onclick="importProspectsFromStagingFile()" class="v2-button-secondary" style="padding:6px 12px; font-size:12px;">Import from Prep</button>
          <button onclick="openAddProspectModal()" class="v2-button-teal" style="padding:6px 12px; font-size:12px;">+ Prospect</button>
        </div>
      </div>
  `;

  if (overdue.length > 0) {
      html += `
        <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:12px; padding:12px; margin-bottom:20px; display:flex; align-items:center; gap:12px;">
            <div style="font-size:20px;">📢</div>
            <div>
                <div style="font-weight:700; color:var(--red-400); font-size:14px;">${overdue.length} Follow-ups Overdue</div>
                <div style="font-size:12px; color:var(--red-400); opacity:0.8;">Priority outreach needed today.</div>
            </div>
        </div>
      `;
  }

  // Filter Chips
  const stages = ['all', 'new', 'contacted', 'discovery', 'pilot', 'won'];
  html += `<div class="chips-row" style="margin-bottom:20px;">`;
  stages.forEach(s => {
      const active = filter === s;
      html += `<div onclick="renderPipeline('${s}')" class="chip ${active?'active':''}" style="text-transform:capitalize;">${s}</div>`;
  });
  html += `</div>`;

  if (filtered.length === 0) {
      html += `<div class="v2-empty">No prospects in ${filter}</div>`;
  } else {
      filtered.forEach(p => {
          const health = calcProspectHealth(p);
          const nameInitials = p.name ? p.name.split(' ').map(n=>n[0]).join('').slice(0,2) : '??';
          
          html += `
            <div class="v2-task-row" style="padding:16px; margin-bottom:12px; display:flex; gap:16px; align-items:center;" onclick="openProspectDetail('${p.id}')">
                <div class="avatar-circle" style="width:40px; height:40px; flex-shrink:0; background:var(--bg-secondary); border:1px solid rgba(255,255,255,0.05);">${nameInitials}</div>
                <div class="v2-task-content" style="flex-grow:1;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div class="v2-task-text" style="font-weight:700; font-size:15px; color:var(--text);">${p.name}</div>
                        <div style="width:8px; height:8px; border-radius:50%; background:${health}; box-shadow:0 0 8px ${health}44;"></div>
                    </div>
                    <div style="font-size:13px; color:var(--text-dim);">${p.title} · ${p.company}</div>
                    <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
                        <div class="badge teal" style="font-size:10px; text-transform:capitalize;">${p.status}</div>
                        <div style="font-size:11px; color:var(--text-muted);">Next: ${p.nextFollowupDate || 'N/A'}</div>
                    </div>
                </div>
            </div>
          `;
      });
  }

  html += `</div>`;
  v2.innerHTML = html;
}

// ===================== V2 CRM: PILOTS =====================
function renderPilots() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  let html = `
    <div style="margin-bottom:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2 style="margin:0; font-size:18px;">Active Pilots</h2>
        <button onclick="openAddPilotModal()" class="v2-button-teal" style="padding:6px 12px; font-size:12px;">+ Pilot</button>
      </div>
  `;

  if (pilots.length === 0) {
      html += `
        <div class="v2-empty" style="padding:60px 20px;">
            <div style="font-size:32px; margin-bottom:12px;">✈️</div>
            <div style="font-weight:700; color:var(--text);">No pilots in progress</div>
            <div style="font-size:13px; color:var(--text-dim);">Close a prospect to start onboarding.</div>
        </div>
      `;
  } else {
      pilots.forEach(p => {
          const healthColor = p.health === 'green' ? 'var(--green-400)' : (p.health === 'yellow' ? 'var(--amber-400)' : 'var(--red-400)');
          const daysSince = p.lastCheckinDate ? Math.floor((new Date() - new Date(p.lastCheckinDate))/(1000*60*60*24)) : '?';
          
          html += `
            <div class="v2-task-row" style="padding:20px; margin-bottom:20px; border-top: 4px solid ${healthColor}; display:block; cursor:default; transform:none;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <div style="font-size:18px; font-weight:800; color:var(--text);">${p.company}</div>
                        <div style="font-size:13px; color:var(--text-dim);">${p.contactName}</div>
                    </div>
                    <div onclick="cyclePilotHealth('${p.id}')" style="width:24px; height:24px; border-radius:50%; background:${healthColor}; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px ${healthColor}44;">
                        <div style="width:8px; height:8px; border-radius:50%; background:rgba(0,0,0,0.2);"></div>
                    </div>
                </div>

                <div style="display:flex; gap:16px; margin-bottom:20px;">
                    <div style="flex:1; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:8px;">
                        <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Onboarding</div>
                        <div style="font-size:13px; font-weight:700; color:var(--teal-400);">${p.onboardingStatus}</div>
                    </div>
                    <div style="flex:1; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:8px;">
                        <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Last Check-in</div>
                        <div style="font-size:13px; font-weight:700; color:${daysSince>14?'var(--red-400)':'var(--text)'}">${daysSince} days ago</div>
                    </div>
                </div>

                <div style="font-size:12px; font-weight:700; color:var(--text); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                    <span>Onboarding Checklist</span>
                    <span style="font-weight:400; opacity:0.6; font-size:11px;">(Tap to toggle)</span>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                    ${['Payment', 'Kickoff', 'Slack', 'Jira', 'Github', 'Day 7', 'Day 30'].map((item, idx) => {
                        const done = (p.onboardingItems || []).includes(item);
                        return `
                            <div onclick="toggleOnboardingItem('${p.id}', '${item}')" style="display:flex; align-items:center; gap:8px; padding:6px 10px; background:rgba(255,255,255,0.02); border-radius:6px; font-size:12px; cursor:pointer;">
                                <div style="width:14px; height:14px; border-radius:4px; border:1px solid ${done?'var(--green-400)':'rgba(255,255,255,0.1)'}; background:${done?'var(--green-400)':'transparent'}; display:flex; align-items:center; justify-content:center;">
                                    ${done ? '<div style="width:6px; height:3px; border-left:2px solid white; border-bottom:2px solid white; transform:rotate(-45deg) translateY(-1px);"></div>' : ''}
                                </div>
                                <span style="opacity:${done?0.5:1}; color:${done?'var(--text-dim)':'var(--text)'}">${item}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
          `;
      });
  }

  html += `</div>`;
  v2.innerHTML = html;
}

// ===================== V2 CRM: INSIGHTS =====================
function renderInsights(filter = 'all') {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const filtered = filter === 'all' ? insights : insights.filter(i => i.theme === filter);
  const themes = ['all', 'incident-triage', 'context-loss', 'jira-gap', 'hiring', 'other'];

  let html = `
    <div style="margin-bottom:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2 style="margin:0; font-size:18px;">Product Intelligence</h2>
        <button onclick="openAddInsightModal()" class="v2-button-teal" style="padding:6px 12px; font-size:12px;">+ Insight</button>
      </div>

      <div class="chips-row" style="margin-bottom:20px;">
        ${themes.map(t => `<div onclick="renderInsights('${t}')" class="chip ${filter===t?'active':''}" style="text-transform:capitalize;">${t.replace('-',' ')}</div>`).join('')}
      </div>
  `;

  if (filtered.length === 0) {
      html += `<div class="v2-empty">No insights collected yet</div>`;
  } else {
      filtered.sort((a,b) => new Date(b.date) - new Date(a.date));
      filtered.forEach(i => {
          let themeColor = 'var(--teal-400)';
          if (i.theme === 'incident-triage') themeColor = 'var(--red-400)';
          if (i.theme === 'context-loss') themeColor = 'var(--amber-400)';
          if (i.theme === 'jira-gap') themeColor = 'var(--amber-400)';
          
          html += `
            <div class="v2-card" style="padding:16px; margin-bottom:16px;">
                <div style="font-size:15px; font-style:italic; line-height:1.5; color:var(--text); margin-bottom:12px; position:relative; padding-left:12px; border-left:3px solid ${themeColor};">
                    "${i.quote}"
                </div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div>
                        <div style="font-size:13px; font-weight:700; color:var(--text);">${i.contactName}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${i.company}</div>
                    </div>
                    <div style="text-align:right;">
                        <div class="badge" style="background:${themeColor}22; color:${themeColor}; margin-bottom:4px; font-size:10px;">${i.theme}</div>
                        <div style="font-size:10px; color:var(--text-muted);">${i.date}</div>
                    </div>
                </div>
            </div>
          `;
      });
  }

  html += `</div>`;
  v2.innerHTML = html;
}

// CRM Interactive Helpers
function cyclePilotHealth(id) {
    const p = pilots.find(p => p.id === id);
    if (!p) return;
    const states = ['green', 'yellow', 'red'];
    const idx = states.indexOf(p.health || 'green');
    p.health = states[(idx + 1) % 3];
    pushPilotToSupabase(p); // Assuming we'll add this
    renderPilots();
}

function toggleOnboardingItem(id, item) {
    const p = pilots.find(p => p.id === id);
    if (!p) return;
    if (!p.onboardingItems) p.onboardingItems = [];
    const idx = p.onboardingItems.indexOf(item);
    if (idx >= 0) p.onboardingItems.splice(idx, 1);
    else p.onboardingItems.push(item);
    
    // Update status badge text based on count
    const total = 7;
    const count = p.onboardingItems.length;
    if (count === 0) p.onboardingStatus = 'Not Started';
    else if (count === total) p.onboardingStatus = 'Completed';
    else p.onboardingStatus = `In Progress (${count}/${total})`;

    pushPilotToSupabase(p);
    renderPilots();
}

function pushPilotToSupabase(p) {
    p.updatedAt = new Date().toISOString();
    localStorage.setItem('malveon_pilots', JSON.stringify(pilots));
    if (sb && currentUser) {
        sb.from('pilots').upsert(pilotToRow(p)).then();
    }
}

// Prospect Handlers
function openAddProspectModal(id = null) {
    if (id) {
        const p = prospects.find(x => x.id === id);
        if (p) {
            document.getElementById('prospectModalTitle').textContent = 'Edit Prospect';
            document.getElementById('prospectIdInput').value = p.id;
            document.getElementById('prospectNameInput').value = p.name;
            document.getElementById('prospectCompanyInput').value = p.company;
            document.getElementById('prospectTitleInput').value = p.title;
            document.getElementById('prospectLinkedinInput').value = p.linkedinUrl || '';
            document.getElementById('prospectEmailInput').value = p.email || '';
            document.getElementById('prospectStatusInput').value = p.status;
            document.getElementById('prospectNotesInput').value = p.notes || '';
        }
    } else {
        document.getElementById('prospectModalTitle').textContent = 'Add Prospect';
        document.getElementById('prospectIdInput').value = '';
        document.getElementById('prospectNameInput').value = '';
        document.getElementById('prospectCompanyInput').value = '';
        document.getElementById('prospectTitleInput').value = '';
        document.getElementById('prospectLinkedinInput').value = '';
        document.getElementById('prospectEmailInput').value = '';
        document.getElementById('prospectStatusInput').value = 'new';
        document.getElementById('prospectNotesInput').value = '';
    }
    document.getElementById('prospectModal').classList.add('open');
}

function closeProspectModal() {
    document.getElementById('prospectModal').classList.remove('open');
}

function saveProspect() {
    const id = document.getElementById('prospectIdInput').value || uid();
    const p = {
        id,
        name: document.getElementById('prospectNameInput').value.trim(),
        company: document.getElementById('prospectCompanyInput').value.trim(),
        title: document.getElementById('prospectTitleInput').value.trim(),
        linkedinUrl: document.getElementById('prospectLinkedinInput').value.trim(),
        email: document.getElementById('prospectEmailInput').value.trim(),
        status: document.getElementById('prospectStatusInput').value,
        notes: document.getElementById('prospectNotesInput').value.trim(),
        updatedAt: new Date().toISOString()
    };

    if (!p.name) return alert('Name is required');

    const idx = prospects.findIndex(x => x.id === id);
    if (idx >= 0) prospects[idx] = p;
    else prospects.push(p);

    pushProspectToSupabase(p);
    closeProspectModal();
    renderPipeline();
}

function openProspectDetail(id) {
    const p = prospects.find(x => x.id === id);
    if (!p) return;
    
    const health = calcProspectHealth(p);
    const detailEl = document.getElementById('prospectDetailPanel');
    detailEl.innerHTML = `
        <div style="padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
                <div style="width:40px; height:40px; border-radius:50%; background:var(--bg-secondary); display:flex; align-items:center; justify-content:center; font-weight:800; border:1px solid rgba(255,255,255,0.05)">${p.name[0]}</div>
                <button onclick="closeProspectDetail()" style="background:none; border:none; color:var(--text-dim); font-size:24px; cursor:pointer;">&times;</button>
            </div>
            
            <div style="font-size:22px; font-weight:800; color:var(--text); margin-bottom:4px;">${p.name}</div>
            <div style="font-size:14px; color:var(--text-dim); margin-bottom:16px;">${p.title} · ${p.company}</div>
            
            <div style="display:flex; gap:12px; margin-bottom:24px;">
                <div class="badge teal" style="text-transform:capitalize; font-size:12px; padding:6px 12px;">${p.status}</div>
                <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted);">
                    <div style="width:8px; height:8px; border-radius:50%; background:${health};"></div>
                    Health: ${health === 'var(--red-400)' ? 'At Risk' : (health === 'var(--amber-400)' ? 'Attention' : 'Healthy')}
                </div>
            </div>

            <div style="background:var(--bg-secondary); border-radius:12px; padding:16px; margin-bottom:24px;">
                <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Timeline</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                    <div>
                        <div style="font-size:10px; color:var(--text-dim);">Last Contact</div>
                        <div style="font-size:13px; font-weight:600;">${p.lastContactDate || 'Never'}</div>
                    </div>
                    <div>
                        <div style="font-size:10px; color:var(--text-dim);">Next Follow-up</div>
                        <div style="font-size:13px; font-weight:600; color:${health};">${p.nextFollowupDate || 'Set date'}</div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom:24px;">
                <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Actions</div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <a href="${p.linkedinUrl || '#'}" target="_blank" class="v2-button-secondary" style="text-decoration:none; text-align:center; display:block;">View LinkedIn Profile</a>
                    <button onclick="updateProspectStatus('${p.id}', 'contacted')" class="v2-button-teal">Mark as Contacted</button>
                    <button onclick="openAddProspectModal('${p.id}'); closeProspectDetail();" class="v2-button-secondary">Edit Details</button>
                </div>
            </div>

            <div>
                <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Notes</div>
                <div style="font-size:14px; color:var(--text); line-height:1.6; white-space:pre-wrap;">${p.notes || 'No notes added.'}</div>
            </div>
        </div>
    `;
    document.getElementById('prospectDetailOverlay').classList.add('open');
}

function closeProspectDetail() {
    document.getElementById('prospectDetailOverlay').classList.remove('open');
}

function updateProspectStatus(id, status) {
    const p = prospects.find(x => x.id === id);
    if (!p) return;
    p.status = status;
    p.lastContactDate = new Date().toISOString().split('T')[0];
    
    // Auto-calculate next follow up
    const next = new Date();
    if (status === 'contacted') next.setDate(next.getDate() + 4);
    else if (status === 'discovery') next.setDate(next.getDate() + 3);
    else next.setDate(next.getDate() + 7);
    
    p.nextFollowupDate = next.toISOString().split('T')[0];
    
    pushProspectToSupabase(p);
    closeProspectDetail();
    renderPipeline();
}

function pushProspectToSupabase(p) {
    p.updatedAt = new Date().toISOString();
    localStorage.setItem('malveon_prospects', JSON.stringify(prospects));
    if (sb && currentUser) {
        sb.from('prospects').upsert(prospectToRow(p)).then();
    }
}

// Pilot Handlers
function openAddPilotModal() {
    document.getElementById('pilotModal').classList.add('open');
}

function closePilotModal() {
    document.getElementById('pilotModal').classList.remove('open');
}

function savePilot() {
    const p = {
        id: uid(),
        company: document.getElementById('pilotCompanyInput').value.trim(),
        contactName: document.getElementById('pilotContactNameInput').value.trim(),
        contactEmail: document.getElementById('pilotContactEmailInput').value.trim(),
        startDate: document.getElementById('pilotStartDateInput').value,
        successMetric: document.getElementById('pilotMetricInput').value.trim(),
        mrrUsd: parseInt(document.getElementById('pilotMrrInput').value) || 99,
        health: 'green',
        onboardingStatus: 'Not Started',
        onboardingItems: [],
        updatedAt: new Date().toISOString()
    };

    if (!p.company) return alert('Company name is required');
    pilots.push(p);
    pushPilotToSupabase(p);
    closePilotModal();
    renderPilots();
}

// Insight Handlers
function openAddInsightModal() {
    document.getElementById('insightModal').classList.add('open');
}

function closeInsightModal() {
    document.getElementById('insightModal').classList.remove('open');
}

function saveInsight() {
    const i = {
        id: uid(),
        quote: document.getElementById('insightQuoteInput').value.trim(),
        contactName: document.getElementById('insightContactInput').value.trim(),
        company: document.getElementById('insightCompanyInput').value.trim(),
        theme: document.getElementById('insightThemeInput').value,
        source: document.getElementById('insightSourceInput').value,
        date: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString()
    };

    if (!i.quote) return alert('Quote is required');
    insights.push(i);
    pushInsightToSupabase(i);
    closeInsightModal();
    renderInsights();
}

function pushInsightToSupabase(i) {
    i.updatedAt = new Date().toISOString();
    localStorage.setItem('malveon_insights', JSON.stringify(insights));
    if (sb && currentUser) {
        sb.from('insights').upsert(insightToRow(i)).then();
    }
}




// ===================== V2 REMINDERS SCREEN =====================
function renderReminders() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const pendingReminders = tasks.filter(t => !t.done && t.reminderTime);
  
  // Sort by time
  pendingReminders.sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="margin:0; font-size:18px;">Reminders</h2>
    </div>
  `;

  if (pendingReminders.length === 0) {
    html += `<div class="v2-empty" style="margin-top:40px;">
      <div class="v2-empty-icon">🔔</div>
      <div class="v2-empty-text">No active reminders.</div>
    </div>`;
    v2.innerHTML = html;
    return;
  }

  // In this simple version, we just show one list for now, 
  // but let's fulfill the grouping (Today / Tomorrow / Later)
  const today = todayStr();
  const todayR = pendingReminders; // For now assuming reminders are daily per prompt logic or just sorting

  html += sectionLabel('Upcoming Reminders');

  pendingReminders.forEach(t => {
    let badgeClass = 'pl';
    let badgeText = 'Low';
    if (t.priority === 'high') { badgeClass = 'ph'; badgeText = 'High'; }
    if (t.priority === 'medium') { badgeClass = 'pm'; badgeText = 'Medium'; }
    
    html += `
    <div class="v2-task-row" data-id="${t.id}" onclick="openTaskDetail('${t.id}')">
      <div style="flex-shrink: 0; width: 56px; font-weight: 700; color: var(--teal-400); font-size: 14px; padding-top: 1px;">${t.reminderTime}</div>
      <div class="v2-task-content" style="flex:1;">
        <div class="v2-task-text">${esc(t.text)}</div>
        <div style="margin-top:4px;">
          <div class="badge ${badgeClass}">${badgeText}</div>
        </div>
      </div>
    </div>`;
  });

  v2.innerHTML = html;
}

// ===================== V2 DONE SCREEN =====================
function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return date.toLocaleDateString();
}

function getTodayFocusMinsValue() {
  let focusMins = 0;
  try {
    const focusData = JSON.parse(localStorage.getItem(FOCUS_KEY) || '[]');
    const today = todayStr();
    focusData.forEach(f => { if (f.date === today) focusMins += f.minutes; });
  } catch(e) {}
  if (activeFocusTaskId) focusMins += Math.floor(timerSeconds / 60);
  return focusMins;
}

function renderDone() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const doneTasks = tasks.filter(t => t.done);
  doneTasks.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  // Metrics
  const today = todayStr();
  const doneToday = doneTasks.filter(t => (t.completedAt || '').startsWith(today)).length;
  
  // This week (Mon-Sun)
  const monday = getMondayOfCurrentWeek();
  const doneThisWeek = doneTasks.filter(t => (t.completedAt || '') >= monday).length;
  
  const focusMins = getTodayFocusMinsValue();
  const focusStr = `${Math.floor(focusMins/60)}h ${focusMins%60}m`;

  let html = `
    <div class="metric-cards-row" style="margin-bottom:24px;">
      ${metricCard('Done Today', activeFocusTaskId ? 'Focusing...' : doneToday, doneToday > 0 ? 'green' : '')}
      ${metricCard('This Week', doneThisWeek, 'teal')}
      ${metricCard('Focus Time', focusStr, focusMins > 0 ? 'amber' : '')}
    </div>
  `;

  if (doneTasks.length === 0) {
    html += `<div class="v2-empty" style="margin-top:40px;">
      <div class="v2-empty-icon">✅</div>
      <div class="v2-empty-text">No completed tasks yet. Keep going!</div>
    </div>`;
  } else {
    html += sectionLabel('Recently Completed');
    doneTasks.forEach(t => {
      html += `
      <div class="v2-task-row done" data-id="${t.id}" onclick="openTaskDetail('${t.id}')">
        <div class="v2-task-check checked" onclick="event.stopPropagation(); toggleTask('${t.id}')"></div>
        <div class="v2-task-content" style="flex:1;">
          <div class="v2-task-text" style="text-decoration:line-through; color:var(--text-dim);">${esc(t.text)}</div>
          ${t.notes ? `<div style="font-size:12px; color:var(--text-dim); font-style:italic; margin-top:4px;">${esc(t.notes)}</div>` : ''}
        </div>
        <div style="font-size:11px; color:var(--text-dim); margin-left:8px; flex-shrink: 0;">${formatTimeAgo(t.completedAt)}</div>
      </div>`;
    });
  }

  v2.innerHTML = html;
}

// ===================== V3 SEARCH & BULK =====================
let currentSearchQuery = '';
let bulkMode = false;

function searchTasks(query) { currentSearchQuery = query.toLowerCase(); renderTasks(); }

function toggleBulkActions() {
  bulkMode = !bulkMode;
  document.getElementById('bulkActionBar').style.display = bulkMode ? 'flex' : 'none';
  renderTasks();
}

function updateBulkCount() {
  const count = document.querySelectorAll('.bulk-checkbox:checked').length;
  document.getElementById('bulkCount').textContent = count;
}

async function applyBulkAction(type, value) {
  const checked = document.querySelectorAll('.bulk-checkbox:checked');
  if (checked.length === 0) return;
  for (let cb of checked) {
    const id = cb.value;
    const t = tasks.find(x => x.id === id);
    if (!t) continue;
    if (type === 'delete') {
      tasks = tasks.filter(x => x.id !== id);
      deleteTaskFromSupabase(id);
    } else if (type === 'status') {
      if (!value) continue;
      t.status = value;
      t.done = (value === 'done');
      t.updatedAt = new Date().toISOString();
      pushTaskToSupabase(t);
    } else if (type === 'phase') {
      if (!value) continue;
      t.phase = value;
      t.updatedAt = new Date().toISOString();
      pushTaskToSupabase(t);
    }
  }
  save();
  toggleBulkActions(); 
}

// ===================== V3 DOMAINS, KAVIN, CALENDAR =====================
const DOMAINS = ['General', 'Product', 'Engineering', 'Sales', 'Marketing', 'Operations', 'Design', 'Finance', 'Legal', 'HR', 'Support', 'Growth'];
const DOMAIN_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#6366f1', '#a855f7', '#d946ef'];

function renderDomainView() {
  const tb = document.getElementById('v3Toolbar');
  if (tb) tb.style.display = 'none';

  let html = `<div class="domains-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; padding:16px;">`;
  
  DOMAINS.forEach((dom, i) => {
    const domTasks = tasks.filter(t => (t.domain || 'General') === dom);
    const total = domTasks.length;
    const notStarted = domTasks.filter(t => (t.status || 'not-started') === 'not-started').length;
    const inProgress = domTasks.filter(t => t.status === 'in-progress').length;
    const blocked = domTasks.filter(t => t.status === 'blocked').length;
    
    html += `
      <div class="view-card" style="border-left: 4px solid ${DOMAIN_COLORS[i]}; cursor: pointer;" onclick="filterByDomain('${dom}')">
        <h3 style="margin:0 0 4px 0;">${dom}</h3>
        <p style="font-size:24px; font-weight:600; margin:0 0 8px 0;">${total} <span style="font-size:12px;font-weight:normal;color:var(--text-light);">tasks</span></p>
        <div style="font-size:12px; color:var(--text-light); display:flex; gap:8px;">
          <span>○ ${notStarted}</span>
          <span style="color:#3b82f6;">◑ ${inProgress}</span>
          <span style="color:#ef4444;">⊗ ${blocked}</span>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  document.getElementById('taskList').innerHTML = html;
}

function filterByDomain(dom) {
  switchTab('Inbox');
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = dom;
  searchTasks(dom);
}

function renderKavinView() {
  renderTasks();
}

let currentCalendarDate = new Date();

function renderCalendarView() {
  const tb = document.getElementById('v3Toolbar');
  if (tb) tb.style.display = 'none';

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const todayStr = new Date().toISOString().split('T')[0];

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay(); 
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  let html = `
    <div class="calendar-header" style="display:flex; justify-content:space-between; align-items:center; padding:16px;">
      <h2 style="margin:0;">${monthNames[month]} ${year}</h2>
      <div>
        <button class="btn-cancel" style="padding:6px 12px; margin-right:8px;" onclick="changeCalendarMonth(-1)">◀</button>
        <button class="btn-cancel" style="padding:6px 12px;" onclick="changeCalendarMonth(1)">▶</button>
      </div>
    </div>
    <div class="calendar-grid" style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; padding:0 16px;">
      <div style="text-align:center; font-weight:bold; font-size:12px; color:var(--text-light); padding-bottom:8px;">Sun</div>
      <div style="text-align:center; font-weight:bold; font-size:12px; color:var(--text-light); padding-bottom:8px;">Mon</div>
      <div style="text-align:center; font-weight:bold; font-size:12px; color:var(--text-light); padding-bottom:8px;">Tue</div>
      <div style="text-align:center; font-weight:bold; font-size:12px; color:var(--text-light); padding-bottom:8px;">Wed</div>
      <div style="text-align:center; font-weight:bold; font-size:12px; color:var(--text-light); padding-bottom:8px;">Thu</div>
      <div style="text-align:center; font-weight:bold; font-size:12px; color:var(--text-light); padding-bottom:8px;">Fri</div>
      <div style="text-align:center; font-weight:bold; font-size:12px; color:var(--text-light); padding-bottom:8px;">Sat</div>
  `;

  for (let i = 0; i < startDayOfWeek; i++) {
    html += `<div class="calendar-day empty" style="min-height:80px; background:var(--bg); border:1px dashed var(--border); border-radius:8px;"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${String(month+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dStr === todayStr;
    const dayTasks = tasks.filter(t => t.dueDate === dStr && !t.done);
    
    let dotsHtml = `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">`;
    dayTasks.slice(0, 5).forEach(t => {
      const pColor = t.priority === 'high' ? 'var(--red)' : (t.priority === 'medium' ? 'var(--yellow)' : 'var(--blue)');
      dotsHtml += `<div title="${esc(t.text)}" style="width:8px; height:8px; border-radius:50%; background:${pColor};"></div>`;
    });
    if (dayTasks.length > 5) dotsHtml += `<div style="font-size:10px; color:var(--text-light);">+${dayTasks.length - 5}</div>`;
    dotsHtml += `</div>`;

    html += `
      <div class="calendar-day" style="min-height:80px; background:var(--bg); border:1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}; border-radius:8px; padding:8px; cursor:pointer;" onclick="openDayTasks('${dStr}')">
        <span style="font-size:14px; font-weight:${isToday ? 'bold' : 'normal'}; color:${isToday ? 'var(--accent)' : 'var(--text)'};">${day}</span>
        ${dotsHtml}
      </div>`;
  }
  html += `</div>`;

  const noDateTasks = tasks.filter(t => !t.dueDate && !t.done && t.cat !== 'reminders' && t.cat !== 'someday');
  html += `
    <div style="padding:24px 16px;">
      <h3 style="margin-bottom:8px;">No Due Date <span style="font-size:14px; color:var(--text-light); font-weight:normal;">(${noDateTasks.length})</span></h3>
      <p style="font-size:14px; color:var(--text-light);">Tasks missing a target date. Click any task to assign a date.</p>
    </div>
  `;

  document.getElementById('taskList').innerHTML = html;
}

function changeCalendarMonth(delta) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
  renderCalendarView();
}

function openDayTasks(dateStr) {
  switchTab('Inbox');
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = dateStr;
  searchTasks(dateStr);
}

// ===================== RENDER TASKS =====================
function renderTasks() {
  const tb = document.getElementById('v3Toolbar');
  if (tb) tb.style.display = 'flex';

  const el = document.getElementById('taskList');
  let filtered;
  
  if (currentSearchQuery) {
    filtered = tasks.filter(t => 
      t.text.toLowerCase().includes(currentSearchQuery) || 
      (t.notes && t.notes.toLowerCase().includes(currentSearchQuery)) ||
      (t.domain && t.domain.toLowerCase().includes(currentSearchQuery)) ||
      (t.phase && t.phase.toLowerCase().includes(currentSearchQuery)) ||
      (t.status && t.status.toLowerCase().includes(currentSearchQuery)) ||
      (t.owner && t.owner.toLowerCase().includes(currentSearchQuery))
    );
  } else if (activeTab === 'done') {
    filtered = tasks.filter(t => t.done);
  } else if (activeTab === 'kavin') {
    filtered = tasks.filter(t => (t.owner === 'Kavin' || t.owner === 'Both') && !t.done);
  } else {
    filtered = tasks.filter(t => t.cat === activeTab && !t.done);
  }

  if (filtered.length === 0) {
    el.innerHTML = `<div class="empty">${activeTab === 'done' ? 'No completed tasks yet.' : 'No tasks here. Tap + to add one.'}</div>`;
    return;
  }

  const seen = new Set();
  let dupeCount = 0;
  if (!currentSearchQuery) {
    filtered.forEach(t => {
      const key = t.text.trim().toLowerCase();
      if (seen.has(key)) dupeCount++;
      else seen.add(key);
    });
  }

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
    
    const clickAction = bulkMode ? '' : `onclick="openTaskDetail('${t.id}')"`;
    const checkboxHtml = bulkMode 
      ? `<input type="checkbox" class="bulk-checkbox" value="${t.id}" onchange="updateBulkCount()">`
      : `<div class="checkbox ${t.done ? 'checked' : ''}" onclick="event.stopPropagation();toggleTask('${t.id}')"></div>`;

    let v3Tags = '';
    if (t.domain && t.domain !== 'General') v3Tags += `<span class="tag category">${t.domain}</span>`;
    if (t.phase) v3Tags += `<span class="tag" style="background:var(--purple-50);color:var(--purple-600);">${t.phase}</span>`;
    if (t.status && t.status !== 'not-started' && t.status !== 'done') v3Tags += `<span class="tag" style="background:var(--yellow-100);color:var(--yellow-900);">${t.status}</span>`;
    if (t.dueDate) v3Tags += `<span class="tag" style="background:var(--red-50);color:var(--red-600);">${t.dueDate}</span>`;
    if (t.owner && t.owner !== 'Ladson') v3Tags += `<span class="tag" style="background:var(--gray-100);">${t.owner}</span>`;

    const incompleteDeps = (t.dependencies || []).filter(depId => {
      const dt = tasks.find(x => x.id === depId);
      return dt && !dt.done;
    });
    if (incompleteDeps.length > 0) {
      if (t.status !== 'blocked') { t.status = 'blocked'; pushTaskToSupabase(t); }
      v3Tags += `<span class="tag" style="background:var(--red-50);color:var(--red-600);">⊗ Blocked by ${incompleteDeps.length} dep${incompleteDeps.length > 1 ? 's' : ''}</span>`;
    }

    return `
    <div class="task-item ${t.done ? 'done' : ''} ${t.priority || 'low'}-left">
      ${checkboxHtml}
      <div class="task-content" ${clickAction}>
        <div class="task-text">${esc(t.text)}</div>
        <div class="task-meta">
          <span class="badge ${t.priority || 'low'}">${t.priority}</span>
          ${t.daily ? '<span class="badge blue">daily</span>' : ''}
          ${t.notes ? '<span class="badge gray">has details</span>' : ''}
          ${subsTotal > 0 ? `<span class="subtask-inline">${subsDone}/${subsTotal}</span>` : ''}
          ${t.daily && streakVal >= 1 ? `<span class="rec-tag">🔥 ${streakVal}d</span>` : ''}
          ${t.reminderTime ? `<span class="rec-tag">⏰ ${t.reminderTime}</span>` : ''}
          ${v3Tags}
        </div>
      </div>
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
  renderTopTabs(); renderScreen();
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
    el.innerHTML = `<div class="review-prompt" style="background:var(--purple-50); border:1px solid var(--purple-100);">
      <p style="color:var(--purple-900);">You have completed ${pct}% of today's tasks. Time for your daily self-review?</p>
      <button style="background:var(--accent); color:#fff; border:none; border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer;" onclick="openReviewModal()">Write Review</button>
    </div>`;
  } else if (hasReview) {
    el.innerHTML = `<div class="review-prompt" style="border-color:var(--green); background:var(--teal-50);">
      <p style="color:var(--teal-800);">Today's review saved. Score: ${todayEntry.score}/10 | E:${todayEntry.review.energy} F:${todayEntry.review.focus} X:${todayEntry.review.exec}</p>
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
  if (t.done) {
    t.completedAt = new Date().toISOString();
    if (activeFocusTaskId === id && window.stopFocusTimer) stopFocusTimer();
  } else {
    delete t.completedAt;
  }
  t.updatedAt = new Date().toISOString();
  save();
  pushTaskToSupabase(t);
  renderTopTabs();
  renderScreen();
  updateProgress();
  checkReviewPrompt();

  const todayTasks = tasks.filter(x => x.cat === 'today');
  if (todayTasks.length > 0 && todayTasks.every(x => x.done)) recordDayComplete();
}

// ===================== PROGRESS =====================
function updateProgress() {
  const total = tasks.filter(t => !t.daily || t.cat === 'today').length;
  const done = tasks.filter(t => t.done).length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  
  const progFill = document.getElementById('progressFill');
  if (progFill) progFill.style.width = pct + '%';
  
  const progText = document.getElementById('progressText');
  if (progText) progText.textContent = done + ' of ' + total + ' done';
  
  const progPct = document.getElementById('progressPct');
  if (progPct) progPct.textContent = pct + '%';

  const todayTasks = tasks.filter(t => t.cat === 'today' || t.cat === 'daily-habits');
  const todayDone = todayTasks.filter(t => t.done).length;
  const score = todayTasks.length > 0 ? Math.round(todayDone / todayTasks.length * 10) : 0;
  
  const scoreNumEl = document.getElementById('scoreNum');
  if (scoreNumEl) scoreNumEl.textContent = score;
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

// Chart.js instance tracking to prevent canvas reuse errors
let historyChartInst = null;
let velocityChartInst = null;
let domainsChartInst = null;
let workloadChartInst = null;

// ===================== V2 HISTORY SCREEN =====================
function renderHistoryV2() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const sorted = [...dailyLog].sort((a, b) => b.date.localeCompare(a.date));
  const last7 = sorted.slice(0, 7).reverse();

  // Weekly summary
  const avgScore = last7.length > 0 ? Math.round(last7.reduce((s, e) => s + (e.score || 0), 0) / last7.length) : 0;
  const totalDone = last7.reduce((s, e) => s + (e.done || 0), 0);
  const reviewCount = last7.filter(e => e.review).length;
  const avgEnergy = last7.filter(e => e.review).length > 0
    ? (last7.filter(e => e.review).reduce((s, e) => s + e.review.energy, 0) / last7.filter(e => e.review).length).toFixed(1)
    : '—';

  let html = `<div style="padding:0 16px 100px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:20px; font-weight:800; margin:0;">Performance History</h2>
    </div>

    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px;">
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800; color:var(--accent);">${avgScore}/10</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Avg Score</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800; color:var(--green-400);">${totalDone}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Tasks Done</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800; color:var(--amber-400);">${reviewCount}/${last7.length}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Reviews</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800;">${avgEnergy}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Avg Energy</div>
      </div>
    </div>

    <div style="background:var(--bg-secondary); border-radius:14px; padding:16px; margin-bottom:20px; border:1px solid rgba(255,255,255,0.04);">
      <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">7-Day Score Trend</div>
      <canvas id="historySparkline" height="120"></canvas>
    </div>`;

  // Day cards
  if (sorted.length === 0) {
    html += `<div class="v2-empty"><div class="v2-empty-icon">📊</div><div class="v2-empty-text">No history yet. Complete tasks and write reviews to build your log.</div></div>`;
  } else {
    sorted.forEach(entry => {
      const pct = entry.total > 0 ? Math.round(entry.done / entry.total * 100) : 0;
      const scoreColor = entry.score >= 7 ? 'var(--green-400)' : entry.score >= 4 ? 'var(--amber-400)' : 'var(--red-400)';
      const d = new Date(entry.date + 'T12:00:00');
      const dayName = d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });

      html += `<div style="background:var(--bg-secondary); border-radius:12px; padding:16px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:14px; font-weight:700;">${dayName}</span>
          <span style="font-size:18px; font-weight:800; color:${scoreColor}">${entry.score}/10</span>
        </div>
        <div style="display:flex; gap:16px; font-size:12px; color:var(--text-muted); margin-bottom:8px;">
          <span>Tasks: ${entry.done}/${entry.total}</span>
          ${entry.review ? `<span>E:${entry.review.energy} F:${entry.review.focus} X:${entry.review.exec}</span>` : '<span style="color:var(--red-400)">No review</span>'}
        </div>
        <div style="height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${scoreColor}; border-radius:2px; transition:width 0.3s;"></div>
        </div>
        ${entry.review && entry.review.well ? `<div style="font-size:12px; color:var(--text-dim); margin-top:8px; line-height:1.5;"><strong>✓</strong> ${esc(entry.review.well)}</div>` : ''}
      </div>`;
    });
  }
  html += `</div>`;
  v2.innerHTML = html;

  // Render sparkline chart
  if (last7.length > 1) {
    const ctx = document.getElementById('historySparkline');
    if (ctx) {
      if (historyChartInst) historyChartInst.destroy();
      historyChartInst = new Chart(ctx, {
        type: 'line',
        data: {
          labels: last7.map(e => { const d = new Date(e.date + 'T12:00:00'); return d.toLocaleDateString('en', { weekday: 'short' }); }),
          datasets: [{
            data: last7.map(e => e.score || 0),
            borderColor: '#534AB7',
            backgroundColor: 'rgba(83,74,183,0.15)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#534AB7',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 10, ticks: { color: 'rgba(255,255,255,0.3)', stepSize: 2 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            x: { ticks: { color: 'rgba(255,255,255,0.3)' }, grid: { display: false } }
          }
        }
      });
    }
  }
}

// ===================== V2 VELOCITY SCREEN =====================
// ===================== PHASE 3.1 OUTREACH ANALYTICS =====================
function renderOutreachAnalytics() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const today = todayStr();
  const todayLog = outreach_logs.find(l => l.date === today) || { messages_sent: 0, replies_received: 0, calls_booked: 0 };
  
  // 7-day reply rate
  let sumSent = 0, sumReplies = 0;
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const sevenDaysAgo = d.toISOString().split('T')[0];
  const last7Logs = outreach_logs.filter(l => l.date >= sevenDaysAgo);
  last7Logs.forEach(l => {
    sumSent += (l.messages_sent || 0);
    sumReplies += (l.replies_received || 0);
  });
  const replyRate = sumSent > 0 ? Math.round((sumReplies / sumSent) * 100) : 0;

  // Calls booked this week
  const dMon = new Date(); dMon.setDate(dMon.getDate() - (dMon.getDay() || 7) + 1);
  const thisMonday = dMon.toISOString().split('T')[0];
  const thisWeekLogs = outreach_logs.filter(l => l.date >= thisMonday);
  const callsBooked = thisWeekLogs.reduce((sum, l) => sum + (l.calls_booked || 0), 0);

  // Active warm leads
  const warmLeads = prospects.filter(p => p.status === 'replied' || p.status === 'discovery' || p.status === 'demo').length;

  let html = `
    <div style="margin-bottom:24px;">
      ${sectionLabel('Outreach Overview')}
      <div class="metric-cards-row">
        ${metricCard('Sent Today', todayLog.messages_sent, '')}
        ${metricCard('Reply Rate (7d)', replyRate + '%', replyRate > 10 ? 'green' : '')}
        ${metricCard('Calls This Week', callsBooked, callsBooked > 0 ? 'amber' : '')}
        ${metricCard('Warm Leads', warmLeads, 'blue')}
      </div>
    </div>
    
    <div style="margin-bottom:32px;">
      ${sectionLabel('Activity (Last 30 Days)')}
      <div class="v2-card" style="padding:16px;">
        <canvas id="outreachChart" style="width:100%; height:200px;"></canvas>
      </div>
    </div>
    
    <div style="margin-bottom:32px;">
      ${sectionLabel('Pipeline Funnel')}
      <div class="v2-card" style="padding:20px;">
        ${renderFunnel()}
      </div>
    </div>
  `;
  v2.innerHTML = html;
  
  // Render Chart
  setTimeout(renderOutreachChart, 50);
}

function renderFunnel() {
  const total = prospects.length;
  if (total === 0) return '<div style="color:var(--text-dim); font-size:13px;">No prospects in pipeline.</div>';
  
  const warm = prospects.filter(p => !['new', 'lost'].includes(p.status)).length;
  const calls = prospects.filter(p => ['discovery', 'demo', 'pilot', 'won'].includes(p.status)).length;
  const pilots = prospects.filter(p => ['pilot', 'won'].includes(p.status)).length;
  
  const wPct = Math.round((warm/total)*100) || 0;
  const cPct = Math.round((calls/total)*100) || 0;
  const pPct = Math.round((pilots/total)*100) || 0;
  
  return `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; align-items:center;">
        <div style="width:100px; font-size:12px; color:var(--text-muted); font-weight:600;">Prospects</div>
        <div style="flex:1; height:24px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:100%; background:var(--bg-tertiary); display:flex; align-items:center; padding-left:8px; font-size:11px; font-weight:700;">${total}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center;">
        <div style="width:100px; font-size:12px; color:var(--text-muted); font-weight:600;">Warm</div>
        <div style="flex:1; height:24px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${wPct}%; background:var(--blue-400); display:flex; align-items:center; padding-left:8px; font-size:11px; font-weight:700; color:#fff;">${warm} (${wPct}%)</div>
        </div>
      </div>
      <div style="display:flex; align-items:center;">
        <div style="width:100px; font-size:12px; color:var(--text-muted); font-weight:600;">Calls Booked</div>
        <div style="flex:1; height:24px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${cPct}%; background:var(--amber-400); display:flex; align-items:center; padding-left:8px; font-size:11px; font-weight:700; color:#000;">${calls} (${cPct}%)</div>
        </div>
      </div>
      <div style="display:flex; align-items:center;">
        <div style="width:100px; font-size:12px; color:var(--text-muted); font-weight:600;">Pilots</div>
        <div style="flex:1; height:24px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${pPct}%; background:var(--green-400); display:flex; align-items:center; padding-left:8px; font-size:11px; font-weight:700; color:#000;">${pilots} (${pPct}%)</div>
        </div>
      </div>
    </div>
  `;
}

let outreachChartInstance = null;
function renderOutreachChart() {
  const ctx = document.getElementById('outreachChart');
  if (!ctx || typeof Chart === 'undefined') return;
  if (outreachChartInstance) outreachChartInstance.destroy();
  
  const labels = [];
  const sentData = [];
  const replyData = [];
  
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    labels.push(d.getDate() + '/' + (d.getMonth()+1));
    
    const log = outreach_logs.find(l => l.date === dateStr);
    sentData.push(log ? log.messages_sent || 0 : 0);
    replyData.push(log ? log.replies_received || 0 : 0);
  }

  outreachChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Sent', data: sentData, backgroundColor: '#534AB7', borderRadius: 4 },
        { label: 'Replies', data: replyData, backgroundColor: '#34d399', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' }, beginAtZero: true }
      },
      plugins: {
        legend: { labels: { color: '#aaa' } }
      }
    }
  });
}

function renderVelocity() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const sorted = [...dailyLog].sort((a, b) => b.date.localeCompare(a.date));
  const last14 = sorted.slice(0, 14).reverse();
  const last7 = last14.slice(-7);

  const avgPerDay = last7.length > 0 ? (last7.reduce((s, e) => s + (e.done || 0), 0) / last7.length).toFixed(1) : '0';
  const bestDay = last14.length > 0 ? last14.reduce((best, e) => (e.done || 0) > (best.done || 0) ? e : best, last14[0]) : null;
  const bestDayLabel = bestDay ? new Date(bestDay.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

  // Streak: consecutive days with score >= 5
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    // Walk from most recent
  }
  for (const entry of sorted) {
    if ((entry.score || 0) >= 5) streak++;
    else break;
  }

  let html = `<div style="padding:0 16px 100px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:20px; font-weight:800; margin:0;">Execution Velocity</h2>
    </div>

    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;">
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800; color:var(--accent);">${avgPerDay}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Avg Tasks/Day</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800; color:var(--green-400);">${bestDay ? bestDay.done : 0}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Best Day</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800; color:var(--amber-400);">${streak}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Hot Streak</div>
      </div>
    </div>

    <div style="background:var(--bg-secondary); border-radius:14px; padding:16px; margin-bottom:20px; border:1px solid rgba(255,255,255,0.04);">
      <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">14-Day Task Completion</div>
      <canvas id="velocityChart" height="160"></canvas>
    </div>

    <div style="font-size:11px; color:var(--text-dim); text-align:center;">Best day: ${bestDayLabel} (${bestDay ? bestDay.done : 0} tasks)</div>
  </div>`;

  v2.innerHTML = html;

  if (last14.length > 1) {
    const ctx = document.getElementById('velocityChart');
    if (ctx) {
      if (velocityChartInst) velocityChartInst.destroy();

      // Rolling 7-day average
      const rollingAvg = last14.map((_, i) => {
        const windowStart = Math.max(0, i - 6);
        const window = last14.slice(windowStart, i + 1);
        return window.reduce((s, e) => s + (e.done || 0), 0) / window.length;
      });

      velocityChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: last14.map(e => { const d = new Date(e.date + 'T12:00:00'); return d.toLocaleDateString('en', { weekday: 'narrow' }); }),
          datasets: [
            {
              label: 'Tasks Done',
              data: last14.map(e => e.done || 0),
              backgroundColor: 'rgba(83,74,183,0.6)',
              borderRadius: 4,
              barPercentage: 0.7
            },
            {
              label: '7-Day Avg',
              data: rollingAvg,
              type: 'line',
              borderColor: 'rgba(52,211,153,0.7)',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true, position: 'bottom', labels: { color: 'rgba(255,255,255,0.4)', boxWidth: 12 } } },
          scales: {
            y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.3)', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            x: { ticks: { color: 'rgba(255,255,255,0.3)' }, grid: { display: false } }
          }
        }
      });
    }
  }
}

// ===================== V2 DOMAINS SCREEN =====================
function renderDomains() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const catMap = {};
  tasks.forEach(t => {
    const cat = t.cat || 'uncategorized';
    if (!catMap[cat]) catMap[cat] = { active: 0, done: 0 };
    if (t.done) catMap[cat].done++;
    else catMap[cat].active++;
  });

  const categories = Object.keys(catMap).sort((a, b) => (catMap[b].active + catMap[b].done) - (catMap[a].active + catMap[a].done));
  const chartColors = ['#534AB7', '#34D399', '#FBBF24', '#F87171', '#60A5FA', '#A78BFA', '#F472B6', '#818CF8'];

  let html = `<div style="padding:0 16px 100px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:20px; font-weight:800; margin:0;">Task Domains</h2>
    </div>

    <div style="background:var(--bg-secondary); border-radius:14px; padding:16px; margin-bottom:20px; border:1px solid rgba(255,255,255,0.04);">
      <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Category Distribution</div>
      <div style="max-width:220px; margin:0 auto;">
        <canvas id="domainsChart" height="220"></canvas>
      </div>
    </div>

    <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Breakdown</div>`;

  categories.forEach((cat, i) => {
    const d = catMap[cat];
    const total = d.active + d.done;
    const pct = total > 0 ? Math.round(d.done / total * 100) : 0;
    const label = catLabels[cat] || cat;
    const color = chartColors[i % chartColors.length];

    html += `<div style="background:var(--bg-secondary); border-radius:10px; padding:12px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(255,255,255,0.04);">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:10px; height:10px; border-radius:3px; background:${color};"></div>
        <span style="font-size:13px; font-weight:600;">${label}</span>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:12px; color:var(--text-muted);">${d.active} active</span>
        <span style="font-size:12px; color:var(--green-400);">${d.done} done</span>
        <span style="font-size:12px; font-weight:700; color:var(--accent);">${pct}%</span>
      </div>
    </div>`;
  });

  html += `</div>`;
  v2.innerHTML = html;

  if (categories.length > 0) {
    const ctx = document.getElementById('domainsChart');
    if (ctx) {
      if (domainsChartInst) domainsChartInst.destroy();
      domainsChartInst = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: categories.map(c => catLabels[c] || c),
          datasets: [{
            data: categories.map(c => catMap[c].active + catMap[c].done),
            backgroundColor: categories.map((_, i) => chartColors[i % chartColors.length]),
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          cutout: '65%',
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  }
}

// ===================== V2 WORKLOAD SCREEN =====================
function renderWorkload() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const sorted = [...dailyLog].sort((a, b) => b.date.localeCompare(a.date));
  const last7 = sorted.slice(0, 7).reverse();

  // Active task counts by priority
  const highCount = tasks.filter(t => !t.done && t.priority === 'high').length;
  const medCount = tasks.filter(t => !t.done && t.priority === 'medium').length;
  const lowCount = tasks.filter(t => !t.done && (t.priority === 'low' || !t.priority)).length;
  const totalOpen = highCount + medCount + lowCount;

  // Historical average from dailyLog
  const histAvg = last7.length > 0 ? Math.round(last7.reduce((s, e) => s + (e.total || 0), 0) / last7.length) : 0;
  const capacityPct = histAvg > 0 ? Math.min(Math.round(totalOpen / histAvg * 100), 200) : 0;
  const capacityColor = capacityPct > 120 ? 'var(--red-400)' : capacityPct > 80 ? 'var(--amber-400)' : 'var(--green-400)';

  let html = `<div style="padding:0 16px 100px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:20px; font-weight:800; margin:0;">Workload Monitor</h2>
    </div>

    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;">
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800; color:var(--red-400);">${highCount}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">High Priority</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800; color:var(--amber-400);">${medCount}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Medium</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800; color:var(--text-dim);">${lowCount}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Low</div>
      </div>
    </div>

    <div style="background:var(--bg-secondary); border-radius:14px; padding:16px; margin-bottom:20px; border:1px solid rgba(255,255,255,0.04);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Capacity</div>
        <div style="font-size:14px; font-weight:800; color:${capacityColor};">${capacityPct}%</div>
      </div>
      <div style="height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
        <div style="height:100%; width:${Math.min(capacityPct, 100)}%; background:${capacityColor}; border-radius:4px; transition:width 0.3s;"></div>
      </div>
      <div style="font-size:11px; color:var(--text-dim); margin-top:8px;">${totalOpen} open tasks vs ${histAvg} avg daily capacity</div>
    </div>

    <div style="background:var(--bg-secondary); border-radius:14px; padding:16px; margin-bottom:20px; border:1px solid rgba(255,255,255,0.04);">
      <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">7-Day Priority Distribution</div>
      <canvas id="workloadChart" height="160"></canvas>
    </div>
  </div>`;

  v2.innerHTML = html;

  if (last7.length > 0) {
    const ctx = document.getElementById('workloadChart');
    if (ctx) {
      if (workloadChartInst) workloadChartInst.destroy();

      // Approximate priority breakdown from tasks array per day
      const highData = last7.map(e => {
        const dayTasks = e.tasks || [];
        return dayTasks.length > 0 ? Math.round(dayTasks.length * 0.3) : 0;
      });
      const medData = last7.map(e => {
        const dayTasks = e.tasks || [];
        return dayTasks.length > 0 ? Math.round(dayTasks.length * 0.5) : 0;
      });
      const lowData = last7.map(e => {
        const dayTasks = e.tasks || [];
        return dayTasks.length > 0 ? dayTasks.length - Math.round(dayTasks.length * 0.3) - Math.round(dayTasks.length * 0.5) : 0;
      });

      workloadChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: last7.map(e => { const d = new Date(e.date + 'T12:00:00'); return d.toLocaleDateString('en', { weekday: 'short' }); }),
          datasets: [
            { label: 'High', data: highData, backgroundColor: '#E24B4A', borderRadius: 3, barPercentage: 0.6 },
            { label: 'Medium', data: medData, backgroundColor: '#EF9F27', borderRadius: 3, barPercentage: 0.6 },
            { label: 'Low', data: lowData, backgroundColor: '#378ADD', borderRadius: 3, barPercentage: 0.6 }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true, position: 'bottom', labels: { color: '#6B686B', boxWidth: 12 } } },
          scales: {
            x: { stacked: true, ticks: { color: '#888780' }, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, ticks: { color: '#888780', stepSize: 1 }, grid: { color: '#F0EFEB' } }
          }
        }
      });
    }
  }
}

// ===================== V2 DECISIONS SCREEN =====================
// ===================== PHASE 3.3 RUNWAY =====================
function renderRunway() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const bankBalanceStr = localStorage.getItem('BANK_BALANCE') || '0';
  let bankBalance = parseFloat(bankBalanceStr) || 0;

  let burnRate = 0;
  // Calculate average monthly burn from expenses in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0];

  const recentExpenses = expenses.filter(e => e.date >= thirtyDaysStr);
  burnRate = recentExpenses.reduce((sum, e) => sum + (parseFloat(e.amount_usd) || 0), 0);

  // Runway in months
  const runwayMonths = burnRate > 0 ? (bankBalance / burnRate).toFixed(1) : '∞';

  let html = `
    <div style="margin-bottom:24px;">
      ${sectionLabel('Financial Runway')}
      <div class="metric-cards-row">
        ${metricCard('Cash on Hand', '$' + bankBalance.toLocaleString(), '')}
        ${metricCard('30-Day Burn', '$' + burnRate.toLocaleString(), burnRate > 5000 ? 'red' : 'amber')}
        ${metricCard('Runway', runwayMonths + ' mos', runwayMonths !== '∞' && runwayMonths < 3 ? 'red' : 'green')}
      </div>
      <button onclick="setBankBalance()" class="v2-button-secondary" style="margin-top:12px;">Update Cash on Hand</button>
    </div>
    
    <div style="margin-bottom:24px; display:flex; justify-content:space-between; align-items:center;">
      ${sectionLabel('Recent Expenses')}
      <button onclick="addExpenseUI()" class="v2-button-teal" style="padding:6px 12px; font-size:12px;">+ Add Expense</button>
    </div>
  `;

  if (expenses.length === 0) {
    html += `<div style="padding:20px; text-align:center; color:var(--text-dim); font-size:13px; background:rgba(255,255,255,0.02); border-radius:8px;">No expenses recorded yet.</div>`;
  } else {
    expenses.slice(0, 50).forEach(e => {
      html += `
        <div class="v2-card" style="padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:600; font-size:14px; margin-bottom:4px;">${esc(e.description)}</div>
            <div style="font-size:11px; color:var(--text-muted);">
              ${e.date} &bull; <span style="color:var(--amber-400);">${esc(e.category)}</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700; color:var(--red-400); font-size:15px;">-$${parseFloat(e.amount_usd).toLocaleString()}</div>
            <button onclick="removeExpense('${e.id}')" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:11px; margin-top:4px;">Delete</button>
          </div>
        </div>
      `;
    });
  }

  v2.innerHTML = html;
}

function setBankBalance() {
  const current = localStorage.getItem('BANK_BALANCE') || '0';
  const val = prompt('Enter Total Cash on Hand (USD):', current);
  if (val !== null) {
    localStorage.setItem('BANK_BALANCE', parseFloat(val) || 0);
    renderRunway();
  }
}

async function addExpenseUI() {
  const desc = prompt('Expense description:');
  if (!desc) return;
  const amt = prompt('Amount (USD):');
  if (!amt) return;
  const cat = prompt('Category (e.g. Software, Payroll, Setup):', 'Software');
  
  const idValue = uid();
  const e = {
    id: idValue,
    date: todayStr(),
    description: desc,
    amount_usd: parseFloat(amt) || 0,
    amount_inr: 0,
    category: cat || 'General',
    user_id: user ? user.id : null
  };
  
  expenses.unshift(e);
  renderRunway();
  
  if (sb) {
    const { error } = await sb.from('expenses').insert([e]);
    if (error) queueChange('expenses', 'insert', e);
  }
}

async function removeExpense(id) {
  if (!confirm('Delete this expense?')) return;
  expenses = expenses.filter(x => x.id !== id);
  renderRunway();
  
  if (sb) {
    const { error } = await sb.from('expenses').delete().eq('id', id);
    if (error) queueChange('expenses', 'delete', { id });
  }
}

// ===================== PHASE 3.2 MILESTONES =====================
async function seedDefaultMilestones() {
  if (milestones.length > 0) return;
  const defaults = [
    { title: 'First 10 Pilots', target_value: 10, unit: 'pilots', category: 'Growth', target_date: '2026-06-30' },
    { title: '$10k MRR', target_value: 10000, unit: 'USD', category: 'Revenue', target_date: '2026-12-31' },
    { title: 'Product Hunt Launch', target_value: 100, unit: '%', category: 'Product', target_date: '2026-05-15' },
    { title: 'YC Application', target_value: 100, unit: '%', category: 'Fundraising', target_date: '2026-09-01' }
  ];
  for (let m of defaults) {
    const rec = { id: uid(), user_id: user.id, ...m, current_value: 0 };
    milestones.push(rec);
    if (sb) await sb.from('milestones').insert([rec]);
  }
  renderMilestones();
}

async function updateMilestoneProgress(id) {
  const m = milestones.find(x => x.id === id);
  if (!m) return;
  const val = prompt(`Enter current value for ${m.title} (Target: ${m.target_value} ${m.unit})`, m.current_value);
  if (val === null) return;
  m.current_value = parseFloat(val) || 0;
  if (m.current_value >= m.target_value && !m.achieved_date) m.achieved_date = todayStr();
  renderMilestones();
  if (sb) {
    const { error } = await sb.from('milestones').update({ current_value: m.current_value, achieved_date: m.achieved_date }).eq('id', id);
    if (error) queueChange('milestones', 'update', { id, current_value: m.current_value, achieved_date: m.achieved_date });
  }
}

async function achieveMilestone(id) {
  const m = milestones.find(x => x.id === id);
  if (!m) return;
  m.achieved_date = todayStr();
  if (m.current_value < m.target_value) m.current_value = m.target_value;
  renderMilestones();
  if (sb) {
    const { error } = await sb.from('milestones').update({ achieved_date: m.achieved_date, current_value: m.current_value }).eq('id', id);
    if (error) queueChange('milestones', 'update', { id, achieved_date: m.achieved_date, current_value: m.current_value });
  }
}

function renderMilestones() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  if (milestones.length === 0) {
    v2.innerHTML = `
      <div class="v2-empty" style="padding:60px 20px; text-align:center;">
        <div style="font-size:32px; margin-bottom:12px;">🏔️</div>
        <div style="font-weight:700;">No Milestones tracked</div>
        <div style="font-size:13px; color:var(--text-dim); margin-bottom:20px;">Track your major company goals.</div>
        <button onclick="seedDefaultMilestones()" class="v2-button-teal" style="padding:10px 20px;">Seed Default Milestones</button>
      </div>
    `;
    return;
  }

  const active = milestones.filter(m => !m.achieved_date).sort((a,b) => a.target_date.localeCompare(b.target_date));
  const achieved = milestones.filter(m => m.achieved_date).sort((a,b) => b.achieved_date.localeCompare(a.achieved_date));

  const nextUp = active.length > 0 ? active[0] : null;

  let html = '';
  
  if (nextUp) {
    const pct = Math.min(100, Math.round((nextUp.current_value / nextUp.target_value) * 100)) || 0;
    html += `
      ${sectionLabel('Next Major Milestone')}
      <div class="v2-card accent-left" style="padding:20px; margin-bottom:32px; border-left-color:var(--amber-400);">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">${nextUp.category}</span>
          <span style="font-size:11px; font-weight:700; color:var(--amber-400);">Target: ${nextUp.target_date}</span>
        </div>
        <div style="font-size:20px; font-weight:800; margin-bottom:16px;">${esc(nextUp.title)}</div>
        <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden; margin-bottom:8px;">
          <div style="width:${pct}%; height:100%; background:var(--amber-400); box-shadow:0 0 10px rgba(251,191,36,0.2);"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <span style="font-weight:600; color:var(--amber-400);">${pct}% (${nextUp.current_value} / ${nextUp.target_value} ${nextUp.unit})</span>
          <div style="display:flex; gap:8px;">
            <button onclick="updateMilestoneProgress('${nextUp.id}')" style="background:transparent; border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:4px 8px; border-radius:4px; cursor:pointer;">Update</button>
            <button onclick="achieveMilestone('${nextUp.id}')" style="background:var(--green-400); color:#000; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:700;">Achieve</button>
          </div>
        </div>
      </div>
    `;
  }

  if (active.length > 1) {
    html += sectionLabel('Active Milestones');
    active.slice(1).forEach(m => {
      const pct = Math.min(100, Math.round((m.current_value / m.target_value) * 100)) || 0;
      html += `
        <div class="v2-card" style="padding:16px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:12px; font-weight:600;">${m.title}</span>
            <span style="font-size:11px; color:var(--text-muted);">${m.target_date}</span>
          </div>
          <div style="height:4px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden; margin-bottom:8px;">
            <div style="width:${pct}%; height:100%; background:var(--accent);"></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px;">
            <span style="color:var(--text-muted);">${m.current_value} / ${m.target_value} ${m.unit}</span>
            <button onclick="updateMilestoneProgress('${m.id}')" style="background:transparent; border:none; color:var(--teal-400); cursor:pointer;">Update</button>
          </div>
        </div>
      `;
    });
  }

  if (achieved.length > 0) {
    html += sectionLabel(`Achieved (${achieved.length})`);
    achieved.forEach(m => {
      html += `
        <div class="v2-card" style="padding:12px 16px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; opacity:0.6;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:var(--green-400);">✓</span>
            <span style="font-weight:600; font-size:13px; text-decoration:line-through;">${m.title}</span>
          </div>
          <span style="font-size:11px; color:var(--text-muted);">${m.achieved_date}</span>
        </div>
      `;
    });
  }

  v2.innerHTML = html;
}

function renderDecisionsV2() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const sorted = [...decisions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const domainColors = {
    'ops': '#534AB7', 'product': '#34D399', 'sales': '#FBBF24',
    'engineering': '#60A5FA', 'hiring': '#F472B6', 'finance': '#A78BFA'
  };

  let html = `<div style="padding:0 16px 100px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:20px; font-weight:800; margin:0;">Decision Log</h2>
      <button style="background:var(--accent); color:#fff; border:none; border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer;" onclick="openDecisionModal()">+ Decision</button>
    </div>

    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;">
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--accent);">${decisions.length}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Total</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--green-400);">${sorted.filter(d => { const diff = (Date.now() - new Date(d.date).getTime()) / 86400000; return diff < 7; }).length}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">This Week</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800;">${[...new Set(decisions.map(d => d.domain))].length}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Domains</div>
      </div>
    </div>`;

  if (sorted.length === 0) {
    html += `<div class="v2-empty"><div class="v2-empty-icon">⚖️</div><div class="v2-empty-text">No decisions recorded yet. Tap + to log your first decision.</div></div>`;
  } else {
    sorted.forEach(d => {
      const date = new Date(d.date + 'T12:00:00');
      const dateStr = date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
      const color600 = domainColors[d.domain] || '#534AB7';
      const color50 = (d.domain === 'ops' ? '#EEEDFE' : d.domain === 'product' ? '#E1F5EE' : d.domain === 'sales' ? '#FAEEDA' : '#EEEDFE');
      const color800 = (d.domain === 'ops' ? '#3C3489' : d.domain === 'product' ? '#0B5041' : d.domain === 'sales' ? '#854F0B' : '#3C3489');

      html += `<div class="v2-task-row" style="border-left:3px solid ${color600}; background:${color50}; border:1px solid var(--border);">
        <div class="v2-task-content" style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div class="v2-task-text" style="font-size:15px; font-weight:700; color:${color800}; line-height:1.4; flex:1;">${esc(d.decision)}</div>
            <span style="font-size:10px; padding:3px 8px; border-radius:999px; background:${color600}; color:#fff; white-space:nowrap; margin-left:8px;">${d.domain || 'ops'}</span>
          </div>
          ${d.reason ? `<div style="font-size:12px; color:var(--text-dim); margin-bottom:6px; line-height:1.5;"><strong>Why:</strong> ${esc(d.reason)}</div>` : ''}
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted);">
            <span>${dateStr}</span>
            <span>by ${esc(d.decidedBy || 'Ladson')}</span>
          </div>
        </div>
      </div>`;
    });
  }
  html += `</div>`;
  v2.innerHTML = html;
}

function openDecisionModal() {
  document.getElementById('decisionInput').value = '';
  document.getElementById('decisionReasonInput').value = '';
  document.getElementById('decisionDomainInput').value = 'ops';
  document.getElementById('decisionModal').classList.add('open');
}

function closeDecisionModal() {
  document.getElementById('decisionModal').classList.remove('open');
}

function saveDecision() {
  const decision = document.getElementById('decisionInput').value.trim();
  if (!decision) return;
  const d = {
    id: 'dec-' + Date.now(),
    date: todayStr(),
    decision: decision,
    reason: document.getElementById('decisionReasonInput').value.trim(),
    decidedBy: document.getElementById('decisionDecidedByInput')?.value || 'Ladson',
    domain: document.getElementById('decisionDomainInput').value,
    updatedAt: new Date().toISOString()
  };
  decisions.push(d);
  localStorage.setItem('malveon_decisions', JSON.stringify(decisions));
  pushDecisionToSupabase(d);
  closeDecisionModal();
  renderDecisionsV2();
}

// ===================== V2 DELEGATION SCREEN =====================
function renderDelegationV2() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const sorted = [...delegations].sort((a, b) => {
    const statusOrder = { 'not-started': 0, 'in-progress': 1, 'blocked': 2, 'done': 3 };
    return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
  });

  const notStarted = delegations.filter(d => d.status === 'not-started').length;
  const inProgress = delegations.filter(d => d.status === 'in-progress').length;
  const done = delegations.filter(d => d.status === 'done').length;
  const blocked = delegations.filter(d => d.status === 'blocked').length;

  const statusColors = { 'not-started': '#6B686B', 'in-progress': '#534AB7', 'blocked': '#E24B4A', 'done': '#1D9E75' };
  const statusLabels = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'blocked': 'Blocked', 'done': 'Done' };

  let html = `<div style="padding:0 16px 100px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:20px; font-weight:800; margin:0;">Delegation Tracker</h2>
      <button style="background:var(--accent); color:#fff; border:none; border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer;" onclick="openDelegationModal()">+ Delegate</button>
    </div>

    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px;">
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:#6B7280;">${notStarted}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Pending</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--accent);">${inProgress}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Active</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--red-400);">${blocked}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Blocked</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--green-400);">${done}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Done</div>
      </div>
    </div>`;

  if (sorted.length === 0) {
    html += `<div class="v2-empty"><div class="v2-empty-icon">👥</div><div class="v2-empty-text">No delegated tasks yet. Tap + to assign your first task.</div></div>`;
  } else {
    sorted.forEach(d => {
      const color = statusColors[d.status] || '#6B7280';
      const label = statusLabels[d.status] || d.status;
      const isOverdue = d.dueDate && new Date(d.dueDate) < new Date() && d.status !== 'done';

      html += `
      <div class="v2-task-row" style="border:1px solid var(--border); ${isOverdue ? 'border-left:3px solid var(--red-400);' : ''}">
        <div class="v2-task-content" style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div class="v2-task-text" style="font-size:14px; font-weight:700; flex:1;">${esc(d.task)}</div>
          <span style="font-size:10px; padding:3px 8px; border-radius:999px; background:${color}22; color:${color}; white-space:nowrap; margin-left:8px; cursor:pointer;" onclick="cycleDelegationStatus('${d.id}')">${label}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted);">
          <span>→ ${esc(d.assignedTo)}</span>
          <span>${d.dueDate ? 'Due: ' + new Date(d.dueDate + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) : 'No deadline'}</span>
        </div>
        ${d.notes ? `<div style="font-size:11px; color:var(--text-dim); margin-top:6px;">${esc(d.notes)}</div>` : ''}
        ${isOverdue ? '<div style="font-size:11px; color:var(--red-400); margin-top:4px; font-weight:600;">⚠ Overdue</div>' : ''}
      </div>`;
    });
  }
  html += `</div>`;
  v2.innerHTML = html;
}

function cycleDelegationStatus(id) {
  const d = delegations.find(x => x.id === id);
  if (!d) return;
  const cycle = ['not-started', 'in-progress', 'blocked', 'done'];
  const idx = cycle.indexOf(d.status);
  d.status = cycle[(idx + 1) % cycle.length];
  d.updatedAt = new Date().toISOString();
  localStorage.setItem(DELEGATIONS_KEY, JSON.stringify(delegations));
  pushDelegationToSupabase(d);
  renderDelegationV2();
}

function openDelegationModal() {
  document.getElementById('delegationTaskInput').value = '';
  document.getElementById('delegationAssigneeInput').value = '';
  document.getElementById('delegationDueDateInput').value = '';
  document.getElementById('delegationNotesInput').value = '';
  document.getElementById('delegationModal').classList.add('open');
}

function closeDelegationModal() {
  document.getElementById('delegationModal').classList.remove('open');
}

function saveDelegation() {
  const task = document.getElementById('delegationTaskInput').value.trim();
  const assignee = document.getElementById('delegationAssigneeInput').value.trim();
  if (!task || !assignee) return;
  const d = {
    id: 'del-' + Date.now(),
    task: task,
    assignedTo: assignee,
    assignedDate: todayStr(),
    dueDate: document.getElementById('delegationDueDateInput').value || null,
    status: 'not-started',
    notes: document.getElementById('delegationNotesInput').value.trim(),
    updatedAt: new Date().toISOString()
  };
  delegations.push(d);
  localStorage.setItem(DELEGATIONS_KEY, JSON.stringify(delegations));
  pushDelegationToSupabase(d);
  closeDelegationModal();
  renderDelegationV2();
}

// ===================== V2 REVIEW SCREEN =====================
function generateWeeklySummaryHtml() {
  const dMon = new Date(); dMon.setDate(dMon.getDate() - (dMon.getDay() || 7) + 1);
  const thisMonday = dMon.toISOString().split('T')[0];

  let weeklyCompletedCount = 0;
  let topHighlights = [];

  const thisWeekLogs = dailyLog.filter(l => l.date >= thisMonday);
  thisWeekLogs.forEach(l => {
    if (l.review && l.review.well) {
      topHighlights.push(l.review.well);
    }
    // Attempt to parse completed_tasks from JSON
    if (l.completed_tasks) {
      try {
        const parsed = typeof l.completed_tasks === 'string' ? JSON.parse(l.completed_tasks) : l.completed_tasks;
        if (Array.isArray(parsed)) {
          weeklyCompletedCount += parsed.length;
        }
      } catch (e) {}
    }
  });
  
  // If daily logs are sparse, fallback to tasks done count from 'cat === this-week' or generally 'done'
  if (weeklyCompletedCount === 0) {
    weeklyCompletedCount = tasks.filter(t => t.done && t.cat === 'this-week').length || tasks.filter(t => t.done).length;
  }
  
  const weekOutreach = outreach_logs.filter(l => l.date >= thisMonday);
  const totalSent = weekOutreach.reduce((sum, l) => sum + (l.messages_sent || 0), 0);
  const totalBooked = weekOutreach.reduce((sum, l) => sum + (l.calls_booked || 0), 0);

  return `
    <div style="background:var(--bg-tertiary); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:20px; margin-bottom:24px;">
      <h3 style="font-size:16px; margin:0 0 16px; display:flex; align-items:center; gap:8px;">
        📅 This Week's Auto-Pull Summary
      </h3>
      <div style="display:flex; gap:16px; margin-bottom:16px;">
        <div style="flex:1; background:rgba(255,255,255,0.02); padding:12px; border-radius:8px;">
          <div style="font-size:24px; font-weight:800; color:var(--text);">${weeklyCompletedCount}</div>
          <div style="font-size:11px; color:var(--text-muted);">Tasks Done</div>
        </div>
        <div style="flex:1; background:rgba(255,255,255,0.02); padding:12px; border-radius:8px;">
          <div style="font-size:24px; font-weight:800; color:var(--accent);">${totalSent}</div>
          <div style="font-size:11px; color:var(--text-muted);">Outreach Sent</div>
        </div>
        <div style="flex:1; background:rgba(255,255,255,0.02); padding:12px; border-radius:8px;">
          <div style="font-size:24px; font-weight:800; color:var(--amber-400);">${totalBooked}</div>
          <div style="font-size:11px; color:var(--text-muted);">Calls Booked</div>
        </div>
      </div>
      ${topHighlights.length > 0 ? `
      <div>
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:8px;">Highlights from Daily Reviews</div>
        <ul style="margin:0; padding-left:16px; font-size:13px; color:var(--text-dim);">
          ${topHighlights.slice(0, 3).map(t => `<li style="margin-bottom:4px;">${esc(t)}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    </div>
  `;
}

function renderReviewV2() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const todayEntry = dailyLog.find(e => e.date === todayStr());
  const hasReview = todayEntry && todayEntry.review;
  const reviewedDays = dailyLog.filter(e => e.review).sort((a, b) => b.date.localeCompare(a.date));

  // Calculate averages
  const avgEnergy = reviewedDays.length > 0 ? (reviewedDays.reduce((s, e) => s + e.review.energy, 0) / reviewedDays.length).toFixed(1) : '—';
  const avgFocus = reviewedDays.length > 0 ? (reviewedDays.reduce((s, e) => s + e.review.focus, 0) / reviewedDays.length).toFixed(1) : '—';
  const avgExec = reviewedDays.length > 0 ? (reviewedDays.reduce((s, e) => s + e.review.exec, 0) / reviewedDays.length).toFixed(1) : '—';

  let html = `<div style="padding:0 16px 100px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:20px; font-weight:800; margin:0;">Reviews & Momentum</h2>
      ${!hasReview ? `<button style="background:var(--accent); color:#fff; border:none; border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer;" onclick="openReviewModal()">Write Review</button>` : ''}
    </div>

    ${generateWeeklySummaryHtml()}

    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;">
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--amber-400);">⚡ ${avgEnergy}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Avg Energy</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--accent);">🎯 ${avgFocus}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Avg Focus</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--green-400);">🚀 ${avgExec}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Avg Execution</div>
      </div>
    </div>`;

  if (hasReview) {
    const r = todayEntry.review;
    html += `<div style="background:linear-gradient(135deg, var(--purple-50), var(--bg-secondary)); border-radius:14px; padding:16px; margin-bottom:16px; border:1px solid var(--purple-100);">
      <div style="font-size:11px; font-weight:700; color:var(--accent); text-transform:uppercase; margin-bottom:8px;">Today's Review ✓</div>
      <div style="display:flex; gap:16px; font-size:13px; margin-bottom:10px;">
        <span>E: <strong>${r.energy}/5</strong></span>
        <span>F: <strong>${r.focus}/5</strong></span>
        <span>X: <strong>${r.exec}/5</strong></span>
      </div>
      ${r.well ? `<div style="font-size:12px; color:var(--text-dim); line-height:1.5; margin-bottom:6px;"><strong style="color:var(--green-400);">✓ Went well:</strong> ${esc(r.well)}</div>` : ''}
      ${r.blocked ? `<div style="font-size:12px; color:var(--text-dim); line-height:1.5; margin-bottom:6px;"><strong style="color:var(--red-400);">✗ Blocked:</strong> ${esc(r.blocked)}</div>` : ''}
      ${r.different ? `<div style="font-size:12px; color:var(--text-dim); line-height:1.5;"><strong style="color:var(--amber-400);">→ Tomorrow:</strong> ${esc(r.different)}</div>` : ''}
    </div>`;
  }

  if (reviewedDays.length === 0) {
    html += `<div class="v2-empty"><div class="v2-empty-icon">📝</div><div class="v2-empty-text">No reviews yet. Complete 60% of your tasks to unlock today's review.</div></div>`;
  } else {
    html += `<div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Past Daily Reviews</div>`;
    reviewedDays.forEach(entry => {
      if (entry.date === todayStr()) return; // Already shown above
      const d = new Date(entry.date + 'T12:00:00');
      const dayName = d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
      const r = entry.review;
      html += `<div class="v2-task-row" style="padding:14px; margin-bottom:8px;">
        <div class="v2-task-content" style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span class="v2-task-text" style="font-size:13px; font-weight:700;">${dayName}</span>
            <span style="font-size:12px; color:var(--text-muted); flex-shrink:0; margin-left:8px;">E:${r.energy} F:${r.focus} X:${r.exec}</span>
          </div>
          ${r.well ? `<div style="font-size:11px; color:var(--text-dim); line-height:1.4;">✓ ${esc(r.well)}</div>` : ''}
        </div>
      </div>`;
    });
  }

  // Weekly Reviews section
  const weeklyReviews = renderWeeklyReviews();
  html += `<div style="margin-top:28px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Weekly Reviews</div>
      <button style="background:var(--accent); color:#fff; border:none; border-radius:8px; padding:7px 14px; font-size:12px; font-weight:700; cursor:pointer;" onclick="openWeeklyReviewModal()">+ This Week</button>
    </div>`;

  if (weeklyReviews.length === 0) {
    html += `<div style="background:var(--bg-secondary); border-radius:12px; padding:20px; text-align:center; border:1px solid var(--border); color:var(--text-muted); font-size:13px;">No weekly reviews yet.<br><span style="font-size:12px;">Do one every Sunday — takes 10 min.</span></div>`;
  } else {
    weeklyReviews.forEach(wr => {
      const weekStart = new Date(wr.weekStart + 'T12:00:00');
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
      const fmt = d => d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      const scoreColor = wr.score >= 8 ? 'var(--green-400)' : wr.score >= 6 ? 'var(--amber-400)' : 'var(--red-400)';
      const outreachLine = wr.outreachSent > 0 ? `${wr.outreachSent} sent · ${wr.outreachReplies} replies · ${wr.callsBooked} calls` : 'No outreach data';
      html += `<div class="v2-task-row" style="padding:14px; margin-bottom:10px; cursor:pointer;" onclick="this.querySelector('.wr-expand').style.display = this.querySelector('.wr-expand').style.display === 'none' ? 'block' : 'none'">
        <div class="v2-task-content" style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:13px; font-weight:700;">${fmt(weekStart)} - ${fmt(weekEnd)}</span>
            <span style="font-size:20px; font-weight:900; color:${scoreColor};">${wr.score}/10</span>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:2px;">Outreach: ${outreachLine}</div>
          ${wr.next1 ? `<div style="font-size:11px; color:var(--accent);">Next week: ${esc(wr.next1)}</div>` : ''}
          <div class="wr-expand" style="display:none; margin-top:12px;">
            ${wr.wins ? `<div style="font-size:12px; color:var(--text-dim); margin-bottom:6px;"><strong style="color:var(--green-400);">Wins:</strong> ${esc(wr.wins)}</div>` : ''}
            ${wr.failures ? `<div style="font-size:12px; color:var(--text-dim); margin-bottom:6px;"><strong style="color:var(--red-400);">Missed:</strong> ${esc(wr.failures)}</div>` : ''}
            ${wr.selfFeedback ? `<div style="font-size:12px; color:var(--text-dim); margin-bottom:6px;"><strong>Self:</strong> ${esc(wr.selfFeedback)}</div>` : ''}
            ${wr.stop ? `<div style="font-size:12px; color:var(--amber-400);">Stop: ${esc(wr.stop)}</div>` : ''}
          </div>
        </div>
      </div>`;
    });
  }
  html += `</div>`;

  html += `</div>`;
  v2.innerHTML = html;
}

// ===================== V2 PLAYBOOK SCREEN =====================
function renderPlaybookV2() {
  const v2 = document.getElementById('v2Content');
  if (!v2) return;

  const typeLabels = { 'outreach-plan': 'Outreach', 'ops': 'Operations', 'positioning': 'Positioning', 'playbook': 'Playbook', 'reference': 'Reference' };
  const typeColors = { 'outreach-plan': '#EF9F27', 'ops': '#534AB7', 'positioning': '#1D9E75', 'playbook': '#378ADD', 'reference': '#AFA9EC' };

  const sorted = [...resources].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  let html = `<div style="padding:0 16px 100px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h2 style="font-size:20px; font-weight:800; margin:0;">Playbook</h2>
      <button style="background:var(--accent); color:#fff; border:none; border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer;" onclick="openResourceModal()">+ Resource</button>
    </div>

    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;">
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--accent);">${resources.length}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Total</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:22px; font-weight:800; color:var(--amber-400);">${resources.filter(r => r.pinned).length}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Pinned</div>
      </div>
      <div style="background:var(--bg-secondary); border-radius:12px; padding:14px; text-align:center; border:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:22px; font-weight:800;">${[...new Set(resources.map(r => r.type))].length}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Types</div>
      </div>
    </div>`;

  if (sorted.length === 0) {
    html += `<div class="v2-empty"><div class="v2-empty-icon">📚</div><div class="v2-empty-text">No playbook resources yet. Tap + to add outreach plans, references, and more.</div></div>`;
  } else {
    sorted.forEach(r => {
      const color = typeColors[r.type] || '#A78BFA';
      const label = typeLabels[r.type] || r.type;
      html += `<div class="v2-task-row" style="padding:16px; margin-bottom:10px; cursor:pointer;" onclick="toggleResourceExpand('${r.id}')">
        <div class="v2-task-content" style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
              ${r.pinned ? '<span style="color:var(--amber-400); font-size:14px;">★</span>' : ''}
              <span class="v2-task-text" style="font-size:14px; font-weight:700;">${esc(r.title)}</span>
            </div>
            <span style="font-size:10px; padding:3px 8px; border-radius:999px; background:${color}22; color:${color}; flex-shrink:0;">${label}</span>
          </div>
          <div id="resContent-${r.id}" class="resource-content" style="font-size:12px; color:var(--text-dim); line-height:1.5; max-height:0; overflow:hidden; transition:max-height 0.3s;">${esc(r.content || '')}</div>
          <div id="resActions-${r.id}" style="display:none; gap:8px; margin-top:8px; justify-content:flex-end;">
            <button style="background:var(--red-50); color:var(--red-800); border:none; border-radius:6px; padding:6px 12px; font-size:11px; cursor:pointer;" onclick="event.stopPropagation();deleteResource('${r.id}')">Delete</button>
            <button style="background:var(--purple-50); color:var(--purple-800); border:none; border-radius:6px; padding:6px 12px; font-size:11px; cursor:pointer;" onclick="event.stopPropagation();editResource('${r.id}')">Edit</button>
          </div>
        </div>
      </div>`;
    });
  }
  html += `</div>`;
  v2.innerHTML = html;
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

async function copyEveningCheckinApi() {
  if (!sb || !currentUser) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showToast('Sign in first to get a session token.', 'error'); return; }
  const token = session.access_token;
  const uid = currentUser.id;
  const base = SUPABASE_URL;
  const key = SUPABASE_ANON_KEY;
  const today = new Date().toISOString().split('T')[0];

  // Upsert to daily_logs with empty fields for Claude to fill in
  const cmd = `# Evening Check-in — paste into Claude session (${today})\n# Claude: fill in score, went_well, blocked, different, energy, focus, execution from Ladson's input\n\ncurl -s -X POST "${base}/rest/v1/daily_logs" \\\n  -H "apikey: ${key}" \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -H "Prefer: return=representation,resolution=merge-duplicates" \\\n  -d '{"id":"${today}","user_id":"${uid}","date":"${today}","score":SCORE,"went_well":"WENT_WELL","blocked":"BLOCKED","different":"DIFFERENT","energy":ENERGY,"focus":FOCUS,"execution":EXECUTION}'`;

  navigator.clipboard.writeText(cmd).then(() => showSyncStatus('eveningCheckinStatus'));
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
  const isReminder = activeTab === 'reminders';

  document.getElementById('modalTitle').textContent = isReminder ? 'Add Reminder' : 'Add Task';
  document.getElementById('taskInput').placeholder = isReminder ? 'What do you want to be reminded about?' : 'What needs to be done?';

  document.getElementById('taskInput').value = '';
  document.getElementById('categoryInput').value = (activeTab === 'done' || activeTab === 'history' || activeTab === 'sync' || activeTab === 'playbook') ? 'today' : activeTab;
  document.getElementById('priorityInput').value = 'medium';
  document.getElementById('statusInput').value = 'not-started';
  document.getElementById('domainInput').value = 'General';
  document.getElementById('phaseInput').value = '';
  document.getElementById('ownerInput').value = 'Ladson';
  document.getElementById('dueDateInput').value = '';
  document.getElementById('notesInput').value = '';
  document.getElementById('reminderInput').value = '';

  const currentOkr = JSON.parse(localStorage.getItem(OKR_KEY) || 'null');
  const okrSel = document.getElementById('okrInput');
  if (okrSel) {
    okrSel.innerHTML = '<option value="">None</option>';
    if (currentOkr) {
      if (currentOkr.one) okrSel.innerHTML += `<option value="${esc(currentOkr.one)}">${esc(currentOkr.one)}</option>`;
      if (currentOkr.bonus1) okrSel.innerHTML += `<option value="${esc(currentOkr.bonus1)}">${esc(currentOkr.bonus1)}</option>`;
      if (currentOkr.bonus2) okrSel.innerHTML += `<option value="${esc(currentOkr.bonus2)}">${esc(currentOkr.bonus2)}</option>`;
    }
    okrSel.value = '';
  }
  document.getElementById('modalActions').innerHTML = `
    <button class="btn-cancel" onclick="closeModal()">Cancel</button>
    <button class="btn-save" onclick="saveTask()">${isReminder ? 'Set Reminder' : 'Add Task'}</button>`;
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
  document.getElementById('statusInput').value = t.status || 'not-started';
  document.getElementById('domainInput').value = t.domain || 'General';
  document.getElementById('phaseInput').value = t.phase || '';
  document.getElementById('ownerInput').value = t.owner || 'Ladson';
  document.getElementById('dueDateInput').value = t.dueDate || '';
  document.getElementById('notesInput').value = t.notes || '';
  document.getElementById('reminderInput').value = t.reminderTime || '';

  const currentOkr = JSON.parse(localStorage.getItem(OKR_KEY) || 'null');
  const okrSel = document.getElementById('okrInput');
  if (okrSel) {
    okrSel.innerHTML = '<option value="">None</option>';
    if (currentOkr) {
      if (currentOkr.one) okrSel.innerHTML += `<option value="${esc(currentOkr.one)}">${esc(currentOkr.one)}</option>`;
      if (currentOkr.bonus1) okrSel.innerHTML += `<option value="${esc(currentOkr.bonus1)}">${esc(currentOkr.bonus1)}</option>`;
      if (currentOkr.bonus2) okrSel.innerHTML += `<option value="${esc(currentOkr.bonus2)}">${esc(currentOkr.bonus2)}</option>`;
    }
    // Also include the task's okrId if it's historical and not in current OKR set
    if (t.okrId && !Array.from(okrSel.options).some(o => o.value === t.okrId)) {
      okrSel.innerHTML += `<option value="${esc(t.okrId)}">${esc(t.okrId)}</option>`;
    }
    okrSel.value = t.okrId || '';
  }

  // Dependencies
  modalDependencies = [...(t.dependencies || [])];
  renderModalDeps();
  document.getElementById('modalActions').innerHTML = `
    <button class="btn-delete" onclick="deleteTask('${id}')">Delete</button>
    <button class="btn-cancel" onclick="closeModal()">Cancel</button>
    <button class="btn-save" onclick="saveTask()">Save</button>`;
  document.getElementById('modal').classList.add('open');
}

function closeModal() { document.getElementById('modal').classList.remove('open'); editingId = null; }

function openQuickCaptureModal() {
  document.getElementById('quickCaptureModal').classList.add('open');
  setTimeout(() => document.getElementById('quickCaptureInput').focus(), 50);
}

function closeQuickCaptureModal() {
  document.getElementById('quickCaptureModal').classList.remove('open');
  document.getElementById('quickCaptureInput').value = '';
}

function saveQuickCapture() {
  const text = document.getElementById('quickCaptureInput').value.trim();
  if (!text) return;
  const t = {
    id: uid(), text, cat: 'inbox', priority: 'medium', done: false,
    notes: '', daily: false, subtasks: [], streak: 0, lastStreakDate: null, reminderTime: null,
    domain: 'General', dueDate: null, status: 'not-started', phase: null, owner: 'Ladson', dependencies: [], okrId: null,
    updatedAt: new Date().toISOString()
  };
  tasks.push(t);
  pushTaskToSupabase(t);
  save(); closeQuickCaptureModal(); renderTopTabs(); renderScreen(); updateProgress();
}

function saveTask() {
  const text = document.getElementById('taskInput').value.trim();
  if (!text) return;
  const cat = document.getElementById('categoryInput').value;
  const priority = document.getElementById('priorityInput').value;
  const notes = document.getElementById('notesInput').value.trim();
  const reminderTime = document.getElementById('reminderInput').value || null;

  const status = document.getElementById('statusInput').value || 'not-started';
  const domain = document.getElementById('domainInput').value || 'General';
  const phase = document.getElementById('phaseInput').value || '';
  const owner = document.getElementById('ownerInput').value || 'Ladson';
  const dueDate = document.getElementById('dueDateInput').value || null;
  const okrInputEle = document.getElementById('okrInput');
  const okrId = okrInputEle ? (okrInputEle.value || null) : null;

  if (editingId) {
    const t = tasks.find(x => x.id === editingId);
    if (t) {
      t.text = text; t.cat = cat; t.priority = priority; t.notes = notes;
      t.reminderTime = reminderTime;
      t.status = status; t.domain = domain; t.phase = phase; t.owner = owner; t.dueDate = dueDate;
      t.okrId = okrId;
      t.dependencies = [...modalDependencies];
      t.done = (status === 'done');
      if (t.done && !t.completedAt) t.completedAt = new Date().toISOString();
      t.daily = (cat === 'today' || cat === 'daily-habits');
      t.updatedAt = new Date().toISOString();
      pushTaskToSupabase(t);
    }
  } else {
    const newTask = {
      id: uid(), text, cat, priority, done: (status === 'done'), notes, daily: (cat === 'today' || cat === 'daily-habits'),
      subtasks: [], streak: 0, lastStreakDate: null, reminderTime,
      domain, dueDate, status, phase, owner, dependencies: [...modalDependencies], okrId,
      updatedAt: new Date().toISOString()
    };
    if (newTask.done) newTask.completedAt = new Date().toISOString();
    tasks.push(newTask);
    pushTaskToSupabase(newTask);
  }
  save(); closeModal(); renderTopTabs(); renderScreen(); updateProgress();
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
    save(); closeModal(); renderTopTabs(); renderScreen(); updateProgress();
  }
}

// ===================== MODAL DEPENDENCIES =====================
function renderModalDeps() {
  const listEl = document.getElementById('modalDepsList');
  const selEl = document.getElementById('modalDepSel');
  if (!listEl || !selEl) return;

  // Render current list
  listEl.innerHTML = '';
  modalDependencies.forEach(depId => {
    const dt = tasks.find(x => x.id === depId);
    if (dt) {
      listEl.innerHTML += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; margin-bottom:6px; border-radius:8px; border:1px solid var(--border);">
          <span style="font-size:13px; color:var(--text);">${esc(dt.text.substring(0, 50))}</span>
          <button style="background:none; border:none; color:var(--red); cursor:pointer; font-size:18px; padding:0 4px;" onclick="removeModalDep('${depId}')">&times;</button>
        </div>`;
    }
  });

  // Update picker options
  selEl.innerHTML = '<option value="">Add dependency...</option>';
  const possible = tasks.filter(x => !modalDependencies.includes(x.id) && (editingId ? x.id !== editingId : true) && !x.done);
  possible.forEach(x => {
    selEl.innerHTML += `<option value="${x.id}">${esc(x.text.substring(0, 40))}</option>`;
  });
}

function addModalDep() {
  const sel = document.getElementById('modalDepSel');
  if (sel && sel.value) {
    modalDependencies.push(sel.value);
    renderModalDeps();
  }
}

function removeModalDep(id) {
  modalDependencies = modalDependencies.filter(x => x !== id);
  renderModalDeps();
}

document.getElementById('modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

// ===================== TASK DETAIL PANEL =====================
function openTaskDetail(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  const panel = document.getElementById('detailPanel');
  let badgeCol = t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'amber' : 'teal';
  
  let html = `
    <div class="detail-header">
      <div class="detail-title">${esc(t.text)}</div>
      <button class="detail-close" onclick="closeTaskDetail()">&times;</button>
    </div>

    <div class="chips-row" style="margin-bottom:20px;">
      <span class="badge ${badgeCol}">${t.priority} priority</span>
      <span class="chip">${catLabels[t.cat] || t.cat}</span>
      ${t.daily ? '<span class="rec-tag">Daily Habit</span>' : ''}
    </div>`;

  // Status Card
  html += v2Card(`
    <div style="display:flex;align-items:center;gap:12px;">
      ${statusDot(t.done ? 'green' : 'yellow')}
      <span style="color:var(--text)">${t.done ? 'Completed' + (t.completedAt ? ' on ' + t.completedAt.split('T')[0] : '') : 'Not completed yet'}</span>
    </div>
  `, { borderColor: t.done ? 'green' : 'amber' });

  // Notes
  if (t.notes) {
    html += v2Card(`
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Notes</div>
      <div style="color:var(--text);white-space:pre-wrap;font-size:14px;line-height:1.5;">${esc(t.notes)}</div>
    `);
  }

  // Subtasks
  const subs = t.subtasks || [];
  if (subs.length > 0 || !t.done) {
    const subsDone = subs.filter(s => s.done).length;
    let subHtml = `
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">
        Subtasks ${subs.length > 0 ? `(${subsDone}/${subs.length})` : ''}
      </div>`;

    if (subs.length > 0) {
      subHtml += `<div class="subtask-list">`;
      subs.forEach((s, i) => {
        subHtml += `
        <div class="v2-task-row${s.done ? ' done' : ''}" style="padding:10px 14px;margin-bottom:6px;">
          <div class="v2-task-check${s.done ? ' checked' : ''}" onclick="toggleSubtask('${t.id}',${i})"></div>
          <div class="v2-task-content">
            <div class="v2-task-text">${esc(s.text)}</div>
          </div>
        </div>`;
      });
      subHtml += `</div>`;
    }

    subHtml += `
      <div class="v2-search" style="margin-top:10px;padding:3px;">
        <input type="text" id="newSubtaskInput" placeholder="Add a step..." onkeydown="if(event.key==='Enter')addSubtask('${t.id}')">
        <button onclick="addSubtask('${t.id}')" style="background:var(--accent);color:white;border:none;border-radius:12px;padding:8px 16px;cursor:pointer;font-weight:600;">Add</button>
      </div>`;
    html += v2Card(subHtml);
  }

  // Dependencies
  const deps = t.dependencies || [];
  let depHtml = '<div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">Depends On</div>';
  
  if (deps.length > 0) {
    depHtml += '<div style="margin-bottom:12px;">';
    deps.forEach(depId => {
      const dt = tasks.find(x => x.id === depId);
      if (dt) {
        depHtml += `
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding:8px 12px; margin-bottom:6px; border-radius:6px; border:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:8px;">
              ${statusDot(dt.done ? 'green' : (dt.status === 'blocked' ? 'red' : 'yellow'))}
              <span style="font-size:14px; text-decoration:${dt.done ? 'line-through' : 'none'}; color:${dt.done ? 'var(--text-light)' : 'var(--text)'};">${esc(dt.text)}</span>
            </div>
            <button style="background:none; border:none; color:var(--red); cursor:pointer; font-size:16px;" onclick="removeDependency('${t.id}', '${depId}')">&times;</button>
          </div>
        `;
      }
    });
    depHtml += '</div>';
  }
  
  const possibleDeps = tasks.filter(x => x.id !== t.id && !deps.includes(x.id) && !x.done);
  depHtml += `
    <div style="display:flex; gap:8px;">
      <select id="newDepSel-${t.id}" style="flex:1; padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-size:13px;">
        <option value="">Add a dependency...</option>
        ${possibleDeps.map(x => `<option value="${x.id}">${esc(x.text.substring(0, 40))}${x.text.length>40?'...':''}</option>`).join('')}
      </select>
      <button onclick="addDependency('${t.id}')" style="background:var(--accent);color:white;border:none;border-radius:6px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px;">Add</button>
    </div>
  `;
  html += v2Card(depHtml);

  // Streak/Reminder section
  if (t.daily || t.reminderTime) {
    let extraHtml = '';
    if (t.daily) {
      const streakVal = t.streak || 0;
      extraHtml += `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:${t.reminderTime?10:0}px;">
          ${statusDot(streakVal > 0 ? 'green' : 'gray')}
          <span style="color:var(--text)">${streakVal > 0 ? `${streakVal} day streak 🔥` : 'No streak right now'}</span>
        </div>`;
    }
    if (t.reminderTime) {
      extraHtml += `
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:16px;">⏰</span>
          <span style="color:var(--text)">Reminder set for ${t.reminderTime}</span>
        </div>`;
    }
    html += v2Card(extraHtml);
  }

  const tips = getTaskTips(t);
  if (tips) {
    html += v2Card(`
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Quick Guide</div>
      <div style="color:var(--text);font-size:13px;line-height:1.5;">${tips}</div>
    `, { borderColor: 'teal' });
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

// ===================== DEPENDENCIES =====================
function addDependency(taskId) {
  const sel = document.getElementById(`newDepSel-${taskId}`);
  if (!sel || !sel.value) return;
  const t = tasks.find(x => x.id === taskId);
  if (t) {
    if (!t.dependencies) t.dependencies = [];
    t.dependencies.push(sel.value);
    t.updatedAt = new Date().toISOString();
    pushTaskToSupabase(t);
    save();
    openTaskDetail(taskId);
    renderScreen();
  }
}

function removeDependency(taskId, depId) {
  const t = tasks.find(x => x.id === taskId);
  if (t && t.dependencies) {
    t.dependencies = t.dependencies.filter(id => id !== depId);
    t.updatedAt = new Date().toISOString();
    pushTaskToSupabase(t);
    save();
    openTaskDetail(taskId);
    renderScreen();
  }
}

function checkDependencyStatus(task) {
  if (!task.dependencies || task.dependencies.length === 0) return true;
  for (let depId of task.dependencies) {
    const dt = tasks.find(x => x.id === depId);
    if (dt && !dt.done) return false;
  }
  return true;
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
    save(); closeTaskDetail(); renderTopTabs(); renderScreen(); updateProgress();
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
  renderTopTabs();
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

  // Check per-task reminders (today + daily habits + standalone reminders)
  const todayTasks = tasks.filter(t => (t.cat === 'today' || t.cat === 'daily-habits' || t.cat === 'reminders') && !t.done && t.reminderTime);
  for (const t of todayTasks) {
    if (t.reminderTime === currentTime) {
      // Phase 5.1: If app is backgrounded and high priority, send email fallback
      if (document.visibilityState !== 'visible' && t.priority === 'high') {
         sendEmailReminder(t.text, t.reminderTime);
      }
      
      showNotification('Task Reminder', t.text);
      if (!firedAny) { playReminderSound(); firedAny = true; incrementNotifCount(); }
      lastFiredMinute = currentTime;
    }
  }
}

async function sendEmailReminder(text, time) {
  const user_email = localStorage.getItem('EMAIL_FALLBACK');
  if (!user_email || !sb) return;
  
  try {
    const { data, error } = await sb.functions.invoke('send-reminder-email', {
      body: { task_text: text, reminder_time: time, user_email: user_email }
    });
    if (error) console.log('Email fallback failed:', error);
  } catch (e) {
    console.log('Email fallback error:', e);
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
  renderTopTabs(); renderScreen(); updateProgress();
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
    title: 'Positioning Guide',
    type: 'positioning',
    pinned: true,
    content: `MALVEON POSITIONING GUIDE\n\n=== THE ONE-SENTENCE PITCH (4 Versions - Pick Based on Their Pain) ===\n\nVersion 1 - Tool Chaos Pain:\n"Malveon connects your Slack, Jira, GitHub, and Datadog so you stop losing context across 15 different tools."\nUse when: "We have too many tools" or "Context switching is killing us"\n\nVersion 2 - Decision Loss Pain:\n"Malveon captures decisions from Slack threads before they disappear and surfaces them when developers need them in VS Code."\nUse when: "Decisions disappear" or "No one remembers what we decided"\n\nVersion 3 - Fake Health Dashboards Pain:\n"Malveon shows real project health by pulling signals from your actual tools - not what someone manually updated in Jira 3 days ago."\nUse when: "Jira doesn't reflect reality" or "Status reports are lies"\n\nVersion 4 - Incident Response Pain:\n"Malveon cuts incident triage from 30+ minutes to 5 minutes by auto-surfacing the PR, deploy, and conversation that caused the issue."\nUse when: "Incident response is chaos" or "We waste time during outages"\n\n=== TARGET CUSTOMER ===\n8-60 person engineering teams. Post-Series A startups, growing product teams, companies scaling fast. Too big for founder-mode chaos, too small for enterprise tools like ServiceNow.\n\n=== ELEVATOR PITCH (30 seconds) ===\n"You know how when eng teams hit 20+ people, they're using Slack, Jira, GitHub, Datadog, and 10 other tools? Decisions disappear in Slack threads, Jira says everything's green but nothing ships, and incidents take 45 minutes just to figure out what broke? That's what we fix. Malveon connects all those tools so you get one unified view - decisions surface when you need them, project health is based on real signals, and incident triage goes from 45 minutes to 5. We're in early access right now."\n\n=== CUSTOMER PAIN HIERARCHY ===\nTIER 1 - Lead with these: Incident triage takes 30-90 min | Decisions vanish in Slack | Jira health is fake\nTIER 2 - Use if Tier 1 doesn't land: Context switching kills flow | Manual status updates | Onboarding chaos\nTIER 3 - Don't lead with: Tool costs | Security/compliance\n\n=== HOW WE'RE DIFFERENT FROM JIRA/NOTION ===\nWe don't replace Jira or Linear. We pull data FROM them and add: decision memory, real health signals, deploy safety, context bridges. Think: connective tissue between your existing tools.\n\nPRICING (when asked): "We're in early access. Thinking $99-199/month for teams up to 30 people. For early customers who give us feedback, we're offering founder's pricing - significantly discounted and locked in forever."`
  },
  {
    title: 'LinkedIn Templates',
    type: 'outreach-plan',
    pinned: true,
    content: `LINKEDIN OUTREACH TEMPLATES\nSend from: ladson@malveon.com\n\n=== CONNECTION REQUEST (300 char limit - NO PITCH) ===\nGoal: get them to accept. Do NOT mention what you're building.\n\nTemplate:\n"Hi [NAME], saw your post about [SPECIFIC THING THEY POSTED]. The problem you described with [SPECIFIC DETAIL] is something I think about a lot. Would love to connect."\n\nExample:\n"Hi Priya, saw your post about incident triage taking forever on Monday. The part about context scattered across tools hit me. Would love to connect."\n\nDO NOT USE: "Hi [NAME], building Malveon to solve context loss for eng teams." (tells them it's sales - 60% lower response rate)\n\n=== FOLLOW-UP MESSAGE (24 hrs after they accept - ONE question, no pitch) ===\n\nTemplate A (incident-focused):\n"Thanks for connecting, [NAME]. Quick question - when your eng team hits an incident, roughly how long does it take to connect the dots between the Slack alert, the GitHub PR, and whoever owns the service? Just curious how different teams handle this."\n\nTemplate B (decision-focused):\n"Thanks for connecting, [NAME]. Genuine question - at [COMPANY], how does your team currently handle decisions that get made in Slack threads? Like, 3 weeks later, how does a new engineer know why something was built a certain way?"\n\nWHY ONE QUESTION ONLY: They don't know you yet. If they answer, THEN you have permission to share more. Gets 3-4x higher reply rates than pitching on first follow-up.`
  },
  {
    title: 'Follow-up Sequence (Day 4 / 9 / 14)',
    type: 'outreach-plan',
    pinned: true,
    content: `FOLLOW-UP CADENCE\nD0: Send connection + note | D4: First follow-up | D9: Second follow-up | D14: Close-out\n\n=== DAY 4 - First follow-up (if no reply) ===\n"Hey [NAME], wanted to follow up on my earlier message. No worries if timing is off. If you ever want to talk about the context loss problem for engineering teams, I'd love to hear how you're handling it at [COMPANY]."\n\n=== DAY 9 - Second follow-up (short, direct) ===\n"Hey [NAME] - last note from me. Building Malveon to cut incident triage time for eng teams from 30+ min to under 5. If that's a pain you feel, happy to show you what we have. If not, no worries."\n\n=== DAY 14 - Close-out (gives them an easy out, sometimes triggers a reply) ===\n"Closing the loop on this one. If the context-loss-across-tools problem ever becomes urgent at [COMPANY], I'm at ladson@malveon.com. Good luck with everything you're building."\n\n=== RESPONSE ESCALATION LADDER ===\nLevel 1 - They like your reply: Do nothing. Wait.\nLevel 2 - They reply short ("Exactly!" or "So true"):\n"Glad this resonated. We're talking to eng leads dealing with this exact problem right now. Would love 15 minutes to hear how you're handling it - open to a quick call?"\nLevel 3 - They reply with a detailed answer: Move to DM immediately. Use DM template.\nLevel 4 - They DM you first: Reply within 1 hour. Propose a call with Calendly link. Do not make them wait.\n\n=== WEEKLY VOLUME TARGETS ===\nLinkedIn connection requests: 10/day\nLinkedIn follow-up messages: same day as acceptance\nX replies: 5/day\nDMs to warm leads: within 1 hour of reply\nNew prospects added: 10/day\nExpected result: 3-5 new conversations/week, 15-20/month`
  },
  {
    title: 'X / Twitter Templates',
    type: 'outreach-plan',
    pinned: false,
    content: `X / TWITTER OUTREACH TEMPLATES\n\n=== 5 REPLY TEMPLATES ===\n\n1. TOOL CHAOS (when someone complains about too many tools):\n"We heard this exact pain from eng leads last month. One team paying for Slack + Jira + Linear + GitHub + Datadog + PagerDuty was still pinging people manually for status.\n\nWhat's the breaking point for you - cost or context loss?"\n\n2. DECISION LOSS (when someone talks about decisions disappearing):\n"This is brutal. Talked to an eng lead recently who said 'we decided something in a Slack call, a developer asks me 2 weeks later, I can't find the notes anywhere.'\n\nDoes this happen more in product decisions or technical ones for you?"\n\n3. INCIDENT RESPONSE PAIN (when someone shares a downtime story):\n"30-90 minute triage is the killer. Heard from a team that spent 45 min just finding which PR caused the issue because context was split across Slack, Jira, GitHub, and Datadog.\n\nWhat takes longest in your incident triage - finding the cause or getting the right people?"\n\n4. TEAM SCALING PAIN (when someone talks about team growing quickly):\n"That 15 to 30 person jump is where everything breaks. What worked for 15 suddenly doesn't scale.\n\nFor you, was it communication chaos or process breakdown that hit first?"\n\n5. JIRA LIES (when someone says status reports are wrong):\n"'Jira says green but nothing ships' is every PM's nightmare.\n\nWhat finally forced the honest conversation - demo day, investor meeting, or a customer asking 'where is it?'"\n\n=== DM TEMPLATE (when they reply positively to your comment) ===\n"Hey [NAME], really appreciated what you said about [SPECIFIC THING].\n\nWe're building Malveon for exactly this - eng teams where context gets lost across Slack, Jira, and GitHub. Would love 15 minutes to hear more about your situation and show you what we have.\n\nOpen to a quick call this week? Here's my calendar: [CALENDLY LINK]\n\n- Ladson, co-founder Malveon"\n\n=== SEARCH TERMS FOR TARGETS ===\n"Jira doesn't reflect reality" | "engineering tool fatigue" | "incident triage chaos" | "slack decisions disappear"`
  },
  {
    title: 'Email Templates (All 5)',
    type: 'outreach-plan',
    pinned: false,
    content: `EMAIL TEMPLATES\nALWAYS send from: ladson@malveon.com (NEVER lads8572@gmail.com)\n\n=== TEMPLATE 1: Cold Outreach - India targets ===\nSubject: Quick question about eng team context loss\n\nHi [NAME],\n\nOne honest question: when your team hits an incident, how long does it take to connect the Slack alert, the relevant GitHub PR, and the Jira ticket? Most teams we talk to say 30-45 min.\n\nWe're building Malveon to bring that to under 5. Have a working prototype. Would love 20 min to show you and get your honest take.\n\nFree this week?\n\n- Ladson, Co-founder Malveon | ladson@malveon.com\n\n=== TEMPLATE 2: Cold Outreach - US/Europe targets ===\nSubject: [COMPANY] eng team - worth 15 mins?\n\nHi [NAME],\n\nBuilding Malveon - engineering team intelligence layer for teams with 20-60 people dealing with Slack + Jira + GitHub context loss.\n\nQuick question: at [COMPANY], how does your team currently know if a project is actually healthy vs what Jira says?\n\nIf that's a real problem for you, I'd love to show you what we have. 15 min max.\n\n- Ladson, Co-founder Malveon | ladson@malveon.com\n\n=== TEMPLATE 3: Warm Intro Follow-Up ===\nSubject: [INTRODUCER] suggested we connect\n\nHi [NAME],\n\n[INTRODUCER] thought we should talk. Building Malveon to solve context loss for engineering teams - Slack decisions that disappear, Jira that doesn't reflect reality, incidents that take 45 min to triage.\n\n[INTRODUCER] mentioned you lead engineering at [COMPANY]. Would love 20 minutes to hear how you're handling this and show you what we're building.\n\nFree this week or next?\n\n- Ladson, Co-founder Malveon | ladson@malveon.com\n\n=== TEMPLATE 4: Post-Call (They Said Yes) ===\nSubject: Next steps - Malveon early access\n\nHey [NAME], great talking. Based on what you shared:\n1. [SPECIFIC PAIN THEY MENTIONED]\n2. Early access timeline: [DATE]\n3. I'll send login details + a 5-min onboarding doc\n\nWill ping you on [SPECIFIC DATE] with the update.\nReach me anytime: ladson@malveon.com\n\n- Ladson\n\n=== TEMPLATE 5: Post-Call (They Said No) ===\nSubject: Thanks for being straight\n\nHey [NAME], really appreciate the honesty. Sounds like [THEIR REASON] is the blocker. Totally fair. If things change - or if you know someone leading engineering at a 20-60 person company - I'd love an intro.\n\n- Ladson | ladson@malveon.com`
  },
  {
    title: 'Discovery Call + Objection Handling',
    type: 'playbook',
    pinned: false,
    content: `DISCOVERY CALL SCRIPT\n\nOPENING:\n"Thanks for taking the time, [NAME]. Before I tell you what we're building, I'd love to hear about your setup first. Does that work?"\n\nQUESTION 1: Walk me through a typical week. What tools do you and your team touch most?\n\nQUESTION 2: When's the last time important context got lost - buried in a Slack thread, wrong Jira status, or just nobody knows why a decision was made?\n\nQUESTION 3: How do you currently know if a project is actually on track vs what the dashboard says?\n\nQUESTION 4: When an incident hits, what takes the longest - finding the cause or getting the right people?\n\nQUESTION 5: If you could fix one thing about how information flows in your team, what would it be?\n\nCLOSING:\n"Two questions: Would this actually solve the problem you described? And if we have early access ready in the next 3-4 weeks, would you be open to trying it?"\n\n=== OBJECTION HANDLING ===\n\n"We already use Jira/Linear":\n"Totally. Malveon doesn't replace Jira - it pulls data from Jira and adds what's missing: decision memory, real project health signals, and deploy context. Think of it as the layer that connects Jira + Slack + GitHub."\n\n"We're too early/small":\n"Understood. When do you think you'll hit the breaking point? Most teams say it happens around 15-20 engineers when async communication starts breaking."\n\n"No budget":\n"Makes sense. What are you currently spending on Slack + Jira + GitHub + Datadog combined? Our goal is to reduce your total tool spend, not add to it."\n\n"Don't have time to evaluate":\n"Fair. Would you be open to a 10-minute async Loom demo? You watch when convenient and tell me if it's worth exploring."\n\n"Can we try it first?":\n"Absolutely. We onboard you (15 min setup). You use it for 2-3 weeks. We check in every few days for feedback. At the end, you decide if it's worth paying for. Sound fair?"`
  },
  {
    title: 'India-First Targeting Guide',
    type: 'reference',
    pinned: false,
    content: `INDIA-FIRST TARGET SEARCH\nDo India targets before US/Europe. Same timezone, no competition, easier calls, faster trust.\n\n=== BEST ICP IN INDIA RIGHT NOW ===\n- Series A/B SaaS companies (Bangalore, Hyderabad, Pune, Chennai)\n- 20-80 engineer teams using Slack + Jira + GitHub daily\n- Company types: fintech, edtech infra, B2B SaaS, dev tools\n\n=== LINKEDIN SEARCH STRINGS ===\n- "Head of Engineering" + India + 51-200 employees\n- "Engineering Manager" + Bangalore/Hyderabad + software\n- "VP Engineering" + India + Series A/B\n\nWHY INDIA FIRST: Same ICP pain, same timezone, WhatsApp follow-ups possible, easier to get a call, no US reps competing for their attention yet.\n\n=== X/TWITTER POST TEMPLATES ===\n\nPost Type 1 - Customer Pain (weekly):\n"Talked to an eng lead yesterday who said: 'We spent $80K last year on tools. Everyone's still asking where did we decide this? in Slack.' Tool sprawl isn't a tooling problem. It's a context problem. That's why we built Malveon."\n\nPost Type 2 - Building in Public (2-3x per week):\n"Day [X] building Malveon: Shipped: [FEATURE]. Learning: [INSIGHT]. Next: [PLAN]. Building for 20-60 person eng teams tired of tool chaos."\n\nPost Type 3 - Customer Insight (weekly):\n"'When did you realize you needed this?' Every eng lead we've talked to says: 'Between engineer 15 and 25, everything broke. What worked for 15 doesn't scale.' If you're in that range right now, reply and tell me what broke first."\n\n=== DAILY OUTREACH CHECKLIST ===\nMorning: Draft post + tweet saved | 3 new ICP prospects identified | 2 DMs sent\nMidday: 5 LinkedIn comments on ICP posts | 3 X replies | DMs to morning prospects\nEvening (manual): Review daily-staging.md | Approve posts | Update tracker`
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
      <div id="tokenExpiry" style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">Token valid</div>
      <div style="display:flex; gap:8px;">
        <button class="sync-btn secondary" onclick="refreshAndCopyToken()" style="flex:1">Refresh & Copy Token</button>
        <button class="sync-btn tertiary" onclick="signOut()" style="flex:1">Sign Out</button>
      </div>
      <div id="tokenRefreshStatus" class="sync-status">Token copied to clipboard!</div>
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
          <div class="sync-stat-label">Last Cloud Sync</div>
          <div class="sync-stat-value">${lastSync}</div>
        </div>
        <div class="sync-stat">
          <div class="sync-stat-label">Auto-Sync (TASKS.md)</div>
          <div class="sync-stat-value">${lastAutoSync ? lastAutoSync : 'Never'}</div>
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
    const emailFallback = localStorage.getItem('EMAIL_FALLBACK') || '';
    html += `
    <div class="sync-card">
      <h3>Priority Email Fallback</h3>
      <p style="margin-bottom:12px; font-size: 11px; color: var(--text-muted)">Send email for P0 reminders when app is in background.</p>
      <input type="email" id="emailFallbackInput" placeholder="Enter your email" value="${esc(emailFallback)}" 
        style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-size:13px; margin-bottom:8px;">
      <button class="sync-btn tertiary" onclick="saveEmailFallback()">Save Email Setting</button>
    </div>
    <div class="sync-card">
      <h3>Active Task Reminders</h3>
      <p style="margin-bottom:12px; font-size: 13px; color: var(--text-muted)">You can set custom reminder times for any task by using the <strong>Remind me at</strong> input when creating or editing a task. Perfect for scheduling specific meetings or time blocks.</p>
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
      <h3>Force App Update (Mobile Fix)</h3>
      <p>If your mobile app is stuck on an old version with missing features, clicking this will clear the app's structural cache and refresh.</p>
      <button class="sync-btn remove" onclick="forceAppUpdate()">Force App Update</button>
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
      <p>Auto-syncing with <strong>${esc(workspaceDirHandle.name)}</strong> every 30s. New tasks added there will appear here.</p>
      <button class="sync-btn secondary" onclick="manualSyncFromWorkspace()">Sync Now</button>
      <div id="workspaceStatus" class="sync-status" style="margin-top:12px;"></div>
    </div>`;
  } else {
    html += `
    <div class="sync-card workspace-card">
      <h3>Workspace Folder Auto-Sync</h3>
      <p>Connect your local Malveon folder on your desktop. The app will auto-import any new tasks added to TASKS.md every 30s.</p>
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
        <button class="sync-btn secondary" style="margin-top:8px" onclick="copyEveningCheckinApi()">Copy Evening Check-in API</button>
        <div class="sync-status" id="eveningCheckinStatus">Copied! Paste this into your evening scheduled task.</div>
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

// ===================== FORCE APP UPDATE =====================
async function forceAppUpdate() {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let reg of registrations) { await reg.unregister(); }
      const keys = await caches.keys();
      for (let key of keys) { await caches.delete(key); }
      window.location.href = window.location.href.split('?')[0] + '?update=' + new Date().getTime();
    } catch (err) {
      window.location.reload(true);
    }
  } else {
    window.location.reload(true);
  }
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
    renderTopTabs(); renderScreen();
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

async function importProspectsFromStagingFile() {
  if (!workspaceDirHandle) {
    alert('Please connect workspace folder first in Sync tab.');
    return;
  }
  try {
    const fileHandle = await workspaceDirHandle.getFileHandle('outreach/trackers/daily-staging.md');
    const file = await fileHandle.getFile();
    const content = await file.text();
    
    // Parse ## 5 New ICP Prospects table
    const sectionStart = content.indexOf('## 5 New ICP Prospects');
    if (sectionStart === -1) {
      alert('Could not find "## 5 New ICP Prospects" section in daily-staging.md');
      return;
    }
    
    const lines = content.substring(sectionStart).split('\n');
    let imported = 0;
    
    for (const line of lines) {
      if (line.includes('|') && !line.includes('---') && !line.includes('Name |')) {
        const parts = line.split('|').map(p => p.trim()).filter(p => p !== '');
        if (parts.length >= 3) {
          const name = parts[0];
          const title = parts[1];
          const company = parts[2];
          
          // Duplicate check
          const exists = prospects.some(p => p.name.toLowerCase() === name.toLowerCase() && p.company.toLowerCase() === company.toLowerCase());
          if (!exists) {
            const p = {
              id: uid(),
              name, title, company,
              status: 'new',
              source: 'morning-prep',
              health: 'green',
              interactions: [],
              nextFollowupDate: null,
              notes: '',
              owner: 'Ladson',
              created_at: todayStr()
            };
            prospects.unshift(p);
            pushProspectToSupabase(p);
            imported++;
          }
        }
      }
      // Stop at next header
      if (line.startsWith('## ') && !line.includes('5 New ICP Prospects')) break;
    }
    
    if (imported > 0) {
      alert(`Imported ${imported} new prospects!`);
      renderScreen();
    } else {
      alert('No new prospects found or all were duplicates.');
    }
  } catch (e) {
    alert('Error reading daily-staging.md: ' + e.message);
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
      save(); renderTopTabs(); renderScreen(); updateProgress();
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
    // Phase 4.1: Only poll if tab is visible
    if (document.visibilityState !== 'visible') return;

    const perm = await workspaceDirHandle.queryPermission({ mode: 'read' });
    if (perm === 'granted') {
      await autoImportFromWorkspace(workspaceDirHandle);
      await autoImportPlaybookResources(workspaceDirHandle);
      
      const now = new Date();
      lastAutoSync = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      if (document.getElementById('cloudSyncGroup')) renderSync(); 
    }
  }, 30000); // 30 seconds
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

  save(); renderTopTabs(); renderScreen(); updateProgress();

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

  save(); renderTopTabs(); renderScreen(); updateProgress();

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
  renderTopTabs(); renderScreen(); updateProgress();

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

// ===================== ESCAPE KEY — CLOSE ANY OPEN MODAL =====================
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  const modalMap = [
    { id: 'quickCaptureModal', fn: () => typeof closeQuickCaptureModal === 'function' && closeQuickCaptureModal() },
    { id: 'modal', fn: () => typeof closeModal === 'function' && closeModal() },
    { id: 'reviewModal', fn: () => typeof closeReviewModal === 'function' && closeReviewModal() },
    { id: 'decisionModal', fn: () => typeof closeDecisionModal === 'function' && closeDecisionModal() },
    { id: 'delegationModal', fn: () => typeof closeDelegationModal === 'function' && closeDelegationModal() },
    { id: 'okrModal', fn: () => typeof closeOkrModal === 'function' && closeOkrModal() },
    { id: 'addRecurringModal', fn: () => typeof closeAddRecurringModal === 'function' && closeAddRecurringModal() },
    { id: 'resourceModal', fn: () => typeof closeResourceModal === 'function' && closeResourceModal() },
    { id: 'prospectModal', fn: () => typeof closeProspectModal === 'function' && closeProspectModal() },
    { id: 'pilotModal', fn: () => typeof closePilotModal === 'function' && closePilotModal() },
    { id: 'insightModal', fn: () => typeof closeInsightModal === 'function' && closeInsightModal() },
    { id: 'notifModal', fn: () => typeof closeNotifModal === 'function' && closeNotifModal() },
    { id: 'detailOverlay', fn: () => typeof closeTaskDetail === 'function' && closeTaskDetail() },
    { id: 'prospectDetailOverlay', fn: () => typeof closeProspectDetail === 'function' && closeProspectDetail() },
    { id: 'weeklyReviewModal', fn: () => typeof closeWeeklyReviewModal === 'function' && closeWeeklyReviewModal() },
  ];
  for (const m of modalMap) {
    const el = document.getElementById(m.id);
    if (el && (el.classList.contains('open') || el.style.display === 'flex')) {
      m.fn();
      break;
    }
  }
});

// ===================== WEEKLY REVIEW =====================
const WEEKLY_REVIEWS_KEY = 'malveon_weekly_reviews';
let weeklyReviewStep = 1;

function getMondayStr(offset = 0) {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function openWeeklyReviewModal() {
  weeklyReviewStep = 1;
  // Show step 1, hide others
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById('wr-step-' + i);
    if (el) el.style.display = i === 1 ? 'block' : 'none';
  }
  renderWeeklyReviewDots();
  // Set date label
  const monday = getMondayStr(0);
  const sunday = getMondayStr(0);
  const d = new Date(monday + 'T12:00:00');
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (date) => date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  const lbl = document.getElementById('weeklyReviewDateLabel');
  if (lbl) lbl.textContent = `Week of ${fmt(d)} - ${fmt(end)}`;
  // Update button
  const btn = document.getElementById('weeklyReviewNextBtn');
  if (btn) btn.textContent = 'Next';
  document.getElementById('weeklyReviewModal').classList.add('open');
}

function closeWeeklyReviewModal() {
  document.getElementById('weeklyReviewModal').classList.remove('open');
}

function renderWeeklyReviewDots() {
  const container = document.getElementById('weeklyReviewStepDots');
  if (!container) return;
  container.innerHTML = Array.from({ length: 6 }, (_, i) => {
    const step = i + 1;
    const bg = step < weeklyReviewStep ? 'var(--green-400)' : step === weeklyReviewStep ? 'var(--accent)' : 'var(--border)';
    return `<div style="width:${step === weeklyReviewStep ? '20px' : '8px'};height:8px;border-radius:4px;background:${bg};transition:all 0.2s;"></div>`;
  }).join('');
}

function weeklyReviewNext() {
  if (weeklyReviewStep < 6) {
    const current = document.getElementById('wr-step-' + weeklyReviewStep);
    const next = document.getElementById('wr-step-' + (weeklyReviewStep + 1));
    if (current) current.style.display = 'none';
    if (next) next.style.display = 'block';
    weeklyReviewStep++;
    renderWeeklyReviewDots();
    const btn = document.getElementById('weeklyReviewNextBtn');
    if (btn) btn.textContent = weeklyReviewStep === 6 ? 'Save Review' : 'Next';
  } else {
    saveWeeklyReview();
  }
}

function saveWeeklyReview() {
  const monday = getMondayStr(0);
  const review = {
    id: 'wr-' + monday,
    weekStart: monday,
    savedAt: new Date().toISOString(),
    wins: document.getElementById('wr-wins')?.value.trim() || '',
    failures: document.getElementById('wr-failures')?.value.trim() || '',
    outreachSent: parseInt(document.getElementById('wr-outreach-sent')?.value) || 0,
    outreachReplies: parseInt(document.getElementById('wr-outreach-replies')?.value) || 0,
    callsBooked: parseInt(document.getElementById('wr-calls-booked')?.value) || 0,
    pilots: parseInt(document.getElementById('wr-pilots')?.value) || 0,
    energy: parseInt(document.getElementById('wr-energy')?.value) || 3,
    focus: parseInt(document.getElementById('wr-focus')?.value) || 3,
    exec: parseInt(document.getElementById('wr-exec')?.value) || 3,
    health: document.getElementById('wr-health')?.value.trim() || '',
    next1: document.getElementById('wr-next1')?.value.trim() || '',
    next2: document.getElementById('wr-next2')?.value.trim() || '',
    next3: document.getElementById('wr-next3')?.value.trim() || '',
    stop: document.getElementById('wr-stop')?.value.trim() || '',
    score: parseInt(document.getElementById('wr-score')?.value) || 7,
    selfFeedback: document.getElementById('wr-self-feedback')?.value.trim() || '',
  };

  const all = JSON.parse(localStorage.getItem(WEEKLY_REVIEWS_KEY) || '[]');
  const idx = all.findIndex(r => r.weekStart === monday);
  if (idx >= 0) all[idx] = review; else all.push(review);
  localStorage.setItem(WEEKLY_REVIEWS_KEY, JSON.stringify(all));

  // Also set the OKR for next week from the top 3
  if (review.next1) {
    const nextMonday = getMondayStr(1);
    const existing = JSON.parse(localStorage.getItem(OKR_KEY) || 'null');
    if (!existing || existing.weekStart !== nextMonday) {
      const nextOkr = { weekStart: nextMonday, one: review.next1, bonus1: review.next2, bonus2: review.next3 };
      localStorage.setItem(OKR_KEY, JSON.stringify(nextOkr));
    }
  }

  closeWeeklyReviewModal();
  showToast('Weekly review saved!', 'success');
  renderReviewV2();
}

function renderWeeklyReviews() {
  const all = JSON.parse(localStorage.getItem(WEEKLY_REVIEWS_KEY) || '[]');
  return all.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

// ===================== PHASE 5.2 & 5.3 RELIABILITY =====================
function saveEmailFallback() {
    const val = document.getElementById('emailFallbackInput').value.trim();
    localStorage.setItem('EMAIL_FALLBACK', val);
    const status = document.getElementById('tokenRefreshStatus');
    if (status) { status.textContent = 'Email saved!'; status.style.display = 'block'; setTimeout(()=>status.style.display='none', 2000); }
}

async function refreshAndCopyToken() {
  if (!sb) return;
  const { data, error } = await sb.auth.refreshSession();
  if (error) { alert('Refresh failed: ' + error.message); return; }
  
  if (data?.session) {
    navigator.clipboard.writeText(data.session.access_token);
    const status = document.getElementById('tokenRefreshStatus');
    if (status) { status.style.display = 'block'; setTimeout(()=>status.style.display='none', 3000); }
    renderSync();
  }
}

async function checkTaskHeartbeat() {
  if (!workspaceDirHandle) return;
  try {
    const fileHandle = await workspaceDirHandle.getFileHandle('outreach/trackers/task-heartbeat.json');
    const file = await fileHandle.getFile();
    const content = await file.text();
    const data = JSON.parse(content);
    
    // If last_run was more than 24h ago
    const lastRun = new Date(data.last_run);
    const diffHours = (new Date() - lastRun) / (1000 * 60 * 60);
    
    if (diffHours > 24) {
      showToast('⚠️ Scheduled tasks (Claude) may be stalled. Last run: ' + data.last_run, 'error');
    }
  } catch (e) {
    // Silently skip if file doesn't exist yet
  }
}

// Background token refresh every 50 mins
setInterval(async () => {
    if (sb && currentUser) {
        await sb.auth.refreshSession();
        console.log('Session token refreshed automatically');
    }
}, 50 * 60 * 1000);

// ===================== START =====================
startApp();

