import { safeDivide } from './campaignMetricsBridge'
import type { Campaign } from '../types/campaigns'

export type FunnelStepKey =
  | 'impressions'
  | 'reach'
  | 'metaConversations'
  | 'serviceConversations'
  | 'clubConversions'
  | 'clubFichasConversions'
  | 'activePlayers'

export type FunnelStep = {
  key: FunnelStepKey
  label: string
  value: number | null
  kind: 'count'
  source: 'manual' | 'computed'
}

export type FunnelKpis = {
  cpm: number | null
  frequency: number | null
  costPerMetaConversation: number | null
  reachToMetaRate: number | null
  metaToServiceRate: number | null
  metaServiceDivergencePct: number | null
  metaServiceAbsoluteDiff: number | null
  costPerServiceConversation: number | null
  serviceToClubRate: number | null
  clubToFichasRate: number | null
  costPerPlayer: number | null
  costPerActive: number | null
}

export type FunnelDiagnosisBlock = {
  kind: 'bottleneck' | 'positive' | 'attention'
  title: string
  detail: string
}

export type FunnelDiagnosis = {
  blocks: FunnelDiagnosisBlock[]
} | null

export type FunnelWarnings = {
  reachGtImpressions: boolean
  serviceGtMeta: boolean
  fichasGtClub: boolean
}

function n(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null
  return Number(value)
}

/**
 * Jornada de conversão — SEM investimento (contexto financeiro separado).
 * Nunca calcular Impressões/Investimento como “conversão”.
 */
export function buildFunnelSteps(
  campaign: Pick<
    Campaign,
    | 'acquisitionNature'
    | 'impressions'
    | 'reach'
    | 'metaConversations'
    | 'serviceConversations'
    | 'clubConversions'
    | 'clubFichasConversions'
  >,
  activePlayers: number,
): FunnelStep[] {
  const paid = campaign.acquisitionNature === 'PAID'
  const steps: FunnelStep[] = []

  const pushIf = (
    key: FunnelStepKey,
    label: string,
    value: number | null,
    source: 'manual' | 'computed',
    force = false,
  ) => {
    if (force || value != null || paid) {
      if (!paid && value == null && key !== 'activePlayers' && key !== 'clubConversions' && key !== 'clubFichasConversions') {
        return
      }
      steps.push({ key, label, value, kind: 'count', source })
    }
  }

  pushIf('impressions', 'Impressões', n(campaign.impressions), 'manual')
  pushIf('reach', 'Alcance', n(campaign.reach), 'manual')
  pushIf(
    'metaConversations',
    'Conversas Meta',
    n(campaign.metaConversations),
    'manual',
  )
  pushIf(
    'serviceConversations',
    'Conversas Atendimento',
    n(campaign.serviceConversations),
    'manual',
    !paid && campaign.serviceConversations != null,
  )
  steps.push({
    key: 'clubConversions',
    label: 'Conversões no Clube',
    value: n(campaign.clubConversions),
    kind: 'count',
    source: 'manual',
  })
  steps.push({
    key: 'clubFichasConversions',
    label: 'Clube + Fichas',
    value: n(campaign.clubFichasConversions),
    kind: 'count',
    source: 'manual',
  })
  steps.push({
    key: 'activePlayers',
    label: 'Jogadores Ativos',
    value: Number.isFinite(activePlayers) ? activePlayers : null,
    kind: 'count',
    source: 'computed',
  })

  if (!paid) {
    return steps.filter((s) => {
      if (s.key === 'impressions' || s.key === 'reach' || s.key === 'metaConversations') {
        return s.value != null
      }
      if (s.key === 'serviceConversations') return s.value != null
      return true
    })
  }

  return steps
}

export function buildFunnelKpis(
  campaign: Pick<
    Campaign,
    | 'investment'
    | 'impressions'
    | 'reach'
    | 'metaConversations'
    | 'serviceConversations'
    | 'clubConversions'
    | 'clubFichasConversions'
  >,
  applicableCost: number | null,
  activePlayers: number,
): FunnelKpis {
  const investment = n(campaign.investment)
  const impressions = n(campaign.impressions)
  const reach = n(campaign.reach)
  const meta = n(campaign.metaConversations)
  const service = n(campaign.serviceConversations)
  const club = n(campaign.clubConversions)
  const fichas = n(campaign.clubFichasConversions)

  const cpm =
    investment != null && impressions != null && impressions > 0
      ? (investment / impressions) * 1000
      : null

  let metaServiceDivergencePct: number | null = null
  let metaServiceAbsoluteDiff: number | null = null
  if (meta != null && service != null) {
    metaServiceAbsoluteDiff = service - meta
    if (meta > 0) {
      metaServiceDivergencePct = ((service - meta) / meta) * 100
    }
  }

  return {
    cpm: cpm != null && Number.isFinite(cpm) ? cpm : null,
    frequency: safeDivide(impressions ?? NaN, reach ?? 0),
    costPerMetaConversation: safeDivide(investment ?? NaN, meta ?? 0),
    reachToMetaRate: (() => {
      const r = safeDivide(meta ?? NaN, reach ?? 0)
      return r === null ? null : r * 100
    })(),
    metaToServiceRate: (() => {
      const r = safeDivide(service ?? NaN, meta ?? 0)
      return r === null ? null : r * 100
    })(),
    metaServiceDivergencePct,
    metaServiceAbsoluteDiff,
    costPerServiceConversation: safeDivide(investment ?? NaN, service ?? 0),
    serviceToClubRate: (() => {
      const r = safeDivide(club ?? NaN, service ?? 0)
      return r === null ? null : r * 100
    })(),
    clubToFichasRate: (() => {
      const r = safeDivide(fichas ?? NaN, club ?? 0)
      return r === null ? null : r * 100
    })(),
    costPerPlayer: safeDivide(applicableCost ?? NaN, fichas ?? 0),
    costPerActive: safeDivide(applicableCost ?? NaN, activePlayers),
  }
}

export type JourneyEdge = {
  from: FunnelStep
  to: FunnelStep
  rate: number | null
  loss: number | null
}

export function buildJourneyEdges(steps: FunnelStep[]): JourneyEdge[] {
  const edges: JourneyEdge[] = []
  for (let i = 1; i < steps.length; i += 1) {
    const from = steps[i - 1]
    const to = steps[i]
    const rate = stepConversionRate(to.value, from.value)
    const loss =
      from.value != null && to.value != null ? from.value - to.value : null
    edges.push({ from, to, rate, loss })
  }
  return edges
}

/**
 * Diagnóstico quantitativo relativo entre etapas (sem benchmarks inventados).
 */
export function diagnoseFunnel(
  steps: FunnelStep[],
  kpis: FunnelKpis,
): FunnelDiagnosis {
  const edges = buildJourneyEdges(steps).filter((e) => e.rate != null)
  const blocks: FunnelDiagnosisBlock[] = []

  if (edges.length > 0) {
    const worst = [...edges].sort((a, b) => (a.rate ?? 999) - (b.rate ?? 999))[0]
    if (worst && worst.rate != null) {
      const lost =
        worst.loss != null && worst.loss > 0
          ? ` ${Math.round(worst.loss)} de ${formatCount(worst.from.value)} não passaram para ${worst.to.label.toLowerCase()}.`
          : ''
      blocks.push({
        kind: 'bottleneck',
        title: `Principal gargalo: ${worst.from.label} → ${worst.to.label}`,
        detail: `${formatPct(worst.rate)} de conversão.${lost}`,
      })
    }

    const best = [...edges].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))[0]
    if (best && best.rate != null && best !== worst) {
      blocks.push({
        kind: 'positive',
        title: `Ponto positivo: ${best.from.label} → ${best.to.label}`,
        detail: `${formatPct(best.rate)} de passagem entre essas etapas.`,
      })
    }
  }

  if (
    kpis.metaServiceAbsoluteDiff != null &&
    kpis.metaServiceDivergencePct != null &&
    kpis.metaServiceAbsoluteDiff !== 0
  ) {
    const abs = Math.abs(kpis.metaServiceAbsoluteDiff)
    const below = kpis.metaServiceAbsoluteDiff < 0
    blocks.push({
      kind: 'attention',
      title: 'Atenção: Meta × Atendimento',
      detail: below
        ? `Atendimento registrou ${abs} conversas a menos que a Meta (${formatPct(Math.abs(kpis.metaServiceDivergencePct))} abaixo da Meta).`
        : `Atendimento registrou ${abs} conversas a mais que a Meta (${formatPct(Math.abs(kpis.metaServiceDivergencePct))} acima da Meta).`,
    })
  }

  return blocks.length ? { blocks } : null
}

function formatPct(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

function formatCount(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR')
}

export function funnelWarnings(
  campaign: Pick<
    Campaign,
    | 'impressions'
    | 'reach'
    | 'metaConversations'
    | 'serviceConversations'
    | 'clubConversions'
    | 'clubFichasConversions'
  >,
): FunnelWarnings {
  const impressions = n(campaign.impressions)
  const reach = n(campaign.reach)
  const meta = n(campaign.metaConversations)
  const service = n(campaign.serviceConversations)
  const club = n(campaign.clubConversions)
  const fichas = n(campaign.clubFichasConversions)
  return {
    reachGtImpressions:
      reach != null && impressions != null && reach > impressions,
    serviceGtMeta: service != null && meta != null && service > meta,
    fichasGtClub: fichas != null && club != null && fichas > club,
  }
}

export function stepConversionRate(
  current: number | null,
  previous: number | null,
): number | null {
  // Nunca tratar dinheiro como população — callers devem não passar investment.
  const r = safeDivide(current ?? NaN, previous ?? 0)
  return r === null ? null : r * 100
}

export function formatMetaServiceDivergenceLabel(kpis: FunnelKpis): string | null {
  if (
    kpis.metaServiceDivergencePct == null ||
    kpis.metaServiceAbsoluteDiff == null
  ) {
    return null
  }
  const absPct = Math.abs(kpis.metaServiceDivergencePct)
  const absDiff = Math.abs(kpis.metaServiceAbsoluteDiff)
  const pct = absPct.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (kpis.metaServiceAbsoluteDiff < 0) {
    return `${pct}% abaixo da Meta · ${absDiff.toLocaleString('pt-BR')} conversas de diferença`
  }
  if (kpis.metaServiceAbsoluteDiff > 0) {
    return `${pct}% acima da Meta · ${absDiff.toLocaleString('pt-BR')} conversas de diferença`
  }
  return 'Sem divergência'
}
