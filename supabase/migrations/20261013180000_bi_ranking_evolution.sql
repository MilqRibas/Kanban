-- Ranking semanal SX e série de evolução do BI.
-- Não altera rake consolidado, taxa da liga nem o motor de incentivos.

CREATE INDEX IF NOT EXISTS campaign_player_periods_board_period_idx
  ON public.campaign_player_periods (board_id, period_start, club_code, player_id);

CREATE INDEX IF NOT EXISTS campaign_table_details_board_period_game_idx
  ON public.campaign_table_details (board_id, period_start, game_type);

CREATE TABLE IF NOT EXISTS public.bi_weekly_prizes (
  id text PRIMARY KEY,
  board_id text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  category text NOT NULL CHECK (category IN ('cash', 'torneio', 'spin')),
  player_id text NOT NULL,
  placement int NOT NULL CHECK (placement BETWEEN 1 AND 3),
  amount numeric NOT NULL CHECK (amount >= 0),
  status text NOT NULL CHECK (status IN ('planejada', 'registrada', 'enviada')),
  note text,
  rake_snapshot numeric NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, period_start, category, player_id)
);

CREATE INDEX IF NOT EXISTS bi_weekly_prizes_week_idx
  ON public.bi_weekly_prizes (board_id, period_start DESC);

ALTER TABLE public.bi_weekly_prizes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated full access bi_weekly_prizes"
    ON public.bi_weekly_prizes FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.bi_sx_weeks(p_board_id text)
RETURNS TABLE (
  period_start date,
  period_end date,
  complete boolean,
  tables_loaded boolean,
  spin_players int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    pp.period_start,
    pp.period_end,
    pp.period_end < (now() AT TIME ZONE 'America/Sao_Paulo')::date AS complete,
    EXISTS (
      SELECT 1
      FROM public.campaign_table_details td
      WHERE td.board_id = p_board_id
        AND td.period_start = pp.period_start
        AND (td.club_code = 'sx_club' OR td.club_code IS NULL)
    ) AS tables_loaded,
    count(*) FILTER (WHERE pp.spin_fee <> 0)::int AS spin_players
  FROM public.campaign_player_periods pp
  WHERE pp.board_id = p_board_id
    AND (pp.club_code = 'sx_club' OR pp.club_code IS NULL)
  GROUP BY pp.period_start, pp.period_end
  ORDER BY pp.period_start DESC;
$$;

CREATE OR REPLACE FUNCTION public.bi_sx_weekly_ranking(p_board_id text, p_period_start date)
RETURNS TABLE (
  category text,
  placement int,
  player_id text,
  nickname text,
  rake numeric,
  tied boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH cash AS (
    SELECT td.player_id, sum(td.rake)::numeric AS rake
    FROM public.campaign_table_details td
    WHERE td.board_id = p_board_id
      AND td.period_start = p_period_start
      AND (td.club_code = 'sx_club' OR td.club_code IS NULL)
      AND upper(td.game_type) = 'RG'
    GROUP BY td.player_id
    HAVING sum(td.rake) > 0
  ),
  torneio AS (
    SELECT td.player_id, sum(td.rake)::numeric AS rake
    FROM public.campaign_table_details td
    WHERE td.board_id = p_board_id
      AND td.period_start = p_period_start
      AND (td.club_code = 'sx_club' OR td.club_code IS NULL)
      AND upper(td.game_type) IN ('MTT', 'SNG')
    GROUP BY td.player_id
    HAVING sum(td.rake) > 0
  ),
  spin AS (
    SELECT pp.player_id, sum(pp.spin_fee)::numeric AS rake
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
      AND pp.period_start = p_period_start
      AND (pp.club_code = 'sx_club' OR pp.club_code IS NULL)
      AND pp.spin_fee > 0
    GROUP BY pp.player_id
  ),
  scored AS (
    SELECT 'cash'::text AS category, player_id, rake FROM cash
    UNION ALL
    SELECT 'torneio', player_id, rake FROM torneio
    UNION ALL
    SELECT 'spin', player_id, rake FROM spin
  ),
  ranked AS (
    SELECT
      s.category,
      s.player_id,
      s.rake,
      row_number() OVER (PARTITION BY s.category ORDER BY s.rake DESC, s.player_id ASC)::int AS placement,
      count(*) OVER (PARTITION BY s.category, s.rake) > 1 AS tied
    FROM scored s
  )
  SELECT
    r.category,
    r.placement,
    r.player_id,
    cp.nickname,
    r.rake,
    r.tied
  FROM ranked r
  LEFT JOIN public.campaign_players cp
    ON cp.board_id = p_board_id AND cp.player_id = r.player_id
  WHERE r.placement <= 3
  ORDER BY r.category, r.placement;
$$;

CREATE OR REPLACE FUNCTION public.bi_list_weekly_prizes(p_board_id text, p_period_start date)
RETURNS TABLE (
  id text,
  period_start date,
  period_end date,
  category text,
  player_id text,
  placement int,
  amount numeric,
  status text,
  note text,
  rake_snapshot numeric,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    id, period_start, period_end, category, player_id, placement,
    amount, status, note, rake_snapshot, created_at, updated_at
  FROM public.bi_weekly_prizes
  WHERE board_id = p_board_id
    AND (p_period_start IS NULL OR period_start = p_period_start)
  ORDER BY period_start DESC, category, placement;
$$;

CREATE OR REPLACE FUNCTION public.bi_save_weekly_prize(
  p_board_id text,
  p_period_start date,
  p_category text,
  p_player_id text,
  p_placement int,
  p_amount numeric,
  p_status text,
  p_note text,
  p_created_by text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_end date;
  v_rake numeric;
  v_id text;
BEGIN
  IF p_category NOT IN ('cash', 'torneio', 'spin') THEN
    RAISE EXCEPTION 'Categoria inválida';
  END IF;
  IF p_status NOT IN ('planejada', 'registrada', 'enviada') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;
  IF p_placement NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Colocação inválida';
  END IF;

  SELECT period_end INTO v_end
  FROM public.campaign_player_periods
  WHERE board_id = p_board_id
    AND period_start = p_period_start
    AND (club_code = 'sx_club' OR club_code IS NULL)
  LIMIT 1;
  IF v_end IS NULL THEN
    RAISE EXCEPTION 'Semana SX não encontrada';
  END IF;

  SELECT rk.rake INTO v_rake
  FROM public.bi_sx_weekly_ranking(p_board_id, p_period_start) rk
  WHERE rk.category = p_category
    AND rk.player_id = p_player_id;

  INSERT INTO public.bi_weekly_prizes (
    id, board_id, period_start, period_end, category, player_id,
    placement, amount, status, note, rake_snapshot, created_by
  ) VALUES (
    'prize-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
    p_board_id, p_period_start, v_end, p_category, p_player_id,
    p_placement, p_amount, p_status, nullif(trim(p_note), ''),
    coalesce(v_rake, 0), p_created_by
  )
  ON CONFLICT (board_id, period_start, category, player_id) DO UPDATE SET
    placement = EXCLUDED.placement,
    amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    note = EXCLUDED.note,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bi_evolution_options(p_board_id text, p_club text)
RETURNS TABLE (kind text, id text, label text, parent_id text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH agents AS (
    SELECT DISTINCT pp.agent_id
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
      AND pp.agent_id IS NOT NULL
      AND pp.agent_id <> ''
      AND (
        p_club IS NULL OR p_club = '' OR p_club = 'all'
        OR (p_club = 'xtreme_pro' AND pp.club_code = 'xtreme_pro')
        OR (p_club = 'sx_club' AND (pp.club_code = 'sx_club' OR pp.club_code IS NULL))
      )
  )
  SELECT
    'agent'::text,
    a.agent_id,
    coalesce(nullif(ca.name, ''), a.agent_id),
    NULL::text
  FROM agents a
  LEFT JOIN public.campaign_agents ca
    ON ca.board_id = p_board_id AND ca.agent_id = a.agent_id
  UNION ALL
  SELECT
    'campaign',
    c.id,
    c.name,
    c.agent_id
  FROM public.campaigns c
  JOIN agents a ON a.agent_id = c.agent_id
  WHERE c.board_id = p_board_id
    AND c.is_archived IS NOT TRUE
    AND c.agent_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.bi_search_players(
  p_board_id text,
  p_club text,
  p_agent_id text,
  p_query text
)
RETURNS TABLE (player_id text, nickname text, name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT pp.player_id, cp.nickname, cp.name
  FROM public.campaign_player_periods pp
  LEFT JOIN public.campaign_players cp
    ON cp.board_id = pp.board_id AND cp.player_id = pp.player_id
  WHERE pp.board_id = p_board_id
    AND (
      p_club IS NULL OR p_club = '' OR p_club = 'all'
      OR (p_club = 'xtreme_pro' AND pp.club_code = 'xtreme_pro')
      OR (p_club = 'sx_club' AND (pp.club_code = 'sx_club' OR pp.club_code IS NULL))
    )
    AND (p_agent_id IS NULL OR p_agent_id = '' OR pp.agent_id = p_agent_id)
    AND (
      pp.player_id ILIKE '%' || p_query || '%'
      OR coalesce(cp.nickname, '') ILIKE '%' || p_query || '%'
      OR coalesce(cp.name, '') ILIKE '%' || p_query || '%'
    )
  ORDER BY pp.player_id
  LIMIT 20;
$$;


CREATE OR REPLACE FUNCTION public.bi_performance_series(
  p_board_id text,
  p_metric text,
  p_grain text,
  p_from date,
  p_to date,
  p_club text,
  p_agent_id text,
  p_campaign_id text,
  p_player_id text
)
RETURNS TABLE (bucket_start date, bucket_end date, value numeric, partial boolean, has_data boolean)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE v_fee numeric;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN RAISE EXCEPTION 'Período inválido'; END IF;
  IF p_metric NOT IN ('rake_bruto', 'rake_liquido', 'ativos', 'incentivos', 'primeira_semana') THEN RAISE EXCEPTION 'Métrica indisponível'; END IF;
  IF p_grain NOT IN ('day', 'week', 'month', 'range') THEN RAISE EXCEPTION 'Agrupamento inválido'; END IF;
  IF p_grain = 'day' AND p_metric <> 'incentivos' THEN
    RAISE EXCEPTION 'O relatório de rake é semanal. Não há valor diário para fabricar a partir do total da semana.';
  END IF;
  SELECT s.league_fee_rate INTO v_fee FROM public.crm_get_economic_settings(p_board_id) s;
  v_fee := coalesce(v_fee, 0.18);
  IF p_metric = 'incentivos' THEN
    RETURN QUERY
    WITH bounds AS (
      SELECT
        min((t.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date) AS tx_from,
        max((t.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date) AS tx_to
      FROM public.campaign_transactions t
      WHERE t.board_id = p_board_id
        AND (
          p_club IS NULL OR p_club IN ('', 'all')
          OR (p_club = 'xtreme_pro' AND t.club_code = 'xtreme_pro')
          OR (p_club = 'sx_club' AND (t.club_code = 'sx_club' OR t.club_code IS NULL))
        )
    ), days AS (
      SELECT generate_series(p_from, p_to, interval '1 day')::date AS day
    ), tx AS (
      SELECT
        (t.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
        abs(t.amount)::numeric AS amount
      FROM public.campaign_transactions t
      CROSS JOIN public.crm_get_economic_settings(p_board_id) settings
      WHERE t.board_id = p_board_id
        AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, settings.mkt_gt_player_id)
        AND (t.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_from AND p_to
        AND (
          p_club IS NULL OR p_club IN ('', 'all')
          OR (p_club = 'xtreme_pro' AND t.club_code = 'xtreme_pro')
          OR (p_club = 'sx_club' AND (t.club_code = 'sx_club' OR t.club_code IS NULL))
        )
        AND (p_agent_id IS NULL OR p_agent_id = '' OR t.agent_id = p_agent_id)
        AND (p_player_id IS NULL OR p_player_id = '' OR t.receiver_player_id = p_player_id)
        AND (
          p_campaign_id IS NULL OR p_campaign_id = '' OR EXISTS (
            SELECT 1
            FROM public.campaigns c
            JOIN public.campaign_cohort_players cp
              ON cp.board_id = c.board_id AND cp.campaign_id = c.id AND cp.player_id = t.receiver_player_id
            WHERE c.board_id = p_board_id
              AND c.id = p_campaign_id
              AND c.agent_id IS NOT NULL
              AND t.agent_id = c.agent_id
              AND (t.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date >= cp.acquired_at::date
          )
        )
    ), marked AS (
      SELECT
        d.day,
        tx.amount,
        b.tx_from,
        b.tx_to,
        CASE
          WHEN p_grain = 'month' THEN date_trunc('month', d.day)::date
          WHEN p_grain = 'week' THEN date_trunc('week', d.day)::date
          ELSE d.day
        END AS bucket_start
      FROM days d
      CROSS JOIN bounds b
      LEFT JOIN tx ON tx.day = d.day
    )
    SELECT
      m.bucket_start,
      CASE
        WHEN p_grain = 'month' THEN (m.bucket_start + interval '1 month' - interval '1 day')::date
        WHEN p_grain = 'week' THEN (m.bucket_start + 6)
        ELSE m.bucket_start
      END,
      CASE WHEN bool_or(m.day BETWEEN m.tx_from AND m.tx_to) THEN coalesce(sum(m.amount), 0) ELSE NULL END,
      bool_or(
        m.bucket_start < p_from
        OR CASE
          WHEN p_grain = 'month' THEN (m.bucket_start + interval '1 month' - interval '1 day')::date
          WHEN p_grain = 'week' THEN (m.bucket_start + 6)
          ELSE m.bucket_start
        END > p_to
      ),
      bool_or(m.day BETWEEN m.tx_from AND m.tx_to)
    FROM marked m
    GROUP BY m.bucket_start
    ORDER BY m.bucket_start;
    RETURN;
  END IF;
  IF p_grain = 'range' AND p_metric = 'ativos' THEN
    RETURN QUERY
    SELECT
      p_from,
      p_to,
      count(DISTINCT pp.player_id) FILTER (WHERE public.rake_consolidated(pp.weekly_rake, pp.spin_fee) > 0)::numeric,
      false,
      count(*) > 0
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
      AND pp.period_end >= p_from
      AND pp.period_start <= p_to
      AND (
        p_club IS NULL OR p_club IN ('', 'all')
        OR (p_club = 'xtreme_pro' AND pp.club_code = 'xtreme_pro')
        OR (p_club = 'sx_club' AND (pp.club_code = 'sx_club' OR pp.club_code IS NULL))
      )
      AND (p_agent_id IS NULL OR p_agent_id = '' OR pp.agent_id = p_agent_id)
      AND (p_player_id IS NULL OR p_player_id = '' OR pp.player_id = p_player_id)
      AND (
        p_campaign_id IS NULL OR p_campaign_id = '' OR EXISTS (
          SELECT 1
          FROM public.campaigns c
          JOIN public.campaign_cohort_players cp
            ON cp.board_id = c.board_id AND cp.campaign_id = c.id AND cp.player_id = pp.player_id
          WHERE c.board_id = p_board_id
            AND c.id = p_campaign_id
            AND c.agent_id IS NOT NULL
            AND pp.agent_id = c.agent_id
            AND pp.period_start >= cp.acquired_at::date
        )
      );
    RETURN;
  END IF;
  RETURN QUERY
  WITH calendar AS (
    SELECT DISTINCT pp.period_start, pp.period_end
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
      AND pp.period_end >= p_from
      AND pp.period_start <= p_to
      AND (
        p_club IS NULL OR p_club IN ('', 'all')
        OR (p_club = 'xtreme_pro' AND pp.club_code = 'xtreme_pro')
        OR (p_club = 'sx_club' AND (pp.club_code = 'sx_club' OR pp.club_code IS NULL))
      )
  ), scoped AS (
    SELECT
      pp.period_start,
      pp.player_id,
      public.rake_consolidated(pp.weekly_rake, pp.spin_fee) AS rake
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
      AND pp.period_end >= p_from
      AND pp.period_start <= p_to
      AND (
        p_club IS NULL OR p_club IN ('', 'all')
        OR (p_club = 'xtreme_pro' AND pp.club_code = 'xtreme_pro')
        OR (p_club = 'sx_club' AND (pp.club_code = 'sx_club' OR pp.club_code IS NULL))
      )
      AND (p_agent_id IS NULL OR p_agent_id = '' OR pp.agent_id = p_agent_id)
      AND (p_player_id IS NULL OR p_player_id = '' OR pp.player_id = p_player_id)
      AND (
        p_campaign_id IS NULL OR p_campaign_id = '' OR EXISTS (
          SELECT 1
          FROM public.campaigns c
          JOIN public.campaign_cohort_players cp
            ON cp.board_id = c.board_id AND cp.campaign_id = c.id AND cp.player_id = pp.player_id
          WHERE c.board_id = p_board_id
            AND c.id = p_campaign_id
            AND c.agent_id IS NOT NULL
            AND pp.agent_id = c.agent_id
            AND pp.period_start >= cp.acquired_at::date
        )
      )
  ), firsts AS (
    SELECT pp.player_id, min(pp.period_start) AS first_week
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
      AND (
        p_club IS NULL OR p_club IN ('', 'all')
        OR (p_club = 'xtreme_pro' AND pp.club_code = 'xtreme_pro')
        OR (p_club = 'sx_club' AND (pp.club_code = 'sx_club' OR pp.club_code IS NULL))
      )
      AND (p_agent_id IS NULL OR p_agent_id = '' OR pp.agent_id = p_agent_id)
      AND (p_player_id IS NULL OR p_player_id = '' OR pp.player_id = p_player_id)
      AND (
        p_campaign_id IS NULL OR p_campaign_id = '' OR EXISTS (
          SELECT 1
          FROM public.campaigns c
          JOIN public.campaign_cohort_players cp
            ON cp.board_id = c.board_id AND cp.campaign_id = c.id AND cp.player_id = pp.player_id
          WHERE c.board_id = p_board_id
            AND c.id = p_campaign_id
            AND c.agent_id IS NOT NULL
            AND pp.agent_id = c.agent_id
            AND pp.period_start >= cp.acquired_at::date
        )
      )
    GROUP BY pp.player_id
  ), weeks AS (
    SELECT
      CASE WHEN p_grain = 'month' THEN date_trunc('month', c.period_start)::date ELSE c.period_start END AS bucket_start,
      CASE
        WHEN p_grain = 'month' THEN (date_trunc('month', c.period_start) + interval '1 month' - interval '1 day')::date
        ELSE c.period_end
      END AS bucket_end,
      CASE
        WHEN p_metric = 'ativos' AND p_grain = 'month' THEN NULL::numeric
        WHEN p_metric = 'ativos' THEN (
          SELECT count(DISTINCT s.player_id) FILTER (WHERE s.rake > 0)::numeric
          FROM scoped s
          WHERE s.period_start = c.period_start
        )
        WHEN p_metric = 'primeira_semana' THEN (
          SELECT count(*)::numeric FROM firsts f WHERE f.first_week = c.period_start
        )
        WHEN p_metric = 'rake_liquido' THEN (
          SELECT sum(s.rake) * (1 - v_fee) FROM scoped s WHERE s.period_start = c.period_start
        )
        ELSE (SELECT sum(s.rake) FROM scoped s WHERE s.period_start = c.period_start)
      END AS value,
      CASE
        WHEN p_metric = 'primeira_semana' THEN true
        ELSE EXISTS (SELECT 1 FROM scoped s WHERE s.period_start = c.period_start)
      END AS has_data,
      (c.period_start < p_from OR c.period_end > p_to) AS partial
    FROM calendar c
  )
  SELECT
    w.bucket_start,
    w.bucket_end,
    CASE
      WHEN p_metric = 'ativos' AND p_grain = 'month' THEN (
        SELECT count(DISTINCT s.player_id) FILTER (WHERE s.rake > 0)::numeric
        FROM scoped s
        WHERE date_trunc('month', s.period_start)::date = w.bucket_start
      )
      ELSE sum(w.value)
    END,
    bool_or(w.partial),
    bool_or(w.has_data)
  FROM weeks w
  GROUP BY w.bucket_start, w.bucket_end
  ORDER BY w.bucket_start;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.bi_sx_weeks(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bi_sx_weekly_ranking(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bi_list_weekly_prizes(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bi_save_weekly_prize(text, date, text, text, int, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bi_evolution_options(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bi_search_players(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bi_performance_series(text, text, text, date, date, text, text, text, text) TO authenticated;
