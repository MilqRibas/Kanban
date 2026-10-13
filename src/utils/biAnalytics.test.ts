import { describe, expect, it } from 'vitest'
import {
  compareRanking,
  grainBlockReason,
  metricAllowsGrain,
  periodPreset,
  previousWindow,
  variationPercent,
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
    expect(grainBlockReason('rake_bruto', 'day')).toMatch(/semanal/)
    expect(metricAllowsGrain('incentivos', 'day')).toBe(true)
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
})
