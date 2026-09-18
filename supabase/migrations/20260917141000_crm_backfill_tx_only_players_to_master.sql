-- Backfill: Player IDs present only in transactions enter campaign_players
-- without touching accumulated_rake / periods_count of existing rows.
INSERT INTO public.campaign_players (
  board_id, player_id, name, nickname,
  first_seen_start, last_seen_start, periods_count, accumulated_rake,
  created_at, updated_at
)
SELECT
  t.board_id,
  t.receiver_player_id,
  coalesce(nullif(trim(max(t.receiver_nickname)), ''), ''),
  coalesce(nullif(trim(max(t.receiver_nickname)), ''), ''),
  min(t.period_start),
  max(t.period_start),
  0,
  0,
  now(),
  now()
FROM public.campaign_transactions t
WHERE t.receiver_player_id IS NOT NULL
  AND t.receiver_player_id <> ''
GROUP BY t.board_id, t.receiver_player_id
ON CONFLICT (board_id, player_id) DO UPDATE SET
  nickname = CASE
    WHEN coalesce(nullif(trim(EXCLUDED.nickname), ''), '') <> ''
      THEN EXCLUDED.nickname
    ELSE public.campaign_players.nickname
  END,
  name = CASE
    WHEN coalesce(nullif(trim(public.campaign_players.name), ''), '') = ''
      AND coalesce(nullif(trim(EXCLUDED.name), ''), '') <> ''
      THEN EXCLUDED.name
    ELSE public.campaign_players.name
  END,
  last_seen_start = GREATEST(
    public.campaign_players.last_seen_start,
    EXCLUDED.last_seen_start
  ),
  first_seen_start = LEAST(
    public.campaign_players.first_seen_start,
    EXCLUDED.first_seen_start
  ),
  updated_at = now();
