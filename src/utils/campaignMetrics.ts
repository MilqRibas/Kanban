import type {
  Campaign,
  CampaignComputedStatus,
  CampaignMonthlyResult,
} from '../types/campaigns'

export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (denominator === 0) return null
  const result = numerator / denominator
  return Number.isFinite(result) ? result : null
}

export function calculateInactivePlayers(
  capturedPlayers: number,
  activePlayers: number,
): number {
  return Math.max(0, capturedPlayers - activePlayers)
}

export function calculateActivationRate(
  activePlayers: number,
  capturedPlayers: number,
): number | null {
  const rate = safeDivide(activePlayers, capturedPlayers)
  return rate === null ? null : rate * 100
}

export function calculateCostPerCapturedPlayer(
  investment: number | null | undefined,
  capturedPlayers: number,
): number | null {
  if (investment == null) return null
  return safeDivide(investment, capturedPlayers)
}

export function calculateCostPerActivePlayer(
  investment: number | null | undefined,
  activePlayers: number,
): number | null {
  if (investment == null) return null
  return safeDivide(investment, activePlayers)
}

export function calculateAccumulatedRake(
  monthlyResults: Pick<CampaignMonthlyResult, 'monthlyRake' | 'referenceYear' | 'referenceMonth'>[],
): number {
  return monthlyResults.reduce((sum, row) => sum + (Number(row.monthlyRake) || 0), 0)
}

export function calculateAverageRakePerActivePlayer(
  accumulatedRake: number,
  activePlayers: number,
): number | null {
  return safeDivide(accumulatedRake, activePlayers)
}

export function calculateInvestmentRecovery(
  accumulatedRake: number,
  investment: number | null | undefined,
): number | null {
  if (investment == null) return null
  const rate = safeDivide(accumulatedRake, investment)
  return rate === null ? null : rate * 100
}

export function calculateInvestmentDifference(
  accumulatedRake: number,
  investment: number | null | undefined,
): number | null {
  if (investment == null) return null
  return accumulatedRake - investment
}

export type PaybackResult = {
  reached: boolean
  month: number | null
  year: number | null
  monthsToPayback: number | null
}

export function calculatePaybackMonth(
  investment: number | null | undefined,
  monthlyResults: Pick<
    CampaignMonthlyResult,
    'monthlyRake' | 'referenceYear' | 'referenceMonth'
  >[],
): PaybackResult {
  if (investment == null || investment <= 0) {
    return {
      reached: false,
      month: null,
      year: null,
      monthsToPayback: null,
    }
  }
  const sorted = [...monthlyResults].sort((a, b) => {
    if (a.referenceYear !== b.referenceYear) {
      return a.referenceYear - b.referenceYear
    }
    return a.referenceMonth - b.referenceMonth
  })

  let accumulated = 0
  for (let i = 0; i < sorted.length; i += 1) {
    accumulated += Number(sorted[i].monthlyRake) || 0
    if (accumulated >= investment) {
      return {
        reached: true,
        month: sorted[i].referenceMonth,
        year: sorted[i].referenceYear,
        monthsToPayback: i + 1,
      }
    }
  }

  return {
    reached: false,
    month: null,
    year: null,
    monthsToPayback: null,
  }
}

export function calculateCampaignStatus(
  campaign: Pick<Campaign, 'isArchived' | 'investment'>,
  accumulatedRake: number,
  hasImportedPeriods = true,
): CampaignComputedStatus {
  if (campaign.isArchived) return 'archived'
  if (!hasImportedPeriods) return 'no_data'
  const investment = campaign.investment
  if (investment == null || investment <= 0) return 'no_return'
  if (accumulatedRake >= investment) {
    return 'payback'
  }
  if (accumulatedRake > 0 && accumulatedRake < investment) {
    return 'recovering'
  }
  return 'no_return'
}

export type CampaignMetrics = {
  inactivePlayers: number
  activationRate: number | null
  costPerCaptured: number | null
  costPerActive: number | null
  accumulatedRake: number
  averageRakePerActive: number | null
  recoveryRate: number | null
  investmentDifference: number | null
  payback: PaybackResult
  status: CampaignComputedStatus
  monthsTracked: number
}

export function buildCampaignMetrics(
  campaign: Campaign,
  monthlyResults: CampaignMonthlyResult[],
): CampaignMetrics {
  const results = monthlyResults.filter((r) => r.campaignId === campaign.id)
  const accumulatedRake = calculateAccumulatedRake(results)
  return {
    inactivePlayers: calculateInactivePlayers(
      campaign.capturedPlayers,
      campaign.activePlayers,
    ),
    activationRate: calculateActivationRate(
      campaign.activePlayers,
      campaign.capturedPlayers,
    ),
    costPerCaptured: calculateCostPerCapturedPlayer(
      campaign.investment,
      campaign.capturedPlayers,
    ),
    costPerActive: calculateCostPerActivePlayer(
      campaign.investment,
      campaign.activePlayers,
    ),
    accumulatedRake,
    averageRakePerActive: calculateAverageRakePerActivePlayer(
      accumulatedRake,
      campaign.activePlayers,
    ),
    recoveryRate: calculateInvestmentRecovery(accumulatedRake, campaign.investment),
    investmentDifference: calculateInvestmentDifference(
      accumulatedRake,
      campaign.investment,
    ),
    payback: calculatePaybackMonth(campaign.investment, results),
    status: calculateCampaignStatus(campaign, accumulatedRake),
    monthsTracked: results.length,
  }
}

export type OverviewKpis = {
  totalInvestment: number
  totalAccumulatedRake: number
  organicAccumulatedRake: number
  totalCaptured: number
  totalActive: number
  activationRate: number | null
  recoveryRate: number | null
  paybackCount: number
  costPerActive: number | null
}

export function buildOverviewKpis(
  campaigns: Campaign[],
  monthlyResults: CampaignMonthlyResult[],
): OverviewKpis {
  const totalInvestment = campaigns.reduce(
    (sum, c) => sum + (c.investment ?? 0),
    0,
  )
  const totalCaptured = campaigns.reduce((sum, c) => sum + c.capturedPlayers, 0)
  const totalActive = campaigns.reduce((sum, c) => sum + c.activePlayers, 0)

  let totalAccumulatedRake = 0
  let paybackCount = 0
  for (const campaign of campaigns) {
    const metrics = buildCampaignMetrics(campaign, monthlyResults)
    totalAccumulatedRake += metrics.accumulatedRake
    if (metrics.status === 'payback') paybackCount += 1
  }

  return {
    totalInvestment,
    totalAccumulatedRake,
    organicAccumulatedRake: 0,
    totalCaptured,
    totalActive,
    activationRate: calculateActivationRate(totalActive, totalCaptured),
    recoveryRate: calculateInvestmentRecovery(totalAccumulatedRake, totalInvestment),
    paybackCount,
    costPerActive: calculateCostPerActivePlayer(totalInvestment, totalActive),
  }
}

export type CampaignInsight = {
  id: string
  text: string
}

export function generateCampaignInsights(params: {
  campaign: Campaign
  metrics: CampaignMetrics
  peerCampaigns: Campaign[]
  peerMonthlyResults: CampaignMonthlyResult[]
  previousMonthRake?: number | null
  currentMonthRake?: number | null
}): CampaignInsight[] {
  const { campaign, metrics, peerCampaigns, peerMonthlyResults } = params
  const insights: CampaignInsight[] = []

  const recovery = metrics.recoveryRate
  if (recovery === null) {
    insights.push({
      id: 'recovery-unknown',
      text: 'Não há dados suficientes para avaliar a recuperação do investimento.',
    })
  } else if (recovery < 25) {
    insights.push({
      id: 'recovery-low',
      text: 'A campanha ainda apresenta baixa recuperação do investimento.',
    })
  } else if (recovery < 75) {
    insights.push({
      id: 'recovery-mid',
      text: 'A campanha está em processo de recuperação do investimento.',
    })
  } else if (recovery < 100) {
    insights.push({
      id: 'recovery-near',
      text: 'A campanha está próxima de atingir o payback.',
    })
  } else {
    insights.push({
      id: 'recovery-done',
      text: 'A campanha recuperou integralmente o investimento.',
    })
  }

  const peerMetrics = peerCampaigns.map((c) =>
    buildCampaignMetrics(c, peerMonthlyResults),
  )
  const peerActivationValues = peerMetrics
    .map((m) => m.activationRate)
    .filter((v): v is number => v !== null)
  const avgActivation =
    peerActivationValues.length > 0
      ? peerActivationValues.reduce((a, b) => a + b, 0) / peerActivationValues.length
      : null

  if (metrics.activationRate !== null && avgActivation !== null) {
    insights.push({
      id: 'activation-vs-avg',
      text:
        metrics.activationRate >= avgActivation
          ? 'A taxa de ativação está acima da média das campanhas.'
          : 'A taxa de ativação está abaixo da média das campanhas.',
    })
  }

  const peerAvgRakeValues = peerMetrics
    .map((m) => m.averageRakePerActive)
    .filter((v): v is number => v !== null)
  const avgRakePerActive =
    peerAvgRakeValues.length > 0
      ? peerAvgRakeValues.reduce((a, b) => a + b, 0) / peerAvgRakeValues.length
      : null

  if (
    metrics.activationRate !== null &&
    avgActivation !== null &&
    metrics.averageRakePerActive !== null &&
    avgRakePerActive !== null &&
    metrics.activationRate >= avgActivation &&
    metrics.averageRakePerActive < avgRakePerActive
  ) {
    insights.push({
      id: 'rake-below-avg',
      text: 'Mesmo com boa ativação, o rake médio por jogador está abaixo da média.',
    })
  }

  const peerCostValues = peerMetrics
    .map((m) => m.costPerActive)
    .filter((v): v is number => v !== null)
  const avgCost =
    peerCostValues.length > 0
      ? peerCostValues.reduce((a, b) => a + b, 0) / peerCostValues.length
      : null

  if (metrics.costPerActive !== null && avgCost !== null && metrics.costPerActive > avgCost) {
    insights.push({
      id: 'cost-above-avg',
      text: 'O custo por jogador ativo está acima da média das campanhas.',
    })
  }

  const prev = params.previousMonthRake
  const curr = params.currentMonthRake
  if (
    prev != null &&
    curr != null &&
    Number.isFinite(prev) &&
    Number.isFinite(curr) &&
    prev > 0
  ) {
    const delta = ((curr - prev) / prev) * 100
    if (Number.isFinite(delta)) {
      insights.push({
        id: 'monthly-growth',
        text:
          delta >= 0
            ? `O rake cresceu ${delta.toFixed(1).replace('.', ',')}% em relação ao mês anterior.`
            : `O rake caiu ${Math.abs(delta).toFixed(1).replace('.', ',')}% em relação ao mês anterior.`,
      })
    }
  }

  if (
    !metrics.payback.reached &&
    metrics.investmentDifference != null &&
    metrics.investmentDifference < 0
  ) {
    const remaining = Math.abs(metrics.investmentDifference)
    insights.push({
      id: 'payback-remaining',
      text: `Faltam R$ ${remaining.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} para a campanha recuperar o investimento.`,
    })
  }

  const campaignMonthly = monthlyResultsForCampaign(
    campaign.id,
    peerMonthlyResults,
  )
  const latest = [...campaignMonthly].sort((a, b) => {
    if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear
    return b.referenceMonth - a.referenceMonth
  })[0]

  if (
    latest?.topPlayerRake != null &&
    metrics.accumulatedRake > 0 &&
    latest.topPlayerRake / metrics.accumulatedRake > 0.6
  ) {
    insights.push({
      id: 'rake-concentration',
      text: 'Mais de 60% do rake está concentrado em um único jogador.',
    })
  }

  return insights
}

function monthlyResultsForCampaign(
  campaignId: string,
  monthlyResults: CampaignMonthlyResult[],
) {
  return monthlyResults.filter((r) => r.campaignId === campaignId)
}

export function generateComparisonInsights(
  campaigns: Campaign[],
  monthlyResults: CampaignMonthlyResult[],
): CampaignInsight[] {
  if (campaigns.length < 2) return []

  const rows = campaigns.map((campaign) => ({
    campaign,
    metrics: buildCampaignMetrics(campaign, monthlyResults),
  }))

  const insights: CampaignInsight[] = []

  const byRake = [...rows].sort(
    (a, b) => b.metrics.accumulatedRake - a.metrics.accumulatedRake,
  )[0]
  insights.push({
    id: 'cmp-rake',
    text: `A campanha ${byRake.campaign.name} apresentou o maior rake acumulado.`,
  })

  const byActivation = [...rows]
    .filter((r) => r.metrics.activationRate !== null)
    .sort((a, b) => (b.metrics.activationRate ?? 0) - (a.metrics.activationRate ?? 0))[0]
  if (byActivation) {
    insights.push({
      id: 'cmp-activation',
      text: `A campanha ${byActivation.campaign.name} possui a maior taxa de ativação.`,
    })
  }

  const byCostCaptured = [...rows]
    .filter((r) => r.metrics.costPerCaptured !== null)
    .sort(
      (a, b) => (a.metrics.costPerCaptured ?? Infinity) - (b.metrics.costPerCaptured ?? Infinity),
    )[0]
  if (byCostCaptured) {
    insights.push({
      id: 'cmp-cost-captured',
      text: `A campanha ${byCostCaptured.campaign.name} apresenta o menor custo por jogador captado.`,
    })
  }

  for (const row of rows) {
    if (row.metrics.payback.reached) {
      insights.push({
        id: `cmp-payback-${row.campaign.id}`,
        text: `A campanha ${row.campaign.name} já atingiu o payback.`,
      })
    } else if (
      row.metrics.investmentDifference != null &&
      row.metrics.investmentDifference < 0
    ) {
      const remaining = Math.abs(row.metrics.investmentDifference)
      insights.push({
        id: `cmp-gap-${row.campaign.id}`,
        text: `A campanha ${row.campaign.name} está a R$ ${remaining.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} de recuperar o investimento.`,
      })
    }

    if (
      row.metrics.activationRate !== null &&
      row.metrics.activationRate >= 35 &&
      row.metrics.averageRakePerActive !== null
    ) {
      const avgPeers = rows
        .map((r) => r.metrics.averageRakePerActive)
        .filter((v): v is number => v !== null)
      const avg =
        avgPeers.reduce((a, b) => a + b, 0) / Math.max(avgPeers.length, 1)
      if (row.metrics.averageRakePerActive < avg) {
        insights.push({
          id: `cmp-low-rake-${row.campaign.id}`,
          text: `A campanha ${row.campaign.name} possui boa ativação, mas baixo rake médio por jogador ativo.`,
        })
      }
    }
  }

  return insights
}
