-- Agenda do time (timeline própria — não espelha cartões do quadro)

CREATE TABLE IF NOT EXISTS public.team_agenda_events (
  id text PRIMARY KEY,
  board_id text NOT NULL,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  event_time text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_agenda_events_board_date_idx
  ON public.team_agenda_events (board_id, event_date DESC);

ALTER TABLE public.team_agenda_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated full access team_agenda_events"
    ON public.team_agenda_events FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
