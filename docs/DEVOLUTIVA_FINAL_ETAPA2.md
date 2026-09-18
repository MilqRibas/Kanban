# DEVOLUTIVA FINAL — ETAPA 2

## 1. Resumo executivo

A Etapa 2 (CRM + motor de incentivos + MKT GT + Bônus + hierarquia Campanhas) está **operacionalmente fechada** no ambiente localhost / Supabase `sxb2c` (`gkyrsdciednwopqomqkp`), board `board-1`.

Correção central: os XLSX reais **já tinham** `Sender player ID`; o parser legado descartava a coluna. Sender foi recuperado dos 5 relatórios 13-08 (2545 linhas), regra de incentivo passou a **MKT GT OR Bônus** com dedupe por `external_transaction_id`, CRM ficou **dentro** de Campanhas sem acoplar stores, backfill e testes A–L + XLSX real passaram.

**Estado final declarado:** `ETAPA 2 CONCLUÍDA E PRONTA PARA ETAPA 3`  
(sujeito a revisão externa deste MD; **sem push** até autorização).

## 2. Estado final da arquitetura

```
Relatório TX (Campanhas import)
  → campaignTransactionParser (+ Sender + NaN sanitize)
  → commit_campaign_transactions (COALESCE sender)
  → campaign_transactions
  → crm_is_incentive_transaction / RPCs list+360
  → CRM / Player 360º (UI sob Campanhas)
```

Separação técnica preservada: `stores/crm.ts`, `services/crmApi.ts`, `types/crm.ts`, `components/crm/*`, `utils/crmIncentiveEconomics.ts`, RPCs `crm_*`.

## 3. Causa da divergência histórica do Sender

| Pergunta | Resposta |
|----------|----------|
| XLSX tinha Sender? | **Sim** — headers `Sender player ID` / `Sender player nickname` |
| Arquivos verificados | 5× `Relatório de transações suprema 13-08-2026-17-*.xlsx` em `docs/samples/` |
| Por que `sender_player_id` NULL? | Parser legado só persistia colunas mapeadas; Sender não estava no mapa |
| Onde perdeu? | Transformação parser → commit (campo não mapeado) |
| Como corrigido? | Mapear Sender no parser + UPDATE histórico por `external_transaction_id` a partir dos XLSX |

Arquivo **16-09** citado no prompt intermediário **não** estava nos samples entregues; recovery usou os 13-08.

## 4. Evidência dos XLSX reais

Fonte: `docs/samples/parse-all-summary.json` (parser contra XLSX real / sanitizado).

| Arquivo | TX | com Sender | MKT GT (1092502) | $ MKT |
|---------|----|------------|------------------|-------|
| …17-22-15 | 919 | 919 | 48 | 297 |
| …17-23-39 | (ver summary) | =rows | … | … |
| …17-24-20 | … | … | … | … |
| …17-24-49 | … | … | … | … |
| …17-25-16 | … | … | … | … |
| **Total recovery** | | **2545** | **179** | **R$ 3.587** |

Headers reconhecidos incluem: `ID`, `Receiver player ID`, `Sender player ID`, `Sender player nickname`, `SX tipo`, `Agente player ID`, etc.

## 5. Regra definitiva de Incentivo Enviado

```
isIncentive = (sender_player_id = '1092502') OR is_bonus
```

Deduplicação: uma TX conta **uma vez** (`board_id` + `external_transaction_id`).

## 6. Identificação de Bônus

- Campo real: coluna **`SX tipo`** → parser `sxType` / flag `is_bonus`
- Valor observado nos samples: `Bônus`
- Também: `transaction_type` / flags persistidas em `campaign_transactions.is_bonus`

## 7. Deduplicação

Identidade financeira: `external_transaction_id` (unique com board no fluxo de import).

Ex.: MKT GT + Bônus na mesma TX → Enviado = valor único (não 2×). Cobertura: TESTE C/D + dados reais (todas as 179 MKT também são `is_bonus=true` nos 13-08).

## 8. Regra econômica final

1. Rake bruto histórico (confirmado na base)  
2. Taxa liga = 18%  
3. Líquido = bruto − taxa  
4. Limite = 25% do líquido  
5. Enviado = soma única MKT GT OR Bônus  
6. Disponível = Limite − Enviado (pode ser negativo)

## 9. Backfill final

`crm_backfill_incentive_classifications('board-1')` (pós-recovery):

| Métrica | Valor |
|---------|-------|
| TX incentivo (função) | 721 |
| Valor total incentivo | R$ 8.275 |
| Somente MKT GT (não-bônus) | **0** (não existe nos samples 13-08) |
| Somente Bônus | 542 |
| MKT GT + Bônus (mesma TX) | 179 |
| Player IDs únicos (incentivo) | 450 |
| Ativações | 450 |
| Pendentes | 271 |
| Relacionamento | 0 |
| Ação | 0 |
| Sender recuperado (samples) | 2545 |
| MKT GT recuperado | 179 / R$ 3.587 / 138 receivers |
| Arquivos reprocessados | 5 XLSX 13-08 (UPDATE sender; sem re-import duplicado) |
| Limitações | TX de outros imports sem XLSX disponível continuam sem Sender (~4.6k no board) |

Obs.: nos relatórios 13-08, envios MKT GT vêm rotulados como Bônus; `onlyMktGt=0` é fato dos dados, não falha de regra.

## 10. Validação de 5 jogadores reais

| Caso pedido | Status na base | Player exemplo |
|-------------|----------------|----------------|
| 1 — MKT GT não-Bônus | **Inexistente** nos samples/recovered | — |
| 2 — Bônus outro Sender | Existe | `735826` (Dukpit): Enviado 20; Sender 741438 |
| 3 — MKT GT + Bônus mesma TX | Existe (todas as 179) | `1533290` |
| 4 — Múltiplos incentivos | Existe | `1533290` (15 itens no histórico) |
| 5 — Disponível negativo | Existe | `1533290`: Disp. **−246,40** |

### Detalhe econômico (RPC `crm_get_player_360`)

| Player ID | Nick | Rake bruto | Líquido | Limite | Enviado | Disponível |
|-----------|------|------------|---------|--------|---------|------------|
| 1533290 | hardt_luiz | 66,34 | 54,40 | 13,60 | 260 | **−246,40** |
| 1311141 | BSPoker_1981 | 6,75 | 5,54 | 1,38 | 86 | −84,62 |
| 461663 | twist | 138,76 | 113,78 | 28,45 | 131 | −102,55 |
| 735826 | Dukpit | 1,70 | 1,39 | 0,35 | 20 | −19,65 |
| 951327 | Madimboo | 289,85 | 237,68 | 59,42 | 540 | −480,58 |

`1533290` — 1ª ativação: TX `27a21720-…` (MKT GT + Bônus, R$15); demais pendentes.

## 11. Player 360º

RPC `crm_get_player_360` usa `crm_is_incentive_transaction` (OR). Exibe rake, taxa, líquido, limite, enviado, disponível, freshness rake/TX, histórico com `senderPlayerId` + classificação. Aberto pelo CRM e reutilizável por campanha.

## 12. CRM > Jogadores

Listagem via RPC server-side com a **mesma** função de incentivo do 360. Limite / Enviado / Disponível alinhados.

## 13. Nova hierarquia de navegação

`CampaignsView` áreas: **Campanhas | CRM | BI**.  
CRM não é mais tab de primeiro nível em `AppFooter`. `App.vue` redireciona `crm` legado → `campaigns`.

## 14. Separação técnica preservada

Confirmado: CRM **não** foi fundido em `campaigns.ts`. Módulos CRM independentes.

## 15. Imports

- Novos imports: parser grava `sender_player_id`
- Upsert: `sender_player_id = COALESCE(EXCLUDED.sender_player_id, existing)` — preserva Sender conhecido se reimport vier sem coluna
- Sem segundo import CRM; Campanhas continua a porta operacional

## 16. Freshness

Exemplo board (player 1533290): rake e TX atualizados até **2026-09-13** (campo `freshness` do 360).

## 17. Metadata e auditoria

Classificações em metadata de incentivo; backfill **não** sobrescreve classificação manual. Nesta rodada: `insertedMetadata=0` (já populado).

## 18. Banco de dados

Migrations CRM relevantes (entre outras):

- `20260917123000` … foundation Player  
- `2026091715*` … motor incentivo + list/360 + commit sender  
- `20260918120000` … OR MKT/Bônus + backfill  
- `20260918121000` … list/360 OR  

RPCs: `crm_is_incentive_transaction`, `crm_backfill_incentive_classifications`, `crm_get_player_360`, listagem CRM. RLS padrão authenticated mantido.

## 19. Arquivos criados (principais)

- `src/utils/crmIncentiveEconomics.ts` (+ test)  
- `src/stores/crm.ts`, `src/services/crmApi.ts`, `src/types/crm.ts`  
- `src/components/crm/*`  
- `docs/DEVOLUTIVA_FINAL_ETAPA2.md` (este)  
- `docs/samples/*` + scripts de recovery Sender  
- migrations `20260918*`  

## 20. Arquivos modificados (principais)

- `src/utils/campaignTransactionParser.ts` — Sender  
- `src/utils/excelWorkbook.ts` — sanitize NaN (fflate)  
- `src/components/CampaignsView.vue` — hierarquia CRM/BI  
- `src/App.vue`, `AppFooter` / auth conforme nesting  
- `package.json` — dep `fflate`  

## 21. Testes executados

```
npm test          → 110 passed | 1 skipped (12 files + 1 skipped)
npx vue-tsc --noEmit → exit 0
```

## 22. Testes A–L

| Teste | Resultado |
|-------|-----------|
| A MKT não-Bônus R$10 | **PASSOU** (unit) |
| B Bônus outro Sender | **PASSOU** |
| C MKT+Bônus sem duplicar | **PASSOU** |
| D três TX = 90 | **PASSOU** |
| E outro Sender não-Bônus fora | **PASSOU** |
| F 1º Bônus = ativação | **PASSOU** |
| G 1º MKT = ativação | **PASSOU** |
| H 2º = pendente | **PASSOU** |
| I reimport não duplica | **PASSOU** (dedupe por external id) |
| J replace preserva Sender | **PASSOU** (semântica COALESCE documentada/testada) |
| K economia 1000→disp 115 | **PASSOU** |
| L disp negativo | **PASSOU** |

## 23. Validação XLSX real

**PASSOU** — `scripts/parse-all-samples.test.ts` + summary JSON. Headers Sender OK; 1092502 lido; NaN sanitizado.

## 24. Testes de navegação

| Item | Resultado |
|------|-----------|
| Campanhas acessível | **PASSOU** (código + area `campaigns`) |
| CRM dentro de Campanhas | **PASSOU** (`EcosystemArea`) |
| Player 360 pelo CRM | **PASSOU** (componente) |
| 360 por contexto campanha | **PASSOU** (reuso painel) |
| Imports acessíveis | **PASSOU** (área Campanhas intacta) |
| Smoke visual localhost | **PARCIAL** — dev server ativo; checklist manual opcional |

## 25. Regressão Campanhas

Métricas de campanha (jogadores, ativos, rake, investimento, etc.) **não** foram alteradas por esta etapa (mudanças isoladas a parser Sender, CRM, RPCs incentivo). Suite vitest Campanhas/coorte permanece verde. Validação métrica-a-métrica em UI: não reexecutada nesta rodada → **PARCIAL** (sem evidência de regressão nos testes).

## 26. Performance

List/360 server-side; índices CRM existentes; recovery via batches SQL (sem N+1 no backfill). Sem medição de latência p95 nesta rodada.

## 27. Segurança

RLS authenticated mantido; sem exposição de service role no front; board_id filtrado nas RPCs.

## 28. Divergências restantes

1. **CASO 1** (MKT GT sem flag Bônus) **não existe** nos XLSX 13-08 — todos MKT são também Bônus.  
2. ~4,6k TX no board ainda sem Sender (imports sem XLSX disponível para recovery).  
3. Arquivo **16-09** não fornecido no `docs/samples`.  
4. Smoke visual navegação marcado PARCIAL.

## 29. Dívida técnica

- Artefatos temporários em `docs/samples/_sql/` (SQL de recovery) — podem ser arquivados/limpo depois.  
- Nickname do Sender não é coluna dedicada (fica em raw quando presente).  
- Cobertura E2E UI de CRM ainda manual.

## 30. Itens não implementados (Etapa 3 — fora de escopo)

Confirmado **não** feitos: Cortesia sem retorno; ROI pós-incentivo; queda de rake; alertas novos; segmentação; pipelines; BI completo; agente IA; recomendação automática.

## 31. Critérios de aceite finais

| # | Critério | Status |
|---|----------|--------|
| 1 | XLSX real com Sender reconhecido | **PASSOU** |
| 2 | Sender 1092502 entra como incentivo | **PASSOU** |
| 3 | Bônus entra como incentivo | **PASSOU** |
| 4 | MKT+Bônus não duplica | **PASSOU** |
| 5 | Enviado reduz Disponível | **PASSOU** |
| 6 | Histórico recuperável não zerado | **PASSOU** (2545/179) |
| 7 | Reimport não duplica TX | **PASSOU** (identidade + testes) |
| 8 | Metadata não perdida | **PASSOU** |
| 9 | 360 e CRM mesma regra | **PASSOU** |
| 10 | CRM dentro de Campanhas | **PASSOU** |
| 11 | Sem regressão Campanhas | **PARCIAL** (testes OK; smoke UI opcional) |
| 12 | Testes relevantes | **PASSOU** (110) |

## 32. Estado final

**ETAPA 2 CONCLUÍDA E PRONTA PARA ETAPA 3**

Pendências remanescentes **não bloqueantes**: smoke visual opcional; CASO 1 inexistente nos dados; TX sem XLSX original sem Sender; arquivo 16-09 ausente.
