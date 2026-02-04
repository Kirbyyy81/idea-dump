-- Daily Logs table for AI-Assisted Weekly Productivity Log
-- Run this migration in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('agent', 'human')),
    content JSONB NOT NULL,
    effective_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient user + date queries
CREATE INDEX IF NOT EXISTS daily_logs_user_date_idx 
    ON daily_logs (user_id, effective_date);

-- Index for pagination by created_at
CREATE INDEX IF NOT EXISTS daily_logs_user_created_idx 
    ON daily_logs (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own logs
CREATE POLICY "Users can view own logs" ON daily_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logs" ON daily_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own logs" ON daily_logs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own logs" ON daily_logs
    FOR DELETE USING (auth.uid() = user_id);
