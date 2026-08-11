/** Thresholds centralizados — Saúde do Rake e Perfil de Jogo */

export const RAKE_HEALTH = {
  /** Top 1 acima disso → Concentrado (se outros sinais confirmarem) */
  top1Concentrated: 0.35,
  top1Attention: 0.22,
  top3Concentrated: 0.65,
  top3Attention: 0.5,
  top10Concentrated: 0.9,
  /** % de jogadores para atingir 80% do rake */
  playersFor80Concentrated: 0.2,
  playersFor80Attention: 0.35,
} as const

export const GAME_PROFILE = {
  /** Participação de rake para perfil predominante */
  predominantMinShare: 0.45,
} as const

export const RECONCILIATION = {
  /** Diferença absoluta em R$ tolerada como "conciliado" */
  absoluteTolerance: 0.05,
  /** Diferença relativa tolerada */
  relativeTolerance: 0.001,
} as const

export const RAKE_BANDS = [0, 0.5, 10, 50, 100] as const
