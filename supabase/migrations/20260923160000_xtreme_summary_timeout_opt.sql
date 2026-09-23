-- crm_xtreme_case_summary: evita crm_is_incentive_transaction por linha
-- (59k TX estourava statement_timeout=8s do role authenticated).

CREATE OR REPLACE FUNCTION public.crm_xtreme_case_summary(p_board_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_mkt text;
  v_result jsonb;
BEGIN
  SELECT coalesce(
    (SELECT mkt_gt_player_id FROM public.crm_economic_settings WHERE board_id = p_board_id),
    '1092502'
  ) INTO v_mkt;

  WITH periods AS (
    SELECT agent_id, player_id, weekly_rake
    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
      AND club_code = 'xtreme_pro'
  ),
  dep AS (
    SELECT
      coalesce(agent_id, '') AS agent_id,
      coalesce(sum(abs(amount)), 0)::numeric AS deposits
    FROM public.campaign_transactions
    WHERE board_id = p_board_id
      AND club_code = 'xtreme_pro'
      AND is_deposit
    GROUP BY coalesce(agent_id, '')
  ),
  incentives AS (
    SELECT coalesce(sum(abs(t.amount)), 0)::numeric AS incentive_sent
    FROM public.campaign_transactions t
    WHERE t.board_id = p_board_id
      AND t.club_code = 'xtreme_pro'
      AND (
        coalesce(t.is_bonus, false)
        OR t.sender_player_id = v_mkt
      )
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
      AND t.receiver_player_id <> v_mkt
  ),
  agencies AS (
    SELECT
      p.agent_id,
      coalesce(a.name, p.agent_id) AS agent_name,
      coalesce(sum(p.weekly_rake), 0)::numeric AS weekly_rake,
      count(DISTINCT p.player_id)::int AS players,
      count(DISTINCT p.player_id) FILTER (WHERE p.weekly_rake > 0)::int AS active_players,
      coalesce(d.deposits, 0)::numeric AS deposits
    FROM periods p
    LEFT JOIN public.campaign_agents a
      ON a.board_id = p_board_id AND a.agent_id = p.agent_id
    LEFT JOIN dep d ON d.agent_id = p.agent_id
    GROUP BY p.agent_id, a.name, d.deposits
  ),
  totals AS (
    SELECT
      coalesce((SELECT sum(weekly_rake) FROM periods), 0)::numeric AS rake_bruto,
      (SELECT count(DISTINCT player_id)::int FROM periods) AS players,
      (
        SELECT count(DISTINCT player_id)::int
        FROM (
          SELECT player_id FROM periods GROUP BY player_id HAVING sum(weekly_rake) > 0
        ) active
      ) AS active_players,
      coalesce((SELECT sum(deposits) FROM dep), 0)::numeric AS deposits,
      coalesce((SELECT incentive_sent FROM incentives), 0)::numeric AS incentive_sent,
      (
        EXISTS (SELECT 1 FROM periods)
        OR EXISTS (
          SELECT 1 FROM public.campaign_transactions
          WHERE board_id = p_board_id AND club_code = 'xtreme_pro'
          LIMIT 1
        )
      ) AS has_activity
  )
  SELECT jsonb_build_object(
    'hasActivity', t.has_activity,
    'rakeBruto', t.rake_bruto,
    'players', coalesce(t.players, 0),
    'activePlayers', coalesce(t.active_players, 0),
    'deposits', t.deposits,
    'incentiveSent', t.incentive_sent,
    'activation', t.incentive_sent,
    'agencies', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'agentId', ag.agent_id,
          'agentName', ag.agent_name,
          'weeklyRake', ag.weekly_rake,
          'players', ag.players,
          'activePlayers', ag.active_players,
          'deposits', ag.deposits
        )
        ORDER BY ag.agent_name
      )
      FROM agencies ag
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM totals t;

  RETURN coalesce(v_result, jsonb_build_object(
    'hasActivity', false,
    'rakeBruto', 0,
    'players', 0,
    'activePlayers', 0,
    'deposits', 0,
    'incentiveSent', 0,
    'activation', 0,
    'agencies', '[]'::jsonb
  ));
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_xtreme_case_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_xtreme_case_summary(text) TO authenticated;
