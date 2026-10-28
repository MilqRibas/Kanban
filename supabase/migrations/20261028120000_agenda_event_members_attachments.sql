-- Agenda: membros e anexos (imagens/arquivos) como no quadro

ALTER TABLE public.team_agenda_events
  ADD COLUMN IF NOT EXISTS member_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.team_agenda_events.member_ids IS
  'IDs de membros do board atribuídos ao item da agenda';
COMMENT ON COLUMN public.team_agenda_events.attachments IS
  'Anexos [{id,name,url,mimeType,sizeBytes,createdAt,kind}]';
