import { safeDivide } from './campaignMetricsBridge'
import type { Campaign } from '../types/campaigns'

export type FunnelStepKey =
  | 'investment'
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
  kind: 'money' | 'count'
  source: 'manual' | 'computed'
}

export type FunnelKpis = {
  cpm: number | null
  frequency: number | null
  costPerMetaConversation: number | null
  reachToMetaRate: number | null
  metaToServiceRate: number | null
  metaServiceDivergencePct: number | null
  costPerServiceConversation: number | null
  serviceToClubRate: number | null
  clubToFichasRate: number | null
  costPerPlayer: number | null
  costPerActive: number | null
}

export type FunnelDiagnosis = {
  code: string
  message: string
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

export function buildFunnelSteps(
  campaign: Pick<
    Campaign,
    | 'acquisitionNature'
    | 'investment'
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
  const steps: FunnelStep[] = [
    {
      key: 'investment',
      label: 'Investimento da Campanha',
      value: n(campaign.investment),
      kind: 'money',
      source: 'manual',
    },
  ]

  if (paid || campaign.impressions != null) {
    steps.push({
      key: 'impressions',
      label: 'Impressões',
      value: n(campaign.impressions),
      kind: 'count',
      source: 'manual',
    })
  }
  if (paid || campaign.reach != null) {
    steps.push({
      key: 'reach',
      label: 'Alcance',
      value: n(campaign.reach),
      kind: 'count',
      source: 'manual',
    })
  }
  if (paid || campaign.metaConversations != null) {
    steps.push({
      key: 'metaConversations',
      label: 'Conversas iniciadas — Meta',
      value: n(campaign.metaConversations),
      kind: 'count',
      source: 'manual',
    })
  }

  if (campaign.serviceConversations != null || paid) {
    steps.push({
      key: 'serviceConversations',
      label: 'Conversas iniciadas — Atendimento',
      value: n(campaign.serviceConversations),
      kind: 'count',
      source: 'manual',
    })
  }

  steps.push(
    {
      key: 'clubConversions',
      label: 'Conversões no Clube',
      value: n(campaign.clubConversions),
      kind: 'count',
      source: 'manual',
    },
    {
      key: 'clubFichasConversions',
      label: 'Conversões Clube + Fichas',
      value: n(campaign.clubFichasConversions),
      kind: 'count',
      source: 'manual',
    },
    {
      key: 'activePlayers',
      label: 'Jogadores Ativos',
      value: Number.isFinite(activePlayers) ? activePlayers : null,
      kind: 'count',
      source: 'computed',
    },
  )

  // Orgânico: omitir etapas de mídia sem dado (já filtradas acima).
  // Remover etapas intermediárias vazias em orgânico (exceto finais).
  if (!paid) {
    return steps.filter((s) => {
      if (
        s.key === 'impressions' ||
        s.key === 'reach' ||
        s.key === 'metaConversations'
      ) {
        return s.value != null
      }
      if (s.key === 'investment') return true
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
  if (meta != null && service != null && meta > 0) {
    metaServiceDivergencePct = ((service - meta) / meta) * 100
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

export function diagnoseFunnel(kpis: FunnelKpis): FunnelDiagnosis {
  const low = (rate: number | null) => rate != null && rate < 30
  const ok = (rate: number | null) => rate != null && rate >= 50

  if (ok(kpis.metaToServiceRate) && low(kpis.serviceToClubRate)) {
    return {
      code: 'club_bottleneck',
      message:
        'Boa geração de conversa, baixa conversão em clube — revisar jornada pós-atendimento.',
    }
  }
  if (ok(kpis.serviceToClubRate) && low(kpis.clubToFichasRate)) {
    return {
      code: 'fichas_bottleneck',
      message:
        'Boa conversão em clube, baixa conclusão Fichas — conciliar cadastro/vínculo.',
    }
  }
  if (
    kpis.clubToFichasRate != null &&
    kpis.clubToFichasRate >= 50 &&
    kpis.costPerActive != null &&
    kpis.costPerPlayer != null &&
    kpis.costPerActive > kpis.costPerPlayer * 1.5
  ) {
    return {
      code: 'activation_bottleneck',
      message:
        'Boa conclusão Fichas, ativação relativa baixa — reforçar onboarding/jogo.',
    }
  }
  return null
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
  const r = safeDivide(current ?? NaN, previous ?? 0)
  return r === null ? null : r * 100
}
