CREATE OR REPLACE FUNCTION public.crm_player_segment_facts(p_board_id text, p_club text)
RETURNS TABLE (
  player_id text,
  name text,
  nickname text,
  agent_id text,
  has_campaign boolean,
  campaign_ids text[],
  accumulated_rake numeric,
  rake_7d numeric,
  rake_30d numeric,
  rake_60d numeric,
  rake_90d numeric,
  days_since_last_rake int,
  last_rake_at date,
  incentive_limit numeric,
  incentive_sent numeric,
  incentive_available numeric,
  incentive_count int,
  last_incentive_at timestamptz,
  ever_received_incentive boolean,
  bonus_without_deposit boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT CASE
      WHEN p_club IN ('sx_club', 'xtreme_pro') THEN p_club
      ELSE NULL
    END AS club
  ),
  settings AS (
    SELECT * FROM public.crm_get_economic_settings(p_board_id)
  ),
  ids AS (
    SELECT cp.player_id
    FROM public.campaign_players cp
    CROSS JOIN scope s
    WHERE cp.board_id = p_board_id
      AND s.club IS NULL
    UNION
    SELECT pp.player_id
    FROM public.campaign_player_periods pp
    CROSS JOIN scope s
    WHERE pp.board_id = p_board_id
      AND s.club IS NOT NULL
      AND pp.club_code = s.club
    UNION
    SELECT t.receiver_player_id
    FROM public.campaign_transactions t
    CROSS JOIN scope s
    WHERE t.board_id = p_board_id
      AND s.club IS NOT NULL
      AND t.club_code = s.club
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
  ),
  period_rake AS (
    SELECT pp.player_id, sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee))::numeric AS period_rake
    FROM public.campaign_player_periods pp
    CROSS JOIN scope s
    WHERE pp.board_id = p_board_id
      AND (s.club IS NULL OR pp.club_code = s.club)
    GROUP BY pp.player_id
  ),
  players AS (
    SELECT
      ids.player_id,
      cp.name,
      cp.nickname,
      CASE
        WHEN s.club IS NULL THEN coalesce(pr.period_rake, cp.accumulated_rake, 0)
        ELSE coalesce(pr.period_rake, 0)
      END::numeric AS accumulated_rake
    FROM ids
    CROSS JOIN scope s
    LEFT JOIN public.campaign_players cp
      ON cp.board_id = p_board_id AND cp.player_id = ids.player_id
    LEFT JOIN period_rake pr ON pr.player_id = ids.player_id
  ),
  camps AS (
    SELECT
      ccp.player_id,
      array_agg(DISTINCT ccp.campaign_id) FILTER (WHERE ccp.campaign_id IS NOT NULL) AS campaign_ids,
      bool_or(ccp.campaign_id IS NOT NULL) AS has_campaign
    FROM public.campaign_cohort_players ccp
    WHERE ccp.board_id = p_board_id
    GROUP BY ccp.player_id
  ),
  agents AS (
    SELECT DISTINCT ON (pp.player_id)
      pp.player_id,
      pp.agent_id
    FROM public.campaign_player_periods pp
    CROSS JOIN scope s
    WHERE pp.board_id = p_board_id
      AND (s.club IS NULL OR pp.club_code = s.club)
    ORDER BY pp.player_id, pp.period_end DESC NULLS LAST
  ),
  rake AS (
    SELECT
      pp.player_id,
      coalesce(sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee)) FILTER (WHERE pp.period_end >= (current_date - 7)), 0)::numeric AS rake_7d,
      coalesce(sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee)) FILTER (WHERE pp.period_end >= (current_date - 30)), 0)::numeric AS rake_30d,
      coalesce(sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee)) FILTER (WHERE pp.period_end >= (current_date - 60)), 0)::numeric AS rake_60d,
      coalesce(sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee)) FILTER (WHERE pp.period_end >= (current_date - 90)), 0)::numeric AS rake_90d,
      max(pp.period_end)::date AS last_rake_at
    FROM public.campaign_player_periods pp
    CROSS JOIN scope s
    WHERE pp.board_id = p_board_id
      AND (s.club IS NULL OR pp.club_code = s.club)
    GROUP BY pp.player_id
  ),
  tx_inc AS (
    SELECT
      t.receiver_player_id AS player_id,
      count(*)::int AS incentive_count,
      coalesce(sum(abs(t.amount)), 0)::numeric AS incentive_sent,
      max(t.occurred_at) AS last_incentive_at
    FROM public.campaign_transactions t
    CROSS JOIN settings s
    CROSS JOIN scope sc
    WHERE t.board_id = p_board_id
      AND (sc.club IS NULL OR t.club_code = sc.club)
      AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, s.mkt_gt_player_id)
    GROUP BY t.receiver_player_id
  ),
  tx_money AS (
    SELECT
      t.receiver_player_id AS player_id,
      bool_or(
        t.is_deposit IS NOT TRUE
        AND coalesce(t.order_status, '') ILIKE 'conclu%'
        AND (t.system_status IS NULL OR t.system_status ILIKE 'conclu%')
        AND coalesce(t.chips_claimback, 0) = 0
        AND (
          t.is_bonus IS TRUE
          OR (
            t.sender_player_id IN ('1092502', '1787210')
            AND coalesce(t.chips_send_out, 0) > 0
          )
        )
      ) AS received_bonus
    FROM public.campaign_transactions t
    CROSS JOIN scope sc
    WHERE t.board_id = p_board_id
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
      AND (
        sc.club IS NULL
        OR (sc.club = 'xtreme_pro' AND t.club_code = 'xtreme_pro')
        OR (sc.club = 'sx_club' AND (t.club_code = 'sx_club' OR t.club_code IS NULL))
      )
    GROUP BY t.receiver_player_id
  ),
  tx_deposit AS (
    SELECT t.receiver_player_id AS player_id
    FROM public.campaign_transactions t
    WHERE t.board_id = p_board_id
      AND t.is_deposit IS TRUE
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
    GROUP BY t.receiver_player_id
  ),
  history_bounds AS (
    SELECT
      (SELECT min(occurred_at)::date
         FROM public.campaign_transactions
        WHERE board_id = p_board_id AND club_code = 'xtreme_pro') AS xt_from,
      (SELECT min(occurred_at)::date
         FROM public.campaign_transactions
        WHERE board_id = p_board_id
          AND (club_code = 'sx_club' OR club_code IS NULL)) AS sx_from
  ),
  player_span AS (
    SELECT
      pp.player_id,
      min(pp.period_start) FILTER (WHERE pp.club_code = 'xtreme_pro') AS xt_first,
      min(pp.period_start) FILTER (WHERE pp.club_code = 'sx_club' OR pp.club_code IS NULL) AS sx_first
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
    GROUP BY pp.player_id
  )
  SELECT
    p.player_id,
    p.name,
    p.nickname,
    a.agent_id,
    coalesce(c.has_campaign, false),
    coalesce(c.campaign_ids, ARRAY[]::text[]),
    p.accumulated_rake,
    coalesce(r.rake_7d, 0),
    coalesce(r.rake_30d, 0),
    coalesce(r.rake_60d, 0),
    coalesce(r.rake_90d, 0),
    CASE WHEN r.last_rake_at IS NULL THEN NULL ELSE (current_date - r.last_rake_at) END,
    r.last_rake_at,
    (p.accumulated_rake * (1 - s.league_fee_rate) * s.incentive_limit_rate),
    coalesce(i.incentive_sent, 0),
    (p.accumulated_rake * (1 - s.league_fee_rate) * s.incentive_limit_rate) - coalesce(i.incentive_sent, 0),
    coalesce(i.incentive_count, 0),
    i.last_incentive_at,
    coalesce(i.incentive_count, 0) > 0,
    CASE
      WHEN coalesce(m.received_bonus, false) IS NOT TRUE THEN false
      WHEN d.player_id IS NOT NULL THEN false
      WHEN NOT (
        CASE
          WHEN sc.club = 'xtreme_pro' THEN
            hb.xt_from IS NOT NULL
            AND (ps.xt_first IS NULL OR ps.xt_first >= hb.xt_from - 7)
          WHEN sc.club = 'sx_club' THEN
            hb.sx_from IS NOT NULL
            AND (ps.sx_first IS NULL OR ps.sx_first >= hb.sx_from - 7)
          ELSE
            hb.xt_from IS NOT NULL
            AND hb.sx_from IS NOT NULL
            AND (ps.xt_first IS NULL OR ps.xt_first >= hb.xt_from - 7)
            AND (ps.sx_first IS NULL OR ps.sx_first >= hb.sx_from - 7)
        END
      ) THEN NULL
      ELSE true
    END
  FROM players p
  CROSS JOIN settings s
  CROSS JOIN scope sc
  CROSS JOIN history_bounds hb
  LEFT JOIN camps c ON c.player_id = p.player_id
  LEFT JOIN agents a ON a.player_id = p.player_id
  LEFT JOIN rake r ON r.player_id = p.player_id
  LEFT JOIN tx_inc i ON i.player_id = p.player_id
  LEFT JOIN tx_money m ON m.player_id = p.player_id
  LEFT JOIN tx_deposit d ON d.player_id = p.player_id
  LEFT JOIN player_span ps ON ps.player_id = p.player_id;
$$;



CREATE OR REPLACE FUNCTION public.reclassify_gtb2c_courtesy(p_board_id text)
RETURNS TABLE(rows_found integer, rows_eligible integer, rows_updated integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_found integer;
  v_eligible integer;
  v_updated integer;
BEGIN
  SELECT count(*)::integer INTO v_found
  FROM public.campaign_transactions
  WHERE board_id = p_board_id
    AND sender_player_id = '1787210';

  SELECT count(*)::integer INTO v_eligible
  FROM public.campaign_transactions
  WHERE board_id = p_board_id
    AND sender_player_id = '1787210'
    AND is_deposit IS NOT TRUE
    AND coalesce(order_status, '') ILIKE 'conclu%'
    AND (system_status IS NULL OR system_status ILIKE 'conclu%')
    AND coalesce(chips_claimback, 0) = 0
    AND (
      coalesce(sx_type, '') ILIKE '%b%nus%'
      OR coalesce(chips_send_out, 0) > 0
    );

  UPDATE public.campaign_transactions
  SET is_bonus = true
  WHERE board_id = p_board_id
    AND sender_player_id = '1787210'
    AND is_deposit IS NOT TRUE
    AND coalesce(order_status, '') ILIKE 'conclu%'
    AND (system_status IS NULL OR system_status ILIKE 'conclu%')
    AND coalesce(chips_claimback, 0) = 0
    AND (
      coalesce(sx_type, '') ILIKE '%b%nus%'
      OR coalesce(chips_send_out, 0) > 0
    )
    AND is_bonus IS NOT TRUE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  rows_found := v_found;
  rows_eligible := v_eligible;
  rows_updated := v_updated;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.reclassify_gtb2c_courtesy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reclassify_gtb2c_courtesy(text) TO authenticated;

SELECT * FROM public.reclassify_gtb2c_courtesy('board-1');
