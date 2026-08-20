import { describe, expect, it } from 'vitest'
import {
  aggregateCohortWeeklyRake,
  attributedCohortTransactions,
  attributedPlayerPeriods,
  discoverCampaignCohort,
  periodCountsTowardCohortRake,
  playerAppearedInAcquisitionWindow,
  sumCohortRake,
} from './campaignCohort'
import {
  activationRakeThreshold,
  countActivePlayers,
} from './campaignWeeklyMetrics'

const sps = {
  id: 'campaign-sps',
  agentId: '1747546',
  startDate: '2026-08-10',
  endDate: null as string | null,
}

const historicalWeeks = [
  {
    playerId: 'p-old',
    agentId: '1747546',
    periodStart: '2026-07-27',
    periodEnd: '2026-08-02',
    weeklyRake: 5.5,
    playerName: 'Old',
    nickname: 'old',
  },
  {
    playerId: 'p-old',
    agentId: '1747546',
    periodStart: '2026-08-03',
    periodEnd: '2026-08-09',
    weeklyRake: 51.5,
    playerName: 'Old',
    nickname: 'old',
  },
]

describe('campaign cohort acquisition', () => {
  it('does not acquire players who only appeared on the agent before start', () => {
    const members = discoverCampaignCohort(sps, historicalWeeks)
    expect(members).toEqual([])
    expect(sumCohortRake(members, historicalWeeks)).toBe(0)
  })

  it('acquires a player on first appearance inside the window and ignores prior rake', () => {
    const periods = [
      ...historicalWeeks,
      {
        playerId: 'p-new',
        agentId: '1747546',
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
        weeklyRake: 12,
        playerName: 'New',
        nickname: 'new',
      },
      {
        playerId: 'p-old',
        agentId: '1747546',
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
        weeklyRake: 3,
        playerName: 'Old',
        nickname: 'old',
      },
    ]
    const members = discoverCampaignCohort(sps, periods)
    expect(members.map((m) => m.playerId).sort()).toEqual(['p-new', 'p-old'])
    expect(members.find((m) => m.playerId === 'p-old')?.acquiredAt).toBe(
      '2026-08-10',
    )
    expect(sumCohortRake(members, periods)).toBe(15)
  })

  it('keeps accumulating rake after acquisition end date and agent migration', () => {
    const campaign = {
      ...sps,
      endDate: '2026-08-16',
    }
    const periods = [
      {
        playerId: 'p1',
        agentId: '1747546',
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
        weeklyRake: 10,
        playerName: 'P',
        nickname: 'p',
      },
      {
        playerId: 'p1',
        agentId: '9999999',
        periodStart: '2026-08-17',
        periodEnd: '2026-08-23',
        weeklyRake: 40,
        playerName: 'P',
        nickname: 'p',
      },
      {
        playerId: 'late',
        agentId: '1747546',
        periodStart: '2026-08-17',
        periodEnd: '2026-08-23',
        weeklyRake: 100,
        playerName: 'Late',
        nickname: 'late',
      },
    ]
    const members = discoverCampaignCohort(campaign, periods)
    expect(members).toHaveLength(1)
    expect(members[0].playerId).toBe('p1')
    expect(members[0].currentAgentId).toBe('9999999')
    expect(members[0].lastSeenWeek).toBe('2026-08-17')
    expect(sumCohortRake(members, periods)).toBe(50)
    expect(
      playerAppearedInAcquisitionWindow(periods[2], campaign),
    ).toBe(false)
  })

  it('keeps accepting new players when end_date is null', () => {
    const periods = [
      {
        playerId: 'a',
        agentId: '1747546',
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
        weeklyRake: 1,
        playerName: 'A',
        nickname: 'a',
      },
      {
        playerId: 'b',
        agentId: '1747546',
        periodStart: '2026-08-24',
        periodEnd: '2026-08-30',
        weeklyRake: 2,
        playerName: 'B',
        nickname: 'b',
      },
    ]
    const members = discoverCampaignCohort(sps, periods)
    expect(members.map((m) => m.playerId).sort()).toEqual(['a', 'b'])
  })

  it('attributes only weeks on or after acquired_at, following any agent', () => {
    const members = [
      {
        campaignId: 'c1',
        playerId: 'p1',
        acquiredAt: '2026-08-10',
        sourceAgentId: '1747546',
        firstSeenWeek: '2026-08-10',
        lastSeenWeek: '2026-08-17',
        currentAgentId: '2',
      },
    ]
    const periods = [
      {
        playerId: 'p1',
        agentId: '1747546',
        periodStart: '2026-08-03',
        periodEnd: '2026-08-09',
        weeklyRake: 51.5,
        playerName: 'P',
        nickname: 'p',
      },
      {
        playerId: 'p1',
        agentId: '1747546',
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
        weeklyRake: 8,
        playerName: 'P',
        nickname: 'p',
      },
      {
        playerId: 'p1',
        agentId: '2',
        periodStart: '2026-08-17',
        periodEnd: '2026-08-23',
        weeklyRake: 9,
        playerName: 'P',
        nickname: 'p',
      },
    ]
    expect(periodCountsTowardCohortRake(periods[0], '2026-08-10')).toBe(false)
    const attributed = attributedPlayerPeriods(members, periods)
    expect(attributed.map((p) => p.periodStart)).toEqual([
      '2026-08-10',
      '2026-08-17',
    ])
    const weekly = aggregateCohortWeeklyRake(attributed)
    expect(weekly.map((w) => w.weeklyRake)).toEqual([8, 9])
  })

  it('weekly actives count only players who raked that week, matching overview', () => {
    const weekly = aggregateCohortWeeklyRake([
      {
        playerId: 'raked',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        weeklyRake: 10,
      },
      {
        playerId: 'zero-1',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        weeklyRake: 0,
      },
      {
        playerId: 'zero-2',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        weeklyRake: 0,
      },
      {
        playerId: 'raked',
        periodStart: '2026-07-13',
        periodEnd: '2026-07-19',
        weeklyRake: 5,
      },
    ])
    expect(weekly.map((w) => w.uniquePlayers)).toEqual([1, 1])
    expect(weekly.map((w) => w.weeklyRake)).toEqual([10, 5])
  })

  it('attributes transactions to cohort players since acquisition across agents', () => {
    const members = [
      {
        playerId: 'dan',
        acquiredAt: '2026-07-06',
      },
    ]
    const transactions = [
      {
        receiverPlayerId: 'dan',
        agentId: '1730032',
        occurredAt: '2026-07-01T10:00:00.000Z',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        amount: 100,
      },
      {
        receiverPlayerId: 'dan',
        agentId: '1730032',
        occurredAt: '2026-07-08T10:00:00.000Z',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        amount: 200,
      },
      {
        // Depois do fim da aquisição e sob outro agente: continua contando
        receiverPlayerId: 'dan',
        agentId: '999',
        occurredAt: '2026-08-10T10:00:00.000Z',
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
        amount: 300,
      },
      {
        receiverPlayerId: 'fora-da-coorte',
        agentId: '1730032',
        occurredAt: '2026-07-08T10:00:00.000Z',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        amount: 999,
      },
    ]
    const attributed = attributedCohortTransactions(members, transactions)
    expect(attributed.map((t) => t.amount)).toEqual([200, 300])
  })

  it('evaluates activation on attributed cohort rake, not agent totals', () => {
    const periods = [
      {
        playerId: 'active',
        weeklyRake: 0.8,
      },
      {
        playerId: 'tiny',
        weeklyRake: 0.2,
      },
      {
        playerId: 'zero',
        weeklyRake: 0,
      },
    ]
    expect(countActivePlayers(periods, 0)).toBe(2)
    expect(countActivePlayers(periods, 0.5)).toBe(1)
    expect(
      activationRakeThreshold({
        activationRuleType: 'rake_gt_050',
        activationMinimumRake: null,
      }),
    ).toBe(0.5)
  })
})
