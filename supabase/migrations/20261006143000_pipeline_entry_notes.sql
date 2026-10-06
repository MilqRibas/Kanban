ALTER TABLE public.crm_pipeline_entries
  ADD COLUMN IF NOT EXISTS notes text;
