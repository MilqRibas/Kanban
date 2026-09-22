import { BOARD_ID, supabase } from '../lib/supabase'
import type { XtremeAgencyFact } from '../utils/clubDimension'

export type XtremeCaseSummary = {
  hasActivity: boolean
  rakeBruto: number
  players: number
  activePlayers: number
  deposits: number
  agencies: XtremeAgencyFact[]
}

export type ClubCaseInvestment = {
  investment: number
  activationCost: number
  notes: string | null
}

function asNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export async function fetchXtremeCaseSummary(): Promise<XtremeCaseSummary> {
  const { data, error } = await supabase.rpc('crm_xtreme_case_summary', {
    p_board_id: BOARD_ID,
  })
  if (error) throw new Error(error.message)
  const payload = (data ?? {}) as Record<string, unknown>
  const agenciesRaw = Array.isArray(payload.agencies) ? payload.agencies : []
  return {
    hasActivity: Boolean(payload.hasActivity),
    rakeBruto: asNumber(payload.rakeBruto),
    players: asNumber(payload.players),
    activePlayers: asNumber(payload.activePlayers),
    deposits: asNumber(payload.deposits),
    agencies: agenciesRaw.map((row) => {
      const r = row as Record<string, unknown>
      return {
        agentId: String(r.agentId ?? ''),
        agentName: String(r.agentName ?? r.agentId ?? ''),
        weeklyRake: asNumber(r.weeklyRake),
        players: asNumber(r.players),
        activePlayers: asNumber(r.activePlayers),
        deposits: asNumber(r.deposits),
      }
    }),
  }
}

export async function fetchClubCaseInvestment(
  clubCode: 'xtreme_pro',
): Promise<ClubCaseInvestment> {
  const { data, error } = await supabase
    .from('crm_club_cases')
    .select('investment, activation_cost, notes')
    .eq('board_id', BOARD_ID)
    .eq('club_code', clubCode)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    investment: asNumber(data?.investment),
    activationCost: asNumber(data?.activation_cost),
    notes: data?.notes ?? null,
  }
}

export async function saveClubCaseInvestment(input: {
  clubCode: 'xtreme_pro'
  investment: number
  activationCost: number
  notes?: string | null
}): Promise<void> {
  const { error } = await supabase.from('crm_club_cases').upsert(
    {
      board_id: BOARD_ID,
      club_code: input.clubCode,
      investment: input.investment,
      activation_cost: input.activationCost,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'board_id,club_code' },
  )
  if (error) throw new Error(error.message)
}
