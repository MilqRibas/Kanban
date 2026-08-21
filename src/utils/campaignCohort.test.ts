import { describe, expect, it } from 'vitest'
import {
  aggregateCohortWeeklyRake,
  attributedActivationBonuses,
  attributedCohortTransactions,
  attributedPlayerPeriods,
  discoverCampaignCohort,
  periodCountsTowardCohortRake,
  playerAppearedInAcquisitionWindow,
  sumActivationBonuses,
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
    expect(sumCohortRake(members, historicalWeeks, sps.agentId)).toBe(0)
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
    expect(sumCohortRake(members, periods, sps.agentId)).toBe(15)
  })

  it('cohort tracks migration, but rake at another agency is not attributed', () => {
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
    // Coorte continua acompanhando a trajetória do jogador
    expect(members[0].currentAgentId).toBe('9999999')
    expect(members[0].lastSeenWeek).toBe('2026-08-17')
    // Mas o rake gerado na agência 9999999 pertence à campanha daquela agência
    expect(sumCohortRake(members, periods, campaign.agentId)).toBe(10)
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

  it('attributes only weeks on or after acquired_at at the campaign agency', () => {
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
    const attributed = attributedPlayerPeriods(members, periods, '1747546')
    // Semana na agência 2 pertence à campanha da agência 2
    expect(attributed.map((p) => p.periodStart)).toEqual(['2026-08-10'])
    const weekly = aggregateCohortWeeklyRake(attributed, 0)
    expect(weekly.map((w) => w.weeklyRake)).toEqual([8])
    const attributedToOther = attributedPlayerPeriods(members, periods, '2')
    expect(attributedToOther.map((p) => p.periodStart)).toEqual(['2026-08-17'])
  })

  it('weekly actives follow the campaign activation rule, not a hardcoded rake > 0', () => {
    const attributed = [
      {
        playerId: 'big',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        weeklyRake: 10,
      },
      {
        playerId: 'tiny',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        weeklyRake: 0.3,
      },
      {
        playerId: 'zero',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        weeklyRake: 0,
      },
      {
        playerId: 'big',
        periodStart: '2026-07-13',
        periodEnd: '2026-07-19',
        weeklyRake: 5,
      },
    ]
    // rake_gt_zero (threshold 0): quem raqueou na semana
    expect(
      aggregateCohortWeeklyRake(attributed, 0).map((w) => w.uniquePlayers),
    ).toEqual([2, 1])
    // rake_gt_050 (threshold 0.5): só quem passou de R$ 0,50 na semana
    expect(
      aggregateCohortWeeklyRake(attributed, 0.5).map((w) => w.uniquePlayers),
    ).toEqual([1, 1])
    // manual_count (null): todo jogador presente na semana conta
    expect(
      aggregateCohortWeeklyRake(attributed, null).map((w) => w.uniquePlayers),
    ).toEqual([3, 1])
    expect(
      aggregateCohortWeeklyRake(attributed, 0).map((w) => w.weeklyRake),
    ).toEqual([10.3, 5])
  })

  it('attributes transactions to the agency where the movement happened', () => {
    const members = [
      {
        playerId: 'dan',
        acquiredAt: '2026-07-06',
      },
    ]
    const transactions = [
      {
        // Antes da aquisição: fora
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
        // Depois de migrar para outra agência: pertence à campanha da 999
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
    const attributed = attributedCohortTransactions(
      members,
      transactions,
      '1730032',
    )
    expect(attributed.map((t) => t.amount)).toEqual([200])
  })

  it('scenario A-F: migration between agencies partitions results without loss or duplication', () => {
    const campaignA = {
      id: 'camp-a',
      agentId: 'AG-A',
      startDate: '2026-07-06',
      endDate: null as string | null,
    }
    const campaignB = {
      id: 'camp-b',
      agentId: 'AG-B',
      startDate: '2026-07-06',
      endDate: null as string | null,
    }
    const periods = [
      // Cenário A: jogador 123 na Agência A gera R$ 100 de rake
      {
        playerId: '123',
        agentId: 'AG-A',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        weeklyRake: 100,
        playerName: 'Player',
        nickname: 'p123',
      },
      // Cenário B: migra e gera R$ 200 na Agência B
      {
        playerId: '123',
        agentId: 'AG-B',
        periodStart: '2026-07-13',
        periodEnd: '2026-07-19',
        weeklyRake: 200,
        playerName: 'Player',
        nickname: 'p123',
      },
    ]
    const transactions = [
      // Cenário A: R$ 500 depositados enquanto estava na Agência A
      {
        receiverPlayerId: '123',
        agentId: 'AG-A',
        occurredAt: '2026-07-07T10:00:00.000Z',
        periodStart: '2026-07-06',
        periodEnd: '2026-07-12',
        amount: 500,
      },
      // Cenário B: R$ 1.000 depositados após migrar para a Agência B
      {
        receiverPlayerId: '123',
        agentId: 'AG-B',
        occurredAt: '2026-07-14T10:00:00.000Z',
        periodStart: '2026-07-13',
        periodEnd: '2026-07-19',
        amount: 1000,
      },
    ]

    const membersA = discoverCampaignCohort(campaignA, periods)
    const membersB = discoverCampaignCohort(campaignB, periods)

    // Cenário D: campanha da Agência A só recebe o que aconteceu na A
    const rakeA = sumCohortRake(membersA, periods, campaignA.agentId)
    const depositsA = attributedCohortTransactions(
      membersA,
      transactions,
      campaignA.agentId,
    )
    expect(rakeA).toBe(100)
    expect(depositsA.map((t) => t.amount)).toEqual([500])

    // Cenário E: campanha da Agência B só recebe o que aconteceu na B
    const rakeB = sumCohortRake(membersB, periods, campaignB.agentId)
    const depositsB = attributedCohortTransactions(
      membersB,
      transactions,
      campaignB.agentId,
    )
    expect(rakeB).toBe(200)
    expect(depositsB.map((t) => t.amount)).toEqual([1000])

    // Cenário C: o histórico individual completo continua reconstituível
    const fullHistory = periods.filter((p) => p.playerId === '123')
    expect(fullHistory.map((p) => p.weeklyRake)).toEqual([100, 200])

    // Cenário F: soma entre agências = total; nada some nem duplica
    expect(rakeA + rakeB).toBe(300)
    const attributedIds = [...depositsA, ...depositsB].map((t) => t.amount)
    expect(attributedIds.sort()).toEqual([1000, 500].sort())
    expect(attributedIds).toHaveLength(transactions.length)
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

describe('activation bonuses from transaction reports', () => {
  const members = [{ playerId: 'p1' }, { playerId: 'p2' }]
  const campaignAgentId = '1730032'

  function bonus(partial: {
    receiverPlayerId: string
    amount: number
    agentId?: string | null
    occurredAt?: string
    isBonus?: boolean
    id?: string
  }) {
    return {
      id: partial.id ?? `tx-${partial.amount}`,
      receiverPlayerId: partial.receiverPlayerId,
      agentId: partial.agentId ?? campaignAgentId,
      occurredAt: partial.occurredAt ?? '2026-07-03T12:00:00Z',
      periodStart: '2026-06-29',
      periodEnd: '2026-07-05',
      isBonus: partial.isBonus ?? true,
      amount: partial.amount,
    }
  }

  it('counts a single bonus for one player', () => {
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [bonus({ receiverPlayerId: 'p1', amount: 100 })],
      competing: [],
    })
    expect(sumActivationBonuses(rows)).toBe(100)
  })

  it('sums multiple bonuses for the same player', () => {
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [
        bonus({ receiverPlayerId: 'p1', amount: 100, id: 'a' }),
        bonus({ receiverPlayerId: 'p1', amount: 150, id: 'b' }),
        bonus({ receiverPlayerId: 'p1', amount: 80, id: 'c' }),
      ],
      competing: [],
    })
    expect(sumActivationBonuses(rows)).toBe(330)
  })

  it('sums bonuses across several players of the same campaign', () => {
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [
        bonus({ receiverPlayerId: 'p1', amount: 100 }),
        bonus({ receiverPlayerId: 'p2', amount: 50 }),
      ],
      competing: [],
    })
    expect(sumActivationBonuses(rows)).toBe(150)
  })

  it('accumulates bonuses from different imported reports', () => {
    const reportA = [bonus({ receiverPlayerId: 'p1', amount: 300, id: 'ra' })]
    const reportB = [bonus({ receiverPlayerId: 'p1', amount: 250, id: 'rb' })]
    const reportC = [bonus({ receiverPlayerId: 'p2', amount: 100, id: 'rc' })]
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [...reportA, ...reportB, ...reportC],
      competing: [],
    })
    expect(sumActivationBonuses(rows)).toBe(650)
  })

  it('counts a bonus sent during the campaign window', () => {
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [
        bonus({
          receiverPlayerId: 'p1',
          amount: 40,
          occurredAt: '2026-07-03T10:00:00Z',
        }),
      ],
      competing: [],
    })
    expect(sumActivationBonuses(rows)).toBe(40)
  })

  it('still counts a bonus sent after the campaign end date', () => {
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [
        bonus({
          receiverPlayerId: 'p1',
          amount: 50,
          occurredAt: '2026-08-15T10:00:00Z',
        }),
      ],
      competing: [],
    })
    expect(sumActivationBonuses(rows)).toBe(50)
  })

  it('keeps a later bonus on the acquisition campaign after the player migrates', () => {
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [
        bonus({
          receiverPlayerId: 'p1',
          amount: 70,
          agentId: '9999999',
          occurredAt: '2026-08-20T10:00:00Z',
        }),
      ],
      competing: [],
    })
    expect(sumActivationBonuses(rows)).toBe(70)
  })

  it('does not assign the same bonus to two campaigns after migration', () => {
    const tx = bonus({
      receiverPlayerId: 'p1',
      amount: 90,
      agentId: 'AG-B',
      id: 'shared',
    })
    const forA = attributedActivationBonuses({
      members,
      campaignAgentId: 'AG-A',
      transactions: [tx],
      competing: [{ agentId: 'AG-B', playerIds: ['p1'] }],
    })
    const forB = attributedActivationBonuses({
      members: [{ playerId: 'p1' }],
      campaignAgentId: 'AG-B',
      transactions: [tx],
      competing: [{ agentId: 'AG-A', playerIds: ['p1'] }],
    })
    expect(sumActivationBonuses(forA)).toBe(0)
    expect(sumActivationBonuses(forB)).toBe(90)
  })

  it('ignores a reimported identical transaction row (same id)', () => {
    const once = [
      bonus({ receiverPlayerId: 'p1', amount: 100, id: 'ext-1' }),
    ]
    const reimported = [
      bonus({ receiverPlayerId: 'p1', amount: 100, id: 'ext-1' }),
    ]
    const unique = new Map(
      [...once, ...reimported].map((row) => [row.id, row]),
    )
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [...unique.values()],
      competing: [],
    })
    expect(sumActivationBonuses(rows)).toBe(100)
  })

  it('does not treat Receiver Player ID as a dedupe key', () => {
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [
        bonus({ receiverPlayerId: 'p1', amount: 100, id: '1' }),
        bonus({ receiverPlayerId: 'p1', amount: 25, id: '2' }),
      ],
      competing: [],
    })
    expect(rows).toHaveLength(2)
    expect(sumActivationBonuses(rows)).toBe(125)
  })

  it('builds ATIVAÇÃO and INVESTIMENTO TOTAL from campaign + bonuses', () => {
    const bonuses = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [
        bonus({ receiverPlayerId: 'p1', amount: 100 }),
        bonus({ receiverPlayerId: 'p2', amount: 505 }),
      ],
      competing: [],
    })
    const activation = sumActivationBonuses(bonuses)
    expect(activation).toBe(605)
    expect(2779.96 + activation).toBeCloseTo(3384.96)
  })

  it('ignores deposits and players outside the cohort', () => {
    const rows = attributedActivationBonuses({
      members,
      campaignAgentId,
      transactions: [
        bonus({ receiverPlayerId: 'p1', amount: 40 }),
        {
          ...bonus({ receiverPlayerId: 'p1', amount: 999, id: 'dep' }),
          isBonus: false,
        },
        bonus({ receiverPlayerId: 'outsider', amount: 80, id: 'out' }),
      ],
      competing: [],
    })
    expect(sumActivationBonuses(rows)).toBe(40)
  })
})
