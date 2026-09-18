# Supabase migrations (CRM+)

## Estratégia

- A partir da Etapa 1 do CRM, **novas** alterações de schema/RPC vão em `supabase/migrations/` com timestamp `YYYYMMDDHHMMSS_nome.sql`.
- Não recriamos o banco legado nesta pasta (o histórico remoto já existe via Dashboard/MCP).
- Migrations devem ser **aditivas** e não-destrutivas (sem DROP de tabelas/dados de produção).
- Preferir `CREATE OR REPLACE FUNCTION` / `CREATE INDEX IF NOT EXISTS` / `INSERT … ON CONFLICT`.

## Aplicação

1. Preferencialmente via Supabase MCP `apply_migration` (registra versão no projeto remoto).
2. Alternativa: SQL Editor / `supabase db push` quando o CLI estiver linkado.

## Tipos TypeScript

`database.types.ts` completo depende de `supabase gen types` com credenciais do projeto.
Se indisponível, tipar apenas o domínio CRM em `src/types/crm.ts` (como nesta etapa).
