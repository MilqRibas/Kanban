# DEVOLUTIVA — CONSOLIDAÇÃO B2C PARA TESTES DE USABILIDADE

## 1. Resumo executivo

Entrega de consolidação funcional para testes de usabilidade no localhost / Supabase `sxb2c` (`gkyrsdciednwopqomqkp`), board `board-1`.

Fechados nesta rodada:

- regra definitiva de incentivos (MKT GT **OU** Bônus, dedupe);
- economia de Campanhas com **taxa da liga 18%** (recuperação/payback oficiais em rake líquido);
- navegação Campanhas → Segmentações → CRM → BI;
- módulo Segmentações (builder AND/OR + preview server-side);
- CRM centrado em Pipelines (etapas personalizáveis, DnD, histórico, sync explícito da segmentação);
- BI operacional = consulta Limite/Enviado/Disponível;
- Player 360º transversal (já provido em `App.vue`).

**Estado final: PRONTO PARA TESTES DE USABILIDADE.**

## 2. Arquitetura final do produto

```
Campanhas (ecossistema B2C)
├── Campanhas     → quanto investimos e qual retorno (líquido)
├── Segmentações  → quais jogadores queremos trabalhar (regra dinâmica)
├── CRM           → o que estamos fazendo (pipelines + base Jogadores)
└── BI            → Limite / Enviado / Disponível por Player ID

Player 360º       → detalhamento universal (transversal a todos)
```

Separação técnica preservada: stores `campaigns` / `crm` / `crmSegments` distintos; sem god-store.

## 3. Fechamento Incentivos

Identidade canônica: **Player ID `1092502`** (MKT GT).

```
isIncentive = sender_player_id == '1092502' OR is_bonus == true
```

Economia (fonte única `crmIncentiveEconomics` + RPCs CRM):

| Métrica | Fórmula |
|--------|---------|
| Rake bruto | fato importado |
| Taxa liga | 18% |
| Rake líquido | bruto × 0,82 |
| Limite | líquido × 0,25 |
| Enviado | Σ incentivos (OR, dedupe) |
| Disponível | Limite − Enviado (pode ser negativo) |

## 4. XLSX / Sender / MKT GT

XLSX reais **possuem** `Sender player ID` / `Sender player nickname`.

Causa histórica de NULL no banco: parser legado não mapeava Sender (não ausência no arquivo).

Recovery Etapa 2 (samples 13-08): **2545** linhas com Sender; **179** MKT GT (R$ 3.587).

Estado atual `board-1` (`campaign_transactions`):

| Métrica | Valor |
|--------|------:|
| Com Sender | 2545 |
| Sem Sender (outros imports) | 4648 |
| MKT GT (1092502) | 179 |
| Bônus | 721 |
| Incentive OR (MKT ∨ Bônus) | 721 |
| MKT ∧ Bônus (mesma TX) | 179 |
| Σ \|amount\| incentivo OR | R$ 8.275 |

## 5. Regra Bônus

Campo real: `is_bonus` / SX tipo = `Bônus`.

Bônus **não** falsifica Sender: se Sender ≠ 1092502 e `is_bonus`, a TX entra no Enviado com Sender original intacto.

## 6. Deduplicação

Identidade financeira: `(board_id, external_transaction_id)`.

TX que é MKT GT **e** Bônus conta **uma vez**. Nos samples 13-08, as 179 MKT GT também são Bônus → OR não dobra.

## 7. Backfill de incentivos

Herdado da Etapa 2 (`crm_backfill_incentive_classifications`):

- 1ª incentivo cronológico → ATIVAÇÃO;
- posteriores → PENDENTE;
- não sobrescreve classificação manual.

Números reais board-1: ver seção 4 (721 incentivos OR; 179 MKT∩Bônus).

## 8. Nova economia de Campanhas

Módulo `campaignEconomics.ts` (+ weekly metrics / payback timing):

- preserva rake **bruto** importado;
- aplica transformação econômica 18%;
- recuperação e payback oficiais = **líquidos**.

## 9. Taxa da Liga

Constante única: `LEAGUE_FEE_RATE = 0.18` em `crmIncentiveEconomics` (reexportada por Campanhas).

UI Campanhas exibe: Rake Bruto, Taxa da Liga (18%), Rake Líquido.

## 10. Recuperação líquida

`Recuperação = Rake Líquido ÷ (Investimento + Ativação)`

Exemplo controlado: Inv. 1.000 + Ativ. 200; Bruto 1.300 → Líquido 1.066 → **88,83%**.

## 11. Payback líquido

Payback quando Σ rake líquido ≥ Investimento + Ativação.

Projeção / dias esperados usam ritmo de rake **líquido**.

Exemplo: custo 1.200; bruto 1.300 → líquido 1.066 → **ainda não pago**.  
Bruto ≈ 1.463,41 (líquido 1.200) → payback na 1ª semana.

## 12. Impacto nas campanhas históricas

Mudança **autorizada** de regra. Comparação controlada:

| | Antes (bruto) | Depois (líquido) |
|--|--------------:|-----------------:|
| Rake | 1.300 | 1.066 |
| Custo | 1.200 | 1.200 |
| Recuperação | 108,33% | **88,83%** |
| Payback | atingido | **não atingido** |

Fatos preservados: rake bruto, investimento, ativação, jogadores, ativos, depósitos, coorte.

## 13. Segmentações

- Lista + busca + criar/editar/duplicar/excluir;
- builder grupos + condições (E/OU);
- definição JSON persistida (`crm_segment_definitions`);
- população **dinâmica** (não lista milhares de IDs);
- preview via `crm_preview_segment` (smoke: 35 jogadores com Disponível > 50).

## 14. Campos disponíveis para segmentação

Inventário sustentado pelos fatos atuais (`crm_player_segment_facts`):

**Identidade:** player_id, name, nickname  
**Origem:** agent_id, has_campaign, campaign_ids  
**Rake:** accumulated_rake, rake_7d/30d/60d/90d, days_since_last_rake  
**Incentivo:** incentive_limit, incentive_sent, incentive_available, incentive_count, ever_received_incentive  

Não expostos (dado insuficiente nesta base): Cash/MTT/OFC/SNG como filtros dedicados no builder; data de aquisição granular além de campanha.

## 15. Motor AND/OR

- Dentro do grupo: `logic` and|or  
- Entre grupos: `groupLogic` and|or  
- Avaliação server-side: `crm_eval_segment_condition` + `crm_player_matches_segment`

## 16. Preview/amostra

RPC `crm_preview_segment(board, definition, sample_limit)` → `{ count, sample[] }`.  
UI debounced (~600 ms) no builder.

## 17. Pipelines CRM

Tabelas: `crm_pipelines`, `crm_pipeline_stages`, `crm_pipeline_entries`, `crm_pipeline_events`.

CRM UI: aba **Pipelines** (default) + **Jogadores** (base auxiliar).

## 18. Etapas personalizáveis

Criar / renomear / reordenar / remover (bloqueia remoção com jogadores ativos na etapa).

## 19. Entrada de jogadores

Ação explícita **“Atualizar da segmentação”** (`syncPipelineFromSegment`):

- adiciona elegíveis novos na 1ª etapa;
- marca `still_matches_segment=false` quem saiu da regra;
- **não remove** cards/histórico.

## 20. Histórico de movimentações

`crm_pipeline_events`: entered, stage_moved (+ actor, from/to, occurred_at, meta).

## 21. Relação Segmentação x Pipeline

Entidades distintas; `pipelines.segment_id` FK opcional.  
Uma segmentação pode originar várias pipelines; sync não apaga trabalho operacional.

## 22. Player 360º

Painel global (`providePlayer360` + `Player360Panel`).  
Aberto a partir de Jogadores, BI, cards de pipeline (e campanhas quando aplicável).  
Conteúdo: identidade, rake, incentivos, TX, campanhas, freshness, classificação.

## 23. BI operacional

`CrmBiView`: busca Player ID/nick/nome; colunas Rake / Limite / Enviado / Disponível; mesma fonte `crm_list_players` do CRM.

## 24. Navegação final

Área Campanhas: tabs **Campanhas | Segmentações | CRM | BI**.

## 25. Banco de dados

Migration: `supabase/migrations/20260918171312_crm_segments_pipelines.sql` (+ `crm_list_segment_players` aplicada).

| Objeto | Tipo |
|--------|------|
| crm_segment_definitions | tabela + RLS |
| crm_pipelines | tabela + RLS |
| crm_pipeline_stages | tabela + RLS |
| crm_pipeline_entries | tabela + RLS |
| crm_pipeline_events | tabela + RLS |
| crm_player_segment_facts | RPC |
| crm_eval_segment_condition | RPC |
| crm_player_matches_segment | RPC |
| crm_preview_segment | RPC |
| crm_list_segment_players | RPC |

Índices por board_id / pipeline / player. RLS: authenticated full access (padrão do projeto).

## 26. Arquivos criados

Stack ativo (único, pós-consolidação de paralelo):

- `src/types/segments.ts` / `src/types/pipelines.ts`
- `src/utils/segmentDefinition.ts` (+ test)
- `src/services/segmentsApi.ts` / `src/services/pipelinesApi.ts`
- `src/stores/segments.ts` / `src/stores/pipelines.ts`
- `src/components/segments/SegmentsView.vue` / `SegmentBuilder.vue`
- `src/components/crm/CrmPipelinesView.vue` / `CrmBiView.vue`
- `src/utils/crmUsabilityConsolidation.test.ts`
- `src/utils/campaignLiquidEconomics.usability.test.ts`
- `supabase/migrations/20260918171312_crm_segments_pipelines.sql`
- `docs/DEVOLUTIVA_TESTES_USABILIDADE_B2C.md`
- `docs/CHECKLIST_TESTE_USABILIDADE_B2C.md`

## 27. Arquivos modificados

- `src/components/CampaignsView.vue` — nav Campanhas|Segmentações|CRM|BI
- `src/components/crm/CrmView.vue` — Base de Jogadores (auxiliar; pipelines em CrmPipelinesView)
- `src/utils/campaignEconomics.ts` (+ weekly/payback) — líquido
- componentes Campanhas (KPIs/details) — taxa/líquido
- parser/incentivos (Etapa 2, já no branch)

Stack paralelo `crmSegments*` / `crm/SegmentsView` removido para evitar duplicidade.

## 28. Testes automatizados

```
npx vitest run
npx vue-tsc --noEmit
```

Resultado: **131 passed**, 1 skipped; **vue-tsc OK**.

## 29. Testes de incentivos

| Caso | Resultado |
|------|-----------|
| A MKT GT | PASSOU |
| B Outro + Bônus | PASSOU |
| C MKT + Bônus (1×) | PASSOU |
| D 20+30+40 = 90 | PASSOU (suite economia) |
| E Outro não-bônus | PASSOU |
| F 1ª → Ativação | PASSOU (Etapa 2 / backfill) |
| G 2ª → Pendente | PASSOU |
| H Disponível negativo | PASSOU |

## 30. Testes econômicos de Campanhas

| Caso | Resultado |
|------|-----------|
| Taxa 234 / Líquido 1066 / Rec 88,83% | PASSOU |
| Payback ainda não (bruto 1300) | PASSOU |
| Payback no cruzamento líquido | PASSOU |

## 31. Testes de Segmentação

| Caso | Resultado |
|------|-----------|
| Definição + campos inventariados | PASSOU (unit) |
| Preview RPC server-side | PASSOU (smoke SQL count=35) |
| AND/OR / UI builder | PARCIAL — validar manualmente no checklist |
| Duplicar/excluir | PARCIAL — UI pronta; validar manual |

## 32. Testes de Pipeline

| Caso | Resultado |
|------|-----------|
| Schema + CRUD API | PASSOU (estrutura) |
| Sync segmentação / histórico / DnD | PARCIAL — validar manualmente |
| Jogador fora da segmentação permanece | Implementado (`still_matches_segment`) — validar manual |

## 33. Testes dos fluxos de usabilidade

| Fluxo | Status |
|-------|--------|
| 1 Campanha líquida | PASSOU (código + unit); UI manual |
| 2 Segmentação criar/preview/salvar | PARCIAL (RPC OK; UI manual) |
| 3 Pipeline a partir de segmentação | PARCIAL (API OK; UI manual) |
| 4 Mover card + reload | PARCIAL (persistência implementada; UI manual) |
| 5 Player 360 | PASSOU (infra existente) |
| 6 BI consulta | PASSOU (infra + view) |

## 34. Regressão

Suite completa vitest (imports, parser Sender, campanhas, CRM incentivos): **verde**.  
Métricas que mudam de propósito: recuperação/payback (líquido).

## 35. Performance

Preview/list segment players: loop SQL sobre facts do board (adequado para usabilidade; monitorar se base crescer muito).  
Listagens CRM/BI paginadas (50). Sem N+1 na UI de lista.

## 36. Segurança

Novas tabelas com RLS authenticated; RPCs `SECURITY INVOKER`; `board_id` filtrado nas queries cliente. Sem ampliação de exposição anônima.

## 37. Divergências do plano

- Filtros de tipo de jogo (Cash/MTT/…) **não** no builder (dados de perfil existem no 360, mas facts de segmentação priorizaram campos sólidos).
- Contagem de jogadores na lista de segmentações não é pré-calculada em batch (calcula no preview/edição).
- Automação background de elegíveis: só ação explícita (conforme escopo).

## 38. Problemas encontrados

- `v-else-if` órfão em CampaignsView após inserção de Segmentações — corrigido.
- Preview RPC dependia de facts alinhados a `campaign_cohort_players` (não `campaign_id` em `campaign_players`) — já na migration.

## 39. Correções feitas durante self-audit

- Aplicação remota das RPCs de segmentação + `crm_list_segment_players`.
- BI placeholder substituído por consulta operacional.
- Nav 4 áreas + CRM Pipelines default.
- Testes de recuperação reescritos para ×0,82.

## 40. Dívida técnica

- ~4,6k TX sem Sender (imports sem XLSX recuperável).
- Preview full-scan facts pode precisar de materialização futura.
- Enriquecimento de cards pipeline reconsulta facts (otimizável).
- Indicador “fora da segmentação” no card ainda depende do último sync.

## 41. Itens propositalmente não implementados

Automação RD / WhatsApp / e-mail / SMS / IA / scoring / Cortesia automática / dashboards analíticos complexos / ROI comportamental.

## 42. Pontos que precisam ser avaliados manualmente no teste de usabilidade

Ver `docs/CHECKLIST_TESTE_USABILIDADE_B2C.md` — em especial: criar segmentação, preview, criar pipeline, arrastar cards, reload, BI search, Player 360 round-trip.

## 43. Estado final

**PRONTO PARA TESTES DE USABILIDADE**
