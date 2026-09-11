import { describe, expect, it } from 'vitest'
import { buildCampaignPlayerAlerts } from './campaignPlayerAlerts'

describe('buildCampaignPlayerAlerts', () => {
  it('keys alerts by playerId and flags relevant inactive players', () => {
    const members = [
      { playerId: '111', acquiredAt: '2026-06-01' },
      { playerId: '222', acquiredAt: '2026-06-01' },
    ]
    const periods = [
      {
        playerId: '111',
        nickname: 'Big',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-07',
        weeklyRake: 800,
      },
      {
        playerId: '111',
        nickname: 'Big',
        periodStart: '2026-06-08',
        periodEnd: '2026-06-14',
        weeklyRake: 700,
      },
      {
        playerId: '222',
        nickname: 'Tiny',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-07',
        weeklyRake: 5,
      },
      {
        playerId: '222',
        nickname: 'Tiny',
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
        weeklyRake: 2,
      },
    ]
    const alerts = buildCampaignPlayerAlerts({
      periods,
      members,
      referencePeriodEnd: '2026-08-16',
    })
    const inactive = alerts.filter((a) => a.kind === 'relevant_inactive')
    expect(inactive.some((a) => a.playerId === '111')).toBe(true)
    expect(inactive.every((a) => a.playerId !== '222')).toBe(true)
    expect(inactive[0].details.some((d) => d.label === 'ID' && d.value === '111')).toBe(
      true,
    )
  })

  it('detects return after inactivity using playerId history', () => {
    const members = [{ playerId: 'p1', acquiredAt: '2026-06-01' }]
    const periods = [
      {
        playerId: 'p1',
        nickname: 'SameNick',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-07',
        weeklyRake: 400,
      },
      {
        playerId: 'p1',
        nickname: 'SameNick',
        periodStart: '2026-08-10',
        periodEnd: '2026-08-16',
        weeklyRake: 50,
      },
    ]
    const alerts = buildCampaignPlayerAlerts({
      periods,
      members,
      referencePeriodEnd: '2026-08-16',
    })
    expect(alerts.some((a) => a.kind === 'player_return' && a.playerId === 'p1')).toBe(
      true,
    )
  })

  it('flags new standout by acquisition tenure and share', () => {
    const members = [
      { playerId: 'new', acquiredAt: '2026-08-03' },
      { playerId: 'old', acquiredAt: '2026-06-01' },
    ]
    const periods = [
      {
        playerId: 'new',
        nickname: 'Rising',
        periodStart: '2026-08-03',
        periodEnd: '2026-08-09',
        weeklyRake: 300,
      },
      {
        playerId: 'old',
        nickname: 'Veteran',
        periodStart: '2026-08-03',
        periodEnd: '2026-08-09',
        weeklyRake: 100,
      },
    ]
    const alerts = buildCampaignPlayerAlerts({
      periods,
      members,
      referencePeriodEnd: '2026-08-09',
    })
    expect(
      alerts.some((a) => a.kind === 'new_standout' && a.playerId === 'new'),
    ).toBe(true)
  })
})
