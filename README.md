# B2C TEAM — Kanban

Quadro interno (Vue 3 + TypeScript + Vite + Pinia + Tailwind) com backend **Supabase**.

## Setup

1. Copie `.env.example` para `.env` e preencha URL + anon key do projeto Supabase (`sxb2c`).
2. No Dashboard do Supabase → **Authentication → Providers → Email**, desative **Confirm email** (para o time criar conta e entrar na hora).
3. Instale e rode:

```bash
npm install
npm run dev
```

4. Abra o app, **crie uma conta** e entre. O quadro, notas e tarefas diárias já vêm seedados no projeto.

## Fase 5 (Supabase)

- Auth (e-mail/senha) + tela de login
- Schema: boards, columns, cards, labels, members, comments, attachments, notes, daily_entries, profiles
- RLS: usuários autenticados (time interno)
- Storage: bucket `card-attachments`
- Realtime nos dados do quadro / notas / tarefas
- Persistência nas stores (sem mocks em runtime)

## Próxima etapa

- **Fase 6:** exportar card concluído para Google Sheets
