# B2C TEAM — Kanban

Quadro interno do time **B2C SX Poker** para organizar demandas, rotinas diárias, atas/notas, conteúdos de comunidade e campanhas de aquisição — em um único app autenticado, sincronizado em tempo real.

> Não é um Kanban genérico público: é a **central operacional** do time B2C, com identidade visual SX e dados no Supabase.

---

## Em uma frase

Ferramenta interna do time B2C da SX Poker para sincronizar **demandas (Quadro)**, **rotina do dia (Tarefas)**, **conhecimento (Notas/ATA)**, **conteúdo de comunidade (HUB)** e **campanhas de aquisição**.

---

## Módulos (navegação)

| Aba | Papel | O que resolve |
|-----|--------|----------------|
| **Agenda** | Calendário | Visão mensal dos prazos finais dos cartões do Quadro |
| **Quadro** | Kanban | Demandas em listas, com detalhe rico (membros, etiquetas, datas, checklist, anexos, comentários) |
| **Tarefas** | Rotina diária | Afazeres por membro e data (Diário / Semanal / Mensal), com campanha e listas aninhadas |
| **Notas** | Conhecimento | Anotações rápidas e Atas de reunião (ATA), com markdown e busca |
| **HUB** | Central do time | Produtividade, atalhos do time e calendário de conteúdo da comunidade |
| **Comunidade** | Conteúdo | Atalho direto para o calendário/conteúdos do HUB |
| **Campanhas** | Aquisição | Cadastro, import semanal (XLSX) e acompanhamento (investimento, ativação, rake, payback) |

---

## Funcionalidades

### Quadro — núcleo de demandas

- Criar e arrastar **listas** e **cartões**; arquivar; ordenar por data por coluna
- **Membros** e **etiquetas** coloridas
- **Datas** de início e entrega (badges Hoje / Atrasado / Concluído)
- **Descrição** com markdown leve (negrito, itálico, emojis)
- **Checklist** (várias listas, assignees, datas, reordenar)
- **Anexos** (arquivo até 5 MB ou link)
- **Comentários** com menções `@`, formatação e edição
- **Filtros**: membro, etiqueta, data (atrasadas, hoje, semana, mês, período) e busca textual
- Cartões **arquivados** (acesso de admin)

### Agenda

- Calendário mensal focado em `due date` dos cartões
- Destaque de atrasados vs concluídos

### Tarefas (rotina diária)

- Visões **Diário / Semanal / Mensal**
- Entrada por **membro + data**
- Status: Não realizado · Em andamento · Concluído
- Campo **Campanha** e listas de afazeres
- **Lista de tarefas** (checkbox) e **lista alternante** (estilo Notion)
- Vários membros no mesmo dia

### Notas & Atas

- Separação clara: **Anotação** (ideia/lembrete) vs **ATA** (reunião)
- Template de ATA: pauta, participantes, decisões, próximos passos
- Markdown, emojis e pré-visualização
- Busca por título/corpo; exclusão por autor ou admin

### HUB — Central do time

**Produtividade**

- KPIs e gráfico de tarefas concluídas (dados das Tarefas diárias)
- Filtro Diário / Semanal / Mensal + calendário de período
- Lista de tarefas realizadas no período

**Atalhos**

- Cards do time arrastáveis (link, pasta, nota)
- Favoritar, editar, excluir; pasta **Conteúdo**

**Comunidade / conteúdo**

- Calendário de posts e conteúdos por dia
- Status: Rascunho · Em produção · Pronto · **Não enviado** · Enviado
- Metadados: tipo, objetivo, FDS, comunidade, data de publicação
- Colar / enviar / copiar **imagens** de referência (até 5 MB)

### Campanhas — aquisição B2C

- Visão geral com KPIs, gráficos e filtros
- Cadastro/edição manual de campanhas e vínculo a um Agent ID
- Importação semanal de relatório XLSX (agentes, jogadores, mesas) com substituição atômica do período
- Ativos calculados pelo critério de ativação da campanha (rake > 0, > R$ 0,50, mínimo custom)
- Detalhes com payback, recuperação, saúde do rake e evolução semanal
- Comparativo lado a lado
- Realtime + RLS no Supabase (`campaigns`, `campaign_agents`, `campaign_report_imports`, períodos e detalhes)

---

## Papéis (admin × membro)

| Ação | Admin | Membro |
|------|-------|--------|
| Usar Quadro, Tarefas, Notas, HUB, Campanhas | Sim | Sim |
| Ver cartões arquivados | Sim | Não |
| Remover usuários do time | Sim | Não |
| Apagar comentário/nota de outro | Sim | Não (só o próprio) |
| Arquivar campanhas / excluir de outros | Sim | Não (só as próprias) |

Auth: e-mail/senha via Supabase. Perfis em `profiles` (`is_admin`); membros do quadro em `members`.

---

## Colaboração

- **Realtime** Supabase em cartões, colunas, notas, tarefas diárias, conteúdos, seções do HUB e campanhas
- **Notificações**: menções `@` e atribuições de checklist
- Um board fixo (`board-1`) para o time interno autenticado

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| UI | Vue 3 + TypeScript |
| Estado | Pinia |
| Build | Vite |
| Estilo | Tailwind CSS 4 · tipografia **Inter** |
| Backend | Supabase (Auth, Postgres, Storage, Realtime, RLS) |
| Deploy | Vercel |
| Extras | `vuedraggable`, `marked`, `@lucide/vue`, `xlsx` |

**Storage:** buckets `avatars` e `card-attachments`.

**Tabelas principais:** boards, columns, cards, labels, members, comments, attachments, profiles, notes, daily_entries, notifications, hub sections / community contents, campaigns, campaign_agents, campaign_report_imports, campaign_agent_periods, campaign_player_periods, campaign_table_details, campaign_players.

---

## Setup

1. Copie `.env.example` para `.env` e preencha URL + anon key do projeto Supabase (`sxb2c`).
2. No Dashboard do Supabase → **Authentication → Providers → Email**, desative **Confirm email** (para o time criar conta e entrar na hora).
3. Instale e rode:

```bash
npm install
npm run dev
```

4. Abra o app, **crie uma conta** e entre.

Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

---

## Roadmap

- [x] Fase 5 — Supabase (auth, schema, RLS, storage, realtime)
- [ ] **Fase 6** — exportar card concluído para Google Sheets

---

## Limitações atuais

- Um único board (`board-1`); não é multi-tenant público
- Export Google Sheets ainda não implementado

---

## Repositório

`https://github.com/MilqRibas/Kanban.git`
