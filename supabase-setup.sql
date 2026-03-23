-- Malveon Tasks V2 - Supabase Database Setup
-- Run this ENTIRE script in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ========== TABLE 1: TASKS ==========
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'today',
  priority TEXT NOT NULL DEFAULT 'medium',
  done BOOLEAN NOT NULL DEFAULT false,
  notes TEXT DEFAULT '',
  daily BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  subtasks JSONB DEFAULT '[]',
  streak INTEGER DEFAULT 0,
  last_streak_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own tasks
CREATE POLICY "Users manage own tasks" ON tasks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;


-- ========== TABLE 2: DAILY LOGS ==========
CREATE TABLE IF NOT EXISTS daily_logs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  score INTEGER DEFAULT 0,
  done_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  energy INTEGER,
  focus INTEGER,
  execution INTEGER,
  went_well TEXT,
  blocked TEXT,
  different TEXT,
  tasks_snapshot JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own logs" ON daily_logs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE daily_logs;


-- ========== TABLE 3: RESOURCES (for Playbook tab - Phase 2) ==========
CREATE TABLE IF NOT EXISTS resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'reference',
  content TEXT DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own resources" ON resources
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE resources;


-- ========== PHASE 2: ADD SUBTASKS + STREAK COLUMNS ==========
-- Run these if you already have the tasks table from Phase 1:
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]';
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0;
-- ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_streak_date DATE;

-- ========== PHASE 3: ADD REMINDER_TIME COLUMN ==========
-- Run this if you already have the tasks table from Phase 1 or 2:
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_time TEXT;

-- ========== AUTO-UPDATE TRIGGER ==========
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER daily_logs_updated_at BEFORE UPDATE ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER resources_updated_at BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ========== V2: TABLE 4: PROSPECTS (Pipeline / CRM) ==========
CREATE TABLE IF NOT EXISTS prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT,
  linkedin_url TEXT,
  email TEXT,
  status TEXT DEFAULT 'new',
  -- values: new | contacted | replied | discovery | demo | pilot | won | lost
  last_contact_date DATE,
  next_followup_date DATE,
  source TEXT DEFAULT 'linkedin',
  -- values: linkedin | x | warm-intro | other
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own prospects" ON prospects
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE prospects;

CREATE TRIGGER prospects_updated_at BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ========== V2: TABLE 5: PILOTS (Pilot Customer Tracker) ==========
CREATE TABLE IF NOT EXISTS pilots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  start_date DATE,
  success_metric TEXT,
  health TEXT DEFAULT 'green',
  -- values: green | yellow | red
  onboarding_status TEXT DEFAULT 'not-started',
  -- values: not-started | payment-received | kickoff-done | integrations-live | active
  last_checkin_date DATE,
  next_checkin_date DATE,
  mrr_usd INTEGER DEFAULT 99,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pilots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pilots" ON pilots
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE pilots;

CREATE TRIGGER pilots_updated_at BEFORE UPDATE ON pilots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ========== V2: TABLE 6: INSIGHTS (Customer Quotes / Discovery) ==========
CREATE TABLE IF NOT EXISTS insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  contact_name TEXT,
  company TEXT,
  quote TEXT NOT NULL,
  theme TEXT DEFAULT 'other',
  -- values: incident-triage | context-loss | jira-gap | hiring | onboarding | other
  source TEXT DEFAULT 'discovery-call',
  -- values: discovery-call | dm-reply | x-post | linkedin-comment | email | other
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own insights" ON insights
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE insights;

CREATE TRIGGER insights_updated_at BEFORE UPDATE ON insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ========== V2: TABLE 7: DECISIONS (Decision Log) ==========
CREATE TABLE IF NOT EXISTS decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  decision TEXT NOT NULL,
  reason TEXT,
  decided_by TEXT DEFAULT 'Ladson',
  -- values: Ladson | Ladson + Kavin | Kavin
  domain TEXT DEFAULT 'ops',
  -- values: legal | finance | product | sales | ops | hr | fundraising
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own decisions" ON decisions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE decisions;

CREATE TRIGGER decisions_updated_at BEFORE UPDATE ON decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ========== V2: TABLE 8: DELEGATIONS (Delegation Tracker) ==========
CREATE TABLE IF NOT EXISTS delegations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  task TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT DEFAULT 'not-started',
  -- values: not-started | in-progress | done | cancelled
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own delegations" ON delegations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE delegations;

CREATE TRIGGER delegations_updated_at BEFORE UPDATE ON delegations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ========== V2: TABLE 9: RECURRING TASKS ==========
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  frequency TEXT NOT NULL,
  -- values: daily | weekly | biweekly | monthly | quarterly | annual | event-based
  days_of_week TEXT[],
  day_of_month INTEGER,
  month_of_year INTEGER,
  event_trigger TEXT,
  target_cat TEXT DEFAULT 'today',
  priority TEXT DEFAULT 'medium',
  active BOOLEAN DEFAULT true,
  last_generated_date DATE,
  next_run_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own recurring tasks" ON recurring_tasks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE recurring_tasks;

CREATE TRIGGER recurring_tasks_updated_at BEFORE UPDATE ON recurring_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
