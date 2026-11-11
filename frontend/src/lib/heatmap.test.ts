import { describe, expect, it } from 'vitest'
import type { Heatmap } from '../types/api'
import { heatmapGeoJSON, kernelFor, weightExpression } from './heatmap'

const hm: Heatmap = {
  start: 0,
  step_s: 3600,
  hours: 1,
  cell_deg: 0.25,
  cells: [[-100, 40]],
  risk: [[0, 3]],
  wind: [[10, null]],
  rain: [[0, 40]],
  snow: [[0, 0]],
}

describe('heatmapGeoJSON', () => {
  it('flattens hourly series into per-hour properties and skips nulls', () => {
    const fc = heatmapGeoJSON(hm)
    expect(fc.features).toHaveLength(1)
    const props = fc.features[0]!.properties!
    expect(props).toMatchObject({ r0: 0, r1: 3, w0: 10, p1: 40 })
    expect(props).not.toHaveProperty('w1')
  })
})

describe('weightExpression', () => {
  it('reads the property for the requested hour', () => {
    expect(JSON.stringify(weightExpression('risk', 17))).toContain('"r17"')
    expect(JSON.stringify(weightExpression('snow', 3))).toContain('"s3"')
  })
})

describe('kernelFor', () => {
  it('normalises lattice density to ~1 regardless of cell size', () => {
    for (const deg of [0.1, 0.5]) {
      const { intensity, radius } = kernelFor(deg, 40)
      const r0 = radius[4] as number
      const sx = (deg * 512) / 360
      const sy = sx / Math.cos((40 * Math.PI) / 180)
      const density = intensity * 0.3989 * ((2 * Math.PI * (r0 / 3) ** 2) / (sx * sy))
      expect(density).toBeCloseTo(1)
    }
  })
})
