-- Estado persistido do dashboard de projeção de orçamento (aba Tráfego).
-- Acesso via API Vercel com service role; RLS sem políticas públicas.

create table if not exists public.poker_dashboard_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.poker_dashboard_state enable row level security;
