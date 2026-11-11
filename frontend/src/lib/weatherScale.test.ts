import { describe, expect, it } from 'vitest'
import type { Checkpoint, PlannedRoute } from '../types/api'
import { RISK_COLORS, UNKNOWN_COLOR } from './risk'
import type { RouteModel } from './routeModel'
import { checkpointColor, colorExpression, conditionIcon, lineGradient, metricIntensity, riskScore, SEVERITY_STOPS, severityColor, timeGradient } from './weatherScale'

function cp(over: Partial<Checkpoint['weather'] & object> | null, level: Checkpoint['level'] = 0, span = 10): Checkpoint {
  return {
    mile: 0,
    lat: 0,
    lon: 0,
    eta: 0,
    span_mi: span,
    seg: [0, 1],
    level,
    factors: null,
    drivers: [],
    weather: over === null ? null : { wind_mph: 5, gust_mph: 8, rain_in_hr: 0, snow_in_hr: 0, temp_f: 40, code: 0, ...over },
  }
}

describe('one severity scale for every layer', () => {
  it('is green when calm/dry and red at the top, whatever the layer', () => {
    const green = SEVERITY_STOPS[0]![1]
    expect(checkpointColor(cp({ wind_mph: 0 }), 'wind')).toBe(green)
    expect(checkpointColor(cp({}), 'rain')).toBe(green)
    expect(checkpointColor(cp({}), 'snow')).toBe(green)
    expect(severityColor(4)).toBe(RISK_COLORS[4])
  })

  it('places weather readings on their own risk bands', () => {
    expect(checkpointColor(cp({ rain_in_hr: 0.25 }), 'rain')).toBe(RISK_COLORS[2]) // High starts at 0.25
    expect(metricIntensity(cp({ rain_in_hr: 1 }), 'rain')).toBeLessThan(4) // exactly 1.00 is Severe
    expect(metricIntensity(cp({ rain_in_hr: 1.2 }), 'rain')).toBe(4)
    expect(checkpointColor(cp({ wind_mph: 55 }), 'wind')).toBe(RISK_COLORS[4])
    expect(metricIntensity(cp({ snow_in_hr: 1.5 }), 'snow')).toBeCloseTo(2.5)
  })
})

describe('checkpointColor', () => {
  it('uses risk colours for the risk layer and grey when there is no forecast', () => {
    expect(checkpointColor(cp({}, 2), 'risk')).toBe(RISK_COLORS[2])
    expect(checkpointColor(cp(null, null), 'rain')).toBe(UNKNOWN_COLOR)
  })
})

describe('riskScore', () => {
  it('rises with intensity inside the band but never leaves the classified level', () => {
    const calm = riskScore(cp({ wind_mph: 3 }, 0))!
    const breezy = riskScore(cp({ wind_mph: 20 }, 0))!
    expect(calm).toBeGreaterThanOrEqual(0)
    expect(breezy).toBeGreaterThan(calm)
    expect(breezy).toBeLessThan(1)
    expect(riskScore(cp({ wind_mph: 30 }, 1))).toBeCloseTo(1.5)
  })

  it('respects load-rule escalation (40 mph + heavy load is Severe, not High)', () => {
    const s = riskScore(cp({ wind_mph: 40 }, 3))!
    expect(s).toBeGreaterThanOrEqual(3)
    expect(s).toBeLessThan(4)
  })

  it('is null without a classification', () => {
    expect(riskScore(cp(null, null))).toBeNull()
  })
})

describe('gradients', () => {
  it('timeGradient places conditions at pass-by times and goes neutral after arrival', () => {
    const timed = {
      arrival: 6 * 3600,
      checkpoints: [0, 1, 2].map((i) => ({ ...cp({ rain_in_hr: i * 0.2 }), eta: i * 3 * 3600 })),
    } as unknown as PlannedRoute
    const g = timeGradient(timed, 0, 48, 'rain')
    expect(g).toContain('6.25%') // checkpoint at 3 h of 48 h
    expect(g).toContain('12.50%') // arrival at 6 h
    expect(g.trim().endsWith('100%)')).toBe(true)
  })

  it('lineGradient stops are strictly ascending from 0 to 1', () => {
    const cps = [0, 1, 2].map((i) => ({ ...cp({ rain_in_hr: i * 0.2 }), seg: [i, i + 1] as [number, number] }))
    const model = { route: { checkpoints: cps }, progress: Float64Array.from([0, 0.3, 0.7, 1]) } as unknown as RouteModel
    const expr = lineGradient(model, 'rain') as unknown[]
    const positions = expr.slice(3).filter((_, i) => i % 2 === 0) as number[]
    expect(positions[0]).toBe(0)
    expect(positions.at(-1)).toBe(1)
    expect(positions.every((p, i) => i === 0 || p > positions[i - 1]!)).toBe(true)
  })
})

describe('conditionIcon', () => {
  it('prefers storm > snow > rain > wind and is empty when calm', () => {
    expect(conditionIcon(cp({ code: 95, rain_in_hr: 0.5 }))).toBe('storm')
    expect(conditionIcon(cp({ snow_in_hr: 0.2, rain_in_hr: 0.3 }))).toBe('snow')
    expect(conditionIcon(cp({ rain_in_hr: 0.05, wind_mph: 40 }))).toBe('rain')
    expect(conditionIcon(cp({ wind_mph: 30 }))).toBe('wind')
    expect(conditionIcon(cp({}))).toBe('')
  })
})

describe('colorExpression', () => {
  it('reads the precomputed per-layer colour from the feature', () => {
    expect(colorExpression('snow')).toEqual(['get', 'col_snow'])
  })
})
