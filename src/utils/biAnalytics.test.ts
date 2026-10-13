import { describe, expect, it } from 'vitest'
import {
  compareRanking,
  coerceGrain,
  distinctPlayerCount,
  firstObservationKind,
  grainBlockReason,
  metricAllowsGrain,
  periodPreset,
  previousWindow,
  prizeHasFinancialConfirmation,
  rakeSourceGap,
  spinCoverage,
  spinFeeIsRankable,
  variationPercent,
  weekIsClosed,
  weekOverlapsPartial,
} from './biAnalytics'

describe('ranking semanal', () => {
  it('desempata pelo Player ID sem alterar o rake', () => {
    const rows = [
      { rake: 10, playerId: '200' },
      { rake: 10, playerId: '100' },
      { rake: 30, playerId: '300' },
    ].sort(compareRanking)
    expect(rows.map((row) => row.playerId)).toEqual(['300', '100', '200'])
    expect(rows[1]?.rake).toBe(10)
  })

  it('não fabrica rake diário', () => {
    expect(metricAllowsGrain('rake_bruto', 'day')).toBe(false)
    expect(metricAllowsGrain('rake_liquido', 'day')).toBe(false)
    expect(grainBlockReason('rake_bruto', 'day')).toMatch(/não é distribuído/)
    expect(coerceGrain('rake_bruto', 'day')).toBe('week')
    expect(metricAllowsGrain('incentivos', 'day')).toBe(true)
    expect(metricAllowsGrain('ativos', 'day')).toBe(false)
    expect(metricAllowsGrain('primeira_semana', 'day')).toBe(false)
  })

  it('não trata semana aberta como completa', () => {
    expect(weekIsClosed('2026-10-11', '2026-10-13')).toBe(true)
    expect(weekIsClosed('2026-10-18', '2026-10-13')).toBe(false)
  })

  it('não substitui taxa spin ausente por zero', () => {
    expect(spinFeeIsRankable(null)).toBe(false)
    expect(spinFeeIsRankable(undefined)).toBe(false)
    expect(spinFeeIsRankable(0)).toBe(false)
    expect(spinFeeIsRankable(12.5)).toBe(true)
    expect(spinCoverage(0)).toBe('indisponivel')
    expect(spinCoverage(136)).toBe('com_taxa')
  })

  it('não compensa divergência de fontes no ranking', () => {
    expect(rakeSourceGap(4571.6, 4570.6)).toBe(1)
    const ranking = [
      { rake: 208, playerId: '1231719' },
      { rake: 174.65, playerId: '763715' },
    ].sort(compareRanking)
    expect(ranking.map((row) => row.playerId)).toEqual(['1231719', '763715'])
    expect(ranking[0]?.rake).toBe(208)
  })

  it('aceita o mesmo jogador em mais de uma categoria', () => {
    const rows = [
      { category: 'cash', playerId: '10', rake: 5 },
      { category: 'spin', playerId: '10', rake: 8 },
    ]
    expect(new Set(rows.map((row) => row.playerId)).size).toBe(1)
    expect(rows).toHaveLength(2)
  })

  it('não confirma premiação sem transação', () => {
    expect(prizeHasFinancialConfirmation('planejada')).toBe(false)
    expect(prizeHasFinancialConfirmation('registrada')).toBe(false)
    expect(prizeHasFinancialConfirmation('enviada')).toBe(false)
  })
})

describe('variação de desempenho', () => {
  it('calcula alta e queda', () => {
    expect(variationPercent(150, 100)).toBe(50)
    expect(variationPercent(80, 100)).toBe(-20)
  })

  it('não inventa percentual quando a base é zero', () => {
    expect(variationPercent(20, 0)).toBeNull()
  })

  it('abre a janela anterior do mesmo tamanho', () => {
    expect(previousWindow('2026-09-01', '2026-09-30')).toEqual({
      from: '2026-08-02',
      to: '2026-08-31',
    })
  })

  it('mês anterior fecha no último dia', () => {
    expect(periodPreset('prev-month', '2026-03-15')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
  })

  it('sinaliza semana cortada pelo período personalizado', () => {
    expect(weekOverlapsPartial('2026-10-07', '2026-10-11', '2026-10-05', '2026-10-11')).toBe(true)
    expect(weekOverlapsPartial('2026-10-05', '2026-10-11', '2026-10-05', '2026-10-11')).toBe(false)
  })

  it('separa primeira observação global da observação no recorte', () => {
    expect(firstObservationKind({ club: 'all', agentId: '', campaignId: '', playerId: '' })).toBe('global')
    expect(firstObservationKind({ club: 'sx_club', agentId: '', campaignId: '', playerId: '' })).toBe('recorte')
    expect(firstObservationKind({ club: 'all', agentId: '55', campaignId: '', playerId: '' })).toBe('recorte')
  })

  it('deduplica jogador presente nos dois clubes', () => {
    expect(distinctPlayerCount(['10', '10', '20'])).toBe(2)
  })
})
