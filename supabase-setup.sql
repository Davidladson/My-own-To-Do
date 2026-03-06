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
