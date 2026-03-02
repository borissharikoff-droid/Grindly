-- ============================================================
-- Analytics & Announcements
-- Run this in the Supabase SQL editor (once).
-- ============================================================

-- ── analytics_events ────────────────────────────────────────
-- Users insert their own events; nobody (except service role) reads them.
CREATE TABLE IF NOT EXISTS analytics_events (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name  text        NOT NULL,
  properties  jsonb       DEFAULT '{}',
  app_version text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ae_user    ON analytics_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ae_name    ON analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ae_created ON analytics_events (created_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert their own events
CREATE POLICY "users_insert_own_events" ON analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Nobody (other than service_role bypassing RLS) may read events
-- (no SELECT policy intentionally)

-- ── announcements ────────────────────────────────────────────
-- Admin writes via service_role key (dashboard backend).
-- App reads non-expired announcements via anon/authenticated key.
CREATE TABLE IF NOT EXISTS announcements (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title      text        NOT NULL,
  body       text        NOT NULL,
  icon       text        DEFAULT '📢',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz          -- NULL = never expires
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read non-expired announcements
CREATE POLICY "auth_read_active_announcements" ON announcements
  FOR SELECT
  TO authenticated
  USING (expires_at IS NULL OR expires_at > now());

-- Enable realtime so the app receives INSERT events instantly
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
