-- Rake conflict/unique: period + club + slot_name (não só período).
ALTER TABLE public.campaign_agent_periods
  ADD COLUMN IF NOT EXISTS slot_name text;

ALTER TABLE public.campaign_agent_periods
  ADD COLUMN IF NOT EXISTS slot_key text
  GENERATED ALWAYS AS (coalesce(nullif(btrim(slot_name), ''), '')) STORED;

DROP INDEX IF EXISTS public.campaign_agent_periods_natural_club_uid;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_agent_periods_natural_club_slot_uid
  ON public.campaign_agent_periods (
    board_id,
    agent_id,
    period_start,
    period_end,
    club_key,
    slot_key
  );

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
    reconciliation_diff, club_code, slot_name, created_at
  )
  select
    x.id, x.board_id, x.import_id, x.agent_id, x.agent_name, x.period_start, x.period_end,
    x.weekly_rake, x.gains, x.hands, x.players_rake_sum, x.unique_players,
    x.reconciliation_diff, x.club_code, x.slot_name, x.created_at
  from jsonb_to_recordset(coalesce(p_agent_periods, '[]'::jsonb)) as x(
    id text, board_id text, import_id text, agent_id text, agent_name text,
    period_start date, period_end date, weekly_rake numeric, gains numeric,
    hands integer, players_rake_sum numeric, unique_players integer,
    reconciliation_diff numeric, club_code text, slot_name text, created_at timestamptz
  );

  insert into campaign_player_periods (
    id, board_id, import_id, agent_id, player_id, player_name, nickname,
    period_start, period_end, weekly_rake, gains, hands, club_code, created_at
  )
  select
    x.id, x.board_id, x.import_id, x.agent_id, x.player_id, x.player_name, x.nickname,
    x.period_start, x.period_end, x.weekly_rake, x.gains, x.hands, x.club_code, x.created_at
  from jsonb_to_recordset(coalesce(p_player_periods, '[]'::jsonb)) as x(
    id text, board_id text, import_id text, agent_id text, player_id text,
    player_name text, nickname text, period_start date, period_end date,
    weekly_rake numeric, gains numeric, hands integer, club_code text, created_at timestamptz
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
