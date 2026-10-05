-- Taxa Spin entra como rake gerado, sem alterar Taxa Total nem imports antigos.
-- weekly_rake continua sendo a Taxa Total do relatorio.
-- spin_fee = 0 nos registros anteriores, entao o rake consolidado deles nao muda.

ALTER TABLE public.campaign_agent_periods
  ADD COLUMN IF NOT EXISTS spin_stake numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spin_gains numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spin_profit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spin_fee numeric NOT NULL DEFAULT 0;

ALTER TABLE public.campaign_player_periods
  ADD COLUMN IF NOT EXISTS spin_stake numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spin_gains numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spin_profit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spin_fee numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.campaign_agent_periods.weekly_rake IS
  'Taxa Total do relatorio. Nao inclui Taxa Spin.';
COMMENT ON COLUMN public.campaign_agent_periods.spin_fee IS
  'Taxa Spin do relatorio. Rake gerado = weekly_rake + spin_fee.';
COMMENT ON COLUMN public.campaign_player_periods.weekly_rake IS
  'Taxa Total do relatorio. Nao inclui Taxa Spin.';
COMMENT ON COLUMN public.campaign_player_periods.spin_fee IS
  'Taxa Spin do relatorio. Rake gerado = weekly_rake + spin_fee.';

CREATE OR REPLACE FUNCTION public.rake_consolidated(p_taxa_total numeric, p_taxa_spin numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(p_taxa_total, 0) + coalesce(p_taxa_spin, 0);
$$;

REVOKE ALL ON FUNCTION public.rake_consolidated(numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rake_consolidated(numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commit_campaign_report(
  p_replace_ids text[],
  p_import jsonb,
  p_agent_periods jsonb,
  p_player_periods jsonb,
  p_table_details jsonb,
  p_agents jsonb,
  p_players jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if p_replace_ids is not null and cardinality(p_replace_ids) > 0 then
    delete from campaign_report_imports where id = any(p_replace_ids);
  end if;

  insert into campaign_report_imports (
    id, board_id, original_filename, period_start, period_end,
    imported_at, imported_by, status, agents_count, players_count,
    table_rows_count, warnings, summary, replaced_import_id, created_at
  )
  select
    x.id, x.board_id, x.original_filename, x.period_start, x.period_end,
    x.imported_at, x.imported_by, x.status, x.agents_count, x.players_count,
    x.table_rows_count, x.warnings, x.summary, x.replaced_import_id, x.created_at
  from jsonb_to_record(p_import) as x(
    id text, board_id text, original_filename text, period_start date, period_end date,
    imported_at timestamptz, imported_by text, status text, agents_count integer,
    players_count integer, table_rows_count integer, warnings jsonb, summary jsonb,
    replaced_import_id text, created_at timestamptz
  );

  insert into campaign_agent_periods (
    id, board_id, import_id, agent_id, agent_name, period_start, period_end,
    weekly_rake, gains, hands, players_rake_sum, unique_players,
    reconciliation_diff, club_code, slot_name,
    spin_stake, spin_gains, spin_profit, spin_fee, created_at
  )
  select
    x.id, x.board_id, x.import_id, x.agent_id, x.agent_name, x.period_start, x.period_end,
    x.weekly_rake, x.gains, x.hands, x.players_rake_sum, x.unique_players,
    x.reconciliation_diff, x.club_code, x.slot_name,
    coalesce(x.spin_stake, 0), coalesce(x.spin_gains, 0),
    coalesce(x.spin_profit, 0), coalesce(x.spin_fee, 0),
    x.created_at
  from jsonb_to_recordset(coalesce(p_agent_periods, '[]'::jsonb)) as x(
    id text, board_id text, import_id text, agent_id text, agent_name text,
    period_start date, period_end date, weekly_rake numeric, gains numeric,
    hands integer, players_rake_sum numeric, unique_players integer,
    reconciliation_diff numeric, club_code text, slot_name text,
    spin_stake numeric, spin_gains numeric, spin_profit numeric, spin_fee numeric,
    created_at timestamptz
  );

  insert into campaign_player_periods (
    id, board_id, import_id, agent_id, player_id, player_name, nickname,
    period_start, period_end, weekly_rake, spin_stake, spin_gains, spin_profit, spin_fee, gains, hands, club_code, created_at
  )
  select
    x.id, x.board_id, x.import_id, x.agent_id, x.player_id, x.player_name, x.nickname,
    x.period_start, x.period_end, x.weekly_rake,
    coalesce(x.spin_stake, 0), coalesce(x.spin_gains, 0),
    coalesce(x.spin_profit, 0), coalesce(x.spin_fee, 0),
    x.gains, x.hands, x.club_code, x.created_at
  from jsonb_to_recordset(coalesce(p_player_periods, '[]'::jsonb)) as x(
    id text, board_id text, import_id text, agent_id text, player_id text,
    player_name text, nickname text, period_start date, period_end date,
    weekly_rake numeric, spin_stake numeric, spin_gains numeric, spin_profit numeric, spin_fee numeric,
    gains numeric, hands integer, club_code text, created_at timestamptz
  );

  insert into campaign_table_details (
    id, board_id, import_id, agent_id, player_id, period_start, period_end,
    table_id, game_type, table_name, hands, buy_in, gains, rake, admin_fee, club_code, created_at
  )
  select
    x.id, x.board_id, x.import_id, x.agent_id, x.player_id, x.period_start, x.period_end,
    x.table_id, x.game_type, x.table_name, x.hands, x.buy_in, x.gains, x.rake, x.admin_fee, x.club_code, x.created_at
  from jsonb_to_recordset(coalesce(p_table_details, '[]'::jsonb)) as x(
    id text, board_id text, import_id text, agent_id text, player_id text,
    period_start date, period_end date, table_id text, game_type text, table_name text,
    hands integer, buy_in numeric, gains numeric, rake numeric, admin_fee numeric,
    club_code text, created_at timestamptz
  );

  insert into campaign_agents (
    board_id, agent_id, name, first_seen_start, last_seen_start,
    periods_count, accumulated_rake, created_at, updated_at
  )
  select
    x.board_id, x.agent_id, x.name, x.first_seen_start, x.last_seen_start,
    x.periods_count, x.accumulated_rake, x.created_at, x.updated_at
  from jsonb_to_recordset(coalesce(p_agents, '[]'::jsonb)) as x(
    board_id text, agent_id text, name text, first_seen_start date, last_seen_start date,
    periods_count integer, accumulated_rake numeric, created_at timestamptz, updated_at timestamptz
  )
  on conflict (board_id, agent_id) do update set
    name = excluded.name,
    first_seen_start = least(campaign_agents.first_seen_start, excluded.first_seen_start),
    last_seen_start = greatest(campaign_agents.last_seen_start, excluded.last_seen_start),
    periods_count = excluded.periods_count,
    accumulated_rake = excluded.accumulated_rake,
    updated_at = excluded.updated_at;

  insert into campaign_players (
    board_id, player_id, name, nickname, first_seen_start, last_seen_start,
    periods_count, accumulated_rake, created_at, updated_at
  )
  select
    x.board_id, x.player_id, x.name, x.nickname, x.first_seen_start, x.last_seen_start,
    x.periods_count, x.accumulated_rake, x.created_at, x.updated_at
  from jsonb_to_recordset(coalesce(p_players, '[]'::jsonb)) as x(
    board_id text, player_id text, name text, nickname text,
    first_seen_start date, last_seen_start date, periods_count integer,
    accumulated_rake numeric, created_at timestamptz, updated_at timestamptz
  )
  on conflict (board_id, player_id) do update set
    name = coalesce(nullif(excluded.name, ''), campaign_players.name),
    nickname = coalesce(nullif(excluded.nickname, ''), campaign_players.nickname),
    first_seen_start = least(campaign_players.first_seen_start, excluded.first_seen_start),
    last_seen_start = greatest(campaign_players.last_seen_start, excluded.last_seen_start),
    periods_count = excluded.periods_count,
    accumulated_rake = excluded.accumulated_rake,
    updated_at = excluded.updated_at;
end;
$function$;


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
      coalesce(sum(public.rake_consolidated(ap.weekly_rake, ap.spin_fee)), 0)::numeric AS rake_bruto
    FROM public.campaign_agent_periods ap
    WHERE ap.board_id = p_board_id
      AND (ap.club_code IS NULL OR ap.club_code <> 'xtreme_pro')
    GROUP BY ap.agent_id
  ),
  actives_by_agent AS (
    SELECT
      pp.agent_id,
      count(DISTINCT pp.player_id) FILTER (WHERE public.rake_consolidated(pp.weekly_rake, pp.spin_fee) > 0)::int AS active_players
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
    SELECT agent_id, player_id, public.rake_consolidated(weekly_rake, spin_fee) AS weekly_rake
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


-- Restaura last activity / agent via latest_tx (paridade com BI anterior),
-- mantendo as otimizações: sem table_details, incentivos só bônus/MKT, timeout 30s.

CREATE OR REPLACE FUNCTION public.crm_list_players(
  p_board_id text,
  p_search text DEFAULT NULL,
  p_campaign_filter text DEFAULT 'all',
  p_sort text DEFAULT 'last_activity_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_incentive_available_filter text DEFAULT 'all',
  p_incentive_received_filter text DEFAULT 'all',
  p_club text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_mkt text;
  v_league numeric;
  v_limit_rate numeric;
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_club text := CASE
    WHEN p_club IS NULL OR btrim(p_club) = '' OR p_club = 'all' THEN NULL
    WHEN p_club IN ('sx_club', 'xtreme_pro') THEN p_club
    ELSE NULL
  END;
BEGIN
  IF p_board_id IS NULL OR p_board_id = '' THEN
    RAISE EXCEPTION 'board_id required';
  END IF;

  SELECT s.mkt_gt_player_id, s.league_fee_rate, s.incentive_limit_rate
  INTO v_mkt, v_league, v_limit_rate
  FROM public.crm_get_economic_settings(p_board_id) AS s;

  WITH rake AS (
    SELECT
      player_id,
      coalesce(sum(public.rake_consolidated(weekly_rake, spin_fee)), 0)::numeric AS accumulated_rake,
      max(period_start) AS last_rake_period_start,
      max(period_end) AS last_rake_period_end
    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
      AND (v_club IS NULL OR club_code = v_club OR (v_club = 'sx_club' AND club_code IS NULL))
    GROUP BY player_id
  ),
  latest_period AS (
    SELECT DISTINCT ON (player_id)
      player_id,
      agent_id,
      nullif(trim(player_name), '') AS player_name,
      nullif(trim(nickname), '') AS nickname,
      period_start
    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
      AND (v_club IS NULL OR club_code = v_club OR (v_club = 'sx_club' AND club_code IS NULL))
    ORDER BY player_id, period_start DESC, period_end DESC
  ),
  latest_tx AS (
    SELECT DISTINCT ON (receiver_player_id)
      receiver_player_id AS player_id,
      agent_id,
      nullif(trim(receiver_nickname), '') AS nickname,
      coalesce((occurred_at AT TIME ZONE 'UTC')::date, period_start) AS activity_date
    FROM public.campaign_transactions
    WHERE board_id = p_board_id
      AND receiver_player_id IS NOT NULL
      AND receiver_player_id <> ''
      AND (v_club IS NULL OR club_code = v_club OR (v_club = 'sx_club' AND club_code IS NULL))
    ORDER BY receiver_player_id, occurred_at DESC NULLS LAST, period_start DESC
  ),
  master AS (
    SELECT
      player_id,
      nullif(trim(name), '') AS name,
      nullif(trim(nickname), '') AS nickname,
      accumulated_rake,
      last_seen_start
    FROM public.campaign_players
    WHERE board_id = p_board_id
  ),
  cohorts AS (
    SELECT
      cp.player_id,
      jsonb_agg(
        jsonb_build_object(
          'campaignId', cp.campaign_id,
          'campaignName', c.name,
          'agentId', c.agent_id,
          'acquiredAt', cp.acquired_at::text
        )
      ) AS campaigns,
      count(*)::int AS campaign_count
    FROM public.campaign_cohort_players cp
    LEFT JOIN public.campaigns c
      ON c.id = cp.campaign_id AND c.board_id = cp.board_id
    WHERE cp.board_id = p_board_id
    GROUP BY cp.player_id
  ),
  agents AS (
    SELECT agent_id, name
    FROM public.campaign_agents
    WHERE board_id = p_board_id
  ),
  mkt_incentives AS (
    SELECT
      t.receiver_player_id AS player_id,
      coalesce(sum(abs(t.amount)), 0)::numeric AS incentivo_enviado,
      true AS has_mkt_gt_incentive,
      bool_or(
        coalesce(m.classification, 'pendente') = 'pendente'
      ) AS has_pending_classification,
      max(coalesce((t.occurred_at AT TIME ZONE 'UTC')::date, t.period_start)) AS last_incentive_date,
      max(nullif(trim(t.receiver_nickname), '')) AS nickname
    FROM public.campaign_transactions t
    LEFT JOIN public.crm_incentive_metadata m
      ON m.board_id = t.board_id
     AND m.external_transaction_id = t.external_transaction_id
    WHERE t.board_id = p_board_id
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
      AND (v_mkt IS NULL OR t.receiver_player_id <> v_mkt)
      AND (
        coalesce(t.is_bonus, false)
        OR (v_mkt IS NOT NULL AND t.sender_player_id = v_mkt)
      )
      AND (v_club IS NULL OR t.club_code = v_club OR (v_club = 'sx_club' AND t.club_code IS NULL))
    GROUP BY t.receiver_player_id
  ),
  player_ids AS (
    SELECT player_id FROM master
    UNION
    SELECT player_id FROM rake
    UNION
    SELECT player_id FROM mkt_incentives
  ),
  base AS (
    SELECT
      ids.player_id,
      coalesce(m.name, lp.player_name) AS name,
      coalesce(m.nickname, lp.nickname, lt.nickname, mi.nickname) AS nickname,
      coalesce(lp.agent_id, lt.agent_id) AS current_agent_id,
      a.name AS current_agent_name,
      CASE
        WHEN v_club IS NULL THEN coalesce(r.accumulated_rake, m.accumulated_rake, 0)
        ELSE coalesce(r.accumulated_rake, 0)
      END::numeric AS accumulated_rake,
      r.last_rake_period_start,
      r.last_rake_period_end,
      greatest(
        r.last_rake_period_end,
        r.last_rake_period_start,
        CASE WHEN v_club IS NULL THEN m.last_seen_start END,
        lt.activity_date,
        mi.last_incentive_date
      ) AS last_activity_date,
      coalesce(ch.campaign_count, 0) AS campaign_count,
      coalesce(ch.campaigns, '[]'::jsonb) AS campaigns,
      (coalesce(ch.campaign_count, 0) > 0) AS has_campaign,
      coalesce(mi.incentivo_enviado, 0)::numeric AS incentivo_enviado,
      coalesce(mi.has_mkt_gt_incentive, false) AS has_mkt_gt_incentive,
      coalesce(mi.has_pending_classification, false) AS has_pending_classification
    FROM player_ids ids
    LEFT JOIN master m ON m.player_id = ids.player_id
    LEFT JOIN rake r ON r.player_id = ids.player_id
    LEFT JOIN latest_period lp ON lp.player_id = ids.player_id
    LEFT JOIN latest_tx lt ON lt.player_id = ids.player_id
    LEFT JOIN cohorts ch ON ch.player_id = ids.player_id
    LEFT JOIN agents a ON a.agent_id = coalesce(lp.agent_id, lt.agent_id)
    LEFT JOIN mkt_incentives mi ON mi.player_id = ids.player_id
  ),
  with_econ AS (
    SELECT
      b.*,
      public.crm_compute_incentive_economics(
        b.accumulated_rake,
        b.incentivo_enviado,
        v_league,
        v_limit_rate
      ) AS economics
    FROM base b
  ),
  enriched AS (
    SELECT
      w.*,
      (w.economics->>'limiteIncentivo')::numeric AS limite_incentivo,
      (w.economics->>'incentivoEnviado')::numeric AS incentivo_enviado_econ,
      (w.economics->>'incentivoDisponivel')::numeric AS incentivo_disponivel
    FROM with_econ w
  ),
  filtered AS (
    SELECT *
    FROM enriched
    WHERE (
      v_club IS NULL
      OR last_rake_period_start IS NOT NULL
      OR coalesce(incentivo_enviado, 0) <> 0
    )
    AND (
      v_search IS NULL
      OR player_id ILIKE '%' || v_search || '%'
      OR coalesce(name, '') ILIKE '%' || v_search || '%'
      OR coalesce(nickname, '') ILIKE '%' || v_search || '%'
      OR coalesce(current_agent_id, '') ILIKE '%' || v_search || '%'
      OR coalesce(current_agent_name, '') ILIKE '%' || v_search || '%'
    )
    AND (
      p_campaign_filter IS NULL
      OR p_campaign_filter = 'all'
      OR (p_campaign_filter = 'with_campaign' AND has_campaign)
      OR (p_campaign_filter = 'without_campaign' AND NOT has_campaign)
    )
    AND (
      p_incentive_available_filter IS NULL
      OR p_incentive_available_filter = 'all'
      OR (p_incentive_available_filter = 'positive' AND incentivo_disponivel > 0)
      OR (p_incentive_available_filter = 'zero' AND incentivo_disponivel = 0)
      OR (p_incentive_available_filter = 'negative' AND incentivo_disponivel < 0)
    )
    AND (
      p_incentive_received_filter IS NULL
      OR p_incentive_received_filter = 'all'
      OR (p_incentive_received_filter = 'received' AND has_mkt_gt_incentive)
      OR (p_incentive_received_filter = 'never' AND NOT has_mkt_gt_incentive)
      OR (p_incentive_received_filter = 'pending_classification' AND has_pending_classification)
    )
  ),
  counted AS (
    SELECT count(*)::int AS total FROM filtered
  ),
  sorted AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'rake_desc' THEN accumulated_rake END DESC NULLS LAST,
      CASE WHEN p_sort = 'rake_asc' THEN accumulated_rake END ASC NULLS LAST,
      CASE WHEN p_sort = 'player_id_asc' THEN player_id END ASC,
      CASE WHEN p_sort = 'player_id_desc' THEN player_id END DESC,
      CASE WHEN p_sort = 'last_activity_asc' THEN last_activity_date END ASC NULLS LAST,
      CASE WHEN p_sort = 'limite_desc' THEN limite_incentivo END DESC NULLS LAST,
      CASE WHEN p_sort = 'limite_asc' THEN limite_incentivo END ASC NULLS LAST,
      CASE WHEN p_sort = 'disponivel_desc' THEN incentivo_disponivel END DESC NULLS LAST,
      CASE WHEN p_sort = 'disponivel_asc' THEN incentivo_disponivel END ASC NULLS LAST,
      CASE WHEN p_sort = 'enviado_desc' THEN incentivo_enviado_econ END DESC NULLS LAST,
      CASE WHEN p_sort = 'enviado_asc' THEN incentivo_enviado_econ END ASC NULLS LAST,
      CASE
        WHEN p_sort IS NULL OR p_sort = 'last_activity_desc'
        THEN last_activity_date
      END DESC NULLS LAST,
      player_id ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    (SELECT total FROM counted),
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'playerId', s.player_id,
            'name', s.name,
            'nickname', s.nickname,
            'currentAgentId', s.current_agent_id,
            'currentAgentName', s.current_agent_name,
            'accumulatedRake', s.accumulated_rake,
            'lastRakePeriodStart', s.last_rake_period_start::text,
            'lastRakePeriodEnd', s.last_rake_period_end::text,
            'lastActivityDate', s.last_activity_date::text,
            'hasCampaign', s.has_campaign,
            'campaignCount', s.campaign_count,
            'campaigns', s.campaigns,
            'originLabel', CASE
              WHEN s.has_campaign THEN coalesce(
                (s.campaigns -> 0 ->> 'campaignName'),
                'Campanha'
              )
              ELSE 'Base Geral'
            END,
            'limiteIncentivo', s.limite_incentivo,
            'incentivoEnviado', s.incentivo_enviado_econ,
            'incentivoDisponivel', s.incentivo_disponivel,
            'hasMktGtIncentive', s.has_mkt_gt_incentive,
            'hasPendingClassification', s.has_pending_classification
          )
        )
        FROM sorted s
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows
  );
END;
$$;


-- Hotfix: reaplica incentiveHistory com isBonus + detection (RPC 360 estava sem esses campos em producao).

CREATE OR REPLACE FUNCTION public.crm_get_player_360(
  p_board_id text,
  p_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_player text := nullif(trim(COALESCE(p_player_id, '')), '');
  v_mkt text;
  v_league numeric;
  v_limit_rate numeric;
BEGIN
  IF p_board_id IS NULL OR p_board_id = '' OR v_player IS NULL THEN
    RAISE EXCEPTION 'board_id and player_id required';
  END IF;

  SELECT s.mkt_gt_player_id, s.league_fee_rate, s.incentive_limit_rate
  INTO v_mkt, v_league, v_limit_rate
  FROM public.crm_get_economic_settings(p_board_id) AS s;

  RETURN (
    WITH master AS (
      SELECT *
      FROM public.campaign_players
      WHERE board_id = p_board_id AND player_id = v_player
    ),
    periods AS (
      SELECT *
      FROM public.campaign_player_periods
      WHERE board_id = p_board_id AND player_id = v_player
      ORDER BY period_start ASC
    ),
    rake_summary AS (
      SELECT
        coalesce(sum(public.rake_consolidated(weekly_rake, spin_fee)), 0)::numeric AS accumulated_rake,
        count(*)::int AS periods_count,
        min(period_start) AS first_period_start,
        max(period_start) AS last_period_start,
        max(period_end) AS last_period_end
      FROM periods
    ),
    weekly AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'periodStart', period_start::text,
            'periodEnd', period_end::text,
            'agentId', agent_id,
            'weeklyRake', public.rake_consolidated(weekly_rake, spin_fee),
            'hands', hands,
            'gains', gains
          )
          ORDER BY period_start
        ),
        '[]'::jsonb
      ) AS series
      FROM periods
    ),
    latest_period AS (
      SELECT agent_id, player_name, nickname, period_start, period_end
      FROM periods
      ORDER BY period_start DESC
      LIMIT 1
    ),
    game_profile AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'gameType', game_type,
            'rake', rake,
            'hands', hands,
            'rows', rows_count
          )
          ORDER BY rake DESC
        ),
        '[]'::jsonb
      ) AS slices
      FROM (
        SELECT
          coalesce(nullif(trim(game_type), ''), 'OUTRO') AS game_type,
          sum(rake)::numeric AS rake,
          sum(hands)::int AS hands,
          count(*)::int AS rows_count
        FROM public.campaign_table_details
        WHERE board_id = p_board_id AND player_id = v_player
        GROUP BY 1
      ) g
    ),
    tx_summary AS (
      SELECT
        count(*) FILTER (WHERE is_deposit)::int AS deposit_count,
        count(*) FILTER (WHERE is_bonus)::int AS bonus_count,
        coalesce(sum(abs(amount)) FILTER (WHERE is_deposit), 0)::numeric AS deposited_volume,
        coalesce(sum(abs(amount)) FILTER (WHERE is_bonus), 0)::numeric AS bonus_volume
      FROM public.campaign_transactions
      WHERE board_id = p_board_id AND receiver_player_id = v_player
    ),
    recent_tx AS (
      SELECT coalesce(
        jsonb_agg(row_data ORDER BY sort_at DESC),
        '[]'::jsonb
      ) AS rows
      FROM (
        SELECT
          jsonb_build_object(
            'id', id,
            'externalTransactionId', external_transaction_id,
            'occurredAt', occurred_at,
            'periodStart', period_start::text,
            'periodEnd', period_end::text,
            'agentId', agent_id,
            'amount', amount,
            'isDeposit', is_deposit,
            'isBonus', is_bonus,
            'origin', origin,
            'transactionType', transaction_type
          ) AS row_data,
          coalesce(occurred_at, period_start::timestamptz) AS sort_at
        FROM public.campaign_transactions
        WHERE board_id = p_board_id AND receiver_player_id = v_player
        ORDER BY coalesce(occurred_at, period_start::timestamptz) DESC NULLS LAST
        LIMIT 50
      ) t
    ),
    campaigns AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'campaignId', cp.campaign_id,
            'campaignName', c.name,
            'agentId', c.agent_id,
            'agency', c.agency,
            'acquiredAt', cp.acquired_at::text,
            'sourceAgentId', cp.source_agent_id,
            'currentAgentId', cp.current_agent_id,
            'firstSeenWeek', cp.first_seen_week::text,
            'lastSeenWeek', cp.last_seen_week::text
          )
          ORDER BY cp.acquired_at
        ),
        '[]'::jsonb
      ) AS rows
      FROM public.campaign_cohort_players cp
      LEFT JOIN public.campaigns c
        ON c.id = cp.campaign_id AND c.board_id = cp.board_id
      WHERE cp.board_id = p_board_id AND cp.player_id = v_player
    ),
    tx_identity AS (
      SELECT
        nullif(trim(receiver_nickname), '') AS nickname,
        agent_id
      FROM public.campaign_transactions
      WHERE board_id = p_board_id AND receiver_player_id = v_player
      ORDER BY occurred_at DESC NULLS LAST
      LIMIT 1
    ),
    mkt_enviado AS (
      SELECT coalesce(sum(abs(t.amount)), 0)::numeric AS incentivo_enviado
      FROM public.campaign_transactions t
      WHERE t.board_id = p_board_id
        AND t.receiver_player_id = v_player
        AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, v_mkt)
    ),
    incentives AS (
      SELECT public.crm_compute_incentive_economics(
        coalesce((SELECT accumulated_rake FROM rake_summary), 0),
        (SELECT incentivo_enviado FROM mkt_enviado),
        v_league,
        v_limit_rate
      ) AS economics
    ),
    incentive_history AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'amount', t.amount,
            'occurredAt', t.occurred_at,
            'externalTransactionId', t.external_transaction_id,
            'senderPlayerId', t.sender_player_id,
            'isBonus', t.is_bonus,
            'detection', CASE
              WHEN public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt) AND coalesce(t.is_bonus, false) THEN 'mkt_gt_bonus'
              WHEN public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt) THEN 'mkt_gt'
              WHEN coalesce(t.is_bonus, false) THEN 'bonus'
              ELSE 'unknown'
            END,
            'agentId', t.agent_id,
            'classification', m.classification,
            'product', m.product,
            'purpose', m.purpose,
            'notes', m.notes,
            'classifiedBy', m.classified_by,
            'classifiedAt', m.classified_at
          )
          ORDER BY t.occurred_at ASC NULLS LAST, t.external_transaction_id ASC
        ),
        '[]'::jsonb
      ) AS rows
      FROM public.campaign_transactions t
      LEFT JOIN public.crm_incentive_metadata m
        ON m.board_id = t.board_id
       AND m.external_transaction_id = t.external_transaction_id
      WHERE t.board_id = p_board_id
        AND t.receiver_player_id = v_player
        AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, v_mkt)
    ),
    exists_check AS (
      SELECT (
        EXISTS (SELECT 1 FROM master)
        OR EXISTS (SELECT 1 FROM periods)
        OR EXISTS (
          SELECT 1 FROM public.campaign_transactions
          WHERE board_id = p_board_id AND receiver_player_id = v_player
        )
        OR EXISTS (
          SELECT 1 FROM public.campaign_table_details
          WHERE board_id = p_board_id AND player_id = v_player
        )
        OR EXISTS (
          SELECT 1 FROM public.campaign_cohort_players
          WHERE board_id = p_board_id AND player_id = v_player
        )
      ) AS player_exists
    )
    SELECT CASE
      WHEN NOT (SELECT player_exists FROM exists_check) THEN NULL
      ELSE jsonb_build_object(
        'playerId', v_player,
        'boardId', p_board_id,
        'name', coalesce((SELECT name FROM master), (SELECT player_name FROM latest_period)),
        'nickname', coalesce(
          (SELECT nickname FROM master),
          (SELECT nickname FROM latest_period),
          (SELECT nickname FROM tx_identity)
        ),
        'currentAgentId', coalesce(
          (SELECT agent_id FROM latest_period),
          (SELECT agent_id FROM tx_identity)
        ),
        'currentAgentName', (
          SELECT name FROM public.campaign_agents
          WHERE board_id = p_board_id
            AND agent_id = coalesce(
              (SELECT agent_id FROM latest_period),
              (SELECT agent_id FROM tx_identity)
            )
          LIMIT 1
        ),
        'rake', (SELECT jsonb_build_object(
          'accumulatedRake', accumulated_rake,
          'periodsCount', periods_count,
          'firstPeriodStart', first_period_start::text,
          'lastPeriodStart', last_period_start::text,
          'lastPeriodEnd', last_period_end::text
        ) FROM rake_summary),
        'weeklyRake', (SELECT series FROM weekly),
        'gameProfile', (SELECT slices FROM game_profile),
        'transactions', (SELECT jsonb_build_object(
          'depositCount', deposit_count,
          'bonusCount', bonus_count,
          'depositedVolume', deposited_volume,
          'bonusVolume', bonus_volume,
          'recent', (SELECT rows FROM recent_tx)
        ) FROM tx_summary),
        'campaigns', (SELECT rows FROM campaigns),
        'hasCampaign', (SELECT jsonb_array_length(rows) > 0 FROM campaigns),
        'incentives', (SELECT economics FROM incentives),
        'incentiveHistory', (SELECT rows FROM incentive_history),
        'freshness', public.crm_data_freshness(p_board_id)
      )
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_get_player_360(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_get_player_360(text, text) TO authenticated;


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
  ever_received_incentive boolean
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
    coalesce(i.incentive_count, 0) > 0
  FROM players p
  CROSS JOIN settings s
  LEFT JOIN camps c ON c.player_id = p.player_id
  LEFT JOIN agents a ON a.player_id = p.player_id
  LEFT JOIN rake r ON r.player_id = p.player_id
  LEFT JOIN tx_inc i ON i.player_id = p.player_id;
$$;

REVOKE ALL ON FUNCTION public.crm_player_segment_facts(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_player_segment_facts(text, text) TO authenticated;

