-- ============================================================
-- Admin dashboard RPC helpers v2
-- Run AFTER migration_analytics.sql and migration_analytics_rpc.sql
-- ============================================================

-- Online users right now
CREATE OR REPLACE FUNCTION admin_online_now()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM profiles WHERE is_online = true;
$$;

-- New registered users per day (last 30 days) — reads auth.users
CREATE OR REPLACE FUNCTION admin_user_growth_30d()
RETURNS TABLE (day date, new_users bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    date_trunc('day', created_at)::date AS day,
    COUNT(*)                             AS new_users
  FROM auth.users
  WHERE created_at >= now() - interval '30 days'
  GROUP BY 1
  ORDER BY 1;
$$;

-- Events count by hour of day (UTC, last 30 days)
CREATE OR REPLACE FUNCTION admin_hourly_activity()
RETURNS TABLE (hour int, cnt bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    EXTRACT(hour FROM created_at AT TIME ZONE 'UTC')::int AS hour,
    COUNT(*)                                               AS cnt
  FROM analytics_events
  WHERE created_at >= now() - interval '30 days'
  GROUP BY 1
  ORDER BY 1;
$$;

-- Skill XP + user count per skill
CREATE OR REPLACE FUNCTION admin_skill_breakdown()
RETURNS TABLE (skill_id text, total_xp bigint, user_count bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    skill_id,
    SUM(total_xp)::bigint          AS total_xp,
    COUNT(DISTINCT user_id)::bigint AS user_count
  FROM user_skills
  GROUP BY skill_id
  ORDER BY total_xp DESC;
$$;

-- Session duration stats (all time)
CREATE OR REPLACE FUNCTION admin_session_stats()
RETURNS TABLE (avg_seconds numeric, total_sessions bigint, total_hours numeric)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    ROUND(AVG(duration_seconds))              AS avg_seconds,
    COUNT(*)                                   AS total_sessions,
    ROUND(SUM(duration_seconds) / 3600.0, 1)  AS total_hours
  FROM session_summaries;
$$;

-- Distinct users per event (feature adoption, last 30 days)
CREATE OR REPLACE FUNCTION admin_feature_adoption()
RETURNS TABLE (feature text, users bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    event_name            AS feature,
    COUNT(DISTINCT user_id) AS users
  FROM analytics_events
  WHERE created_at >= now() - interval '30 days'
  GROUP BY 1
  ORDER BY users DESC
  LIMIT 15;
$$;

-- User level distribution
CREATE OR REPLACE FUNCTION admin_level_distribution()
RETURNS TABLE (bucket text, user_count bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    CASE
      WHEN level BETWEEN 1  AND 10 THEN '1–10'
      WHEN level BETWEEN 11 AND 20 THEN '11–20'
      WHEN level BETWEEN 21 AND 30 THEN '21–30'
      WHEN level BETWEEN 31 AND 50 THEN '31–50'
      WHEN level BETWEEN 51 AND 75 THEN '51–75'
      ELSE '76+'
    END AS bucket,
    COUNT(*) AS user_count
  FROM profiles
  GROUP BY 1
  ORDER BY MIN(level);
$$;

-- Streak distribution snapshot
CREATE OR REPLACE FUNCTION admin_streak_stats()
RETURNS TABLE (streak_1plus bigint, streak_7plus bigint, streak_30plus bigint, avg_streak numeric)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE streak_count >= 1)  AS streak_1plus,
    COUNT(*) FILTER (WHERE streak_count >= 7)  AS streak_7plus,
    COUNT(*) FILTER (WHERE streak_count >= 30) AS streak_30plus,
    ROUND(AVG(streak_count), 1)                AS avg_streak
  FROM profiles;
$$;
