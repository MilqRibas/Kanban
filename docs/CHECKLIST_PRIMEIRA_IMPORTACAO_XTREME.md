# Checklist — primeira importação Xtreme Pro

Usar só os XLSX reais. Não fabricar linha de teste na base.

Antes de importar: no modal, escolher Xtreme Pro se o arquivo não tiver `Nome do clube`. Se a coluna existir e disser Xtreme Pro, ela prevalece sobre o seletor.

1. Clube — transações com `Nome do clube` Xtreme Pro gravam `club_code = xtreme_pro`. O id numérico da coluna `Clube` não vira código.
2. Relatório de agentes — o mesmo import de rake usado no SX. Períodos novos ficam com `xtreme_pro` e não substituem a semana SX do mesmo jogador.
3. Relatório de transações — o mesmo import de transações. Sem segunda cópia quando o `external_transaction_id` já existe; clube nulo pode ser preenchido, clube SX já gravado não é apagado.
4. Quantidade — linhas aceitas batem com o arquivo, descontando o aviso do parser.
5. Rake — soma de `weekly_rake` com `club_code = xtreme_pro` bate com o arquivo. Todos soma SX + Xtreme sem duplicar a mesma linha.
6. Sender — `sender_player_id` e apelido quando o arquivo traz. Sender vazio continua vazio.
7. Bônus — `is_bonus` conforme o arquivo. Sender vazio + bônus entra no incentivo. Sender vazio sem bônus não entra.
8. Incentivo enviado — Receiver, Chips Send Out, uma vez se for MKT GT e bônus na mesma transação. Filtro Xtreme soma só esse clube. Todos soma os dois.
9. Player IDs — o jogador novo entra em `campaign_players` pelo Player ID, sem sufixo de clube.
10. Quem já existe no SX — o mesmo Player ID ganha histórico Xtreme no mesmo cadastro. Não nasce um segundo jogador.
11. Cross-club — o 360 desse Player ID mostra as duas séries. Rake consolidado é a soma.
12. Última atividade global — a data mais recente entre os dois clubes.
13. Alertas — atividade recente em qualquer clube não gera alerta global de inatividade.
14. BI — filtro Xtreme Pro lista esses jogadores com rake, limite, enviado e disponível daquele clube. Todos não muda o número antigo do SX além da soma do que entrou.
15. Player 360 — uma ficha. Cada incentivo mostra clube, sender, apelido, SX tipo, valor e detection. Sem clube, o rótulo é Clube desconhecido.
16. Segmentações — Xtreme Pro e somente Xtreme passam a ter membros. Nos dois clubes só quem tiver atividade persistida nos dois. Não inventar membro.
17. Campanha consolidada — visão geral mostra um case XTREME PRO. Agências continuam no detalhe do fato, não viram várias campanhas.
18. Investimento — um valor total e uma ativação no painel. Custo = soma dos dois.
19. Recuperação — rake líquido (bruto × 0,82) dividido pelo custo.
20. Payback — líquido acumulado ≥ custo. Não usar rake bruto.

Se o filtro SX Club ainda não mostrar o rake antigo, reimportar os relatórios de agentes SX com o seletor em SX Club. Isso é independente do arquivo Xtreme.
