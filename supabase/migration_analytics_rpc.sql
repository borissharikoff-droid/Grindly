-- ============================================================
-- Admin dashboard RPC helper functions
-- Run in Supabase SQL editor AFTER migration_analytics.sql
-- These run as SECURITY DEFINER with service_role — safe because
-- the dashboard server never exposes them to the browser directly.
-- ============================================================

-- Daily active users (last 30 days)
CREATE OR REPLACE FUNCTION admin_dau_30d()
RETURNS TABLE (day date, users bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    date_trunc('day', created_at)::date AS day,
    COUNT(DISTINCT user_id)             AS users
  FROM analytics_events
  WHERE created_at >= now() - interval '30 days'
  GROUP BY 1
  ORDER BY 1;
$$;

-- Top events by count (last 30 days)
CREATE OR REPLACE FUNCTION admin_top_events(lim int DEFAULT 20)
RETURNS TABLE (event_name text, cnt bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    event_name,
    COUNT(*) AS cnt
  FROM analytics_events
  WHERE created_at >= now() - interval '30 days'
  GROUP BY event_name
  ORDER BY cnt DESC
  LIMIT lim;
$$;

-- Tab click distribution (last 30 days)
CREATE OR REPLACE FUNCTION admin_tab_clicks()
RETURNS TABLE (tab text, cnt bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    properties->>'tab' AS tab,
    COUNT(*)            AS cnt
  FROM analytics_events
  WHERE event_name = 'tab_click'
    AND created_at >= now() - interval '30 days'
  GROUP BY 1
  ORDER BY cnt DESC;
$$;

-- Sessions per day (last 30 days)
CREATE OR REPLACE FUNCTION admin_sessions_per_day()
RETURNS TABLE (day date, sessions bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    date_trunc('day', start_time)::date AS day,
    COUNT(*)                             AS sessions
  FROM session_summaries
  WHERE start_time >= now() - interval '30 days'
  GROUP BY 1
  ORDER BY 1;
$$;
