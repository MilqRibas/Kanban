# DEVOLUTIVA — PREPARAÇÃO XTREME PRO

## 1. Resumo executivo

O sistema está preparado para receber a primeira importação real do Xtreme Pro pelo mesmo parser e pelo mesmo importador já usados no SX Club. Clube é dimensão da atividade (`sx_club` ou `xtreme_pro`). Player ID continua global.

Nenhum XLSX Xtreme foi importado. Nenhum registro Xtreme foi inventado. A base real continua só com SX, e parte desse histórico ainda não tem clube persistido.

## 2. Estado atual da base

Xtreme Pro ainda não possui XLSX real importado.

Contagem em `campaign_transactions` do board `board-1` depois do backfill:

| Situação | Transações |
| --- | ---: |
| Total | 8012 |
| `club_code = sx_club` | 819 |
| `club_code = xtreme_pro` | 0 |
| Clube ainda nulo | 7193 |
| `sender_player_id` nulo | 4648 |
| `sx_type` preenchido | 8012 |
| `sender_nickname` preenchido | 819 |

Períodos de rake (`campaign_player_periods`): 2622 linhas, todas com `club_code` nulo. Não havia coluna de clube no relatório de agentes já importado, então esses períodos não foram carimbados.

Lista CRM em Todos: 948 jogadores. Filtro Xtreme Pro: 0. Filtro SX Club: 107 jogadores que têm transação com clube SX persistido. O filtro SX não reproduz o rake histórico enquanto os períodos continuarem sem clube.

## 3. Modelo de Clube

Códigos canônicos, centralizados em `src/utils/clubDimension.ts`:

- `sx_club` — SX Club
- `xtreme_pro` — Xtreme Pro
- `all` — Todos / consolidado, sem predicado de clube

A coluna numérica `Clube` (valor `57906` nos XLSX SX) não vira código. Só o nome `Nome do clube` resolve o código, e apenas para os dois nomes desta fase.

Não há CRUD de clubes, onboarding, permissão por clube nem regra para um terceiro clube.

## 4. Player ID global

Jogador continua identificado por `(board_id, player_id)`. O mesmo Player ID no Xtreme e no SX é o mesmo jogador. Clube não entra na chave de `campaign_players`.

## 5. Contrato compartilhado dos XLSX

Os dois relatórios futuros do Xtreme usam o schema atual do SX:

- agentes / rake;
- transações.

Não existe parser Xtreme. Não existe importador Xtreme.

## 6. Parser relatório de agentes

`campaignReportParser` segue o mesmo. Se a planilha tiver `Nome do clube` / `Club name` e todas as linhas resolverem o mesmo código, `fileClubCode` fica preenchido. O relatório SX atual não tem essa coluna, então `fileClubCode` fica nulo.

Na gravação, o código do arquivo prevalece sobre o seletor do modal. Sem coluna, vale o seletor (padrão `sx_club`).

## 7. Parser relatório de transações

O mesmo `campaignTransactionParser` lê `Nome do clube`. Cada linha ganha `clubCode` e `clubName`. A coluna `Clube` numérica permanece só no `raw`.

Na gravação, o clube da linha prevalece. Se a linha não resolver, usa o seletor do import.

## 8. Persistência de Clube no rake

`club_code` em:

- `campaign_agent_periods`
- `campaign_player_periods`
- `campaign_table_details`

A chave única passou a incluir `club_key` (`coalesce(club_code, '')`):

- jogador: `(board_id, agent_id, player_id, period_start, period_end, club_key)`
- agente: `(board_id, agent_id, period_start, period_end, club_key)`

Histórico nulo continua único. Um período Xtreme futuro não sobrescreve o período SX da mesma semana. Reimport SX pode preencher nulo com `sx_club`. Um arquivo Xtreme insere outra linha, em vez de reetiquetar o histórico SX.

## 9. Persistência de Clube nas transações

`campaign_transactions` ganhou `club_code`, `club_name`, `sender_nickname`, `sx_type`.

Conflito em `(board_id, external_transaction_id)`:

- enriquece clube, nome do clube, apelido do sender, `sx_type` e sender quando o novo valor existe e o antigo está nulo;
- não apaga sender, apelido, clube ou `sx_type` já preenchidos com um nulo novo;
- não duplica a transação;
- metadata de classificação continua por `external_transaction_id`;
- o valor financeiro continua o comportamento de replace já existente.

## 10. Backfill SX realizado

Só evidência determinística do `raw`:

- `raw->>'col:Nome do clube' = 'SX Club'` → `club_code = sx_club`, `club_name = SX Club`
- apelido do sender a partir das chaves de sender nickname no raw
- `sx_type` a partir de `raw->>'col:SX tipo'`

819 transações receberam SX Club. Zero receberam Xtreme.

## 11. Registros sem clube identificado

7193 transações continuam com clube nulo: o raw dessas linhas não tem `Nome do clube`.

2622 períodos de jogador e os períodos de agente correspondentes continuam sem clube. O XLSX de rake já importado não traz a coluna. Para carimbar esse rake como SX é preciso reimportar os relatórios de agentes com o seletor em SX Club. Isso não foi feito nesta execução.

## 12. Confirmação de ausência de backfill fictício Xtreme

`club_code = xtreme_pro` está em zero transações e zero períodos. Agência não foi usada como proxy. Nenhum jogador foi classificado como Xtreme por inferência. `crm_club_cases` não recebeu linha semeada.

## 13. Motor de Incentivos

Regra inalterada, nos dois clubes:

`sender_player_id = 1092502` OU `is_bonus = true`.

MKT GT + Bônus conta uma vez. O incentivado é o Receiver. O valor é Chips Send Out. Deduplicação por `(board_id, external_transaction_id)`.

`crm_is_incentive_transaction` no banco remoto contém a condição de bônus.

## 14. Incentivos por Clube

`crm_list_players` aceita `p_club`. Todos não filtra clube e preserva o total atual. SX Club e Xtreme Pro somam só transações daquele `club_code`.

Xtreme Pro na base real retorna 0 jogadores. Não foi criada linha zerada por jogador.

## 15. Fonte canônica de rake

CRM, BI, Player 360 e Segmentações usam a soma de `campaign_player_periods.weekly_rake`.

`crm_player_segment_facts` deixou de usar só `campaign_players.accumulated_rake`. No consolidado, a soma dos períodos prevalece, com fallback no rake mestre só quando o jogador não tem período. Na base atual, nenhum jogador tem rake mestre sem período (`master_only_rake = 0`).

Oito jogadores reais de maior rake (entre eles `763715`, `316367`, `1415518`) fecharam com o mesmo rake, enviado e disponível em facts, Player 360 e lista. Δ R$ 0,00 no contexto Todos.

## 16. Limite por Clube

Limite = rake bruto do contexto × 0,82 × 0,25.

No filtro de um clube, o rake mestre não entra. Período sem `club_code` não entra no filtro SX nem no Xtreme. Por isso o filtro SX, hoje, não mostra o rake histórico.

## 17. Disponível por Clube

Disponível = limite − incentivo enviado daquele contexto. Negativo é permitido.

No consolidado, enviado e rake são a união, sem somar duas vezes a mesma transação.

## 18. Cross-club

Não há matching de identidade. A leitura é por Player ID.

`crossClubActivity` agrupa períodos por clube e calcula primeira atividade, última atividade e rake de cada um, mais o rake consolidado. Validado com fixture, não com base Xtreme.

## 19. Última atividade global

`last_global_activity` é o máximo entre a última atividade SX e a última Xtreme. O alerta existente já agrupa por Player ID e usa a semana mais recente do conjunto de períodos. Passar os dois clubes no mesmo conjunto faz a atividade mais nova valer para o alerta global.

## 20. Alertas

Fixtures, sem dado real Xtreme:

- Xtreme antigo + SX recente: sem alerta global;
- SX antigo + Xtreme recente: sem alerta global;
- os dois antigos: o alerta global existente pode disparar.

Não foi criado alerta novo.

## 21. Xtreme Pro em Campanhas

A visão geral de Campanhas mantém a granularidade atual do SX. Acima dos cards há o painel do case Xtreme Pro: um agregado, não uma campanha por agência.

Sem importação, o painel mostra estado vazio e zeros. Não inventa rake.

## 22. Consolidação de agências

`crm_xtreme_case_summary` devolve as agências do fato (`club_code = xtreme_pro`) e os totais. A análise principal usa o rótulo XTREME PRO. A linha de agência não é apagada.

Jogadores e ativos do painel são distintos no clube. O helper de teste `consolidateXtremeCase` soma as contagens por agência de propósito, para o fixture A+B+C; isso pode contar duas vezes um jogador que apareça em duas agências. O painel ao vivo não usa essa soma para jogadores.

## 23. Investimento total

Tabela `crm_club_cases` (`board_id`, `club_code`, `investment`, `activation_cost`, `notes`). O painel grava um investimento total e uma ativação para `xtreme_pro`. Não há investimento por agência.

Custo total = investimento + ativação.

## 24. Rake bruto/líquido

Rake bruto = soma de `weekly_rake` dos períodos `xtreme_pro`.

Taxa da liga = 18%.

Rake líquido = bruto × 0,82.

## 25. Recuperação/payback

Recuperação = rake líquido / (investimento + ativação).

Payback quando rake líquido acumulado ≥ custo total, e o custo é maior que zero. Rake bruto não declara payback. Custo zero não é tratado como payback atingido.

## 26. Segmentações

Prévia com filtro: Todos, SX Club, Xtreme Pro, somente SX, somente Xtreme, nos dois clubes.

SX Club e Xtreme Pro recalculam rake, limite, enviado e disponível naquele clube. Somente / nos dois usam a economia consolidada e filtram a presença. Pipelines continuam na prévia consolidada, sem filtro de clube, para não duplicar card.

Prévia Xtreme Pro na base real: 0 membros. Nos dois clubes permanece vazio até existir atividade Xtreme.

## 27. CRM

Filtro Todos / SX Club / Xtreme Pro na lista. O jogador não é duplicado. Pipeline continua por Player ID.

## 28. Player 360

Continua um único 360 por Player ID. A série semanal traz `clubCode`. O histórico de incentivo traz external id, data, clube, sender id, sender nick, receiver nick, SX tipo, valor, detection (`mkt_gt`, `bonus`, `mkt_gt_bonus`) e classificação.

Sem clube, a interface mostra “Clube desconhecido”. Não inventa o nome.

Amostra real: jogador `1006522`, transação `cb228110-3488-4ed3-b659-3df32e01acf3`, clube `sx_club`, detection `mkt_gt_bonus`, sender `1092502` / `MKT GT`.

## 29. BI

O BI usa a mesma lista do CRM, com o mesmo filtro de clube. Xtreme Pro hoje é lista vazia, sem erro.

## 30. Campos de auditoria

Promovidos para coluna: `sender_nickname`, `sx_type`, `club_code`, `club_name`. O cálculo de incentivo não usa apelido.

## 31. Sender NULL histórico

4648 transações seguem com `sender_player_id` nulo. Não foram preenchidas. Agent ID não foi usado como proxy. Sender nulo + bônus continua incentivo. Sender nulo sem bônus não entra. Reimport com sender preenche sem apagar um sender já válido.

## 32. Migration chain

Ordem relevante:

1. `20260917152000_crm_incentive_list_360_rpcs.sql` — MKT-only, cabeçalho de obsoleto.
2. `20260917154000_crm_incentive_360_sender_field.sql` — ainda MKT-only, cabeçalho de obsoleto.
3. `20260918120000_crm_incentive_mkt_or_bonus.sql` — cria `crm_is_incentive_transaction` (MKT GT ou bônus).
4. `20260918121000_crm_incentive_list_360_or_bonus.sql` — lista e 360 passam a usar a regra OR.
5. `20260922120000_club_dimension_xtreme_prep.sql` — substitui lista, 360, facts e preview de novo, sempre pela função OR, e acrescenta clube.

Um banco novo que aplique a pasta em ordem termina na regra OR. Esta execução não subiu um Postgres vazio do zero; a revisão foi a ordem dos arquivos, e o remoto ficou com as funções finais dessa migration. A função remota `crm_is_incentive_transaction` contém bônus.

## 33. Testes com dados SX reais

Na base real, contexto Todos, oito jogadores de maior rake: facts, Player 360 e lista com o mesmo rake, enviado e disponível.

Transação real de incentivo com `Nome do clube` no raw aparece como SX Club no 360.

Xtreme Pro na lista, na prévia de segmentação e no resumo do case: zero. Isso não é validação do Xtreme.

## 34. Fixtures/testes Xtreme

`src/utils/clubPreparation.test.ts`, sem insert na base:

- jogador só SX e só Xtreme no mesmo parser;
- cruzamento de atividade nos dois sentidos;
- inativo nos dois;
- MKT, bônus e MKT+bônus;
- agências A+B+C consolidadas.

49 testes passaram em parser de transações, parser de agentes, economia e preparação de clube.

## 35. Teste do parser compartilhado

O mesmo `parseTransactionWorkbook` leu uma planilha com `Nome do clube = SX Club` e outra com `Nome do clube = Xtreme Pro`, no mesmo header. A diferença obtida foi `sx_club` versus `xtreme_pro`. O id `57906` não virou código.

## 36. Teste cross-club

Fixture do Player 123: rake Xtreme antigo e rake SX recente. Um jogador, os dois históricos, rake somado, última atividade global na semana SX, sem alerta global. O caso invertido também.

## 37. Teste incentivo por clube

Xtreme MKT R$ 20 + bônus R$ 30 = R$ 50. SX MKT+bônus R$ 40. Consolidado R$ 90. Sem segunda contagem da mesma transação.

## 38. Teste rake/limite/disponível por clube

Rake Xtreme 1000 → líquido 820, limite 205. SX 2000 → 1640 e 410. Consolidado 3000 → 2460 e 615. Com enviado 50 e 40, disponível consolidado 525.

## 39. Teste Campanha Xtreme consolidada

Agências A, B e C permanecem no array. O agregado se chama XTREME PRO. Investimento 1000 + ativação 200 = custo 1200. Rake bruto 1500, líquido 1230, recuperação 1230/1200, payback verdadeiro. Payback usa o líquido.

## 40. Regressão SX

A lista Todos continua em 948 jogadores e o incentivo dos jogadores amostrados não mudou em relação ao 360 e às segmentações. Sender nulo permaneceu 4648. Clube Xtreme permaneceu zero.

O filtro SX Club mostra menos jogadores que Todos. Isso é a ausência de clube no rake histórico, não um recálculo da regra de incentivo.

## 41. Performance

As consultas de amostra (lista, 360, facts, resumo Xtreme) responderam na mesma sessão. A prévia de segmentação ainda percorre os fatos em loop. Cabe no volume atual, na casa de mil jogadores. Não houve teste de carga.

## 42. RLS/segurança

`crm_club_cases` tem RLS ligada e política de acesso completo para `authenticated`, no mesmo padrão das tabelas operacionais do board. Não foi criada permissão por clube. As policies existentes de transações e períodos não foram removidas; a migration acrescentou colunas e índices.

## 43. Problemas encontrados

- 7193 transações e todos os períodos de rake sem clube recuperável.
- O seletor do import de rake prevalecia sobre `Nome do clube` quando a coluna existisse. Corrigido: a coluna do arquivo prevalece.
- Facts de segmentação usavam o rake mestre, divergente dos períodos usados pelo 360 e pelo BI.
- Filtro de clube, se herdasse o rake mestre, mostraria o consolidado dentro do SX. O filtro de clube agora zera o fallback.

## 44. Correções realizadas

- Dimensão de clube no schema, nos dois commits e nos parsers.
- Backfill só do nome SX Club presente no raw.
- Lista, 360, facts e prévia publicados no projeto `gkyrsdciednwopqomqkp`.
- Filtro de clube em CRM, BI, segmentações e seletor no import.
- Painel do case Xtreme na visão geral de Campanhas, com investimento persistível e estado vazio.
- Precedência do nome do clube no arquivo sobre o seletor.

## 45. Dívida técnica

- Reimportar os relatórios de agentes SX para preencher `club_code` dos períodos. Sem isso, o filtro SX não mostra o rake histórico.
- Reimportar transações antigas cujo raw não tem `Nome do clube`, se o arquivo original tiver a coluna. 7193 linhas não podem ser recuperadas do que está persistido.
- Prévia de segmentação em loop, se o volume crescer.
- Um arquivo de rake com dois nomes de clube ao mesmo tempo não é fatiado por linha: `fileClubCode` fica nulo e vale o seletor.
- Banco vazio não foi provisionado nesta sessão. A garantia de ordem é a sequência dos arquivos, não uma execução `migrate` do zero.

## 46. Divergências do plano

- O relatório de agentes real não contém clube. O seletor do import é o que atribui o clube quando a coluna não existe. Não foi inventada uma coluna.
- Períodos históricos não foram marcados como SX sem evidência no arquivo.
- “Somente SX” hoje coincide com “tem atividade SX persistida”, porque não existe atividade Xtreme. Jogadores só com clube nulo ficam de fora desses filtros e continuam em Todos.
- O painel do case conta jogadores distintos. O helper de teste soma as agências.

## 47. O que só poderá ser validado após a primeira importação real Xtreme

- O texto exato de clube nos XLSX Xtreme e se o parser resolve `Xtreme Pro`.
- Quantidade de linhas de agentes e de transações.
- Rake bruto importado contra o arquivo.
- Sender, bônus e incentivo enviado reais.
- Player IDs que também existem no SX.
- Cross-club real, última atividade global e alerta de inatividade com os dois históricos.
- BI, Player 360 e segmentações com os dois clubes no mesmo jogador.
- Agências reais consolidadas no case, depósitos, recuperação e payback contra o investimento informado.
- Enriquecimento de clube nulo quando o arquivo Xtreme repetir um `external_transaction_id` já existente. Isso não deve ocorrer se os ids forem de outro clube; se ocorrer, a regra de não apagar clube já preenchido mantém o SX e não reetiqueta a linha.

## 48. Checklist para primeira importação Xtreme

Documento operacional: `docs/CHECKLIST_PRIMEIRA_IMPORTACAO_XTREME.md`.

## 49. Estado final

PRONTO PARA PRIMEIRA IMPORTAÇÃO XTREME PRO

O Xtreme Pro não foi validado com dados reais. Todos continua sendo a visão que preserva os números SX atuais. O filtro SX Club só passa a refletir o rake histórico depois da reimportação dos relatórios de agentes.
