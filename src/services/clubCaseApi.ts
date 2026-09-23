import { BOARD_ID, supabase } from '../lib/supabase'
import type { XtremeAgencyFact } from '../utils/clubDimension'

export type XtremeCaseSummary = {
  hasActivity: boolean
  rakeBruto: number
  players: number
  activePlayers: number
  deposits: number
  /** Incentivo enviado Xtreme (= Ativação econômica). */
  incentiveSent: number
  agencies: XtremeAgencyFact[]
}

export type ClubCaseInvestment = {
  investment: number
  notes: string | null
}

function asNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Aceita 101774.73, 101774,73 e 101.774,73 (pt-BR). */
export function parseMoneyInput(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null
  }
  const text = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
  if (!text) return null
  let normalized = text
  if (text.includes(',') && text.includes('.')) {
    normalized = text.replace(/\./g, '').replace(',', '.')
  } else if (text.includes(',')) {
    normalized = text.replace(',', '.')
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function moneyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

function logClubCaseError(
  operation: string,
  err: { code?: string; message?: string } | Error | unknown,
  extra?: Record<string, unknown>,
) {
  const payload =
    err instanceof Error
      ? { name: err.name, message: err.message }
      : err && typeof err === 'object'
        ? err
        : { message: String(err) }
  console.error('[clubCase]', {
    operation,
    board: BOARD_ID,
    ...extra,
    error: payload,
  })
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
    incentiveSent: asNumber(payload.incentiveSent ?? payload.activation),
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
    .select('investment, notes')
    .eq('board_id', BOARD_ID)
    .eq('club_code', clubCode)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    investment: asNumber(data?.investment),
    notes: data?.notes ?? null,
  }
}

/**
 * Persiste só o Investimento manual do case.
 * Ativação é calculada no servidor (incentivo enviado) — não gravar manualmente.
 */
export async function saveClubCaseInvestment(input: {
  clubCode: 'xtreme_pro'
  investment: number
  notes?: string | null
}): Promise<ClubCaseInvestment> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Sessão expirada. Entre novamente para salvar o investimento.')
  }

  const matches = (row: ClubCaseInvestment) =>
    moneyEquals(row.investment, input.investment)

  try {
    const { data, error } = await supabase.rpc('crm_upsert_club_case', {
      p_board_id: BOARD_ID,
      p_club_code: input.clubCode,
      p_investment: input.investment,
      // Mantém coluna no schema; valor econômico real vem do motor (incentiveSent).
      p_activation_cost: 0,
      p_notes: input.notes ?? null,
    })

    if (error) {
      logClubCaseError('crm_upsert_club_case', error, {
        club: input.clubCode,
        investment: input.investment,
      })
      const verified = await fetchClubCaseInvestment(input.clubCode).catch(() => null)
      if (verified && matches(verified)) return verified
      throw new Error('Não foi possível salvar o investimento. Tente novamente.')
    }

    const payload = (data ?? {}) as Record<string, unknown>
    return {
      investment: asNumber(payload.investment),
      notes: (payload.notes as string | null) ?? null,
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Não foi possível')) {
      throw err
    }
    if (err instanceof Error && err.message.startsWith('Sessão expirada')) {
      throw err
    }
    logClubCaseError('crm_upsert_club_case_throw', err, {
      club: input.clubCode,
      investment: input.investment,
    })
    const verified = await fetchClubCaseInvestment(input.clubCode).catch(() => null)
    if (verified && matches(verified)) return verified
    throw new Error('Não foi possível salvar o investimento. Tente novamente.')
  }
}
