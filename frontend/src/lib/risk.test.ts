import { describe, expect, it } from 'vitest'
import type { RouteStats } from '../types/api'
import { RISK_COLORS, riskSummary, safetyScore } from './risk'

const stats = (miles: RouteStats['miles_by_level'], unknown = 0): RouteStats => ({
  miles_by_level: miles,
  unknown_mi: unknown,
  no_travel_mi: miles[4],
  severe_mi: miles[3],
  high_mi: miles[2],
  avg_risk: 0,
  max_level: null,
})

describe('riskSummary', () => {
  it('lists elevated miles worst-first, coloured by the worst level', () => {
    const s = riskSummary(stats([300, 50, 20, 0, 0]))
    expect(s.text).toBe('20 mi High · 50 mi Moderate')
    expect(s.color).toBe(RISK_COLORS[2])
  })

  it('reports an all-clear route', () => {
    expect(riskSummary(stats([300, 0, 0, 0, 0])).text).toBe('Low weather risk the whole way')
  })

  it('mentions miles without a forecast', () => {
    expect(riskSummary(stats([100, 0, 0, 0, 0], 30)).text).toBe('30 mi no forecast')
  })
})

describe('safetyScore', () => {
  it('maps average risk 0..4 onto 100..0', () => {
    expect(safetyScore(0)).toBe(100)
    expect(safetyScore(1)).toBe(75)
    expect(safetyScore(4)).toBe(0)
  })
})
