from pathlib import Path

root = Path(__file__).resolve().parents[1]

ddl = r"""
-- Preparacao Xtreme Pro: dimensao clube, auditoria e rake canonico.
-- Nao cria dados Xtreme. Backfill apenas quando Nome do clube = SX Club.

ALTER TABLE public.campaign_transactions
  ADD COLUMN IF NOT EXISTS club_code text,
  ADD COLUMN IF NOT EXISTS club_name text,
  ADD COLUMN IF NOT EXISTS sender_nickname text,
  ADD COLUMN IF NOT EXISTS sx_type text;

ALTER TABLE public.campaign_player_periods
  ADD COLUMN IF NOT EXISTS club_code text;

ALTER TABLE public.campaign_agent_periods
  ADD COLUMN IF NOT EXISTS club_code text;

ALTER TABLE public.campaign_table_details
  ADD COLUMN IF NOT EXISTS club_code text;

ALTER TABLE public.campaign_transactions
  DROP CONSTRAINT IF EXISTS campaign_transactions_club_code_check;
ALTER TABLE public.campaign_transactions
  ADD CONSTRAINT campaign_transactions_club_code_check
  CHECK (club_code IS NULL OR club_code IN ('sx_club', 'xtreme_pro'));

ALTER TABLE public.campaign_player_periods
  DROP CONSTRAINT IF EXISTS campaign_player_periods_club_code_check;
ALTER TABLE public.campaign_player_periods
  ADD CONSTRAINT campaign_player_periods_club_code_check
  CHECK (club_code IS NULL OR club_code IN ('sx_club', 'xtreme_pro'));

ALTER TABLE public.campaign_agent_periods
  DROP CONSTRAINT IF EXISTS campaign_agent_periods_club_code_check;
ALTER TABLE public.campaign_agent_periods
  ADD CONSTRAINT campaign_agent_periods_club_code_check
  CHECK (club_code IS NULL OR club_code IN ('sx_club', 'xtreme_pro'));

ALTER TABLE public.campaign_table_details
  DROP CONSTRAINT IF EXISTS campaign_table_details_club_code_check;
ALTER TABLE public.campaign_table_details
  ADD CONSTRAINT campaign_table_details_club_code_check
  CHECK (club_code IS NULL OR club_code IN ('sx_club', 'xtreme_pro'));

ALTER TABLE public.campaign_player_periods
  ADD COLUMN IF NOT EXISTS club_key text GENERATED ALWAYS AS (coalesce(club_code, '')) STORED;
ALTER TABLE public.campaign_agent_periods
  ADD COLUMN IF NOT EXISTS club_key text GENERATED ALWAYS AS (coalesce(club_code, '')) STORED;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.campaign_player_periods'::regclass
      AND contype = 'u'
      AND conname <> 'campaign_player_periods_pkey'
  LOOP
    EXECUTE format('ALTER TABLE public.campaign_player_periods DROP CONSTRAINT %I', r.conname);
  END LOOP;
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.campaign_agent_periods'::regclass
      AND contype = 'u'
      AND conname <> 'campaign_agent_periods_pkey'
  LOOP
    EXECUTE format('ALTER TABLE public.campaign_agent_periods DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_player_periods_natural_club_uid
  ON public.campaign_player_periods (board_id, agent_id, player_id, period_start, period_end, club_key);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_agent_periods_natural_club_uid
  ON public.campaign_agent_periods (board_id, agent_id, period_start, period_end, club_key);

CREATE INDEX IF NOT EXISTS campaign_tx_club_idx
  ON public.campaign_transactions (board_id, club_code, receiver_player_id);
CREATE INDEX IF NOT EXISTS campaign_player_periods_club_idx
  ON public.campaign_player_periods (board_id, club_code, player_id);

UPDATE public.campaign_transactions
SET club_code = 'sx_club',
    club_name = COALESCE(club_name, raw->>'col:Nome do clube')
WHERE club_code IS NULL
  AND lower(btrim(COALESCE(raw->>'col:Nome do clube', ''))) = 'sx club';

UPDATE public.campaign_transactions
SET sender_nickname = COALESCE(
      sender_nickname,
      NULLIF(btrim(raw->>'senderNickname'), ''),
      NULLIF(btrim(raw->>'col:Sender player nickname'), ''),
      NULLIF(btrim(raw->>'col:Sender nickname'), '')
    ),
    sx_type = COALESCE(
      sx_type,
      NULLIF(btrim(raw->>'sxType'), ''),
      NULLIF(btrim(raw->>'col:SX tipo'), '')
    )
WHERE sender_nickname IS NULL OR sx_type IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_club_cases (
  board_id text NOT NULL,
  club_code text NOT NULL CHECK (club_code IN ('sx_club', 'xtreme_pro')),
  investment numeric NOT NULL DEFAULT 0 CHECK (investment >= 0),
  activation_cost numeric NOT NULL DEFAULT 0 CHECK (activation_cost >= 0),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, club_code)
);

ALTER TABLE public.crm_club_cases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated full access crm_club_cases"
    ON public.crm_club_cases FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_club_cases TO authenticated;
"""

report = Path(root / "scripts" / "_commit_report.sql")
# report SQL is appended from a sibling written below if missing — inline next

parts = [ddl]
parts.append(Path(root / "scripts" / "_commit_report_fn.sql").read_text(encoding="utf-8"))

tx = (root / "supabase/migrations/20260917153000_crm_incentive_commit_tx_sender.sql").read_text(encoding="utf-8")
tx = tx.replace(
    """    receiver_player_id, receiver_nickname, sender_player_id,
    agent_id, agent_nickname,""",
    """    receiver_player_id, receiver_nickname, sender_player_id, sender_nickname,
    club_code, club_name, sx_type,
    agent_id, agent_nickname,""",
)
tx = tx.replace(
    """    t->>'receiver_nickname',
    NULLIF(t->>'sender_player_id', ''),
    NULLIF(t->>'agent_id', ''),""",
    """    t->>'receiver_nickname',
    NULLIF(t->>'sender_player_id', ''),
    NULLIF(t->>'sender_nickname', ''),
    NULLIF(t->>'club_code', ''),
    NULLIF(t->>'club_name', ''),
    NULLIF(t->>'sx_type', ''),
    NULLIF(t->>'agent_id', ''),""",
)
tx = tx.replace(
    """    sender_player_id = COALESCE(EXCLUDED.sender_player_id, public.campaign_transactions.sender_player_id),
    agent_id = EXCLUDED.agent_id,""",
    """    sender_player_id = COALESCE(EXCLUDED.sender_player_id, public.campaign_transactions.sender_player_id),
    sender_nickname = COALESCE(EXCLUDED.sender_nickname, public.campaign_transactions.sender_nickname),
    club_code = COALESCE(EXCLUDED.club_code, public.campaign_transactions.club_code),
    club_name = COALESCE(EXCLUDED.club_name, public.campaign_transactions.club_name),
    sx_type = COALESCE(EXCLUDED.sx_type, public.campaign_transactions.sx_type),
    agent_id = EXCLUDED.agent_id,""",
)
parts.append(tx[tx.find("CREATE OR REPLACE FUNCTION public.commit_campaign_transactions") :])

list_sql = (root / "supabase/migrations/20260918184500_crm_list_players_sort_asc.sql").read_text(encoding="utf-8")
list_sql = list_sql.replace(
    "  p_incentive_received_filter text DEFAULT 'all'\n)",
    "  p_incentive_received_filter text DEFAULT 'all',\n  p_club text DEFAULT NULL\n)",
)
list_sql = list_sql.replace(
    "  v_rows jsonb := '[]'::jsonb;\nBEGIN",
    """  v_rows jsonb := '[]'::jsonb;
  v_club text := CASE
    WHEN p_club IS NULL OR btrim(p_club) = '' OR p_club = 'all' THEN NULL
    WHEN p_club IN ('sx_club', 'xtreme_pro') THEN p_club
    ELSE NULL
  END;
BEGIN""",
)
list_sql = list_sql.replace(
    """    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
    GROUP BY player_id""",
    """    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
      AND (v_club IS NULL OR club_code = v_club)
    GROUP BY player_id""",
)
list_sql = list_sql.replace(
    """    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
    ORDER BY player_id, period_start DESC, period_end DESC""",
    """    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
      AND (v_club IS NULL OR club_code = v_club)
    ORDER BY player_id, period_start DESC, period_end DESC""",
)
list_sql = list_sql.replace(
    """    WHERE board_id = p_board_id
      AND receiver_player_id IS NOT NULL
      AND receiver_player_id <> ''
    ORDER BY receiver_player_id, occurred_at DESC NULLS LAST, period_start DESC""",
    """    WHERE board_id = p_board_id
      AND receiver_player_id IS NOT NULL
      AND receiver_player_id <> ''
      AND (v_club IS NULL OR club_code = v_club)
    ORDER BY receiver_player_id, occurred_at DESC NULLS LAST, period_start DESC""",
)
list_sql = list_sql.replace(
    """      AND t.receiver_player_id <> v_mkt
    GROUP BY t.receiver_player_id""",
    """      AND t.receiver_player_id <> v_mkt
      AND (v_club IS NULL OR t.club_code = v_club)
    GROUP BY t.receiver_player_id""",
)
list_sql = list_sql.replace(
    """    FROM enriched
    WHERE (""",
    """    FROM enriched
    WHERE (
      v_club IS NULL
      OR last_rake_period_start IS NOT NULL
      OR coalesce(incentivo_enviado, 0) <> 0
    )
    AND (""",
)
parts.append(
    "DROP FUNCTION IF EXISTS public.crm_list_players(text, text, text, text, integer, integer, text, text);\n"
    + list_sql
)

hot = (root / "supabase/migrations/20260921180000_fix_player360_incentive_history_detection.sql").read_text(encoding="utf-8")
hot = hot.replace(
    """            'weeklyRake', weekly_rake,
            'hands', hands,""",
    """            'weeklyRake', weekly_rake,
            'clubCode', club_code,
            'hands', hands,""",
)
hot = hot.replace(
    """            'senderPlayerId', t.sender_player_id,
            'isBonus', t.is_bonus,""",
    """            'senderPlayerId', t.sender_player_id,
            'senderNickname', t.sender_nickname,
            'receiverNickname', t.receiver_nickname,
            'sxType', t.sx_type,
            'clubCode', t.club_code,
            'clubName', t.club_name,
            'isBonus', t.is_bonus,""",
)
parts.append(hot[hot.find("CREATE OR REPLACE FUNCTION public.crm_get_player_360") :])

facts = (root / "supabase/migrations/20260918171312_crm_segments_pipelines.sql").read_text(encoding="utf-8")
start = facts.find("CREATE OR REPLACE FUNCTION public.crm_player_segment_facts")
end = facts.find("REVOKE ALL ON FUNCTION public.crm_player_segment_facts")
chunk = facts[start:end]
old = """      coalesce(cp.accumulated_rake, 0)::numeric AS accumulated_rake
    FROM public.campaign_players cp
    WHERE cp.board_id = p_board_id"""
new = """      coalesce(pr.period_rake, cp.accumulated_rake, 0)::numeric AS accumulated_rake
    FROM public.campaign_players cp
    LEFT JOIN (
      SELECT player_id, sum(weekly_rake)::numeric AS period_rake
      FROM public.campaign_player_periods
      WHERE board_id = p_board_id
      GROUP BY player_id
    ) pr ON pr.player_id = cp.player_id
    WHERE cp.board_id = p_board_id"""
if old not in chunk:
    raise SystemExit("facts CTE pattern not found")
parts.append(chunk.replace(old, new))
parts.append(
    """
REVOKE ALL ON FUNCTION public.crm_player_segment_facts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_player_segment_facts(text) TO authenticated;
"""
)
parts.append(Path(root / "scripts" / "_preview_club.sql").read_text(encoding="utf-8"))

dest = root / "supabase/migrations/20260922120000_club_dimension_xtreme_prep.sql"
dest.write_text("\n".join(parts), encoding="utf-8")
print("wrote", dest, dest.stat().st_size)
