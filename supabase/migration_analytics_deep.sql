-- Deep Analytics RPCs for Grindly Admin Dashboard
-- All functions use SECURITY DEFINER and SET search_path = public

-- 1. Chest stats: count opens by chest_type
CREATE OR REPLACE FUNCTION admin_chest_stats()
RETURNS TABLE(chest_type text, open_count bigint, unique_users bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(properties->>'chest_type', 'unknown') AS chest_type,
    COUNT(*)                                        AS open_count,
    COUNT(DISTINCT user_id)                         AS unique_users
  FROM analytics_events
  WHERE event_name IN ('chest_open', 'bulk_chest_open')
  GROUP BY properties->>'chest_type'
  ORDER BY open_count DESC;
$$;

-- 2. Farming stats: top planted seeds by count
CREATE OR REPLACE FUNCTION admin_farming_stats()
RETURNS TABLE(seed_id text, plant_count bigint, unique_farmers bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(properties->>'seed_id', 'unknown') AS seed_id,
    COUNT(*)                                     AS plant_count,
    COUNT(DISTINCT user_id)                      AS unique_farmers
  FROM analytics_events
  WHERE event_name IN ('farm_plant', 'farm_plant_all')
  GROUP BY properties->>'seed_id'
  ORDER BY plant_count DESC
  LIMIT 20;
$$;

-- 3. Combat stats: boss kills by zone, dungeon completions and deaths
CREATE OR REPLACE FUNCTION admin_combat_stats()
RETURNS TABLE(zone_id text, boss_kills bigint, dungeon_completes bigint, dungeon_deaths bigint, unique_fighters bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH zones AS (
    SELECT DISTINCT COALESCE(properties->>'zone_id', 'unknown') AS zone_id
    FROM analytics_events
    WHERE event_name IN ('boss_kill', 'dungeon_complete', 'dungeon_death')
  ),
  kills AS (
    SELECT COALESCE(properties->>'zone_id', 'unknown') AS zone_id, COUNT(*) AS cnt, COUNT(DISTINCT user_id) AS ucount
    FROM analytics_events
    WHERE event_name = 'boss_kill'
    GROUP BY properties->>'zone_id'
  ),
  completes AS (
    SELECT COALESCE(properties->>'zone_id', 'unknown') AS zone_id, COUNT(*) AS cnt
    FROM analytics_events
    WHERE event_name = 'dungeon_complete'
    GROUP BY properties->>'zone_id'
  ),
  deaths AS (
    SELECT COALESCE(properties->>'zone_id', 'unknown') AS zone_id, COUNT(*) AS cnt, COUNT(DISTINCT user_id) AS ucount
    FROM analytics_events
    WHERE event_name = 'dungeon_death'
    GROUP BY properties->>'zone_id'
  )
  SELECT
    z.zone_id,
    COALESCE(k.cnt, 0)        AS boss_kills,
    COALESCE(c.cnt, 0)        AS dungeon_completes,
    COALESCE(d.cnt, 0)        AS dungeon_deaths,
    COALESCE(k.ucount, 0) + COALESCE(d.ucount, 0) AS unique_fighters
  FROM zones z
  LEFT JOIN kills    k ON k.zone_id = z.zone_id
  LEFT JOIN completes c ON c.zone_id = z.zone_id
  LEFT JOIN deaths   d ON d.zone_id = z.zone_id
  ORDER BY boss_kills DESC;
$$;

-- 4. Tab time: avg seconds spent per tab
CREATE OR REPLACE FUNCTION admin_tab_time_stats()
RETURNS TABLE(tab_id text, avg_seconds numeric, total_visits bigint, unique_users bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(properties->>'tab_id', 'unknown')                    AS tab_id,
    ROUND(AVG((properties->>'seconds')::numeric), 1)              AS avg_seconds,
    COUNT(*)                                                       AS total_visits,
    COUNT(DISTINCT user_id)                                        AS unique_users
  FROM analytics_events
  WHERE event_name = 'tab_time_spent'
    AND (properties->>'seconds')::numeric > 0
  GROUP BY properties->>'tab_id'
  ORDER BY avg_seconds DESC;
$$;

-- 5. Guild stats: total guilds created, unique joiners, etc.
CREATE OR REPLACE FUNCTION admin_guild_stats()
RETURNS TABLE(metric text, value bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'guilds_created'       AS metric, COUNT(*)               AS value FROM analytics_events WHERE event_name = 'guild_create'
  UNION ALL
  SELECT 'guild_joins'          AS metric, COUNT(*)               AS value FROM analytics_events WHERE event_name = 'guild_join'
  UNION ALL
  SELECT 'guild_leaves'         AS metric, COUNT(*)               AS value FROM analytics_events WHERE event_name = 'guild_leave'
  UNION ALL
  SELECT 'unique_guild_members' AS metric, COUNT(DISTINCT user_id) AS value FROM analytics_events WHERE event_name = 'guild_join';
$$;

-- 6. Raid stats: completion vs fail rates by tier
CREATE OR REPLACE FUNCTION admin_raid_stats()
RETURNS TABLE(tier text, completions bigint, failures bigint, completion_rate numeric, unique_raiders bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tiers AS (
    SELECT DISTINCT COALESCE(properties->>'tier', 'unknown') AS tier
    FROM analytics_events
    WHERE event_name IN ('raid_complete', 'raid_fail')
  ),
  comps AS (
    SELECT COALESCE(properties->>'tier', 'unknown') AS tier, COUNT(*) AS cnt, COUNT(DISTINCT user_id) AS ucount
    FROM analytics_events
    WHERE event_name = 'raid_complete'
    GROUP BY properties->>'tier'
  ),
  fails AS (
    SELECT COALESCE(properties->>'tier', 'unknown') AS tier, COUNT(*) AS cnt
    FROM analytics_events
    WHERE event_name = 'raid_fail'
    GROUP BY properties->>'tier'
  )
  SELECT
    t.tier,
    COALESCE(c.cnt, 0)    AS completions,
    COALESCE(f.cnt, 0)    AS failures,
    CASE
      WHEN COALESCE(c.cnt, 0) + COALESCE(f.cnt, 0) = 0 THEN 0
      ELSE ROUND(COALESCE(c.cnt, 0)::numeric / (COALESCE(c.cnt, 0) + COALESCE(f.cnt, 0)) * 100, 1)
    END                   AS completion_rate,
    COALESCE(c.ucount, 0) AS unique_raiders
  FROM tiers t
  LEFT JOIN comps c ON c.tier = t.tier
  LEFT JOIN fails f ON f.tier = t.tier
  ORDER BY completions DESC;
$$;

-- 7. Item equip stats: most equipped items
CREATE OR REPLACE FUNCTION admin_equip_stats()
RETURNS TABLE(item_id text, slot text, equip_count bigint, unique_users bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(properties->>'item_id', 'unknown') AS item_id,
    COALESCE(properties->>'slot', 'unknown')    AS slot,
    COUNT(*)                                     AS equip_count,
    COUNT(DISTINCT user_id)                      AS unique_users
  FROM analytics_events
  WHERE event_name = 'item_equip'
  GROUP BY properties->>'item_id', properties->>'slot'
  ORDER BY equip_count DESC
  LIMIT 30;
$$;

-- 8. Level up stats: level-ups per skill
CREATE OR REPLACE FUNCTION admin_levelup_stats()
RETURNS TABLE(skill_id text, total_levelups bigint, unique_users bigint, avg_new_level numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(properties->>'skill_id', 'unknown')              AS skill_id,
    COUNT(*)                                                   AS total_levelups,
    COUNT(DISTINCT user_id)                                    AS unique_users,
    ROUND(AVG((properties->>'new_level')::numeric), 1)         AS avg_new_level
  FROM analytics_events
  WHERE event_name = 'level_up'
    AND (properties->>'new_level') IS NOT NULL
  GROUP BY properties->>'skill_id'
  ORDER BY total_levelups DESC;
$$;

-- 9. Crafting stats: top crafted items (last 30 days)
CREATE OR REPLACE FUNCTION admin_crafting_stats()
RETURNS TABLE(item_id text, craft_count bigint, unique_crafters bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(properties->>'item_id', 'unknown') AS item_id,
    COUNT(*)                                     AS craft_count,
    COUNT(DISTINCT user_id)                      AS unique_crafters
  FROM analytics_events
  WHERE event_name = 'craft_complete'
    AND created_at >= NOW() - INTERVAL '30 days'
  GROUP BY properties->>'item_id'
  ORDER BY craft_count DESC
  LIMIT 20;
$$;

-- 10. Retention cohorts: D1/D7/D30
CREATE OR REPLACE FUNCTION admin_retention_cohorts()
RETURNS TABLE(
  cohort_week     date,
  cohort_size     bigint,
  d1_retained     bigint,
  d7_retained     bigint,
  d30_retained    bigint,
  d1_rate         numeric,
  d7_rate         numeric,
  d30_rate        numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cohorts AS (
    SELECT
      id                                                          AS user_id,
      DATE_TRUNC('week', created_at)::date                       AS cohort_week,
      created_at                                                  AS registered_at
    FROM profiles
    WHERE created_at IS NOT NULL
  ),
  first_sessions AS (
    SELECT
      user_id,
      MIN(start_time) AS first_session_at
    FROM session_summaries
    GROUP BY user_id
  ),
  cohort_sessions AS (
    SELECT
      c.cohort_week,
      c.user_id,
      fs.first_session_at,
      ss.start_time
    FROM cohorts c
    JOIN first_sessions fs ON fs.user_id = c.user_id
    JOIN session_summaries ss ON ss.user_id = c.user_id
  ),
  aggregated AS (
    SELECT
      cohort_week,
      COUNT(DISTINCT user_id)                                                                          AS cohort_size,
      COUNT(DISTINCT CASE WHEN start_time >= first_session_at + INTERVAL '1 day'
                           AND start_time <  first_session_at + INTERVAL '2 days'
                      THEN user_id END)                                                                AS d1_retained,
      COUNT(DISTINCT CASE WHEN start_time >= first_session_at + INTERVAL '7 days'
                           AND start_time <  first_session_at + INTERVAL '8 days'
                      THEN user_id END)                                                                AS d7_retained,
      COUNT(DISTINCT CASE WHEN start_time >= first_session_at + INTERVAL '30 days'
                           AND start_time <  first_session_at + INTERVAL '31 days'
                      THEN user_id END)                                                                AS d30_retained
    FROM cohort_sessions
    GROUP BY cohort_week
  )
  SELECT
    cohort_week,
    cohort_size,
    d1_retained,
    d7_retained,
    d30_retained,
    CASE WHEN cohort_size = 0 THEN 0 ELSE ROUND(d1_retained::numeric  / cohort_size * 100, 1) END AS d1_rate,
    CASE WHEN cohort_size = 0 THEN 0 ELSE ROUND(d7_retained::numeric  / cohort_size * 100, 1) END AS d7_rate,
    CASE WHEN cohort_size = 0 THEN 0 ELSE ROUND(d30_retained::numeric / cohort_size * 100, 1) END AS d30_rate
  FROM aggregated
  ORDER BY cohort_week DESC
  LIMIT 16;
$$;
