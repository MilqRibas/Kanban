-- Ativação do overview KPI = MKT GT OR Bônus (paridade com CRM / campanhas).

CREATE OR REPLACE FUNCTION public.crm_campaigns_overview_kpis(p_board_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_result jsonb;
  v_mkt text;
BEGIN
  SELECT s.mkt_gt_player_id INTO v_mkt
  FROM public.crm_get_economic_settings(p_board_id) AS s;

  WITH camps AS (
    SELECT
      c.id,
      c.agent_id,
      upper(coalesce(c.acquisition_nature, 'PAID')) AS nature,
      coalesce(c.investment, 0)::numeric AS investment,
      coalesce(c.captured_players, 0)::int AS captured_players,
      coalesce(c.is_archived, false) AS is_archived
    FROM public.campaigns c
    WHERE c.board_id = p_board_id
  ),
  rake_by_agent AS (
    SELECT
      ap.agent_id,
      coalesce(sum(ap.weekly_rake), 0)::numeric AS rake_bruto
    FROM public.campaign_agent_periods ap
    WHERE ap.board_id = p_board_id
      AND (ap.club_code IS NULL OR ap.club_code <> 'xtreme_pro')
    GROUP BY ap.agent_id
  ),
  actives_by_agent AS (
    SELECT
      pp.agent_id,
      count(DISTINCT pp.player_id) FILTER (WHERE pp.weekly_rake > 0)::int AS active_players
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
      AND (pp.club_code IS NULL OR pp.club_code <> 'xtreme_pro')
    GROUP BY pp.agent_id
  ),
  bonus_by_agent AS (
    SELECT
      t.agent_id,
      coalesce(sum(abs(t.amount)), 0)::numeric AS activation_investment
    FROM public.campaign_transactions t
    WHERE t.board_id = p_board_id
      AND (
        t.is_bonus IS TRUE
        OR (v_mkt IS NOT NULL AND t.sender_player_id = v_mkt)
      )
      AND (t.club_code IS NULL OR t.club_code <> 'xtreme_pro')
      AND t.agent_id IS NOT NULL
      AND t.agent_id <> ''
    GROUP BY t.agent_id
  ),
  per_camp AS (
    SELECT
      c.id,
      c.agent_id,
      c.nature,
      c.investment,
      c.captured_players,
      c.is_archived,
      coalesce(r.rake_bruto, 0)::numeric AS rake_bruto,
      (coalesce(r.rake_bruto, 0) * 0.82)::numeric AS rake_liquido,
      coalesce(b.activation_investment, 0)::numeric AS activation_investment,
      coalesce(a.active_players, 0)::int AS active_players,
      CASE
        WHEN c.nature = 'ORGANIC' AND c.investment <= 0 THEN NULL
        ELSE (c.investment + coalesce(b.activation_investment, 0))::numeric
      END AS total_investment
    FROM camps c
    LEFT JOIN rake_by_agent r ON r.agent_id = c.agent_id
    LEFT JOIN actives_by_agent a ON a.agent_id = c.agent_id
    LEFT JOIN bonus_by_agent b ON b.agent_id = c.agent_id
  ),
  visible AS (
    SELECT * FROM per_camp WHERE is_archived = false
  ),
  paid AS (
    SELECT * FROM visible WHERE nature <> 'ORGANIC'
  ),
  organic AS (
    SELECT * FROM visible WHERE nature = 'ORGANIC'
  )
  SELECT jsonb_build_object(
    'totalInvestment', coalesce((SELECT sum(total_investment) FROM paid WHERE total_investment IS NOT NULL), 0),
    'totalAccumulatedRake', coalesce((SELECT sum(rake_bruto) FROM paid), 0),
    'organicAccumulatedRake', coalesce((SELECT sum(rake_bruto) FROM organic), 0),
    'totalCaptured', coalesce((SELECT sum(captured_players) FROM visible), 0),
    'totalActive', coalesce((SELECT sum(active_players) FROM visible), 0),
    'paidActive', coalesce((SELECT sum(active_players) FROM paid), 0),
    'activationRate', CASE
      WHEN coalesce((SELECT sum(captured_players) FROM visible), 0) > 0
        THEN round(
          (
            coalesce((SELECT sum(active_players) FROM visible), 0)::numeric
            / nullif((SELECT sum(captured_players) FROM visible), 0)::numeric
          ) * 100,
          2
        )
      ELSE NULL
    END,
    'recoveryRate', CASE
      WHEN coalesce((SELECT sum(total_investment) FROM paid WHERE total_investment IS NOT NULL), 0) > 0
        THEN round(
          (
            coalesce((SELECT sum(rake_liquido) FROM paid), 0)
            / nullif((SELECT sum(total_investment) FROM paid WHERE total_investment IS NOT NULL), 0)
          ) * 100,
          2
        )
      ELSE NULL
    END,
    'paybackCount', coalesce((
      SELECT count(*)::int
      FROM paid
      WHERE total_investment IS NOT NULL
        AND total_investment > 0
        AND rake_liquido >= total_investment
    ), 0),
    'recoveringCount', coalesce((
      SELECT count(*)::int
      FROM paid
      WHERE total_investment IS NOT NULL
        AND total_investment > 0
        AND rake_liquido > 0
        AND rake_liquido < total_investment
    ), 0),
    'noDataCount', coalesce((
      SELECT count(*)::int
      FROM visible
      WHERE rake_bruto <= 0 AND active_players <= 0
    ), 0),
    'averagePaybackDays', NULL,
    'costPerActive', CASE
      WHEN coalesce((SELECT sum(active_players) FROM paid), 0) > 0
        AND coalesce((SELECT sum(total_investment) FROM paid WHERE total_investment IS NOT NULL), 0) > 0
        THEN round(
          coalesce((SELECT sum(total_investment) FROM paid WHERE total_investment IS NOT NULL), 0)
          / nullif((SELECT sum(active_players) FROM paid), 0)::numeric,
          2
        )
      ELSE NULL
    END,
    'averageRakePerActive', CASE
      WHEN coalesce((SELECT sum(active_players) FROM paid), 0) > 0
        THEN round(
          coalesce((SELECT sum(rake_bruto) FROM paid), 0)
          / nullif((SELECT sum(active_players) FROM paid), 0)::numeric,
          2
        )
      ELSE NULL
    END,
    'source', 'rpc',
    'campaignCount', (SELECT count(*)::int FROM visible)
  )
  INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$function$;
