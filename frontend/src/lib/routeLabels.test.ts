import { describe, expect, it } from 'vitest'
import type { Checkpoint } from '../types/api'
import type { LngLat } from './geo'
import { bandName, bandOf, routeLabels } from './routeLabels'
import type { RouteModel } from './routeModel'

function cp(i: number, rain: number, level: Checkpoint['level'] = 0): Checkpoint {
  return {
    mile: i * 10,
    lat: 0,
    lon: i,
    eta: i,
    span_mi: 10,
    seg: [i, i + 1],
    level,
    factors: null,
    drivers: [],
    weather: { wind_mph: 5, gust_mph: 8, rain_in_hr: rain, snow_in_hr: 0, temp_f: 50, code: 61 },
  }
}

function model(cps: Checkpoint[]): RouteModel {
  const coords: LngLat[] = Array.from({ length: cps.length + 1 }, (_, i) => [i, 0])
  return { route: { checkpoints: cps }, coords } as unknown as RouteModel
}

describe('bands', () => {
  it('follows the brief’s rain thresholds (band edges are inclusive at the bottom)', () => {
    expect(bandName('rain', bandOf(cp(0, 0), 'rain'))).toBe('Dry')
    expect(bandName('rain', bandOf(cp(0, 0.1), 'rain'))).toBe('Moderate rain')
    expect(bandName('rain', bandOf(cp(0, 1.0), 'rain'))).toBe('Very heavy rain')
    expect(bandName('rain', bandOf(cp(0, 1.2), 'rain'))).toBe('Extreme rain')
  })
})

describe('routeLabels', () => {
  it('merges consecutive checkpoints in the same band and labels the peak value', () => {
    const fc = routeLabels(model([cp(0, 0), cp(1, 0), cp(2, 0.3), cp(3, 0.42), cp(4, 0)]), 'rain')
    expect(fc.features.map((f) => f.properties.text)).toEqual(['Dry', 'Heavy rain · 0.42 in/hr', 'Dry'])
    expect(fc.features[1]!.geometry.coordinates).toEqual([
      [2, 0],
      [3, 0],
      [4, 0],
    ])
  })

  it('uses plain risk names on the risk layer', () => {
    const fc = routeLabels(model([cp(0, 0, 0), cp(1, 0, 2)]), 'risk')
    expect(fc.features.map((f) => f.properties.text)).toEqual(['Low risk', 'High risk'])
  })
})
