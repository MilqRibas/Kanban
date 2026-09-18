# Checklist — Teste de Usabilidade B2C

Roteiro curto para validar o produto na interface. Marque **Aprovado** / **Reprovado** e anote observações.

Ambiente: localhost · aba **Campanhas**

---

## 1. Navegação do ecossistema

| # | O que fazer | Resultado esperado | ☐ | Observação |
|---|-------------|--------------------|---|------------|
| 1.1 | Abrir Campanhas | Ver tabs: Campanhas · Segmentações · CRM · BI | A / R | |
| 1.2 | Alternar entre as 4 áreas | Conteúdo muda sem erro; dá para voltar | A / R | |

---

## 2. Campanhas — economia líquida

| # | O que fazer | Resultado esperado | ☐ | Observação |
|---|-------------|--------------------|---|------------|
| 2.1 | Abrir uma campanha com investimento e rake | Ver **Rake Bruto**, **Taxa da Liga (18%)**, **Rake Líquido** | A / R | |
| 2.2 | Conferir Recuperação | Recuperação usa rake líquido (menor que se fosse bruto) | A / R | |
| 2.3 | Conferir Payback / dias | Payback oficial é líquido; bruto permanece visível | A / R | |

---

## 3. Segmentações — criar e filtrar

| # | O que fazer | Resultado esperado | ☐ | Observação |
|---|-------------|--------------------|---|------------|
| 3.1 | Ir em Segmentações → Nova | Abre o builder | A / R | |
| 3.2 | Nomear + 1 condição (ex.: Rake 30d > 100) | Preview mostra quantidade e amostra | A / R | |
| 3.3 | Adicionar 2ª condição no mesmo grupo (E) | Contagem muda de forma coerente | A / R | |
| 3.4 | Adicionar 2º grupo (OU) | Preview recalcula | A / R | |
| 3.5 | Salvar | Volta à lista com a segmentação | A / R | |
| 3.6 | Editar / Duplicar / Excluir (com confirmação no 2º clique) | Ações funcionam | A / R | |

---

## 4. Pipeline a partir da segmentação

| # | O que fazer | Resultado esperado | ☐ | Observação |
|---|-------------|--------------------|---|------------|
| 4.1 | Na segmentação, criar Pipeline (ícone ou CRM → Nova) | Modal com etapas editáveis | A / R | |
| 4.2 | Salvar pipeline com segmentação de origem | Pipeline abre; jogadores na 1ª etapa (após sync) | A / R | |
| 4.3 | Editar etapas (renomear / adicionar) | Etapas atualizam no board | A / R | |

---

## 5. Operação CRM (cards)

| # | O que fazer | Resultado esperado | ☐ | Observação |
|---|-------------|--------------------|---|------------|
| 5.1 | Arrastar um card para outra etapa | Card muda de coluna | A / R | |
| 5.2 | Recarregar a página (F5) e reabrir a pipeline | Jogador permanece na etapa correta | A / R | |
| 5.3 | Clicar no card | Abre Player 360º | A / R | |
| 5.4 | “Atualizar da segmentação” | Novos elegíveis entram; quem saiu da regra **não some** (pode mostrar “Fora da segmentação”) | A / R | |

---

## 6. Base Jogadores (CRM auxiliar)

| # | O que fazer | Resultado esperado | ☐ | Observação |
|---|-------------|--------------------|---|------------|
| 6.1 | CRM → aba Jogadores | Lista com Limite / Enviado / Disponível | A / R | |
| 6.2 | Buscar um Player ID conhecido | Encontra e abre 360 ao clicar | A / R | |

---

## 7. Player 360º

| # | O que fazer | Resultado esperado | ☐ | Observação |
|---|-------------|--------------------|---|------------|
| 7.1 | Abrir 360 a partir do BI ou CRM | Mesmo painel; Limite/Enviado/Disponível coerentes | A / R | |
| 7.2 | Fechar o 360 | Volta ao contexto anterior (lista/pipeline) | A / R | |

---

## 8. BI operacional

| # | O que fazer | Resultado esperado | ☐ | Observação |
|---|-------------|--------------------|---|------------|
| 8.1 | Abrir BI | Lista focada em incentivos | A / R | |
| 8.2 | Buscar por nick ou Player ID | Filtra resultados | A / R | |
| 8.3 | Conferir Disponível (pode ser negativo) | Valores batem com o 360 do mesmo jogador | A / R | |

---

## 9. Incentivo Disponível (checagem rápida)

Escolha 1 jogador com histórico de incentivo:

| Campo | Valor na UI | ☐ |
|-------|-------------|---|
| Player ID | | |
| Limite | | A / R |
| Enviado | | A / R |
| Disponível (= Limite − Enviado) | | A / R |

---

## 10. Empty states / erros

| # | O que fazer | Resultado esperado | ☐ | Observação |
|---|-------------|--------------------|---|------------|
| 10.1 | Segmentação com condição impossível | Preview = 0, mensagem clara | A / R | |
| 10.2 | CRM sem pipelines | Empty state + CTA Nova pipeline | A / R | |

---

### Resultado geral do tester

- Nome: ____________________
- Data: ____________________
- Veredito: ☐ Aprovado para uso interno · ☐ Precisa ajustes
- Comentários livres:

```
_______________________________________________
_______________________________________________
```
