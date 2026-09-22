# Auditoria obrigatória — Motor de Incentivos

**Data:** 2026-09-21  
**Fonte:** XLSX reais em `docs/samples/`, parser `campaignTransactionParser`, base `sxb2c` / `board-1`  
**Critério:** validação independente sobre `campaign_transactions` (não comparar o motor só consigo mesmo)

## Veredito

| Área | Status |
|------|--------|
| Regra OR (1092502 ∨ Bônus) | **PASS** |
| Sem duplicar MKT GT + Bônus | **PASS** |
| Atribuição ao Receiver | **PASS** |
| Valor = Chips Send Out (incentivos) | **PASS** |
| Idempotência `(board_id, external_transaction_id)` | **PASS** |
| Player 360 / BI list / Segmentações (enviado) | **PASS** (Δ R$ 0,00) |
| Consulta explicável (detection / isBonus no 360) | **PASS após hotfix** |
| Dimensão Clube (SX Club / Xtreme Pro) | **FAIL** |
| Sender nick / SX tipo / clube como colunas 1ª classe | **PARCIAL** |
| Sender NULL histórico | **RISCO documentado** |

**Motor financeiro consolidado (sem filtro de clube): validado.**  
**Aceite completo do brief (itens 9 + auditoria rica por clube): não fechado.**

---

## 1. Regra oficial (confirmada no código e no SQL)

```
isIncentive = (sender_player_id = '1092502') OR (is_bonus = true)
```

- TS: `src/utils/crmIncentiveEconomics.ts` → `isIncentiveTransaction`
- SQL: `crm_is_incentive_transaction(sender, is_bonus, mkt_id)`
- Bônus no XLSX: coluna **`SX tipo`** = `Bônus` → parser `classifyTransactionFlags` → `is_bonus`
- MKT GT: **`Sender player ID` = `1092502`** (nickname “MKT GT” só auxiliar)

União: uma TX conta uma vez. Categorias explicativas somam ao mesmo total OR.

---

## 2. Campos reais do XLSX (samples 13-08)

Headers confirmados no parser e em `parse-all-summary.json`:

| XLSX | Uso no motor |
|------|----------------|
| ID | `external_transaction_id` |
| Sender player ID / nickname | incentivo MKT / auditoria |
| Receiver player ID / nickname | dono do incentivo |
| SX tipo | `is_bonus` |
| Origem | depósito (não incentivo) |
| Chips Send Out | valor oficial depósito/bônus |
| Chips Claimback | preservado; não define incentivo |
| Status sistema / Order status | falhas de depósito |
| Agente player ID | agente; **não** define incentivo |
| **Clube / Nome do clube** | **presentes no XLSX; NÃO mapeados no parser** |

Exemplo real (arquivo …17-24-49): Sender `1092502` / nick `MKT GT` / SX tipo `Bônus` / Chips Send Out `15` → conta **uma** vez como `mkt_gt_bonus`.

---

## 3. Fluxo ponta a ponta

```
XLSX → campaignTransactionParser → preview → commit_campaign_transactions
  → campaign_transactions (unique board_id + external_transaction_id)
  → crm_is_incentive_transaction
  → crm_list_players / crm_get_player_360 / crm_player_segment_facts
  → UI CRM / Player 360 / BI / Segmentações
```

Pontos de perda históricos / residuais:

1. **Sender** — parser legado omitia a coluna; recovery parcial via XLSX 13-08. Ainda há **4648** TX com `sender_player_id` NULL sem Sender recuperável no `raw`.
2. **Clube** — colunas existem no relatório; não há coluna nem filtro no motor.
3. **incentiveHistory (360)** — em produção estava sem `isBonus`/`detection` (migration OR não refletida na função live). **Corrigido** em `20260921180000_fix_player360_incentive_history_detection`.

Nada indica atribuição ao Sender nem soma dupla MKT+Bônus no agregado oficial.

---

## 4. Validação independente (base real)

Definição independente (SQL):

```sql
(sender_player_id = '1092502' OR coalesce(is_bonus,false))
```

| Métrica | Valor |
|---------|-------|
| TX totais | 8.012 |
| Universo incentivo (OR) | 843 TX / **R$ 9.385,00** |
| MKT GT somente | 0 TX / R$ 0 (todas as MKT também são Bônus neste dataset) |
| Bônus não-MKT GT | 544 / R$ 4.718,00 |
| MKT GT + Bônus | 299 / R$ 4.667,00 |
| Soma categorias − OR | **R$ 0,00** |
| `amount` ≠ `abs(chips_send_out)` nos incentivos | **0** |
| Unique `(board_id, external_transaction_id)` | presente |

Vs motor oficial:

| Superfície | Comparação | Δ |
|------------|------------|---|
| `crm_is_incentive_transaction` vs predicado independente | 843 = 843 | 0 |
| `crm_get_player_360` top receivers | 5/5 | R$ 0,00 |
| `crm_list_players` top 20 | 20/20 | R$ 0,00 |
| `crm_player_segment_facts.incentive_sent` | 5/5 | R$ 0,00 |

### Casos reais (amostra)

| Caso | Evidência | Resultado |
|------|-----------|-----------|
| A. MKT GT | 299 TX sender 1092502; todas também `is_bonus` | Contadas via OR; categoria explicativa `mkt_gt_bonus` |
| B. Só Bônus | ex. TX `a0f9c977-…` sender `37729` amount 500 | PASS |
| C. MKT + Bônus | ex. TX `a3012ded-…` 1092502 + Bônus amount 40 | Uma vez; não 80 |
| D. Múltiplos no mesmo player | 951327: 40 + 500 = **540** (360 e indep) | PASS |
| E. Clube cruzado | Sem dimensão de clube na TX | **FAIL / N/A** |
| F. Reimport / replace | Unique + UPSERT com `COALESCE(sender)` | PASS estrutural |

---

## 5. Inconsistências abertas (não mascaradas)

1. **Clube não é dimensão do incentivo**  
   XLSX traz `Clube` / `Nome do clube` (ex. SX Club). Parser não mapeia; `campaign_transactions` não persiste; RPCs não filtram SX Club vs Xtreme Pro vs consolidado.  
   **Impacto:** item 9 do brief não atendido.

2. **4648 senders NULL**  
   Sem Sender no `raw` → não dá para reclassificar MKT “perdido” só com a base. Incentivos atuais ainda entram via `is_bonus` quando o SX tipo foi persistido.

3. **Auditoria rica incompleta**  
   Faltam colunas 1ª classe: sender_nickname, sx_type, club_id/club_name, import de origem no histórico do 360 (parcialmente só em `raw` / metadata).

4. **Categoria “MKT GT somente” vazia neste dataset**  
   Nos samples e na base, envios 1092502 vêm com SX tipo = Bônus. Comportamento coerente com os arquivos; não é bug de OR. Se no futuro existir MKT sem Bônus, a regra OR já cobre.

5. **Migrations obsoletas ainda no repositório (MKT-only)**  
   `20260917152000_crm_incentive_list_360_rpcs.sql` e `20260917154000_crm_incentive_360_sender_field.sql` ainda definem list/360 com `crm_is_mkt_gt_transfer` apenas. Em deploy completo são substituídas por `20260918121000` / `20260918184500`. Ambiente que pare no lote 17-09 reverte silenciosamente para MKT-only. Headers de aviso adicionados nesses arquivos.

6. **Segmentações: fonte de rake diferente**  
   `crm_player_segment_facts` usa `campaign_players.accumulated_rake` (cache master); CRM/BI/360 somam `campaign_player_periods.weekly_rake`. O predicado OR do Enviado é o mesmo; Limite/Disponível podem divergir se `rebuildMasterTotals` não rodar após mutações.

---

## 6. Hotfix aplicado nesta auditoria

- Migration: `supabase/migrations/20260921180000_fix_player360_incentive_history_detection.sql`
- Efeito: `incentiveHistory` volta a expor `isBonus` + `detection` (`mkt_gt` | `bonus` | `mkt_gt_bonus`)
- Verificado em player `951327`: detections `mkt_gt_bonus` e `bonus`

---

## 7. Critério de aceite (checklist)

| Critério | Status |
|----------|--------|
| Sender 1092502 reconhecido | PASS |
| Bônus reconhecido (SX tipo) | PASS |
| OR funciona | PASS |
| MKT GT + Bônus não duplica | PASS |
| Receiver recebe o valor | PASS |
| Valores (Chips Send Out) | PASS |
| Reimport idempotente (unique) | PASS estrutural |
| Replace / COALESCE sender | PASS estrutural |
| SX Club filtro | **FAIL** |
| Xtreme Pro filtro | **FAIL** |
| Consolidado (sem clube) | PASS |
| Player 360 regra correta | PASS |
| BI / list regra correta | PASS |
| CRM / segmentações mesma fonte | PASS |
| Casos reais base | PASS (exceto clube) |

---

## 8. Próximo trabalho necessário (sem paliativo)

1. Mapear `Clube` / `Nome do clube` no parser e persistir em `campaign_transactions`.
2. Estender RPCs com filtro `club` (`sx_club` | `xtreme_pro` | `all`) na mesma função de soma OR.
3. Backfill a partir de `raw->>'col:Nome do clube'` onde existir; reimport dos XLSX para o restante.
4. Alinhar `crm_player_segment_facts` ao rake de `campaign_player_periods` (ou trigger de sync do master).
5. Opcional: colunas `sender_nickname`, `sx_type` para auditoria sem depender só do JSON `raw`.
6. Teste de integração Postgres (seed MKT / Bônus / ambos / fora) contra `crm_list_players`.
